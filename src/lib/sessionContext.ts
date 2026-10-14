/**
 * De stand van de ingelogde gebruiker, bereikbaar buiten React.
 *
 * Het dashboard heeft hiervoor `lib/currentCompany.js`: een module-cache met het
 * company_id, zodat een service een insert kan doen die door RLS komt zonder dat
 * elke aanroeper dat id moet doorgeven. Mobiel heeft datzelfde nodig, plus twee
 * dingen die het dashboard uit hooks haalt maar een service hier niet kan zien:
 * de rechten en de read-onlystand.
 *
 * Die laatste is geen luxe. Een geweigerde policy geeft 42501 zonder te zeggen
 * wélke gate hem tegenhield; alleen wie weet dat het bedrijf op alleen-lezen
 * staat kan daar de juiste tekst bij zetten. Zonder deze cache zou elke
 * schrijffunctie die stand als parameter moeten krijgen — en dan is één
 * vergeten aanroep genoeg om een verlopen proefperiode als "geen rechten" te
 * tonen.
 *
 * De cache leeft alleen in het geheugen: bij uitloggen of bedrijfswisseling
 * wordt hij gewist en er gaat niets naar schijf.
 */

type SessionStand = {
  userId: string | null;
  companyId: string | null;
  role: string | null;
  granted: readonly string[];
  features: readonly string[];
  readonly: boolean;
  readonlyReden: string | null;
  /** Ligt er een serverantwoord onder deze stand? */
  planGeladen: boolean;
};

const LEEG: SessionStand = {
  userId: null,
  companyId: null,
  role: null,
  granted: [],
  features: [],
  readonly: false,
  readonlyReden: null,
  planGeladen: false,
};

let stand: SessionStand = LEEG;

export function setSessionStand(next: Partial<SessionStand>): void {
  stand = { ...stand, ...next };
}

/** Uitloggen of bedrijfswisseling: alles weg. */
export function clearSessionStand(): void {
  stand = LEEG;
}

export function getSessionStand(): SessionStand {
  return stand;
}

export function getCompanyId(): string | null {
  return stand.companyId;
}

export function getUserId(): string | null {
  return stand.userId;
}

/** Staat het bedrijf op alleen-lezen? Server is leidend; standaard nee. */
export function isReadonly(): boolean {
  return stand.readonly;
}

/**
 * Dezelfde rechtenregel als het dashboard (`usePermissions.js`) en als
 * `canWithRole` in lib/permissions. Hier voor gebruik buiten React.
 */
export function sessionCan(permission: string): boolean {
  if (!stand.role) return false;
  if (stand.role === 'admin') return true;
  return stand.granted.includes(permission);
}

/**
 * Zit deze feature in het abonnement? Zonder serverantwoord niet blokkeren —
 * dezelfde keuze als `usePlan` in het dashboard: de policies vangen het echte
 * geval af, en een hapering in de RPC mag geen functies laten verdwijnen.
 */
export function sessionHasFeature(feature: string): boolean {
  if (!stand.planGeladen) return true;
  return stand.features.includes(feature);
}

/**
 * Voegt `company_id` toe aan een payload als het er nog niet in staat — het
 * mobiele equivalent van `withCompanyId` uit het dashboard.
 *
 * Geeft `null` terug als er geen bedrijf bekend is. Dat is bewust geen stille
 * insert zonder company_id: die zou door RLS worden geweigerd en als
 * "geen rechten" op het scherm komen, terwijl het probleem is dat het profiel
 * nog niet geladen was.
 */
export function withCompanyId<T extends Record<string, unknown>>(payload: T): (T & { company_id: string }) | null {
  const bestaand = payload.company_id;
  if (typeof bestaand === 'string' && bestaand) {
    return payload as T & { company_id: string };
  }
  const id = stand.companyId;
  if (!id) return null;
  return { ...payload, company_id: id };
}
