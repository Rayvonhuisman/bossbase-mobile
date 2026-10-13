import { supabase } from '@/lib/supabase';
import { metTijdslimiet } from '@/lib/queryTijdslimiet';

/**
 * Materialenbibliotheek — tabel `materialen`, met de inkoopprijs apart in
 * `materiaal_inkoop` (eigen RLS: alleen admin of recht `inkoopprijzen`).
 * Letterlijk naar `services/materiaalService.js` van het dashboard.
 *
 * De inkooprij maakt een trigger aan bij elke insert, dus de prijs bijwerken is
 * altijd een update. Zonder recht weigert RLS die stil — vandaar dat we alleen
 * schrijven als het formulier het inkoopveld toont.
 */

export type Materiaal = {
  id: string;
  naam: string;
  eenheid: string;
  /** null = niet ingevuld óf geen recht om te zien. */
  inkoopprijs: number | null;
  verkoopprijs: number | null;
  leverancierId: string | null;
  btwPct: number;
  artikelnummer: string;
  actief: boolean;
};

export type MateriaalForm = {
  naam: string;
  eenheid: string;
  verkoopprijs: number | null;
  leverancierId: string | null;
  btwPct: number;
  artikelnummer: string;
  actief: boolean;
  /** Alleen aanwezig als de gebruiker het recht `inkoopprijzen` heeft. */
  inkoopprijs?: number | null;
};

const SELECT = 'id, naam, eenheid, verkoopprijs, leverancier_id, btw_pct, artikelnummer, actief, materiaal_inkoop ( inkoopprijs )';

type Rij = {
  id: string;
  naam: string | null;
  eenheid: string | null;
  verkoopprijs: number | null;
  leverancier_id: string | null;
  btw_pct: number | null;
  artikelnummer: string | null;
  actief: boolean | null;
  materiaal_inkoop?: { inkoopprijs: number | null } | { inkoopprijs: number | null }[] | null;
};

function naarMateriaal(r: Rij): Materiaal {
  const k = Array.isArray(r.materiaal_inkoop) ? r.materiaal_inkoop[0] : r.materiaal_inkoop;
  return {
    id: r.id,
    naam: r.naam ?? '',
    eenheid: r.eenheid || 'stuk',
    inkoopprijs: k?.inkoopprijs != null ? Number(k.inkoopprijs) : null,
    verkoopprijs: r.verkoopprijs != null ? Number(r.verkoopprijs) : null,
    leverancierId: r.leverancier_id ?? null,
    btwPct: r.btw_pct != null ? Number(r.btw_pct) : 21,
    artikelnummer: r.artikelnummer ?? '',
    actief: r.actief !== false,
  };
}

function fout(where: string, error: { code?: string; message?: string }): string {
  if (__DEV__) console.log(`[materiaalService.${where}]`, error.code, error.message);
  if (error.code === 'timeout') return error.message ?? 'Geen antwoord van de server.';
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '')) {
    return 'Je hebt geen rechten voor deze actie.';
  }
  if (/readonly|alleen-lezen/i.test(error.message ?? '')) return error.message ?? 'Je account staat op alleen-lezen.';
  return where === 'list' ? 'Materialen laden is mislukt.' : 'Opslaan is mislukt. Probeer het opnieuw.';
}

export async function listMaterialen(
  opts: { inclusiefInactief?: boolean } = {},
): Promise<{ data: Materiaal[]; error: string | null }> {
  const inclusief = opts.inclusiefInactief ?? true;
  const { data, error } = await metTijdslimiet((signal) => {
    let q = supabase.from('materialen').select(SELECT).order('naam', { ascending: true });
    if (!inclusief) q = q.eq('actief', true);
    return q.abortSignal(signal);
  });
  if (error) return { data: [], error: fout('list', error) };
  return { data: ((data as unknown as Rij[]) ?? []).map(naarMateriaal), error: null };
}

async function getMateriaal(id: string): Promise<Materiaal | null> {
  const { data } = await supabase.from('materialen').select(SELECT).eq('id', id).maybeSingle();
  return data ? naarMateriaal(data as unknown as Rij) : null;
}

function naarPayload(f: MateriaalForm) {
  return {
    naam: f.naam.trim(),
    eenheid: f.eenheid || 'stuk',
    verkoopprijs: f.verkoopprijs,
    leverancier_id: f.leverancierId || null,
    btw_pct: Number.isFinite(f.btwPct) ? f.btwPct : 21,
    artikelnummer: f.artikelnummer.trim() || null,
    actief: f.actief !== false,
  };
}

async function bewaarInkoop(id: string, f: MateriaalForm): Promise<string | null> {
  if (!('inkoopprijs' in f)) return null;
  const { error } = await supabase
    .from('materiaal_inkoop')
    .update({ inkoopprijs: f.inkoopprijs ?? null, updated_at: new Date().toISOString() })
    .eq('materiaal_id', id);
  return error ? fout('inkoop', error) : null;
}

export async function createMateriaal(
  companyId: string,
  f: MateriaalForm,
): Promise<{ data: Materiaal | null; error: string | null }> {
  const payload = naarPayload(f);
  if (!payload.naam) return { data: null, error: 'Naam is verplicht' };
  const { data, error } = await supabase
    .from('materialen')
    .insert({ ...payload, company_id: companyId })
    .select('id');
  if (error) return { data: null, error: fout('create', error) };
  const id = (data as { id: string }[] | null)?.[0]?.id;
  if (!id) return { data: null, error: 'Het materiaal is niet opgeslagen — je hebt hier geen rechten voor.' };
  const inkoopFout = await bewaarInkoop(id, f);
  return { data: await getMateriaal(id), error: inkoopFout };
}

export async function updateMateriaal(
  id: string,
  f: MateriaalForm,
): Promise<{ data: Materiaal | null; error: string | null }> {
  const payload = naarPayload(f);
  if (!payload.naam) return { data: null, error: 'Naam is verplicht' };
  const { data, error } = await supabase.from('materialen').update(payload).eq('id', id).select('id');
  if (error) return { data: null, error: fout('update', error) };
  if (!((data as { id: string }[] | null) ?? []).length) {
    return { data: null, error: 'Het materiaal is niet bijgewerkt — je hebt hier geen rechten voor.' };
  }
  const inkoopFout = await bewaarInkoop(id, f);
  return { data: await getMateriaal(id), error: inkoopFout };
}

/** materiaal_inkoop hangt met ON DELETE CASCADE aan het materiaal. */
export async function deleteMateriaal(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('materialen').delete().eq('id', id).select('id');
  if (error) return { error: fout('delete', error) };
  if (!((data as { id: string }[] | null) ?? []).length) {
    return { error: 'Het materiaal is niet verwijderd — je hebt hier geen rechten voor.' };
  }
  return { error: null };
}

/** Actieve leveranciers voor de verplichte keuze. */
export async function listLeveranciers(): Promise<{
  data: { id: string; naam: string; actief: boolean }[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('leveranciers')
    .select('id, naam, actief')
    .order('naam', { ascending: true });
  if (error) return { data: [], error: 'Leveranciers konden niet worden geladen.' };
  return {
    data: ((data as { id: string; naam: string | null; actief: boolean | null }[]) ?? []).map((l) => ({
      id: l.id,
      naam: l.naam ?? '',
      actief: l.actief !== false,
    })),
    error: null,
  };
}
