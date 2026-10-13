/**
 * Rekenregels van de Uren-pagina — los van React, zodat ze in Node te testen
 * zijn. Volgt het dashboard (`UrenPageV2.jsx`, `UrenVelden.jsx`):
 *
 * - tijden worden afgerond op vijf minuten (`rondAfOpVijf`);
 * - een week loopt van maandag t/m zondag, label "Week N · d mmm – d mmm";
 * - werkdaguren (urenregistratie) en werkbonuren (werkbon_uren) worden nooit
 *   opgeteld; het verschil is werkdag − klus.
 *
 * Werkt op datumtekst (`YYYY-MM-DD`) en rekent op 12:00 lokale tijd, zodat
 * een zomer-/wintertijdwissel nooit een dag laat verspringen.
 *
 * Geen runtime-imports: dit bestand draait ook rechtstreeks in de Node-tests.
 */

/** Minimale vorm van een urenregel (zie `UrenRegel` in types/domain). */
export type UrenRegelBasis = {
  id: string;
  profile_id: string;
  datum: string;
  uren: number | string | null;
  bron: 'werkdag' | 'werkbon';
};

const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const naarDate = (iso: string) => new Date(`${iso}T12:00:00`);
const naarIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const rond2 = (n: number) => Math.round(n * 100) / 100;

/** HH:MM afgerond op vijf minuten (zoals het dashboard bij het verlaten van het veld). */
export function rondAfOpVijf(tijd: string): string;
export function rondAfOpVijf(tijd: string | null | undefined): string | null | undefined;
export function rondAfOpVijf(tijd: string | null | undefined): string | null | undefined {
  if (!tijd) return tijd;
  const [h, m] = String(tijd).split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return tijd;
  const totaal = Math.round((h * 60 + m) / 5) * 5;
  const uu = Math.floor(totaal / 60) % 24;
  const mm = totaal % 60;
  return `${pad(uu)}:${pad(mm)}`;
}

export function plusDagen(iso: string, n: number): string {
  const d = naarDate(iso);
  d.setDate(d.getDate() + n);
  return naarIso(d);
}

/** De maandag van de week waarin `iso` valt. */
export function maandagVan(iso: string): string {
  const d = naarDate(iso);
  return plusDagen(iso, -((d.getDay() + 6) % 7));
}

/** De zeven datums (ma t/m zo) vanaf een maandag. */
export function dagenVanWeek(maandag: string): string[] {
  return Array.from({ length: 7 }, (_, i) => plusDagen(maandag, i));
}

/** ISO-weeknummer. */
export function isoWeek(iso: string): number {
  const d = naarDate(iso);
  const donderdag = new Date(d);
  donderdag.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(donderdag.getFullYear(), 0, 4, 12);
  const week1Maandag = new Date(jan4);
  week1Maandag.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return 1 + Math.round((donderdag.getTime() - week1Maandag.getTime()) / (7 * 86400000));
}

const kort = (iso: string) => {
  const d = naarDate(iso);
  return `${d.getDate()} ${MAAND_KORT[d.getMonth()]}`;
};

/** "Week 41 · 5 okt – 11 okt" */
export function weekLabel(maandag: string): string {
  return `Week ${isoWeek(maandag)} · ${kort(maandag)} – ${kort(plusDagen(maandag, 6))}`;
}

export type UrenFilter = 'alles' | 'werkdag' | 'werkbon' | 'open';

/**
 * Dag × medewerker-combinaties die nog "open" staan: er zijn werkbonuren
 * geboekt, maar de werkdag ontbreekt of is korter dan de klusuren. Dat zijn
 * precies de dagen die nog aangevuld moeten worden.
 */
export function openDagen(regels: UrenRegelBasis[]): Set<string> {
  const som = new Map<string, { werkdag: number; werkbon: number }>();
  for (const r of regels) {
    const k = `${r.datum}|${r.profile_id}`;
    const s = som.get(k) ?? { werkdag: 0, werkbon: 0 };
    s[r.bron] += Number(r.uren) || 0;
    som.set(k, s);
  }
  const open = new Set<string>();
  for (const [k, s] of som) {
    if (s.werkbon > 0 && s.werkbon > s.werkdag + 0.001) open.add(k);
  }
  return open;
}

/** De regels voor een filterchip. */
export function filterUren<R extends UrenRegelBasis>(regels: R[], filter: UrenFilter): R[] {
  if (filter === 'werkdag') return regels.filter((r) => r.bron === 'werkdag');
  if (filter === 'werkbon') return regels.filter((r) => r.bron === 'werkbon');
  if (filter === 'open') {
    const open = openDagen(regels);
    return regels.filter((r) => open.has(`${r.datum}|${r.profile_id}`));
  }
  return regels;
}

export type UrenKpi = {
  totaal: number;
  medewerkers: number;
  dagen: number;
  gemPerDag: number;
};

/** KPI's zoals het dashboard: totaal, unieke medewerkers, gemiddelde per dag met uren. */
export function urenKpi(regels: UrenRegelBasis[]): UrenKpi {
  const totaal = rond2(regels.reduce((s, r) => s + (Number(r.uren) || 0), 0));
  const medewerkers = new Set(regels.map((r) => r.profile_id)).size;
  const dagen = new Set(regels.map((r) => r.datum)).size;
  return { totaal, medewerkers, dagen, gemPerDag: dagen ? rond2(totaal / dagen) : 0 };
}

export type UrenDagGroep<R> = {
  datum: string;
  regels: R[];
  werkdag: number;
  werkbon: number;
};

/** Per datum gegroepeerd, nieuwste dag eerst, met de dagtotalen per soort. */
export function groepeerPerDag<R extends UrenRegelBasis>(regels: R[]): UrenDagGroep<R>[] {
  const map = new Map<string, UrenDagGroep<R>>();
  for (const r of regels) {
    const g = map.get(r.datum) ?? { datum: r.datum, regels: [], werkdag: 0, werkbon: 0 };
    g.regels.push(r);
    g[r.bron] = rond2(g[r.bron] + (Number(r.uren) || 0));
    map.set(r.datum, g);
  }
  return [...map.values()].sort((a, b) => b.datum.localeCompare(a.datum));
}

/** "Vandaag", "Gisteren" of de weekdag met datum. */
export function dagKop(iso: string, vandaag: string): string {
  if (iso === vandaag) return 'Vandaag';
  if (iso === plusDagen(vandaag, -1)) return 'Gisteren';
  const d = naarDate(iso);
  const dag = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'][d.getDay()]!;
  return `${dag.charAt(0).toUpperCase()}${dag.slice(1)} ${d.getDate()} ${MAAND_KORT[d.getMonth()]}`;
}

/** Pauzeknoppen uit het dashboard; daarnaast "anders" (vrij getal). */
export const PAUZE_KEUZES = [0, 15, 30, 60] as const;

/** Kilometers: leeg = niet ingevuld (null), anders een getal ≥ 0; ongeldig = undefined. */
export function leesKm(tekst: string): number | null | undefined {
  const t = tekst.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
