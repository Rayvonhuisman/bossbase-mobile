/**
 * Pure regels achter het pipelinebord — één op één overgenomen uit het
 * dashboard (`BbDashboard.jsx`, `bb-shared.jsx`, `utils/pipeline.js`). Geen
 * React, geen Supabase en geen imports, zodat `tests/pipeline.test.mjs` ze los
 * in Node kan draaien.
 *
 * De status van een deal (`open | won | lost`) zet de database zelf, via de
 * trigger `bb_deal_status_uit_fase`. Hier wordt hij alleen gelezen.
 */

// ── Fasekleuren ────────────────────────────────────────────────────────────

/** Oude CSS-klassen → hex (`LEGACY_STAGE_CLASS_HEX` in het dashboard). */
const LEGACY_FASE_HEX: Record<string, string> = {
  'b-blue': '#3b82f6',
  'b-planned': '#3b82f6',
  'b-green': '#1DDB62',
  'b-new': '#1DDB62',
  'b-done': '#1DDB62',
  'b-accepted': '#1DDB62',
  'b-orange': '#f97316',
  'b-progress': '#f97316',
  'b-red': '#ef4444',
  'b-purple': '#a855f7',
  'b-yellow': '#eab308',
  'b-pink': '#ec4899',
  'b-gray': '#6b7280',
  'b-lost': '#6b7280',
};

/** Terugval als `color_class` leeg is: de seedvolgorde op positie. */
const FASE_KLEUR_OP_POSITIE = [
  'b-new', 'b-orange', 'b-blue', 'b-blue', 'b-orange', 'b-orange',
  'b-green', 'b-planned', 'b-progress', 'b-done', 'b-accepted', 'b-lost',
];

export const GRIJS = '#6b7280';

/** `color_class` (hex of legacy klasse) → hex, net als `stageColToHex`. */
export function faseHex(colorClass: string | null | undefined, positie?: number | null): string {
  let col = colorClass;
  if (!col && positie != null) col = FASE_KLEUR_OP_POSITIE[positie - 1] ?? null;
  if (!col || typeof col !== 'string') return GRIJS;
  if (col[0] === '#') return col;
  return LEGACY_FASE_HEX[col] ?? GRIJS;
}

/** Badgekleuren: achtergrond = hex op 10% (`hex + '1A'`), tekst = hex. */
export function faseBadge(
  colorClass: string | null | undefined,
  positie?: number | null,
): { bg: string; fg: string } {
  const hex = faseHex(colorClass, positie);
  // Een korte hex (#abc) kan geen alfa achteraan krijgen; eerst uitschrijven.
  const lang = /^#[0-9a-f]{3}$/i.test(hex)
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  return { bg: `${lang}1A`, fg: lang };
}

// ── Deals ──────────────────────────────────────────────────────────────────

export type FaseLike = {
  id: string;
  name: string | null;
  position: number | null;
  color_class?: string | null;
};

export type DealLike = {
  id: string;
  stage_id: string | null;
  customer_id: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  assigned_to: string | null;
  assigned_to_ids?: string[] | null;
  afgerond_op?: string | null;
  expected_revenue: number | null;
  final_revenue?: number | null;
  customer?: { name?: string | null; city?: string | null } | null;
};

/** `open | won | lost` zoals de database hem zet; zonder waarde 'open'. */
export function dealStatus(d: Pick<DealLike, 'status'>): 'open' | 'won' | 'lost' {
  const s = String(d.status ?? '').toLowerCase();
  return s === 'won' || s === 'lost' ? s : 'open';
}

/** Afgerond = `afgerond_op` gezet ("Project voltooid"). */
export function isAfgerond(d: Pick<DealLike, 'afgerond_op'> | null | undefined): boolean {
  return Boolean(d?.afgerond_op);
}

export function dealWaarde(d: Pick<DealLike, 'expected_revenue' | 'final_revenue'>): number {
  const n = Number(d.expected_revenue ?? d.final_revenue ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Behandelaars: `assigned_to_ids`, met `assigned_to` als terugval. */
export function behandelaarIds(d: Pick<DealLike, 'assigned_to' | 'assigned_to_ids'>): string[] {
  if (Array.isArray(d.assigned_to_ids) && d.assigned_to_ids.length) return d.assigned_to_ids;
  return d.assigned_to ? [d.assigned_to] : [];
}

// ── Filter ─────────────────────────────────────────────────────────────────

export type PipelineStatusFilter = 'open' | 'done' | 'lost' | 'any';

export type PipelineFilter = {
  stage: string; // 'all' of een fase-id
  status: PipelineStatusFilter;
  persoon: string; // 'all' of een profiel-id
  priority: string; // 'all' | 'high' | 'med' | 'low'
  text: string;
};

export const STANDAARD_FILTER: PipelineFilter = {
  stage: 'all',
  status: 'open',
  persoon: 'all',
  priority: 'all',
  text: '',
};

export const STATUS_FILTER_OPTIES: { id: PipelineStatusFilter; label: string }[] = [
  { id: 'open', label: 'Lopend' },
  { id: 'done', label: 'Project voltooid' },
  { id: 'lost', label: 'Verloren' },
  { id: 'any', label: 'Alles tonen' },
];

export function filterIsActief(f: PipelineFilter): boolean {
  return (
    f.stage !== STANDAARD_FILTER.stage ||
    f.status !== STANDAARD_FILTER.status ||
    f.persoon !== STANDAARD_FILTER.persoon ||
    f.priority !== STANDAARD_FILTER.priority ||
    f.text.trim() !== ''
  );
}

/** Dezelfde regels als `filteredDeals` in het dashboard. */
export function filterDeals<D extends DealLike>(deals: D[], f: PipelineFilter): D[] {
  const tekst = f.text.trim().toLowerCase();
  return deals.filter((d) => {
    const st = dealStatus(d);
    // Afgerond is van het bord af, behalve bij het filter "Project voltooid".
    if (isAfgerond(d) !== (f.status === 'done')) return false;
    if (f.stage !== 'all' && d.stage_id !== f.stage) return false;
    if (f.priority !== 'all' && (d.priority || 'med') !== f.priority) return false;
    if (f.persoon !== 'all' && !behandelaarIds(d).includes(f.persoon)) return false;
    if (f.status === 'open' && st === 'lost') return false;
    if (f.status === 'lost' && st !== 'lost') return false;
    if (tekst) {
      const hooi = `${d.title ?? ''} ${d.customer?.name ?? ''} ${d.customer?.city ?? ''}`.toLowerCase();
      if (!hooi.includes(tekst)) return false;
    }
    return true;
  });
}

/** Totaal boven het bord: verloren telt niet mee, behalve bij filter Verloren. */
export function totaalWaarde(deals: DealLike[], f: PipelineFilter): number {
  return deals
    .filter((d) => f.status === 'lost' || dealStatus(d) !== 'lost')
    .reduce((s, d) => s + dealWaarde(d), 0);
}

// ── Kolommen ───────────────────────────────────────────────────────────────

export function gesorteerdeFasen<F extends FaseLike>(fasen: F[]): F[] {
  return [...fasen].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export function afgerondFase<F extends FaseLike>(fasen: F[]): F | null {
  return fasen.find((s) => /afgerond/i.test(s.name ?? '')) ?? null;
}

export function verlorenFase<F extends FaseLike>(fasen: F[]): F | null {
  return (
    fasen.find((s) => /verlor/i.test(s.name ?? '')) ??
    fasen.find((s) => /\blost\b/i.test(s.name ?? '')) ??
    null
  );
}

/**
 * De fasen die als kolom op het bord staan. "Afgerond" alleen bij het filter
 * Project voltooid of als je die fase zelf kiest; met een fasefilter alleen die.
 */
export function zichtbareFasen<F extends FaseLike>(fasen: F[], f: PipelineFilter): F[] {
  const afgerond = afgerondFase(fasen);
  const toonAfgerond = f.status === 'done' || (afgerond != null && f.stage === afgerond.id);
  const getoond = gesorteerdeFasen(fasen).filter((s) => s.id !== afgerond?.id || toonAfgerond);
  return f.stage === 'all' ? getoond : getoond.filter((s) => s.id === f.stage);
}

/**
 * Deals per getoonde kolom. Een deal zonder (getoonde) fase valt in de eerste
 * kolom, zodat hij niet stil van het bord verdwijnt.
 */
export function dealsPerFase<D extends DealLike>(
  deals: D[],
  kolommen: FaseLike[],
): Map<string, D[]> {
  const uit = new Map<string, D[]>();
  for (const k of kolommen) uit.set(k.id, []);
  const eerste = kolommen[0]?.id;
  if (!eerste) return uit;
  for (const d of deals) {
    const sleutel = d.stage_id && uit.has(d.stage_id) ? d.stage_id : eerste;
    uit.get(sleutel)!.push(d);
  }
  return uit;
}

/**
 * Keuzes voor de fase-select in het detail: op volgorde, zonder "Afgerond"
 * tenzij de deal daar nu staat.
 */
export function faseKeuzes<F extends FaseLike>(fasen: F[], huidigeFaseId: string | null): F[] {
  return gesorteerdeFasen(fasen).filter(
    (s) => !/afgerond/i.test(s.name ?? '') || s.id === huidigeFaseId,
  );
}

/** Heropenen van een verloren deal: de eerste fase die niet verloren/afgerond is. */
export function heropenFase<F extends FaseLike>(fasen: F[]): F | null {
  return gesorteerdeFasen(fasen).find((s) => !/verlor|afgerond/i.test(s.name ?? '')) ?? null;
}

// ── Vervolgactiviteit ──────────────────────────────────────────────────────

export type VervolgActiviteit = {
  deal_id: string | null;
  customer_id: string | null;
  completed: boolean | null;
  /** YYYY-MM-DD (Nederlandse kalenderdag) of null zonder datum. */
  dag: string | null;
};

/**
 * Sleutels van deals en klanten met nog iets gepland (niet afgerond en
 * vandaag of later, of zonder datum). Over datum telt niet: juist dan wil je
 * de waarschuwing zien.
 */
export function vervolgSleutels(acts: VervolgActiviteit[], vandaag: string): Set<string> {
  const set = new Set<string>();
  for (const a of acts) {
    if (a.completed) continue;
    if (a.dag && a.dag < vandaag) continue;
    if (a.deal_id) set.add(`d:${a.deal_id}`);
    if (a.customer_id) set.add(`k:${a.customer_id}`);
  }
  return set;
}

export function heeftGeenVervolg(
  d: Pick<DealLike, 'id' | 'customer_id'>,
  sleutels: Set<string>,
): boolean {
  return !sleutels.has(`d:${d.id}`) && !(d.customer_id && sleutels.has(`k:${d.customer_id}`));
}
