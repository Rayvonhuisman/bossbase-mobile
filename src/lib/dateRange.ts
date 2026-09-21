/**
 * Local-timezone-safe date range helpers for Planning.
 *
 * Two flavours of bounds are returned because the planning tables store time
 * differently:
 *  - `calendar_events.start_at` / `activities.due_at` are `timestamptz` →
 *    compare with absolute UTC instants (`startISO` / `endISO`).
 *  - `werkbonnen.gepland_op` is a `date` → compare with local calendar dates
 *    (`startDate` / `endDate`, `YYYY-MM-DD`).
 *
 * All boundaries are computed in the device's LOCAL timezone so "vandaag"
 * matches what the user sees, then converted to UTC instants for the
 * timestamptz columns. This avoids the classic bug where `toISOString()` on a
 * naive date shifts the day.
 */

export type RangeBounds = {
  /** Inclusive local start (00:00:00.000 of first day). */
  start: Date;
  /** Inclusive local end (23:59:59.999 of last day). */
  end: Date;
  /** UTC instant of `start` — for timestamptz columns. */
  startISO: string;
  /** UTC instant of `end` — for timestamptz columns. */
  endISO: string;
  /** Local calendar date of `start`, YYYY-MM-DD — for `date` columns. */
  startDate: string;
  /** Local calendar date of `end`, YYYY-MM-DD — for `date` columns. */
  endDate: string;
};

/** Local YYYY-MM-DD for a Date (no UTC shift). */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function bounds(start: Date, end: Date): RangeBounds {
  return {
    start,
    end,
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    startDate: toLocalISODate(start),
    endDate: toLocalISODate(end),
  };
}

/** Monday as the first day of the week (NL convention). */
export function startOfWeek(d: Date): Date {
  const x = startOfLocalDay(d);
  const day = x.getDay(); // 0 = Sun … 6 = Sat
  const diff = (day + 6) % 7; // Mon → 0
  x.setDate(x.getDate() - diff);
  return x;
}

export function getDayRange(date: Date): RangeBounds {
  return bounds(startOfLocalDay(date), endOfLocalDay(date));
}

export function getWeekRange(date: Date): RangeBounds {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return bounds(start, endOfLocalDay(end));
}

export function getMonthRange(date: Date): RangeBounds {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0); // last day
  return bounds(startOfLocalDay(start), endOfLocalDay(end));
}

/** Each day (Date at local midnight) of the week containing `date`, Mon→Sun. */
export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/**
 * Calendar grid for the month containing `date`: full weeks (Mon→Sun) covering
 * the month, so the grid always has whole rows. Days outside the month are
 * included (caller can dim them via `isSameMonth`).
 */
export function monthGridDays(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const gridEnd = startOfWeek(last);
  gridEnd.setDate(gridEnd.getDate() + 6);
  const out: Date[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

/** ISO week number (1–53). */
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Group items by their local calendar date (`YYYY-MM-DD`). `getDate` extracts
 * the grouping key from an item. Returns a Map preserving insertion order of
 * first occurrence; callers usually feed an already-sorted list.
 */
export function groupItemsByDay<T>(
  items: T[],
  getDate: (item: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getDate(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
