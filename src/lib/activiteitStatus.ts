/**
 * Status, groepen, tellingen en filters van activiteiten — de regels van
 * `ActivitiesPageV2` en `activityService.js` (`computeOpenStatus`) in het
 * dashboard, los van React zodat ze te testen zijn.
 *
 * De status staat niet in de database; hij wordt afgeleid uit `completed` en de
 * Nederlandse kalenderdag van `due_at`:
 *   completed            → 'completed'
 *   dag < vandaag        → 'overdue'  (te laat)
 *   dag = vandaag        → 'today'
 *   later of geen datum  → 'open'     (binnenkort)
 *
 * Geen imports: de kalenderdag (`dagVan`) en "vandaag" komen als argument
 * binnen, zodat dit bestand rechtstreeks in Node draait.
 */

export type ActiviteitStatus = 'overdue' | 'today' | 'open' | 'completed';

export type ActiviteitKern = {
  completed: boolean | null;
  due_at: string | null;
  title?: string | null;
  assigned_to?: string | null;
  assigned_to_ids?: string[] | null;
  customer?: { name: string | null } | null;
};

/** `YYYY-MM-DD` van een timestamptz in Nederlandse tijd; leeg bij onzin. */
export type DagVan = (iso: string) => string;

export function activiteitStatus(
  a: Pick<ActiviteitKern, 'completed' | 'due_at'>,
  vandaag: string,
  dagVan: DagVan,
): ActiviteitStatus {
  if (a.completed) return 'completed';
  if (!a.due_at) return 'open';
  const dag = dagVan(a.due_at);
  if (!dag) return 'open';
  if (dag < vandaag) return 'overdue';
  if (dag === vandaag) return 'today';
  return 'open';
}

/** Hele dagen tussen twee `YYYY-MM-DD`'s (b − a), zonder tijdzonegedoe. */
export function dagenTussen(a: string, b: string): number {
  const ms = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    return Date.UTC(y ?? 0, (m ?? 1) - 1, dd ?? 1);
  };
  return Math.round((ms(b) - ms(a)) / 86400000);
}

export type ActiviteitGroep = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'done';

export const ACTIVITEIT_GROEPEN: { key: ActiviteitGroep; titel: string }[] = [
  { key: 'overdue', titel: 'Te laat' },
  { key: 'today', titel: 'Vandaag' },
  { key: 'tomorrow', titel: 'Morgen' },
  { key: 'week', titel: 'Deze week' },
  { key: 'later', titel: 'Later' },
  { key: 'done', titel: 'Afgerond' },
];

/** `dateGroup` uit het dashboard: Te laat / Vandaag / Morgen / Deze week (≤ 7 d) / Later / Afgerond. */
export function activiteitGroep(
  a: Pick<ActiviteitKern, 'completed' | 'due_at'>,
  vandaag: string,
  dagVan: DagVan,
): ActiviteitGroep {
  const status = activiteitStatus(a, vandaag, dagVan);
  if (status === 'completed') return 'done';
  if (status === 'overdue') return 'overdue';
  if (!a.due_at) return 'later';
  const dag = dagVan(a.due_at);
  if (!dag) return 'later';
  const verschil = dagenTussen(vandaag, dag);
  if (verschil <= 0) return 'today';
  if (verschil === 1) return 'tomorrow';
  if (verschil <= 7) return 'week';
  return 'later';
}

export type ActiviteitTelling = {
  all: number;
  overdue: number;
  today: number;
  open: number;
  done: number;
};

export function telActiviteiten(
  rijen: Pick<ActiviteitKern, 'completed' | 'due_at'>[],
  vandaag: string,
  dagVan: DagVan,
): ActiviteitTelling {
  const t: ActiviteitTelling = { all: rijen.length, overdue: 0, today: 0, open: 0, done: 0 };
  for (const a of rijen) {
    const s = activiteitStatus(a, vandaag, dagVan);
    if (s === 'completed') t.done++;
    else t[s]++;
  }
  return t;
}

/** Filtertabs. `open` = nog niet aan de beurt ("Binnenkort"), net als in het dashboard. */
export type ActiviteitFilter = 'all' | 'overdue' | 'today' | 'open' | 'done';

export const ACTIVITEIT_FILTERS: ActiviteitFilter[] = ['all', 'overdue', 'today', 'open', 'done'];

/** Is deze medewerker toegewezen (primair óf in de lijst met toegewezenen)? */
export function isToegewezenAan(
  a: Pick<ActiviteitKern, 'assigned_to' | 'assigned_to_ids'>,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  if (a.assigned_to === userId) return true;
  return Array.isArray(a.assigned_to_ids) && a.assigned_to_ids.includes(userId);
}

/** Aan niemand toegewezen (geen primaire en een lege lijst)? */
export function isNiemandToegewezen(a: Pick<ActiviteitKern, 'assigned_to' | 'assigned_to_ids'>): boolean {
  return !a.assigned_to && !(Array.isArray(a.assigned_to_ids) && a.assigned_to_ids.length > 0);
}

export type ActiviteitFilterOpties = {
  filter: ActiviteitFilter;
  /** Profiel-id of null = alle medewerkers. */
  medewerker?: string | null;
  zoek?: string;
};

export function filterActiviteiten<T extends ActiviteitKern>(
  rijen: T[],
  opties: ActiviteitFilterOpties,
  vandaag: string,
  dagVan: DagVan,
): T[] {
  const zoek = (opties.zoek ?? '').trim().toLowerCase();
  return rijen.filter((a) => {
    const s = activiteitStatus(a, vandaag, dagVan);
    if (opties.filter === 'done' && s !== 'completed') return false;
    if (opties.filter !== 'all' && opties.filter !== 'done' && s !== opties.filter) return false;
    if (opties.medewerker && !isToegewezenAan(a, opties.medewerker)) return false;
    if (zoek) {
      const hooiberg = `${a.title ?? ''} ${a.customer?.name ?? ''}`.toLowerCase();
      if (!hooiberg.includes(zoek)) return false;
    }
    return true;
  });
}

/** Rijen per datumgroep, in de vaste volgorde; lege groepen vallen weg. */
export function groepeerActiviteiten<T extends ActiviteitKern>(
  rijen: T[],
  vandaag: string,
  dagVan: DagVan,
): { key: ActiviteitGroep; titel: string; rijen: T[] }[] {
  const bakken = new Map<ActiviteitGroep, T[]>();
  for (const a of rijen) {
    const k = activiteitGroep(a, vandaag, dagVan);
    const bak = bakken.get(k) ?? [];
    bak.push(a);
    bakken.set(k, bak);
  }
  return ACTIVITEIT_GROEPEN.filter((g) => (bakken.get(g.key)?.length ?? 0) > 0).map((g) => ({
    ...g,
    rijen: bakken.get(g.key) ?? [],
  }));
}

/**
 * De homepage-tegel "Activiteiten vandaag" (`actions_today`): open
 * activiteiten van vandaag; te laat apart geteld. In de app staan de te late
 * onder die van vandaag in dezelfde lijst, zodat je ze ook kunt openen en
 * afvinken.
 *
 * Telt je eigen activiteiten én die aan niemand zijn toegewezen. Die laatste
 * zag niemand op zijn homepage, terwijl de zijbalk van het dashboard ze wél als
 * te laat telde ("1 te laat" in de app, 4 in de zijbalk). Bewuste keuze van
 * 15-10-2026; de dashboardtegel telt (nog) alleen eigen activiteiten.
 */
export function eigenActiviteitenVandaag<T extends ActiviteitKern>(
  rijen: T[],
  userId: string | null | undefined,
  vandaag: string,
  dagVan: DagVan,
): { teLaat: T[]; vandaag: T[] } {
  if (!userId) return { teLaat: [], vandaag: [] };
  const eigen = rijen.filter((a) => isToegewezenAan(a, userId) || isNiemandToegewezen(a));
  return {
    teLaat: eigen.filter((a) => activiteitStatus(a, vandaag, dagVan) === 'overdue'),
    vandaag: eigen.filter((a) => activiteitStatus(a, vandaag, dagVan) === 'today'),
  };
}
