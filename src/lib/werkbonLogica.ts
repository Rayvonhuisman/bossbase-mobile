/**
 * Pure werkbonlogica, letterlijk naar het dashboard:
 *   - statussen en kleuren      (utils/statusColors.js)
 *   - dagen, tijden en ploeg     (utils/werkbonDagen.js)
 *   - zoeken/filteren lijst      (pages/WerkbonPageV2.jsx)
 *   - materiaalbedragen en marge (services/werkbonService.js, materiaalService.js)
 *
 * Geen React, geen Supabase: dit bestand draait ook rechtstreeks in Node
 * (tests/werkbonLogica.test.mjs). Rijen hebben de databasevorm (snake_case).
 */

// ── Statussen ───────────────────────────────────────────────────────────────

export type WerkbonStatusKey = 'gepland' | 'in_uitvoering' | 'afgerond' | 'geannuleerd';

/**
 * De statussen die je in het formulier kiest. `geannuleerd` (dashboard,
 * migratie 20261026121700) staat er bewust niet in: annuleren gaat met de knop
 * op de werkbon in het dashboard, met de controle op uren en handtekening.
 */
export const WERKBON_STATUSSEN: readonly WerkbonStatusKey[] = ['gepland', 'in_uitvoering', 'afgerond'];

/** Kleuren uit het dashboard (statusColors.js: blue / orange / green). */
export const WERKBON_STATUS_STIJL: Record<
  WerkbonStatusKey,
  { label: string; kleur: string; bg: string; dot: string }
> = {
  gepland: { label: 'Gepland', kleur: '#2563eb', bg: '#eff6ff', dot: '#2563eb' },
  in_uitvoering: { label: 'In uitvoering', kleur: '#e8784a', bg: '#fff4ec', dot: '#e8784a' },
  afgerond: { label: 'Afgerond', kleur: '#15A34A', bg: '#ecfdf5', dot: '#15A34A' },
  // Grijs, zoals statusColors.js: gaat niet door.
  geannuleerd: { label: 'Geannuleerd', kleur: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
};

/** Aliassen zoals het dashboard ze accepteert; onbekend → gepland. */
export function normaliseerStatus(status: string | null | undefined): WerkbonStatusKey {
  const s = String(status ?? '').toLowerCase();
  if (s === 'in_uitvoering' || s === 'in_progress' || s === 'bezig') return 'in_uitvoering';
  if (s === 'afgerond' || s === 'done' || s === 'completed' || s === 'voltooid') return 'afgerond';
  if (s === 'geannuleerd') return 'geannuleerd';
  return 'gepland';
}

// ── Dagen ───────────────────────────────────────────────────────────────────

export type Tijdvak = { starttijd: string | null; eindtijd: string | null };

export type WerkbonDag = {
  id?: string | null;
  datum: string;
  starttijd: string | null;
  eindtijd: string | null;
  /** null = hele ploeg, [] = niemand. */
  medewerker_ids?: string[] | null;
  medewerker_tijden?: Record<string, Tijdvak> | null;
  /** null = alle voertuigen van de werkbon. */
  voertuig_ids?: string[] | null;
  voertuig_tijden?: Record<string, Tijdvak> | null;
  medewerker_voertuig?: Record<string, string> | null;
};

export type WerkbonPlanbaar = {
  gepland_op?: string | null;
  starttijd?: string | null;
  eindtijd?: string | null;
  assigned_to?: string | null;
  assigned_to_ids?: string[] | null;
  werkbon_dagen?: WerkbonDag[] | null;
};

export const MAX_DAGEN = 60;
export const STANDAARD_TIJD = { starttijd: '08:00', eindtijd: '16:30' };

const DAG_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MAAND_LANG = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

const naarDate = (iso: string) => new Date(`${iso}T12:00:00`);
const pad = (n: number) => String(n).padStart(2, '0');
const naarIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hhmm = (t: string | null | undefined): string => (t ? String(t).slice(0, 5) : '');

export function plusDagen(iso: string, n: number): string {
  const d = naarDate(iso);
  d.setDate(d.getDate() + n);
  return naarIso(d);
}

/** "ma 3 nov" */
export function korteDatum(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = naarDate(String(iso).slice(0, 10));
  if (Number.isNaN(d.valueOf())) return String(iso);
  return `${DAG_KORT[d.getDay()]} ${d.getDate()} ${MAAND_KORT[d.getMonth()]}`;
}

/** "september 2026" — maand 0-based. */
export const maandNaam = (jaar: number, maand: number) => `${MAAND_LANG[maand]} ${jaar}`;

/** De dagen, gesorteerd; zonder dagenlijst terugval op gepland_op. */
export function werkbonDagen(w: WerkbonPlanbaar | null | undefined): WerkbonDag[] {
  const dagen = w?.werkbon_dagen;
  if (Array.isArray(dagen) && dagen.length) {
    return [...dagen].sort((a, b) => a.datum.localeCompare(b.datum));
  }
  return w?.gepland_op
    ? [{ id: null, datum: String(w.gepland_op).slice(0, 10), starttijd: null, eindtijd: null, medewerker_ids: null, medewerker_tijden: null }]
    : [];
}

export const ploegVan = (w: WerkbonPlanbaar | null | undefined): string[] =>
  w?.assigned_to_ids?.length ? w.assigned_to_ids : w?.assigned_to ? [w.assigned_to] : [];

export const tijdenOpDag = (w: WerkbonPlanbaar | null | undefined, dag: WerkbonDag | null | undefined): Tijdvak => ({
  starttijd: hhmm(dag?.starttijd) || hhmm(w?.starttijd) || null,
  eindtijd: hhmm(dag?.eindtijd) || hhmm(w?.eindtijd) || null,
});

export const ploegOpDag = (w: WerkbonPlanbaar | null | undefined, dag: WerkbonDag | null | undefined): string[] =>
  Array.isArray(dag?.medewerker_ids) ? dag.medewerker_ids : ploegVan(w);

export function tijdenVoorPersoon(w: WerkbonPlanbaar, dag: WerkbonDag, pid: string): Tijdvak {
  const eigen = pid ? dag?.medewerker_tijden?.[pid] : null;
  if (eigen && hhmm(eigen.starttijd)) {
    return { starttijd: hhmm(eigen.starttijd), eindtijd: hhmm(eigen.eindtijd) || null };
  }
  return tijdenOpDag(w, dag);
}

const vroegste = (l: string[]) => l.reduce<string | null>((m, t) => (m && m <= t ? m : t), null);
const laatste = (l: string[]) => l.reduce<string | null>((m, t) => (m && m >= t ? m : t), null);

export function dagVenster(w: WerkbonPlanbaar, dag: WerkbonDag): Tijdvak {
  if (hhmm(dag?.starttijd)) return { starttijd: hhmm(dag.starttijd), eindtijd: hhmm(dag.eindtijd) || null };
  const tijden = ploegOpDag(w, dag)
    .map((pid) => tijdenVoorPersoon(w, dag, pid))
    .filter((t) => t.starttijd);
  if (!tijden.length) return tijdenOpDag(w, dag);
  return {
    starttijd: vroegste(tijden.map((t) => t.starttijd as string)),
    eindtijd: laatste(tijden.map((t) => t.eindtijd).filter((x): x is string => !!x)),
  };
}

export function werkbonVenster(w: WerkbonPlanbaar): Tijdvak {
  const vensters = werkbonDagen(w).map((d) => dagVenster(w, d)).filter((v) => v.starttijd);
  if (!vensters.length) return { starttijd: hhmm(w?.starttijd) || null, eindtijd: hhmm(w?.eindtijd) || null };
  return {
    starttijd: vroegste(vensters.map((v) => v.starttijd as string)),
    eindtijd: laatste(vensters.map((v) => v.eindtijd).filter((x): x is string => !!x)),
  };
}

/** Ingepland = minstens één dag met een starttijd. */
export const isIngepland = (w: WerkbonPlanbaar) => werkbonDagen(w).some((d) => tijdenOpDag(w, d).starttijd);

/** "ma 3 nov" of "ma 3 nov – vr 7 nov · 5 dagen" */
export function planningLabel(w: WerkbonPlanbaar): string {
  const dagen = werkbonDagen(w);
  if (!dagen.length) return '';
  if (dagen.length === 1) return korteDatum(dagen[0]!.datum);
  return `${korteDatum(dagen[0]!.datum)} – ${korteDatum(dagen[dagen.length - 1]!.datum)} · ${dagen.length} dagen`;
}

/** Staat deze persoon (of zonder uid: de werkbon) op die datum? */
export const staatOpDagVoor = (w: WerkbonPlanbaar, iso: string, uid?: string | null) =>
  werkbonDagen(w).some(
    (d) =>
      d.datum === iso &&
      (!uid || ploegOpDag(w, d).includes(uid) || (!Array.isArray(d.medewerker_ids) && w?.assigned_to === uid)),
  );

/**
 * De eerstvolgende dag (≥ vandaag) waarop `uid` in de dagploeg staat, met zijn
 * tijd — voor "Jij bent vandaag ingepland van … tot …".
 */
export function mijnVolgendeDag(
  w: WerkbonPlanbaar,
  uid: string | null | undefined,
  vandaag: string,
): { dag: WerkbonDag; tijd: Tijdvak; collegas: number } | null {
  if (!uid) return null;
  for (const dag of werkbonDagen(w)) {
    if (dag.datum < vandaag) continue;
    const ploeg = ploegOpDag(w, dag);
    if (!ploeg.includes(uid)) continue;
    return { dag, tijd: tijdenVoorPersoon(w, dag, uid), collegas: ploeg.filter((p) => p !== uid).length };
  }
  return null;
}

/** "vandaag" / "morgen" / "op ma 3 nov" */
export function dagWoord(iso: string, vandaag: string): string {
  if (iso === vandaag) return 'vandaag';
  if (iso === plusDagen(vandaag, 1)) return 'morgen';
  return `op ${korteDatum(iso)}`;
}

// ── Formulier: planning ─────────────────────────────────────────────────────

export type Planning = {
  dagen: string[];
  tijden: Record<string, Tijdvak>;
  /** Alleen dagen met een eigen dagploeg. */
  ploeg: Record<string, string[]>;
  /** Alleen wie afwijkt. */
  persoonTijden: Record<string, Record<string, Tijdvak>>;
  /** Voertuigen per dag — alleen dagen met een eigen lijst (zie voertuigPlanningUitWerkbon). */
  voertuigen?: Record<string, string[]>;
  /** Eigen tijd van een voertuig op een dag: { iso: { voertuigId: tijd } }. */
  voertuigTijden?: Record<string, Record<string, Tijdvak>>;
  /** Wie waarin zit: { iso: { profielId: voertuigId } }. */
  koppeling?: Record<string, Record<string, string>>;
};

export const legePlanning = (dag = ''): Planning => ({
  dagen: dag ? [dag] : [],
  tijden: {},
  ploeg: {},
  persoonTijden: {},
});

export const geplandeDatums = (p: Planning | null | undefined): string[] =>
  [...new Set(p?.dagen ?? [])].filter(Boolean).sort();

export function tijdVanDag(p: Planning | null | undefined, iso: string, standaard: Partial<Tijdvak> = {}): { starttijd: string; eindtijd: string } {
  const t = p?.tijden?.[iso];
  return t
    ? { starttijd: hhmm(t.starttijd), eindtijd: hhmm(t.eindtijd) }
    : { starttijd: hhmm(standaard.starttijd), eindtijd: hhmm(standaard.eindtijd) };
}

/** Dag aan/uit; een nieuwe dag neemt de tijd van de vorige (of volgende) over. */
export function wisselDag(p: Planning, iso: string, standaard: Partial<Tijdvak> = {}): Planning {
  const set = new Set(p.dagen ?? []);
  const tijden = { ...(p.tijden ?? {}) };
  const ploeg = { ...(p.ploeg ?? {}) };
  const persoonTijden = { ...(p.persoonTijden ?? {}) };
  if (set.has(iso)) {
    set.delete(iso);
    delete tijden[iso];
    delete ploeg[iso];
    delete persoonTijden[iso];
  } else {
    const gesorteerd = [...set].sort();
    const bron = gesorteerd.filter((d) => d < iso).pop() ?? gesorteerd.find((d) => d > iso);
    tijden[iso] = bron
      ? tijdVanDag(p, bron, standaard)
      : {
          starttijd: hhmm(standaard.starttijd) || STANDAARD_TIJD.starttijd,
          eindtijd: hhmm(standaard.eindtijd) || STANDAARD_TIJD.eindtijd,
        };
    set.add(iso);
  }
  return { ...p, dagen: [...set].sort(), tijden, ploeg, persoonTijden };
}

/** Zonder planningsmodule: de klus begint op deze dag; meerdaags schuift mee. */
export function verplaatsNaar(p: Planning, iso: string): Planning {
  const huidig = geplandeDatums(p);
  if (huidig.length <= 1) {
    const oud = huidig[0];
    const t = oud ? p.tijden[oud] : undefined;
    return { ...p, dagen: [iso], tijden: t ? { [iso]: t } : {}, ploeg: {}, persoonTijden: {} };
  }
  const verschil = Math.round((naarDate(iso).getTime() - naarDate(huidig[0]!).getTime()) / 86400000);
  const schuif = <T,>(o: Record<string, T>) =>
    Object.fromEntries(Object.entries(o ?? {}).map(([d, v]) => [plusDagen(d, verschil), v]));
  return {
    dagen: huidig.map((d) => plusDagen(d, verschil)),
    tijden: schuif(p.tijden),
    ploeg: schuif(p.ploeg),
    persoonTijden: schuif(p.persoonTijden),
  };
}

/** De tijd van de eerste dag op alle dagen zetten ("voor alle dagen"). */
export function tijdVoorAlleDagen(p: Planning, standaard: Partial<Tijdvak> = {}): Planning {
  const datums = geplandeDatums(p);
  if (!datums.length) return p;
  const eerste = tijdVanDag(p, datums[0]!, standaard);
  return { ...p, tijden: Object.fromEntries(datums.map((d) => [d, { ...eerste }])) };
}

/** Verschillen de tijden tussen de dagen? Dan heeft "voor alle dagen" zin. */
export function tijdenVerschillen(p: Planning, standaard: Partial<Tijdvak> = {}): boolean {
  const datums = geplandeDatums(p);
  if (datums.length < 2) return false;
  const e = tijdVanDag(p, datums[0]!, standaard);
  return datums.some((d) => {
    const t = tijdVanDag(p, d, standaard);
    return t.starttijd !== e.starttijd || t.eindtijd !== e.eindtijd;
  });
}

/** Wie staat er in het formulier op deze dag (dagploeg of hele ploeg). */
export function ploegInFormulier(p: Planning, iso: string, team: string[]): string[] {
  const eigen = p.ploeg?.[iso];
  return Array.isArray(eigen) ? eigen.filter((id) => team.includes(id)) : team;
}

/** Iemand op een dag aan/uit zetten. Van de dag af = ook zijn eigen tijd kwijt. */
export function wisselPersoonOpDag(p: Planning, iso: string, pid: string, team: string[]): Planning {
  const huidig = ploegInFormulier(p, iso, team);
  const aan = huidig.includes(pid);
  const nieuw = aan ? huidig.filter((x) => x !== pid) : [...huidig, pid];
  const ploeg = { ...p.ploeg };
  if (team.length === nieuw.length && team.every((x) => nieuw.includes(x))) delete ploeg[iso];
  else ploeg[iso] = nieuw;
  const persoonTijden = { ...p.persoonTijden };
  if (aan && persoonTijden[iso]) {
    const rest = { ...persoonTijden[iso] };
    delete rest[pid];
    persoonTijden[iso] = rest;
  }
  return { ...p, ploeg, persoonTijden };
}

/** Opgeslagen dagen → formulier. */
export function planningUitWerkbon(w: WerkbonPlanbaar): Planning {
  const tijden: Planning['tijden'] = {};
  const ploeg: Planning['ploeg'] = {};
  const persoonTijden: Planning['persoonTijden'] = {};
  const dagen = werkbonDagen(w);
  for (const d of dagen) {
    tijden[d.datum] = {
      starttijd: hhmm(d.starttijd) || hhmm(w?.starttijd),
      eindtijd: hhmm(d.eindtijd) || hhmm(w?.eindtijd),
    };
    if (Array.isArray(d.medewerker_ids)) ploeg[d.datum] = d.medewerker_ids;
    if (d.medewerker_tijden && Object.keys(d.medewerker_tijden).length) {
      persoonTijden[d.datum] = Object.fromEntries(
        Object.entries(d.medewerker_tijden).map(([pid, t]) => [
          pid,
          { starttijd: hhmm(t?.starttijd), eindtijd: hhmm(t?.eindtijd) },
        ]),
      );
    }
  }
  return { dagen: dagen.map((d) => d.datum), tijden, ploeg, persoonTijden };
}

export type DagPayload = {
  datum: string;
  starttijd: string | null;
  eindtijd: string | null;
  medewerker_ids: string[] | null;
  medewerker_tijden: Record<string, { starttijd: string; eindtijd: string }> | null;
  /**
   * Voertuigsleutels: alleen meegestuurd door `metVoertuigen`. Staan ze erbij,
   * dan overschrijft de RPC; ontbreken ze, dan blijft staan wat er stond.
   */
  voertuig_ids?: string[] | null;
  voertuig_tijden?: Record<string, { starttijd: string; eindtijd: string }> | null;
  medewerker_voertuig?: Record<string, string> | null;
};

const zelfdeSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Wat naar `bb_werkbon_dagen_zetten` gaat. Dag 1 en dagen gelijk aan dag 1
 * krijgen geen eigen tijd; een dagploeg gelijk aan de hele ploeg wordt NULL.
 * Voertuigsleutels gaan bewust niet mee: dan houdt de RPC de bestaande waarde.
 */
export function dagenUitPlanning(p: Planning, ploegIds: string[] | null = null, standaard: Partial<Tijdvak> = {}): DagPayload[] {
  const datums = geplandeDatums(p);
  const eerste = datums.length ? tijdVanDag(p, datums[0]!, standaard) : null;
  const team = Array.isArray(ploegIds) ? ploegIds.filter(Boolean) : null;
  return datums.map((datum, i) => {
    let medewerker_ids: string[] | null = null;
    const eigen = p.ploeg?.[datum];
    if (team && Array.isArray(eigen)) {
      const binnen = eigen.filter((id) => team.includes(id));
      medewerker_ids = zelfdeSet(binnen, team) ? null : binnen;
    }
    const dagploeg = medewerker_ids ?? team ?? [];
    let medewerker_tijden: DagPayload['medewerker_tijden'] = null;
    const pt = p.persoonTijden?.[datum];
    if (pt && team) {
      const geldig = Object.entries(pt).filter(
        ([pid, t]) => dagploeg.includes(pid) && hhmm(t?.starttijd) && hhmm(t?.eindtijd),
      );
      if (geldig.length) {
        medewerker_tijden = Object.fromEntries(
          geldig.map(([pid, t]) => [pid, { starttijd: hhmm(t.starttijd), eindtijd: hhmm(t.eindtijd) }]),
        );
      }
    }
    const t = tijdVanDag(p, datum, standaard);
    const wijktAf = i > 0 && !!eerste && (t.starttijd !== eerste.starttijd || t.eindtijd !== eerste.eindtijd);
    return {
      datum,
      starttijd: wijktAf ? t.starttijd || null : null,
      eindtijd: wijktAf ? t.eindtijd || null : null,
      medewerker_ids,
      medewerker_tijden,
    };
  });
}

/**
 * Eén blok in de planning op een nieuwe tijd zetten — `verzetTijd` van het
 * dashboard (utils/werkbonDagen.js). Geeft terug wat er naar de database moet:
 * `dagen` (voor zetWerkbonDagen) en `standaard` (de tijd van de werkbon zelf,
 * gelijk aan die van de eerste dag).
 *
 * Met `pid`: alleen die persoon op die dag krijgt een eigen tijd; komt die weer
 * gelijk aan de dagtijd, dan vervalt de eigen tijd. Zonder `pid`: de tijd van
 * díé datum.
 */
export function verzetTijd(
  werkbon: WerkbonPlanbaar & { dagen?: readonly object[] | null },
  datum: string,
  pid: string | null,
  nieuw: { starttijd: string; eindtijd: string },
): { dagen: DagPayload[]; standaard: { starttijd: string; eindtijd: string } } {
  // De planning levert de dagen als `dagen`, de werkbon zelf als `werkbon_dagen`.
  const w: WerkbonPlanbaar = {
    ...werkbon,
    werkbon_dagen: werkbon.werkbon_dagen ?? ((werkbon.dagen as WerkbonDag[] | null | undefined) ?? null),
  };
  const p = planningUitWerkbon(w);
  if (!p.dagen.includes(datum)) throw new Error('Deze dag staat niet (meer) op de werkbon. Ververs de planning.');
  const t = { starttijd: hhmm(nieuw.starttijd), eindtijd: hhmm(nieuw.eindtijd) };
  if (pid) {
    const dagTijd = tijdVanDag(p, datum);
    const eigen = { ...(p.persoonTijden[datum] ?? {}) };
    if (t.starttijd === dagTijd.starttijd && t.eindtijd === dagTijd.eindtijd) delete eigen[pid];
    else eigen[pid] = t;
    p.persoonTijden = { ...p.persoonTijden, [datum]: eigen };
  } else {
    p.tijden = { ...p.tijden, [datum]: t };
  }
  const standaard = tijdVanDag(p, geplandeDatums(p)[0]!, { starttijd: w.starttijd, eindtijd: w.eindtijd });
  const ploeg = w.assigned_to_ids?.length ? w.assigned_to_ids : w.assigned_to ? [w.assigned_to] : [];
  return { dagen: dagenUitPlanning(p, ploeg, standaard), standaard };
}

export type DagMelding = {
  uid: string;
  soort: 'ingepland' | 'afgehaald';
  dag: { datum: string; start: string; eind: string };
};

/**
 * Per dag: wie op de werkbon blijft, kan er bij een meerdaagse klus een dag
 * bij krijgen of er een kwijtraken — dat valt buiten "toegewezen/afgehaald".
 * Zelfde regel als de planning in het dashboard (DetailModal): medewerker_ids
 * null = de hele ploeg die dag, [] = niemand.
 */
export function dagMeldingen(o: {
  oudeDagen: Pick<WerkbonDag, 'datum' | 'starttijd' | 'eindtijd' | 'medewerker_ids'>[];
  nieuweDagen: Pick<WerkbonDag, 'datum' | 'starttijd' | 'eindtijd' | 'medewerker_ids'>[];
  oudePloeg: string[];
  nieuwePloeg: string[];
  blijvers: string[];
}): DagMelding[] {
  const dagenVan = (
    lijst: Pick<WerkbonDag, 'datum' | 'starttijd' | 'eindtijd' | 'medewerker_ids'>[],
    id: string,
    ploeg: string[],
  ) =>
    lijst
      .filter((d) => (d.medewerker_ids == null ? ploeg.includes(id) : d.medewerker_ids.includes(id)))
      .map((d) => ({ datum: d.datum, start: hhmm(d.starttijd), eind: hhmm(d.eindtijd) }));
  const uit: DagMelding[] = [];
  for (const uid of o.blijvers) {
    const oud = dagenVan(o.oudeDagen, uid, o.oudePloeg);
    const nieuw = dagenVan(o.nieuweDagen, uid, o.nieuwePloeg);
    for (const d of nieuw) if (!oud.some((x) => x.datum === d.datum)) uit.push({ uid, soort: 'ingepland', dag: d });
    for (const d of oud) if (!nieuw.some((x) => x.datum === d.datum)) uit.push({ uid, soort: 'afgehaald', dag: d });
  }
  return uit;
}

/** Foutmelding of '' (controleerPlanning van het dashboard). */
export function controleerPlanning(p: Planning, standaard: Partial<Tijdvak> = {}): string {
  const datums = geplandeDatums(p);
  if (datums.length > MAX_DAGEN) {
    return `Een werkbon kan maximaal ${MAX_DAGEN} dagen hebben; dit zijn er ${datums.length}. Verdeel de klus over meerdere werkbonnen.`;
  }
  for (const d of datums) {
    const t = tijdVanDag(p, d, standaard);
    if (!t.starttijd || !t.eindtijd) {
      return datums.length > 1
        ? `Vul voor ${korteDatum(d)} een begin- en eindtijd in. Een dag zonder tijd verschijnt niet in de planning.`
        : 'Vul een begin- en eindtijd in. Een dag zonder tijd verschijnt niet in de planning.';
    }
    if (t.eindtijd <= t.starttijd) return `Op ${korteDatum(d)} moet de eindtijd na de begintijd liggen.`;
  }
  for (const d of datums) {
    for (const t of Object.values(p.persoonTijden?.[d] ?? {})) {
      const s = hhmm(t?.starttijd);
      const e = hhmm(t?.eindtijd);
      if (!s || !e) return `Een eigen tijd op ${korteDatum(d)} heeft een begin- en eindtijd nodig.`;
      if (e <= s) return `Op ${korteDatum(d)} ligt een eigen eindtijd vóór de begintijd.`;
    }
  }
  return '';
}

/** Maandraster (maandag eerst) met null voor lege vakjes. */
export function maandRaster(jaar: number, maand: number): (string | null)[] {
  const eerste = new Date(jaar, maand, 1, 12);
  const offset = (eerste.getDay() + 6) % 7;
  const aantal = new Date(jaar, maand + 1, 0, 12).getDate();
  const vakjes: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= aantal; d++) vakjes.push(`${jaar}-${pad(maand + 1)}-${pad(d)}`);
  while (vakjes.length % 7) vakjes.push(null);
  return vakjes;
}

// ── Lijst: zoeken en filteren ───────────────────────────────────────────────

export type WerkbonZoekbaar = {
  titel?: string | null;
  locatie?: string | null;
  nummer?: string | null;
  status?: string | null;
  customer?: { name?: string | null } | null;
};

/** Dashboard: `${titel} ${klant} ${locatie}` bevat de zoekterm (plus nummer). */
export function matchtZoekterm(w: WerkbonZoekbaar, q: string): boolean {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return `${w.titel ?? ''} ${w.customer?.name ?? ''} ${w.locatie ?? ''} ${w.nummer ?? ''}`
    .toLowerCase()
    .includes(term);
}

export type StatusFilter = 'alle' | WerkbonStatusKey;

/** "Alle" is alles wat doorgaat; een geannuleerde werkbon staat alleen onder zijn eigen filter. */
export function matchtStatus(w: WerkbonZoekbaar, filter: StatusFilter): boolean {
  const s = normaliseerStatus(w.status);
  return filter === 'alle' ? s !== 'geannuleerd' : s === filter;
}

export function telStatussen(lijst: WerkbonZoekbaar[]): Record<StatusFilter, number> {
  const tel: Record<StatusFilter, number> = { alle: 0, gepland: 0, in_uitvoering: 0, afgerond: 0, geannuleerd: 0 };
  for (const w of lijst) {
    const s = normaliseerStatus(w.status);
    tel[s]++;
    if (s !== 'geannuleerd') tel.alle++;
  }
  return tel;
}

// ── Materiaal ───────────────────────────────────────────────────────────────

// Gangbare eenheden in de bouw — `EENHEDEN` uit materiaalService.js van het
// dashboard (origin/main, 8c7302b). Een afwijkende eenheid (bijv. uit een
// import: "m1") blijft bewaard; de formulieren tonen hem als extra keuze.
export const EENHEDEN = [
  'stuk', 'm', 'm²', 'm³', 'kg', 'liter', 'uur', 'zak', 'plaat', 'rol', 'doos', 'koker', 'blik',
  'emmer', 'set', 'pak', 'bigbag',
] as const;
export const BTW_TARIEVEN = [21, 9, 0] as const;

export const rond2 = (n: number) => Math.round(n * 100) / 100;

/** subtotaal = round(aantal × prijs_per, 2) */
export function materiaalSubtotaal(aantal: number, prijsPer: number): number {
  const a = Number(aantal) || 0;
  const p = Number(prijsPer) || 0;
  return rond2(a * p);
}

export function inclusiefBtw(bedragExcl: number, btwPct: number): number {
  return rond2(bedragExcl * (1 + (Number(btwPct) || 0) / 100));
}

/** Marge in euro en procent; null zodra een prijs ontbreekt. */
export function marge(
  inkoopprijs: number | null | undefined,
  verkoopprijs: number | null | undefined,
): { bedrag: number; pct: number | null } | null {
  if (inkoopprijs == null || verkoopprijs == null) return null;
  const bedrag = rond2(verkoopprijs - inkoopprijs);
  const pct = verkoopprijs > 0 ? Math.round((bedrag / verkoopprijs) * 1000) / 10 : null;
  return { bedrag, pct };
}

/** "12,50" of "" → getal of null. */
export function leesBedrag(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s/g, '').replace('€', '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}

// ── Foto's ──────────────────────────────────────────────────────────────────

export const FOTO_CATEGORIE_STIJL = {
  voor: { label: 'Voor', kleur: '#2563EB', bg: '#EFF4FF' },
  tijdens: { label: 'Tijdens', kleur: '#D97706', bg: '#FFF7E6' },
  na: { label: 'Na', kleur: '#0F7A3F', bg: '#E8FBEF' },
} as const;

// ── Uren ────────────────────────────────────────────────────────────────────

/** Afronden op 5 minuten (rondAfOpVijf van het dashboard). */
export function rondAfOpVijf(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return t;
  let min = Number(m[1]) * 60 + Number(m[2]);
  min = Math.round(min / 5) * 5;
  if (min >= 24 * 60) min = 24 * 60 - 5;
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

// ── Planningblok op de werkbon (PlanningRegels / planRegels) ─────────────────

export type PlanRegel = { dag: WerkbonDag; datum: string; starttijd: string | null; eindtijd: string | null; wie: string[] };

/**
 * De regels van het Planning-blok, zoals planRegels() in het dashboard
 * (components/PlanningBlok.jsx): per dag het venster, en wie er werkt. Een
 * eigen tijd staat achter de naam, maar alleen als die afwijkt van het
 * venster van de dag. Een onbekende naam valt weg.
 */
export function planRegels(w: WerkbonPlanbaar & { voertuig_ids?: string[] | null }, naamVan: (pid: string) => string | null | undefined): PlanRegel[] {
  return werkbonDagen(w)
    .map((dag) => {
      const t = dagVenster(w, dag);
      const wie = ploegOpDag(w, dag)
        .map((pid) => {
          const naam = naamVan(pid);
          if (!naam) return null;
          const eigen = tijdenVoorPersoon(w, dag, pid);
          const afwijkend = eigen.starttijd !== t.starttijd || eigen.eindtijd !== t.eindtijd;
          return afwijkend && eigen.starttijd ? `${naam} (${eigen.starttijd}${eigen.eindtijd ? `–${eigen.eindtijd}` : ''})` : naam;
        })
        .filter((n): n is string => !!n);
      return { dag, datum: dag.datum, starttijd: t.starttijd, eindtijd: t.eindtijd, wie };
    })
    .filter((r) => r.datum)
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

/** "08:00–16:30", of "geen tijd". */
export const planTijd = (r: Pick<PlanRegel, 'starttijd' | 'eindtijd'>) =>
  r.starttijd ? `${r.starttijd}${r.eindtijd ? `–${r.eindtijd}` : ''}` : 'geen tijd';

/** Voertuigen op die dag: de eigen lijst van de dag, anders die van de werkbon (voertuigenOpDag). */
export const voertuigenOpDag = (w: { voertuig_ids?: string[] | null }, dag: WerkbonDag) =>
  Array.isArray(dag?.voertuig_ids) ? dag.voertuig_ids : (w?.voertuig_ids ?? []);

/** Tijd van een voertuig: eigen tijd → tijd van de dag → tijd van de werkbon (tijdVanVoertuig). */
export function tijdVanVoertuig(w: WerkbonPlanbaar, dag: WerkbonDag, vid: string): Tijdvak {
  const eigen = dag?.voertuig_tijden?.[vid];
  if (eigen && hhmm(eigen.starttijd) && hhmm(eigen.eindtijd)) {
    return { starttijd: hhmm(eigen.starttijd), eindtijd: hhmm(eigen.eindtijd) };
  }
  return tijdenOpDag(w, dag);
}

/**
 * De regel onder een dag per voertuig (busRegels in PlanningBlok.jsx):
 * naam · tijd · wie erin zit (alleen koppelingen die die dag gelden) · bezetting.
 * Een voertuig dat niet (meer) bestaat valt weg.
 */
export function busRegels(
  w: WerkbonPlanbaar & { voertuig_ids?: string[] | null },
  dag: WerkbonDag,
  voertuigen: Record<string, { naam: string; zitplaatsen?: number | null }>,
  naamVan: (pid: string) => string | null | undefined,
): { vid: string; tekst: string }[] {
  const ploeg = ploegOpDag(w, dag);
  const opDag = voertuigenOpDag(w, dag);
  return opDag.flatMap((vid) => {
    const v = voertuigen[vid];
    if (!v) return [];
    const t = tijdVanVoertuig(w, dag, vid);
    const inzittenden = ploeg.filter((pid) => {
      const zit = dag?.medewerker_voertuig?.[pid];
      return !!zit && zit === vid && opDag.includes(zit);
    });
    const namen = inzittenden.map(naamVan).filter((n): n is string => !!n);
    return [
      {
        vid,
        tekst: [
          v.naam,
          t.starttijd ? `${t.starttijd}–${t.eindtijd || '?'}` : null,
          namen.length ? namen.join(', ') : 'niemand erin',
          v.zitplaatsen ? `${inzittenden.length}/${v.zitplaatsen}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      },
    ];
  });
}

// ── Voertuigen per dag (utils/voertuigDagen.js van het dashboard) ───────────
//
// Het formulier houdt naast dagen/tijden/ploeg bij (zie `Planning`):
//   voertuigen      { iso: [voertuigId] }            — alleen dagen met een eigen lijst
//   voertuigTijden  { iso: { voertuigId: tijd } }    — alleen afwijkers
//   koppeling       { iso: { profielId: voertuigId } }
//
// De tijd van een voertuig op een dag: eigen tijd → tijd van de dag → werkbon.
// Twee regels, gelijk aan de database (bb_voertuig_te_vol e.a.):
//   * wie gekoppeld wordt, werkt binnen de tijd van het voertuig;
//   * er zitten nooit meer mensen tegelijk in dan er plekken zijn.
// Tijden lopen zonder eindpunt: 10:00–12:00 en 12:00–17:00 overlappen niet.
// De database toetst alleen een NIEUWE koppeling.

export type PlanVoertuig = { id: string; naam: string; zitplaatsen?: number | null };

export type VoertuigCtx = {
  p: Planning;
  standaard: Partial<Tijdvak>;
  ploegIds: string[];
  /** De voertuigen van de werkbon (in het formulier: de gekozen). */
  voertuigen: PlanVoertuig[];
  naamVan: (pid: string) => string;
};

const heeftTijd = (t: Partial<Tijdvak> | null | undefined) => !!(hhmm(t?.starttijd) && hhmm(t?.eindtijd));
const naarMin = (t: string | null | undefined) => {
  const [h, m] = hhmm(t).split(':').map(Number);
  return (h ?? 0) * 60 + (m || 0);
};
const naarTijdTekst = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** Opgeslagen dagen → de voertuigvelden van het formulier. */
export function voertuigPlanningUitWerkbon(
  w: WerkbonPlanbaar,
): Required<Pick<Planning, 'voertuigen' | 'voertuigTijden' | 'koppeling'>> {
  const voertuigen: Record<string, string[]> = {};
  const voertuigTijden: Record<string, Record<string, Tijdvak>> = {};
  const koppeling: Record<string, Record<string, string>> = {};
  for (const d of werkbonDagen(w)) {
    if (Array.isArray(d.voertuig_ids)) voertuigen[d.datum] = d.voertuig_ids;
    if (d.voertuig_tijden && Object.keys(d.voertuig_tijden).length) {
      voertuigTijden[d.datum] = Object.fromEntries(
        Object.entries(d.voertuig_tijden).map(([vid, t]) => [vid, { starttijd: hhmm(t?.starttijd), eindtijd: hhmm(t?.eindtijd) }]),
      );
    }
    if (d.medewerker_voertuig && Object.keys(d.medewerker_voertuig).length) koppeling[d.datum] = { ...d.medewerker_voertuig };
  }
  return { voertuigen, voertuigTijden, koppeling };
}

const alleVoertuigIds = (ctx: VoertuigCtx) => ctx.voertuigen.map((v) => v.id);
const dagPloegCtx = (ctx: VoertuigCtx, iso: string) =>
  Array.isArray(ctx.p.ploeg?.[iso]) ? ctx.p.ploeg[iso]!.filter((id) => ctx.ploegIds.includes(id)) : ctx.ploegIds;

/** Voertuigen op die dag, in het formulier. */
export function voertuigenVanDag(ctx: VoertuigCtx, iso: string): string[] {
  const eigen = ctx.p.voertuigen?.[iso];
  return Array.isArray(eigen) ? eigen.filter((id) => alleVoertuigIds(ctx).includes(id)) : alleVoertuigIds(ctx);
}

/** Tijd van een voertuig op die dag, in het formulier. */
export function voertuigTijd(ctx: VoertuigCtx, iso: string, vid: string): { starttijd: string; eindtijd: string } {
  const eigen = ctx.p.voertuigTijden?.[iso]?.[vid];
  return heeftTijd(eigen)
    ? { starttijd: hhmm(eigen!.starttijd), eindtijd: hhmm(eigen!.eindtijd) }
    : tijdVanDag(ctx.p, iso, ctx.standaard);
}

/** Tijd van een persoon op die dag, in het formulier. */
export function persoonTijd(ctx: VoertuigCtx, iso: string, pid: string): { starttijd: string; eindtijd: string } {
  const eigen = ctx.p.persoonTijden?.[iso]?.[pid];
  return heeftTijd(eigen)
    ? { starttijd: hhmm(eigen!.starttijd), eindtijd: hhmm(eigen!.eindtijd) }
    : tijdVanDag(ctx.p, iso, ctx.standaard);
}

/** De koppelingen die op die dag gelden: alleen wie er werkt, in een voertuig van die dag. */
export function koppelingVanDag(ctx: VoertuigCtx, iso: string): Record<string, string> {
  const ploeg = dagPloegCtx(ctx, iso);
  const voertuigen = voertuigenVanDag(ctx, iso);
  return Object.fromEntries(
    Object.entries(ctx.p.koppeling?.[iso] ?? {}).filter(([pid, vid]) => ploeg.includes(pid) && voertuigen.includes(vid)),
  );
}

/** Hoeveel mensen zitten er op het drukste moment in? */
export function hoogsteBezetting(bezetters: Partial<Tijdvak>[]): number {
  const lijst = bezetters.filter(heeftTijd).map((b) => [naarMin(b.starttijd), naarMin(b.eindtijd)] as const);
  return lijst.reduce((max, [s]) => Math.max(max, lijst.filter(([a, b]) => a <= s && s < b).length), 0);
}

/**
 * Het eerste aaneengesloten stuk met meer dan `plekken` mensen tegelijk dat
 * overlapt met van–tot (standaard de hele dag). Zelfde regel als bb_voertuig_te_vol.
 */
export function teVol(
  bezetters: Partial<Tijdvak>[],
  plekken: number | null | undefined,
  van: string | null = null,
  tot: string | null = null,
): { van: string; tot: string; aantal: number } | null {
  if (!plekken) return null;
  const lijst = bezetters.filter(heeftTijd).map((b) => [naarMin(b.starttijd), naarMin(b.eindtijd)] as const);
  const punten = [...new Set(lijst.flat())].sort((a, b) => a - b);
  const binnenVan = van ? naarMin(van) : 0;
  const binnenTot = tot ? naarMin(tot) : 24 * 60;
  type Run = { van: number; tot: number; aantal: number };
  let run = null as Run | null;
  for (let i = 0; i < punten.length - 1; i++) {
    const a = punten[i]!;
    const b = punten[i + 1]!;
    const n = lijst.filter(([s, e]) => s <= a && a < e).length;
    if (n > plekken && a < binnenTot && b > binnenVan) {
      const vorige: Run | null = run;
      run = vorige ? { van: vorige.van, tot: b, aantal: Math.max(vorige.aantal, n) } : { van: a, tot: b, aantal: n };
    } else if (run) {
      break;
    }
  }
  return run ? { van: naarTijdTekst(run.van), tot: naarTijdTekst(run.tot), aantal: run.aantal } : null;
}

/** Letterlijk dezelfde zinnen als de database en het dashboard. */
export const meldingBuitenTijd = (
  naam: string,
  pt: { starttijd: string; eindtijd: string },
  voertuigNaam: string,
  vt: { starttijd: string; eindtijd: string },
) => `${naam} werkt ${pt.starttijd}–${pt.eindtijd}, ${voertuigNaam} staat ${vt.starttijd}–${vt.eindtijd}.`;

export const meldingVol = (v: PlanVoertuig, vol: { van: string; tot: string; aantal: number }) =>
  `${v.naam} heeft ${v.zitplaatsen} ${v.zitplaatsen === 1 ? 'plek' : 'plekken'}, tussen ${vol.van} en ${vol.tot} zitten er ${vol.aantal} in.`;

/** Het drukste moment in een voertuig op die dag. */
export function bezettingVanVoertuig(ctx: VoertuigCtx, iso: string, vid: string): number {
  const k = koppelingVanDag(ctx, iso);
  return hoogsteBezetting(Object.keys(k).filter((pid) => k[pid] === vid).map((pid) => persoonTijd(ctx, iso, pid)));
}

/** Mag deze persoon op die dag in dit voertuig? '' = ja, anders de melding (zoals de database). */
export function magKoppelen(ctx: VoertuigCtx, iso: string, pid: string, vid: string): string {
  const voertuig = ctx.voertuigen.find((v) => v.id === vid);
  if (!voertuig) return '';
  const pt = persoonTijd(ctx, iso, pid);
  const vt = voertuigTijd(ctx, iso, vid);
  if (!heeftTijd(pt) || !heeftTijd(vt)) return '';
  if (pt.starttijd < vt.starttijd || pt.eindtijd > vt.eindtijd) return meldingBuitenTijd(ctx.naamVan(pid), pt, voertuig.naam, vt);
  if (voertuig.zitplaatsen) {
    const k = koppelingVanDag(ctx, iso);
    const anderen = Object.keys(k).filter((x) => x !== pid && k[x] === vid);
    const vol = teVol([...anderen, pid].map((x) => persoonTijd(ctx, iso, x)), voertuig.zitplaatsen, pt.starttijd, pt.eindtijd);
    if (vol) return meldingVol(voertuig, vol);
  }
  return '';
}

/** Wat er op die dag niet (meer) klopt: { perPersoon: { pid: [tekst] }, perVoertuig: { vid: [tekst] } }. */
export function voertuigWaarschuwingen(
  ctx: VoertuigCtx,
  iso: string,
): { perPersoon: Record<string, string[]>; perVoertuig: Record<string, string[]> } {
  const perPersoon: Record<string, string[]> = {};
  const perVoertuig: Record<string, string[]> = {};
  const k = koppelingVanDag(ctx, iso);
  for (const [pid, vid] of Object.entries(k)) {
    const voertuig = ctx.voertuigen.find((v) => v.id === vid);
    const pt = persoonTijd(ctx, iso, pid);
    const vt = voertuigTijd(ctx, iso, vid);
    if (voertuig && heeftTijd(pt) && heeftTijd(vt) && (pt.starttijd < vt.starttijd || pt.eindtijd > vt.eindtijd)) {
      (perPersoon[pid] ??= []).push(meldingBuitenTijd(ctx.naamVan(pid), pt, voertuig.naam, vt));
    }
  }
  for (const voertuig of ctx.voertuigen) {
    if (!voertuig.zitplaatsen) continue;
    const vol = teVol(
      Object.keys(k).filter((pid) => k[pid] === voertuig.id).map((pid) => persoonTijd(ctx, iso, pid)),
      voertuig.zitplaatsen,
    );
    if (vol) (perVoertuig[voertuig.id] ??= []).push(meldingVol(voertuig, vol));
  }
  return { perPersoon, perVoertuig };
}

/**
 * Vóór het opslaan: toets elke nieuwe koppeling zoals de database.
 * `origineel` = de koppelingen zoals ze waren opgeslagen. '' = alles in orde.
 */
export function controleerVoertuigen(ctx: VoertuigCtx, origineel: Record<string, Record<string, string>> = {}): string {
  const datums = [...new Set(ctx.p.dagen ?? [])].sort();
  for (const iso of datums) {
    for (const [pid, vid] of Object.entries(koppelingVanDag(ctx, iso))) {
      if (origineel?.[iso]?.[pid] === vid) continue;
      const melding = magKoppelen(ctx, iso, pid, vid);
      if (melding) return datums.length > 1 ? `${korteDatum(iso)}: ${melding}` : melding;
    }
  }
  return '';
}

/**
 * Voertuigvelden bij de dagen die naar de database gaan. Elke dag krijgt alle
 * drie de sleutels mee, zodat het formulier overschrijft wat er stond.
 */
export function metVoertuigen(dagen: DagPayload[], ctx: VoertuigCtx): DagPayload[] {
  return dagen.map((d) => {
    const iso = d.datum;
    const voertuigen = voertuigenVanDag(ctx, iso);
    const eigenLijst = Array.isArray(ctx.p.voertuigen?.[iso]) && !zelfdeSet(voertuigen, alleVoertuigIds(ctx));
    const dagTijd = tijdVanDag(ctx.p, iso, ctx.standaard);
    const tijden = Object.entries(ctx.p.voertuigTijden?.[iso] ?? {})
      .filter(
        ([vid, t]) =>
          voertuigen.includes(vid) &&
          heeftTijd(t) &&
          (hhmm(t.starttijd) !== dagTijd.starttijd || hhmm(t.eindtijd) !== dagTijd.eindtijd),
      )
      .map(([vid, t]) => [vid, { starttijd: hhmm(t.starttijd), eindtijd: hhmm(t.eindtijd) }] as const);
    const koppeling = koppelingVanDag(ctx, iso);
    return {
      ...d,
      voertuig_ids: eigenLijst ? voertuigen : null,
      voertuig_tijden: tijden.length ? Object.fromEntries(tijden) : null,
      medewerker_voertuig: Object.keys(koppeling).length ? koppeling : null,
    };
  });
}

/**
 * Staat dit voertuig op dat moment al op een andere werkbon? Afgeronde
 * werkbonnen tellen niet (voertuigDubbel van het dashboard).
 */
export function voertuigDubbel(o: {
  werkbonnen: (WerkbonPlanbaar & { id: string; titel?: string | null; status?: string | null; voertuig_ids?: string[] | null })[];
  werkbonId: string | null;
  datum: string;
  vid: string;
  starttijd: string | null;
  eindtijd: string | null;
}): { titel: string; starttijd: string; eindtijd: string }[] {
  if (!o.vid || !o.datum || !hhmm(o.starttijd) || !hhmm(o.eindtijd)) return [];
  const s = naarMin(o.starttijd);
  const e = naarMin(o.eindtijd);
  const uit: { titel: string; starttijd: string; eindtijd: string }[] = [];
  for (const w of o.werkbonnen) {
    if (!w || w.id === o.werkbonId || w.status === 'afgerond' || w.status === 'geannuleerd') continue;
    for (const dag of werkbonDagen(w)) {
      if (dag.datum !== o.datum || !voertuigenOpDag(w, dag).includes(o.vid)) continue;
      const t = tijdVanVoertuig(w, dag, o.vid);
      if (!heeftTijd(t)) continue;
      if (s < naarMin(t.eindtijd) && naarMin(t.starttijd) < e) {
        uit.push({ titel: w.titel || 'Werkbon', starttijd: hhmm(t.starttijd), eindtijd: hhmm(t.eindtijd) });
      }
    }
  }
  return uit;
}

// ── Verslepen/verzetten in de planning ──────────────────────────────────────

const minutenNaarTijd = (m: number) => {
  const k = Math.max(0, Math.min(24 * 60 - 1, m));
  return `${String(Math.floor(k / 60)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}`;
};

/**
 * De bus volgt bij verzetten (audit G-10) — `voertuigTijdenNaVerzetten` van het
 * dashboard (utils/voertuigDagen.js). Geeft de nieuwe `voertuig_tijden` van díé
 * dag, of `undefined` als er geen voertuig meeschuift (dan gaat de sleutel niet
 * mee en laat de RPC het voertuig staan).
 *
 * Persoonsblok: de bus van die persoon schuift evenveel mee; zitten er anderen
 * in, dan loopt hij van het vroegste begin tot het laatste eind van wie erin
 * zit. Hele dag: een bus met een eigen tijd schuift evenveel mee; zonder eigen
 * tijd volgt hij de dag al. Een tijd gelijk aan de dagtijd wordt geen eigen tijd.
 */
export function voertuigTijdenNaVerzetten(
  werkbon: WerkbonPlanbaar & { dagen?: readonly object[] | null; voertuig_ids?: string[] | null },
  datum: string,
  pid: string | null,
  nieuw: { starttijd: string; eindtijd: string },
): Record<string, { starttijd: string; eindtijd: string }> | null | undefined {
  const w = {
    ...werkbon,
    werkbon_dagen: werkbon.werkbon_dagen ?? ((werkbon.dagen as WerkbonDag[] | null | undefined) ?? null),
  };
  const dag = werkbonDagen(w).find((d) => d.datum === datum);
  if (!dag || !heeftTijd(nieuw)) return undefined;
  const vids = voertuigenOpDag(w, dag);
  if (!vids.length) return undefined;

  const oud = pid ? tijdenVoorPersoon(w, dag, pid) : tijdenOpDag(w, dag);
  if (!heeftTijd(oud)) return undefined;
  const dStart = naarMin(nieuw.starttijd) - naarMin(oud.starttijd);
  const dEind = naarMin(nieuw.eindtijd) - naarMin(oud.eindtijd);
  const schuif = (t: Tijdvak) => ({
    starttijd: minutenNaarTijd(naarMin(t.starttijd) + dStart),
    eindtijd: minutenNaarTijd(naarMin(t.eindtijd) + dEind),
  });

  const eigen = dag.voertuig_tijden ?? {};
  const nieuweTijden: Record<string, { starttijd: string; eindtijd: string }> = {};
  let geraakt = false;
  for (const vid of vids) {
    const huidig = tijdVanVoertuig(w, dag, vid);
    let t: { starttijd: string; eindtijd: string } | null = heeftTijd(eigen[vid])
      ? { starttijd: hhmm(huidig.starttijd), eindtijd: hhmm(huidig.eindtijd) }
      : null;
    if (pid) {
      const zitErIn = dag.medewerker_voertuig?.[pid] === vid && ploegOpDag(w, dag).includes(pid);
      if (zitErIn && heeftTijd(huidig)) {
        geraakt = true;
        const anderen = ploegOpDag(w, dag)
          .filter((x) => x !== pid && dag.medewerker_voertuig?.[x] === vid)
          .map((x) => tijdenVoorPersoon(w, dag, x))
          .filter(heeftTijd);
        if (anderen.length) {
          const alle = [nieuw, ...anderen];
          t = {
            starttijd: alle.map((x) => hhmm(x.starttijd)).sort()[0]!,
            eindtijd: alle.map((x) => hhmm(x.eindtijd)).sort().at(-1)!,
          };
        } else {
          t = schuif(huidig);
        }
      }
    } else if (t) {
      geraakt = true;
      t = schuif(t);
    }
    if (t && heeftTijd(t) && t.starttijd < t.eindtijd) nieuweTijden[vid] = t;
  }
  if (!geraakt) return undefined;

  const dagTijd = pid ? tijdenOpDag(w, dag) : { starttijd: hhmm(nieuw.starttijd), eindtijd: hhmm(nieuw.eindtijd) };
  const afwijkend = Object.entries(nieuweTijden).filter(
    ([, t]) => t.starttijd !== hhmm(dagTijd.starttijd) || t.eindtijd !== hhmm(dagTijd.eindtijd),
  );
  return afwijkend.length ? Object.fromEntries(afwijkend) : null;
}
