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
  let fout: string | null = null;
  try {
    const { error } = await supabase.functions.invoke('create-notification', {
      body: { notifications: rijen },
    });
    if (error) fout = error.message || String(error);
  } catch (e) {
    fout = e instanceof Error ? e.message : String(e);
  }
  if (!fout) return;
  if (__DEV__) console.log('[melding] create-notification mislukt', fout);
  // Zoals pushNotifications in het dashboard: een melding die niet aankomt
  // hoort in mail_fouten, niet alleen in een console.
  try {
    await supabase.rpc('meld_mail_fout', {
      p_soort: `notificatie_${rijen[0]?.type || 'onbekend'}`,
      p_fout: `create-notification mislukt voor ${rijen.length} melding(en): ${fout}`,
      p_bron: 'pushNotifications',
      p_gerelateerd_type: rijen[0]?.related_type || null,
      p_gerelateerd_id: rijen[0]?.related_id || null,
    });
  } catch {
    /* dan is er niets meer om het in te schrijven */
  }
}
