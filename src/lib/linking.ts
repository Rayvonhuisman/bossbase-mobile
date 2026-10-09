import { Linking, Platform } from 'react-native';
import { Dialog } from './dialog';

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
    Dialog.alert('Kon niet openen', fallbackMsg);
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

/**
 * Wachtwoordherstel loopt via de website: daar vraag je met "Wachtwoord
 * vergeten?" een resetlink aan, die per mail komt en op
 * `www.bossbase.nl/reset-password?token=…` landt. De app doet zelf niets met
 * wachtwoorden die je kwijt bent.
 *
 * Bewust naar `/login` en niet naar `/reset-password`: zonder token toont die
 * pagina alleen "Deze link is ongeldig". Het aanvraagformulier zit achter
 * "Wachtwoord vergeten?" op de inlogpagina, en die werkt ook op een telefoon.
 */
export const WACHTWOORD_HERSTEL_URL = 'https://www.bossbase.nl/login';

export function openWachtwoordHerstel(): void {
  safeOpen(WACHTWOORD_HERSTEL_URL, 'Ga in je browser naar www.bossbase.nl/login.');
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
