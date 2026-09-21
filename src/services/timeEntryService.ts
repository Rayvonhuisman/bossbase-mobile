import { supabase } from '@/lib/supabase';
import { isReadonly } from '@/lib/sessionContext';
import { isGeldigeDatum, isGeldigeTijd } from '@/lib/nlTijd';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import {
  listCompanyWerkbonUren,
  listWerkbonUrenForProfile,
} from './werkbonUrenService';
import type { TimeEntry, UrenRegel, WerkbonUur } from '@/types/domain';

// Werkdaguren: loon en verlof. De koppelkolommen (customer_id/werkbon_id/
// deal_id) bestaan sinds migratie 20260907210753 en worden hier alleen gelezen —
// uren op een klus horen in werkbon_uren (zie werkbonUrenService).
const TIME_ENTRY_COLUMNS = `
  id, company_id, profile_id, customer_id, werkbon_id, deal_id,
  datum, start_tijd, eind_tijd, pauze_minuten, uren, type, notitie,
  created_at, updated_at
`;

/**
 * Time entries for one profile in an inclusive date-range (YYYY-MM-DD).
 * RLS guarantees medewerkers only see their own rows; admin/planner can see all,
 * but we still pin the filter to the caller's profile-id to keep the query intent
 * obvious.
 */
export async function listTimeEntriesForProfile(
  profileId: string,
  fromISO: string,
  toISO: string,
): Promise<{ data: TimeEntry[]; error: string | null }> {
  const { data, error } = await supabase
    .from('urenregistratie')
    .select(TIME_ENTRY_COLUMNS)
    .eq('profile_id', profileId)
    .gte('datum', fromISO)
    .lte('datum', toISO)
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[timeEntryService.listTimeEntriesForProfile]', error.message);
    return { data: [], error: error.message };
  }
  return { data: (data as TimeEntry[]) ?? [], error: null };
}

/**
 * Company-wide entries in a range (admin/planner only — RLS enforces).
 * Used for the team-section on Uren.
 */
export async function listCompanyTimeEntries(
  fromISO: string,
  toISO: string,
): Promise<{ data: TimeEntry[]; error: string | null }> {
  const { data, error } = await supabase
    .from('urenregistratie')
    .select(TIME_ENTRY_COLUMNS)
    .gte('datum', fromISO)
    .lte('datum', toISO)
    .order('datum', { ascending: false });

  if (error) {
    console.warn('[timeEntryService.listCompanyTimeEntries]', error.message);
    return { data: [], error: error.message };
  }
  return { data: (data as TimeEntry[]) ?? [], error: null };
}

// ---------------------------------------------------------------------------
// Uren-overzicht: beide bronnen samen
// ---------------------------------------------------------------------------
//
// De database houdt werkbonuren (werkbon_uren) en werkdaguren (urenregistratie)
// bewust gescheiden. Voor het Uren-overzicht in de app is dat één vraag —
// "hoeveel heb ik geschreven?" — dus tonen we beide bronnen samen. Alleen
// urenregistratie tonen zou uren die net op een werkbon zijn geboekt laten
// verdwijnen; alleen werkbon_uren zou verlof en overhead weglaten.

/** Zet een werkbon_uren-rij om naar de regel die het Uren-scherm rendert. */
function werkbonUurNaarRegel(
  row: WerkbonUur & { werkbon?: { id: string; nummer: string | null; titel: string } | null },
): UrenRegel {
  return {
    // De id's komen uit twee tabellen, dus prefixen we ze om een sleutelbotsing
    // in de lijst uit te sluiten.
    id: `wb:${row.id}`,
    company_id: row.company_id,
    profile_id: row.profile_id,
    customer_id: null,
    werkbon_id: row.werkbon_id,
    deal_id: null,
    datum: row.datum,
    start_tijd: row.start_tijd,
    eind_tijd: row.eind_tijd,
    pauze_minuten: row.pauze_minuten ?? 0,
    uren: Number(row.uren) || 0,
    type: 'arbeid',
    notitie: row.notitie,
    created_at: row.created_at,
    updated_at: row.updated_at,
    bron: 'werkbon',
    werkbonLabel: row.werkbon
      ? [row.werkbon.nummer, row.werkbon.titel].filter(Boolean).join(' · ')
      : null,
  };
}

function timeEntryNaarRegel(row: TimeEntry): UrenRegel {
  return { ...row, id: `ur:${row.id}`, uren: Number(row.uren) || 0, bron: 'werkdag', werkbonLabel: null };
}

/**
 * De echte tabel-id uit een lijst-id halen.
 *
 * De lijst mengt twee tabellen en prefixt daarom de sleutels (`wb:` / `ur:`).
 * Wie die id ongewijzigd aan een update meegeeft raakt gegarandeerd nul rijen —
 * en dat zou als "geen rechten" op het scherm komen terwijl er niets mis is.
 */
export function echteUurId(regelId: string): string {
  const i = regelId.indexOf(':');
  return i === -1 ? regelId : regelId.slice(i + 1);
}

function sorteer(regels: UrenRegel[]): UrenRegel[] {
  return regels.sort((a, b) =>
    a.datum === b.datum ? b.created_at.localeCompare(a.created_at) : b.datum.localeCompare(a.datum),
  );
}

/**
 * Alle uren van één medewerker in een periode, uit beide tabellen.
 *
 * Als één bron faalt wordt dat gemeld in plaats van als "minder uren" getoond —
 * een half totaal is misleidender dan een foutmelding.
 */
export async function listUrenForProfile(
  profileId: string,
  fromISO: string,
  toISO: string,
): Promise<{ data: UrenRegel[]; error: string | null }> {
  const [werkdag, werkbon] = await Promise.all([
    listTimeEntriesForProfile(profileId, fromISO, toISO),
    listWerkbonUrenForProfile(profileId, fromISO, toISO),
  ]);

  const error = werkdag.error ?? werkbon.error;
  const data = sorteer([
    ...werkdag.data.map(timeEntryNaarRegel),
    ...werkbon.data.map(werkbonUurNaarRegel),
  ]);
  return { data, error: error ? 'Niet alle uren konden worden geladen.' : null };
}

/** Bedrijfsbreed overzicht in een periode (admin/planner). */
export async function listCompanyUren(
  fromISO: string,
  toISO: string,
): Promise<{ data: UrenRegel[]; error: string | null }> {
  const [werkdag, werkbon] = await Promise.all([
    listCompanyTimeEntries(fromISO, toISO),
    listCompanyWerkbonUren(fromISO, toISO),
  ]);

  const error = werkdag.error ?? werkbon.error;
  const data = sorteer([
    ...werkdag.data.map(timeEntryNaarRegel),
    ...werkbon.data.map(werkbonUurNaarRegel),
  ]);
  return { data, error: error ? 'Niet alle uren konden worden geladen.' : null };
}

export type CreateWerkdagUurInput = {
  company_id: string;
  /** Van wie de uren zijn — de policy staat alleen je eigen rij toe (admin/planner breder). */
  profile_id: string;
  datum: string; // YYYY-MM-DD
  uren: number;
  start_tijd?: string | null; // HH:MM
  eind_tijd?: string | null; // HH:MM
  pauze_minuten?: number;
  notitie?: string | null;
};

/**
 * Algemene werkdaguren vastleggen in `urenregistratie` — uren zónder werkbon.
 *
 * Dit is dezelfde tabel en dezelfde vorm die het dashboard gebruikt voor
 * werkdaguren, dus een regel die hier binnenkomt staat daar gewoon in de
 * urenstaat. Wat er bewust NIET gebeurt:
 *
 * - **Geen `werkbon_id`.** De kolom is nullable (migratie 20260907210753) en
 *   blijft leeg. Een klus-uur hoort in `werkbon_uren`; een verzonnen koppeling
 *   of een werkbonnummer in de notitie levert een tweede administratie op die
 *   nooit klopt.
 * - **Geen `type`.** Die kolom is in het dashboard vervallen (migratie
 *   20260831130000: "wordt niet meer geschreven", historische waarde
 *   'arbeid'). De kolom heeft een default, dus we laten hem met rust in plaats
 *   van een keuzelijst terug te brengen die het systeem niet meer kent.
 *
 * `company_id` komt van het profiel van de gebruiker; de insert-policy toetst
 * dat server-side nog eens, zodat een schrijfactie buiten het eigen bedrijf
 * wordt geweigerd.
 */
export async function createWerkdagUur(
  input: CreateWerkdagUurInput,
): Promise<WriteResult<TimeEntry>> {
  if (!isGeldigeDatum(input.datum)) {
    return writeFout('validatie', 'Vul een geldige datum in.');
  }
  if (!Number.isFinite(input.uren) || input.uren <= 0) {
    return writeFout('validatie', 'Vul een geldig aantal uren in.');
  }
  for (const v of [input.start_tijd, input.eind_tijd]) {
    if (v && !isGeldigeTijd(v)) return writeFout('validatie', 'Vul een geldige tijd in (uu:mm).');
  }
  if (
    input.pauze_minuten !== undefined &&
    (!Number.isFinite(input.pauze_minuten) || input.pauze_minuten < 0)
  ) {
    return writeFout('validatie', 'Vul een geldig aantal pauzeminuten in.');
  }

  return schrijf<TimeEntry>(
    () =>
      supabase
        .from('urenregistratie')
        .insert({
          company_id: input.company_id,
          profile_id: input.profile_id,
          datum: input.datum,
          uren: input.uren,
          start_tijd: input.start_tijd || null,
          eind_tijd: input.eind_tijd || null,
          pauze_minuten: input.pauze_minuten ?? 0,
          notitie: input.notitie?.trim() ? input.notitie.trim() : null,
        })
        .select(TIME_ENTRY_COLUMNS),
    {
      context: 'timeEntryService.createWerkdagUur',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De uren zijn niet opgeslagen — je kunt alleen je eigen uren vastleggen.',
    },
  );
}

/**
 * Werkdaguren (`urenregistratie`) wijzigen en verwijderen.
 *
 * De policy laat dit toe aan admin en planner, én aan de medewerker voor zijn
 * eigen rijen. De 'eigen rij'-helft toetst de server; de app toont de knop en
 * meldt eerlijk als er niets is geraakt.
 */
export async function updateTimeEntry(
  id: string,
  input: {
    datum?: string;
    start_tijd?: string | null;
    eind_tijd?: string | null;
    pauze_minuten?: number;
    uren?: number;
    notitie?: string | null;
  },
): Promise<WriteResult<TimeEntry>> {
  const updates: Record<string, unknown> = {};
  if (input.datum !== undefined) {
    if (!isGeldigeDatum(input.datum)) {
      return writeFout('validatie', 'Vul een geldige datum in (JJJJ-MM-DD).');
    }
    updates.datum = input.datum;
  }
  for (const veld of ['start_tijd', 'eind_tijd'] as const) {
    const v = input[veld];
    if (v !== undefined) {
      if (v && !isGeldigeTijd(v)) return writeFout('validatie', 'Vul een geldige tijd in (uu:mm).');
      updates[veld] = v || null;
    }
  }
  if (input.pauze_minuten !== undefined) {
    if (!Number.isFinite(input.pauze_minuten) || input.pauze_minuten < 0) {
      return writeFout('validatie', 'Vul een geldig aantal pauzeminuten in.');
    }
    updates.pauze_minuten = input.pauze_minuten;
  }
  if (input.uren !== undefined) {
    if (!Number.isFinite(input.uren) || input.uren <= 0) {
      return writeFout('validatie', 'Vul een geldig aantal uren in.');
    }
    updates.uren = input.uren;
  }
  if (input.notitie !== undefined) updates.notitie = input.notitie?.trim() || null;

  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');
  updates.updated_at = new Date().toISOString();

  return schrijf<TimeEntry>(
    () => supabase.from('urenregistratie').update(updates).eq('id', id).select(TIME_ENTRY_COLUMNS),
    {
      context: 'timeEntryService.updateTimeEntry',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De uren zijn niet gewijzigd. Je kunt alleen je eigen uren aanpassen.',
    },
  );
}

export async function deleteTimeEntry(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('urenregistratie').delete().eq('id', id).select('id'),
    {
      context: 'timeEntryService.deleteTimeEntry',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De uren zijn niet verwijderd. Je kunt alleen je eigen uren verwijderen.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}
