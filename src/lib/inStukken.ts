/**
 * Een lijst in stukken van 1000 ophalen, net als het dashboard.
 *
 * PostgREST geeft per verzoek hooguit 1000 rijen terug (de standaard van
 * Supabase) en zegt er niet bij dat er meer zijn. Een bedrijf met 1200 klanten
 * zag er dan 1000, zonder melding; voor de nummering van offertes en facturen
 * betekent dat zelfs een dubbel nummer zodra het hoogste nummer buiten de
 * eerste 1000 valt.
 *
 * `maak(van, tot)` bouwt telkens een nieuwe query met `.range(van, tot)` en
 * een vaste sortering (anders kan een rij tussen twee stukken verschuiven en
 * dubbel of helemaal niet meekomen). We stoppen bij een stuk dat korter is dan
 * 1000, of bij `maximum` als vangnet tegen een eindeloze lus.
 */
export const STUK = 1000;

export type StukResultaat<T, F> = { data: T[] | null; error: F | null };

export async function haalInStukken<T, F>(
  maak: (van: number, tot: number) => PromiseLike<StukResultaat<T, F>>,
  { stuk = STUK, maximum = 50000 }: { stuk?: number; maximum?: number } = {},
): Promise<{ data: T[]; error: F | null }> {
  const alles: T[] = [];
  for (let van = 0; van < maximum; van += stuk) {
    const { data, error } = await maak(van, van + stuk - 1);
    if (error) return { data: alles, error };
    const rijen = data ?? [];
    alles.push(...rijen);
    if (rijen.length < stuk) break;
  }
  return { data: alles, error: null };
}
