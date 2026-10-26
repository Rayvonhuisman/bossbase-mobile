import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { writeFout, writeOk, type WriteResult } from '@/lib/writeResult';
import { foutTekst } from '@/lib/accountVerwijderenRegels';

export { nieuweSleutel, type VerwijderStatus } from '@/lib/accountVerwijderenRegels';

/**
 * Account of bedrijf verwijderen via de Edge Function `account-verwijderen`,
 * net als het dashboard (`accountVerwijderenService.js`). De server bepaalt wie
 * je bent (uit je sessie) en wat je mag; hier wordt alleen gevraagd.
 *
 * Voorheen deactiveerde de app alleen (`delete_own_account`): geen echte
 * verwijdering, wat Apple (5.1.1(v)) wel eist (review 26-10, S4-03).
 */

export async function verwijderActie<T = Record<string, unknown>>(
  actie: string,
  extra: Record<string, unknown> = {},
): Promise<WriteResult<T>> {
  const { data, error } = await supabase.functions.invoke('account-verwijderen', { body: { actie, ...extra } });
  if (error) {
    let body: { error?: string; code?: string } | null = null;
    try {
      body = (await (error as { context?: { json?: () => Promise<{ error?: string; code?: string }> } }).context?.json?.()) ?? null;
    } catch {
      /* geen json */
    }
    return writeFout('onbekend', foutTekst(body?.code, body?.error));
  }
  return writeOk(data as T);
}

/**
 * Opnieuw inloggen met het wachtwoord (Supabase Auth). De server eist een
 * aanmelding van de afgelopen 10 minuten voor verwijderen en overdragen; het
 * wachtwoord gaat alleen naar Supabase Auth, nooit naar onze functie.
 */
export async function bevestigMetWachtwoord(wachtwoord: string): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return 'Je sessie is verlopen. Log opnieuw in.';
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: wachtwoord });
  return error ? 'Dit wachtwoord klopt niet.' : null;
}

/**
 * Na een definitieve verwijdering bestaat de login niet meer: lokaal uitloggen
 * en wissen wat op dit toestel bij deze gebruiker hoort (filters, onthouden
 * keuzes).
 */
export async function lokaalUitloggen(userId?: string | null): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  if (!userId) return;
  try {
    const sleutels = (await AsyncStorage.getAllKeys()).filter((k) => k.includes(userId));
    if (sleutels.length) await AsyncStorage.multiRemove(sleutels);
  } catch {
    /* niets te wissen */
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      for (const k of Object.keys(window.localStorage)) if (k.includes(userId)) window.localStorage.removeItem(k);
    } catch {
      /* geen toegang tot localStorage */
    }
  }
}
