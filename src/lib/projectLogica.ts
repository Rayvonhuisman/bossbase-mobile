/**
 * Pure regels achter de projectenpagina — overgenomen uit het dashboard
 * (`projectsService.js`, `ProjectsPage.jsx`, `customerTotalsService.js`,
 * `ProjectDetailDrawer.jsx`). Geen imports, zodat `tests/projecten.test.mjs`
 * ze los in Node kan draaien.
 *
 * De projectstatus wordt niet getypt maar door de database afgeleid uit de
 * werkbonnen (trigger `bb_project_status_bijwerken`), en de check-constraint
 * `projects_status_check` laat alleen deze drie waarden toe.
 */

export const PROJECT_STATUS: Record<string, string> = {
  gepland: 'Gepland',
  in_uitvoering: 'In uitvoering',
  afgerond: 'Afgerond',
};

export function projectStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Gepland';
  return PROJECT_STATUS[status] ?? status;
}

// ── Facturen → bedragen ────────────────────────────────────────────────────

export type FactuurBedrag = {
  status: string | null;
  totaal_incl: number | null;
  totaal_excl: number | null;
};

/** Gefactureerd (incl. btw): alles behalve concepten; credit trekt zichzelf af. */
export function sumGefactureerd(f: FactuurBedrag[]): number {
  return f
    .filter((x) => x.status !== 'concept')
    .reduce((s, x) => s + (Number(x.totaal_incl) || 0), 0);
}

/** Omzet excl. btw, zelfde selectie als hierboven. */
export function sumOmzetExclBtw(f: FactuurBedrag[]): number {
  return f
    .filter((x) => x.status !== 'concept')
    .reduce((s, x) => s + (Number(x.totaal_excl) || 0), 0);
}

const rond = (n: number) => Math.round(n * 100) / 100;

export type ProjectCijfers = {
  usedHours: number;
  hoursPercentage: number;
  invoicedAmount: number;
  omzetExclBtw: number;
  remainingToInvoice: number;
};

/** `enrichProject` uit het dashboard. Projectwaarde is excl. btw. */
export function projectCijfers(
  p: { project_value: number | null; quoted_hours: number | null },
  usedHours: number,
  facturen: FactuurBedrag[],
): ProjectCijfers {
  const quoted = Number(p.quoted_hours || 0);
  const gefactureerd = sumGefactureerd(facturen);
  const omzet = sumOmzetExclBtw(facturen);
  const waarde = Number(p.project_value || 0);
  return {
    usedHours: rond(usedHours),
    hoursPercentage: quoted > 0 ? usedHours / quoted : 0,
    invoicedAmount: rond(gefactureerd),
    omzetExclBtw: rond(omzet),
    remainingToInvoice: rond(Math.max(0, waarde - omzet)),
  };
}

// ── Lijstfilter en KPI's ───────────────────────────────────────────────────

export type ProjectStatusFilter = 'all' | 'gepland' | 'in_uitvoering' | 'afgerond';
export type FacturatieFilter = 'all' | 'unbilled' | 'billed';

export type ProjectLijstItem = {
  name: string | null;
  description: string | null;
  status: string | null;
  project_value: number | null;
  customerName?: string | null;
  dealTitle?: string | null;
  offerteNummer?: string | null;
} & ProjectCijfers;

export function filterProjecten<P extends ProjectLijstItem>(
  lijst: P[],
  status: ProjectStatusFilter,
  facturatie: FacturatieFilter,
  zoek: string,
): P[] {
  const q = zoek.trim().toLowerCase();
  return lijst.filter((p) => {
    if (status !== 'all' && (p.status || 'gepland') !== status) return false;
    if (facturatie === 'unbilled' && !(p.remainingToInvoice > 0)) return false;
    if (facturatie === 'billed' && !(p.invoicedAmount > 0)) return false;
    if (!q) return true;
    const hooi = [p.name, p.customerName, p.dealTitle, p.offerteNummer, p.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hooi.includes(q);
  });
}

export function projectKpi(lijst: ProjectLijstItem[]) {
  const actief = lijst.filter((p) => p.status !== 'afgerond');
  return {
    actief: actief.length,
    totaleWaarde: actief.reduce((s, p) => s + Number(p.project_value || 0), 0),
    teFactureren: lijst.reduce((s, p) => s + (p.remainingToInvoice || 0), 0),
    uren: lijst.reduce((s, p) => s + (p.usedHours || 0), 0),
  };
}

/** Deadline verstreken en het project is nog niet afgerond. */
export function isVerlopen(
  deadline: string | null | undefined,
  status: string | null | undefined,
  vandaag: string,
): boolean {
  return Boolean(deadline && deadline < vandaag && status !== 'afgerond');
}

/** Kleurtoon van het urenpercentage: >100% rood, ≥80% oranje. */
export function urenToon(percentage: number): 'rood' | 'oranje' | 'normaal' {
  if (percentage > 1) return 'rood';
  if (percentage >= 0.8) return 'oranje';
  return 'normaal';
}

export function formatUren(h: number | null | undefined): string {
  const n = Number(h || 0);
  return `${n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}u`;
}

// ── Planning uit werkbonnen ────────────────────────────────────────────────

export type WerkbonPlanbaar = {
  id: string;
  titel: string | null;
  gepland_op: string | null;
  starttijd: string | null;
  eindtijd: string | null;
  assigned_to_ids?: string[] | null;
  werkbon_dagen?:
    | {
        datum: string | null;
        starttijd: string | null;
        eindtijd: string | null;
        medewerker_ids?: string[] | null;
      }[]
    | null;
};

export type PlanRegel = {
  sleutel: string;
  werkbonId: string;
  titel: string;
  datum: string;
  starttijd: string | null;
  eindtijd: string | null;
  wie: string[];
};

const hhmm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : null);

/**
 * Eén regel per werkbondag, op datum gesorteerd. Zonder dagen telt
 * `gepland_op` met de werkbontijden.
 */
export function planRegels(
  werkbonnen: WerkbonPlanbaar[],
  naamVan: (id: string) => string | null,
): PlanRegel[] {
  const regels: PlanRegel[] = [];
  for (const w of werkbonnen) {
    const dagen = (w.werkbon_dagen ?? []).filter((d) => d.datum);
    const bron = dagen.length
      ? dagen
      : w.gepland_op
        ? [{ datum: w.gepland_op, starttijd: w.starttijd, eindtijd: w.eindtijd, medewerker_ids: w.assigned_to_ids ?? [] }]
        : [];
    for (const d of bron) {
      regels.push({
        sleutel: `${w.id}-${d.datum}`,
        werkbonId: w.id,
        titel: w.titel || 'Werkbon',
        datum: String(d.datum).slice(0, 10),
        starttijd: hhmm(d.starttijd ?? w.starttijd),
        eindtijd: hhmm(d.eindtijd ?? w.eindtijd),
        wie: (d.medewerker_ids ?? []).map((id) => naamVan(id)).filter((n): n is string => !!n),
      });
    }
  }
  return regels.sort((a, b) => a.datum.localeCompare(b.datum));
}

const nlDatum = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d ? `${d}-${m}-${y}` : iso;
};

/** "Wanneer" in het aanvraagblok: zelfde volgorde als het dashboard. */
export function wanneerLabel(regels: PlanRegel[], startDate: string | null, vandaag: string): string {
  const komend = regels.filter((r) => r.datum >= vandaag);
  const eerste = komend[0];
  if (eerste) {
    const extra = komend.length - 1;
    return `Ingepland ${nlDatum(eerste.datum)}${extra > 0 ? ` (+${extra} ${extra === 1 ? 'dag' : 'dagen'})` : ''}`;
  }
  const begin = regels[0];
  const eind = regels[regels.length - 1];
  if (begin && eind && regels.length === 1) return nlDatum(begin.datum);
  if (begin && eind) return `${nlDatum(begin.datum)} t/m ${nlDatum(eind.datum)}`;
  return startDate ? `Gestart ${nlDatum(startDate)}` : 'Nog niet ingepland';
}

/** Uitleg onder de projectwaarde (`waarde_bron`). */
export function waardeBronUitleg(bron: string | null | undefined): string {
  if (bron === 'offertes') return 'Som van de geaccepteerde offertes, excl. btw';
  if (bron === 'handmatig') return 'Met de hand ingesteld';
  return 'Geschat in de aanvraag';
}

// ── Tabs van de projectkaart ───────────────────────────────────────────────

export type ProjectTab = 'overzicht' | 'offertes' | 'facturen' | 'uren' | 'kosten' | 'werkbonnen' | 'notities';

export const PROJECT_TABS: { id: ProjectTab; label: string }[] = [
  { id: 'overzicht', label: 'Overzicht' },
  { id: 'offertes', label: 'Offertes' },
  { id: 'facturen', label: 'Facturen' },
  { id: 'uren', label: 'Uren' },
  { id: 'kosten', label: 'Kosten' },
  { id: 'werkbonnen', label: 'Werkbonnen' },
  { id: 'notities', label: 'Notities' },
];

/**
 * `zichtbareTabs` uit `ProjectDetailDrawer.jsx`: dezelfde rechten en
 * pakket-eisen als de losse pagina's, anders is de projectkaart een achterdeur
 * naar offertes, facturen, kosten en werkbonnen.
 */
export function zichtbareProjectTabs(
  can: (recht: string) => boolean,
  hasFeature: (feature: string) => boolean,
): { id: ProjectTab; label: string }[] {
  const mag: Record<ProjectTab, boolean> = {
    overzicht: true,
    notities: true,
    uren: true,
    offertes: can('offertes'),
    facturen: can('facturen'),
    kosten: can('kosten') && hasFeature('kosten_nacalculatie'),
    werkbonnen: hasFeature('werkbonnen'),
  };
  return PROJECT_TABS.filter((t) => mag[t.id]);
}

/** Begroot, geregistreerd en resterend, zoals de Uren-tab van het dashboard. */
export function urenOverzicht(quoted: number | null | undefined, gebruikt: number) {
  const begroot = Number(quoted || 0);
  return {
    begroot: rond(begroot),
    gebruikt: rond(gebruikt),
    resterend: rond(Math.max(0, begroot - gebruikt)),
    percentage: begroot > 0 ? gebruikt / begroot : 0,
  };
}

/** Takenvoortgang van een werkbon; meerwerk telt niet mee (getAllWerkbonTakenCounts). */
export function takenVoortgang(taken: { afgerond: boolean | null; is_meerwerk?: boolean | null }[] | null | undefined) {
  const tellend = (taken ?? []).filter((t) => !t.is_meerwerk);
  const klaar = tellend.filter((t) => t.afgerond).length;
  return { klaar, totaal: tellend.length, pct: tellend.length ? Math.round((klaar / tellend.length) * 100) : 0 };
}
