/**
 * Pure logica voor offertes en facturen: statussen, filters, zoeken, KPI's,
 * nummering en totalen. Dezelfde regels als het dashboard
 * (`utils/statusColors.js`, `OffertesPage.jsx`, `FacturenPage.jsx`,
 * `factuurService.createCreditFactuur`, `generatePdf.documentTotalen`).
 *
 * Bewust zonder imports: de tests draaien dit bestand rechtstreeks in Node.
 */

// ── Statussen ──────────────────────────────────────────────────────────────

/** De zes tonen van het dashboard (grijs, blauw, oranje, groen, rood, paars). */
export type StatusToon = 'gray' | 'blue' | 'orange' | 'green' | 'red' | 'purple';
export type StatusInfo = { toon: StatusToon; label: string };

const OFFERTE_STATUSSEN: Record<string, StatusInfo> = {
  concept: { toon: 'gray', label: 'Concept' },
  verzonden: { toon: 'blue', label: 'Verzonden' },
  verstuurd: { toon: 'blue', label: 'Verzonden' },
  bekeken: { toon: 'blue', label: 'Bekeken' },
  geaccepteerd: { toon: 'green', label: 'Geaccepteerd' },
  afgewezen: { toon: 'red', label: 'Afgewezen' },
  verlopen: { toon: 'red', label: 'Verlopen' },
};

const FACTUUR_STATUSSEN: Record<string, StatusInfo> = {
  concept: { toon: 'gray', label: 'Concept' },
  aangemaakt: { toon: 'gray', label: 'Concept' },
  verzonden: { toon: 'blue', label: 'Verzonden' },
  verstuurd: { toon: 'blue', label: 'Verzonden' },
  open: { toon: 'blue', label: 'Open' },
  betaald: { toon: 'green', label: 'Betaald' },
  verlopen: { toon: 'red', label: 'Te laat' },
  te_laat: { toon: 'red', label: 'Te laat' },
  vervallen: { toon: 'red', label: 'Te laat' },
  geboekt: { toon: 'purple', label: 'Uit SnelStart' },
};

/** "In uitvoering" / "in-uitvoering" → "in_uitvoering", net als het dashboard. */
export function normaliseerStatus(status: string | null | undefined): string {
  return String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function onbekend(status: string | null | undefined): StatusInfo {
  const raw = String(status ?? '').trim();
  if (!raw) return { toon: 'gray', label: '—' };
  return { toon: 'gray', label: raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) };
}

export function offerteStatusInfo(status: string | null | undefined): StatusInfo {
  return OFFERTE_STATUSSEN[normaliseerStatus(status)] ?? onbekend(status);
}

export function factuurStatusInfo(status: string | null | undefined): StatusInfo {
  return FACTUUR_STATUSSEN[normaliseerStatus(status)] ?? onbekend(status);
}

// ── Offertes: filters, zoeken en KPI's ─────────────────────────────────────

export type OfferteLijstItem = {
  nummer: string | null;
  omschrijving: string | null;
  status: string | null;
  totaal_incl: number | null;
  customer?: { name: string | null } | null;
};

export const OFFERTE_FILTERS = [
  { id: 'alle', label: 'Alle' },
  { id: 'concept', label: 'Concept' },
  { id: 'verzonden', label: 'Verzonden' },
  { id: 'geaccepteerd', label: 'Geaccepteerd' },
  { id: 'afgewezen', label: 'Afgewezen' },
] as const;
export type OfferteFilter = (typeof OFFERTE_FILTERS)[number]['id'];

/** Filtertab: exact op `status`, zoals de tabs van het dashboard. */
export function offertePastBijFilter(o: OfferteLijstItem, filter: OfferteFilter): boolean {
  return filter === 'alle' || o.status === filter;
}

/** Zoeken op nummer, omschrijving en klantnaam (hoofdletterongevoelig). */
export function offertePastBijZoek(o: OfferteLijstItem, zoek: string): boolean {
  const q = zoek.trim().toLowerCase();
  if (!q) return true;
  return [o.nummer, o.omschrijving, o.customer?.name].some((v) =>
    String(v ?? '')
      .toLowerCase()
      .includes(q),
  );
}

export function filterOffertes<T extends OfferteLijstItem>(
  lijst: T[],
  { filter, zoek }: { filter: OfferteFilter; zoek: string },
): T[] {
  return lijst.filter((o) => offertePastBijFilter(o, filter) && offertePastBijZoek(o, zoek));
}

export function telOfferteFilters(lijst: OfferteLijstItem[]): Record<OfferteFilter, number> {
  const tel = { alle: 0, concept: 0, verzonden: 0, geaccepteerd: 0, afgewezen: 0 };
  for (const f of OFFERTE_FILTERS) tel[f.id] = lijst.filter((o) => offertePastBijFilter(o, f.id)).length;
  return tel;
}

/** De vier KPI-tegels van de offertepagina. */
export function offerteKpis(lijst: OfferteLijstItem[]) {
  const geaccepteerd = lijst.filter((o) => o.status === 'geaccepteerd');
  return {
    totaal: lijst.length,
    concept: lijst.filter((o) => o.status === 'concept').length,
    verzonden: lijst.filter((o) => o.status === 'verzonden').length,
    geaccepteerd: geaccepteerd.length,
    geaccepteerdBedrag: rond2(geaccepteerd.reduce((s, o) => s + (Number(o.totaal_incl) || 0), 0)),
  };
}

// ── Facturen: verlopen, filters, zoeken en KPI's ───────────────────────────

export type FactuurLijstItem = {
  nummer: string | null;
  status: string;
  vervaldatum: string | null;
  totaal_incl: number | null;
  betaald_op: string | null;
  is_credit: boolean | null;
  gecrediteerd: boolean | null;
  customer?: { name: string | null } | null;
};

/**
 * Te laat: niet betaald en de vervaldatum ligt vóór vandaag. Precies de regel
 * van het dashboard — ook een concept met een verstreken vervaldatum telt.
 */
export function isFactuurVerlopen(
  f: Pick<FactuurLijstItem, 'status' | 'vervaldatum'>,
  vandaag: string,
): boolean {
  return f.status !== 'betaald' && Boolean(f.vervaldatum) && String(f.vervaldatum) < vandaag;
}

/** De status die je ziet: `verlopen` wint van de opgeslagen status. */
export function factuurWeergaveStatus(
  f: Pick<FactuurLijstItem, 'status' | 'vervaldatum'>,
  vandaag: string,
): string {
  return isFactuurVerlopen(f, vandaag) ? 'verlopen' : f.status;
}

export const FACTUUR_FILTERS = [
  { id: 'alle', label: 'Alle' },
  { id: 'concept', label: 'Concept' },
  { id: 'verzonden', label: 'Verzonden' },
  { id: 'betaald', label: 'Betaald' },
  { id: 'verlopen', label: 'Verlopen' },
  { id: 'gecrediteerd', label: 'Gecrediteerd' },
] as const;
export type FactuurFilter = (typeof FACTUUR_FILTERS)[number]['id'];

/**
 * De tabs van het dashboard. Eén bewuste afwijking: de dashboardtab
 * "Aangemaakt" filtert op de status `aangemaakt`, die de database niet meer
 * schrijft (nieuwe facturen zijn `concept`) en toont daardoor vrijwel niets.
 * Hier heet hij "Concept" en vangt hij beide waarden.
 */
export function factuurPastBijFilter(
  f: FactuurLijstItem,
  filter: FactuurFilter,
  vandaag: string,
): boolean {
  if (filter === 'alle') return true;
  if (filter === 'gecrediteerd') return Boolean(f.gecrediteerd || f.is_credit);
  const ds = factuurWeergaveStatus(f, vandaag);
  if (filter === 'concept') return ds === 'concept' || ds === 'aangemaakt';
  return ds === filter;
}

/** Zoeken op nummer en klantnaam, zoals "Zoek factuur..." in het dashboard. */
export function factuurPastBijZoek(f: FactuurLijstItem, zoek: string): boolean {
  const q = zoek.trim().toLowerCase();
  if (!q) return true;
  return [f.nummer, f.customer?.name].some((v) =>
    String(v ?? '')
      .toLowerCase()
      .includes(q),
  );
}

export function filterFacturen<T extends FactuurLijstItem>(
  lijst: T[],
  { filter, zoek, vandaag }: { filter: FactuurFilter; zoek: string; vandaag: string },
): T[] {
  return lijst.filter((f) => factuurPastBijFilter(f, filter, vandaag) && factuurPastBijZoek(f, zoek));
}

export function telFactuurFilters(
  lijst: FactuurLijstItem[],
  vandaag: string,
): Record<FactuurFilter, number> {
  const tel = { alle: 0, concept: 0, verzonden: 0, betaald: 0, verlopen: 0, gecrediteerd: 0 };
  for (const f of FACTUUR_FILTERS) {
    tel[f.id] = lijst.filter((x) => factuurPastBijFilter(x, f.id, vandaag)).length;
  }
  return tel;
}

/**
 * De vier KPI-tegels van de facturenpagina:
 * - Openstaand = Σ totaal incl. van `verzonden`/`geboekt` die níet te laat zijn;
 * - Betaald deze maand = Σ totaal incl. met `betaald_op` in deze maand;
 * - Verlopen = aantal te late facturen.
 * Creditnota's tellen mee met hun negatieve bedrag, net als in het dashboard.
 */
export function factuurKpis(lijst: FactuurLijstItem[], vandaag: string) {
  const maand = vandaag.slice(0, 7);
  const som = (xs: FactuurLijstItem[]) => rond2(xs.reduce((s, f) => s + (Number(f.totaal_incl) || 0), 0));
  const openstaand = lijst.filter(
    (f) => ['verzonden', 'geboekt'].includes(f.status) && !isFactuurVerlopen(f, vandaag),
  );
  const betaald = lijst.filter(
    (f) => f.status === 'betaald' && String(f.betaald_op ?? '').startsWith(maand),
  );
  return {
    totaal: lijst.length,
    openstaand: som(openstaand),
    betaaldDezeMaand: som(betaald),
    verlopen: lijst.filter((f) => isFactuurVerlopen(f, vandaag)).length,
  };
}

// ── Nummering ──────────────────────────────────────────────────────────────

export type NummerSoort = 'offerte' | 'factuur' | 'credit';

const NUMMER_PATROON: Record<NummerSoort, { prefix: string; regex: RegExp }> = {
  offerte: { prefix: 'BB-', regex: /^BB-(\d+)/ },
  factuur: { prefix: 'BB-F', regex: /^BB-F(\d+)/ },
  credit: { prefix: 'BB-CF', regex: /^BB-CF(\d+)/ },
};

/**
 * Volgend nummer in de reeks: `BB-001`, `BB-F001`, `BB-CF001`.
 *
 * Het dashboard telt rijen (`count + 1`). Dat botst zodra er ooit iets is
 * verwijderd, en er is geen unique index die dat afvangt. Daarom het hoogste
 * bestaande nummer + 1: in de normale situatie dezelfde uitkomst, zonder
 * dubbel nummer. Versies (`BB-005-v2`) tellen als hun basisnummer.
 */
export function volgendNummer(nummers: (string | null | undefined)[], soort: NummerSoort): string {
  const { prefix, regex } = NUMMER_PATROON[soort];
  let hoogste = 0;
  for (const n of nummers) {
    const m = regex.exec(String(n ?? ''));
    if (m) hoogste = Math.max(hoogste, Number(m[1]));
  }
  return `${prefix}${String(hoogste + 1).padStart(3, '0')}`;
}

// ── Totalen ────────────────────────────────────────────────────────────────

export function rond2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type TotaalRegel = {
  bedrag: number;
  btwPct: number | null | undefined;
  btwRegime?: string | null;
};

/**
 * Totalen van een document, zoals `documentTotalen` in de dashboard-PDF:
 * btw per tarief groeperen en per groep afronden. Vrijgesteld en verlegd
 * betekenen géén btw, ongeacht het percentage. Een regel zonder eigen
 * percentage valt terug op het percentage van het document.
 */
export function documentTotalen(regels: TotaalRegel[], standaardPct = 21) {
  const excl = rond2(regels.reduce((s, r) => s + (Number(r.bedrag) || 0), 0));
  const perTarief: Record<number, number> = {};
  for (const r of regels) {
    const pct = Number(r.btwPct ?? standaardPct);
    const vrij = r.btwRegime === 'vrijgesteld' || r.btwRegime === 'verlegd';
    const bedrag = vrij ? 0 : ((Number(r.bedrag) || 0) * pct) / 100;
    perTarief[pct] = rond2((perTarief[pct] ?? 0) + bedrag);
  }
  const btwPerTarief = Object.entries(perTarief)
    .map(([pct, bedrag]) => ({ pct: Number(pct), bedrag }))
    .filter((t) => t.bedrag !== 0)
    .sort((a, b) => b.pct - a.pct);
  const btw = btwPerTarief.reduce((s, t) => s + t.bedrag, 0);
  return { excl, btwPerTarief, btw: rond2(btw), incl: rond2(excl + btw) };
}

/** `regimeVanPct` uit `lib/btwRegime.js`: 9 → verlaagd, 0 → vrijgesteld, anders normaal. */
export function regimeVanPct(pct: number | null | undefined): string {
  if (Number(pct) === 9) return 'verlaagd';
  if (pct != null && Number(pct) === 0) return 'vrijgesteld';
  return 'normaal';
}

/**
 * Btw-percentage voor opslag — `btwPctVoorOpslag` uit het dashboard. Bij
 * verlegd en vrijgesteld is het altijd 0: de check-constraints
 * `offerte_items_verlegd_nul_check` en `factuur_regels_verlegd_nul_check`
 * weigeren anders de regel. `pct || 21` maakte van 0% vroeger 21%.
 */
export function btwPctVoorOpslag(pct: number | null | undefined, regime: string | null | undefined): number {
  if (regime === 'verlegd' || regime === 'vrijgesteld') return 0;
  const n = Number(pct);
  return pct !== null && pct !== undefined && Number.isFinite(n) ? n : 21;
}

export type CreditBronRegel = {
  type: string | null;
  omschrijving: string;
  aantal: number;
  eenheidsprijs: number;
  regelprijs: number;
  btw_pct: number | null;
  btw_regime: string | null;
};

/**
 * Creditfactuur (volledig), exact zoals `createCreditFactuur` in het dashboard:
 * - totaal excl. = −Σ |regelprijs|
 * - btw per tarief over |regelprijs|, alleen bij regime normaal/verlaagd en pct ≠ 0
 * - totaal incl. = −(|excl| + Σ btw)
 * - regels: aantal ongewijzigd, eenheidsprijs = −|eenheidsprijs|
 */
export function bouwCreditFactuur(regels: CreditBronRegel[]) {
  const totaalExcl = -Math.abs(rond2(regels.reduce((s, r) => s + Math.abs(Number(r.regelprijs) || 0), 0)));
  const perTarief: Record<number, number> = {};
  for (const r of regels) {
    const regime = r.btw_regime || regimeVanPct(r.btw_pct);
    if (regime === 'vrijgesteld' || regime === 'verlegd') continue;
    const pct = Number(r.btw_pct ?? 21);
    if (!pct) continue;
    perTarief[pct] = rond2((perTarief[pct] ?? 0) + (Math.abs(Number(r.regelprijs) || 0) * pct) / 100);
  }
  const btw = Object.values(perTarief).reduce((s, v) => s + v, 0);
  const totaalIncl = -rond2(Math.abs(totaalExcl) + btw);
  return {
    totaal_excl: rond2(totaalExcl),
    totaal_incl: rond2(totaalIncl),
    regels: regels.map((r, i) => {
      const aantal = Number(r.aantal || 1);
      const eenheidsprijs = -Math.abs(Number(r.eenheidsprijs) || 0);
      const btwRegime = r.btw_regime || regimeVanPct(r.btw_pct);
      return {
        type: r.type || 'stuks',
        omschrijving: r.omschrijving,
        aantal,
        eenheidsprijs,
        regelprijs: rond2(aantal * eenheidsprijs),
        // Niet `btw_pct || 21`: een verlegde of vrijgestelde regel (0%) werd
        // dan 21% met regime verlegd, en die combinatie weigert de database.
        btw_pct: btwPctVoorOpslag(r.btw_pct, btwRegime),
        btw_regime: btwRegime,
        volgorde: i,
      };
    }),
  };
}

/**
 * Mag deze factuur gecrediteerd worden? Zelfde voorwaarde als de rij-actie
 * "Crediteer factuur": verzonden of betaald, nog niet gecrediteerd, zelf geen
 * creditnota en niet uit de boekhouding geïmporteerd.
 */
export function magCrediteren(f: {
  status: string;
  gecrediteerd: boolean | null;
  is_credit: boolean | null;
  externe_referentie: string | null;
}): boolean {
  return (
    ['verzonden', 'betaald'].includes(f.status) &&
    !f.gecrediteerd &&
    !f.is_credit &&
    !f.externe_referentie
  );
}

