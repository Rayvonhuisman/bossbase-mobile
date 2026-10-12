import type { PostgrestError } from '@supabase/supabase-js';
import { isNetwerkfout } from './netwerkfout';

/**
 * Map a Supabase / PostgREST error to a friendly Dutch user-facing string.
 * Logs the full developer detail to console exactly once per error.
 */
export function describeError(
  error: PostgrestError | { message: string; code?: string } | null | undefined,
  context: string,
): string {
  if (!error) return 'Er ging iets mis. Probeer het opnieuw.';

  const code = 'code' in error ? error.code : undefined;
  const message = error.message ?? '';
  const lower = message.toLowerCase();

  // Alleen tijdens ontwikkeling: details en hint kunnen ingevoerde waarden
  // bevatten (bijvoorbeeld bij een dubbele sleutel).
  if (__DEV__) {
    console.warn(`[${context}]`, {
      code,
      message,
      details: 'details' in error ? error.details : undefined,
      hint: 'hint' in error ? error.hint : undefined,
    });
  }

  if (code === '42501' || code === 'PGRST301' || lower.includes('permission')) {
    return 'Je hebt geen toestemming voor deze actie.';
  }
  if (code === '42703' || code === '42P01' || code === 'PGRST204') {
    return 'De app moet worden bijgewerkt. Neem contact op met je beheerder.';
  }
  if (lower.includes('network') || isNetwerkfout(message)) {
    return 'Geen verbinding met de server. Controleer je internet.';
  }
  if (lower.includes('jwt') || lower.includes('expired')) {
    return 'Je sessie is verlopen. Log opnieuw in.';
  }
  return 'Er ging iets mis. Probeer het opnieuw.';
}
