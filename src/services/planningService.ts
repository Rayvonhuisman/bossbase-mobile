import { supabase } from '@/lib/supabase';
import { haalInStukken } from '@/lib/inStukken';
import type { WerkbonDag, WerkbonPlanbaar } from '@/lib/planningRegels';

/**
 * Lezen voor de Agenda (tab `/planning`) en de Planning (`/planningbord`).
 *
 * Gelijk aan het dashboard:
 * - werkbonnen komen met hun geplande dagen (`werkbon_dagen`): dagploeg,
 *   tijden per persoon en voertuigen per dag;
 * - de agenda leest `calendar_events` (géén activiteiten);
 * - RLS bepaalt wat je mag zien; de persoonlijke filter doet het scherm
 *   (zie `lib/planningRegels`).
 *
 * Alleen lezen. Inplannen, slepen en de meldingen die daarbij horen
 * (`planning_wijzigingen`, `syncWerkbonEvents`) blijven in het dashboard.
 */

const DAG_KOLOMMEN =
  'id, datum, starttijd, eindtijd, medewerker_ids, medewerker_tijden, voertuig_ids, voertuig_tijden, medewerker_voertuig';

const WERKBON_KOLOMMEN = `
  id, company_id, nummer, titel, status, gepland_op, starttijd, eindtijd, locatie,
  customer_id, project_id, assigned_to, assigned_to_ids, verantwoordelijke_ids, voertuig_ids, ondertekend_op,
  customer:customers ( id, name, phone, address, postcode, city ),
  project:projects ( id, name ),
  dagen:werkbon_dagen ( ${DAG_KOLOMMEN} )
`;

export type PlanWerkbon = WerkbonPlanbaar & {
  id: string;
  company_id: string;
  nummer: string | null;
  titel: string | null;
  status: string | null;
  locatie: string | null;
  customer_id: string | null;
  project_id: string | null;
  ondertekend_op: string | null;
  verantwoordelijke_ids?: string[] | null;
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    address: string | null;
    postcode: string | null;
    city: string | null;
  } | null;
  project: { id: string; name: string | null } | null;
  dagen: WerkbonDag[];
};

export type AgendaEvent = {
  id: string;
  company_id: string;
  customer_id: string | null;
  deal_id: string | null;
  title: string | null;
  type: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  notes: string | null;
  assigned_to: string | null;
  werkbon_id: string | null;
  activiteit_id: string | null;
  herkomst: string | null;
  customer: PlanWerkbon['customer'];
};

const EVENT_KOLOMMEN = `
  id, company_id, customer_id, deal_id, title, type, start_at, end_at, location, notes,
  assigned_to, werkbon_id, activiteit_id, herkomst,
  customer:customers ( id, name, phone, address, postcode, city )
`;

export type Voertuig = {
  id: string;
  naam: string;
  kenteken: string | null;
  kleur: string | null;
  actief: boolean;
  zitplaatsen: number | null;
};

function melding(where: string, error: { code?: string; message?: string }): string {
  if (__DEV__) console.log(`[planningService.${where}]`, error.code, error.message);
  if (error.code === '42501' || /row-level security|permission denied/i.test(error.message ?? '')) {
    return 'Je hebt geen rechten om dit te bekijken.';
  }
  if (/JWT|token/i.test(error.message ?? '')) return 'Je sessie is verlopen. Log opnieuw in.';
  return 'De planning kon niet worden geladen. Probeer het opnieuw.';
}

function normaliseer(rijen: unknown[]): PlanWerkbon[] {
  return (rijen as PlanWerkbon[]).map((w) => ({
    ...w,
    dagen: [...(Array.isArray(w.dagen) ? w.dagen : [])].sort((a, b) => a.datum.localeCompare(b.datum)),
  }));
}

/** In stukken van 150 id's, zodat de URL van `in.(…)` niet te lang wordt. */
function inBrokken<T>(lijst: T[], grootte = 150): T[][] {
  const uit: T[][] = [];
  for (let i = 0; i < lijst.length; i += grootte) uit.push(lijst.slice(i, i + grootte));
  return uit;
}

/**
 * Werkbonnen met minstens één geplande dag in `[van, tot]` (YYYY-MM-DD), mét
 * al hun dagen — een klus die vorige week begon telt deze week gewoon mee.
 */
export async function listWerkbonnenInBereik(
  van: string,
  tot: string,
): Promise<{ data: PlanWerkbon[]; error: string | null }> {
  const dagRes = await haalInStukken<{ werkbon_id: string }, { code?: string; message?: string }>((a, b) =>
    supabase
      .from('werkbon_dagen')
      .select('werkbon_id')
      .gte('datum', van)
      .lte('datum', tot)
      .order('id')
      .range(a, b),
  );
  if (dagRes.error) return { data: [], error: melding('listWerkbonnenInBereik', dagRes.error) };

  const ids = Array.from(new Set(dagRes.data.map((d) => d.werkbon_id)));
  const rijen: unknown[] = [];
  for (const brok of inBrokken(ids)) {
    const { data, error } = await supabase.from('werkbonnen').select(WERKBON_KOLOMMEN).in('id', brok);
    if (error) return { data: [], error: melding('listWerkbonnenInBereik', error) };
    rijen.push(...(data ?? []));
  }

  // Vangnet zoals het dashboard: een werkbon zonder dagenlijst valt terug op
  // gepland_op.
  const { data: los, error: losFout } = await supabase
    .from('werkbonnen')
    .select(WERKBON_KOLOMMEN)
    .gte('gepland_op', van)
    .lte('gepland_op', tot);
  if (losFout) return { data: [], error: melding('listWerkbonnenInBereik', losFout) };
  const bekend = new Set(ids);
  for (const w of (los ?? []) as { id: string }[]) if (!bekend.has(w.id)) rijen.push(w);

  return { data: normaliseer(rijen), error: null };
}

/**
 * Werkbonnen die nog niet ingepland zijn (geen dag met starttijd). De server
 * levert de kandidaten (geen datum of geen werkbontijd); de definitieve toets
 * (`nietIngepland`) doet het scherm.
 */
export async function listNietIngeplandeKandidaten(): Promise<{ data: PlanWerkbon[]; error: string | null }> {
  const res = await haalInStukken<unknown, { code?: string; message?: string }>((a, b) =>
    supabase
      .from('werkbonnen')
      .select(WERKBON_KOLOMMEN)
      .or('gepland_op.is.null,starttijd.is.null')
      .order('created_at', { ascending: false })
      .order('id')
      .range(a, b),
  );
  if (res.error) return { data: [], error: melding('listNietIngeplandeKandidaten', res.error) };
  return { data: normaliseer(res.data), error: null };
}

/** Agenda-items (`calendar_events`) met een start binnen `[startISO, endISO]`. */
export async function listAgendaEvents(
  startISO: string,
  endISO: string,
): Promise<{ data: AgendaEvent[]; error: string | null }> {
  const res = await haalInStukken<AgendaEvent, { code?: string; message?: string }>((a, b) =>
    supabase
      .from('calendar_events')
      .select(EVENT_KOLOMMEN)
      .gte('start_at', startISO)
      .lte('start_at', endISO)
      .order('start_at')
      .order('id')
      .range(a, b) as unknown as PromiseLike<{ data: AgendaEvent[] | null; error: { code?: string; message?: string } | null }>,
  );
  if (res.error) return { data: [], error: melding('listAgendaEvents', res.error) };
  return { data: res.data, error: null };
}

/** Alle voertuigen (ook inactieve, voor oude planning), op naam. */
export async function listAlleVoertuigen(): Promise<{ data: Voertuig[]; error: string | null }> {
  const { data, error } = await supabase
    .from('voertuigen')
    .select('id, naam, kenteken, kleur, actief, zitplaatsen')
    .order('naam');
  if (error) return { data: [], error: melding('listAlleVoertuigen', error) };
  return {
    data: ((data ?? []) as Voertuig[]).map((v) => ({ ...v, actief: v.actief !== false })),
    error: null,
  };
}
