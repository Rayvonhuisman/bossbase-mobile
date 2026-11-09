import { supabase } from '@/lib/supabase';
import { metTijdslimiet } from '@/lib/queryTijdslimiet';
import { haalInStukken } from '@/lib/inStukken';

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

// ── Importeren (MaterialenImporteren) ───────────────────────────────────────

/**
 * Alle materialen, in stukken van 1000 (PostgREST kapt anders stil af): de
 * import herkent hiermee dubbele materialen. Een fout is een fout: dan mag er
 * niet geïmporteerd worden, anders komen er dubbele bij.
 */
export async function alleMaterialenVoorImport(): Promise<{ data: Materiaal[]; error: string | null }> {
  const { data, error } = await haalInStukken<Rij, { code?: string; message?: string }>((van, tot) =>
    supabase.from('materialen').select(SELECT).order('naam', { ascending: true }).order('id', { ascending: true }).range(van, tot) as unknown as PromiseLike<{
      data: Rij[] | null;
      error: { code?: string; message?: string } | null;
    }>,
  );
  if (error) return { data: [], error: 'De bestaande materialen konden niet worden geladen.' };
  return { data: data.map(naarMateriaal), error: null };
}

export type ImportOpslagRegel = {
  /** Bestaand materiaal: alleen de prijzen bijwerken. */
  id: string | null;
  naam: string;
  artikelnummer: string | null;
  eenheid: string | null;
  inkoopprijs: number | null;
  verkoopprijs: number | null;
  btwPct: number | null;
};

const IMPORT_PARTIJ = 200;

/**
 * Slaat de gecontroleerde regels op in partijen (RPC `bb_materialen_importeren`,
 * migratie 20261107160000; elke partij is één transactie). Mislukt een partij,
 * dan staat wat eerder lukte er al in: de melding zegt hoeveel.
 */
export async function importeerMaterialen(
  leverancierId: string,
  regels: ImportOpslagRegel[],
  onVoortgang?: (klaar: number, totaal: number) => void,
): Promise<{ nieuw: number; bijgewerkt: number; error: string | null }> {
  const totaal = { nieuw: 0, bijgewerkt: 0 };
  for (let i = 0; i < regels.length; i += IMPORT_PARTIJ) {
    const partij = regels.slice(i, i + IMPORT_PARTIJ).map((r) => ({
      id: r.id || null,
      naam: r.naam,
      artikelnummer: r.artikelnummer || null,
      eenheid: r.eenheid || null,
      inkoopprijs: r.inkoopprijs ?? null,
      verkoopprijs: r.verkoopprijs ?? null,
      btw_pct: r.btwPct ?? null,
    }));
    const { data, error } = await supabase.rpc('bb_materialen_importeren', { p_leverancier: leverancierId, p_regels: partij });
    if (error) {
      const klaar = totaal.nieuw + totaal.bijgewerkt;
      return {
        ...totaal,
        error: `${error.message || 'Opslaan mislukt'}${klaar ? ` (${klaar} regels waren al opgeslagen)` : ''}`,
      };
    }
    const d = data as { nieuw?: number; bijgewerkt?: number } | null;
    totaal.nieuw += Number(d?.nieuw || 0);
    totaal.bijgewerkt += Number(d?.bijgewerkt || 0);
    onVoortgang?.(Math.min(i + IMPORT_PARTIJ, regels.length), regels.length);
  }
  return { ...totaal, error: null };
}

/**
 * Een PDF of foto van een prijslijst laten uitlezen (edge function
 * `materialen-uitlezen`, alleen met de feature `prijslijst_uitlezen`), als
 * base64. Slaat niets op.
 */
export async function leesPrijslijstUit(
  base64: string,
  naam: string,
): Promise<{
  regels: {
    naam: string;
    artikelnummer?: string | null;
    eenheid?: string | null;
    inkoopprijs?: number | null;
    verkoopprijs?: number | null;
    btwPct?: number | null;
    twijfel?: boolean;
    twijfelReden?: string;
  }[];
  leverancier: string;
  melding: string;
  error: string | null;
}> {
  const { data, error } = await supabase.functions.invoke('materialen-uitlezen', { body: { bestand: base64, naam } });
  if (error) {
    let tekst = 'Het uitlezen lukte niet. Probeer het zo nog eens.';
    try {
      const j = await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.();
      if (j?.error) tekst = j.error;
    } catch {
      /* geen JSON */
    }
    return { regels: [], leverancier: '', melding: '', error: tekst };
  }
  const d = data as { success?: boolean; error?: string; regels?: unknown[]; leverancier?: string; melding?: string } | null;
  if (!d?.success) return { regels: [], leverancier: '', melding: '', error: d?.error || 'Het uitlezen lukte niet.' };
  return {
    regels: (d.regels as never[]) || [],
    leverancier: d.leverancier || '',
    melding: d.melding || '',
    error: null,
  };
}
