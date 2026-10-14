/**
 * De allereerste weergave van de app (koude start, herladen, openen vanuit
 * Safari of het beginscherm) staat meteen in rust: geen ingang-animatie.
 * Pas daarna — bij wisselen van scherm — mag een scherm zacht binnenkomen.
 */
let eersteGehad = false;

/** `false` bij de eerste vraag (de eerste weergave), daarna altijd `true`. */
export function magEntreeAnimeren(): boolean {
  if (!eersteGehad) {
    eersteGehad = true;
    return false;
  }
  return true;
}

/** Alleen voor tests. */
export function resetEersteWeergave(): void {
  eersteGehad = false;
}
