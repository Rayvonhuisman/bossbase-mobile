/**
 * Pure regels voor Relaties (klanten en leveranciers) en de klantkaart.
 *
 * Bron: het dashboard — `customerTotalsService.js` (bedragen per klant),
 * `CustomersPage`/`LeveranciersPage` (zoeken), `getLeverancierKostenTotalen`
 * (kosten per leverancier) en `PlanningBlok.jsx` (planregels op de klantkaart).
 * Zonder imports, zodat alles los te testen is (`tests/relaties.test.mjs`).
 */

// ---------------------------------------------------------------------------
// Bedragen per klant (alleen facturen; offertes tellen niet mee)
// ---------------------------------------------------------------------------

export type FactuurVoorTotaal = {
  customer_id: string | null;
  status: string | null;
  totaal_incl: number | string | null;
  totaal_excl?: number | string | null;
  is_credit?: boolean | null;
  gecrediteerd?: boolean | null;
};

export type KlantTotalen = {
  /** Som incl. btw van alles wat geen concept is; creditnota's zijn negatief. */
  gefactureerd: number;
  /** Som incl. btw van betaalde, niet-credit, niet-gecrediteerde facturen. */
  betaald: number;
  /** Altijd gefactureerd − betaald, nooit een eigen optelling. */
  openstaand: number;
  /** Omzet excl. btw van niet-concept facturen. */
  omzetExcl: number;
};

export const NUL_TOTALEN: KlantTotalen = { gefactureerd: 0, betaald: 0, openstaand: 0, omzetExcl: 0 };

const getal = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Vervallen = concept met een bewaard nummer: telt net als een concept niet mee.
const isGefactureerd = (f: FactuurVoorTotaal) => f.status !== 'concept' && f.status !== 'vervallen';
const isBetaald = (f: FactuurVoorTotaal) =>
  !f.is_credit && !f.gecrediteerd && f.status === 'betaald';

/** Bedragen voor één klant, uit zijn facturen. */
export function klantTotalen(facturen: readonly FactuurVoorTotaal[]): KlantTotalen {
  let gefactureerd = 0;
  let betaald = 0;
  let omzetExcl = 0;
  for (const f of facturen) {
    if (!isGefactureerd(f)) continue;
    gefactureerd += getal(f.totaal_incl);
    omzetExcl += getal(f.totaal_excl);
    if (isBetaald(f)) betaald += getal(f.totaal_incl);
  }
  return { gefactureerd, betaald, openstaand: gefactureerd - betaald, omzetExcl };
}

/** Bedragen per klant-id, voor de lijst. */
export function totalenPerKlant(facturen: readonly FactuurVoorTotaal[]): Map<string, KlantTotalen> {
  const perKlant = new Map<string, FactuurVoorTotaal[]>();
  for (const f of facturen) {
    if (!f.customer_id) continue;
    const lijst = perKlant.get(f.customer_id);
    if (lijst) lijst.push(f);
    else perKlant.set(f.customer_id, [f]);
  }
  const uit = new Map<string, KlantTotalen>();
  perKlant.forEach((lijst, id) => uit.set(id, klantTotalen(lijst)));
  return uit;
}

// ---------------------------------------------------------------------------
// Zoeken
// ---------------------------------------------------------------------------

const bevat = (velden: readonly (string | null | undefined)[], q: string): boolean => {
  const term = q.trim().toLowerCase();
  if (!term) return true;
  return velden.some((v) => (v ?? '').toLowerCase().includes(term));
};

/**
 * Klant: het dashboard zoekt op naam (en bedrijf, dat dezelfde kolom is). De
 * app zocht al breder — plaats, adres, telefoon, e-mail, KvK — en dat blijft.
 */
export function klantPastBijZoek(
  c: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    postcode?: string | null;
    city?: string | null;
    kvk_number?: string | null;
  },
  q: string,
): boolean {
  return bevat([c.name, c.email, c.phone, c.address, c.postcode, c.city, c.kvk_number], q);
}

/** Leverancier: "Zoek op naam, plaats of e-mail…", plus contactpersoon. */
export function leverancierPastBijZoek(
  l: {
    naam?: string | null;
    city?: string | null;
    email?: string | null;
    contactpersoon?: string | null;
  },
  q: string,
): boolean {
  return bevat([l.naam, l.city, l.email, l.contactpersoon], q);
}

// ---------------------------------------------------------------------------
// Kosten per leverancier
// ---------------------------------------------------------------------------

export type LeverancierKosten = { aantal: number; bedrag: number };

export function kostenPerLeverancier(
  rijen: readonly { leverancier_id: string | null; amount: number | string | null }[],
): Record<string, LeverancierKosten> {
  const uit: Record<string, LeverancierKosten> = {};
  for (const r of rijen) {
    if (!r.leverancier_id) continue;
    const t = (uit[r.leverancier_id] ??= { aantal: 0, bedrag: 0 });
    t.aantal += 1;
    t.bedrag += getal(r.amount);
  }
  return uit;
}

/**
 * Melding als een leverancier niet weg kan: `job_costs.leverancier_id` staat op
 * ON DELETE RESTRICT. Zelfde tekst als het dashboard. Null = mag weg.
 */
export function verwijderBlokkade(naam: string, aantalKosten: number): string | null {
  if (aantalKosten <= 0) return null;
  const hangt = aantalKosten === 1 ? 'hangt' : 'hangen';
  const posten = aantalKosten === 1 ? 'kostenpost' : 'kostenposten';
  return (
    `${naam} kan niet verwijderd worden: er ${hangt} ${aantalKosten} ${posten} aan. ` +
    'Zet hem op inactief als je hem niet meer gebruikt.'
  );
}

// ---------------------------------------------------------------------------
// Planning op de klantkaart
// ---------------------------------------------------------------------------

export type PlanWerkbon = {
  id: string;
  titel: string | null;
  status?: string | null;
  gepland_op: string | null;
  starttijd: string | null;
  eindtijd: string | null;
  activity_id?: string | null;
  /** Geplande dagen (`werkbon_dagen`); leeg = de ene dag `gepland_op`. */
  dagen?: readonly { datum: string | null; starttijd: string | null; eindtijd: string | null }[] | null;
};

export type PlanActiviteit = {
  id: string;
  title: string | null;
  due_at: string | null;
  completed?: boolean | null;
};

export type PlanRegel = {
  sleutel: string;
  soort: 'werkbon' | 'los';
  id: string;
  datum: string;
  starttijd: string | null;
  eindtijd: string | null;
  titel: string;
  status: string | null;
};

const hhmm = (t: string | null | undefined): string | null => (t ? String(t).slice(0, 5) : null);
const tweeCijfers = (n: number) => String(n).padStart(2, '0');

/** Lokale kalenderdag en tijd van een tijdstip (due_at is timestamptz). */
export function lokaleDatumTijd(iso: string | null | undefined): { datum: string; tijd: string | null } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const datum = `${d.getFullYear()}-${tweeCijfers(d.getMonth() + 1)}-${tweeCijfers(d.getDate())}`;
  const tijd = `${tweeCijfers(d.getHours())}:${tweeCijfers(d.getMinutes())}`;
  // Een taak zonder tijd staat in de database op middernacht.
  return { datum, tijd: tijd === '00:00' ? null : tijd };
}

/**
 * Werkbondagen en losse activiteiten als één lijst op datum en tijd. Een
 * activiteit die bij een werkbon hoort (werkbonnen.activity_id) staat er al als
 * werkbondag in en telt niet nog eens als los item.
 */
export function planRegels(
  werkbonnen: readonly PlanWerkbon[],
  activiteiten: readonly PlanActiviteit[],
): PlanRegel[] {
  const regels: PlanRegel[] = [];
  const werkbonActiviteiten = new Set(werkbonnen.map((w) => w.activity_id).filter(Boolean));

  for (const w of werkbonnen) {
    const dagen =
      w.dagen && w.dagen.length
        ? w.dagen
        : w.gepland_op
          ? [{ datum: w.gepland_op, starttijd: null, eindtijd: null }]
          : [];
    for (const dag of dagen) {
      if (!dag.datum) continue;
      regels.push({
        sleutel: `${w.id}-${dag.datum}`,
        soort: 'werkbon',
        id: w.id,
        datum: dag.datum.slice(0, 10),
        starttijd: hhmm(dag.starttijd) ?? hhmm(w.starttijd),
        eindtijd: hhmm(dag.eindtijd) ?? hhmm(w.eindtijd),
        titel: w.titel || 'Werkbon',
        status: w.status ?? null,
      });
    }
  }

  for (const a of activiteiten) {
    if (werkbonActiviteiten.has(a.id)) continue;
    const dt = lokaleDatumTijd(a.due_at);
    if (!dt) continue;
    regels.push({
      sleutel: `los-${a.id}`,
      soort: 'los',
      id: a.id,
      datum: dt.datum,
      starttijd: dt.tijd,
      eindtijd: null,
      titel: a.title || 'Activiteit',
      status: a.completed ? 'completed' : null,
    });
  }

  return regels.sort(
    (a, b) => a.datum.localeCompare(b.datum) || (a.starttijd ?? '').localeCompare(b.starttijd ?? ''),
  );
}

/**
 * Wat het overzichtsblok toont: eerst de komende regels (vanaf vandaag); zijn
 * die er niet, dan alle regels vanaf de vroegste (zoals het dashboard). Maximaal `max` (dashboard: 4).
 */
export function komendePlanRegels(regels: readonly PlanRegel[], vandaag: string, max = 4): PlanRegel[] {
  const komend = regels.filter((r) => r.datum >= vandaag);
  return (komend.length ? komend : regels).slice(0, max);
}

// ---------------------------------------------------------------------------
// Klanttype (customers.type, dashboard 1-10-2026, migratie 20261001135212)
// ---------------------------------------------------------------------------

/** De vaste keuzes; de database dwingt dezelfde lijst af (customers_type_check). */
export const KLANT_TYPES = ['Particulier', 'Zakelijk', 'VvE', 'Aannemer'] as const;
export type KlantType = (typeof KLANT_TYPES)[number];

/**
 * Het type dat de klantkaart toont. Het dashboard slaat het type sinds 1-10
 * op; staat er (nog) niets, dan leiden we het af zoals de app altijd deed:
 * met KvK-nummer zakelijk, anders particulier.
 */
export function klantType(c: { type?: string | null; kvk_number?: string | null }): KlantType {
  const t = c.type ?? null;
  if (t && (KLANT_TYPES as readonly string[]).includes(t)) return t as KlantType;
  return c.kvk_number && c.kvk_number.trim() ? 'Zakelijk' : 'Particulier';
}

/** Voor het filter Zakelijk/Particulier: VvE en aannemer zijn geen particulier. */
export function isZakelijkeKlant(c: { type?: string | null; kvk_number?: string | null }): boolean {
  return klantType(c) !== 'Particulier';
}
