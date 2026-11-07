import { arbeidUitUren, type Arbeid, type UrenRegel } from './projectKostenLogica';

/**
 * Kosten op een werkbon (WerkbonKostenSection in het dashboard): de arbeid
 * (uren × de kostprijs per uur die gold bij het boeken), het werkbonmateriaal
 * op inkoopprijs plus de inkopen (`project_kosten` met `werkbon_id`).
 * Boekingen op de Kosten-pagina staan apart en tellen niet mee. Uren zonder
 * kostprijs tellen niet mee in het bedrag; dat staat erbij. Zie
 * kostenOverzichtService.js.
 *
 * De arbeid rekent met `arbeidUitUren` uit projectKostenLogica: één regel voor
 * de werkbon en het project. Verder geen imports.
 */

const rond = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Een inkoop, zoals toProjectKost hem geeft. */
export type Inkoop = {
  id: string;
  projectId: string | null;
  werkbonId: string | null;
  datum: string;
  naam: string;
  eenheid: string;
  aantal: number;
  prijsPer: number;
  bedrag: number;
  leverancierId: string | null;
};

export function naarInkoop(row: Record<string, unknown>): Inkoop {
  const aantal = Number(row.aantal ?? 1);
  const prijsPer = Number(row.prijs_per ?? 0);
  return {
    id: row.id as string,
    projectId: (row.project_id as string) ?? null,
    werkbonId: (row.werkbon_id as string) || null,
    datum: (row.datum as string) || '',
    naam: (row.naam as string) || '',
    eenheid: (row.eenheid as string) || '',
    aantal,
    prijsPer,
    // `bedrag` is een gegenereerde kolom; de terugval dekt een optimistische rij.
    bedrag: row.bedrag != null ? Number(row.bedrag) : rond(aantal * prijsPer),
    leverancierId: (row.leverancier_id as string) || null,
  };
}

/** Een kostenpost uit job_costs met de velden die het overzicht leest. */
export type KostBron = {
  werkbonMateriaalId: string | null;
  amt: number;
  materiaalAantal: number | null;
  inkoopprijsPer: number | null;
};

export function naarKostBron(row: Record<string, unknown>): KostBron {
  const m = (Array.isArray(row.werkbon_materialen) ? row.werkbon_materialen[0] : row.werkbon_materialen) as
    | { aantal?: number | null; werkbon_materiaal_inkoop?: unknown }
    | null
    | undefined;
  const ink = (Array.isArray(m?.werkbon_materiaal_inkoop) ? m?.werkbon_materiaal_inkoop[0] : m?.werkbon_materiaal_inkoop) as
    | { inkoopprijs_per?: number | null }
    | null
    | undefined;
  return {
    werkbonMateriaalId: (row.werkbon_materiaal_id as string) || null,
    amt: Number(row.amount || 0),
    materiaalAantal: m?.aantal != null ? Number(m.aantal) : null,
    inkoopprijsPer: ink?.inkoopprijs_per != null ? Number(ink.inkoopprijs_per) : null,
  };
}

export type KostenOverzicht = {
  materiaal: { bedrag: number; zonderInkoopprijs: number; geschatBedrag: number };
  inkopen: { bedrag: number };
  boekingen: { aantal: number; bedrag: number };
  arbeid: Arbeid;
  totaal: number;
};

/** bouwKostenOverzicht() met inkoopwaardeVanKosten(), beperkt tot de werkbon. */
export function bouwKostenOverzicht({
  jobCosts = [],
  inkopen = [],
  uren = [],
}: {
  jobCosts?: KostBron[];
  inkopen?: Pick<Inkoop, 'bedrag'>[];
  uren?: UrenRegel[];
}): KostenOverzicht {
  let materiaalInkoop = 0;
  let zonderInkoopprijs = 0;
  let geschatBedrag = 0;
  let boekingen = 0;
  let boekingenBedrag = 0;
  for (const k of jobCosts) {
    const verkoop = Number(k.amt) || 0;
    if (!k.werkbonMateriaalId) {
      boekingen += 1;
      boekingenBedrag += verkoop;
      continue;
    }
    const aantal = Number(k.materiaalAantal ?? 0);
    if (k.inkoopprijsPer != null && aantal > 0) materiaalInkoop += Number(k.inkoopprijsPer) * aantal;
    else {
      materiaalInkoop += verkoop;
      zonderInkoopprijs += 1;
      geschatBedrag += verkoop;
    }
  }
  const inkopenBedrag = rond(inkopen.reduce((s, k) => s + (Number(k.bedrag) || 0), 0));
  const arbeid = arbeidUitUren(uren);
  return {
    materiaal: { bedrag: rond(materiaalInkoop), zonderInkoopprijs, geschatBedrag: rond(geschatBedrag) },
    inkopen: { bedrag: inkopenBedrag },
    boekingen: { aantal: boekingen, bedrag: rond(boekingenBedrag) },
    arbeid,
    totaal: rond(arbeid.bedrag + rond(materiaalInkoop) + inkopenBedrag),
  };
}

/**
 * Wie de kosten ziet en wie ze bijwerkt, zoals WerkbonKostenSection: zien met
 * het recht `kosten` én de module `kosten_nacalculatie`; toevoegen en
 * bewerken voor admin of `projecten_bewerken`; de kostprijs (arbeid op
 * kostprijs per uur, materiaal op inkoop) alleen met `inkoopprijzen`.
 */
export function kostenRechten(r: {
  role: string | null;
  can: (p: string) => boolean;
  hasFeature: (f: string) => boolean;
  readonly: boolean;
}): { zien: boolean; bewerken: boolean; inkoop: boolean } {
  const zien = r.can('kosten') && r.hasFeature('kosten_nacalculatie');
  return {
    zien,
    bewerken: zien && !r.readonly && (r.role === 'admin' || r.can('projecten_bewerken')),
    inkoop: r.can('inkoopprijzen'),
  };
}
