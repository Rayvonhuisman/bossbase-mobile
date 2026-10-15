/**
 * Breekpunten en maten voor telefoon en tablet — één plek, zonder React of
 * React Native, zodat de regels los te testen zijn (zie `useSchermklasse`).
 *
 * Bewust op vensterbreedte, niet op apparaat: een iPad in Split View of Stage
 * Manager kan een smal venster hebben, en dan hoort daar de telefoonindeling
 * bij. Een iPad meldt zich in Safari bovendien vaak als Mac; de breedte liegt
 * niet.
 */

export type Schermklasse = 'telefoon' | 'tablet';

/** Vanaf deze vensterbreedte de tabletindeling (iPad mini staand = 744). */
export const TABLET_VANAF = 700;

/** Maximale breedte van de app-kolom op een tablet of groter scherm. */
export const KOLOM_MAX_TABLET = 880;

/** Formulieren, kiezers en andere vellen: een prettige leesbreedte. */
export const FORMULIER_MAX = 600;

/**
 * Stijl voor een formulierpagina of voetbalk: op een telefoon de volle
 * breedte, op een iPad of desktop een kolom van {@link FORMULIER_MAX} in het
 * midden. Werkt op elk platform hetzelfde; een telefoon is smaller.
 */
export const leesbreedte = {
  width: '100%',
  maxWidth: FORMULIER_MAX,
  alignSelf: 'center',
} as const;

/** De zwevende tabbalk wordt op een breed scherm niet breder dan dit. */
export const TABBALK_MAX = 520;

/**
 * Welke indeling hoort bij dit venster. Alleen in de webapp: de iOS- en
 * Android-app houden hun eigen (telefoon)indeling.
 */
export function bepaalSchermklasse(breedte: number, _platform?: string): Schermklasse {
  // Op elk platform dezelfde regel: de iOS-app op een iPad (ook in Split View
  // of Stage Manager) volgt net als de webapp de breedte van het venster.
  // Telefoons komen in staande stand nooit aan 700 punten.
  return breedte >= TABLET_VANAF ? 'tablet' : 'telefoon';
}

/**
 * Hoe breed de app-kolom maximaal is.
 *
 * Een telefoonvenster tot 700 breed (ook iPad Split View) vult het venster;
 * pas daarboven telt de telefoonmaat niet meer en wordt het de tabletkolom.
 */
export function kolomMax(klasse: Schermklasse, soort: 'app' | 'formulier' = 'app'): number {
  if (soort === 'formulier') return FORMULIER_MAX;
  return klasse === 'tablet' ? KOLOM_MAX_TABLET : TABLET_VANAF;
}

/** De werkelijke breedte van de kolom in een venster van deze breedte. */
export function kolomBreedte(breedte: number, klasse: Schermklasse, soort: 'app' | 'formulier' = 'app'): number {
  return Math.min(breedte, kolomMax(klasse, soort));
}
