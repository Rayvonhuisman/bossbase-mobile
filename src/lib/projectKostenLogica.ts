/**
 * Het kostenoverzicht en de nacalculatie van een project — overgenomen uit het
 * dashboard (`kostenOverzichtService.js` `bouwKostenOverzicht`,
 * `bouwNacalculatie`, `telBegrotingenOp`; `jobCostService.js`
 * `inkoopwaardeVanKosten`; `projectKostenService.js` `toProjectKost`).
 *
 * Drie kostensoorten, drie bronnen, geen overlap:
 *
 *   arbeid    — `werkbon_uren` × de kostprijs per uur die gold bij het boeken
 *               (`werkbon_uren_kostprijs`, migratie 20261107143517). Een uur
 *               zonder kostprijs telt als uur mee, maar niet in het bedrag:
 *               geen verzonnen tarief. Het uurtarief uit de instellingen is een
 *               VERKOOPprijs en komt hier nooit in;
 *   materiaal — `job_costs` MET `werkbon_materiaal_id`: de spiegelregels van
 *               het werkbonmateriaal, op inkoopprijs;
 *   inkopen   — `project_kosten`: wat bij deze klus hoort maar niet op een
 *               werkbon staat (steigerhuur, een gehuurde hoogwerker).
 *
 * Boekingen (`job_costs` ZONDER werkbon_materiaal_id) zijn de boekhouding en
 * tellen bewust niet mee: de inkoopfactuur van hetzelfde materiaal telt al via
 * de werkbon. Kilometers staan als aantal bij de arbeid en hebben geen bedrag.
 * Het totaal is arbeid + materiaal + inkopen: de kostprijs van de klus.
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
 * kant op: dan valt het resultaat te LAAG uit, met een melding erbij.
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

// ── Arbeid ─────────────────────────────────────────────────────────────────

/**
 * Kostprijs per uur meelezen bij `werkbon_uren`. Zonder het recht op inkoop- en
 * kostprijzen geeft de database hier null (RLS): dan is elk uur "zonder
 * kostprijs". Kent de API de relatie nog niet, dan zonder ophalen.
 */
export const UUR_KOSTPRIJS = 'werkbon_uren_kostprijs ( kostprijs_per_uur )';

/** `kostprijsVanUurRij`: de kostprijs per uur uit de embed, of null. */
export function kostprijsVanUurRij(row: { werkbon_uren_kostprijs?: unknown } | null | undefined): number | null {
  const ruw = row?.werkbon_uren_kostprijs;
  const k = (Array.isArray(ruw) ? ruw[0] : ruw) as { kostprijs_per_uur?: number | string | null } | null | undefined;
  return k?.kostprijs_per_uur != null ? Number(k.kostprijs_per_uur) : null;
}

/** Eén geboekt uur zoals het overzicht het leest. */
export type UrenRegel = { uren?: number | null; reis_km?: number | null; kostprijsPerUur?: number | null };

export type Arbeid = { uren: number; km: number; bedrag: number; urenZonderKostprijs: number };

/** De arbeid van `bouwKostenOverzicht`: uren × kostprijs per uur, uren zonder kostprijs apart. */
export function arbeidUitUren(urenRegels: UrenRegel[] = []): Arbeid {
  let uren = 0;
  let km = 0;
  let bedrag = 0;
  let zonder = 0;
  for (const u of urenRegels) {
    const n = Number(u.uren) || 0;
    uren += n;
    km += Number(u.reis_km) || 0;
    const kp = u.kostprijsPerUur;
    if (kp == null || !Number.isFinite(Number(kp))) zonder += n;
    else bedrag += n * Number(kp);
  }
  return { uren: rond(uren), km: rond(km), bedrag: rond(bedrag), urenZonderKostprijs: rond(zonder) };
}

/** "1 uur", "2,5 uur": voor de meldingen over uren zonder kostprijs. */
export const fmtUren = (n: number) => `${Number(n || 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur`;

// ── Het overzicht ──────────────────────────────────────────────────────────

export type KostenOverzicht = {
  materiaal: { regels: ProjectJobCost[]; bedrag: number; zonderInkoopprijs: number; geschatBedrag: number };
  inkopen: { regels: ProjectKost[]; bedrag: number };
  arbeid: Arbeid;
  boekingen: { regels: ProjectJobCost[]; bedrag: number };
  totaal: number;
};

export const LEEG_OVERZICHT: KostenOverzicht = {
  materiaal: { regels: [], bedrag: 0, zonderInkoopprijs: 0, geschatBedrag: 0 },
  inkopen: { regels: [], bedrag: 0 },
  arbeid: { uren: 0, km: 0, bedrag: 0, urenZonderKostprijs: 0 },
  boekingen: { regels: [], bedrag: 0 },
  totaal: 0,
};

/** `bouwKostenOverzicht` van het dashboard: de tegels en de regels uit één bron. */
export function bouwKostenOverzicht({
  jobCosts = [],
  projectKosten = [],
  urenRegels = [],
}: {
  jobCosts?: ProjectJobCost[];
  projectKosten?: ProjectKost[];
  urenRegels?: UrenRegel[];
}): KostenOverzicht {
  const materiaalRegels = jobCosts.filter(isWerkbonMateriaal);
  const boekingRegels = jobCosts.filter((k) => !isWerkbonMateriaal(k));
  const inkoop = inkoopwaardeVanKosten(materiaalRegels);
  const inkopenBedrag = rond(projectKosten.reduce((s, k) => s + (Number(k.bedrag) || 0), 0));
  const boekingenBedrag = rond(boekingRegels.reduce((s, k) => s + (Number(k.amount) || 0), 0));
  const arbeid = arbeidUitUren(urenRegels);
  return {
    materiaal: {
      regels: materiaalRegels,
      bedrag: inkoop.materiaalInkoop,
      zonderInkoopprijs: inkoop.zonderInkoopprijs,
      geschatBedrag: inkoop.geschatBedrag,
    },
    inkopen: { regels: projectKosten, bedrag: inkopenBedrag },
    arbeid,
    boekingen: { regels: boekingRegels, bedrag: boekingenBedrag },
    totaal: rond(arbeid.bedrag + inkoop.materiaalInkoop + inkopenBedrag),
  };
}

// ── Begroting: de geaccepteerde offertes van een project ──────────────────
// Uit de RPC `bb_project_begroting` (migratie 20261107143517): dezelfde
// offertes als de projectwaarde, met de interne calculatie per regel. Alleen
// voor wie kosten én kostprijzen mag zien; anders komt er niets terug.

export type Begroting = {
  aantalOffertes: number;
  opdrachtExcl: number;
  uren: number;
  arbeid: number;
  urenZonderKostprijs: number;
  materiaal: number;
  regelsZonderCalculatie: number;
  totaal: number;
};

/** `naarBegroting`: één rij van `bb_project_begroting`. */
export function naarBegroting(r: Record<string, unknown>): Begroting {
  const arbeid = Number(r.arbeid_kosten) || 0;
  const materiaal = Number(r.materiaal_kosten) || 0;
  return {
    aantalOffertes: Number(r.aantal_offertes) || 0,
    opdrachtExcl: Number(r.opdracht_excl) || 0,
    uren: Number(r.begrote_uren) || 0,
    arbeid,
    urenZonderKostprijs: Number(r.uren_zonder_kostprijs) || 0,
    materiaal,
    regelsZonderCalculatie: Number(r.regels_zonder_calculatie) || 0,
    totaal: rond(arbeid + materiaal),
  };
}

/** Begrotingen van meerdere projecten (een klant) bij elkaar; null zonder één. */
export function telBegrotingenOp(lijst: (Begroting | null | undefined)[] = []): Begroting | null {
  const som = lijst.filter((b): b is Begroting => Boolean(b));
  if (!som.length) return null;
  const tel = (k: keyof Begroting) => som.reduce((s, b) => s + (Number(b[k]) || 0), 0);
  return {
    aantalOffertes: tel('aantalOffertes'),
    opdrachtExcl: rond(tel('opdrachtExcl')),
    uren: rond(tel('uren')),
    arbeid: rond(tel('arbeid')),
    urenZonderKostprijs: rond(tel('urenZonderKostprijs')),
    materiaal: rond(tel('materiaal')),
    regelsZonderCalculatie: tel('regelsZonderCalculatie'),
    totaal: rond(tel('totaal')),
  };
}

// ── Nacalculatie: begroot tegenover werkelijk ─────────────────────────────

export type Nacalculatie = {
  heeftBegroting: boolean;
  arbeid: {
    begroot: number | null;
    werkelijk: number;
    urenBegroot: number | null;
    urenWerkelijk: number;
    urenZonderKostprijs: number;
    begrootUrenZonderKostprijs: number;
  };
  materiaal: {
    begroot: number | null;
    werkelijk: number;
    materiaal: number;
    inkopen: number;
    regelsZonderCalculatie: number;
  };
  kosten: { begroot: number | null; werkelijk: number };
  opbrengst: { begroot: number | null; werkelijk: number };
  resultaat: {
    begroot: number | null;
    werkelijk: number;
    margeBegroot: number | null;
    margeWerkelijk: number | null;
  };
  nogTeFactureren: number;
  /**
   * Nog niet alles gefactureerd: het werkelijke resultaat is dan een
   * tussenstand, geen uitkomst. Niet rood kleuren en niet vergelijken.
   */
  voorlopig: boolean;
  /** Arbeid zonder kostprijs: het resultaat is dan te hoog. */
  onvolledig: boolean;
};

/**
 * `bouwNacalculatie`: alles excl. btw. Werkelijk resultaat = gefactureerd −
 * werkelijke kosten. Begroot resultaat = opdrachtwaarde (geaccepteerde
 * offertes) − begrote kosten. Zolang niet alles gefactureerd is, staat "nog te
 * factureren" erbij: dat is geen verlies.
 */
export function bouwNacalculatie({
  overzicht = LEEG_OVERZICHT,
  begroting = null,
  gefactureerdExcl = 0,
}: {
  overzicht?: Pick<KostenOverzicht, 'materiaal' | 'inkopen' | 'arbeid' | 'totaal'>;
  begroting?: Begroting | null;
  gefactureerdExcl?: number;
} = {}): Nacalculatie {
  const b = begroting;
  const matWerkelijk = rond(overzicht.materiaal.bedrag + overzicht.inkopen.bedrag);
  const kostenWerkelijk = overzicht.totaal;
  const opbrengst = rond(gefactureerdExcl);
  const resultaat = rond(opbrengst - kostenWerkelijk);
  const pct = (deel: number, geheel: number) => (geheel > 0 ? Math.round((deel / geheel) * 1000) / 10 : null);
  return {
    heeftBegroting: Boolean(b && b.aantalOffertes > 0),
    arbeid: {
      begroot: b ? b.arbeid : null,
      werkelijk: overzicht.arbeid.bedrag,
      urenBegroot: b ? b.uren : null,
      urenWerkelijk: overzicht.arbeid.uren,
      urenZonderKostprijs: overzicht.arbeid.urenZonderKostprijs,
      begrootUrenZonderKostprijs: b ? b.urenZonderKostprijs : 0,
    },
    materiaal: {
      begroot: b ? b.materiaal : null,
      werkelijk: matWerkelijk,
      materiaal: overzicht.materiaal.bedrag,
      inkopen: overzicht.inkopen.bedrag,
      regelsZonderCalculatie: b ? b.regelsZonderCalculatie : 0,
    },
    kosten: { begroot: b ? b.totaal : null, werkelijk: kostenWerkelijk },
    opbrengst: { begroot: b ? b.opdrachtExcl : null, werkelijk: opbrengst },
    resultaat: {
      begroot: b ? rond(b.opdrachtExcl - b.totaal) : null,
      werkelijk: resultaat,
      margeBegroot: b ? pct(b.opdrachtExcl - b.totaal, b.opdrachtExcl) : null,
      margeWerkelijk: pct(resultaat, opbrengst),
    },
    nogTeFactureren: b ? Math.max(0, rond(b.opdrachtExcl - opbrengst)) : 0,
    voorlopig: Boolean(b && b.opdrachtExcl - opbrengst > 0.5),
    onvolledig: overzicht.arbeid.urenZonderKostprijs > 0,
  };
}

/**
 * Verschil = werkelijk − begroot, zoals `Verschil` in NacalculatieTabel.jsx.
 * Bij kosten is een plus slecht (duurder dan gedacht), bij opbrengst en
 * resultaat goed. Onder een halve euro is het "gelijk". Zonder begroting, of
 * met een voorlopig werkelijk bedrag (null), geen verschil.
 */
export function nacalculatieVerschil(
  begroot: number | null,
  werkelijk: number | null,
  kostenKant: boolean,
): { soort: 'leeg' | 'gelijk' | 'goed' | 'slecht'; bedrag: number; teken: '+' | '−' | '' } {
  if (begroot == null || werkelijk == null) return { soort: 'leeg', bedrag: 0, teken: '' };
  const v = rond(werkelijk - begroot);
  if (Math.abs(v) < 0.5) return { soort: 'gelijk', bedrag: 0, teken: '' };
  const goed = kostenKant ? v < 0 : v > 0;
  return { soort: goed ? 'goed' : 'slecht', bedrag: Math.abs(v), teken: v > 0 ? '+' : '−' };
}

/**
 * De meldingen onder de nacalculatie, in de woorden van het dashboard
 * (NacalculatieTabel.jsx). Het resultaat zegt nooit meer dan het weet: uren
 * zonder kostprijs en regels zonder calculatie worden genoemd, niet stil als
 * € 0 gerekend. De kostprijs per uur en de calculatie van een offerte stel je
 * (nog) in het dashboard in; daar verwijzen de teksten naar.
 */
export function nacalculatieMeldingen(
  nc: Nacalculatie,
  {
    magBedragen = true,
    isAdmin = false,
    wat = 'project',
    fmt,
  }: { magBedragen?: boolean; isAdmin?: boolean; wat?: 'project' | 'klant'; fmt: (n: number) => string },
): { letOp: boolean; tekst: string }[] {
  const { arbeid, materiaal } = nc;
  const uit: { letOp: boolean; tekst: string }[] = [];
  if (arbeid.urenZonderKostprijs > 0) {
    const een = arbeid.urenZonderKostprijs === 1;
    uit.push({
      letOp: true,
      tekst: `${fmtUren(arbeid.urenZonderKostprijs)} op de werkbonnen ${een ? 'heeft' : 'hebben'} geen kostprijs per uur en ${
        een ? 'telt' : 'tellen'
      } niet mee in de arbeid. Het resultaat is daardoor te hoog.${
        isAdmin ? ' Stel de kostprijs per uur in via het dashboard, bij Instellingen › Tarieven en termijnen.' : ''
      }`,
    });
  }
  if (nc.heeftBegroting && arbeid.begrootUrenZonderKostprijs > 0) {
    uit.push({
      letOp: true,
      tekst: `${fmtUren(arbeid.begrootUrenZonderKostprijs)} in de offerte ${
        arbeid.begrootUrenZonderKostprijs === 1 ? 'is' : 'zijn'
      } begroot zonder kostprijs per uur. Vul die in bij de calculatie van de offerte, in het dashboard.`,
    });
  }
  if (nc.heeftBegroting && materiaal.regelsZonderCalculatie > 0) {
    uit.push({
      letOp: true,
      tekst: `${
        materiaal.regelsZonderCalculatie === 1
          ? '1 offerteregel heeft'
          : `${materiaal.regelsZonderCalculatie} offerteregels hebben`
      } geen calculatie (uren of kostprijs). De begrote kosten zijn daardoor te laag. Vul ze in bij de offerte, onder Calculatie (in het dashboard).`,
    });
  }
  if (!nc.heeftBegroting) {
    uit.push({
      letOp: false,
      tekst:
        wat === 'klant'
          ? 'Geen geaccepteerde offertes bij de projecten van deze klant: de kolom Begroot blijft leeg.'
          : 'Nog geen geaccepteerde offerte bij dit project: de kolom Begroot blijft leeg. Een geaccepteerde offerte met calculatie wordt de begroting.',
    });
  }
  if (magBedragen && nc.nogTeFactureren > 0.5) {
    uit.push({
      letOp: false,
      tekst: `Nog te factureren: ${fmt(nc.nogTeFactureren)} excl. btw. Tot alles gefactureerd is, is het werkelijke resultaat een tussenstand. Bij de kosten zegt Verschil hoeveel er van de begroting over is (min) of hoeveel je erboven zit (plus).`,
    });
  }
  return uit;
}

/** "Materiaal: Verf wit" → "Verf wit", zoals de materiaallijst van het dashboard. */
export const materiaalNaam = (desc: string | null | undefined) => (desc || '').replace(/^Materiaal:\s*/i, '');
