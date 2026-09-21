import { tint } from '@/theme';

/**
 * Initialen en avatarkleur op één plek.
 *
 * Drie schermen hadden hier hun eigen kopie van: werkbonnen, klanten en team.
 * Daardoor kreeg dezelfde klant op het ene scherm een oranje rondje en op het
 * andere een blauw — terwijl juist de herkenning het doel is. Eén hash, één
 * palet, overal dezelfde kleur.
 */

/** Maximaal twee letters, uit de eerste twee woorden van de naam. */
export function initialen(naam: string | null | undefined, fallback = '–'): string {
  const schoon = (naam ?? '').trim();
  if (!schoon) return fallback;
  const delen = schoon.split(/\s+/).filter(Boolean);
  const letters = delen.slice(0, 2).map((d) => d.charAt(0).toUpperCase());
  return letters.join('') || fallback;
}

/** Stabiele index in het viertal accentkleuren van het ontwerp. */
function hash(naam: string): number {
  let h = 0;
  for (let i = 0; i < naam.length; i++) h = (h * 31 + naam.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * De vlak- en tekstkleur voor een avatar. `dark` komt van
 * `useTheme().colorMode`, zodat het rondje op een donkere kaart niet knalt.
 */
export function avatarKleuren(
  naam: string | null | undefined,
  dark: boolean,
): { bg: string; fg: string } {
  return tint(hash((naam ?? '').trim() || 'x'), dark);
}
