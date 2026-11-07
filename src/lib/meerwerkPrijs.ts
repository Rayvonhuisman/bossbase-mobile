// ── Bedrag bij meerwerk ─────────────────────────────────────────────────────
// Meerwerk is een werkbon_taken-rij met is_meerwerk; het bedrag (verkoopprijs
// excl. btw, voor de klant) en eventueel de uren staan in een eigen tabel
// `werkbon_meerwerk_prijs` (migratie 20261107170000 van het dashboard), alleen
// te lezen en schrijven met `bb_mag_projectbedragen()` (admin of het recht
// projectbedragen). Zelfde regels als `zetMeerwerkPrijs` in
// werkbonOfferteService.js van het dashboard: beide leeg = de rij weg, een
// negatief of onleesbaar getal is een fout, afgerond op twee decimalen.
//
// Nooit op de werkbon-PDF of de ondertekenpagina: src/lib/pdf/werkbonPdf.ts
// leest deze tabel niet (tests/werkbonLogica.test.mjs bewaakt dat).

import { leesGetalNl } from './getalNl';

export type MeerwerkPrijs = { taakId: string; bedragExcl: number | null; uren: number | null };

/** Eén rij van werkbon_meerwerk_prijs. */
export function naarMeerwerkPrijs(r: Record<string, unknown>): MeerwerkPrijs {
  return {
    taakId: String(r.werkbon_taak_id),
    bedragExcl: r.bedrag_excl == null ? null : Number(r.bedrag_excl),
    uren: r.uren == null ? null : Number(r.uren),
  };
}

const getalOfNull = (v: string | number | null | undefined): number | null => {
  const n = leesGetalNl(v);
  if (n === null) return null;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/**
 * Invoer van de twee velden → wat er opgeslagen wordt. `leeg`: beide leeg, de
 * rij gaat weg (de database staat een rij zonder bedrag én zonder uren niet toe).
 */
export function leesMeerwerkInvoer(
  bedragExcl: string | number | null | undefined,
  uren: string | number | null | undefined,
): { fout: string } | { leeg: true } | { bedragExcl: number | null; uren: number | null } {
  const bedrag = getalOfNull(bedragExcl);
  const u = getalOfNull(uren);
  if (Number.isNaN(bedrag) || (bedrag != null && bedrag < 0)) return { fout: 'Vul een geldig bedrag in.' };
  if (Number.isNaN(u) || (u != null && u < 0)) return { fout: 'Vul een geldig aantal uren in.' };
  if (bedrag == null && u == null) return { leeg: true };
  return { bedragExcl: bedrag, uren: u };
}

/** Som van de bedragen, zoals `meerwerkTotaal` op de werkbon van het dashboard. */
export function meerwerkTotaal(prijzen: Iterable<MeerwerkPrijs>): number {
  let som = 0;
  for (const p of prijzen) som += Number(p.bedragExcl) || 0;
  return Math.round(som * 100) / 100;
}

/** Getal → tekst in het invoerveld ("12,5"); null → leeg. */
export const naarInvoer = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
