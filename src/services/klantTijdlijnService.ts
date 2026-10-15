import { supabase } from '@/lib/supabase';
import { getUserId, withCompanyId } from '@/lib/sessionContext';

/**
 * Een regel op de tijdlijn van een klant (`klant_tijdlijn`), precies zoals
 * `logTijdlijnSafe` in het dashboard (services/klantTijdlijnService.js):
 * type, omschrijving, tijdstip, optioneel `meta` en wie het deed. Zonder klant
 * gebeurt er niets, en het faalt altijd stil — de tijdlijn is een extra, geen
 * voorwaarde voor de handeling zelf.
 */
export async function logTijdlijn(
  customerId: string | null | undefined,
  type: string,
  omschrijving: string,
  meta: Record<string, unknown> | null = null,
): Promise<void> {
  if (!customerId) return;
  try {
    const userId = getUserId();
    const payload = withCompanyId({
      customer_id: customerId,
      type,
      omschrijving: omschrijving || type,
      aangemaakt_op: new Date().toISOString(),
      ...(meta ? { meta } : {}),
      ...(userId ? { created_by: userId } : {}),
    });
    if (!payload) return;
    await supabase.from('klant_tijdlijn').insert(payload);
  } catch {
    // Stil, zoals logTijdlijnSafe.
  }
}

/** Bedrag zoals in de tijdlijnregels van het dashboard: "1.234,50". */
export function tijdlijnBedrag(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
