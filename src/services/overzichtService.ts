import { supabase } from '@/lib/supabase';
import { haalInStukken } from '@/lib/inStukken';
import type { DealKern, FactuurKern, FaseKern, OfferteKern } from '@/lib/overzichtCijfers';

/**
 * Lichte, alleen-lezen bronnen voor de overzichtstegels op de homepage. Per
 * tabel alleen de kolommen die een tegel nodig heeft, in stukken van 1000 —
 * een tegel die stil na 100 rijen afkapt toont een verkeerd totaal.
 *
 * Het scherm vraagt alleen op wat de gebruiker mag zien (zelfde rechten als
 * `WIDGET_PERMISSION` in het dashboard); RLS blijft daarnaast de grens.
 */

type Res<T> = { data: T[]; error: string | null };

async function lees<T>(
  tabel: string,
  kolommen: string,
  context: string,
  statusIn?: string[],
): Promise<Res<T>> {
  const { data, error } = await haalInStukken<T, { message: string }>((van, tot) => {
    const basis = supabase.from(tabel).select(kolommen);
    const q = statusIn ? basis.in('status', statusIn) : basis;
    return q
      .order('id', { ascending: true })
      .range(van, tot)
      .then((r) => ({ data: (r.data as unknown as T[] | null) ?? null, error: r.error }));
  });
  if (error) {
    console.warn(`[overzichtService.${context}]`, error.message);
    return { data: [], error: 'Kon niet worden geladen.' };
  }
  return { data, error: null };
}

export function listDealKernen(): Promise<Res<DealKern>> {
  return lees<DealKern>(
    'deals',
    'id, status, stage_id, expected_revenue, final_revenue, afgerond_op',
    'listDealKernen',
  );
}

export function listFaseKernen(): Promise<Res<FaseKern>> {
  return lees<FaseKern>('pipeline_stages', 'id, position', 'listFaseKernen');
}

export function listOpenOfferteKernen(): Promise<Res<OfferteKern>> {
  return lees<OfferteKern>('offertes', 'id, status, totaal_incl', 'listOpenOfferteKernen', [
    'concept',
    'verzonden',
  ]);
}

export function listFactuurKernen(): Promise<Res<FactuurKern>> {
  return lees<FactuurKern>(
    'facturen',
    'id, status, totaal_incl, totaal_excl, factuurdatum, vervaldatum, is_credit, gecrediteerd',
    'listFactuurKernen',
  );
}

/** Aantal klanten zonder ze op te halen. */
export async function telKlanten(): Promise<{ aantal: number | null; error: string | null }> {
  const { count, error } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true });
  if (error) {
    console.warn('[overzichtService.telKlanten]', error.message);
    return { aantal: null, error: 'Kon niet worden geladen.' };
  }
  return { aantal: count ?? 0, error: null };
}
