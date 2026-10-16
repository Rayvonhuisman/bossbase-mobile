/**
 * Financiën — de rekenregels van `RevenuePage` in het dashboard
 * (`src/pages/BbPages2.jsx`), `customerTotalsService.js` en de klanttoewijzing
 * uit `kostenOverzichtService.js`. Pure functies zonder imports, zodat ze
 * rechtstreeks in de Node-tests draaien.
 *
 * Drie onderdelen, elk met zijn eigen bron en tijdvak:
 *
 *   tegels     uit de database (`bb_financien_kpi`), voor het gekozen tijdvak;
 *              hier alleen het tijdvak zelf (`kpiBereik`) en "ontvangen min kosten"
 *   grafiek    uit de facturen en de geboekte kosten (job_costs zonder
 *              werkbon_materiaal_id), per dag/week/maand
 *   per klant  cumulatief, alle periodes: gefactureerd, betaald, openstaand uit
 *              de facturen; materiaal, inkopen en uren uit het kostenoverzicht
 *              (zelfde toewijzing als de klantkaart); brutowinst vóór arbeid =
 *              omzet excl. btw − (materiaal + inkopen)
 */

const rond = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ── Facturen ────────────────────────────────────────────────────────────────

/** De kolommen van `facturen` die Financiën nodig heeft. */
export type FinFactuur = {
  id: string;
  customer_id: string | null;
  status: string | null;
  totaal_incl: number | null;
  totaal_excl: number | null;
  factuurdatum: string | null;
  betaald_op: string | null;
  is_credit: boolean | null;
  gecrediteerd: boolean | null;
  credit_van_factuur_id: string | null;
};

const status = (f: FinFactuur) => f.status || 'concept';
const incl = (f: FinFactuur) => Number(f.totaal_incl) || 0;

/** Een creditfactuur en de factuur die ermee is teruggedraaid tellen niet als ontvangen geld. */
export const isEchteFactuur = (f: FinFactuur) => !f.is_credit && !f.gecrediteerd;

/**
 * Gefactureerd: alles behalve een concept. Creditfacturen staan met een
 * negatief bedrag in de boeken en trekken zichzelf er dus vanzelf af.
 */
export const isGefactureerd = (f: FinFactuur) => status(f) !== 'concept';

export const isBetaald = (f: FinFactuur) => isEchteFactuur(f) && status(f) === 'betaald';

export const sumGefactureerd = (facturen: FinFactuur[]) =>
  facturen.filter(isGefactureerd).reduce((s, f) => s + incl(f), 0);

export const sumBetaald = (facturen: FinFactuur[]) => facturen.filter(isBetaald).reduce((s, f) => s + incl(f), 0);

/** Zelfde selectie als gefactureerd, maar exclusief btw: de basis van de brutowinst. */
export const sumOmzetExcl = (facturen: FinFactuur[]) =>
  facturen.filter(isGefactureerd).reduce((s, f) => s + (Number(f.totaal_excl) || 0), 0);

/**
 * Openstaand per factuur, gelijk aan `bb_openstaand_per_factuur`: een
 * verzonden of geboekte factuur, geen creditnota zelf, met als bedrag zijn
 * totaal plus de (niet-concept) creditnota's die naar hem verwijzen, nooit
 * onder 0.
 */
export function openstaandPerFactuur(facturen: FinFactuur[]): { factuur: FinFactuur; bedrag: number }[] {
  const credits = new Map<string, number>();
  for (const f of facturen) {
    if (f.is_credit && f.credit_van_factuur_id && status(f) !== 'concept') {
      credits.set(f.credit_van_factuur_id, (credits.get(f.credit_van_factuur_id) || 0) + incl(f));
    }
  }
  return facturen
    .filter((f) => !f.is_credit && ['verzonden', 'geboekt'].includes(status(f)))
    .map((f) => ({ factuur: f, bedrag: Math.max(0, rond(incl(f) + (credits.get(f.id) || 0))) }));
}

export const sumOpenstaand = (facturen: FinFactuur[]) =>
  rond(openstaandPerFactuur(facturen).reduce((s, o) => s + o.bedrag, 0));

export type KlantTotalen = { total: number; paid: number; openstaand: number; omzetExcl: number };

/** `buildCustomerTotals` + de omzet excl. btw per klant. */
export function totalenPerKlant(facturen: FinFactuur[]): Map<string, KlantTotalen> {
  const per = new Map<string, KlantTotalen>();
  const entry = (id: string) => {
    let t = per.get(id);
    if (!t) {
      t = { total: 0, paid: 0, openstaand: 0, omzetExcl: 0 };
      per.set(id, t);
    }
    return t;
  };
  for (const f of facturen) {
    if (!f.customer_id || !isGefactureerd(f)) continue;
    const t = entry(f.customer_id);
    t.total += incl(f);
    t.omzetExcl += Number(f.totaal_excl) || 0;
    if (isBetaald(f)) t.paid += incl(f);
  }
  for (const { factuur, bedrag } of openstaandPerFactuur(facturen)) {
    if (factuur.customer_id) entry(factuur.customer_id).openstaand += bedrag;
  }
  return per;
}

// ── Tijdvak van de tegels ───────────────────────────────────────────────────

export type KpiPeriode = 'deze-maand' | 'vorige-maand' | 'dit-jaar' | 'vorig-jaar' | 'aangepast';

export const KPI_PERIODES: { id: KpiPeriode; label: string }[] = [
  { id: 'deze-maand', label: 'Deze maand' },
  { id: 'vorige-maand', label: 'Vorige maand' },
  { id: 'dit-jaar', label: 'Dit jaar' },
  { id: 'vorig-jaar', label: 'Vorig jaar' },
  { id: 'aangepast', label: 'Aangepast' },
];

/** Hoe het tijdvak in de tegellabels heet ("Gefactureerd deze maand"). */
export const PERIODE_LABEL: Record<KpiPeriode, string> = {
  'deze-maand': 'deze maand',
  'vorige-maand': 'vorige maand',
  'dit-jaar': 'dit jaar',
  'vorig-jaar': 'vorig jaar',
  aangepast: 'geselecteerde periode',
};

/**
 * Begin- en einddatum (inclusief) van het gekozen tijdvak, zoals `kpiRange` en
 * `kpiDatums` van het dashboard. Bij "Aangepast" zonder beide datums: null,
 * dan vraagt het dashboard ook niets op.
 */
export function kpiBereik(
  periode: KpiPeriode,
  nu: Date,
  van?: string | null,
  tot?: string | null,
): { van: string; tot: string } | null {
  const j = nu.getFullYear();
  const m = nu.getMonth();
  const maand = (jaar: number, mnd: number) => ({
    van: iso(new Date(jaar, mnd, 1)),
    tot: iso(new Date(jaar, mnd + 1, 0)),
  });
  switch (periode) {
    case 'vorige-maand':
      return maand(m === 0 ? j - 1 : j, m === 0 ? 11 : m - 1);
    case 'dit-jaar':
      return { van: `${j}-01-01`, tot: `${j}-12-31` };
    case 'vorig-jaar':
      return { van: `${j - 1}-01-01`, tot: `${j - 1}-12-31` };
    case 'aangepast':
      return van && tot ? { van, tot } : null;
    default:
      return maand(j, m);
  }
}

/** De tegels zoals ze uit `bb_financien_kpi` komen (zie financienService). */
export type FinancienKpi = {
  gefactureerd: number;
  ontvangen: number;
  openstaand: number;
  teVerwachten: number;
  kosten: number;
};

export type KpiTegel = { id: string; label: string; bedrag: number; uitleg: string; toon?: 'goed' | 'slecht' };

/**
 * De zes tegels van het dashboard, met dezelfde labels en toelichting.
 * "Ontvangen min kosten" is ontvangen (incl. btw) min kosten (excl. btw); geen
 * nettoresultaat, dus ook niet zo genoemd.
 */
export function kpiTegels(kpi: FinancienKpi, periode: KpiPeriode): KpiTegel[] {
  const p = PERIODE_LABEL[periode] ?? 'deze periode';
  const netto = kpi.ontvangen - kpi.kosten;
  return [
    {
      id: 'gefactureerd',
      label: `Gefactureerd ${p}`,
      bedrag: kpi.gefactureerd,
      uitleg: 'Min creditfacturen, incl. btw',
    },
    { id: 'ontvangen', label: 'Ontvangen', bedrag: kpi.ontvangen, uitleg: `Betaalde facturen ${p}` },
    { id: 'openstaand', label: 'Openstaand', bedrag: kpi.openstaand, uitleg: 'Nog niet betaald, alle periodes' },
    { id: 'te-verwachten', label: 'Te verwachten', bedrag: kpi.teVerwachten, uitleg: 'Geaccepteerde offertes' },
    { id: 'kosten', label: `Kosten ${p}`, bedrag: kpi.kosten, uitleg: `Alle kostenregels ${p}` },
    {
      id: 'netto',
      label: 'Ontvangen min kosten',
      bedrag: rond(netto),
      uitleg: `Ontvangen incl. btw, kosten excl. btw, ${p}`,
      toon: netto >= 0 ? 'goed' : 'slecht',
    },
  ];
}

// ── Grafiek ─────────────────────────────────────────────────────────────────

export type GrafiekPeriode = 'week' | 'maand' | 'kwartaal' | 'jaar';
export type GrafiekModus = 'gefactureerd' | 'ontvangen' | 'kosten';

export const GRAFIEK_PERIODES: { id: GrafiekPeriode; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'maand', label: 'Maand' },
  { id: 'kwartaal', label: 'Kwartaal' },
  { id: 'jaar', label: 'Jaar' },
];

export const GRAFIEK_MODI: { id: GrafiekModus; label: string }[] = [
  { id: 'gefactureerd', label: 'Gefactureerd' },
  { id: 'ontvangen', label: 'Ontvangen' },
  { id: 'kosten', label: 'Kosten' },
];

export const GRAFIEK_PERIODE_LABEL: Record<GrafiekPeriode, string> = {
  week: 'afgelopen 7 dagen',
  maand: 'afgelopen 30 dagen',
  kwartaal: 'afgelopen kwartaal',
  jaar: 'afgelopen 12 maanden',
};

/** Een geboekte kostenregel: `amount` excl. btw, datum = cost_date (anders aanmaakdatum). */
export type FinKost = { amount: number | null; datum: string | null };

export type Staaf = {
  label: string;
  van: string;
  tot: string;
  gefactureerd: number;
  ontvangen: number;
  kosten: number;
};

const DAG_KORT = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/**
 * De staven van de omzetgrafiek, zoals `chartData` van het dashboard:
 * week = 7 dagen, maand = 30 dagen, kwartaal = 13 weken, jaar = 12 maanden,
 * telkens eindigend vandaag. Gefactureerd telt op factuurdatum, ontvangen op
 * betaaldatum, kosten op kostendatum — dezelfde optellingen als de tegels.
 *
 * Eén verschil, bewust: datums zijn hier lokale kalenderdagen. Het dashboard
 * gebruikt `toISOString()` (UTC), waardoor tussen middernacht en 02:00 de
 * staven een dag verschoven staan.
 */
export function grafiekStaven(
  periode: GrafiekPeriode,
  { facturen, kosten }: { facturen: FinFactuur[]; kosten: FinKost[] },
  nu: Date,
): Staaf[] {
  const staaf = (label: string, van: string, tot: string): Staaf => {
    const raakt = (d: string | null) => Boolean(d) && (d as string) >= van && (d as string) <= tot;
    return {
      label,
      van,
      tot,
      gefactureerd: rond(sumGefactureerd(facturen.filter((f) => raakt(f.factuurdatum)))),
      ontvangen: rond(sumBetaald(facturen.filter((f) => raakt(f.betaald_op)))),
      kosten: rond(kosten.filter((k) => raakt(k.datum)).reduce((s, k) => s + (Number(k.amount) || 0), 0)),
    };
  };
  const dag = (terug: number) => new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - terug);

  if (periode === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = dag(6 - i);
      return staaf(DAG_KORT[d.getDay()] ?? '', iso(d), iso(d));
    });
  }
  if (periode === 'maand') {
    return Array.from({ length: 30 }, (_, i) => {
      const d = dag(29 - i);
      return staaf(String(d.getDate()), iso(d), iso(d));
    });
  }
  if (periode === 'kwartaal') {
    return Array.from({ length: 13 }, (_, i) => {
      const eind = dag((12 - i) * 7);
      const begin = new Date(eind.getFullYear(), eind.getMonth(), eind.getDate() - 6);
      return staaf(`${begin.getDate()} ${MAAND_KORT[begin.getMonth()] ?? ''}`, iso(begin), iso(eind));
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const begin = new Date(nu.getFullYear(), nu.getMonth() - (11 - i), 1);
    const eind = new Date(begin.getFullYear(), begin.getMonth() + 1, 0);
    return staaf(MAAND_KORT[begin.getMonth()] ?? '', iso(begin), iso(eind));
  });
}

/** Schaal van de grafiek: hoogste en laagste waarde, met 0 altijd in beeld. */
export function grafiekSchaal(waarden: number[]): { max: number; min: number } {
  const max = Math.max(0, ...waarden);
  const min = Math.min(0, ...waarden);
  return { max, min };
}

/** As-label zoals het dashboard: "€0", anders in duizenden ("€12k"). */
export const asLabel = (v: number) => (v === 0 ? '€0' : `€${(v / 1000).toFixed(0)}k`);

// ── Kosten per klant ────────────────────────────────────────────────────────

export type SleutelRijen = {
  projecten: { id: string; customer_id: string | null }[];
  werkbonnen: { id: string; project_id: string | null; customer_id: string | null }[];
  deals: { id: string; customer_id: string | null }[];
};

export type KlantSleutels = { projectIds: Set<string>; werkbonIds: Set<string>; dealIds: Set<string> };

/**
 * `klantSleutels`: bij een klant horen zijn projecten, zijn werkbonnen plus de
 * werkbonnen van die projecten, en zijn deals.
 */
export function klantSleutels(customerId: string, { projecten, werkbonnen, deals }: SleutelRijen): KlantSleutels {
  const projectIds = new Set(projecten.filter((p) => p.customer_id === customerId).map((p) => p.id));
  const werkbonIds = new Set(
    werkbonnen
      .filter((w) => w.customer_id === customerId || (w.project_id != null && projectIds.has(w.project_id)))
      .map((w) => w.id),
  );
  const dealIds = new Set(deals.filter((d) => d.customer_id === customerId).map((d) => d.id));
  return { projectIds, werkbonIds, dealIds };
}

export type KostRoute = {
  customer_id: string | null;
  project_id: string | null;
  werkbon_id: string | null;
  deal_id: string | null;
};

/** `kostHoortBijKlant`: rechtstreeks, via project, via werkbon of via deal. */
export const kostHoortBijKlant = (rij: KostRoute, customerId: string, s: KlantSleutels) =>
  rij.customer_id === customerId ||
  (rij.project_id != null && s.projectIds.has(rij.project_id)) ||
  (rij.werkbon_id != null && s.werkbonIds.has(rij.werkbon_id)) ||
  (rij.deal_id != null && s.dealIds.has(rij.deal_id));

/** `inkoopHoortBijKlant`: een inkoop via zijn project, of via zijn werkbon. */
export const inkoopHoortBijKlant = (rij: { project_id: string | null; werkbon_id: string | null }, s: KlantSleutels) =>
  (rij.project_id != null && s.projectIds.has(rij.project_id)) ||
  (rij.werkbon_id != null && s.werkbonIds.has(rij.werkbon_id));

/**
 * De bronrijen per klant, zoals `getKostenOverzichtPerKlant`. Het optellen
 * (materiaal op inkoopprijs, inkopen, uren) doet daarna `bouwKostenOverzicht`
 * uit projectKostenLogica — dezelfde som als op de projectkaart.
 */
export function verdeelPerKlant<
  J extends KostRoute,
  P extends { project_id: string | null; werkbon_id: string | null },
  U extends { werkbon_id: string | null },
>(
  customerIds: string[],
  bron: SleutelRijen & { jobCosts: J[]; projectKosten: P[]; uren: U[] },
): Map<string, { jobCosts: J[]; projectKosten: P[]; uren: U[] }> {
  const per = new Map<string, { jobCosts: J[]; projectKosten: P[]; uren: U[] }>();
  for (const cid of customerIds) {
    const s = klantSleutels(cid, bron);
    per.set(cid, {
      jobCosts: bron.jobCosts.filter((r) => kostHoortBijKlant(r, cid, s)),
      projectKosten: bron.projectKosten.filter((r) => inkoopHoortBijKlant(r, s)),
      uren: bron.uren.filter((r) => r.werkbon_id != null && s.werkbonIds.has(r.werkbon_id)),
    });
  }
  return per;
}

// ── Tabel per klant ─────────────────────────────────────────────────────────

export type KlantKosten = { materiaal: number; inkopen: number; uren: number; totaal: number };

export type KlantRij = {
  id: string;
  naam: string;
  plaats: string;
  total: number;
  paid: number;
  openstaand: number;
  omzetExcl: number;
  materiaal: number;
  inkopen: number;
  uren: number;
  /** Brutowinst vóór arbeid: omzet excl. btw − (materiaal + inkopen). */
  profit: number;
  /** Afgerond percentage; 0 zonder omzet. */
  margin: number;
};

const GEEN_KOSTEN: KlantKosten = { materiaal: 0, inkopen: 0, uren: 0, totaal: 0 };

/**
 * De rijen van "Per klant / opdracht", in de volgorde van de klantenlijst.
 * `kosten` mag nog null zijn (onderweg): dan staan materiaal en inkopen op 0
 * en hoort het scherm "…" te tonen, zoals het dashboard.
 */
export function klantRijen(
  klanten: { id: string; name: string | null; city?: string | null }[],
  facturen: FinFactuur[],
  kosten: Map<string, KlantKosten> | null,
): KlantRij[] {
  const totalen = totalenPerKlant(facturen);
  return klanten.map((k) => {
    const t = totalen.get(k.id) ?? { total: 0, paid: 0, openstaand: 0, omzetExcl: 0 };
    const c = kosten?.get(k.id) ?? GEEN_KOSTEN;
    const profit = t.omzetExcl - c.totaal;
    return {
      id: k.id,
      naam: (k.name ?? '').trim() || 'Naamloos',
      plaats: k.city ?? '',
      total: t.total,
      paid: t.paid,
      openstaand: t.openstaand,
      omzetExcl: t.omzetExcl,
      materiaal: c.materiaal,
      inkopen: c.inkopen,
      uren: c.uren,
      profit,
      margin: t.omzetExcl > 0 ? Math.round((profit / t.omzetExcl) * 100) : 0,
    };
  });
}

/** De totaalregel onder de tabel: de som van de rijen, op centen afgerond. */
export function totaalRij(rijen: KlantRij[]) {
  const som = (veld: keyof KlantRij) => rond(rijen.reduce((s, r) => s + (Number(r[veld]) || 0), 0));
  return {
    total: som('total'),
    paid: som('paid'),
    openstaand: som('openstaand'),
    materiaal: som('materiaal'),
    inkopen: som('inkopen'),
    uren: som('uren'),
    profit: som('profit'),
  };
}

/** Uren als aantal, zoals `fmtUren` van het dashboard: "12,5 uur". */
export const formatUrenAantal = (u: number) =>
  `${Number(u || 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur`;
