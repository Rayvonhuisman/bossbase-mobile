/**
 * Seizoen van een contractbeurt (dashboard-migratie 20261110230000):
 * seizoen_van en seizoen_tot zijn maanden 1–12, beide leeg = het hele jaar.
 * Over de jaargrens mag (november t/m maart = 11 en 3). Buiten het seizoen
 * maakt de nacht geen werkbon. Zelfde regels als seizoenTekst in het dashboard
 * (supabase/functions/_shared/contractSjablonen.js). De maandnamen volgen hier
 * de taal van de app (schermweergave).
 */
import { tx } from '@/i18n';
import { maandNaam } from './kalenderNamen';

const maand = (m: number | null | undefined): number | null => {
  const n = Math.round(Number(m));
  return n >= 1 && n <= 12 ? n : null;
};

/** "maart t/m oktober", of '' voor het hele jaar. */
export function seizoenLabel(van: number | null | undefined, tot: number | null | undefined): string {
  const v = maand(van);
  const t = maand(tot);
  if (!v || !t) return '';
  if ((v === 1 && t === 12) || v === t + 1) return '';
  if (v === t) return maandNaam(v - 1);
  return tx('{van} t/m {tot}', { van: maandNaam(v - 1), tot: maandNaam(t - 1) });
}
