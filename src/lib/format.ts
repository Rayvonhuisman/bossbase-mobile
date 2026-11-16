import { tx, locale } from '@/i18n';

/**
 * Formatters per locale gecachet: de opmaak volgt de taal van de app (locale()),
 * maar er wordt niet bij elke aanroep een nieuwe Intl-formatter gemaakt.
 */
function perLocale<T>(maak: (loc: string) => T): () => T {
  let loc = '';
  let fmt: T | null = null;
  return () => {
    const nu = locale();
    if (fmt === null || nu !== loc) {
      loc = nu;
      fmt = maak(nu);
    }
    return fmt;
  };
}

const NL_DATE_FMT = perLocale(loc => new Intl.DateTimeFormat(loc, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}));

const NL_DATE_LONG_FMT = perLocale(loc => new Intl.DateTimeFormat(loc, {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
}));

export function formatDateNL(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return NL_DATE_FMT().format(d);
}

export function formatDateLongNL(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return NL_DATE_LONG_FMT().format(d);
}

export function formatTimeNL(value: string | null | undefined): string {
  if (!value) return '';
  // Postgres TIME comes back as 'HH:MM:SS'. Keep first 5 chars.
  return value.slice(0, 5);
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const NL_TIME_FMT = perLocale(loc => new Intl.DateTimeFormat(loc, {
  hour: '2-digit',
  minute: '2-digit',
}));

const NL_PLANNING_DATE_FMT = perLocale(loc => new Intl.DateTimeFormat(loc, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
}));

/**
 * Planning date header, e.g. "maandag 2 juni". Accepts a Date or ISO string.
 * Capitalised for use as a heading.
 */
export function formatPlanningDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '—';
  const s = NL_PLANNING_DATE_FMT().format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Planning time from an ISO instant, e.g. "08:30". Empty string for null so
 * callers can omit it cleanly. Falls back to the first 5 chars of a bare
 * `HH:MM:SS` time string (werkbonnen.starttijd) when not a full timestamp.
 */
export function formatPlanningTime(value: string | null | undefined): string {
  if (!value) return '';
  // Bare Postgres TIME like "08:30:00" — keep HH:MM.
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return NL_TIME_FMT().format(d);
}

const NL_EUR_FMT = perLocale(loc => new Intl.NumberFormat(loc, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
}));

const NL_EUR_CENT_FMT = perLocale(loc => new Intl.NumberFormat(loc, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}));

/** Euro's met centen, zoals `fmt` in het dashboard: 2480.5 → "€ 2.480,50". Null/NaN → "—". */
export function formatEURCent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return NL_EUR_CENT_FMT().format(value);
}

/** Format a number as euros, e.g. 2480 → "€ 2.480". Null/NaN → "—". */
export function formatEUR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return NL_EUR_FMT().format(value);
}

export function formatHours(hours: number): string {
  if (Number.isNaN(hours)) return tx('{uren} u', { uren: 0 });
  if (Number.isInteger(hours)) return tx('{uren} u', { uren: hours });
  const uren = new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(hours);
  return tx('{uren} u', { uren });
}

const NL_KORT_DATUM = perLocale(loc => new Intl.DateTimeFormat(loc, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
}));

/**
 * Korte dagaanduiding zoals het ontwerp die overal gebruikt: "Vandaag",
 * "Morgen", "Gisteren", en anders "do 10 sep".
 *
 * Eén helper, want deze regel stond in drie schermen in drie varianten — en
 * een lijst waarin de ene rij "vandaag" zegt en de andere "11 sep" leest als
 * twee verschillende soorten informatie.
 */
export function formatDagLabel(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '—';
  const dag = new Date(d);
  dag.setHours(0, 0, 0, 0);
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  const verschil = Math.round((dag.getTime() - vandaag.getTime()) / 86400000);
  if (verschil === 0) return tx('Vandaag');
  if (verschil === 1) return tx('Morgen');
  if (verschil === -1) return tx('Gisteren');
  return NL_KORT_DATUM().format(d).replace(/\.$/, '');
}
