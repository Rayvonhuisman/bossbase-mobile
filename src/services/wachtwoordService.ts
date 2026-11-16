import { supabase } from '@/lib/supabase';
import { tx } from '@/i18n';

/**
 * "Wachtwoord vergeten": vraagt een resetlink aan via de Edge Function
 * `request-password-reset` — dezelfde als het dashboard (`requestPasswordReset`).
 * De function geeft altijd succes terug, ook voor een onbekend adres (geen
 * uitlekken wie een account heeft). De mail linkt naar
 * dashboard.bossbase.nl/reset-password; daar stel je het nieuwe wachtwoord in.
 */
export async function vraagWachtwoordResetAan(email: string): Promise<{ error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('request-password-reset', { body: { email } });
    if (error) {
      let melding = tx('Versturen mislukt. Probeer het opnieuw.');
      try {
        const b = await (error as { context?: Response }).context?.json();
        if (b?.error) melding = b.error;
      } catch {
        // geen JSON in het antwoord
      }
      return { error: melding };
    }
    if (!data?.success) return { error: data?.error || tx('Versturen mislukt. Probeer het opnieuw.') };
    return { error: null };
  } catch {
    return { error: tx('Geen verbinding. Probeer het opnieuw.') };
  }
}
