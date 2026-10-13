import { supabase } from '@/lib/supabase';
import { buildDueAt, isGeldigeDatum, isGeldigeTijd } from '@/lib/nlTijd';
import { getUserId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import { listWorkOrdersForPlanningRange } from './workOrderService';
import { toLocalISODate } from '@/lib/dateRange';
import { haalInStukken } from '@/lib/inStukken';
import type { WorkOrderWithCustomer } from '@/types/domain';

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
  id, company_id, customer_id, deal_id, assigned_to, title, type, notes,
  due_at, completed, created_at,
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

/** Activities met `due_at` binnen range, niet voltooid eerst. */
export async function listActivitiesForRange(
  fromISO: string,
  toISO: string,
): Promise<{ data: ActivityRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('activities')
    .select(ACTIVITY_COLUMNS)
    .gte('due_at', fromISO)
    .lte('due_at', toISO)
    .order('due_at', { ascending: true });

  if (error) {
    console.warn('[activityService.listActivitiesForRange]', error.message);
    return { data: [], error: 'Activiteiten konden niet worden geladen.' };
  }
  return { data: (data as unknown as ActivityRow[]) ?? [], error: null };
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
 * primair toegewezen óf in `assigned_to_ids`, net als het Persoonlijk-filter
 * van het dashboard (`myActivities`).
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
      .or(`assigned_to.eq.${userId},assigned_to_ids.cs.{${userId}}`)
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

export type PlanningRangeParams = {
  /** UTC instants for the timestamptz columns (calendar_events, activities). */
  startISO: string;
  endISO: string;
  /** Local YYYY-MM-DD for the date column (werkbonnen.gepland_op). */
  startDate: string;
  endDate: string;
  /** Restrict werkbonnen to one assignee (medewerker view). */
  assignedToUserId?: string | null;
  /** Current user — used to label self-assigned work orders. */
  currentUserId?: string | null;
  currentUserName?: string | null;
};

export type PlanningResult = {
  items: PlanningItem[];
  /** Per-source soft failures (dev/diagnostic) when other sources still loaded. */
  partialErrors: string[];
  /** Hard error: every source failed → show user-facing error + retry. */
  error: string | null;
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: 'Telefoon',
  email: 'E-mail',
  meeting: 'Afspraak',
  task: 'Taak',
  note: 'Notitie',
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

function fromActivity(a: ActivityRow): PlanningItem {
  return {
    id: `activity-${a.id}`,
    source: 'activity',
    number: null,
    title: a.title ?? ACTIVITY_TYPE_LABELS[a.type ?? ''] ?? 'Activiteit',
    customerName: a.customer?.name ?? null,
    customerId: a.customer_id,
    description: a.notes,
    address: joinAddress(a.customer),
    phone: a.customer?.phone ?? null,
    startAt: a.due_at,
    endAt: null,
    date: a.due_at ? toLocalISODate(new Date(a.due_at)) : '',
    status: a.completed ? 'completed' : 'gepland',
    assigneeName: null,
    assigneeId: null,
    workOrderId: null,
    typeLabel: (a.type && ACTIVITY_TYPE_LABELS[a.type]) || 'Activiteit',
  };
}

function fromWorkOrder(
  w: WorkOrderWithCustomer,
  currentUserId?: string | null,
  currentUserName?: string | null,
): PlanningItem {
  // Assignment lives in assigned_to_ids; the legacy assigned_to column is only
  // a fallback for rows the dashboard has not rewritten.
  const assignees = w.assigned_to_ids?.length
    ? w.assigned_to_ids
    : w.assigned_to
      ? [w.assigned_to]
      : [];
  const assigneeName =
    currentUserId && assignees.includes(currentUserId)
      ? currentUserName?.trim() || 'Jij'
      : null;
  return {
    id: `wo-${w.id}`,
    source: 'work_order',
    number: w.nummer ?? null,
    title: w.titel || 'Werkbon',
    customerName: w.customer?.name ?? null,
    customerId: w.customer_id,
    description: w.omschrijving,
    address: w.locatie ?? joinAddress(w.customer),
    phone: w.customer?.phone ?? null,
    startAt: combineDateTime(w.gepland_op, w.starttijd),
    endAt: combineDateTime(w.gepland_op, w.eindtijd),
    date: w.gepland_op ?? '',
    status: w.status ?? null,
    assigneeName,
    assigneeId: assignees[0] ?? null,
    workOrderId: w.id,
    typeLabel: 'Werkbon',
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
 * Combined planning items for a range across all three real backend sources.
 *
 * Resilient: if one source fails (missing column/table/RLS), its rows are
 * dropped, the failure is recorded in `partialErrors`, and the other sources
 * still render. A hard error is only returned when ALL sources fail.
 *
 * RLS scopes every query to the caller's company. No service-role, no client
 * company_id filter. `assignedToUserId` narrows werkbonnen for the medewerker
 * view (calendar_events/activities have no per-user assignment, so RLS — which
 * is company-wide for those — governs visibility).
 */
export async function listPlanningItemsForRange(
  params: PlanningRangeParams,
): Promise<PlanningResult> {
  const { startISO, endISO, startDate, endDate, assignedToUserId, currentUserId, currentUserName } =
    params;

  const [evRes, actRes, woRes] = await Promise.all([
    listCalendarEventsForRange(startISO, endISO),
    listActivitiesForRange(startISO, endISO),
    listWorkOrdersForPlanningRange(startDate, endDate, { assignedToUserId }),
  ]);

  const items: PlanningItem[] = [];
  const partialErrors: string[] = [];

  if (evRes.error) partialErrors.push(`calendar_events: ${evRes.error}`);
  else items.push(...evRes.data.map(fromEvent));

  if (actRes.error) partialErrors.push(`activities: ${actRes.error}`);
  else items.push(...actRes.data.map(fromActivity));

  if (woRes.error) partialErrors.push(`werkbonnen: ${woRes.error}`);
  else items.push(...woRes.data.map((w) => fromWorkOrder(w, currentUserId, currentUserName)));

  items.sort((a, b) => sortMs(a) - sortMs(b));

  const allFailed = !!evRes.error && !!actRes.error && !!woRes.error;

  if (__DEV__) {
    console.log('[activityService.listPlanningItemsForRange]', {
      range: { startISO, endISO, startDate, endDate },
      counts: {
        events: evRes.error ? 'ERR' : evRes.data.length,
        activities: actRes.error ? 'ERR' : actRes.data.length,
        werkbonnen: woRes.error ? 'ERR' : woRes.data.length,
        total: items.length,
      },
      partialErrors,
    });
  }

  return {
    items,
    partialErrors,
    error: allFailed ? 'Planning kon niet worden geladen.' : null,
  };
}

/**
 * Next upcoming planning item from now (across all sources), within a forward
 * window. Returns null when nothing is scheduled. Used by the "volgende
 * afspraak" affordance.
 */
export async function getNextPlanningItem(params?: {
  assignedToUserId?: string | null;
  currentUserId?: string | null;
  currentUserName?: string | null;
  /** Forward window in days (default 60). */
  windowDays?: number;
}): Promise<{ item: PlanningItem | null; error: string | null }> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + (params?.windowDays ?? 60));

  const result = await listPlanningItemsForRange({
    startISO: now.toISOString(),
    endISO: end.toISOString(),
    startDate: toLocalISODate(now),
    endDate: toLocalISODate(end),
    assignedToUserId: params?.assignedToUserId ?? null,
    currentUserId: params?.currentUserId ?? null,
    currentUserName: params?.currentUserName ?? null,
  });

  const nowMs = now.getTime();
  const upcoming = result.items.find((i) => {
    if (!i.startAt) return false;
    const ms = new Date(i.startAt).getTime();
    return !Number.isNaN(ms) && ms >= nowMs;
  });

  return { item: upcoming ?? null, error: result.error };
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

  return schrijf<ActivityRow>(
    () => supabase.from('activities').update(updates).eq('id', id).select(ACTIVITY_COLUMNS),
    { context: 'activityService.updateActivity', bedrijfReadonly: isReadonly() },
  );
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
  /** HH:mm eindtijd; leeg = geen eindtijd. */
  end?: string | null;
  location?: string | null;
  notes?: string | null;
  customer_id?: string | null;
};

function mapAfspraak(input: Partial<AfspraakInput>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (input.title !== undefined) p.title = input.title.trim();
  if (input.location !== undefined) p.location = input.location?.trim() || null;
  if (input.notes !== undefined) p.notes = input.notes?.trim() || null;
  if (input.customer_id !== undefined) p.customer_id = input.customer_id || null;

  if (input.date !== undefined) {
    p.start_at = buildDueAt(input.date, input.time ?? '');
    // Eindtijd hoort bij dezelfde dag; leeg laten mag.
    p.end_at = input.end ? buildDueAt(input.date, input.end) : null;
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

  return schrijf<CalendarEvent>(
    () => supabase.from('calendar_events').insert(payload).select(CALENDAR_COLUMNS),
    { context: 'activityService.createAfspraak', bedrijfReadonly: isReadonly() },
  );
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
