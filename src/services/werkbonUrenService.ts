import { supabase } from '@/lib/supabase';
import { isReadonly } from '@/lib/sessionContext';
import { isGeldigeDatum } from '@/lib/nlTijd';
import { rondUrenAf } from '@/lib/urenBerekening';
import { schrijf, writeFout, type WriteResult } from '@/lib/writeResult';
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
 * Write access follows the *job*: `bb_mag_werkbon_uren_beheren` allows
 * assignees, responsibles, admins and the `planning` right. Booking for SOMEONE
 * ELSE additionally needs `bb_mag_uren_voor_ander` (admin, planning, or
 * responsible of that job; 20261002135712).
 *
 * Reading follows the person (20261004201000, dashboard 2855c0e): you see your
 * own rows, plus all rows on jobs where `bb_mag_uren_voor_ander` holds. Being
 * assigned, `alles_inzien` or the shared workspace do NOT reveal a colleague's
 * hours. There is no customer or project column by design — those follow from
 * the work order.
 *
 * `uren` is recomputed by the database (trigger `bb_uren_berekenen`): end −
 * start − break, two decimals; without times it is capped at 0–24.
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

/**
 * Job hours in a range for the team view. RLS limits this to your own rows plus
 * jobs where you may book for others (admin / planning / responsible), so for a
 * plain employee it is just their own hours.
 */
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
  /** Gereden kilometers; leeg = null (niet 0), zoals het dashboard. */
  reis_km?: number | null;
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
  // Twee decimalen, zoals het dashboard (zie lib/urenBerekening).
  const uren = rondUrenAf(input.uren);
  if (!Number.isFinite(uren) || uren <= 0) {
    return writeFout('validatie', 'Vul een geldig aantal uren in.');
  }
  if (input.pauze_minuten !== undefined && (!Number.isFinite(input.pauze_minuten) || input.pauze_minuten < 0)) {
    return writeFout('validatie', 'Vul een geldig aantal pauzeminuten in.');
  }
  if (input.reis_km != null && (!Number.isFinite(input.reis_km) || input.reis_km < 0)) {
    return writeFout('validatie', 'Vul een geldig aantal kilometers in.');
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
          uren,
          start_tijd: input.start_tijd || null,
          eind_tijd: input.eind_tijd || null,
          pauze_minuten: input.pauze_minuten ?? 0,
          reis_km: input.reis_km ?? null,
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
 * Een weigering van een trigger (slot na ondertekenen, geannuleerde bon) heeft
 * al een Nederlandse melding; classificeerFout maakt daar een algemene
 * `validatie` van. Die melding zetten we hier terug.
 */
function metDbMelding<T>(res: WriteResult<T>): WriteResult<T> {
  if (res.ok || !res.technisch) return res;
  if (/op slot|geannuleerd/i.test(res.technisch)) {
    return writeFout('op-slot', res.technisch.replace(/^\S+\s/, ''), res.technisch);
  }
  return res;
}

/** Wat je aan een geboekt uur kunt wijzigen; dezelfde velden als bij boeken. */
export type UpdateWerkbonUurInput = Omit<CreateWerkbonUurInput, 'company_id' | 'werkbon_id' | 'profile_id'> & {
  /** Alleen meegeven als je voor een ander mag boeken (bb_mag_uren_voor_ander). */
  profile_id?: string;
};

/**
 * Een geboekt uur wijzigen (besluit 26-10, G-06). RLS `werkbon_uren_update`:
 * je eigen uur, of als admin, met het recht planning of als verantwoordelijke
 * van de bon ook dat van een ander. Na ondertekenen weigert bb_werkbon_op_slot.
 */
export async function updateWerkbonUur(
  id: string,
  input: UpdateWerkbonUurInput,
): Promise<WriteResult<WerkbonUur>> {
  if (!isGeldigeDatum(input.datum)) {
    return writeFout('validatie', 'Vul een geldige datum in.');
  }
  const uren = rondUrenAf(input.uren);
  if (!Number.isFinite(uren) || uren <= 0) {
    return writeFout('validatie', 'Vul een geldig aantal uren in.');
  }
  if (input.reis_km != null && (!Number.isFinite(input.reis_km) || input.reis_km < 0)) {
    return writeFout('validatie', 'Vul een geldig aantal kilometers in.');
  }

  const res = await schrijf<WerkbonUur>(
    () =>
      supabase
        .from('werkbon_uren')
        .update({
          datum: input.datum,
          uren,
          start_tijd: input.start_tijd || null,
          eind_tijd: input.eind_tijd || null,
          pauze_minuten: input.pauze_minuten ?? 0,
          reis_km: input.reis_km ?? null,
          notitie: input.notitie?.trim() ? input.notitie.trim() : null,
          ...(input.profile_id ? { profile_id: input.profile_id } : {}),
        })
        .eq('id', id)
        .select(UREN_COLUMNS),
    {
      context: 'werkbonUrenService.updateWerkbonUur',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'Niet gewijzigd. Je kunt alleen je eigen uren wijzigen, of als beheerder of planner die van anderen.',
    },
  );
  return metDbMelding(res);
}

/** Een geboekt uur verwijderen; zelfde rechten en slot als wijzigen. */
export async function deleteWerkbonUur(id: string): Promise<WriteResult<{ id: string }>> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('werkbon_uren').delete().eq('id', id).select('id'),
    {
      context: 'werkbonUrenService.deleteWerkbonUur',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'Niet verwijderd. Je kunt alleen je eigen uren verwijderen, of als beheerder of planner die van anderen.',
    },
  );
  return metDbMelding(res);
}
