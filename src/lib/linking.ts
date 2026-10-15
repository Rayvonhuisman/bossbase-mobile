import { Linking, Platform } from 'react-native';
import { Dialog } from './dialog';
import { routeApparaatVanBrowser, routeKeuzes, type RouteApparaat } from './routeLinks';

/**
 * Centralized helpers for OS deep-link actions used across screens.
 * - Strip whitespace before composing tel:/mailto: URIs.
 * - Encode addresses for maps URLs.
 * - Show a friendly Dutch alert if the OS refuses the URL.
 */

async function safeOpen(url: string, fallbackMsg = 'Deze actie wordt niet ondersteund.') {
  try {
    await Linking.openURL(url);
  } catch (e) {
    // De URL bevat een telefoonnummer of e-mailadres: alleen tijdens ontwikkeling loggen.
    if (__DEV__) console.warn('[linking] openURL failed', { url, err: e });
    Dialog.alert('Kon niet openen', fallbackMsg);
  }
}

/**
 * Een externe link (PDF, bijlage, foto, website, tel:/mailto:) openen met een
 * nette melding als het toestel weigert — bijvoorbeeld `tel:` op een iPad
 * zonder telefoonfunctie, of geen app die het bestand kan tonen. Zonder deze
 * vangst gebeurt er op iOS bij een weigering gewoon niets.
 */
export function openExtern(url: string, fallbackMsg = 'Deze link kon niet worden geopend.'): void {
  void safeOpen(url, fallbackMsg);
}

/** Open phone dialer. Returns false if no usable number was supplied. */
export function callPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const clean = phone.replace(/\s/g, '');
  if (!clean) return false;
  safeOpen(`tel:${clean}`, 'Bellen werkt niet op dit toestel.');
  return true;
}

/** Open mail composer. Returns false if no usable email was supplied. */
export function sendMail(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  if (!trimmed) return false;
  safeOpen(`mailto:${trimmed}`, 'Mail werkt niet op dit toestel.');
  return true;
}

/** Route-apparaat: in de app het platform, op web uit de browser. */
function routeApparaat(): RouteApparaat {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (typeof navigator === 'undefined') return 'computer';
  return routeApparaatVanBrowser(navigator.userAgent ?? '', navigator.maxTouchPoints ?? 0);
}

/**
 * Route naar dit adres in de kaartenapp van het toestel (zie `routeLinks.ts`):
 * Apple Kaarten op iPhone/iPad, Google Maps op Android. Staat in de iOS-app
 * ook Google Maps erop, dan kies je. Geeft false als er geen adres is.
 */
export function openMaps(address: string | null | undefined): boolean {
  const adres = (address ?? '').trim();
  if (!adres) return false;
  void (async () => {
    const apparaat = routeApparaat();
    let google = false;
    if (Platform.OS === 'ios') {
      // Vraagt LSApplicationQueriesSchemes 'comgooglemaps' (app.config.ts).
      google = await Linking.canOpenURL('comgooglemaps://').catch(() => false);
    }
    const keuzes = routeKeuzes(adres, apparaat, google);
    if (keuzes.length > 1) {
      Dialog.alert('Route openen in', undefined, [
        ...keuzes.map((k) => ({ text: k.label, onPress: () => void safeOpen(k.url, 'Navigeren werkt niet op dit toestel.') })),
        { text: 'Annuleren', style: 'cancel' as const },
      ]);
      return;
    }
    if (keuzes[0]) await safeOpen(keuzes[0].url, 'Navigeren werkt niet op dit toestel.');
  })();
  return true;
}
