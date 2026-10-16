/**
 * Regels voor het onthouden van filters en tabbladen per gebruiker (zie
 * `useOnthouden`). Geen imports, zodat dit in de Node-tests draait.
 *
 * Een bewaarde waarde telt alleen als hij nog een geldige keuze is: een filter
 * dat niet meer bestaat, of waarvoor je het recht kwijt bent, valt terug op de
 * standaard in plaats van een lege lijst te tonen.
 */

export type Toegestaan<T> = readonly T[] | ((v: unknown) => boolean);

/** Per gebruiker en per scherm; `bb.filters.<gebruiker>.<naam>`. */
export function filterSleutel(gebruikerId: string, naam: string): string {
  return `bb.filters.${gebruikerId}.${naam}`;
}

export function isToegestaan<T>(waarde: unknown, toegestaan?: Toegestaan<T>): waarde is T {
  if (waarde === undefined) return false;
  if (!toegestaan) return true;
  if (typeof toegestaan === 'function') return toegestaan(waarde);
  return (toegestaan as readonly unknown[]).includes(waarde);
}

/** De bewaarde tekst terug naar een waarde; onzin of iets ongeldigs → null. */
export function leesBewaard<T>(ruw: string | null | undefined, toegestaan?: Toegestaan<T>): T | null {
  if (ruw == null) return null;
  try {
    const waarde: unknown = JSON.parse(ruw);
    return isToegestaan<T>(waarde, toegestaan) ? waarde : null;
  } catch {
    return null;
  }
}
