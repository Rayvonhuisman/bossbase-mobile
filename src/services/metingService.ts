import { supabase } from '@/lib/supabase';
import { getCompanyId, isReadonly } from '@/lib/sessionContext';
import { classificeerFout, writeFout, type WriteResult } from '@/lib/writeResult';
import { naarRij, type Eenheid, type Meting, type MetingForm, type Soort, type VoorstelMeting } from '@/lib/metingen';

/**
 * Metingen bij een project — tabel `metingen`, zoals `services/metingService.js`
 * van het dashboard (migratie 20261022120000).
 *
 * Rechten liggen in de database: zien wie het project ziet, wijzigen volgens
 * `bb_mag_metingen_beheren(project)`. `magMetingenBeheren()` vraagt diezelfde
 * functie, zodat de knoppen precies verschijnen waar de database ze toestaat.
 * Een alleen-lezen account weigert de database ook (policy readonly_metingen).
 *
 * "Vertel het Boss" loopt via de edge function `metingen-uitlezen` met
 * `{ project_id, tekst, bestaande }`: die slaat niets op en controleert zelf
 * recht, pakket (`metingen_uitlezen`, Groei en Team) en de AI-poort.
 */

const BUCKET = 'metingen';

type Rij = {
  id: string;
  project_id: string;
  werkbon_id: string | null;
  document_id: string | null;
  materiaal_id: string | null;
  naam: string | null;
  soort: string | null;
  breedte: number | string | null;
  hoogte: number | string | null;
  diepte: number | string | null;
  aantal: number | string | null;
  eenheid: string | null;
  waarde: number | string | null;
  waarde_eenheid: string | null;
  opmerking: string | null;
  extra: Record<string, string> | null;
  fotos: string[] | null;
  volgorde: number | null;
  created_at: string;
};

const SELECT =
  'id, project_id, werkbon_id, document_id, materiaal_id, naam, soort, breedte, hoogte, diepte, aantal, eenheid, waarde, waarde_eenheid, opmerking, extra, fotos, volgorde, created_at';

export function toMeting(row: Rij): Meting {
  return {
    id: row.id,
    projectId: row.project_id,
    werkbonId: row.werkbon_id || null,
    documentId: row.document_id || null,
    materiaalId: row.materiaal_id || null,
    naam: row.naam || '',
    soort: (row.soort || 'oppervlak') as Soort,
    breedte: row.breedte == null ? '' : Number(row.breedte),
    hoogte: row.hoogte == null ? '' : Number(row.hoogte),
    diepte: row.diepte == null ? '' : Number(row.diepte),
    aantal: row.aantal == null ? 1 : Number(row.aantal),
    eenheid: (row.eenheid || 'mm') as Eenheid,
    waarde: row.waarde == null ? null : Number(row.waarde),
    waardeEenheid: row.waarde_eenheid || '',
    opmerking: row.opmerking || '',
    extra: row.extra || {},
    fotos: row.fotos || [],
    volgorde: row.volgorde ?? 0,
    createdAt: row.created_at,
  };
}

export async function magMetingenBeheren(projectId: string): Promise<boolean> {
  if (!projectId || isReadonly()) return false;
  const { data, error } = await supabase.rpc('bb_mag_metingen_beheren', { p_project: projectId });
  if (error) return false;
  return data === true;
}

export async function listMetingen(projectId: string): Promise<Meting[]> {
  const { data, error } = await supabase
    .from('metingen')
    .select(SELECT)
    .eq('project_id', projectId)
    .order('volgorde', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data as Rij[] | null) ?? []).map(toMeting);
}

/** De branche van het bedrijf: welke extra velden een meting heeft. */
export async function getBranche(): Promise<string> {
  const companyId = getCompanyId();
  if (!companyId) return '';
  const { data } = await supabase.from('companies').select('branche').eq('id', companyId).maybeSingle();
  return (data as { branche?: string | null } | null)?.branche ?? '';
}

export async function createMeting(
  projectId: string,
  m: MetingForm,
  { volgorde = 0 }: { volgorde?: number } = {},
): Promise<WriteResult<Meting>> {
  const rij = naarRij(m);
  if (!rij.naam) return writeFout('validatie', 'Geef de meting een naam, bijvoorbeeld "Raam woonkamer links".');
  const companyId = getCompanyId();
  if (!companyId) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  if (isReadonly()) return writeFout('readonly');
  const { data, error } = await supabase
    .from('metingen')
    .insert({ ...rij, company_id: companyId, project_id: projectId, werkbon_id: null, document_id: null, volgorde })
    .select(SELECT);
  if (error) return classificeerFout(error, 'metingService.createMeting', isReadonly());
  const eerste = (data as Rij[] | null)?.[0];
  if (!eerste) return writeFout('geen-rechten', 'Je mag bij dit project geen metingen toevoegen.');
  return { ok: true, data: toMeting(eerste) };
}

export async function updateMeting(id: string, m: MetingForm): Promise<WriteResult<Meting>> {
  const rij = naarRij(m);
  if (!rij.naam) return writeFout('validatie', 'Een meting moet een naam houden.');
  if (isReadonly()) return writeFout('readonly');
  const { data, error } = await supabase.from('metingen').update(rij).eq('id', id).select(SELECT);
  if (error) return classificeerFout(error, 'metingService.updateMeting', isReadonly());
  const eerste = (data as Rij[] | null)?.[0];
  if (!eerste) return writeFout('geen-rechten', 'Je mag deze meting niet wijzigen.');
  return { ok: true, data: toMeting(eerste) };
}

export async function deleteMeting(meting: Meting): Promise<WriteResult<null>> {
  if (isReadonly()) return writeFout('readonly');
  const { data, error } = await supabase.from('metingen').delete().eq('id', meting.id).select('id');
  if (error) return classificeerFout(error, 'metingService.deleteMeting', isReadonly());
  if (!(data as unknown[] | null)?.length) return writeFout('geen-rechten', 'Je mag deze meting niet verwijderen.');
  // Foto's van de meting horen er niet meer bij; mislukt dat, dan blijft de meting toch weg.
  if (meting.fotos.length) await supabase.storage.from(BUCKET).remove(meting.fotos).then(undefined, () => {});
  return { ok: true, data: null };
}

/**
 * "Vertel het Boss": getypte of ingesproken tekst wordt metingregels. Slaat
 * NIETS op. `bestaande` zijn de regels die al in de lijst staan (andere
 * stukken), zodat Boss ze niet herhaalt en een verbetering herkent.
 */
export async function vertelMetingen(
  projectId: string,
  tekst: string,
  bestaande: { naam: string; breedte: number | ''; hoogte: number | ''; diepte: number | ''; aantal: number; eenheid: string }[],
): Promise<{ ok: true; metingen: VoorstelMeting[]; melding: string } | { ok: false; melding: string }> {
  let res;
  try {
    res = await supabase.functions.invoke('metingen-uitlezen', { body: { project_id: projectId, tekst, bestaande } });
  } catch {
    return { ok: false, melding: 'Boss is niet bereikbaar. Controleer je internet en probeer het opnieuw.' };
  }
  const { data, error } = res;
  if (error) {
    let melding = 'Boss kon dit niet verwerken. Probeer het zo nog eens.';
    try {
      const j = await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.();
      if (j?.error) melding = j.error;
    } catch {
      /* geen JSON */
    }
    return { ok: false, melding };
  }
  const d = data as { success?: boolean; error?: string; metingen?: VoorstelMeting[]; melding?: string } | null;
  if (!d?.success) return { ok: false, melding: d?.error || 'Boss kon dit niet verwerken.' };
  return { ok: true, metingen: d.metingen || [], melding: d.melding || '' };
}
