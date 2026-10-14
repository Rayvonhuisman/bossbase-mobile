/**
 * Afgeschermde bedragkolommen (dashboard origin/main, migraties
 * 20261003093758 + 20261003093845, audit M1).
 *
 * `authenticated` heeft geen SELECT-recht meer op `projects.project_value`,
 * `projects.geschatte_waarde`, `werkbon_materialen.prijs_per` en
 * `werkbon_materialen.subtotaal`. Een select die één van die kolommen noemt
 * (of `*`, of `.select()` zonder kolommen na een insert/update) faalt voor
 * IEDEREEN met "permission denied", ook voor een admin. De bedragen komen via
 * `bb_projectbedragen(p_ids)` en `bb_werkbonmateriaal_bedragen(p_ids)`; die
 * geven alleen rijen terug aan wie `projectbedragen` mag zien (actieve admin
 * of het recht; sinds 20261004200000 niet meer via de gedeelde werkruimte,
 * live geverifieerd 13-10-2026). Schrijven mag nog wel (kolom-UPDATE/INSERT staan
 * open; RLS bepaalt wie).
 *
 * Hier alleen de pure logica, zodat hij te testen is zonder Supabase.
 */

/** Zoveel id's per RPC-aanroep, zoals het dashboard (`metBedragen`). */
export const BEDRAGEN_BATCH = 500;

export const PROJECT_BEDRAG_VELDEN = ['project_value', 'geschatte_waarde'] as const;
export const MATERIAAL_BEDRAG_VELDEN = ['prijs_per', 'subtotaal'] as const;

/** Verdeel id's (uniek, zonder lege waarden) in stukken voor de RPC. */
export function idBatches(ids: readonly (string | null | undefined)[], grootte = BEDRAGEN_BATCH): string[][] {
  const uniek = [...new Set(ids.filter((i): i is string => typeof i === 'string' && i.length > 0))];
  const uit: string[][] = [];
  for (let i = 0; i < uniek.length; i += grootte) uit.push(uniek.slice(i, i + grootte));
  return uit;
}

type BedragRij = { id: string } & Record<string, unknown>;

const naarGetal = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Zet de bedragen uit het RPC-antwoord op de rijen. Geen antwoord voor een rij
 * (geen recht, of niet van dit bedrijf) = `null`: het scherm verbergt
 * bedragen dan al op het recht `projectbedragen`.
 */
export function vulBedragen<T extends { id: string }, K extends string>(
  rijen: readonly T[],
  bedragen: readonly BedragRij[] | null | undefined,
  velden: readonly K[],
): (T & Record<K, number | null>)[] {
  const perId = new Map<string, BedragRij>();
  for (const b of bedragen ?? []) if (b && typeof b.id === 'string') perId.set(b.id, b);
  return rijen.map((r) => {
    const b = perId.get(r.id);
    const extra = {} as Record<K, number | null>;
    for (const v of velden) extra[v] = b ? naarGetal(b[v]) : null;
    return { ...r, ...extra };
  });
}
