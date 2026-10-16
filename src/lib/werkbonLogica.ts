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

export type WerkbonStatusKey = 'gepland' | 'in_uitvoering' | 'afgerond';

export const WERKBON_STATUSSEN: readonly WerkbonStatusKey[] = ['gepland', 'in_uitvoering', 'afgerond'];

/** Kleuren uit het dashboard (statusColors.js: blue / orange / green). */
export const WERKBON_STATUS_STIJL: Record<
  WerkbonStatusKey,
  { label: string; kleur: string; bg: string; dot: string }
> = {
  gepland: { label: 'Gepland', kleur: '#2563eb', bg: '#eff6ff', dot: '#2563eb' },
  in_uitvoering: { label: 'In uitvoering', kleur: '#e8784a', bg: '#fff4ec', dot: '#e8784a' },
  afgerond: { label: 'Afgerond', kleur: '#15A34A', bg: '#ecfdf5', dot: '#15A34A' },
};

/** Aliassen zoals het dashboard ze accepteert; onbekend → gepland. */
export function normaliseerStatus(status: string | null | undefined): WerkbonStatusKey {
  const s = String(status ?? '').toLowerCase();
  if (s === 'in_uitvoering' || s === 'in_progress' || s === 'bezig') return 'in_uitvoering';
  if (s === 'afgerond' || s === 'done' || s === 'completed' || s === 'voltooid') return 'afgerond';
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

export function matchtStatus(w: WerkbonZoekbaar, filter: StatusFilter): boolean {
  return filter === 'alle' || normaliseerStatus(w.status) === filter;
}

export function telStatussen(lijst: WerkbonZoekbaar[]): Record<StatusFilter, number> {
  const tel: Record<StatusFilter, number> = { alle: lijst.length, gepland: 0, in_uitvoering: 0, afgerond: 0 };
  for (const w of lijst) tel[normaliseerStatus(w.status)]++;
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
