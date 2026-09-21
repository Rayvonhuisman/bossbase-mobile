import { Alert, Linking, Platform } from 'react-native';

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
    console.warn('[linking] openURL failed', { url, err: e });
    Alert.alert('Kon niet openen', fallbackMsg);
  }
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

/** Open maps app at the given address string. Falls back to Google Maps web. */
export function openMaps(address: string | null | undefined): boolean {
  if (!address) return false;
  const q = encodeURIComponent(address.trim());
  if (!q) return false;
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?q=${q}`
      : `https://maps.google.com/?q=${q}`;
  safeOpen(url, 'Navigeren werkt niet op dit toestel.');
  return true;
}
