/**
 * Geplande dagen van een werkbon — letterlijke vertaling van het dashboard
 * (`src/utils/werkbonDagen.js` en `src/utils/voertuigDagen.js`), in de vorm
 * waarin de database ze levert (snake_case, tabel `werkbon_dagen`).
 *
 * Regels (gelijk aan het dashboard):
 * - Een werkbon staat op dag X als die dag in `werkbon_dagen` staat. Zonder
 *   dagenlijst valt hij terug op `gepland_op`.
 * - Tijd van een dag: eigen tijd van de dag → tijd van de werkbon.
 * - Ploeg van een dag: `medewerker_ids` (null = de hele ploeg van de werkbon).
 * - Tijd van een persoon: eigen tijd (`medewerker_tijden`) → dag → werkbon.
 * - Voertuigen van een dag: `voertuig_ids` (null = alle van de werkbon); tijd
 *   van een voertuig: eigen tijd → dag → werkbon.
 * - Ingepland = minstens één dag met een starttijd.
 *
 * Geen runtime-imports: dit bestand draait ook rechtstreeks in de Node-tests.
 */

export type Tijdvak = { starttijd?: string | null; eindtijd?: string | null };

export type WerkbonDag = {
  id?: string | null;
  datum: string;
  starttijd: string | null;
  eindtijd: string | null;
  medewerker_ids?: string[] | null;
  medewerker_tijden?: Record<string, Tijdvak> | null;
  voertuig_ids?: string[] | null;
  voertuig_tijden?: Record<string, Tijdvak> | null;
  medewerker_voertuig?: Record<string, string> | null;
};

/** Het deel van een werkbon dat de planningsregels nodig hebben. */
export type WerkbonPlanbaar = {
  id: string;
  status?: string | null;
  gepland_op?: string | null;
  starttijd?: string | null;
  eindtijd?: string | null;
  assigned_to?: string | null;
  assigned_to_ids?: string[] | null;
  voertuig_ids?: string[] | null;
  dagen?: WerkbonDag[] | null;
};

export type Tijden = { starttijd: string | null; eindtijd: string | null };

const tijd = (t: string | null | undefined): string => (t ? String(t).slice(0, 5) : '');

/** De dagen van een werkbon, gesorteerd; zonder dagenlijst de ene `gepland_op`. */
export function werkbonDagen(w: WerkbonPlanbaar | null | undefined): WerkbonDag[] {
  if (Array.isArray(w?.dagen) && w.dagen.length) {
    return [...w.dagen].sort((a, b) => a.datum.localeCompare(b.datum));
  }
  return w?.gepland_op
    ? [{ id: null, datum: w.gepland_op, starttijd: null, eindtijd: null, medewerker_ids: null, medewerker_tijden: null }]
    : [];
}

/** De ploeg van de werkbon: `assigned_to_ids`, anders de oude `assigned_to`. */
export function werkbonPloeg(w: WerkbonPlanbaar | null | undefined): string[] {
  if (w?.assigned_to_ids?.length) return w.assigned_to_ids;
  return w?.assigned_to ? [w.assigned_to] : [];
}

/** Tijden die op die dag gelden: de tijd van de dag, anders die van de werkbon. */
export function tijdenOpDag(w: WerkbonPlanbaar | null | undefined, dag: WerkbonDag | null | undefined): Tijden {
  return {
    starttijd: tijd(dag?.starttijd) || tijd(w?.starttijd) || null,
    eindtijd: tijd(dag?.eindtijd) || tijd(w?.eindtijd) || null,
  };
}

/** Wie er die dag werkt: de dagploeg als die er is, anders de hele ploeg. */
export function ploegOpDag(w: WerkbonPlanbaar | null | undefined, dag: WerkbonDag | null | undefined): string[] {
  return Array.isArray(dag?.medewerker_ids) ? dag.medewerker_ids : werkbonPloeg(w);
}

/** De tijd van één persoon op een dag: eigen tijd → tijd van de dag → werkbon. */
export function tijdenVoorPersoon(
  w: WerkbonPlanbaar | null | undefined,
  dag: WerkbonDag | null | undefined,
  pid: string | null,
): Tijden {
  const eigen = pid ? dag?.medewerker_tijden?.[pid] : null;
  if (eigen && tijd(eigen.starttijd)) {
    return { starttijd: tijd(eigen.starttijd), eindtijd: tijd(eigen.eindtijd) || null };
  }
  return tijdenOpDag(w, dag);
}

/**
 * Staat deze medewerker op die dag in de ploeg? De oude enkele `assigned_to`
 * telt mee zolang de dag geen eigen dagploeg heeft.
 */
export function staatOpDagVoor(w: WerkbonPlanbaar, dag: WerkbonDag, uid: string): boolean {
  return (
    ploegOpDag(w, dag).includes(uid) ||
    (!Array.isArray(dag.medewerker_ids) && w.assigned_to === uid)
  );
}

/** Ingepland = minstens één dag met een starttijd. */
export function isIngepland(w: WerkbonPlanbaar): boolean {
  return werkbonDagen(w).some((d) => !!tijdenOpDag(w, d).starttijd);
}

/** Voertuigen op die dag: de eigen lijst van de dag, anders die van de werkbon. */
export function voertuigenOpDag(w: WerkbonPlanbaar, dag: WerkbonDag): string[] {
  return Array.isArray(dag?.voertuig_ids) ? dag.voertuig_ids : (w?.voertuig_ids ?? []);
}

/** Tijd van een voertuig op een dag: eigen tijd → tijd van de dag → werkbon. */
export function tijdVanVoertuig(w: WerkbonPlanbaar, dag: WerkbonDag, vid: string): Tijden {
  const eigen = dag?.voertuig_tijden?.[vid];
  if (eigen && tijd(eigen.starttijd) && tijd(eigen.eindtijd)) {
    return { starttijd: tijd(eigen.starttijd), eindtijd: tijd(eigen.eindtijd) };
  }
  return tijdenOpDag(w, dag);
}

/** Het voertuig waar iemand die dag in zit, of null. */
export function voertuigVanPersoon(w: WerkbonPlanbaar, dag: WerkbonDag, pid: string): string | null {
  const vid = dag?.medewerker_voertuig?.[pid];
  if (!vid || !voertuigenOpDag(w, dag).includes(vid) || !ploegOpDag(w, dag).includes(pid)) return null;
  return vid;
}

/** Minuten sinds middernacht voor `HH:MM`; NaN bij een lege tijd. */
export function minuten(t: string | null | undefined): number {
  const [h, m] = tijd(t).split(':').map(Number);
  if (h === undefined || Number.isNaN(h)) return Number.NaN;
  return h * 60 + (m || 0);
}

// ===========================================================================
// Agenda — persoonlijke werkbonitems (dashboard: CalendarPage, BbPages2.jsx)
// ===========================================================================

export type AgendaWerkbonItem<W extends WerkbonPlanbaar = WerkbonPlanbaar> = {
  /** `wb-{werkbonId}-{datum}-{start}`, zoals het dashboard. */
  sleutel: string;
  werkbon: W;
  datum: string;
  starttijd: string | null;
  eindtijd: string | null;
  /** Het voertuig waar jij die dag in zit (alleen bij je eigen item). */
  voertuigId: string | null;
};

/**
 * De werkbonitems in de agenda, per geplande dag en per tijdvenster.
 *
 * - Werkbonnen zonder `gepland_op` doen niet mee; afgeronde ook niet, tenzij
 *   `ookAfgerond` (de homepage telt "x van y klaar", net als de dashboardtegel
 *   `werkbonnen_today`).
 * - Persoonlijk (standaard, ook voor admin): alleen de dagen waarop jij in de
 *   dagploeg staat, met jóuw tijd.
 * - Gedeelde werkruimte: één item per verschillende tijd binnen de ploeg.
 * - Alleen dagen binnen `[van, tot]` (`YYYY-MM-DD`, inclusief).
 */
export function agendaWerkbonItems<W extends WerkbonPlanbaar>(
  werkbonnen: W[],
  opties: { uid: string | null; gedeeld: boolean; van: string; tot: string; ookAfgerond?: boolean },
): AgendaWerkbonItem<W>[] {
  const { uid, gedeeld, van, tot, ookAfgerond = false } = opties;
  const uit: AgendaWerkbonItem<W>[] = [];
  for (const w of werkbonnen) {
    if (!w.gepland_op || (w.status === 'afgerond' && !ookAfgerond)) continue;
    for (const dag of werkbonDagen(w)) {
      if (dag.datum < van || dag.datum > tot) continue;
      const ploeg = ploegOpDag(w, dag);
      const personen: (string | null)[] =
        gedeeld || !uid
          ? ploeg.length
            ? ploeg
            : [null]
          : staatOpDagVoor(w, dag, uid)
            ? [uid]
            : [];
      const gezien = new Set<string>();
      for (const pid of personen) {
        const t = pid ? tijdenVoorPersoon(w, dag, pid) : tijdenOpDag(w, dag);
        const k = `${t.starttijd}-${t.eindtijd}`;
        if (gezien.has(k)) continue;
        gezien.add(k);
        uit.push({
          sleutel: `wb-${w.id}-${dag.datum}-${t.starttijd ?? ''}`,
          werkbon: w,
          datum: dag.datum,
          starttijd: t.starttijd,
          eindtijd: t.eindtijd,
          voertuigId: pid && pid === uid ? voertuigVanPersoon(w, dag, pid) : null,
        });
      }
    }
  }
  return uit;
}

/** Het deel van een `calendar_events`-rij dat de agendaregels nodig hebben. */
export type AgendaEventBasis = {
  werkbon_id?: string | null;
  assigned_to?: string | null;
  herkomst?: string | null;
};

/**
 * Handmatige agenda-items: werkbon-gekoppelde rijen weg (de werkbon staat er
 * zelf al in), en persoonlijk alleen je eigen items — behalve in een gedeelde
 * werkruimte.
 */
export function zichtbareAfspraken<E extends AgendaEventBasis>(
  events: E[],
  opties: { uid: string | null; gedeeld: boolean },
): E[] {
  return events.filter(
    (e) => !e.werkbon_id && (opties.gedeeld || !opties.uid || e.assigned_to === opties.uid),
  );
}

/**
 * Mag deze gebruiker dit agenda-item wijzigen of verwijderen? Spiegelt de RLS:
 * het recht `planning`, of je eigen item dat niet uit de planning komt.
 */
export function magAfspraakBewerken(
  e: AgendaEventBasis,
  opties: { uid: string | null; planningRecht: boolean },
): boolean {
  if (opties.planningRecht) return true;
  return e.herkomst !== 'planning' && !!opties.uid && e.assigned_to === opties.uid;
}

// ===========================================================================
// Planning — rooster per medewerker of voertuig (dashboard: PlanningPage.jsx)
// ===========================================================================

export type RoosterBlok<W extends WerkbonPlanbaar = WerkbonPlanbaar> = {
  sleutel: string;
  werkbon: W;
  datum: string;
  /** Medewerker- of voertuig-id; null = niet toegewezen. */
  resource: string | null;
  starttijd: string;
  eindtijd: string | null;
  /** 1-based positie van deze dag in de werkbon, en het totaal aantal dagen. */
  dagNr: number;
  dagenTotaal: number;
  /** Medewerkermodus: het voertuig van deze persoon. Voertuigmodus: leeg. */
  voertuigId: string | null;
  /** Voertuigmodus: wie er in zit. */
  inzittenden: string[];
};

/**
 * Alle blokken in `[van, tot]`. Alleen dagen met een starttijd krijgen een
 * blok — zonder tijd tekent ook het dashboard niets.
 *
 * - `medewerker`: één blok per persoon in de dagploeg, met diens eigen tijd;
 *   een dag zonder ploeg wordt één blok "niet toegewezen".
 * - `voertuig`: één blok per voertuig op die dag, met de voertuigtijd.
 */
export function roosterBlokken<W extends WerkbonPlanbaar>(
  werkbonnen: W[],
  opties: { van: string; tot: string; modus: 'medewerker' | 'voertuig' },
): RoosterBlok<W>[] {
  const { van, tot, modus } = opties;
  const uit: RoosterBlok<W>[] = [];
  for (const w of werkbonnen) {
    const dagen = werkbonDagen(w);
    dagen.forEach((dag, i) => {
      if (dag.datum < van || dag.datum > tot) return;
      const basis = { werkbon: w, datum: dag.datum, dagNr: i + 1, dagenTotaal: dagen.length };
      if (modus === 'voertuig') {
        for (const vid of voertuigenOpDag(w, dag)) {
          const t = tijdVanVoertuig(w, dag, vid);
          if (!t.starttijd) continue;
          const inzittenden = ploegOpDag(w, dag).filter((pid) => dag.medewerker_voertuig?.[pid] === vid);
          uit.push({
            ...basis,
            sleutel: `${w.id}-${dag.datum}-v-${vid}`,
            resource: vid,
            starttijd: t.starttijd,
            eindtijd: t.eindtijd,
            voertuigId: null,
            inzittenden,
          });
        }
        return;
      }
      const ploeg = ploegOpDag(w, dag);
      const personen: (string | null)[] = ploeg.length ? ploeg : [null];
      for (const pid of personen) {
        const t = pid ? tijdenVoorPersoon(w, dag, pid) : tijdenOpDag(w, dag);
        if (!t.starttijd) continue;
        uit.push({
          ...basis,
          sleutel: `${w.id}-${dag.datum}-p-${pid ?? 'niemand'}`,
          resource: pid,
          starttijd: t.starttijd,
          eindtijd: t.eindtijd,
          voertuigId: pid ? voertuigVanPersoon(w, dag, pid) : null,
          inzittenden: [],
        });
      }
    });
  }
  return uit.sort((a, b) =>
    a.datum === b.datum ? a.starttijd.localeCompare(b.starttijd) : a.datum.localeCompare(b.datum),
  );
}

/** Werkbonnen zonder enige dag met een starttijd (ongeacht status, zoals het dashboard). */
export function nietIngepland<W extends WerkbonPlanbaar>(werkbonnen: W[]): W[] {
  return werkbonnen.filter((w) => !isIngepland(w));
}

/**
 * Blokken waarin dezelfde persoon (of hetzelfde voertuig) op dezelfde dag op
 * twee werkbonnen tegelijk staat. Alleen een waarschuwing, geen blokkade.
 * Tijden lopen zonder eindpunt: 10:00–12:00 en 12:00–17:00 botsen niet.
 * Een blok zonder eindtijd duurt een uur.
 */
export function dubbeleBlokken(blokken: RoosterBlok[]): Set<string> {
  const dubbel = new Set<string>();
  const perSleutel = new Map<string, RoosterBlok[]>();
  for (const b of blokken) {
    if (!b.resource) continue;
    const k = `${b.datum}|${b.resource}`;
    const lijst = perSleutel.get(k) ?? [];
    lijst.push(b);
    perSleutel.set(k, lijst);
  }
  for (const lijst of perSleutel.values()) {
    for (let i = 0; i < lijst.length; i++) {
      for (let j = i + 1; j < lijst.length; j++) {
        const a = lijst[i]!;
        const b = lijst[j]!;
        if (a.werkbon.id === b.werkbon.id) continue;
        const a1 = minuten(a.starttijd);
        const a2 = a.eindtijd ? minuten(a.eindtijd) : a1 + 60;
        const b1 = minuten(b.starttijd);
        const b2 = b.eindtijd ? minuten(b.eindtijd) : b1 + 60;
        if (a1 < b2 && b1 < a2) {
          dubbel.add(a.sleutel);
          dubbel.add(b.sleutel);
        }
      }
    }
  }
  return dubbel;
}

/** Tinten per medewerker, zelfde volgorde als het dashboard. */
const TINTEN = [120, 200, 30, 280, 350, 60, 160, 240, 310, 170];

/** Accentkleur (balk/stip) voor de n-de medewerker; grijs voor niet toegewezen. */
export function medewerkerKleur(index: number): string {
  if (index < 0) return '#9ca3af';
  return `hsl(${TINTEN[index % TINTEN.length]}, 65%, 50%)`;
}
