import type { UrenRegel } from '@/types/domain';

/**
 * Urentotalen — werkdaguren en werkbonuren apart, zoals het dashboard.
 *
 * BossBase kent twee soorten uren:
 *
 * - **werkdaguren** (`urenregistratie`): de hele werkdag, voor loon en verlof;
 * - **werkbonuren** (`werkbon_uren`): de uren op een klus, voor de nacalculatie.
 *
 * Die worden nooit bij elkaar opgeteld. Wie een werkdag van 8 uur schrijft en
 * daarvan 6 uur op een werkbon boekt, heeft 8 uur gewerkt — niet 14. Het
 * dashboard toont ze daarom naast elkaar met het verschil ("werkdag − klus"),
 * en dat doet de app nu ook:
 *
 * - het hoofdgetal en de norm (8 uur per dag, 40 per week) gaan over
 *   **werkdaguren**;
 * - **werkbonuren** staan ernaast;
 * - het **verschil** is de tijd die niet aan een klus is geschreven.
 *
 * Twee situaties kloppen niet, en die worden gemeld in plaats van weggerekend:
 *
 * - **alleen werkbonuren**: er is op een klus geboekt maar geen werkdag
 *   geschreven — de werkdag ontbreekt;
 * - **meer werkbon- dan werkdaguren**: de werkdag is te kort, of er staat een
 *   klusuur dubbel.
 *
 * Die signalen worden per medewerker bepaald: in het teamoverzicht maakt het
 * uit wíé er een werkdag mist, niet of het bedrijf als geheel optelt.
 */

export type DagUren = {
  werkdag: number;
  werkbon: number;
  /** werkdag − werkbon: de werkdag die niet aan een klus is geschreven. */
  verschil: number;
  /** Aantal medewerkers met werkbonuren maar zonder werkdaguren. */
  zonderWerkdag: number;
  /** Aantal medewerkers met meer werkbon- dan werkdaguren (en wél een werkdag). */
  klusGroter: number;
};

const LEEG: DagUren = { werkdag: 0, werkbon: 0, verschil: 0, zonderWerkdag: 0, klusGroter: 0 };

const rond = (n: number) => Math.round(n * 100) / 100;

export function urenVanDag(regels: UrenRegel[], datum: string): DagUren {
  const perPersoon = new Map<string, { werkdag: number; werkbon: number }>();
  for (const r of regels) {
    if (r.datum !== datum) continue;
    const som = perPersoon.get(r.profile_id) ?? { werkdag: 0, werkbon: 0 };
    som[r.bron] += Number(r.uren) || 0;
    perPersoon.set(r.profile_id, som);
  }
  const dag = { ...LEEG };
  for (const { werkdag, werkbon } of perPersoon.values()) {
    dag.werkdag += werkdag;
    dag.werkbon += werkbon;
    if (werkbon > 0 && werkdag === 0) dag.zonderWerkdag += 1;
    else if (werkdag > 0 && werkbon > werkdag + 0.001) dag.klusGroter += 1;
  }
  dag.werkdag = rond(dag.werkdag);
  dag.werkbon = rond(dag.werkbon);
  dag.verschil = rond(dag.werkdag - dag.werkbon);
  return dag;
}

/**
 * De dagtotalen voor een reeks dagen (`YYYY-MM-DD`), in dezelfde volgorde.
 *
 * Werkt op de datumtekst en niet op `new Date(datum)`: die leest `2026-10-05`
 * als middernacht UTC, en dan valt een uur in een andere tijdzone zomaar op de
 * dag ervoor.
 */
export function urenPerDag(regels: UrenRegel[], dagen: string[]): DagUren[] {
  return dagen.map((dag) => urenVanDag(regels, dag));
}

/** Een reeks dagen opgeteld (bijvoorbeeld een week). Signalen tellen per dag. */
export function telDagenOp(dagen: DagUren[]): DagUren & {
  dagenZonderWerkdag: number;
  dagenKlusGroter: number;
} {
  const som = dagen.reduce(
    (acc, d) => ({
      werkdag: acc.werkdag + d.werkdag,
      werkbon: acc.werkbon + d.werkbon,
      verschil: 0,
      zonderWerkdag: acc.zonderWerkdag + d.zonderWerkdag,
      klusGroter: acc.klusGroter + d.klusGroter,
    }),
    { ...LEEG },
  );
  return {
    ...som,
    werkdag: rond(som.werkdag),
    werkbon: rond(som.werkbon),
    verschil: rond(som.werkdag - som.werkbon),
    dagenZonderWerkdag: dagen.filter((d) => d.zonderWerkdag > 0).length,
    dagenKlusGroter: dagen.filter((d) => d.klusGroter > 0).length,
  };
}
