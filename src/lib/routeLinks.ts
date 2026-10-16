/**
 * Welke kaartenapp de route-knop opent. Geen imports, zodat dit in de Node-tests
 * draait; `linking.ts` doet het openen.
 *
 *   iPhone/iPad (app)   Apple Kaarten; staat Google Maps erop, dan mag je kiezen
 *   iPhone/iPad (web)   Apple Kaarten via maps.apple.com — Safari en de
 *                       geïnstalleerde PWA geven die door aan de Kaarten-app
 *   Android (app/web)   Google Maps-route; de link opent de Google Maps-app
 *   computer            Google Maps in de browser
 *
 * Altijd een route (bestemming), geen zoekopdracht: de knop heet "Route".
 */

export type RouteApparaat = 'ios' | 'android' | 'computer';

export type RouteKeuze = { label: string; url: string };

export function routeUrls(adres: string): { apple: string; googleApp: string; googleWeb: string } {
  const q = encodeURIComponent(adres.trim());
  return {
    apple: `https://maps.apple.com/?daddr=${q}&dirflg=d`,
    googleApp: `comgooglemaps://?daddr=${q}&directionsmode=driving`,
    googleWeb: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
  };
}

/** Apparaat uit de user agent; iPadOS meldt zich als Mac, maar heeft een touchscreen. */
export function routeApparaatVanBrowser(userAgent: string, touchPunten: number): RouteApparaat {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  if (/Macintosh/.test(userAgent) && touchPunten > 1) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'computer';
}

/**
 * De keuzes voor dit apparaat, de eerste is de standaard. Meer dan één keuze
 * alleen op een iPhone/iPad waar Google Maps op staat (alleen in de app te zien).
 */
export function routeKeuzes(
  adres: string,
  apparaat: RouteApparaat,
  googleMapsGeinstalleerd = false,
): RouteKeuze[] {
  if (!adres.trim()) return [];
  const u = routeUrls(adres);
  if (apparaat === 'ios') {
    const apple = { label: 'Apple Kaarten', url: u.apple };
    return googleMapsGeinstalleerd ? [apple, { label: 'Google Maps', url: u.googleApp }] : [apple];
  }
  return [{ label: 'Google Maps', url: u.googleWeb }];
}
