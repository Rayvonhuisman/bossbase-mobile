import { supabase } from '@/lib/supabase';
import type { VerifieerAntwoord } from '@/lib/registratie';

/**
 * De Edge Functions van de registratie — dezelfde als het dashboard
 * (`src/services/authService.js`). Alle drie lezen de gebruiker uit de sessie
 * (verify_jwt), dus ze werken pas ná `signUp`.
 */

/** Legt het akkoord met voorwaarden en verwerkersovereenkomst vast (versie, tijdstip en IP bepaalt de server). */
export async function legAkkoordVast(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('akkoord-vastleggen');
  if (error || !data?.success) throw error || new Error('Akkoord vastleggen mislukt');
}

/** Vraagt een (nieuwe) 6-cijferige code aan. De server throttlet stil (60 s, 3 per 10 min) en geeft dan toch success. */
export async function vraagVerificatiecodeAan(): Promise<void> {
  const { error } = await supabase.functions.invoke('request-verification-code');
  if (error) throw error;
}

/**
 * Controleert de code. Geeft het JSON-antwoord van de function terug, ook bij
 * een 4xx, zodat het scherm de specifieke melding kan tonen (MISMATCH met het
 * aantal resterende pogingen, EXPIRED, TOO_MANY, NO_CODE). Bij succes maakt de
 * function het bedrijf aan.
 */
export async function verifieerCode(code: string): Promise<VerifieerAntwoord> {
  const { data, error } = await supabase.functions.invoke('verify-code', { body: { code } });
  if (error) {
    let parsed: VerifieerAntwoord = null;
    try {
      parsed = await (error as { context?: Response }).context?.json();
    } catch {
      // geen JSON in het antwoord
    }
    return parsed || { success: false, error: error.message || 'Verifiëren mislukt' };
  }
  return data as VerifieerAntwoord;
}

/**
 * Terugval als Supabase "Confirm email" aan zou staan (geen sessie na signUp):
 * de bevestigingsmail van Supabase opnieuw sturen. Zoals `resendVerificationEmail`
 * in het dashboard. In onze config staat die instelling uit.
 */
export async function stuurBevestigingsmailOpnieuw(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
}
