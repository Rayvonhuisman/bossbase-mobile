/**
 * De interne calculatie van een offerte: per regel de begrote uren en de
 * kostprijs (materiaal en inkoop) per eenheid, en voor de hele offerte de
 * kostprijs per uur. De klant ziet hier niets van.
 *
 * Letterlijk naar `src/lib/offerteCalculatie.js` van het dashboard, en daarmee
 * dezelfde rekenregel als de database (`bb_regel_begrote_uren` en
 * `bb_project_begroting`, migratie 20261107143517):
 *   - een urenregel: de hoeveelheid zíjn de uren, geen materiaal;
 *   - een km-regel: geen uren en geen kostprijs;
 *   - elke andere regel: uren per eenheid × hoeveelheid, en kostprijs per
 *     eenheid × hoeveelheid.
 * Arbeid = alle uren × de kostprijs per uur van deze offerte.
 *
 * Marge is het resultaat als deel van de verkoopprijs, géén opslag: 25% marge
 * op € 75 kostprijs is € 100 (niet € 93,75).
 *
 * Puur (geen React, geen database): tests/offerteCalculatie.test.mjs.
 */
import { leesGetalNl } from './getalNl';
import { regelprijs, type Regel } from './regels';

type CalcRegel = Pick<Regel, 'type' | 'aantal' | 'prijs' | 'omschrijving' | 'herkomst' | 'calc'> & { id?: string };

const leeg = (v: unknown) => v === '' || v == null;
/** Nederlandse invoer ("1.234,50", "0,25"); onleesbaar telt als leeg. */
export function getalUit(v: string | number | null | undefined): number | null {
  if (leeg(v)) return null;
  const n = leesGetalNl(v);
  return n != null && Number.isFinite(n) ? n : null;
}
const rond = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export const heeftGeenCalculatie = (r: Pick<Regel, 'type'>) => r.type === 'km';
export const isUrenRegel = (r: Pick<Regel, 'type'>) => r.type === 'uren';
// Zelfde als isLegeRegel in lib/boss/offerteRegels.
const isLeeg = (r: CalcRegel) => !String(r?.omschrijving || '').trim() && !r?.herkomst;

/** Begrote uren van één regel. */
export function regelUren(r: CalcRegel): number {
  const aantal = getalUit(r.aantal) || 0;
  if (isUrenRegel(r)) return aantal;
  if (heeftGeenCalculatie(r)) return 0;
  return (getalUit(r.calc?.urenPer) || 0) * aantal;
}

/** Kostprijs materiaal en inkoop van één regel. */
export function regelMateriaal(r: CalcRegel): number {
  if (isUrenRegel(r) || heeftGeenCalculatie(r)) return 0;
  return (getalUit(r.calc?.kostprijsPer) || 0) * (getalUit(r.aantal) || 0);
}

/** Heeft deze regel een calculatie nodig maar nog niet? */
export const mistCalculatie = (r: CalcRegel) =>
  !isUrenRegel(r) &&
  !heeftGeenCalculatie(r) &&
  !isLeeg(r) &&
  getalUit(r.calc?.urenPer) == null &&
  getalUit(r.calc?.kostprijsPer) == null;

// ── Toeslagen en bijkomende kosten (per offerte) ─────────────────────────────
// Zoals in het dashboard (src/lib/offerteCalculatie.js) en de database
// (bb_offerte_toeslag, migratie 20261127150000): toezicht, aan- en afvoer en
// de- en montage in uren, klimtijd als % op de directe uren, kleinmateriaal als
// % op het materiaal, overige kosten als bedrag. Winst op materiaal telt alleen
// in de adviesprijs. In de app worden ze getoond, niet gewijzigd.
export type Toeslagen = {
  toezichtUren: number | null;
  aanvoerUren: number | null;
  montageUren: number | null;
  klimtijdPct: number | null;
  kleinmateriaalPct: number | null;
  overigeKosten: number | null;
  winstMateriaalPct: number | null;
};
export const heeftToeslagen = (t: Toeslagen | null | undefined) =>
  Boolean(t) && Object.values(t as Toeslagen).some((v) => (v ?? 0) > 0);

/** Toeslag in uren en in materiaal (kosten) bij deze directe uren en dit materiaal. */
export function berekenToeslagen(t: Toeslagen | null | undefined, directeUren: number, materiaal: number) {
  const g = (k: keyof Toeslagen) => t?.[k] ?? 0;
  return {
    uren: g('toezichtUren') + g('aanvoerUren') + g('montageUren') + (directeUren || 0) * g('klimtijdPct') / 100,
    materiaal: (materiaal || 0) * g('kleinmateriaalPct') / 100 + g('overigeKosten'),
  };
}

export type Calculatie = {
  uren: number;
  directeUren: number;
  toeslagUren: number;
  toeslagMateriaal: number;
  /** Kostprijs zonder toeslagen: de basis om de adviesprijs over de regels te verdelen. */
  kostprijsDirect: number;
  /** Winst op materiaal (alleen in de adviesprijs). */
  winstMateriaal: number;
  kostprijsPerUur: number | null;
  arbeid: number;
  materiaal: number;
  kostprijs: number;
  verkoop: number;
  resultaat: number;
  /** Resultaat als % van de verkoopprijs; null zonder verkoop. */
  marge: number | null;
  zonderKostprijsPerUur: boolean;
  regelsZonderCalculatie: number;
};

/**
 * Alle regels, ook lege: die worden opgeslagen (met de standaardomschrijving)
 * en tellen dan in de database mee. Zo laat het formulier hetzelfde getal zien.
 */
export function berekenCalculatie(
  regels: CalcRegel[],
  kostprijsPerUur: string | number | null | undefined,
  toeslagen: Toeslagen | null = null,
): Calculatie {
  const kpu = getalUit(kostprijsPerUur);
  const directeUren = regels.reduce((s, r) => s + regelUren(r), 0);
  const directMateriaal = regels.reduce((s, r) => s + regelMateriaal(r), 0);
  const t = berekenToeslagen(toeslagen, directeUren, directMateriaal);
  const uren = directeUren + t.uren;
  const materiaal = rond(directMateriaal + t.materiaal);
  const arbeid = kpu == null ? 0 : rond(uren * kpu);
  const kostprijsDirect = rond((kpu == null ? 0 : directeUren * kpu) + directMateriaal);
  const winstMateriaal = rond(
    ((directMateriaal + (directMateriaal * (toeslagen?.kleinmateriaalPct ?? 0)) / 100) * (toeslagen?.winstMateriaalPct ?? 0)) / 100,
  );
  const kostprijs = rond(arbeid + materiaal);
  const verkoop = rond(regels.reduce((s, r) => s + regelprijs(r as Regel), 0));
  const resultaat = rond(verkoop - kostprijs);
  return {
    uren: Math.round(uren * 100) / 100,
    directeUren: Math.round(directeUren * 100) / 100,
    toeslagUren: Math.round(t.uren * 100) / 100,
    toeslagMateriaal: rond(t.materiaal),
    kostprijsDirect,
    winstMateriaal,
    kostprijsPerUur: kpu,
    arbeid,
    materiaal,
    kostprijs,
    verkoop,
    resultaat,
    marge: verkoop > 0 ? Math.round((resultaat / verkoop) * 1000) / 10 : null,
    zonderKostprijsPerUur: kpu == null && uren > 0,
    regelsZonderCalculatie: regels.filter(mistCalculatie).length,
  };
}

export type CalculatieOpslagRegel = { id: string; uren_per: number | null; kostprijs_per: number | null };

/**
 * Wat `bb_offerte_calculatie_opslaan` krijgt; `idVan` vertaalt een regel-id
 * (nieuwe versie). Een regel zonder calc-object is niet aangeraakt: niet
 * meesturen, anders wist het wat de database invulde (materiaal of
 * eenheidsprijs, `bb_offerte_item_calculatie_nieuw`). Uren- en km-regels gaan
 * wel mee, leeg: zo verdwijnt een oude calculatie als het type veranderde.
 */
export function calculatieVoorOpslag(regels: CalcRegel[], idVan: (id: string) => string = (id) => id): CalculatieOpslagRegel[] {
  return regels
    .filter((r) => r.id && (r.calc !== undefined || isUrenRegel(r) || heeftGeenCalculatie(r)))
    .map((r) => {
      const telt = !isUrenRegel(r) && !heeftGeenCalculatie(r);
      return {
        id: idVan(r.id!),
        uren_per: telt ? getalUit(r.calc?.urenPer) : null,
        kostprijs_per: telt ? getalUit(r.calc?.kostprijsPer) : null,
      };
    });
}

export type WinstMethode = 'marge' | 'opslag';

/**
 * Wat je moet vragen voor een gewenste winst, zoals het dashboard:
 *   - 'marge' (standaard): deel van de verkoopprijs. 25% op € 75 = € 100.
 *   - 'opslag': bovenop de kostprijs. 25% op € 75 = € 93,75.
 * Null zonder kostprijs of buiten het bereik (marge 0–95%, opslag 0–500%).
 */
export function adviesPrijs(
  kostprijs: number | null | undefined,
  pct: string | number | null | undefined,
  methode: WinstMethode = 'marge',
): number | null {
  const k = Number(kostprijs);
  const m = getalUit(pct);
  if (!(k > 0) || m == null || m < 0) return null;
  if (methode === 'opslag') return m > 500 ? null : rond(k * (1 + m / 100));
  if (m > 95) return null;
  return rond(k / (1 - m / 100));
}
export function winstPctGeldig(pct: string | number | null | undefined, methode: WinstMethode = 'marge'): boolean {
  const m = getalUit(pct);
  return m != null && m >= 0 && m <= (methode === 'opslag' ? 500 : 95);
}

/** Kostprijs van één eenheid van een regel; null als de regel geen calculatie heeft. */
export function kostprijsPerEenheid(r: CalcRegel, kostprijsPerUur: string | number | null | undefined): number | null {
  if (heeftGeenCalculatie(r)) return null;
  const kpu = getalUit(kostprijsPerUur);
  if (isUrenRegel(r)) return kpu;
  if (mistCalculatie(r)) return null;
  const uren = getalUit(r.calc?.urenPer) || 0;
  if (uren > 0 && kpu == null) return null;
  // Niet afronden: × de hoeveelheid moet het optellen tot de kostprijs van de regel.
  return uren * (kpu || 0) + (getalUit(r.calc?.kostprijsPer) || 0);
}

/** Getal in een tekstveld zoals de app het toont: "12,5". */
export const alsVeld = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
