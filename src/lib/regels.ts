/**
 * Offerte- en factuurregels: types, btw-regimes en bedragen.
 *
 * Eén bestand, want offertes en facturen rekenen in het dashboard met exact
 * dezelfde functies (`useRegelTotals` in FacturenPage en het identieke blok in
 * OffertesPage). Wijkt de app hier ook maar één afronding af, dan staat er op de
 * telefoon een ander eindbedrag dan op het scherm van kantoor — en dan is het de
 * vraag welke van de twee de klant heeft gekregen.
 *
 * De regels zijn letterlijk overgenomen uit `origin/main` van het dashboard:
 *
 *   regelprijs   = round(aantal × prijs, 2)
 *   totaal excl  = round(Σ regelprijs, 2)
 *   btw          = per tarief: round(Σ regelprijs × pct/100, 2)
 *   totaal incl  = round(excl + Σ btw, 2)
 *
 * Let op de volgorde: eerst per regel afronden, dan optellen. Andersom levert
 * bij een cent-verschil een ander totaal op.
 *
 * De kolomnamen verschillen per tabel — `offerte_items` heeft `prijs_per` en
 * `subtotaal`, `factuur_regels` heeft `eenheidsprijs` en `regelprijs` — dus de
 * omzetting naar de database staat in de servicelaag, niet hier.
 */

// ── Regeltypes (regelTypes.js in het dashboard) ────────────────────────────

export const EIGEN_PREFIX = 'eigen:';

export type RegelTypeConfig = {
  value: string;
  label: string;
  /** Tekst die wordt opgeslagen als de gebruiker geen omschrijving invult. */
  omschrijvingFallback: string;
  /** Eenheid achter het aantal ("u", "km", …). */
  eenheid: string;
};

const VAST: Record<string, RegelTypeConfig> = {
  uren: { value: 'uren', label: 'Uren', omschrijvingFallback: 'Arbeidsuren', eenheid: 'u' },
  km: { value: 'km', label: 'Km', omschrijvingFallback: 'Reisvergoeding', eenheid: 'km' },
  vast: { value: 'vast', label: 'Overig', omschrijvingFallback: 'Overige kosten', eenheid: '' },
};

/** Verwijderde types; blijven leesbaar voor oude regels, staan niet in de keuzelijst. */
const LEGACY: Record<string, RegelTypeConfig> = {
  m2: { value: 'm2', label: 'm²', omschrijvingFallback: 'Prijs per m²', eenheid: 'm²' },
  stuks: { value: 'stuks', label: 'Stuks', omschrijvingFallback: 'Materiaalkosten', eenheid: 'st' },
};

export const VASTE_TYPES = ['uren', 'km', 'vast'] as const;

export type EigenEenheid = {
  id: string;
  naam: string;
  standaardPrijs: number;
  eenheidLabel: string;
  /** null = geen eigen btw; val terug op de bedrijfsstandaard. */
  btwPct: number | null;
};

export const isEigenType = (t: string) => t.startsWith(EIGEN_PREFIX);
export const eigenIdVanType = (t: string) => (isEigenType(t) ? t.slice(EIGEN_PREFIX.length) : null);
export const eigenType = (id: string) => `${EIGEN_PREFIX}${id}`;

export function typeConfig(type: string, eenheden: EigenEenheid[] = []): RegelTypeConfig {
  if (VAST[type]) return VAST[type]!;
  if (isEigenType(type)) {
    const e = eenheden.find((x) => x.id === eigenIdVanType(type));
    if (e) {
      return {
        value: type,
        label: e.naam,
        omschrijvingFallback: e.naam,
        eenheid: e.eenheidLabel || '',
      };
    }
    // Eenheid verwijderd: toon als "Overig", maar houd het opgeslagen bedrag.
    return VAST.vast!;
  }
  if (LEGACY[type]) return LEGACY[type]!;
  return VAST.vast!;
}

/** Keuzelijst: de vaste types plus de eigen eenheden van het bedrijf. */
export function typeOpties(
  eenheden: EigenEenheid[] = [],
  huidigType?: string,
): { id: string; label: string }[] {
  const opties = [
    ...VASTE_TYPES.map((k) => ({ id: k, label: VAST[k]!.label })),
    ...eenheden.map((e) => ({ id: eigenType(e.id), label: e.naam })),
  ];
  // Een bestaand (oud of verwijderd) type blijft kiesbaar, zodat openen en
  // opslaan het opgeslagen type niet stilletjes verandert.
  if (huidigType && !opties.some((o) => o.id === huidigType)) {
    opties.push({ id: huidigType, label: typeConfig(huidigType, eenheden).label });
  }
  return opties;
}

// ── Btw-regimes (btwRegime.js in het dashboard) ────────────────────────────

export type BtwRegime = 'normaal' | 'verlaagd' | 'vrijgesteld' | 'verlegd';

export const BTW_REGIMES: { value: BtwRegime; pct: number; label: string; kort?: string }[] = [
  { value: 'normaal', pct: 21, label: '21% — normaal' },
  { value: 'verlaagd', pct: 9, label: '9% — verlaagd' },
  { value: 'vrijgesteld', pct: 0, label: '0% — vrijgesteld', kort: 'Geen btw van toepassing' },
  { value: 'verlegd', pct: 0, label: '0% — btw verlegd', kort: 'Je klant draagt de btw af' },
];

export const STANDAARD_REGIME: BtwRegime = 'normaal';

export function regimeVanPct(pct: number | null | undefined): BtwRegime {
  const p = Number(pct);
  if (p === 9) return 'verlaagd';
  if (p === 0) return 'vrijgesteld';
  return 'normaal';
}

export function pctVanRegime(regime: BtwRegime, huidigPct = 21): number {
  const cfg = BTW_REGIMES.find((r) => r.value === regime);
  return cfg ? cfg.pct : Number(huidigPct) || 0;
}

/**
 * Verlegde btw naast belaste regels wordt door de boekhoudkoppeling geweigerd
 * (SnelStart BOE-0062) en klopt fiscaal ook niet. Het dashboard waarschuwt
 * hiervoor; de app doet dat met dezelfde regel.
 */
export function heeftVerlegdConflict(regels: Regel[]): boolean {
  const regimes = regels.map((r) => r.btwRegime);
  return (
    regimes.includes('verlegd') && regimes.some((r) => r === 'normaal' || r === 'verlaagd')
  );
}

// ── De regel zoals het formulier hem vasthoudt ─────────────────────────────

export type Regel = {
  /** Alleen voor de lijst in het formulier; niet de database-id. */
  sleutel: string;
  omschrijving: string;
  type: string;
  /** Tekstvelden: de gebruiker typt "2,5" en dat blijft staan tot het opslaan. */
  aantal: string;
  prijs: string;
  btwRegime: BtwRegime;
  /** Percentage; volgt het regime, behalve bij een afwijkend tarief uit oude data. */
  btwPct: number;
};

let teller = 0;
export function nieuweSleutel(): string {
  teller += 1;
  return `r${teller}`;
}

export function legeRegel(standaard?: {
  uurtarief?: number;
  btwPct?: number;
}): Regel {
  const pct = standaard?.btwPct ?? 21;
  return {
    sleutel: nieuweSleutel(),
    omschrijving: '',
    type: 'uren',
    aantal: '1',
    prijs: String(standaard?.uurtarief ?? 0).replace('.', ','),
    btwRegime: regimeVanPct(pct),
    btwPct: pct,
  };
}

/** Typewissel vult de standaardprijs voor, precies als `applyTypeChange`. */
export function pasTypeToe(
  r: Regel,
  nieuwType: string,
  standaard: { uurtarief: number; reiskostenPerKm: number; btwPct: number },
  eenheden: EigenEenheid[] = [],
): Regel {
  const basis = { ...r, type: nieuwType };
  if (nieuwType === 'uren') return { ...basis, prijs: nummerNaarVeld(standaard.uurtarief) };
  if (nieuwType === 'km') return { ...basis, prijs: nummerNaarVeld(standaard.reiskostenPerKm) };
  if (nieuwType === 'vast') return { ...basis, prijs: '0' };
  if (isEigenType(nieuwType)) {
    const e = eenheden.find((x) => x.id === eigenIdVanType(nieuwType));
    if (e) {
      const pct = e.btwPct != null ? e.btwPct : standaard.btwPct;
      return {
        ...basis,
        prijs: nummerNaarVeld(e.standaardPrijs),
        btwPct: pct,
        btwRegime: regimeVanPct(pct),
      };
    }
  }
  return basis;
}

// ── Bedragen ───────────────────────────────────────────────────────────────

/** "2,5" → 2.5. Lege of onzinnige invoer telt als 0. */
export function veldNaarNummer(waarde: string): number {
  const n = Number(String(waarde).replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

export function nummerNaarVeld(n: number): string {
  return String(n).replace('.', ',');
}

export function regelprijs(r: Regel): number {
  return Math.round(veldNaarNummer(r.aantal) * veldNaarNummer(r.prijs) * 100) / 100;
}

export type Totalen = {
  excl: number;
  /** Btw-bedrag per percentage, net als de dashboardtotalen. */
  btwPerTarief: { pct: number; bedrag: number }[];
  btw: number;
  incl: number;
};

export function berekenTotalen(regels: Regel[]): Totalen {
  const excl = Math.round(regels.reduce((s, r) => s + regelprijs(r), 0) * 100) / 100;

  const perTarief = new Map<number, number>();
  for (const r of regels) {
    const pct = r.btwPct;
    const vorige = perTarief.get(pct) ?? 0;
    perTarief.set(pct, Math.round((vorige + (regelprijs(r) * pct) / 100) * 100) / 100);
  }
  const btwPerTarief = [...perTarief.entries()]
    .map(([pct, bedrag]) => ({ pct, bedrag }))
    .sort((a, b) => b.pct - a.pct);
  const btw = btwPerTarief.reduce((s, x) => s + x.bedrag, 0);

  return {
    excl,
    btwPerTarief,
    btw: Math.round(btw * 100) / 100,
    incl: Math.round((excl + btw) * 100) / 100,
  };
}

/** De omschrijving die wordt opgeslagen als de gebruiker niets invulde. */
export function omschrijvingVoorOpslag(r: Regel, eenheden: EigenEenheid[] = []): string {
  return r.omschrijving.trim() || typeConfig(r.type, eenheden).omschrijvingFallback;
}
