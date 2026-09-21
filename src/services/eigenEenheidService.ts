import { supabase } from '@/lib/supabase';
import type { EigenEenheid } from '@/lib/regels';

/**
 * Eigen eenheden (`eigen_eenheden`): zelf aangemaakte regeltypes met een
 * standaardprijs, eigen eenheidlabel en optioneel een eigen btw-percentage. Ze
 * staan in het dashboard naast Uren / Km / Overig in de regelkeuze van een
 * offerte of factuur, en horen daar in de app ook te staan — anders levert
 * dezelfde klus op de telefoon een andere prijs op dan op kantoor.
 *
 * Alleen lezen: aanmaken en beheren gebeurt in de bedrijfsinstellingen op het
 * dashboard. Mislukt de query, dan vallen de formulieren terug op de vaste
 * types; een ontbrekende eigen eenheid mag geen offerte blokkeren.
 */
export async function listEigenEenheden(): Promise<{
  data: EigenEenheid[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('eigen_eenheden')
    .select('id, naam, standaard_prijs, eenheid_label, btw_pct')
    .order('naam', { ascending: true });

  if (error) {
    console.warn('[eigenEenheidService.listEigenEenheden]', error.message);
    return { data: [], error: 'Eigen eenheden konden niet worden geladen.' };
  }

  const rijen = (data ?? []) as {
    id: string;
    naam: string | null;
    standaard_prijs: number | null;
    eenheid_label: string | null;
    btw_pct: number | null;
  }[];

  return {
    data: rijen.map((r) => ({
      id: r.id,
      naam: r.naam ?? 'Eigen eenheid',
      standaardPrijs: Number(r.standaard_prijs ?? 0),
      eenheidLabel: r.eenheid_label ?? '',
      btwPct: r.btw_pct != null ? Number(r.btw_pct) : null,
    })),
    error: null,
  };
}
