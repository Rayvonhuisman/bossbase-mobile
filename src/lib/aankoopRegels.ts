/**
 * Pure regels (zonder react-native, los te testen) voor wat de app over
 * abonnementen en aankopen toont. Zie `aankoopInfo.ts` voor het waarom.
 */
export const BEHEER_BUITEN_APP = 'Je abonnement wordt buiten de app beheerd.';

/** iOS: geen prijzen, aankoop-/upgrade-oproepen of beheerlinks. Web en Android: ongewijzigd. */
export function toonAankoopInfoVoor(platform: string): boolean {
  return platform !== 'ios';
}

export function aankoopTekstVoor(platform: string, gewoon: string, ios: string): string {
  return toonAankoopInfoVoor(platform) ? gewoon : ios;
}
