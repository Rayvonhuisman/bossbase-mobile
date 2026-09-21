/**
 * Datum en tijd in Nederlandse wandkloektijd — de mobiele tegenhanger van
 * `src/lib/datumTijd.js` in het dashboard, met dezelfde regels.
 *
 * Waarom niet gewoon de apparaattijdzone? Omdat een `due_at` die mobiel wordt
 * weggeschreven op kantoor weer moet worden ingelezen. Het dashboard pint op
 * Europe/Amsterdam; doet de app dat niet, dan schuift een afspraak van 09:00 die
 * in Spanje is ingevoerd op het dashboard naar 08:00. Voor het lézen van
 * planningsranges gebruikt de app bewust wél de apparaattijdzone (zie
 * dateRange.ts) — dat gaat over "welke dag zie ik", niet over wat er in de
 * database komt te staan.
 *
 * Intl regelt zomer- en wintertijd; er staan hier geen vaste offsets.
 */

export const TZ = 'Europe/Amsterdam';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

type Wandkloek = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** De wijzerplaat in Amsterdam op dit moment, als losse getallen. */
function wandkloek(instant: Date): Wandkloek {
  const p: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    // 24 komt voor bij middernacht in sommige runtimes; normaliseren naar 0.
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Hoeveel ms loopt Amsterdam voor op UTC, op dat moment? */
function offsetMs(instant: Date): number {
  const w = wandkloek(instant);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - instant.getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD zoals die dag in Nederland heet. */
export function lokaleDatum(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const w = wandkloek(d);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** HH:mm zoals de klok in Nederland wijst. */
export function lokaleTijd(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const w = wandkloek(d);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** `{ date, time }` in één keer, uit een timestamptz. */
export function splitsLokaal(value: string | Date | null | undefined): {
  date: string;
  time: string;
} {
  if (!value) return { date: '', time: '' };
  return { date: lokaleDatum(value), time: lokaleTijd(value) };
}

/** Vandaag in Nederland, YYYY-MM-DD. */
export function vandaagIso(): string {
  return lokaleDatum(new Date());
}

/**
 * Nederlandse datum+tijd → het bijbehorende UTC-moment.
 * "2026-07-28" + "09:00" → 2026-07-28T07:00:00.000Z (zomertijd)
 * "2026-01-28" + "09:00" → 2026-01-28T08:00:00.000Z (wintertijd)
 */
export function lokaalNaarUtc(dateStr: string, timeStr = '00:00'): Date | null {
  if (!dateStr) return null;
  const dDelen = String(dateStr).slice(0, 10).split('-').map(Number);
  const tDelen = String(timeStr || '00:00').slice(0, 5).split(':').map(Number);
  const y = dDelen[0] ?? 0;
  const m = dDelen[1] ?? 0;
  const d = dDelen[2] ?? 0;
  const hh = tDelen[0] ?? 0;
  const mm = tDelen[1] ?? 0;
  if (!y || !m || !d) return null;

  const alsofUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  // Eerste schatting met de offset op dat moment, daarna één correctieronde die
  // de DST-overgang afvangt (offset vóór en ná het moment verschilt daar).
  let ts = alsofUtc - offsetMs(new Date(alsofUtc));
  ts = alsofUtc - offsetMs(new Date(ts));
  return new Date(ts);
}

/**
 * `due_at` opbouwen uit een los datum- en tijdveld — letterlijk `buildDueAt`
 * uit het dashboard, inclusief de standaardtijd 09:00.
 */
export function buildDueAt(date: string | null | undefined, time = ''): string | null {
  if (!date) return null;
  const d = lokaalNaarUtc(date, time || '09:00');
  return d ? d.toISOString() : null;
}

/** Is dit een geldige YYYY-MM-DD? Voor formuliervalidatie. */
export function isGeldigeDatum(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const delen = value.split('-').map(Number);
  const y = delen[0] ?? 0;
  const m = delen[1] ?? 0;
  const d = delen[2] ?? 0;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Is dit een geldige HH:mm? Leeg telt als geldig (tijd is optioneel). */
export function isGeldigeTijd(value: string): boolean {
  if (!value) return true;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return false;
  return Number(m[1] ?? -1) <= 23 && Number(m[2] ?? -1) <= 59;
}
