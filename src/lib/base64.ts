const ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Omgekeerde tabel, één keer opgebouwd. -1 = geen base64-teken. */
const WAARDE = (() => {
  const tabel = new Int16Array(256).fill(-1);
  for (let i = 0; i < ALFABET.length; i++) tabel[ALFABET.charCodeAt(i)] = i;
  return tabel;
})();

/**
 * Base64 naar bytes, zonder afhankelijkheden.
 *
 * React Native heeft geen `atob` en Buffer, en expo-image-picker levert een
 * foto het makkelijkst als base64-string aan. Een eigen decoder is hier
 * betrouwbaarder dan een polyfill die per platform kan verschillen: een foto die
 * stilletjes corrupt uploadt, merk je pas als de klant de werkbon opent.
 *
 * Padding (`=`) en witruimte worden genegeerd; een data-URL-prefix mag mee.
 */
export function base64NaarBytes(base64: string): Uint8Array {
  const komma = base64.indexOf(',');
  const kaal = komma !== -1 && base64.slice(0, komma).includes(';base64')
    ? base64.slice(komma + 1)
    : base64;

  // Eerst tellen hoeveel echte tekens er zijn, zodat de buffer meteen klopt.
  let tekens = 0;
  for (let i = 0; i < kaal.length; i++) {
    if (WAARDE[kaal.charCodeAt(i)]! >= 0) tekens++;
  }
  const bytes = new Uint8Array(Math.floor((tekens * 3) / 4));

  let buffer = 0;
  let bits = 0;
  let uit = 0;
  for (let i = 0; i < kaal.length; i++) {
    const v = WAARDE[kaal.charCodeAt(i)]!;
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[uit++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes;
}
