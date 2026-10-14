/**
 * Database & Export — de filter-, pagineer- en exportlogica van
 * `DatabasePage.jsx` in het dashboard, als pure functies (geen React, geen
 * Supabase), zodat ze in Node getest kunnen worden.
 *
 * Twee bewuste verschillen met het dashboard, allebei reparaties van filters
 * die daar nooit iets vonden:
 *  - Activiteiten worden op `customer_id` aan een klant gekoppeld (het
 *    dashboard las `a.customerId`, dat op een activiteit niet bestaat).
 *  - "Overschrijding uren" vergelijkt met de echte werkbonuren per project
 *    (het dashboard las `usedHours`, dat niet meer op een project staat).
 */

export type DbKlant = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  city: string | null;
  kvk_number: string | null;
  btw_number: string | null;
  iban: string | null;
  type: string | null;
  source: string | null;
  moneybird_id: string | null;
  created_at: string | null;
};

export type DbProject = {
  id: string;
  customer_id: string | null;
  name: string;
  status: string;
  start_date: string | null;
  deadline: string | null;
  quoted_hours: number;
  used_hours: number;
  owner_id: string | null;
  created_at: string | null;
};

export type DbFactuur = {
  id: string;
  customer_id: string | null;
  status: string;
  factuurdatum: string | null;
  vervaldatum: string | null;
  totaal_incl: number;
  betaald_op: string | null;
  herinnering_1_verstuurd_at: string | null;
  herinnering_2_verstuurd_at: string | null;
  is_credit: boolean;
  gecrediteerd: boolean;
};

export type DbOfferte = {
  id: string;
  customer_id: string | null;
  status: string;
  geldig_tot: string | null;
  totaal_incl: number;
  signed_at: string | null;
  created_at: string | null;
};

export type DbDeal = {
  id: string;
  customer_id: string | null;
  stage_id: string | null;
  value: number;
  lost_reason: string | null;
};

export type DbActiviteit = {
  id: string;
  customer_id: string | null;
  type: string;
  due_at: string | null;
  completed: boolean;
};

export type DbMail = {
  id: string;
  customer_id: string | null;
  subject: string | null;
  sent_at: string | null;
  related_type: string | null;
};

export type DbUur = { customer_id: string | null; project_id: string | null };

export type DatabaseData = {
  klanten: DbKlant[];
  projecten: DbProject[];
  facturen: DbFactuur[];
  offertes: DbOfferte[];
  deals: DbDeal[];
  activiteiten: DbActiviteit[];
  mails: DbMail[];
  uren: DbUur[];
};

export type KlantRelaties = {
  projecten: DbProject[];
  facturen: DbFactuur[];
  offertes: DbOfferte[];
  deals: DbDeal[];
  activiteiten: DbActiviteit[];
  mails: DbMail[];
};

const leegRel = (): KlantRelaties => ({
  projecten: [],
  facturen: [],
  offertes: [],
  deals: [],
  activiteiten: [],
  mails: [],
});

/** `byCustomer` uit het dashboard: alles per klant geïndexeerd. */
export function indexeerPerKlant(d: DatabaseData): Map<string, KlantRelaties> {
  const m = new Map<string, KlantRelaties>();
  const rel = (id: string) => {
    let r = m.get(id);
    if (!r) {
      r = leegRel();
      m.set(id, r);
    }
    return r;
  };
  for (const k of d.klanten) rel(k.id);
  for (const p of d.projecten) if (p.customer_id) rel(p.customer_id).projecten.push(p);
  for (const f of d.facturen) if (f.customer_id) rel(f.customer_id).facturen.push(f);
  for (const o of d.offertes) if (o.customer_id) rel(o.customer_id).offertes.push(o);
  for (const x of d.deals) if (x.customer_id) rel(x.customer_id).deals.push(x);
  for (const a of d.activiteiten) if (a.customer_id) rel(a.customer_id).activiteiten.push(a);
  for (const e of d.mails) if (e.customer_id) rel(e.customer_id).mails.push(e);
  return m;
}

export type JaNee = 'alles' | 'ja' | 'nee';

export type DbFilters = {
  stad: string;
  aanmaakVan: string;
  aanmaakTot: string;
  heeftKvk: JaNee;
  heeftMoneybird: JaNee;
  geenProject: boolean;
  laatsteContactDagen: string;
  projectStatussen: string[];
  projectStartVan: string;
  projectStartTot: string;
  projectDeadlineVan: string;
  projectDeadlineTot: string;
  heeftOverrun: boolean;
  heeftLopendProject: boolean;
  projectMedewerker: string;
  offerteStatussen: string[];
  offerteVerlopen: boolean;
  offerteOndertekend: JaNee;
  offerteBedragMin: string;
  offerteBedragMax: string;
  factuurStatussen: string[];
  factuurVervallen: boolean;
  herinnering1: JaNee;
  herinnering2: JaNee;
  isCreditnota: boolean;
  betaaldVan: string;
  betaaldTot: string;
  dealFasen: string[];
  dealVerlorenRedenen: string[];
  dealWaardeMin: string;
  dealWaardeMax: string;
  heeftOpenActiviteiten: boolean;
  activiteitTypen: string[];
  heeftMail: JaNee;
  mailOuderDanDagen: string;
  mailTemplateType: string;
  heeftFactureerbareUren: boolean;
  heeftOffertes: boolean;
  heeftFacturen: boolean;
  heeftGetekendOfferte: boolean;
  heeftOnbetaaldeFacturen: boolean;
  heeftVerlopenOffertes: boolean;
  documentenPeriodeVan: string;
  documentenPeriodeTot: string;
};

export const LEGE_FILTERS: DbFilters = {
  stad: '',
  aanmaakVan: '',
  aanmaakTot: '',
  heeftKvk: 'alles',
  heeftMoneybird: 'alles',
  geenProject: false,
  laatsteContactDagen: '',
  projectStatussen: [],
  projectStartVan: '',
  projectStartTot: '',
  projectDeadlineVan: '',
  projectDeadlineTot: '',
  heeftOverrun: false,
  heeftLopendProject: false,
  projectMedewerker: '',
  offerteStatussen: [],
  offerteVerlopen: false,
  offerteOndertekend: 'alles',
  offerteBedragMin: '',
  offerteBedragMax: '',
  factuurStatussen: [],
  factuurVervallen: false,
  herinnering1: 'alles',
  herinnering2: 'alles',
  isCreditnota: false,
  betaaldVan: '',
  betaaldTot: '',
  dealFasen: [],
  dealVerlorenRedenen: [],
  dealWaardeMin: '',
  dealWaardeMax: '',
  heeftOpenActiviteiten: false,
  activiteitTypen: [],
  heeftMail: 'alles',
  mailOuderDanDagen: '',
  mailTemplateType: '',
  heeftFactureerbareUren: false,
  heeftOffertes: false,
  heeftFacturen: false,
  heeftGetekendOfferte: false,
  heeftOnbetaaldeFacturen: false,
  heeftVerlopenOffertes: false,
  documentenPeriodeVan: '',
  documentenPeriodeTot: '',
};

/** Hoeveel filters wijken af van leeg? (0 = geen filters actief.) */
export function aantalActieveFilters(f: DbFilters): number {
  let n = 0;
  for (const k of Object.keys(LEGE_FILTERS) as (keyof DbFilters)[]) {
    const v = f[k];
    const leeg = LEGE_FILTERS[k];
    if (Array.isArray(leeg)) {
      if ((v as string[]).length > 0) n += 1;
    } else if (v !== leeg) {
      n += 1;
    }
  }
  return n;
}

export type SnelTab = 'alle' | 'lopend_project';

const PAD = (n: number) => String(n).padStart(2, '0');
export const isoDatum = (d: Date) => `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`;
const dagenGeleden = (n: number, nu: Date) => {
  const d = new Date(nu);
  d.setDate(d.getDate() - n);
  return isoDatum(d);
};

const lopend = (p: DbProject) => p.status === 'in_uitvoering' || p.status === 'gepland';
const getal = (s: string) => Number(s.replace(',', '.'));

function jaNee(keuze: JaNee, heeft: boolean): boolean {
  if (keuze === 'ja') return heeft;
  if (keuze === 'nee') return !heeft;
  return true;
}

/** De filterfunctie van het dashboard, regel voor regel. */
export function filterKlanten(
  d: DatabaseData,
  perKlant: Map<string, KlantRelaties>,
  filters: DbFilters,
  opties: { zoek: string; tab: SnelTab; nu?: Date },
): DbKlant[] {
  const nu = opties.nu ?? new Date();
  const vandaag = isoDatum(nu);
  const zoek = opties.zoek.trim().toLowerCase();
  const f = filters;
  const urenPerKlant = new Set(d.uren.map((u) => u.customer_id).filter(Boolean) as string[]);
  const urenPerProject = new Set(d.uren.map((u) => u.project_id).filter(Boolean) as string[]);

  return d.klanten.filter((c) => {
    const rel = perKlant.get(c.id) ?? leegRel();

    if (zoek && !(c.name || '').toLowerCase().includes(zoek)) return false;
    if (opties.tab === 'lopend_project' && !rel.projecten.some(lopend)) return false;

    if (f.stad && !(c.city || '').toLowerCase().includes(f.stad.toLowerCase())) return false;
    const aangemaakt = (c.created_at ?? '').slice(0, 10);
    if (f.aanmaakVan && aangemaakt < f.aanmaakVan) return false;
    if (f.aanmaakTot && aangemaakt > f.aanmaakTot) return false;
    if (!jaNee(f.heeftKvk, Boolean(c.kvk_number))) return false;
    if (!jaNee(f.heeftMoneybird, Boolean(c.moneybird_id))) return false;
    if (f.geenProject && rel.projecten.length > 0) return false;
    if (f.laatsteContactDagen) {
      const grens = dagenGeleden(Number(f.laatsteContactDagen), nu);
      const laatste = [
        ...rel.mails.map((m) => m.sent_at ?? ''),
        ...rel.activiteiten.map((a) => a.due_at ?? ''),
      ]
        .filter(Boolean)
        .sort()
        .reverse()[0];
      if (laatste && laatste.slice(0, 10) >= grens) return false;
    }

    if (f.projectStatussen.length && !rel.projecten.some((p) => f.projectStatussen.includes(p.status))) return false;
    if (f.projectStartVan && !rel.projecten.some((p) => (p.start_date ?? '') >= f.projectStartVan && !!p.start_date)) return false;
    if (f.projectStartTot && !rel.projecten.some((p) => !!p.start_date && (p.start_date ?? '') <= f.projectStartTot)) return false;
    if (f.projectDeadlineVan && !rel.projecten.some((p) => !!p.deadline && (p.deadline ?? '') >= f.projectDeadlineVan)) return false;
    if (f.projectDeadlineTot && !rel.projecten.some((p) => !!p.deadline && (p.deadline ?? '') <= f.projectDeadlineTot)) return false;
    if (f.heeftOverrun && !rel.projecten.some((p) => (p.used_hours || 0) > (p.quoted_hours || 0))) return false;
    if (f.heeftLopendProject && !rel.projecten.some(lopend)) return false;
    if (f.projectMedewerker && !rel.projecten.some((p) => p.owner_id === f.projectMedewerker)) return false;

    const verlopenOfferte = (o: DbOfferte) => o.status === 'verzonden' && !!o.geldig_tot && o.geldig_tot < vandaag;
    if (f.offerteStatussen.length && !rel.offertes.some((o) => f.offerteStatussen.includes(o.status))) return false;
    if (f.offerteVerlopen && !rel.offertes.some(verlopenOfferte)) return false;
    if (!jaNee(f.offerteOndertekend, rel.offertes.some((o) => Boolean(o.signed_at)))) return false;
    if (f.offerteBedragMin && !rel.offertes.some((o) => o.totaal_incl >= getal(f.offerteBedragMin))) return false;
    if (f.offerteBedragMax && !rel.offertes.some((o) => o.totaal_incl <= getal(f.offerteBedragMax))) return false;

    if (f.factuurStatussen.length && !rel.facturen.some((x) => f.factuurStatussen.includes(x.status))) return false;
    if (f.factuurVervallen && !rel.facturen.some((x) => x.status === 'verzonden' && !!x.vervaldatum && x.vervaldatum < vandaag)) return false;
    if (!jaNee(f.herinnering1, rel.facturen.some((x) => Boolean(x.herinnering_1_verstuurd_at)))) return false;
    if (!jaNee(f.herinnering2, rel.facturen.some((x) => Boolean(x.herinnering_2_verstuurd_at)))) return false;
    if (f.isCreditnota && !rel.facturen.some((x) => x.is_credit)) return false;
    if (f.betaaldVan && !rel.facturen.some((x) => !!x.betaald_op && x.betaald_op >= f.betaaldVan)) return false;
    if (f.betaaldTot && !rel.facturen.some((x) => !!x.betaald_op && x.betaald_op <= f.betaaldTot)) return false;

    if (f.dealFasen.length && !rel.deals.some((x) => !!x.stage_id && f.dealFasen.includes(x.stage_id))) return false;
    if (f.dealVerlorenRedenen.length && !rel.deals.some((x) => !!x.lost_reason && f.dealVerlorenRedenen.includes(x.lost_reason))) return false;
    if (f.dealWaardeMin && !rel.deals.some((x) => (x.value || 0) >= getal(f.dealWaardeMin))) return false;
    if (f.dealWaardeMax && !rel.deals.some((x) => (x.value || 0) <= getal(f.dealWaardeMax))) return false;
    if (f.heeftOpenActiviteiten && !rel.activiteiten.some((a) => !a.completed)) return false;
    if (f.activiteitTypen.length && !rel.activiteiten.some((a) => f.activiteitTypen.includes(a.type))) return false;

    if (!jaNee(f.heeftMail, rel.mails.length > 0)) return false;
    if (f.mailOuderDanDagen) {
      const grens = dagenGeleden(Number(f.mailOuderDanDagen), nu);
      const laatste = rel.mails.map((m) => m.sent_at ?? '').filter(Boolean).sort().reverse()[0];
      if (laatste && laatste.slice(0, 10) >= grens) return false;
    }
    if (f.mailTemplateType && !rel.mails.some((m) => m.related_type === f.mailTemplateType)) return false;

    if (f.heeftFactureerbareUren) {
      const heeft = urenPerKlant.has(c.id) || rel.projecten.some((p) => urenPerProject.has(p.id));
      if (!heeft) return false;
    }

    if (f.heeftOffertes && rel.offertes.length === 0) return false;
    if (f.heeftFacturen && rel.facturen.length === 0) return false;
    if (f.heeftGetekendOfferte && !rel.offertes.some((o) => Boolean(o.signed_at))) return false;
    if (f.heeftOnbetaaldeFacturen && !rel.facturen.some((x) => x.status !== 'betaald' && !x.is_credit)) return false;
    if (f.heeftVerlopenOffertes && !rel.offertes.some(verlopenOfferte)) return false;
    if (f.documentenPeriodeVan) {
      const ok =
        rel.offertes.some((o) => (o.created_at ?? '').slice(0, 10) >= f.documentenPeriodeVan) ||
        rel.facturen.some((x) => (x.factuurdatum ?? '') >= f.documentenPeriodeVan);
      if (!ok) return false;
    }
    if (f.documentenPeriodeTot) {
      const ok =
        rel.offertes.some((o) => !!o.created_at && o.created_at.slice(0, 10) <= f.documentenPeriodeTot) ||
        rel.facturen.some((x) => !!x.factuurdatum && x.factuurdatum <= f.documentenPeriodeTot);
      if (!ok) return false;
    }
    return true;
  });
}

// ── Paginering ─────────────────────────────────────────────────────────────

export const PER_PAGINA = 50;

export function pagina<T>(lijst: readonly T[], nr: number, per = PER_PAGINA) {
  const totaal = Math.max(1, Math.ceil(lijst.length / per));
  const huidig = Math.min(Math.max(1, nr), totaal);
  return { totaal, huidig, items: lijst.slice((huidig - 1) * per, huidig * per) };
}

// ── Bedragen (customerTotalsService) ───────────────────────────────────────

const isEcht = (f: DbFactuur) => !f.is_credit && !f.gecrediteerd;
export const sumGefactureerd = (fs: readonly DbFactuur[]) =>
  fs.filter((f) => f.status !== 'concept').reduce((s, f) => s + (f.totaal_incl || 0), 0);
export const sumBetaald = (fs: readonly DbFactuur[]) =>
  fs.filter((f) => isEcht(f) && f.status === 'betaald').reduce((s, f) => s + (f.totaal_incl || 0), 0);
export const sumOpenstaand = (fs: readonly DbFactuur[]) => sumGefactureerd(fs) - sumBetaald(fs);

export function laatsteProject(rel: KlantRelaties): DbProject | null {
  return [...rel.projecten].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0] ?? null;
}

export function laatsteMail(rel: KlantRelaties): DbMail | null {
  return [...rel.mails].sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? ''))[0] ?? null;
}

// ── Export ─────────────────────────────────────────────────────────────────

export const EXPORT_KOLOMMEN = [
  'Naam',
  'Email',
  'Telefoon',
  'Adres',
  'Postcode',
  'Stad',
  'KvK-nummer',
  'BTW-nummer',
  'IBAN',
  'Type',
  'Bron',
  'Aantal projecten',
  'Aantal offertes',
  'Aantal facturen',
  'Totaal gefactureerd',
  'Totaal betaald',
  'Openstaand bedrag',
  'Laatste project naam',
  'Laatste project datum',
  'Laatste project status',
  'Laatste mail datum',
  'Laatste mail onderwerp',
  'Aanmaakdatum',
  'Moneybird gesynchroniseerd',
] as const;

const euro = (n: number) => (n > 0 ? n.toFixed(2).replace('.', ',') : '0,00');

/** Exportregels, zelfde kolommen en opmaak als `buildExportRows`. */
export function exportRegels(
  klanten: readonly DbKlant[],
  perKlant: Map<string, KlantRelaties>,
): Record<(typeof EXPORT_KOLOMMEN)[number], string | number>[] {
  return klanten.map((c) => {
    const rel = perKlant.get(c.id) ?? leegRel();
    const lp = laatsteProject(rel);
    const lm = laatsteMail(rel);
    return {
      Naam: c.name || '',
      Email: c.email || '',
      Telefoon: c.phone || '',
      Adres: c.address || '',
      Postcode: c.postcode || '',
      Stad: c.city || '',
      'KvK-nummer': c.kvk_number || '',
      'BTW-nummer': c.btw_number || '',
      IBAN: c.iban || '',
      Type: c.type || '',
      Bron: c.source || '',
      'Aantal projecten': rel.projecten.length,
      'Aantal offertes': rel.offertes.length,
      'Aantal facturen': rel.facturen.filter((f) => !f.is_credit).length,
      'Totaal gefactureerd': euro(sumGefactureerd(rel.facturen)),
      'Totaal betaald': euro(sumBetaald(rel.facturen)),
      'Openstaand bedrag': euro(sumOpenstaand(rel.facturen)),
      'Laatste project naam': lp?.name || '',
      'Laatste project datum': lp?.created_at ? lp.created_at.slice(0, 10) : '',
      'Laatste project status': lp?.status || '',
      'Laatste mail datum': lm?.sent_at ? lm.sent_at.slice(0, 10) : '',
      'Laatste mail onderwerp': lm?.subject || '',
      Aanmaakdatum: c.created_at ? c.created_at.slice(0, 10) : '',
      'Moneybird gesynchroniseerd': c.moneybird_id ? 'Ja' : 'Nee',
    };
  });
}

/**
 * Formule-injectie voorkomen (CSV/Excel): een tekstwaarde die met `=`, `+`,
 * `-`, `@`, tab of CR begint, krijgt een `'` ervoor, zodat Excel/Sheets hem
 * als tekst toont in plaats van als formule uit te voeren. Getallen en
 * telefoon-/bedragachtige waarden (alleen cijfers, spaties, `().,` met
 * hooguit een voorteken) blijven ongemoeid: daar zit geen formule in.
 */
export function csvVeilig(v: unknown): string {
  if (typeof v === 'number') return String(v);
  const s = String(v ?? '');
  if (!/^[=+\-@\t\r]/.test(s)) return s;
  if (/^[+-]?[\d\s().,]+$/.test(s)) return s;
  return `'${s}`;
}

/**
 * CSV zoals het dashboard (c40abf9): puntkomma-gescheiden — Nederlandse Excel
 * opent een komma-CSV in één kolom — alles gequote, met UTF-8 BOM.
 */
export const CSV_SCHEIDING = ';';

export function naarCsv(regels: readonly Record<string, string | number>[]): string {
  const q = (v: unknown) => `"${csvVeilig(v).replace(/"/g, '""')}"`;
  const kop = EXPORT_KOLOMMEN.map(q).join(CSV_SCHEIDING);
  const rijen = regels.map((r) => EXPORT_KOLOMMEN.map((k) => q(r[k])).join(CSV_SCHEIDING));
  return '﻿' + [kop, ...rijen].join('\n');
}

/**
 * Opslagsleutel voor segmenten, per gebruiker (dashboard c40abf9): op een
 * gedeeld toestel zag de volgende gebruiker — ook van een ander bedrijf — anders
 * de opgeslagen filters van de vorige.
 */
export function segmentSleutel(profielId: string | null | undefined): string {
  return `bb_db_segments:${profielId || 'anoniem'}`;
}

// ── Keuzelijsten ───────────────────────────────────────────────────────────

export const PROJECT_STATUS_OPTIES = [
  { id: 'gepland', label: 'Gepland' },
  { id: 'in_uitvoering', label: 'In uitvoering' },
  { id: 'afgerond', label: 'Afgerond' },
];

export const OFFERTE_STATUS_OPTIES = [
  { id: 'concept', label: 'Concept' },
  { id: 'verzonden', label: 'Verzonden' },
  { id: 'geaccepteerd', label: 'Geaccepteerd' },
  { id: 'afgewezen', label: 'Afgewezen' },
];

export const FACTUUR_STATUS_OPTIES = [
  { id: 'concept', label: 'Concept' },
  { id: 'verzonden', label: 'Verzonden' },
  { id: 'betaald', label: 'Betaald' },
];

export const ACTIVITEIT_TYPE_OPTIES = [
  { id: 'call', label: 'Bellen' },
  { id: 'email', label: 'E-mail' },
  { id: 'visit', label: 'Bezoek' },
  { id: 'task', label: 'Taak' },
  { id: 'follow', label: 'Opvolgen' },
];

export const CONTACT_DAGEN_OPTIES = [
  { id: '7', label: '7 dagen' },
  { id: '30', label: '30 dagen' },
  { id: '90', label: '90 dagen' },
  { id: '180', label: '180 dagen' },
];

export const projectStatusLabel = (s: string) =>
  PROJECT_STATUS_OPTIES.find((o) => o.id === s)?.label ?? s;
