import { supabase } from '@/lib/supabase';
import { writeFout, writeOk, type WriteResult } from '@/lib/writeResult';

/**
 * Account of bedrijf verwijderen via de Edge Function `account-verwijderen`,
 * net als het dashboard (`accountVerwijderenService.js`). De server bepaalt wie
 * je bent (uit je sessie) en wat je mag; hier wordt alleen gevraagd.
 *
 * Voorheen deactiveerde de app alleen (`delete_own_account`): geen echte
 * verwijdering, wat Apple (5.1.1(v)) wel eist (review 26-10, S4-03).
 */

export type VerwijderStatus = {
  isEigenaar: boolean;
  bedrijfsnaam: string | null;
  teamleden?: number;
  kandidaten?: { id: string; naam: string | null }[];
  verwijdering?: { status: string; modus: string; geplandOp: string | null } | null;
  overdrachtIn?: { id: string; vanNaam: string | null; verlooptOp: string } | null;
  overdrachtUit?: { id: string; naarNaam: string | null; verlooptOp: string } | null;
};

export async function verwijderActie<T = Record<string, unknown>>(
  actie: string,
  extra: Record<string, unknown> = {},
): Promise<WriteResult<T>> {
  const { data, error } = await supabase.functions.invoke('account-verwijderen', { body: { actie, ...extra } });
  if (error) {
    let melding = 'Er ging iets mis. Probeer het later opnieuw.';
    try {
      const body = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
      if (body?.error) melding = body.error;
    } catch {
      /* geen json */
    }
    return writeFout('onbekend', melding);
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

/** Uniek per poging: een dubbele tik of netwerkretry geeft hetzelfde resultaat. */
export function nieuweSleutel(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Na een definitieve verwijdering bestaat de login niet meer: lokaal uitloggen. */
export async function lokaalUitloggen(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
