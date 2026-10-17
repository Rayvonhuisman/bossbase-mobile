import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { foutTekst, type VerwijderStatus } from '@/lib/accountVerwijderenRegels';

/**
 * Account of bedrijf verwijderen via de Edge Function `account-verwijderen`
 * (dashboardrepository). De server bepaalt uit de sessie wie je bent en wat je
 * mag; hier wordt alleen gevraagd. Er gaat nooit een user- of company-id mee.
 */
export class VerwijderFout extends Error {
  code: string | null;
  constructor(melding: string, code: string | null) {
    super(melding);
    this.code = code;
  }
}

async function actie<T>(naam: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('account-verwijderen', { body: { actie: naam, ...extra } });
  if (error) {
    let body: { error?: string; code?: string } | null = null;
    try {
      body = await (error as { context?: { json?: () => Promise<{ error?: string; code?: string }> } }).context?.json?.() ?? null;
    } catch {
      /* geen json */
    }
    throw new VerwijderFout(foutTekst(body?.code, body?.error), body?.code ?? null);
  }
  return data as T;
}

export const haalVerwijderStatus = () => actie<VerwijderStatus>('status');
export const verwijderEigenAccount = (sleutel: string) => actie<{ status: 'voltooid' | 'bezig' }>('lid_verwijderen', { sleutel });
export const startOverdracht = (naar: string) => actie<{ id: string; verlooptOp: string }>('overdracht_starten', { naar });
export const beantwoordOverdracht = (id: string, accepteren: boolean) =>
  actie<{ status: string }>(accepteren ? 'overdracht_accepteren' : 'overdracht_weigeren', { id });
export const trekOverdrachtIn = (id: string) => actie<{ status: string }>('overdracht_intrekken', { id });
export const planBedrijfVerwijdering = (sleutel: string) =>
  actie<{ status: 'gepland'; geplandOp: string }>('bedrijf_plannen', { sleutel, bevestiging: 'VERWIJDEREN' });
export const verwijderBedrijfNu = (sleutel: string, bedrijfsnaam: string) =>
  actie<{ status: 'voltooid' | 'bezig' }>('bedrijf_direct', { sleutel, bevestiging: bedrijfsnaam });
export const annuleerBedrijfVerwijdering = () => actie<{ status: 'geannuleerd' }>('bedrijf_annuleren');

/**
 * Opnieuw aanmelden met het wachtwoord, bij Supabase Auth zelf. De server eist
 * voor verwijderen en overdragen een aanmelding van de afgelopen 10 minuten
 * (claim `amr`). Het wachtwoord gaat alleen naar Supabase Auth.
 */
export async function bevestigMetWachtwoord(wachtwoord: string): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) throw new VerwijderFout('Je sessie is verlopen. Log opnieuw in.', 'sessie');
  const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord });
  if (error) throw new VerwijderFout('Dit wachtwoord klopt niet.', 'wachtwoord');
}

/**
 * Na een definitieve verwijdering: lokaal uitloggen (de sessie bestaat op de
 * server al niet meer) en alles wissen wat op dit toestel bij deze gebruiker
 * hoort (filters, onthouden keuzes).
 */
export async function wisLokaleGegevens(userId: string | null | undefined): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
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
