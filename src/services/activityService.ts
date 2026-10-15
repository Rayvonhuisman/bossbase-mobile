import { supabase } from '@/lib/supabase';
import { buildDueAt, isGeldigeDatum, isGeldigeTijd, splitsLokaal } from '@/lib/nlTijd';
import { getUserId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import { listAgendaEvents, listWerkbonnenInBereik, type PlanWerkbon } from './planningService';
import { agendaWerkbonItems, zichtbareAfspraken, type AgendaWerkbonItem } from '@/lib/planningRegels';
import { toLocalISODate } from '@/lib/dateRange';
import { haalInStukken } from '@/lib/inStukken';
import { leesAfspraakNotities, type AfspraakNotitie } from '@/lib/afspraakNotities';

/**
 * Activities + calendar_events ophalen voor mobile Planning + Vandaag.
 *
 * Schema (per SPEC.md §6.2):
 *   activities       — id, company_id, customer_id, deal_id, title, type, body,
 *                      notes, author, due_at, completed, completed_at,
 *                      google_event_id, google_sync_status, ...
 *   calendar_events  — id, company_id, customer_id, deal_id, title, start_at,
 *                      end_at, location, description
 *
 * RLS:
 *   Beide tabellen worden gefilterd op company_id = (select company_id from
 *   profiles where id = auth.uid()). Wij voegen daarbij client-side geen
 *   extra filter toe — RLS doet het werk.
 *
 * Géén service-role usage.
 */

// Live schema (geverifieerd via read-only PostgREST-probe, 2026):
// De omschrijving van een afspraak staat in kolom `notes`; er is GEEN
// `description`-kolom op calendar_events. customer_id/deal_id/location bestaan.
const CALENDAR_COLUMNS = `
  id, company_id, customer_id, deal_id, title, start_at, end_at,
  location, notes, created_at,
  customer:customers ( id, name, phone, address, postcode, city )
`;

// Live schema (geverifieerd): activities heeft `notes` (de tekst/omschrijving),
// maar GEEN `body`, `author` of `completed_at`. Wel: type, due_at, completed,
// customer_id, deal_id, assigned_to.
const ACTIVITY_COLUMNS = `
  id, company_id, customer_id, deal_id, assigned_to, assigned_to_ids, title, type, notes,
  due_at, end_time, location, completed, created_at,
  customer:customers ( id, name, phone, address, postcode, city )
`;

export type CalendarEvent = {
  id: string;
  company_id: string;
  customer_id: string | null;
  deal_id: string | null;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  /** Omschrijving/notities — echte kolom is `notes` (geen `description`). */
  notes: string | null;
  // Live schema: calendar_events heeft geen `updated_at`.
  created_at: string;
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    address: string | null;
    postcode: string | null;
    city: string | null;
  } | null;
};

export type ActivityRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  deal_id: string | null;
  assigned_to: string | null;
  title: string | null;
  type: string | null; // call | email | meeting | task | note
  /** Omschrijving/notities — echte kolom is `notes` (geen `body`). */
  notes: string | null;
  due_at: string | null;
  /** HH:mm(:ss) eindtijd op dezelfde dag; leeg = geen. */
  end_time?: string | null;
  location?: string | null;
  completed: boolean;
  // Live schema: activities heeft geen `updated_at`.
  created_at: string;
  customer: CalendarEvent['customer'];
  /** Alleen in de volledige lijst (`listAllActivities`): alle toegewezenen. */
  assigned_to_ids?: string[] | null;
  /** Alleen in de volledige lijst: naam van de primaire toegewezene. */
  assigned_profile?: { full_name: string | null } | null;
};

/** Calendar events binnen `[fromISO, toISO]`, oplopend op start_at. */
export async function listCalendarEventsForRange(
  fromISO: string,
  toISO: string,
): Promise<{ data: CalendarEvent[]; error: string | null }> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(CALENDAR_COLUMNS)
    .gte('start_at', fromISO)
    .lte('start_at', toISO)
    .order('start_at', { ascending: true });

  if (error) {
    console.warn('[activityService.listCalendarEventsForRange]', error.message);
    return { data: [], error: 'Agenda kon niet worden geladen.' };
  }
  return { data: (data as unknown as CalendarEvent[]) ?? [], error: null };
}

/**
 * Recente activiteiten (alle types), niet-voltooid eerst, dan op due_at.
 * Gebruikt door het Activiteiten-menuscherm. RLS filtert op company_id.
 */
export async function listRecentActivities(
  limit = 100,
): Promise<{ data: ActivityRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('activities')
    .select(ACTIVITY_COLUMNS)
    .order('completed', { ascending: true })
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[activityService.listRecentActivities]', error.message);
    return { data: [], error: 'Activiteiten konden niet worden geladen.' };
  }
  return { data: (data as unknown as ActivityRow[]) ?? [], error: null };
}

/**
 * Zelfde selectie als `ACTIVITY_SELECT` in het dashboard: alle kolommen (`*`,
 * dus ook `assigned_to_ids`, `end_time` en `location` als ze bestaan), de klant
 * en de naam van de primaire toegewezene via de expliciete FK-naam — zo tonen
 * we nooit een ruw profiel-id.
 */
const ACTIVITY_LIST_SELECT = `
  *,
  customer:customers ( id, name, phone, address, postcode, city ),
  assigned_profile:profiles!activities_assigned_to_fkey ( full_name )
`;

/**
 * Alle activiteiten die je mag zien (RLS), oplopend op `due_at` en daarna `id`
 * — `listActivities()` uit het dashboard. In stukken van 1000, dus geen
 * stille afkap bij grote bedrijven.
 */
export async function listAllActivities(): Promise<{ data: ActivityRow[]; error: string | null }> {
  const { data, error } = await haalInStukken<ActivityRow, { message: string }>((van, tot) =>
    supabase
      .from('activities')
      .select(ACTIVITY_LIST_SELECT)
      .order('due_at', { ascending: true })
      .order('id', { ascending: true })
      .range(van, tot)
      .then((r) => ({ data: (r.data as unknown as ActivityRow[] | null) ?? null, error: r.error })),
  );
  if (error) {
    console.warn('[activityService.listAllActivities]', error.message);
    return { data: [], error: 'Activiteiten konden niet worden geladen.' };
  }
  return { data, error: null };
}

/**
 * Eigen open activiteiten met `due_at` tot en met `totISO` (einde van vandaag):
 * de bron voor "Activiteiten vandaag" en "te laat" op de homepage. "Eigen" =
 * primair toegewezen óf in `assigned_to_ids` (het Persoonlijk-filter van het
 * dashboard, `myActivities`), plus wat aan niemand is toegewezen — zie
 * `eigenActiviteitenVandaag`.
 */
export async function listEigenOpenActiviteitenTot(
  userId: string,
  totISO: string,
): Promise<{ data: ActivityRow[]; error: string | null }> {
  const { data, error } = await haalInStukken<ActivityRow, { message: string }>((van, tot) =>
    supabase
      .from('activities')
      .select(ACTIVITY_LIST_SELECT)
      .eq('completed', false)
      .lte('due_at', totISO)
      .or(
        `assigned_to.eq.${userId},assigned_to_ids.cs.{${userId}},` +
          'and(assigned_to.is.null,or(assigned_to_ids.is.null,assigned_to_ids.eq.{}))',
      )
      .order('due_at', { ascending: true })
      .order('id', { ascending: true })
      .range(van, tot)
      .then((r) => ({ data: (r.data as unknown as ActivityRow[] | null) ?? null, error: r.error })),
  );
  if (error) {
    console.warn('[activityService.listEigenOpenActiviteitenTot]', error.message);
    return { data: [], error: 'Activiteiten konden niet worden geladen.' };
  }
  return { data, error: null };
}

/** Eerstvolgende calendar-event vanaf nu. */
export async function getNextCalendarEvent(): Promise<{
  data: CalendarEvent | null;
  error: string | null;
}> {
  const nowISO = new Date().toISOString();
  const { data, error } = await supabase
    .from('calendar_events')
    .select(CALENDAR_COLUMNS)
    .gte('start_at', nowISO)
    .order('start_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[activityService.getNextCalendarEvent]', error.message);
    return { data: null, error: 'Volgende afspraak kon niet worden geladen.' };
  }
  return { data: (data as unknown as CalendarEvent | null) ?? null, error: null };
}

// ===========================================================================
// Unified Planning model — combines calendar_events + activities + werkbonnen
// into one normalized list for the Planning page (Dag / Week / Maand).
// ===========================================================================

export type PlanningSource = 'calendar_event' | 'activity' | 'work_order';

/**
 * Normalized planning item. Every UI row renders this shape; missing fields
 * are `null` and rendered with safe fallbacks. `status` uses StatusBadge-
 * compatible keys where possible (gepland / in_progress / completed / cancelled).
 */
export type PlanningItem = {
  id: string;
  source: PlanningSource;
  title: string;
  customerName: string | null;
  customerId: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  /** ISO instant of start (events/work-orders-with-time); null = no time / all-day. */
  startAt: string | null;
  endAt: string | null;
  /** Local calendar date (YYYY-MM-DD) used for grouping/sorting. */
  date: string;
  status: string | null;
  assigneeName: string | null;
  assigneeId: string | null;
  workOrderId: string | null;
  /** Werkbonnummer (WB-…) — alleen gevuld voor werkbonnen, anders null. */
  number: string | null;
  typeLabel: string;
};

function joinAddress(c: CalendarEvent['customer']): string | null {
  if (!c) return null;
  return [c.address, c.postcode, c.city].filter(Boolean).join(', ') || null;
}

function combineDateTime(dateStr: string | null, timeStr: string | null): string | null {
  if (!dateStr || !timeStr) return null;
  // Parsed as LOCAL time (no trailing Z) → correct instant for the device tz.
  const d = new Date(`${dateStr}T${timeStr}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function eventStatus(e: CalendarEvent): string {
  const now = Date.now();
  const startMs = e.start_at ? new Date(e.start_at).getTime() : NaN;
  const endMs = e.end_at ? new Date(e.end_at).getTime() : NaN;
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && startMs <= now && now <= endMs) {
    return 'in_progress';
  }
  if (!Number.isNaN(endMs) && endMs < now) return 'completed';
  return 'gepland';
}

function fromEvent(e: CalendarEvent): PlanningItem {
  return {
    id: `event-${e.id}`,
    source: 'calendar_event',
    number: null,
    title: e.title ?? 'Afspraak',
    customerName: e.customer?.name ?? null,
    customerId: e.customer_id,
    description: e.notes,
    address: e.location ?? joinAddress(e.customer),
    phone: e.customer?.phone ?? null,
    startAt: e.start_at,
    endAt: e.end_at,
    date: e.start_at ? toLocalISODate(new Date(e.start_at)) : '',
    status: eventStatus(e),
    assigneeName: null,
    assigneeId: null,
    workOrderId: null,
    typeLabel: 'Afspraak',
  };
}

/** Effective sort timestamp: real start, else end-of-day so untimed items sort last. */
function sortMs(item: PlanningItem): number {
  if (item.startAt) {
    const ms = new Date(item.startAt).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  if (item.date) {
    const ms = new Date(`${item.date}T23:59:59`).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Jouw planning voor de homepage, persoonlijk — ook voor een admin, net als de
 * dashboardtegels `werkbonnen_today` en `agenda_week` (`myWerkbonnen`,
 * `myCalendarEvents`):
 *
 * - werkbonnen per geplande dag (`werkbon_dagen`) waarop jij in de dagploeg
 *   staat, met jóuw tijd. Een klus van ma t/m vr staat dus ook woensdag hier;
 *   `gepland_op` is alleen de eerste dag. Afgeronde tellen mee ("x van y
 *   klaar").
 * - je eigen agenda-items (`assigned_to`), zonder de rijen die bij een werkbon
 *   of activiteit horen — die staan er al als werkbon of activiteit.
 *
 * `van`/`tot` zijn lokale datums (YYYY-MM-DD), `startISO`/`endISO` dezelfde
 * grenzen als tijdstip voor `calendar_events.start_at`.
 */
export async function listMijnPlanning(params: {
  uid: string;
  van: string;
  tot: string;
  startISO: string;
  endISO: string;
  currentUserName?: string | null;
}): Promise<{ items: PlanningItem[]; error: string | null }> {
  const { uid, van, tot, startISO, endISO, currentUserName } = params;
  const [evRes, wbRes] = await Promise.all([
    listAgendaEvents(startISO, endISO),
    listWerkbonnenInBereik(van, tot),
  ]);

  const items: PlanningItem[] = [];
  if (!evRes.error) {
    const eigen = zichtbareAfspraken(evRes.data, { uid, gedeeld: false }).filter((e) => !e.activiteit_id);
    items.push(...eigen.map((e) => fromEvent(e as unknown as CalendarEvent)));
  }
  if (!wbRes.error) {
    const dagItems = agendaWerkbonItems(wbRes.data, { uid, gedeeld: false, van, tot, ookAfgerond: true });
    items.push(...dagItems.map((it) => fromWerkbonDag(it, currentUserName ?? null)));
  }
  items.sort((a, b) => sortMs(a) - sortMs(b));

  const fout = evRes.error && wbRes.error ? 'Planning kon niet worden geladen.' : (evRes.error ?? wbRes.error);
  return { items, error: fout };
}

function fromWerkbonDag(it: AgendaWerkbonItem<PlanWerkbon>, currentUserName: string | null): PlanningItem {
  const w = it.werkbon;
  return {
    id: `wo-${it.sleutel}`,
    source: 'work_order',
    number: w.nummer ?? null,
    title: w.titel || 'Werkbon',
    customerName: w.customer?.name ?? null,
    customerId: w.customer_id,
    description: null,
    address: w.locatie ?? joinAddress(w.customer),
    phone: w.customer?.phone ?? null,
    startAt: combineDateTime(it.datum, it.starttijd),
    endAt: combineDateTime(it.datum, it.eindtijd),
    date: it.datum,
    status: w.status ?? null,
    assigneeName: currentUserName?.trim() || 'Jij',
    assigneeId: null,
    workOrderId: w.id,
    typeLabel: 'Werkbon',
  };
}

// ===========================================================================
// SCHRIJFACTIES — activiteiten en taken
// ===========================================================================
//
// Eén op één overgenomen uit `src/services/activityService.js` op origin/main:
// dezelfde tabel, dezelfde toegestane types, dezelfde vertaling van status naar
// de boolean `completed`, en dezelfde standaardtoewijzing aan de ingelogde
// gebruiker als er niemand is gekozen.
//
// RLS (geverifieerd op de live database): INSERT/UPDATE/DELETE vragen alleen
// `company_id = current_company_id()` — geen rechtgate. Op INSERT staat wél de
// restrictive policy `readonly_activities`. Let op de SELECT-policy: die is
// strenger dan de schrijfpolicies (gedeelde werkruimte, planning-, of
// agenda_inzien-recht, of zelf toegewezen zijn). Een activiteit aanmaken die je
// daarna niet meer ziet is dus mogelijk; daarom wijzen we standaard aan jezelf
// toe, precies zoals het dashboard doet.

/** De types die de database accepteert. Zie ALLOWED_TYPES in het dashboard. */
export const ACTIVITEIT_TYPES = ['call', 'email', 'visit', 'task', 'follow'] as const;
export type ActiviteitType = (typeof ACTIVITEIT_TYPES)[number];

/**
 * Nederlandse labels. De database bewaart Engelse sleutels; oudere rijen kennen
 * ook `meeting`, `note`, `quote` en `offer`, die hier meelopen zodat bestaande
 * data een nette naam houdt.
 */
export const ACTIVITEIT_TYPE_LABELS: Record<string, string> = {
  call: 'Bellen',
  email: 'E-mail',
  visit: 'Bezoek',
  task: 'Taak',
  follow: 'Opvolgen',
  meeting: 'Afspraak',
  note: 'Notitie',
  quote: 'Offerte',
  offer: 'Offerte',
};

export function activiteitTypeLabel(type: string | null | undefined): string {
  if (!type) return 'Activiteit';
  return ACTIVITEIT_TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

export type ActivityInput = {
  title: string;
  type?: string;
  /** YYYY-MM-DD in Nederlandse kalendertijd. */
  date?: string | null;
  /** HH:mm; leeg betekent 09:00, net als in het dashboard. */
  time?: string | null;
  notes?: string | null;
  customer_id?: string | null;
  deal_id?: string | null;
  assigned_to_ids?: string[] | null;
  location?: string | null;
  completed?: boolean;
  /** HH:mm eindtijd (dashboard: start + 15 min tenzij zelf gekozen). */
  end_time?: string | null;
};

function mapActivityInput(input: Partial<ActivityInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;
  if (input.location !== undefined) payload.location = input.location?.trim() || null;

  if (input.type !== undefined) {
    // Onbekend type valt terug op 'task' — zelfde vangnet als het dashboard.
    payload.type = (ACTIVITEIT_TYPES as readonly string[]).includes(input.type ?? '')
      ? input.type
      : 'task';
  }

  if (input.customer_id !== undefined) payload.customer_id = input.customer_id || null;
  if (input.deal_id !== undefined) payload.deal_id = input.deal_id || null;

  if (input.assigned_to_ids !== undefined) {
    const ids = (input.assigned_to_ids ?? []).filter(Boolean);
    payload.assigned_to_ids = ids;
    // De legacy-kolom blijft de primaire toewijzing dragen; het dashboard leest
    // hem nog als terugval, dus we houden ze gelijk.
    payload.assigned_to = ids[0] ?? null;
  }

  if (input.date !== undefined) {
    payload.due_at = buildDueAt(input.date, input.time ?? '');
  }

  if (input.completed !== undefined) payload.completed = Boolean(input.completed);
  if (input.end_time !== undefined) payload.end_time = input.end_time || null;

  return payload;
}

function valideerActivity(input: Partial<ActivityInput>, nieuw: boolean): string | null {
  if (nieuw || input.title !== undefined) {
    if (!input.title?.trim()) return 'Geef de activiteit een titel.';
  }
  if (input.date) {
    if (!isGeldigeDatum(input.date)) return 'Vul een geldige datum in (JJJJ-MM-DD).';
    if (input.time && !isGeldigeTijd(input.time)) return 'Vul een geldige tijd in (uu:mm).';
  }
  if (!input.date && input.time) return 'Kies eerst een datum bij deze tijd.';
  if (input.end_time && !isGeldigeTijd(input.end_time)) return 'Vul een geldige eindtijd in (uu:mm).';
  return null;
}

export async function createActivity(
  input: ActivityInput,
): Promise<WriteResult<ActivityRow>> {
  const fout = valideerActivity(input, true);
  if (fout) return writeFout('validatie', fout);

  const basis = mapActivityInput({ type: 'task', ...input });

  // Niemand gekozen? Toewijzen aan jezelf. Zonder dit valt de nieuwe activiteit
  // buiten je eigen SELECT-policy als je geen alles-inzien-recht hebt, en dan
  // is hij meteen na het opslaan onvindbaar.
  const ids = basis.assigned_to_ids as string[] | undefined;
  if (!ids || ids.length === 0) {
    const eigen = getUserId();
    if (eigen) {
      basis.assigned_to_ids = [eigen];
      basis.assigned_to = eigen;
    }
  }

  const payload = withCompanyId(basis);
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  return schrijf<ActivityRow>(
    () => supabase.from('activities').insert(payload).select(ACTIVITY_COLUMNS),
    { context: 'activityService.createActivity', bedrijfReadonly: isReadonly() },
  );
}

export async function updateActivity(
  id: string,
  input: Partial<ActivityInput>,
): Promise<WriteResult<ActivityRow>> {
  const fout = valideerActivity(input, false);
  if (fout) return writeFout('validatie', fout);

  const updates = mapActivityInput(input);
  if (Object.keys(updates).length === 0) {
    return writeFout('validatie', 'Er is niets gewijzigd.');
  }

  const res = await schrijf<ActivityRow>(
    () => supabase.from('activities').update(updates).eq('id', id).select(ACTIVITY_COLUMNS),
    { context: 'activityService.updateActivity', bedrijfReadonly: isReadonly() },
  );
  // Een gekoppeld agenda-item loopt mee, zoals het dashboard (syncLinkedActivityEvent).
  if (res.ok && res.data) await syncGekoppeldAgendaItem(res.data);
  return res;
}

/**
 * Houdt het agenda-item van een ingeplande activiteit (`calendar_events.activiteit_id`)
 * gelijk aan de activiteit — `syncLinkedActivityEvent` + `upsertActivityEvent`
 * van het dashboard. Alleen een bestaand item; nooit een nieuw. Best effort.
 */
async function syncGekoppeldAgendaItem(a: ActivityRow): Promise<void> {
  try {
    const { data: bestaand } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('activiteit_id', a.id)
      .maybeSingle();
    if (!bestaand) return;
    const { date, time } = splitsLokaal(a.due_at);
    const t = afspraakTijden(date, time, a.end_time ? String(a.end_time).slice(0, 5) : '');
    await supabase
      .from('calendar_events')
      .update({
        title: a.title || 'Activiteit',
        customer_id: a.customer_id || null,
        location: a.location || null,
        // Het dashboard geeft hier geen omschrijving mee en zet de notities leeg.
        notes: null,
        assigned_to: a.assigned_to || null,
        start_at: t.start_at,
        end_at: t.end_at,
      })
      .eq('id', (bestaand as { id: string }).id);
  } catch {
    // Synchroniseren is een extra; de activiteit zelf is opgeslagen.
  }
}

/**
 * Wie nieuw aan een activiteit is toegewezen, hoort het — `notifyNewAssignees`
 * (type `toewijzing_activiteit`) van het dashboard, met optioneel een mail. De
 * Edge Function `create-notification` zoekt het adres zelf op. Jezelf niet.
 */
export async function meldActiviteitToewijzing(o: {
  activiteitId: string;
  titel: string;
  datum: string | null;
  toegewezen: string[];
  vorige?: string[];
  maker: string | null;
  stuurMail: boolean;
}): Promise<void> {
  const vorig = new Set(o.vorige ?? []);
  const nieuw = [...new Set(o.toegewezen)].filter((id) => id && !vorig.has(id) && id !== o.maker);
  if (!nieuw.length) return;
  const datum = o.datum
    ? new Date(`${o.datum}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
    : null;
  try {
    await supabase.functions.invoke('create-notification', {
      body: {
        notifications: nieuw.map((uid) => ({
          user_id: uid,
          type: 'toewijzing_activiteit',
          title: `Je bent toegewezen aan ${o.titel}`,
          body: datum ? `Datum: ${datum}` : null,
          link: 'activities',
          related_type: 'activiteit',
          related_id: o.activiteitId,
          ...(o.stuurMail ? { email: true } : {}),
        })),
      },
    });
  } catch {
    // Een melding mag het opslaan nooit tegenhouden.
  }
}

/** Afronden en heropenen — `completeActivity`/`reopenActivity` uit het dashboard. */
export async function setActivityCompleted(
  id: string,
  completed: boolean,
): Promise<WriteResult<ActivityRow>> {
  return schrijf<ActivityRow>(
    () =>
      supabase.from('activities').update({ completed }).eq('id', id).select(ACTIVITY_COLUMNS),
    { context: 'activityService.setActivityCompleted', bedrijfReadonly: isReadonly() },
  );
}

export async function deleteActivity(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('activities').delete().eq('id', id).select('id'),
    {
      context: 'activityService.deleteActivity',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'niet-gevonden',
      leegMelding: 'Deze activiteit is al verwijderd of je hebt er geen rechten voor.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

/** Eén activiteit, voor het detail-/bewerkscherm. */
export async function getActivity(
  id: string,
): Promise<{ data: ActivityRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('activities')
    .select(ACTIVITY_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('[activityService.getActivity]', error.message);
    return { data: null, error: 'Activiteit kon niet worden geladen.' };
  }
  return { data: (data as unknown as ActivityRow | null) ?? null, error: null };
}

// ===========================================================================
// SCHRIJFACTIES — agenda-afspraken (calendar_events)
// ===========================================================================
//
// Overgenomen uit `calendarService.js` van het dashboard, inclusief twee
// details die anders stil misgaan:
//
//   herkomst    — 'zelf' voor een afspraak die rechtstreeks in de agenda wordt
//                 gemaakt. De planning-sync zet 'planning', en dáár hangt het
//                 bewerkrecht aan: een item met herkomst 'planning' mag alleen
//                 iemand met het recht `planning` wijzigen.
//   assigned_to — standaard de maker. Zonder dat valt de afspraak buiten je
//                 eigen SELECT-policy (die vraagt gedeelde werkruimte, het
//                 planning- of agenda_inzien-recht, óf dat je zelf toegewezen
//                 bent) en is hij meteen na het opslaan onvindbaar.

export type AfspraakInput = {
  title: string;
  /** YYYY-MM-DD in Nederlandse kalendertijd. */
  date: string;
  /** HH:mm; leeg = hele dag vanaf 09:00, net als het dashboard. */
  time?: string | null;
  /** HH:mm eindtijd; leeg = een uur na de begintijd, net als het dashboard. */
  end?: string | null;
  location?: string | null;
  notes?: string | null;
  customer_id?: string | null;
  /** Project/aanvraag waar de afspraak bij hoort. */
  deal_id?: string | null;
  /** `event` (Afspraak), `job` (Klus), `visit` (Opname) of `activity`. */
  type?: AfspraakType | null;
};

export const AFSPRAAK_TYPES = [
  { id: 'event', label: 'Afspraak' },
  { id: 'job', label: 'Klus' },
  { id: 'visit', label: 'Opname' },
  { id: 'activity', label: 'Activiteit' },
] as const;
export type AfspraakType = (typeof AFSPRAAK_TYPES)[number]['id'];

/**
 * Begin en eind van een afspraak — `buildEventTimes` van het dashboard: zonder
 * begintijd 09:00, zonder eindtijd een uur later.
 */
export function afspraakTijden(
  date: string,
  time?: string | null,
  end?: string | null,
): { start_at: string | null; end_at: string | null } {
  const start = buildDueAt(date, time ?? '');
  if (!start) return { start_at: null, end_at: null };
  const eind = end ? buildDueAt(date, end) : null;
  return { start_at: start, end_at: eind ?? new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString() };
}

function mapAfspraak(input: Partial<AfspraakInput>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (input.title !== undefined) p.title = input.title.trim();
  if (input.location !== undefined) p.location = input.location?.trim() || null;
  if (input.notes !== undefined) p.notes = input.notes?.trim() || null;
  if (input.customer_id !== undefined) p.customer_id = input.customer_id || null;
  if (input.deal_id !== undefined) p.deal_id = input.deal_id || null;
  if (input.type !== undefined) p.type = input.type || null;

  if (input.date !== undefined) {
    const t = afspraakTijden(input.date, input.time, input.end);
    p.start_at = t.start_at;
    p.end_at = t.end_at;
  }
  return p;
}

function valideerAfspraak(input: Partial<AfspraakInput>, nieuw: boolean): string | null {
  if ((nieuw || input.title !== undefined) && !input.title?.trim()) {
    return 'Geef de afspraak een titel.';
  }
  if (nieuw && !input.date) return 'Kies een datum.';
  if (input.date && !isGeldigeDatum(input.date)) {
    return 'Vul een geldige datum in (JJJJ-MM-DD).';
  }
  if (input.time && !isGeldigeTijd(input.time)) return 'Vul een geldige begintijd in (uu:mm).';
  if (input.end && !isGeldigeTijd(input.end)) return 'Vul een geldige eindtijd in (uu:mm).';
  if (input.time && input.end && input.end <= input.time) {
    return 'De eindtijd moet ná de begintijd liggen.';
  }
  return null;
}

export async function createAfspraak(
  input: AfspraakInput,
): Promise<WriteResult<CalendarEvent>> {
  const fout = valideerAfspraak(input, true);
  if (fout) return writeFout('validatie', fout);

  const basis = mapAfspraak(input);
  basis.herkomst = 'zelf';
  const eigen = getUserId();
  if (eigen) basis.assigned_to = eigen;

  const payload = withCompanyId(basis);
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  const res = await schrijf<CalendarEvent>(
    () => supabase.from('calendar_events').insert(payload).select(CALENDAR_COLUMNS),
    { context: 'activityService.createAfspraak', bedrijfReadonly: isReadonly() },
  );
  // Op de tijdlijn van de klant, zoals het dashboard (logTijdlijnSafe):
  // "Afspraak ingepland: Inmeten op 3 nov". Mislukt dat, dan blijft de afspraak staan.
  if (res.ok && res.data?.customer_id) {
    const startAt = res.data.start_at;
    const op = startAt
      ? ` op ${new Date(startAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' })}`
      : '';
    void logKlantTijdlijn(res.data.customer_id, 'afspraak_ingepland', `Afspraak ingepland: ${res.data.title ?? ''}${op}`, {
      title: res.data.title,
      startAt,
    });
  }
  return res;
}

/** Een regel op de tijdlijn van een klant (`klant_tijdlijn`), zoals `logTijdlijnSafe`. Faalt stil. */
async function logKlantTijdlijn(
  customerId: string,
  type: string,
  omschrijving: string,
  meta: Record<string, unknown> | null = null,
): Promise<void> {
  try {
    const payload = withCompanyId({
      customer_id: customerId,
      type,
      omschrijving,
      aangemaakt_op: new Date().toISOString(),
      ...(meta ? { meta } : {}),
      ...(getUserId() ? { created_by: getUserId() } : {}),
    });
    if (!payload) return;
    await supabase.from('klant_tijdlijn').insert(payload);
  } catch {
    // Stil: de tijdlijn is een extra, geen voorwaarde.
  }
}

export async function updateAfspraak(
  id: string,
  input: Partial<AfspraakInput>,
): Promise<WriteResult<CalendarEvent>> {
  const fout = valideerAfspraak(input, false);
  if (fout) return writeFout('validatie', fout);

  const updates = mapAfspraak(input);
  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

  return schrijf<CalendarEvent>(
    () =>
      supabase.from('calendar_events').update(updates).eq('id', id).select(CALENDAR_COLUMNS),
    {
      context: 'activityService.updateAfspraak',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding:
        'De afspraak is niet gewijzigd. Een ingeplande werkbon aanpassen vraagt het recht ' +
        'Planning; je eigen afspraken kun je altijd wijzigen.',
    },
  );
}

export async function deleteAfspraak(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('calendar_events').delete().eq('id', id).select('id'),
    {
      context: 'activityService.deleteAfspraak',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding:
        'De afspraak is niet verwijderd. Een ingeplande werkbon verwijderen vraagt het recht ' +
        'Planning.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ── Werkbon en notitielog bij een afspraak (CalendarEventDetailDrawer) ──────

/** `setCalendarEventWerkbon`: de afspraak aan een (net gemaakte) werkbon hangen. */
export async function koppelWerkbonAanAfspraak(id: string, werkbonId: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('calendar_events').update({ werkbon_id: werkbonId }).eq('id', id).select('id'),
    {
      context: 'activityService.koppelWerkbonAanAfspraak',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De werkbon is gemaakt, maar kon niet aan de afspraak worden gekoppeld.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

/** De werkbon en het notitielog van één afspraak, bij het openen. */
export async function getAfspraakExtra(
  id: string,
): Promise<{ werkbonId: string | null; notities: AfspraakNotitie[]; error: string | null }> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('werkbon_id, comments')
    .eq('id', id)
    .maybeSingle();
  if (error) return { werkbonId: null, notities: [], error: 'De notities konden niet worden geladen.' };
  const rij = data as { werkbon_id?: string | null; comments?: unknown } | null;
  return { werkbonId: rij?.werkbon_id ?? null, notities: leesAfspraakNotities(rij?.comments), error: null };
}

/**
 * Een notitie onderaan het log (`updateCalendarEventComments`). Eerst opnieuw
 * lezen: dan gaat een notitie van een collega die net ervoor plaatste niet
 * verloren (het dashboard schrijft zijn eigen lijst terug).
 */
export async function plaatsAfspraakNotitie(
  id: string,
  notitie: AfspraakNotitie,
): Promise<WriteResult<AfspraakNotitie[]>> {
  const huidig = await getAfspraakExtra(id);
  if (huidig.error) return writeFout('onbekend', huidig.error);
  const lijst = [...huidig.notities, notitie];
  const res = await schrijf<{ id: string }>(
    () => supabase.from('calendar_events').update({ comments: lijst }).eq('id', id).select('id'),
    {
      context: 'activityService.plaatsAfspraakNotitie',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De notitie is niet geplaatst: je mag deze afspraak niet wijzigen.',
    },
  );
  return res.ok ? { ok: true, data: lijst } : res;
}

// ── Notitielog van een activiteit (activiteit_notities) ────────────────────

export type ActiviteitNotitie = { id: string; note: string; created_at: string; auteur: string };

/** `getActiviteitNotities`: nieuwste eerst, met de naam van de schrijver. */
export async function listActiviteitNotities(
  activityId: string,
): Promise<{ data: ActiviteitNotitie[]; error: string | null }> {
  const { data, error } = await supabase
    .from('activiteit_notities')
    .select('id, note, created_at, profiles(full_name)')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: 'De notities van deze activiteit konden niet worden geladen.' };
  type Rij = { id: string; note: string | null; created_at: string; profiles: { full_name: string | null } | null };
  const rijen = (data ?? []) as unknown as Rij[];
  return {
    data: rijen.map((r) => ({ id: r.id, note: r.note ?? '', created_at: r.created_at, auteur: r.profiles?.full_name ?? '' })),
    error: null,
  };
}

/** `addActiviteitNotitie`: een losse regel in het log. */
export async function addActiviteitNotitie(activityId: string, html: string): Promise<WriteResult<{ id: string }>> {
  if (!html.trim()) return writeFout('validatie', 'Notitie mag niet leeg zijn');
  const userId = getUserId();
  const payload = withCompanyId({ activity_id: activityId, note: html, ...(userId ? { created_by: userId } : {}) });
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  return schrijf<{ id: string }>(() => supabase.from('activiteit_notities').insert(payload).select('id'), {
    context: 'activityService.addActiviteitNotitie',
    bedrijfReadonly: isReadonly(),
    leegSoort: 'geen-rechten',
    leegMelding: 'De notitie is niet opgeslagen.',
  });
}
