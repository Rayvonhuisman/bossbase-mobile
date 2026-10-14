/**
 * Alleen de velden die echt veranderd zijn ten opzichte van wat er geladen is.
 *
 * Waarom: een formulier dat bij opslaan álle velden meestuurt, schrijft ook
 * velden weg die de gebruiker nooit heeft aangeraakt. De service zet lege
 * tekst om naar NULL, dus een ongewijzigd leeg veld (website `''`) werd dan
 * NULL — en een ander apparaat dat intussen een veld had aangepast, werd
 * stilletjes overschreven met de oude waarde van dit scherm.
 *
 * Puur en zonder imports, zodat het met `node --test` te toetsen is.
 */

type Opties<T> = {
  /**
   * Waarde vóór het vergelijken gelijktrekken (bijv. IBAN zonder spaties).
   * Standaard: tekst wordt getrimd; de rest blijft zoals hij is.
   */
  normaliseer?: (sleutel: keyof T, waarde: unknown) => unknown;
  /**
   * Velden die alleen samen kloppen (bijv. agenda start- en einduur): als
   * één ervan verandert, gaan ze allemaal mee, zodat de service ze samen kan
   * controleren.
   */
  samen?: (keyof T)[][];
};

const standaardNormaliseer = (_sleutel: unknown, waarde: unknown) =>
  typeof waarde === 'string' ? waarde.trim() : waarde;

/** Vergelijking die arrays als verzameling ziet (volgorde telt niet) en NaN gelijk aan NaN. */
export function zelfdeWaarde(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sorteer = (x: unknown[]) => x.map((v) => JSON.stringify(v)).sort();
    const sa = sorteer(a);
    const sb = sorteer(b);
    return sa.every((v, i) => v === sb[i]);
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || a === b;
  }
  if (a === null || a === undefined) return b === null || b === undefined;
  return a === b;
}

export function gewijzigdeVelden<T extends Record<string, unknown>>(
  origineel: T,
  huidig: T,
  opties: Opties<T> = {},
): Partial<T> {
  const normaliseer = opties.normaliseer ?? standaardNormaliseer;
  const uit: Partial<T> = {};
  for (const sleutel of Object.keys(huidig) as (keyof T)[]) {
    if (!zelfdeWaarde(normaliseer(sleutel, origineel[sleutel]), normaliseer(sleutel, huidig[sleutel]))) {
      uit[sleutel] = huidig[sleutel];
    }
  }
  for (const groep of opties.samen ?? []) {
    if (groep.some((s) => s in uit)) {
      for (const s of groep) uit[s] = huidig[s];
    }
  }
  return uit;
}

export const isLeeg = (wijzigingen: object) => Object.keys(wijzigingen).length === 0;
