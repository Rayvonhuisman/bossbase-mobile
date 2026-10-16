import { Platform } from 'react-native';
import { aankoopTekstVoor, BEHEER_BUITEN_APP, toonAankoopInfoVoor } from './aankoopRegels';

/**
 * App Store-richtlijn 3.1.1/3.1.3: in de iOS-app geen prijzen, geen
 * aankoop-/upgrade-oproepen en geen links waarmee een digitaal abonnement buiten
 * de App Store gekocht of uitgebreid kan worden. Het abonnement wordt buiten de
 * app beheerd; de iOS-app toont alleen het huidige pakket en een neutrale status.
 *
 * Web (PWA) en Android blijven ongewijzigd: daar is het abonnementsbeheer via
 * het dashboard gewoon zichtbaar.
 */
export { BEHEER_BUITEN_APP };

export function toonAankoopInfo(): boolean {
  return toonAankoopInfoVoor(Platform.OS);
}

/** Kies per platform tussen de gewone tekst en de neutrale iOS-tekst. */
export function aankoopTekst(gewoon: string, ios: string): string {
  return aankoopTekstVoor(Platform.OS, gewoon, ios);
}
