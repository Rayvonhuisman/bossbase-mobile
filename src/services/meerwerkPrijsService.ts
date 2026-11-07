import { supabase } from '@/lib/supabase';
import { leesMeerwerkInvoer, naarMeerwerkPrijs, type MeerwerkPrijs } from '@/lib/meerwerkPrijs';

/**
 * Bedrag en uren bij meerwerk — getMeerwerkPrijzen / zetMeerwerkPrijs uit
 * werkbonOfferteService.js van het dashboard. Tabel `werkbon_meerwerk_prijs`:
 * lezen en schrijven alleen met projectbedragen (bb_mag_projectbedragen).
 * Zonder dat recht geeft de database gewoon geen rijen; schrijven weigert RLS.
 * Niet onder het slot van de werkbon: kantoor prijst het meerwerk ook nadat
 * de klant getekend heeft.
 */

const VELDEN = 'werkbon_taak_id, bedrag_excl, uren';

/** Tabel nog niet in de database (migratie nog niet gedraaid): geen fout, gewoon leeg. */
const tabelOntbreekt = (e: { code?: string; message?: string }) =>
  /relation .* does not exist|PGRST205|schema cache/i.test(`${e.code || ''} ${e.message || ''}`);

export async function getMeerwerkPrijzen(
  taakIds: string[],
): Promise<{ data: Map<string, MeerwerkPrijs>; error: string | null }> {
  const ids = (taakIds || []).filter(Boolean);
  if (!ids.length) return { data: new Map(), error: null };
  const { data, error } = await supabase.from('werkbon_meerwerk_prijs').select(VELDEN).in('werkbon_taak_id', ids);
  if (error) {
    if (tabelOntbreekt(error)) return { data: new Map(), error: null };
    return { data: new Map(), error: error.message };
  }
  const rijen = ((data as Record<string, unknown>[]) ?? []).map(naarMeerwerkPrijs);
  return { data: new Map(rijen.map((p) => [p.taakId, p])), error: null };
}

/** Beide leeg = de rij weg (data null). */
export async function zetMeerwerkPrijs(
  taakId: string,
  companyId: string,
  invoer: { bedragExcl: string; uren: string },
): Promise<{ data: MeerwerkPrijs | null; error: string | null }> {
  const w = leesMeerwerkInvoer(invoer.bedragExcl, invoer.uren);
  if ('fout' in w) return { data: null, error: w.fout };
  if ('leeg' in w) {
    const { error } = await supabase.from('werkbon_meerwerk_prijs').delete().eq('werkbon_taak_id', taakId);
    return { data: null, error: error ? error.message : null };
  }
  const { data, error } = await supabase
    .from('werkbon_meerwerk_prijs')
    .upsert(
      { werkbon_taak_id: taakId, company_id: companyId, bedrag_excl: w.bedragExcl, uren: w.uren },
      { onConflict: 'werkbon_taak_id' },
    )
    .select(VELDEN)
    .single();
  if (error || !data) return { data: null, error: error?.message ?? 'Opslaan mislukt.' };
  return { data: naarMeerwerkPrijs(data as Record<string, unknown>), error: null };
}
