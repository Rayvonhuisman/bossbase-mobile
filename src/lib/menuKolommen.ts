/**
 * Menusecties over kolommen verdelen (iPad: twee onafhankelijke kolommen).
 *
 * Elke kolom krijgt een aaneengesloten deel van de lijst, in de oorspronkelijke
 * volgorde: kolom 1 = de eerste secties, kolom 2 = de rest. Zo blijft de lees-
 * en focusvolgorde logisch (eerst de hele linkerkolom, dan de rechter) en hoeft
 * er niets visueel herschikt te worden. De knip valt waar de hoogste kolom zo
 * laag mogelijk is. Lege secties horen er vóór het verdelen al uit.
 */
export function verdeelOverKolommen<T>(secties: readonly T[], gewicht: (s: T) => number, kolommen = 2): T[][] {
  if (kolommen <= 1 || secties.length <= 1) return [secties.slice()];
  if (kolommen !== 2) throw new Error('verdeelOverKolommen ondersteunt één of twee kolommen');
  const gewichten = secties.map(gewicht);
  const totaal = gewichten.reduce((a, b) => a + b, 0);
  let besteKnip = 1;
  let besteMax = Infinity;
  let links = 0;
  for (let knip = 1; knip < secties.length; knip++) {
    links += gewichten[knip - 1]!;
    const max = Math.max(links, totaal - links);
    if (max < besteMax) {
      besteMax = max;
      besteKnip = knip;
    }
  }
  return [secties.slice(0, besteKnip), secties.slice(besteKnip)];
}

/** Geschatte hoogte van een sectie: de kop telt als anderhalve regel. */
export const SECTIE_KOP_GEWICHT = 1.5;
export function sectieGewicht(aantalOnderdelen: number): number {
  return SECTIE_KOP_GEWICHT + aantalOnderdelen;
}
