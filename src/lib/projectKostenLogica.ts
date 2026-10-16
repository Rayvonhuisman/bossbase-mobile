/**
 * Het kostenoverzicht van één project — overgenomen uit het dashboard
 * (`kostenOverzichtService.js` `bouwKostenOverzicht`, `jobCostService.js`
 * `inkoopwaardeVanKosten`, `projectKostenService.js` `toProjectKost`).
 *
 * Drie regels, drie bronnen, geen overlap:
 *
 *   materiaal — `job_costs` MET `werkbon_materiaal_id`: de spiegelregels van
 *               het werkbonmateriaal, op inkoopprijs;
 *   inkopen   — `project_kosten`: wat bij deze klus hoort maar niet op een
 *               werkbon staat (steigerhuur, een gehuurde hoogwerker);
 *   uren      — alleen het aantal; er is geen kostprijs per uur, dus geen
 *               bedrag en niet in het totaal.
 *
 * Boekingen (`job_costs` ZONDER werkbon_materiaal_id) zijn de boekhouding en
 * tellen bewust niet mee: de inkoopfactuur van hetzelfde materiaal telt al via
 * de werkbon. Het totaal is dus een brutowinst VÓÓR arbeid.
 *
 * Geen imports: draait rechtstreeks in de Node-tests.
 */

const rond = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Eén inkoop (`project_kosten`). `prijs_per` is de KOSTprijs, excl. btw. */
export type ProjectKost = {
  id: string;
  project_id: string | null;
  werkbon_id: string | null;
  datum: string;
  naam: string;
  eenheid: string;
  aantal: number;
  prijs_per: number;
  bedrag: number;
  leverancier_id: string | null;
};

/** `toProjectKost`: `bedrag` is een gegenereerde kolom; de terugval dekt een optimistische rij. */
export function naarProjectKost(row: Record<string, unknown>): ProjectKost {
  const aantal = Number(row.aantal ?? 1);
  const prijsPer = Number(row.prijs_per ?? 0);
  return {
    id: String(row.id),
    project_id: (row.project_id as string | null) || null,
    werkbon_id: (row.werkbon_id as string | null) || null,
    datum: (row.datum as string | null) || '',
    naam: (row.naam as string | null) || '',
    eenheid: (row.eenheid as string | null) || '',
    aantal,
    prijs_per: prijsPer,
    bedrag: row.bedrag != null ? Number(row.bedrag) : rond(aantal * prijsPer),
    leverancier_id: (row.leverancier_id as string | null) || null,
  };
}

/** Subtotaal van een inkoopregel, zoals `useInkopenBewerken` hem optimistisch zet. */
export function kostBedrag(aantal: number, prijsPer: number): number {
  return rond((Number(aantal) || 0) * (Number(prijsPer) || 0));
}

/** Een `job_costs`-regel rond het project, met de inkoopprijs uit de materiaalregel. */
export type ProjectJobCost = {
  id: string;
  description: string | null;
  amount: number;
  cost_date: string | null;
  werkbon_materiaal_id: string | null;
  /** Aantal op de werkbonmateriaalregel; null zonder relatie. */
  materiaalAantal: number | null;
  /** Null als de inkoopprijs onbekend is of afgeschermd (recht `inkoopprijzen`). */
  inkoopprijsPer: number | null;
};

export const isWerkbonMateriaal = (k: Pick<ProjectJobCost, 'werkbon_materiaal_id'>) => Boolean(k.werkbon_materiaal_id);

/**
 * `inkoopwaardeVanKosten`: materiaal op inkoopprijs. Onbekende inkoopprijs →
 * terugvallen op de verkoopprijs en tellen in `zonderInkoopprijs`. Bewust die
 * kant op: dan valt de winst te LAAG uit, met een melding erbij.
 */
export function inkoopwaardeVanKosten(kosten: ProjectJobCost[]) {
  let materiaalInkoop = 0;
  let overigeKosten = 0;
  let zonderInkoopprijs = 0;
  let geschatBedrag = 0;
  for (const k of kosten) {
    const verkoop = Number(k.amount) || 0;
    if (!isWerkbonMateriaal(k)) {
      overigeKosten += verkoop;
      continue;
    }
    const aantal = Number(k.materiaalAantal ?? 0);
    if (k.inkoopprijsPer != null && aantal > 0) {
      materiaalInkoop += Number(k.inkoopprijsPer) * aantal;
    } else {
      materiaalInkoop += verkoop;
      zonderInkoopprijs += 1;
      geschatBedrag += verkoop;
    }
  }
  return {
    inkoopwaarde: rond(materiaalInkoop + overigeKosten),
    materiaalInkoop: rond(materiaalInkoop),
    overigeKosten: rond(overigeKosten),
    zonderInkoopprijs,
    geschatBedrag: rond(geschatBedrag),
  };
}

export type KostenOverzicht = {
  materiaal: { regels: ProjectJobCost[]; bedrag: number; zonderInkoopprijs: number; geschatBedrag: number };
  inkopen: { regels: ProjectKost[]; bedrag: number };
  uren: { uren: number; km: number };
  boekingen: { regels: ProjectJobCost[]; bedrag: number };
  totaal: number;
};

/** `bouwKostenOverzicht` van het dashboard: de tegels en de regels uit één bron. */
export function bouwKostenOverzicht({
  jobCosts = [],
  projectKosten = [],
  urenRegels = [],
}: {
  jobCosts?: ProjectJobCost[];
  projectKosten?: ProjectKost[];
  urenRegels?: { uren?: number | null; reis_km?: number | null }[];
}): KostenOverzicht {
  const materiaalRegels = jobCosts.filter(isWerkbonMateriaal);
  const boekingRegels = jobCosts.filter((k) => !isWerkbonMateriaal(k));
  const inkoop = inkoopwaardeVanKosten(materiaalRegels);
  const inkopenBedrag = rond(projectKosten.reduce((s, k) => s + (Number(k.bedrag) || 0), 0));
  const boekingenBedrag = rond(boekingRegels.reduce((s, k) => s + (Number(k.amount) || 0), 0));
  const uren = urenRegels.reduce((s, u) => s + (Number(u.uren) || 0), 0);
  const km = urenRegels.reduce((s, u) => s + (Number(u.reis_km) || 0), 0);
  return {
    materiaal: {
      regels: materiaalRegels,
      bedrag: inkoop.materiaalInkoop,
      zonderInkoopprijs: inkoop.zonderInkoopprijs,
      geschatBedrag: inkoop.geschatBedrag,
    },
    inkopen: { regels: projectKosten, bedrag: inkopenBedrag },
    uren: { uren: rond(uren), km: rond(km) },
    boekingen: { regels: boekingRegels, bedrag: boekingenBedrag },
    totaal: rond(inkoop.materiaalInkoop + inkopenBedrag),
  };
}

/** "Materiaal: Verf wit" → "Verf wit", zoals de materiaallijst van het dashboard. */
export const materiaalNaam = (desc: string | null | undefined) => (desc || '').replace(/^Materiaal:\s*/i, '');
