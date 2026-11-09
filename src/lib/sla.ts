/**
 * SLA-status van een werkbon onder een contract — de app-spiegel van
 * `src/lib/sla.js` in het dashboard (bouwtekening contracten, 09-11-2026).
 *
 * De database rekent de deadlines uit (`bb_werkbon_sla`, vanaf het moment van
 * melden, met de klok van het SLA-niveau). Hier staat alleen hoe je zo'n
 * deadline leest:
 *
 *   te laat  — de deadline is voorbij en de werkbon is niet gestart (reactie)
 *              of niet afgerond (oplossen); of hij is wél gestart/afgerond,
 *              maar ná de deadline.
 *   bijna    — nog open, en er is ≤ 25% van de norm over, of minder dan 2 uur.
 *   op tijd  — nog open, met meer tijd over.
 *   gehaald  — gestart/afgerond vóór of op de deadline.
 *
 * "Over" is gewone kloktijd tot de deadline. Bij de klok `werkuren` is de norm
 * in werkuren gerekend; 25% daarvan in kloktijd is dan een ruime, eenvoudige
 * vuistregel (net als in het dashboard), geen tweede deadlineberekening.
 *
 * Geen runtime-imports: draait ook rechtstreeks in de Node-tests.
 */

export type SlaStatus = 'op_tijd' | 'bijna' | 'te_laat' | 'gehaald';

export type SlaSoort = 'reactie' | 'oplossen';

export const SLA_STATUS_LABEL: Record<SlaStatus, string> = {
  op_tijd: 'Op tijd',
  bijna: 'Bijna',
  te_laat: 'Te laat',
  gehaald: 'Gehaald',
};

export const PRIORITEITEN = ['spoed', 'normaal', 'laag'] as const;
export type Prioriteit = (typeof PRIORITEITEN)[number];

export const PRIORITEIT_LABEL: Record<Prioriteit, string> = {
  spoed: 'Spoed',
  normaal: 'Normaal',
  laag: 'Laag',
};

/** Minder dan dit is altijd "bijna", hoe lang de norm ook is. */
export const BIJNA_MINIMUM_MS = 2 * 60 * 60 * 1000;
/** Of minder dan dit deel van de norm. */
export const BIJNA_FRACTIE = 0.25;

function ms(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * De status van één deadline.
 *
 * @param deadline   sla_reactie_voor of sla_oplossen_voor
 * @param klaarOp    gestart_op (reactie) of afgerond_op (oplossen); null = nog open
 * @param normUren   de norm in uren uit het SLA-niveau (voor de 25%-regel); null = onbekend
 * @param nu         het moment van kijken (testbaar)
 * @returns null als er geen deadline is.
 */
export function slaStatus(opts: {
  deadline: string | Date | null | undefined;
  klaarOp?: string | Date | null;
  normUren?: number | string | null;
  nu?: Date | number;
}): SlaStatus | null {
  const deadline = ms(opts.deadline);
  if (deadline === null) return null;
  const klaar = ms(opts.klaarOp ?? null);
  if (klaar !== null) return klaar <= deadline ? 'gehaald' : 'te_laat';
  const nu = opts.nu === undefined ? Date.now() : typeof opts.nu === 'number' ? opts.nu : opts.nu.getTime();
  const over = deadline - nu;
  if (over < 0) return 'te_laat';
  if (over < BIJNA_MINIMUM_MS) return 'bijna';
  const norm = Number(opts.normUren);
  if (Number.isFinite(norm) && norm > 0 && over <= norm * 3600_000 * BIJNA_FRACTIE) return 'bijna';
  return 'op_tijd';
}

/** De werkbonvelden die de SLA-status nodig heeft. */
export type SlaWerkbon = {
  status?: string | null;
  sla_reactie_voor?: string | null;
  sla_oplossen_voor?: string | null;
  gestart_op?: string | null;
  afgerond_op?: string | null;
  /** De melding; vangnet voor de norm als die niet bekend is (zie slaRegels). */
  created_at?: string | null;
};

export type SlaRegel = {
  soort: SlaSoort;
  deadline: string;
  status: SlaStatus;
};

/**
 * Beide deadlines van een werkbon, met status. Een geannuleerde werkbon heeft
 * geen SLA meer (lege lijst). Een afgeronde werkbon zonder gestart_op telt de
 * afronding ook als reactie: wie klaar is, heeft gereageerd.
 *
 * Zonder `normen` (de werkbonnenlijst kent het SLA-niveau niet) geldt als norm
 * de kloktijd van de melding (`created_at`) tot de deadline. Bij de klok
 * `altijd` is dat precies de norm; bij `werkuren` is het ruimer.
 */
export function slaRegels(
  w: SlaWerkbon,
  normen: { reactie_uren?: number | string | null; oplos_uren?: number | string | null } | null = null,
  nu?: Date | number,
): SlaRegel[] {
  if (!w || w.status === 'geannuleerd') return [];
  const regels: SlaRegel[] = [];
  if (w.sla_reactie_voor) {
    const status = slaStatus({
      deadline: w.sla_reactie_voor,
      klaarOp: w.gestart_op ?? w.afgerond_op ?? null,
      normUren: normen?.reactie_uren ?? spanUren(w.created_at, w.sla_reactie_voor),
      nu,
    });
    if (status) regels.push({ soort: 'reactie', deadline: w.sla_reactie_voor, status });
  }
  if (w.sla_oplossen_voor) {
    const status = slaStatus({
      deadline: w.sla_oplossen_voor,
      klaarOp: w.afgerond_op ?? null,
      normUren: normen?.oplos_uren ?? spanUren(w.created_at, w.sla_oplossen_voor),
      nu,
    });
    if (status) regels.push({ soort: 'oplossen', deadline: w.sla_oplossen_voor, status });
  }
  return regels;
}

function spanUren(van: string | null | undefined, tot: string | null | undefined): number | null {
  const a = ms(van);
  const b = ms(tot);
  if (a === null || b === null || b <= a) return null;
  return (b - a) / 3600_000;
}

const ERNST: Record<SlaStatus, number> = { gehaald: 0, op_tijd: 1, bijna: 2, te_laat: 3 };

/**
 * Eén badge voor de lijst: de ergste status van beide deadlines. Null als de
 * werkbon geen SLA heeft (of geannuleerd is).
 */
export function slaBadge(
  w: SlaWerkbon,
  normen: { reactie_uren?: number | string | null; oplos_uren?: number | string | null } | null = null,
  nu?: Date | number,
): SlaStatus | null {
  const regels = slaRegels(w, normen, nu);
  if (!regels.length) return null;
  return regels.reduce<SlaStatus>((erg, r) => (ERNST[r.status] > ERNST[erg] ? r.status : erg), 'gehaald');
}

/**
 * "nog 3 u 20 min", "nog 2 dagen", "45 min te laat". Kloktijd tot de
 * deadline; null zonder geldige deadline.
 */
export function resterendTekst(deadline: string | null | undefined, nu: Date | number = Date.now()): string | null {
  const d = ms(deadline);
  if (d === null) return null;
  const n = typeof nu === 'number' ? nu : nu.getTime();
  const verschil = d - n;
  const abs = Math.abs(verschil);
  const min = Math.floor(abs / 60_000);
  const uren = Math.floor(min / 60);
  const dagen = Math.floor(uren / 24);
  const duur =
    uren >= 48 ? `${dagen} dagen` : uren >= 1 ? `${uren} u${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`;
  return verschil >= 0 ? `nog ${duur}` : `${duur} te laat`;
}

/** "ma 10 nov 14:30" in Nederlandse tijd. */
export function deadlineTekst(deadline: string | null | undefined): string {
  const d = ms(deadline);
  if (d === null) return '';
  return new Date(d).toLocaleString('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "Reageren voor" / "Oplossen voor". */
export function slaSoortLabel(soort: SlaSoort): string {
  return soort === 'reactie' ? 'Reageren voor' : 'Oplossen voor';
}

/**
 * Een werkbon hoort bij "In te plannen" als hij nog geen datum heeft en nog
 * niet klaar of geannuleerd is.
 */
export function isInTePlannen(w: { gepland_op?: string | null; status?: string | null }): boolean {
  return !w.gepland_op && w.status !== 'afgerond' && w.status !== 'geannuleerd';
}

/** De werkbonvelden waar "In te plannen" op sorteert. */
export type InTePlannenWerkbon = {
  uiterlijk_op?: string | null;
  sla_reactie_voor?: string | null;
  sla_oplossen_voor?: string | null;
  gestart_op?: string | null;
  created_at?: string | null;
};

/**
 * Het eerste moment waarop deze werkbon iets moet: de uiterlijke datum (einde
 * van die dag), de reactiedeadline zolang hij niet gestart is, of de
 * oplosdeadline. Null als er niets is.
 */
export function eersteDeadline(w: InTePlannenWerkbon): number | null {
  const momenten = [
    w.uiterlijk_op ? ms(`${w.uiterlijk_op}T23:59:59`) : null,
    w.gestart_op ? null : ms(w.sla_reactie_voor),
    ms(w.sla_oplossen_voor),
  ].filter((x): x is number => x !== null);
  return momenten.length ? Math.min(...momenten) : null;
}

/**
 * Sortering voor "In te plannen": eerst wat het vroegst moet (uiterlijke datum
 * of SLA-deadline; een verlopen reactietijd staat dus bovenaan), dan de rest
 * op aanmaakdatum (oudste eerst).
 */
export function vergelijkInTePlannen(a: InTePlannenWerkbon, b: InTePlannenWerkbon): number {
  const da = eersteDeadline(a);
  const db = eersteDeadline(b);
  if (da !== null && db !== null && da !== db) return da - db;
  if (da !== null && db === null) return -1;
  if (da === null && db !== null) return 1;
  return (a.created_at ?? '').localeCompare(b.created_at ?? '');
}
