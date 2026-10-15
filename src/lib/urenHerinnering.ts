/**
 * "Vul je werkdag in" — de urenherinnering van het dashboard
 * (`UrenHerinneringModal.jsx`, `computeMissingEntries`), met dezelfde regels.
 * Geen imports, zodat dit in de Node-tests draait.
 *
 * Wie krijgt hem:
 *  - niet de admin/eigenaar, en alleen als het bedrijf echt personeel heeft
 *    (meer dan één actief lid);
 *  - alleen als de herinnering aan staat (`uren_herinnering_interval_min` > 0),
 *    je niet op de uitsluitlijst staat, en vandaag een herinneringsdag is.
 * Bedrijven die geen uren bijhouden zetten hem uit en zien dus niets.
 *
 * Welke dagen: de laatste 14 dagen (en vandaag, afhankelijk van het moment)
 * waarop je op de planning stond — een werkbondag in je (dag)ploeg of een
 * activiteit aan jou — maar nog geen werkdaguren hebt geschreven. Werkbonuren
 * tellen bewust niet: die zeggen niets over de lengte van je werkdag.
 */

export type HerinneringMoment = 'na_werkdag' | 'einde_dag' | 'volgende_ochtend';

export const TERUG_DAGEN = 14;
/** "Einde van de dag", en de terugval voor "na afloop van de werkdag". */
export const EINDE_DAG = '17:00';

export function herinneringActief(o: {
  rol: string | null | undefined;
  actieveLeden: number;
  intervalMin: number;
  uitgesloten: readonly string[] | null | undefined;
  dagen: readonly number[] | null | undefined;
  uid: string;
  /** ISO-weekdag: 1 = maandag … 7 = zondag. */
  weekdag: number;
}): boolean {
  if (o.rol === 'admin') return false;
  if (o.actieveLeden <= 1) return false;
  if (!(o.intervalMin > 0)) return false;
  if ((o.uitgesloten ?? []).includes(o.uid)) return false;
  return (o.dagen?.length ? o.dagen : [1, 2, 3, 4, 5, 6, 7]).includes(o.weekdag);
}

export type GeplandeDag = {
  datum: string;
  /** Jouw eindtijd die dag (`HH:MM`), als bekend. */
  eind: string | null;
  label: string;
  werkbonId: string | null;
};

export type OpenWerkdag = { datum: string; label: string; werkbonId: string | null };

export function plusDagenIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * De open dagen, oudste eerst. Per dag de eerste werkbon (of anders de eerste
 * activiteit) als context. Vandaag telt pas mee na het gekozen moment.
 */
export function openWerkdagen(o: {
  gepland: GeplandeDag[];
  /** Datums met werkdaguren (> 0). */
  geboekt: readonly string[];
  vandaag: string;
  nuTijd: string;
  moment: HerinneringMoment;
}): OpenWerkdag[] {
  const van = plusDagenIso(o.vandaag, -TERUG_DAGEN);
  const binnen = (d: string) => !!d && d >= van && d <= o.vandaag;
  const perDag = new Map<string, OpenWerkdag>();
  const eindPerDag = new Map<string, string>();
  // Werkbonnen eerst: die leveren de context, zoals in het dashboard.
  const gesorteerd = [...o.gepland].sort((a, b) => Number(!a.werkbonId) - Number(!b.werkbonId));
  for (const g of gesorteerd) {
    if (!binnen(g.datum)) continue;
    const eind = g.eind ? g.eind.slice(0, 5) : '';
    if (eind && eind > (eindPerDag.get(g.datum) ?? '')) eindPerDag.set(g.datum, eind);
    if (!perDag.has(g.datum)) perDag.set(g.datum, { datum: g.datum, label: g.label, werkbonId: g.werkbonId });
  }
  const geboekt = new Set(o.geboekt);
  const aanDeBeurt = (d: string) => {
    if (d < o.vandaag) return true;
    if (o.moment === 'einde_dag') return o.nuTijd >= EINDE_DAG;
    if (o.moment === 'na_werkdag') return o.nuTijd >= (eindPerDag.get(d) || EINDE_DAG);
    return false;
  };
  return [...perDag.values()]
    .filter((d) => !geboekt.has(d.datum) && aanDeBeurt(d.datum))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}
