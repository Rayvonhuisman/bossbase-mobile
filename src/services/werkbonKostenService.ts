import { supabase } from '@/lib/supabase';
import { haalInStukken } from '@/lib/inStukken';
import { naarInkoop, naarKostBron, type Inkoop, type KostBron } from '@/lib/werkbonKosten';

/**
 * Kosten op een werkbon — getWerkbonKostenBron (kostenOverzichtService.js)
 * en projectKostenService.js van het dashboard.
 *
 * Een inkoop die je hier toevoegt krijgt `werkbon_id`; de database zet het
 * project van de werkbon erbij (migratie 20260919140000). Het materiaal staat
 * als spiegelregel in `job_costs` (met `werkbon_materiaal_id`); de inkoopprijs
 * komt mee via de materiaalregel en die tabel heeft eigen RLS.
 */

const MET_INKOOP = '*, werkbon_materialen!werkbon_materiaal_id(aantal, werkbon_materiaal_inkoop(inkoopprijs_per))';

export async function getWerkbonKostenBron(
  werkbonId: string,
): Promise<{ jobCosts: KostBron[]; inkopen: Inkoop[]; error: string | null }> {
  const haal = (select: string) =>
    haalInStukken((van, tot) =>
      supabase.from('job_costs').select(select).eq('werkbon_id', werkbonId).order('id', { ascending: true }).range(van, tot),
    );
  let jc = await haal(MET_INKOOP);
  if (jc.error) jc = await haal('*');
  const ink = await supabase
    .from('project_kosten')
    .select('*')
    .eq('werkbon_id', werkbonId)
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true });
  const fout = jc.error?.message || ink.error?.message || null;
  return {
    jobCosts: ((jc.data as unknown as Record<string, unknown>[]) ?? []).map(naarKostBron),
    inkopen: ((ink.data as Record<string, unknown>[]) ?? []).map(naarInkoop),
    error: fout,
  };
}

export type InkoopInvoer = {
  naam: string;
  aantal: number;
  eenheid: string;
  prijs_per: number;
  leverancier_id: string | null;
};

/** createProjectKost(projectId, { ...form, werkbon_id }). */
export async function createWerkbonInkoop(
  werkbon: { id: string; company_id: string },
  input: InkoopInvoer,
): Promise<{ data: Inkoop | null; error: string | null }> {
  const naam = (input.naam || '').trim();
  if (!naam) return { data: null, error: 'Omschrijving is verplicht' };
  const { data, error } = await supabase
    .from('project_kosten')
    .insert({
      project_id: null,
      werkbon_id: werkbon.id,
      naam,
      eenheid: input.eenheid || null,
      aantal: Number(input.aantal) || 1,
      prijs_per: Number(input.prijs_per) || 0,
      leverancier_id: input.leverancier_id || null,
      company_id: werkbon.company_id,
    })
    .select('*')
    .maybeSingle();
  if (error || !data) return { data: null, error: foutTekst(error?.message) };
  return { data: naarInkoop(data as Record<string, unknown>), error: null };
}

const VELDEN = ['naam', 'eenheid', 'aantal', 'prijs_per', 'leverancier_id'] as const;

/** updateProjectKost(id, patch). */
export async function updateInkoop(
  id: string,
  patch: Partial<Record<(typeof VELDEN)[number], string | number | null>>,
): Promise<{ data: Inkoop | null; error: string | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of VELDEN) {
    if (!(k in patch)) continue;
    if (k === 'aantal' || k === 'prijs_per') updates[k] = Number(patch[k]) || 0;
    else if (k === 'naam') updates[k] = patch[k];
    else updates[k] = patch[k] || null;
  }
  const { data, error } = await supabase.from('project_kosten').update(updates).eq('id', id).select('*').maybeSingle();
  if (error || !data) return { data: null, error: foutTekst(error?.message) };
  return { data: naarInkoop(data as Record<string, unknown>), error: null };
}

/** deleteProjectKost(id). */
export async function deleteInkoop(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('project_kosten').delete().eq('id', id).select('id');
  if (error) return { error: foutTekst(error.message) };
  if (!((data as { id: string }[]) ?? []).length) return { error: 'Niet verwijderd — je hebt hier geen rechten voor.' };
  return { error: null };
}

function foutTekst(m?: string | null): string {
  if (!m) return 'Niet opgeslagen — je hebt hier geen rechten voor.';
  if (/row-level security|permission denied/i.test(m)) return 'Je hebt geen rechten voor deze actie.';
  if (/schema cache|does not exist/i.test(m)) return 'Inkopen zijn nog niet beschikbaar: de database-update hiervoor is nog niet uitgevoerd.';
  return 'Opslaan mislukt. Probeer het opnieuw.';
}
