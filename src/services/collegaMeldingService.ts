import { supabase } from '@/lib/supabase';
import type { NotificatieRij } from '@/lib/collegaMeldingen';

export type { NotificatieRij };

/**
 * Meldingen aan collega's versturen via de Edge Function `create-notification`
 * (`pushNotifications` in het dashboard). De RLS op `notifications` staat alleen
 * self-insert toe; de functie controleert dat de ontvanger in hetzelfde bedrijf
 * zit en mailt als de rij `email: true` heeft.
 *
 * Best-effort: een melding die niet aankomt mag de opslag ervóór niet laten
 * mislukken. `invoke` gooit niet bij een 4xx/5xx, vandaar de `error`-check.
 */
export async function pushNotificaties(rijen: NotificatieRij[]): Promise<void> {
  if (!rijen.length) return;
  try {
    const { error } = await supabase.functions.invoke('create-notification', {
      body: { notifications: rijen },
    });
    if (error && __DEV__) console.log('[melding] create-notification mislukt', error.message);
  } catch (e) {
    if (__DEV__) console.log('[melding] create-notification mislukt', e);
  }
}
