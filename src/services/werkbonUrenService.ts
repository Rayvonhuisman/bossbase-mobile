import { supabase } from '@/lib/supabase';
import { isReadonly } from '@/lib/sessionContext';
import { isGeldigeDatum } from '@/lib/nlTijd';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import type { WerkbonUur } from '@/types/domain';

/**
 * Hours booked on a work order — table `werkbon_uren`.
 *
 * The live database deliberately splits hours in two (migration
 * 20260831140000_werkbon_uren): job hours live here and drive post-calculation,
 * invoicing and the work-order PDF, while working-day hours (wages, leave) stay
 * in `urenregistratie`. The dashboard's work order reads this table, so hours
 * booked from the app must land here or they simply do not exist for the office.
 *
 * Write access follows the *job*, not the person: `bb_mag_werkbon_uren_beheren`
 * allows assignees, responsibles, admins and planners. There is no customer or
 * project column by design — those follow from the work order.
 */

const UREN_COLUMNS = `
  id, company_id, werkbon_id, profile_id, datum, start_tijd, eind_tijd,
  pauze_minuten, uren, reis_km, notitie, created_at, updated_at,
  medewerker:profiles!werkbon_uren_profile_id_fkey ( id, full_name )
`;

function describeError(
  where: string,
  error: { code?: string; message?: string; hint?: string | null; details?: string | null },
): string {
  if (__DEV__) {
    console.log(`[werkbonUrenService.${where}]`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
  const msg = error.message ?? '';
  // Raised by trigger bb_werkbon_op_slot once the work order is signed.
  if (/op slot/i.test(msg)) return msg;
  if (error.code === '42501' || error.code === 'PGRST301' || /row-level security|permission denied/i.test(msg)) {
    return 'Je mag geen uren boeken op deze werkbon.';
  }
  if (/werkbon_uren_uren_chk/i.test(msg)) return 'Het aantal uren moet groter zijn dan 0.';
  return 'De uren konden niet worden opgeslagen. Probeer het opnieuw.';
}

/** All hours booked on one work order, newest day first. */
export async function listWerkbonUren(
  workOrderId: string,
): Promise<{ data: WerkbonUur[]; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_uren')
    .select(UREN_COLUMNS)
    .eq('werkbon_id', workOrderId)
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: describeError('listWerkbonUren', error) };
  }
  return { data: (data as unknown as WerkbonUur[]) ?? [], error: null };
}

/**
 * Job hours for one person in an inclusive date range, with the work order they
 * belong to — used by the Uren tab so booked job hours are actually visible.
 */
export async function listWerkbonUrenForProfile(
  profileId: string,
  fromISO: string,
  toISO: string,
): Promise<{
  data: (WerkbonUur & { werkbon: { id: string; nummer: string | null; titel: string } | null })[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('werkbon_uren')
    .select(`${UREN_COLUMNS}, werkbon:werkbonnen!werkbon_uren_werkbon_id_fkey ( id, nummer, titel )`)
    .eq('profile_id', profileId)
    .gte('datum', fromISO)
    .lte('datum', toISO)
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: describeError('listWerkbonUrenForProfile', error) };
  }
  return { data: (data as never) ?? [], error: null };
}

/** Company-wide job hours in a range (the SELECT policy is company-scoped). */
export async function listCompanyWerkbonUren(
  fromISO: string,
  toISO: string,
): Promise<{
  data: (WerkbonUur & { werkbon: { id: string; nummer: string | null; titel: string } | null })[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('werkbon_uren')
    .select(`${UREN_COLUMNS}, werkbon:werkbonnen!werkbon_uren_werkbon_id_fkey ( id, nummer, titel )`)
    .gte('datum', fromISO)
    .lte('datum', toISO)
    .order('datum', { ascending: false });

  if (error) {
    return { data: [], error: describeError('listCompanyWerkbonUren', error) };
  }
  return { data: (data as never) ?? [], error: null };
}

export type CreateWerkbonUurInput = {
  company_id: string;
  werkbon_id: string;
  /** Whose hours these are — not necessarily whoever types them in. */
  profile_id: string;
  datum: string; // YYYY-MM-DD
  uren: number;
  start_tijd?: string | null; // HH:MM
  eind_tijd?: string | null; // HH:MM
  pauze_minuten?: number;
  notitie?: string | null;
};

/**
 * Uren boeken op een werkbon.
 *
 * `company_id` volgt de werkbon; de insert-policy controleert dat ook
 * server-side, zodat een schrijfactie over de tenantgrens heen geweigerd wordt
 * in plaats van stilletjes geaccepteerd.
 *
 * Geeft een `WriteResult` terug — hetzelfde schrijfpad als de rest van de app.
 * Een RLS-weigering komt binnen als een lege uitkomst, en die wordt hier een
 * `geen-rechten`-fout in plaats van een geslaagde opslag zonder rij.
 */
export async function createWerkbonUur(
  input: CreateWerkbonUurInput,
): Promise<WriteResult<WerkbonUur>> {
  if (!isGeldigeDatum(input.datum)) {
    return writeFout('validatie', 'Vul een geldige datum in.');
  }
  if (!Number.isFinite(input.uren) || input.uren <= 0) {
    return writeFout('validatie', 'Vul een geldig aantal uren in.');
  }
  if (input.pauze_minuten !== undefined && (!Number.isFinite(input.pauze_minuten) || input.pauze_minuten < 0)) {
    return writeFout('validatie', 'Vul een geldig aantal pauzeminuten in.');
  }

  return schrijf<WerkbonUur>(
    () =>
      supabase
        .from('werkbon_uren')
        .insert({
          company_id: input.company_id,
          werkbon_id: input.werkbon_id,
          profile_id: input.profile_id,
          datum: input.datum,
          uren: input.uren,
          start_tijd: input.start_tijd || null,
          eind_tijd: input.eind_tijd || null,
          pauze_minuten: input.pauze_minuten ?? 0,
          notitie: input.notitie?.trim() ? input.notitie.trim() : null,
        })
        .select(UREN_COLUMNS),
    {
      context: 'werkbonUrenService.createWerkbonUur',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding:
        'De uren zijn niet opgeslagen. Je kunt alleen uren boeken op een werkbon waar je op staat.',
    },
  );
}

/**
 * Werkbonuren wijzigen.
 *
 * De policy vraagt `bb_mag_werkbon_uren_beheren(werkbon_id)` — dat is de
 * uitvoerder of verantwoordelijke van de bon, met admin en planner als vangnet.
 * Die vraag kan de app niet zelf beantwoorden, dus we tonen de knop en laten de
 * server beslissen; komt er geen rij terug, dan is dat een weigering en geen
 * geslaagde opslag.
 */
export async function updateWerkbonUur(
  id: string,
  input: { datum?: string; uren?: number; pauze_minuten?: number; notitie?: string | null },
): Promise<WriteResult<WerkbonUur>> {
  const updates: Record<string, unknown> = {};
  if (input.datum !== undefined) {
    if (!isGeldigeDatum(input.datum)) return writeFout('validatie', 'Vul een geldige datum in (JJJJ-MM-DD).');
    updates.datum = input.datum;
  }
  if (input.uren !== undefined) {
    if (!Number.isFinite(input.uren) || input.uren <= 0) {
      return writeFout('validatie', 'Vul een geldig aantal uren in.');
    }
    updates.uren = input.uren;
  }
  if (input.pauze_minuten !== undefined) {
    if (!Number.isFinite(input.pauze_minuten) || input.pauze_minuten < 0) {
      return writeFout('validatie', 'Vul een geldig aantal pauzeminuten in.');
    }
    updates.pauze_minuten = input.pauze_minuten;
  }
  if (input.notitie !== undefined) updates.notitie = input.notitie?.trim() || null;

  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');
  updates.updated_at = new Date().toISOString();

  return schrijf<WerkbonUur>(
    () => supabase.from('werkbon_uren').update(updates).eq('id', id).select(UREN_COLUMNS),
    {
      context: 'werkbonUrenService.updateWerkbonUur',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding:
        'De uren zijn niet gewijzigd. Alleen de uitvoerder of verantwoordelijke van de werkbon ' +
        'mag daarop boeken.',
    },
  );
}

export async function deleteWerkbonUur(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('werkbon_uren').delete().eq('id', id).select('id'),
    {
      context: 'werkbonUrenService.deleteWerkbonUur',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding:
        'De uren zijn niet verwijderd. Alleen de uitvoerder of verantwoordelijke van de werkbon ' +
        'mag daarop boeken.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}
