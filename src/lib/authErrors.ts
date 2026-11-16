import { tx } from '@/i18n';

/**
 * Translate Supabase auth error messages to user-facing Dutch.
 * Falls back to the original message for unknown errors so we don't hide info.
 */
export function translateAuthError(message: string | null | undefined): string {
  if (!message) return tx('Er ging iets mis. Probeer het opnieuw.');
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return tx('E-mail of wachtwoord is onjuist.');
  }
  if (lower.includes('email not confirmed')) {
    return tx('Bevestig eerst je e-mailadres via de mail die we je hebben gestuurd.');
  }
  if (lower.includes('user not found')) {
    return tx('Er bestaat geen account met dit e-mailadres.');
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return tx('Te veel pogingen. Probeer over een paar minuten opnieuw.');
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return tx('Geen verbinding met de server. Controleer je internet en probeer opnieuw.');
  }
  if (lower.includes('password')) {
    return tx('Wachtwoord voldoet niet aan de eisen.');
  }

  return message;
}
