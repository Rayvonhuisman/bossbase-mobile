/**
 * Pure logica voor offertes en facturen: statussen, filters, zoeken, KPI's,
 * nummering en totalen. Dezelfde regels als het dashboard
 * (`utils/statusColors.js`, `OffertesPage.jsx`, `FacturenPage.jsx`,
 * `factuurService.createCreditFactuur`, `generatePdf.documentTotalen`).
 *
 * Bewust zonder imports: de tests draaien dit bestand rechtstreeks in Node.
 */

import { leesGetalNl } from './getalNl';

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
  // Concept met een nummer dat niet meer weg mag (doorlopende reeks), zoals het dashboard.
  vervallen: { toon: 'gray', label: 'Vervallen' },
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
  /** Een creditnota wijst naar de factuur die hij (deels) terugdraait. */
  credit_van_factuur_id?: string | null;
  id?: string;
  customer?: { name: string | null } | null;
};

/**
 * Te laat — `isVerlopen` van het dashboard (FacturenPage, audit 2026-10-01 H9):
 * verstuurd (`verzonden`/`geboekt`), niet gecrediteerd, geen creditnota, en de
 * vervaldatum ligt vóór vandaag. Een concept is nooit naar de klant gegaan en
 * een gecrediteerde factuur is niet meer verschuldigd.
 */
export function isFactuurVerlopen(
  f: Pick<FactuurLijstItem, 'status' | 'vervaldatum' | 'is_credit' | 'gecrediteerd'>,
  vandaag: string,
): boolean {
  return (
    ['verzonden', 'geboekt'].includes(f.status) &&
    !f.gecrediteerd &&
    !f.is_credit &&
    Boolean(f.vervaldatum) &&
    String(f.vervaldatum) < vandaag
  );
}

/**
 * Openstaand per factuur — `openstaandPerFactuur` van het dashboard (gelijk aan
 * `bb_openstaand_per_factuur`): verstuurde, onbetaalde facturen (geen
 * creditnota), met als bedrag hun totaal plus de creditnota's die naar hen
 * verwijzen, nooit onder 0.
 */
export function openstaandPerFactuur<T extends FactuurLijstItem>(lijst: T[]): { factuur: T; bedrag: number }[] {
  const credits = new Map<string, number>();
  for (const f of lijst) {
    if (f.is_credit && f.credit_van_factuur_id && f.status !== 'concept') {
      credits.set(f.credit_van_factuur_id, (credits.get(f.credit_van_factuur_id) ?? 0) + (Number(f.totaal_incl) || 0));
    }
  }
  return lijst
    .filter((f) => !f.is_credit && ['verzonden', 'geboekt'].includes(f.status))
    .map((f) => ({
      factuur: f,
      bedrag: Math.max(0, rond2((Number(f.totaal_incl) || 0) + (f.id ? (credits.get(f.id) ?? 0) : 0))),
    }));
}

/** De status die je ziet: `verlopen` wint van de opgeslagen status. */
export function factuurWeergaveStatus(
  f: Pick<FactuurLijstItem, 'status' | 'vervaldatum' | 'is_credit' | 'gecrediteerd'>,
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
 * De vier KPI-tegels van de facturenpagina (FacturenPage):
 * - Openstaand = Σ openstaand bedrag per factuur (na eigen creditnota's), van
 *   facturen die nog niet over de vervaldatum zijn;
 * - Betaald deze maand = Σ totaal incl. met `betaald_op` in deze maand;
 * - Verlopen = aantal te late facturen.
 */
export function factuurKpis(lijst: FactuurLijstItem[], vandaag: string) {
  const maand = vandaag.slice(0, 7);
  const som = (xs: FactuurLijstItem[]) => rond2(xs.reduce((s, f) => s + (Number(f.totaal_incl) || 0), 0));
  const openstaandBedrag = rond2(
    openstaandPerFactuur(lijst)
      .filter((o) => o.bedrag > 0 && !(o.factuur.vervaldatum && String(o.factuur.vervaldatum) < vandaag))
      .reduce((s, o) => s + o.bedrag, 0),
  );
  const betaald = lijst.filter(
    (f) => f.status === 'betaald' && String(f.betaald_op ?? '').startsWith(maand),
  );
  return {
    totaal: lijst.length,
    openstaand: openstaandBedrag,
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


// ── Offertes: versies, slot en verwijderen ─────────────────────────────────

type OfferteSlotVelden = {
  status: string | null;
  signed_at: string | null;
  vervangen_op?: string | null;
};

/**
 * `isOfferteFullyLocked` (utils/documentSnapshot.js): ondertekend of
 * geaccepteerd = het akkoord van de klant. Dan mag ook de status niet meer.
 */
export function offerteVolledigVast(o: OfferteSlotVelden): boolean {
  return Boolean(o.signed_at) || o.status === 'geaccepteerd';
}

/**
 * `isOfferteRevisable`: verzonden, nog niet getekend en nog niet vervangen.
 * Herzien maakt dan een NIEUWE VERSIE; de oude ondertekenlink vervalt.
 */
export function offerteHerzienbaar(o: OfferteSlotVelden): boolean {
  return !o.signed_at && !o.vervangen_op && o.status === 'verzonden';
}

/** `magOfferteVerwijderen` (OffertesPage): niet meer na akkoord van de klant. */
export function magOfferteVerwijderen(o: OfferteSlotVelden): boolean {
  return !o.signed_at && o.status !== 'geaccepteerd';
}

/**
 * `nextOfferteVersionNumber`: het basisnummer zonder `-vN`, de nieuwe versie
 * is de hoogste bestaande + 1 (het origineel telt als v1).
 * BB-005 → BB-005-v2 → BB-005-v3.
 *
 * `bestaande` zijn de nummers die met het basisnummer beginnen (het dashboard
 * haalt ze op met `ilike '<basis>%'`).
 */
export function volgendVersieNummer(nummer: string | null | undefined, bestaande: (string | null)[]): string {
  const basis = String(nummer || '').replace(/-v\d+$/i, '') || 'BB';
  const esc = basis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${esc}(?:-v(\\d+))?$`, 'i');
  let max = 1;
  for (const n of bestaande) {
    const m = re.exec(n || '');
    if (!m) continue;
    const v = m[1] ? parseInt(m[1], 10) : 1;
    if (v > max) max = v;
  }
  return `${basis}-v${max + 1}`;
}

/** Het basisnummer waarop het dashboard zijn `ilike` doet. */
export function versieBasis(nummer: string | null | undefined): string {
  return String(nummer || '').replace(/-v\d+$/i, '') || 'BB';
}

/**
 * Een offerteregel terug naar de velden van het regelformulier —
 * `reconstructRegel` (lib/regelTypes.js). Regels van vóór de migratie hebben
 * geen type of percentage: dan het percentage uit de kop (afgerond op 9 of 21
 * als het daar dichtbij ligt) en het type uit het aantal.
 */
export function regelVeldenUitOfferteItem(
  item: {
    omschrijving: string | null;
    type: string | null;
    aantal: number | null;
    prijs_per: number | null;
    btw_pct: number | null;
    btw_regime: string | null;
  },
  kop: { totaal_excl: number | null; totaal_incl: number | null },
): { omschrijving: string; type: string; aantal: number; prijs: number; btwPct: number; btwRegime: string } {
  const excl = Number(kop.totaal_excl || 0);
  const incl = Number(kop.totaal_incl || 0);
  const terugval = excl > 0 ? Math.round((incl / excl - 1) * 1000) / 10 : 21;
  const snap = (pct: number) => [9, 21].find((s) => Math.abs(s - pct) < 1.5) ?? pct;
  const pct = item.btw_pct != null ? Number(item.btw_pct) : snap(terugval);
  const aantal = Number(item.aantal ?? 1);
  return {
    omschrijving: item.omschrijving || '',
    type: item.type || (aantal > 1 ? 'uren' : 'vast'),
    aantal,
    prijs: Number(item.prijs_per ?? 0),
    btwPct: pct,
    btwRegime: item.btw_regime || regimeVanPct(pct),
  };
}

// ── Facturen: verwijderen, status en herinneringen ─────────────────────────

/**
 * `magFactuurVerwijderen` (FacturenPage): alleen een concept, of een factuur
 * uit de boekhouding. Een verstuurde factuur is een boekstuk: crediteren.
 */
export function magFactuurVerwijderen(f: { status: string; externe_referentie: string | null }): boolean {
  return ['concept', 'aangemaakt'].includes(f.status) || Boolean(f.externe_referentie) || f.status === 'geboekt';
}

/**
 * `statusWeigering`: een concept zonder regels op betaald zetten zou een
 * "betaalde" factuur van € 0 opleveren die nooit verstuurd is.
 */
export function factuurStatusWeigering(
  f: { status: string },
  nieuweStatus: string,
  aantalRegels: number | null,
): string | null {
  if (nieuweStatus === 'betaald' && ['concept', 'aangemaakt'].includes(f.status) && aantalRegels === 0) {
    return 'Deze factuur heeft nog geen regels. Voeg eerst regels toe en verstuur hem, daarna kun je hem op betaald zetten.';
  }
  return null;
}

/** `PDF_STATUSSEN` (utils/bewaarFactuurPdf.js): vanaf hier is de factuur definitief. */
export const PDF_STATUSSEN = ['verzonden', 'betaald'];

/** Wordt de factuur met deze statuswissel definitief? Dan de PDF bewaren. */
export function wordtDefinitief(oud: string, nieuw: string): boolean {
  return PDF_STATUSSEN.includes(nieuw) && !PDF_STATUSSEN.includes(oud);
}

/**
 * Welke herinnering kan nu? Zoals de detailweergave van het dashboard:
 * alleen een te late factuur; eerst herinnering 1, daarna 2. Herinnering 2
 * verschijnt alleen met de feature; herinnering 1 wel, en vraagt dan bij het
 * aantikken om het abonnement (guardFeature).
 */
export function factuurHerinneringen(
  f: Pick<FactuurLijstItem, 'status' | 'vervaldatum' | 'is_credit' | 'gecrediteerd'> & {
    herinnering_1_verstuurd_at?: string | null;
    herinnering_2_verstuurd_at?: string | null;
  },
  vandaag: string,
  kanHerinneren: boolean,
): { eerste: boolean; tweede: boolean } {
  const teLaat = isFactuurVerlopen(f, vandaag);
  return {
    eerste: teLaat && !f.herinnering_1_verstuurd_at,
    tweede: teLaat && kanHerinneren && Boolean(f.herinnering_1_verstuurd_at) && !f.herinnering_2_verstuurd_at,
  };
}

/**
 * Gedeeltelijk crediteren (`CrediteerModal`): alleen de aangevinkte regels,
 * met het aantal en de prijs uit het venster. De prijs telt als bedrag (de
 * creditnota maakt hem zelf negatief), het aantal blijft positief.
 *
 * Eén verschil met het dashboard: daar wordt een aantal van 0 stilzwijgend 1
 * (`Number(aantal || 1)`), waardoor je een regel crediteert die je juist op 0
 * had gezet. Hier is dat een melding.
 */
export function gedeeltelijkeCreditRegels<R extends CreditBronRegel>(
  keuzes: { regel: R; gekozen: boolean; aantal: string; prijs: string }[],
): { ok: true; regels: CreditBronRegel[] } | { ok: false; melding: string } {
  const gekozen = keuzes.filter((k) => k.gekozen);
  if (gekozen.length === 0) return { ok: false, melding: 'Selecteer minimaal één regel.' };
  const regels: CreditBronRegel[] = [];
  for (const k of gekozen) {
    const aantal = leesGetalNl(k.aantal) ?? NaN;
    const prijs = Math.abs(leesGetalNl(k.prijs) ?? NaN);
    if (!Number.isFinite(aantal) || aantal <= 0) {
      return { ok: false, melding: `Vul bij "${k.regel.omschrijving}" een aantal groter dan 0 in.` };
    }
    if (!Number.isFinite(prijs)) {
      return { ok: false, melding: `Vul bij "${k.regel.omschrijving}" een geldige prijs in.` };
    }
    regels.push({
      ...k.regel,
      aantal,
      eenheidsprijs: prijs,
      regelprijs: rond2(aantal * prijs),
    });
  }
  return { ok: true, regels };
}

// ── Abonnement ─────────────────────────────────────────────────────────────

/**
 * `plan.within(key)` uit usePlan.js: is er nog ruimte binnen de limiet van
 * deze periode? Geen limiet bekend of `max` leeg = onbeperkt.
 */
export function binnenLimiet(
  limieten: Record<string, { max: number | null; gebruikt: number } | undefined> | null | undefined,
  key: string,
): boolean {
  const l = limieten?.[key];
  if (!l || l.max == null) return true;
  return Number(l.gebruikt || 0) < l.max;
}
