/**
 * Boss bij het meerwerk op een werkbon: edge function `boss-meerwerk`, dezelfde
 * als het dashboard (`bossMeerwerkService.js`).
 *
 * `bossMeerwerkStatus(werkbonId)` bepaalt of de Boss-knop bij het meerwerk
 * verschijnt. Zolang de functie niet bereikbaar is, de sleutel ontbreekt of de
 * gebruiker geen meerwerk op deze werkbon mag zetten (getekend, geannuleerd,
 * geen rechten), blijft alles zoals het was.
 *
 * Geen wachtrij: zonder internet is er geen Boss. De aanroep faalt dan met een
 * melding die dat zegt; de notitie blijft in het venster staan.
 */
import { supabase } from '@/lib/supabase';
import { isNetwerkfout } from '@/lib/netwerkfout';
import type { BossMeerwerkResultaat } from '@/lib/boss/meerwerkRegels';
import { tx, txm } from '@/i18n';

/** Vorm van het verzoek; zie APP_VERSIE in boss-meerwerk/logica.ts (dashboard). */
export const BOSS_MEERWERK_VERSIE = 1;

export type BossMeerwerkStatus = { beschikbaar: boolean; mag: boolean; magBedragen: boolean };

const UIT: BossMeerwerkStatus = { beschikbaar: false, mag: false, magBedragen: false };
const NIET_BEREIKBAAR = txm('Boss is even niet bereikbaar. Probeer het zo nog eens.');
const GEEN_VERBINDING = txm('Geen verbinding. Boss werkt alleen met internet; je notitie blijft staan, probeer het zo nog eens.');

type Controle = { status: BossMeerwerkStatus; zeker: boolean };
const statussen = new Map<string, Promise<Controle>>();

export function bossMeerwerkStatus(werkbonId: string | null | undefined): Promise<BossMeerwerkStatus> {
  if (!werkbonId) return Promise.resolve(UIT);
  let belofte = statussen.get(werkbonId);
  if (!belofte) {
    belofte = supabase.functions
      .invoke('boss-meerwerk', { body: { taak: 'status', werkbon_id: werkbonId } })
      .then(({ data, error }): Controle => {
        if (error || !data?.success) return { status: UIT, zeker: false };
        return {
          status: { beschikbaar: Boolean(data.beschikbaar), mag: data.mag === true, magBedragen: data.mag_bedragen === true },
          zeker: true,
        };
      })
      .catch((): Controle => ({ status: UIT, zeker: false }));
    statussen.set(werkbonId, belofte);
    // Niet de hele sessie onthouden: rechten of de werkbon kunnen veranderen.
    // Een mislukte controle (geen bereik) meteen weer vergeten.
    void belofte.then((c) => setTimeout(() => statussen.delete(werkbonId), c.zeker ? 5 * 60_000 : 0));
  }
  return belofte.then((c) => c.status);
}

/** Na een wijziging aan de werkbon (getekend, geannuleerd) opnieuw vragen. */
export function vergeetBossMeerwerkStatus(werkbonId: string) {
  statussen.delete(werkbonId);
}

async function foutTekst(error: unknown): Promise<string> {
  const e = error as { name?: string; message?: string; context?: { json?: () => Promise<{ error?: string }> } };
  if (e?.name === 'FunctionsFetchError' || isNetwerkfout(e?.message)) return tx(GEEN_VERBINDING);
  try {
    const j = await e?.context?.json?.();
    if (j?.error) return j.error;
  } catch {
    /* geen JSON */
  }
  return tx(NIET_BEREIKBAAR);
}

/** Een notitie omzetten in een meerwerkvoorstel. Er wordt niets opgeslagen. */
export async function vraagBossMeerwerk(
  werkbonId: string,
  notitie: string,
): Promise<{ resultaat: BossMeerwerkResultaat; waarschuwingen: string[]; magBedragen: boolean }> {
  let res;
  try {
    res = await supabase.functions.invoke('boss-meerwerk', {
      body: { taak: 'meerwerk', werkbon_id: werkbonId, notitie, versie: BOSS_MEERWERK_VERSIE },
    });
  } catch (e) {
    throw new Error(isNetwerkfout((e as Error)?.message) ? tx(GEEN_VERBINDING) : tx(NIET_BEREIKBAAR));
  }
  const { data, error } = res;
  if (error) throw new Error(await foutTekst(error));
  if (!data?.success) throw new Error(data?.error || tx(NIET_BEREIKBAAR));
  return {
    resultaat: data.resultaat as BossMeerwerkResultaat,
    waarschuwingen: Array.isArray(data.waarschuwingen) ? (data.waarschuwingen as string[]) : [],
    magBedragen: data.mag_bedragen === true,
  };
}
