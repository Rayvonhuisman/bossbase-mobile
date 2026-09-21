/**
 * Datums en tijden tussen de app en de database, zonder tijdzonevallen.
 *
 * De database bewaart een werkdag als `date` (`YYYY-MM-DD`) en een tijd als
 * `time` (`HH:MM`). Dat zijn kalenderwaarden zonder tijdzone: "12 september" is
 * 12 september, waar de monteur ook staat.
 *
 * De valkuil zit in de omweg via een `Date`-object. `new Date('2026-09-12')`
 * leest die tekst als **UTC middernacht**; in Nederland (UTC+2) is dat 11
 * september 22:00 lokale tijd, en `toISOString().slice(0,10)` op een lokaal
 * gekozen dag kan er net zo goed een dag naast zitten. Zo schuift een geboekte
 * dag een dag op — precies het soort fout dat pas opvalt als de urenstaat niet
 * klopt.
 *
 * Daarom: parsen en formatteren gebeurt hier, altijd met de lokale
 * componenten (`getFullYear`, `getMonth`, `getDate`) en nooit via `toISOString`.
 */

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIJD = /^\d{2}:\d{2}(:\d{2})?$/;

const NL_LANG = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function isGeldigeISODatum(waarde: string | null | undefined): boolean {
  if (!waarde || !ISO_DATUM.test(waarde)) return false;
  const d = parseISODatum(waarde);
  return d !== null && isoVanDatum(d) === waarde;
}

export function isGeldigeISOTijd(waarde: string | null | undefined): boolean {
  if (!waarde) return false;
  if (!ISO_TIJD.test(waarde)) return false;
  const [u, m] = waarde.split(':').map(Number);
  return u! >= 0 && u! < 24 && m! >= 0 && m! < 60;
}

/** `YYYY-MM-DD` → lokale Date op middernacht. Ongeldig → null. */
export function parseISODatum(waarde: string | null | undefined): Date | null {
  if (!waarde || !ISO_DATUM.test(waarde)) return null;
  const [jaar, maand, dag] = waarde.split('-').map(Number);
  const d = new Date(jaar!, maand! - 1, dag!, 12, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  // 31 februari bestaat niet; de Date rolt dan door naar maart. Dat is geen
  // geldige invoer, dus laat het vallen in plaats van stilletjes te verschuiven.
  if (d.getFullYear() !== jaar || d.getMonth() !== maand! - 1 || d.getDate() !== dag) return null;
  return d;
}

/** Lokale Date → `YYYY-MM-DD`, met de lokale kalenderdag. */
export function isoVanDatum(d: Date): string {
  const jaar = d.getFullYear();
  const maand = String(d.getMonth() + 1).padStart(2, '0');
  const dag = String(d.getDate()).padStart(2, '0');
  return `${jaar}-${maand}-${dag}`;
}

/** Lokale Date → `HH:MM`. */
export function tijdVanDatum(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** `HH:MM` → Date op vandaag met die tijd (alleen voor de kiezer). */
export function parseISOTijd(waarde: string | null | undefined): Date | null {
  if (!isGeldigeISOTijd(waarde)) return null;
  const [u, m] = waarde!.split(':').map(Number);
  const d = new Date();
  d.setHours(u!, m!, 0, 0);
  return d;
}

/** `2026-09-12` → `12 september 2026`. Lege of ongeldige invoer → null. */
export function nlDatum(waarde: string | null | undefined): string | null {
  const d = parseISODatum(waarde);
  return d ? NL_LANG.format(d) : null;
}

/** Vandaag als `YYYY-MM-DD`, in de lokale tijdzone. */
export function vandaagISO(): string {
  return isoVanDatum(new Date());
}

/** Minuten sinds middernacht, voor het vergelijken van twee `HH:MM`-waarden. */
export function minutenVanTijd(waarde: string): number {
  const [u, m] = waarde.split(':').map(Number);
  return (u ?? 0) * 60 + (m ?? 0);
}
