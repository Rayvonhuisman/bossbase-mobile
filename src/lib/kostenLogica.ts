/**
 * Pure logica achter de Kosten-pagina, gelijk aan het dashboard
 * (`CostsPage` in `BbPages2.jsx`, `jobCostService.js`, `lib/periode.js`,
 * `utils/btw.js`).
 *
 * Twee weergaven die nooit bij elkaar worden opgeteld:
 * - **Geboekte kosten**: `job_costs` zonder `werkbon_materiaal_id` — wat naar
 *   de boekhouding gaat;
 * - **Kosten op werkbonnen**: de spiegelregels van werkbonmateriaal (`job_costs`
 *   mét `werkbon_materiaal_id`) plus de inkopen op een werkbon (`project_kosten`
 *   met `werkbon_id`). Geen boeking; telt alleen in de projectmarge.
 *
 * Bewust zonder imports: de tests draaien dit bestand rechtstreeks in Node.
 */

const rond2 = (n: number) => Math.round(n * 100) / 100;

// ── Rijen ──────────────────────────────────────────────────────────────────

/** Eén regel in de kostentabel, uit welke bron ook. */
export type KostenRij = {
  id: string;
  /** Categorie zoals opgeslagen ('Materiaal', 'Inkopen', …). */
  cat: string;
  omschrijving: string;
  /** Bedrag exclusief btw. */
  bedrag: number;
  /** null bij een werkbon-inkoop: daar is geen percentage vastgelegd. */
  btwPct: number | null;
  datum: string;
  /** customer_id, met de klant van de deal als terugval (oudere rijen). */
  klantId: string | null;
  klantNaam: string | null;
  klantType: string;
  leverancierId: string | null;
  leverancierNaam: string | null;
  werkbonMateriaalId: string | null;
  /** Inkoop op een werkbon (tabel project_kosten): niet aanklikbaar. */
  werkbonInkoop: boolean;
  externeRef: string | null;
  bijlageUrl: string | null;
};

export type JobCostBron = {
  id: string;
  category: string | null;
  description: string | null;
  amount: number | null;
  btw_percentage: number | null;
  cost_date: string | null;
  created_at?: string | null;
  customer_id: string | null;
  klant_type?: string | null;
  leverancier_id: string | null;
  leverancier?: string | null;
  werkbon_materiaal_id: string | null;
  externe_referentie: string | null;
  bijlage_url: string | null;
  customer?: { name: string | null } | null;
  deals?: { customer_id: string | null } | null;
};

export type WerkbonInkoopBron = {
  id: string;
  naam: string | null;
  aantal: number | null;
  prijs_per: number | null;
  bedrag: number | null;
  datum: string | null;
  leverancier_id: string | null;
  werkbonnen?: { customer_id: string | null } | null;
};

/** `toJobCost` uit het dashboard, in de vorm van deze tabel. */
export function rijUitJobCost(row: JobCostBron): KostenRij {
  return {
    id: row.id,
    cat: row.category || 'overig',
    omschrijving: row.description || '',
    bedrag: Number(row.amount || 0),
    btwPct: row.btw_percentage != null ? Number(row.btw_percentage) : 21,
    datum: row.cost_date || String(row.created_at ?? '').slice(0, 10),
    klantId: row.customer_id ?? row.deals?.customer_id ?? null,
    klantNaam: row.customer?.name ?? null,
    klantType: row.klant_type || 'klant',
    leverancierId: row.leverancier_id || null,
    leverancierNaam: row.leverancier || null,
    werkbonMateriaalId: row.werkbon_materiaal_id || null,
    werkbonInkoop: false,
    externeRef: row.externe_referentie || null,
    bijlageUrl: row.bijlage_url || null,
  };
}

/** `werkbonInkoopAlsRij` uit het dashboard: categorie 'Inkopen', geen btw. */
export function rijUitWerkbonInkoop(row: WerkbonInkoopBron): KostenRij {
  const aantal = Number(row.aantal ?? 1);
  const prijsPer = Number(row.prijs_per ?? 0);
  return {
    id: row.id,
    cat: 'Inkopen',
    omschrijving: row.naam || '',
    // `bedrag` is een gegenereerde kolom; de terugval dekt een oude rij.
    bedrag: row.bedrag != null ? Number(row.bedrag) : rond2(aantal * prijsPer),
    btwPct: null,
    datum: row.datum || '',
    klantId: row.werkbonnen?.customer_id ?? null,
    klantNaam: null,
    klantType: 'klant',
    leverancierId: row.leverancier_id || null,
    leverancierNaam: null,
    werkbonMateriaalId: null,
    werkbonInkoop: true,
    externeRef: null,
    bijlageUrl: null,
  };
}

export const isWerkbonMateriaal = (k: Pick<KostenRij, 'werkbonMateriaalId'>) =>
  Boolean(k.werkbonMateriaalId);

/** Alleen wat geboekt is (de boekhouding): werkbonmateriaal eruit. */
export function alleenGeboekt<T extends Pick<KostenRij, 'werkbonMateriaalId'>>(kosten: T[]): T[] {
  return kosten.filter((k) => !isWerkbonMateriaal(k));
}

// ── Groepen (de tegels) ────────────────────────────────────────────────────

export const KOSTEN_GROEPEN = [
  { id: 'materiaal', label: 'Materiaalkosten', categorieen: ['materiaal'] },
  { id: 'arbeid', label: 'Arbeidskosten', categorieen: ['arbeid', 'arbeidskosten', 'uren'] },
  { id: 'reiskosten', label: 'Reiskosten', categorieen: ['reiskosten', 'reis', 'brandstof', 'km'] },
  { id: 'overig', label: 'Overige kosten', categorieen: [] as string[] },
] as const;
export type KostenGroep = (typeof KOSTEN_GROEPEN)[number]['id'];

/** Naar welke tegel hoort deze categorie? Onbekend → 'overig' (vangnet). */
export function kostenGroepVan(cat: string | null | undefined): KostenGroep {
  const key = String(cat ?? '')
    .trim()
    .toLowerCase();
  for (const g of KOSTEN_GROEPEN) {
    if ((g.categorieen as readonly string[]).includes(key)) return g.id;
  }
  return 'overig';
}

/** Telt kosten op per groep; de groepen tellen altijd op tot het totaal. */
export function kostenPerGroep(
  kosten: Pick<KostenRij, 'cat' | 'bedrag'>[],
): Record<KostenGroep, number> {
  const t: Record<KostenGroep, number> = { materiaal: 0, arbeid: 0, reiskosten: 0, overig: 0 };
  for (const k of kosten) t[kostenGroepVan(k.cat)] += Number(k.bedrag) || 0;
  return {
    materiaal: rond2(t.materiaal),
    arbeid: rond2(t.arbeid),
    reiskosten: rond2(t.reiskosten),
    overig: rond2(t.overig),
  };
}

// ── De pagina ──────────────────────────────────────────────────────────────

export type KostenWeergave = 'kosten' | 'materiaal';

export type KostenTegel = { id: string; label: string; bedrag: number; uitleg?: string };

/**
 * Alles wat de Kosten-pagina toont, uit de rijen van één periode:
 * - de regels van de gekozen weergave (met klant- en categoriefilter);
 * - het totaal en de groepen (tellen op tot het totaal);
 * - de tegels, in de volgorde van het dashboard (Arbeid alleen als > 0);
 * - het leverancier-signaal (alleen geboekte kosten, zonder filter);
 * - de categorieën voor het filter (uit de geladen boekingen + materiaal).
 */
export function bouwKostenPagina({
  kosten,
  inkopen,
  weergave,
  filterKlant,
  filterCat,
}: {
  kosten: KostenRij[];
  inkopen: KostenRij[];
  weergave: KostenWeergave;
  filterKlant: string | null;
  filterCat: string | null;
}) {
  const pastFilter = (r: KostenRij) => {
    if (filterKlant && String(r.klantId) !== filterKlant) return false;
    if (filterCat && r.cat !== filterCat) return false;
    return true;
  };
  const gefilterd = kosten.filter(pastFilter);
  const boekingen = alleenGeboekt(gefilterd);
  const materiaal = [...gefilterd.filter(isWerkbonMateriaal), ...inkopen.filter(pastFilter)].sort(
    (a, b) => String(b.datum).localeCompare(String(a.datum)),
  );
  const regels = weergave === 'materiaal' ? materiaal : boekingen;
  const totaal = rond2(regels.reduce((s, r) => s + (Number(r.bedrag) || 0), 0));
  const groepen = kostenPerGroep(regels);

  const tegels: KostenTegel[] = [
    weergave === 'materiaal'
      ? {
          id: 'totaal',
          label: 'Kosten op werkbonnen',
          bedrag: totaal,
          uitleg: 'Geen boeking · telt in de marge van een project',
        }
      : { id: 'totaal', label: 'Geboekte kosten', bedrag: totaal, uitleg: 'Wat naar de boekhouding gaat' },
    { id: 'materiaal', label: 'Materiaalkosten', bedrag: groepen.materiaal },
    ...(groepen.arbeid > 0 ? [{ id: 'arbeid', label: 'Arbeidskosten', bedrag: groepen.arbeid }] : []),
    { id: 'reiskosten', label: 'Reiskosten', bedrag: groepen.reiskosten },
    { id: 'overig', label: 'Overige kosten', bedrag: groepen.overig },
  ];

  const zonderLeverancier = kosten.filter((k) => !k.leverancierId && !isWerkbonMateriaal(k)).length;
  const categorieen = [...new Set(kosten.map((k) => k.cat))];

  return { regels, totaal, groepen, tegels, zonderLeverancier, categorieen };
}

/** Lege-staat-tekst zoals het dashboard hem formuleert. */
export function legeKostenTekst(weergave: KostenWeergave, periodeLabel: string, metFilter: boolean) {
  return `${weergave === 'materiaal' ? 'Geen kosten op werkbonnen' : 'Geen kosten'} in ${periodeLabel}${
    metFilter ? ' bij dit filter' : ''
  }.`;
}

// ── Categorie en bron ──────────────────────────────────────────────────────

export type CategorieToon = 'blue' | 'green' | 'orange' | 'purple' | 'gray';

const CATEGORIE_META: Record<string, { label: string; toon: CategorieToon }> = {
  materiaal: { label: 'Materiaal', toon: 'blue' },
  arbeid: { label: 'Arbeid', toon: 'green' },
  reiskosten: { label: 'Reiskosten', toon: 'orange' },
  inkoopfactuur: { label: 'Inkoopfactuur', toon: 'purple' },
  'algemene kosten': { label: 'Algemene kosten', toon: 'gray' },
  overig: { label: 'Overig', toon: 'gray' },
};

/** `costCategoryMeta` uit het dashboard: nette naam + kleur, onbekend = grijs. */
export function categorieMeta(cat: string | null | undefined): { label: string; toon: CategorieToon } {
  const key = String(cat ?? '')
    .trim()
    .toLowerCase();
  const meta = CATEGORIE_META[key];
  if (meta) return meta;
  const label = cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Overig';
  return { label, toon: 'gray' };
}

/** Bron van een kostenpost: SnelStart-, Moneybird-import of handmatig. */
export function kostenBron(externeRef: string | null | undefined): 'snelstart' | 'moneybird' | 'handmatig' {
  if (!externeRef) return 'handmatig';
  return externeRef.startsWith('snelstart_') ? 'snelstart' : 'moneybird';
}

// ── Btw ────────────────────────────────────────────────────────────────────

/**
 * `calcBtw` uit `utils/btw.js`. `incl`: het bedrag is inclusief btw.
 * Opgeslagen wordt altijd het bedrag excl. btw (`amount`), met
 * `btw_inclusief = false`.
 */
export function calcBtw(bedrag: number, pct: number, mode: 'excl' | 'incl' = 'excl') {
  const b = Number(bedrag) || 0;
  const p = Number(pct) || 0;
  if (mode === 'incl') {
    const excl = rond2(b / (1 + p / 100));
    return { excl, btw: rond2(b - excl), incl: b };
  }
  const btw = rond2((b * p) / 100);
  return { excl: b, btw, incl: rond2(b + btw) };
}

// ── Periode ────────────────────────────────────────────────────────────────

export const PERIODE_TYPES = [
  { id: 'week', label: 'Week' },
  { id: 'maand', label: 'Maand' },
  { id: 'kwartaal', label: 'Kwartaal' },
  { id: 'jaar', label: 'Jaar' },
] as const;
export type PeriodeType = (typeof PERIODE_TYPES)[number]['id'];

const MAANDEN = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];
const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** Datum als 'YYYY-MM-DD' in de lokale tijdzone (geen UTC-verschuiving). */
export function isoLokaal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoWeekNummer(d: Date): { week: number; jaar: number } {
  const doel = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dag = (doel.getDay() + 6) % 7;
  doel.setDate(doel.getDate() - dag + 3);
  const eersteDonderdag = new Date(doel.getFullYear(), 0, 4);
  const dagVanEerste = (eersteDonderdag.getDay() + 6) % 7;
  eersteDonderdag.setDate(eersteDonderdag.getDate() - dagVanEerste + 3);
  const weken = Math.round((doel.getTime() - eersteDonderdag.getTime()) / (7 * 24 * 3600 * 1000));
  return { week: weken + 1, jaar: doel.getFullYear() };
}

/**
 * Begin, eind (beide inclusief) en label van een periode — `periodeRange` uit
 * het dashboard. `offset` 0 = nu, -1 = vorige, 1 = volgende.
 */
export function periodeRange(
  type: PeriodeType,
  offset = 0,
  vandaag: Date = new Date(),
): { start: string; eind: string; label: string } {
  const j = vandaag.getFullYear();
  const m = vandaag.getMonth();

  if (type === 'week') {
    const dag = (vandaag.getDay() + 6) % 7;
    const start = new Date(j, m, vandaag.getDate() - dag + offset * 7);
    const eind = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const { week, jaar } = isoWeekNummer(start);
    const bereik =
      start.getMonth() === eind.getMonth()
        ? `${start.getDate()}–${eind.getDate()} ${MAANDEN_KORT[eind.getMonth()]}`
        : `${start.getDate()} ${MAANDEN_KORT[start.getMonth()]} – ${eind.getDate()} ${MAANDEN_KORT[eind.getMonth()]}`;
    return { start: isoLokaal(start), eind: isoLokaal(eind), label: `Week ${week} · ${bereik} ${jaar}` };
  }

  if (type === 'kwartaal') {
    const kwartaalStart = Math.floor(m / 3) * 3 + offset * 3;
    const start = new Date(j, kwartaalStart, 1);
    const eind = new Date(j, kwartaalStart + 3, 0);
    return {
      start: isoLokaal(start),
      eind: isoLokaal(eind),
      label: `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`,
    };
  }

  if (type === 'jaar') {
    const start = new Date(j + offset, 0, 1);
    const eind = new Date(j + offset, 11, 31);
    return { start: isoLokaal(start), eind: isoLokaal(eind), label: String(start.getFullYear()) };
  }

  const start = new Date(j, m + offset, 1);
  const eind = new Date(j, m + offset + 1, 0);
  const naam = MAANDEN[start.getMonth()] ?? '';
  return {
    start: isoLokaal(start),
    eind: isoLokaal(eind),
    label: `${naam.charAt(0).toUpperCase()}${naam.slice(1)} ${start.getFullYear()}`,
  };
}
