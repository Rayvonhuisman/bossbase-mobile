/**
 * Concept en gesprek van de Boss-werkruimte, bewaard bij sluiten.
 *
 * Sluit je een offerte of factuur waar je met Boss aan werkte zonder op te
 * slaan, dan staan het document en het gesprek bij het opnieuw openen nog
 * klaar. Net als in het dashboard (`lib/werkruimteConcept.js`) en net als het
 * gesprek met de helpagent bewust alleen in het geheugen van de app: er staan
 * klant- en prijsgegevens in. Uitloggen of de app afsluiten wist alles.
 *
 * Sleutel: 'offerte:nieuw:<klant of aanvraag>', 'offerte:<id>', 'factuur:nieuw', 'factuur:<id>'.
 * Per sleutel twee delen met elk een eigen eigenaar: `document` (het scherm) en
 * `gesprek` (het Boss-gesprek).
 */
import { supabase } from '@/lib/supabase';

export type BewaardConcept = {
  document?: unknown;
  gesprek?: { items?: { t: string }[] } & Record<string, unknown>;
  bewaardOp: number;
};

const opslag = new Map<string, BewaardConcept>();

try {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') opslag.clear();
  });
} catch {
  /* geen auth: dan leeft het tot de app sluit */
}

export function leesConcept(sleutel: string | null): BewaardConcept | null {
  return sleutel ? opslag.get(sleutel) ?? null : null;
}

export function bewaarConceptDeel(sleutel: string | null, deel: 'document' | 'gesprek', waarde: unknown): void {
  if (!sleutel) return;
  const oud = opslag.get(sleutel);
  opslag.set(sleutel, { ...(oud ?? {}), [deel]: waarde, bewaardOp: Date.now() });
}

export function wisConcept(sleutel: string | null): void {
  if (sleutel) opslag.delete(sleutel);
}

/** Is er iets om op terug te komen? Een gesprek telt pas als er iets gevraagd is. */
export function heeftConcept(sleutel: string | null): boolean {
  return Boolean(leesConcept(sleutel)?.gesprek?.items?.some((i) => i.t === 'ik'));
}

export const tijdVan = (ms: number) =>
  new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
