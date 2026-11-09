import { supabase } from '@/lib/supabase';
import type { OfferteRegelRij } from '@/lib/werkbonUitOfferte';

/**
 * Werkbon vullen vanuit de offerte — `werkbonOfferteService.js` van het
 * dashboard. Alles via databasefuncties (migratie 20261107170000): wie
 * werkbonnen maakt, mag vaak geen offertes zien. De functies geven
 * omschrijving, aantal en eenheid terug, nooit een prijs, en controleren zelf
 * of je de werkbon mag vullen. Zonder recht: geen rijen, en dus geen knop.
 */

const nogNietUitgerold = (e: { code?: string; message?: string } | null) =>
  /could not find the function|PGRST202|does not exist/i.test(`${e?.code || ''} ${e?.message || ''}`);

const melding = (e: { message?: string } | null, standaard: string) => e?.message || standaard;

/** Regels van de offertes waar deze werkbon uit kan putten. */
export async function getOfferteRegelsVoorWerkbon({
  werkbonId = null,
  projectId = null,
}: {
  werkbonId?: string | null;
  projectId?: string | null;
}): Promise<{ data: OfferteRegelRij[]; error: string | null }> {
  if (!werkbonId && !projectId) return { data: [], error: null };
  const { data, error } = await supabase.rpc('bb_werkbon_offerte_regels', {
    p_werkbon: werkbonId,
    p_project: werkbonId ? null : projectId,
  });
  if (error) {
    if (nogNietUitgerold(error)) return { data: [], error: null };
    if (__DEV__) console.log('[werkbonOfferteService.regels]', error.message);
    return { data: [], error: melding(error, 'De offerteregels konden niet worden geladen.') };
  }
  return { data: (data as OfferteRegelRij[] | null) ?? [], error: null };
}

/** Gekozen regels als taken; geeft het aantal nieuwe taken terug. */
export async function takenUitOfferte(
  werkbonId: string,
  offerteId: string,
  regelIds: string[],
): Promise<{ data: number; error: string | null }> {
  const { data, error } = await supabase.rpc('bb_werkbon_taken_uit_offerte', {
    p_werkbon: werkbonId,
    p_offerte: offerteId,
    p_regels: regelIds,
  });
  if (error) return { data: 0, error: melding(error, 'Overnemen mislukt.') };
  return { data: Number(data) || 0, error: null };
}

/** Eén materiaalregel uit de offerte op de werkbon; geeft het nieuwe id terug. */
export async function materiaalUitOfferte(
  werkbonId: string,
  regelId: string,
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('bb_werkbon_materiaal_uit_offerte', {
    p_werkbon: werkbonId,
    p_regel: regelId,
  });
  if (error) return { data: null, error: melding(error, 'Toevoegen mislukt.') };
  return { data: (data as string | null) ?? null, error: null };
}
