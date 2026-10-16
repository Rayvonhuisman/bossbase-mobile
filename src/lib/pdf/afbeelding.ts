import { base64NaarBytes } from '../base64';

/**
 * Afbeeldingen voor de PDF zonder DOM: geen `Image`, geen canvas.
 *
 * De gedeelde opmaak (vendored/pdfOpbouw.js) vraagt de omgeving om drie dingen:
 * een data-URL van een plaatje, de afmetingen in pixels, en de maat op papier.
 * In de browser doet het dashboard dat met `new Image()` en een canvas. Op een
 * telefoon is die er niet, dus lezen we de afmetingen uit de kop van het
 * bestand (PNG, JPEG, GIF, WebP). Die staan daar altijd; het plaatje hoeft
 * er niet voor gedecodeerd te worden.
 *
 * Verkleinen kan hier niet. Dat is voor de opmaak geen verschil: de maat op
 * papier volgt uit de afmetingen en is dezelfde, alleen het bestand kan groter
 * worden bij een groot logo.
 */

export type Afmetingen = { w: number; h: number };

export type VoorbereideAfbeelding = {
  dataUrl: string;
  formaat: string;
  /** Breedte op papier in mm. */
  breedte: number;
  /** Hoogte op papier in mm. */
  hoogte: number;
};

/** Zelfde tabel als generatePdf.js in het dashboard. */
export const FORMAAT_UIT_MIME: Record<string, string> = {
  jpeg: 'JPEG',
  jpg: 'JPEG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WEBP',
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes naar base64, zonder `btoa` of Buffer (die Hermes niet overal heeft). */
export function bytesNaarBase64(bytes: Uint8Array): string {
  const delen: string[] = [];
  let stuk = '';
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    stuk += B64[(v >> 18) & 63]! + B64[(v >> 12) & 63]! + B64[(v >> 6) & 63]! + B64[v & 63]!;
    // In stukken: één string van tientallen MB opbouwen met += is traag.
    if (stuk.length >= 16384) {
      delen.push(stuk);
      stuk = '';
    }
  }
  if (i < n) {
    const a = bytes[i]!;
    const b = i + 1 < n ? bytes[i + 1]! : 0;
    const v = (a << 16) | (b << 8);
    stuk += B64[(v >> 18) & 63]! + B64[(v >> 12) & 63]!;
    stuk += i + 1 < n ? B64[(v >> 6) & 63]! + '=' : '==';
  }
  delen.push(stuk);
  return delen.join('');
}

/** Soort afbeelding uit de eerste bytes, of null. */
export function mimeUitBytes(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

const be16 = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const le16 = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const be32 = (b: Uint8Array, i: number) =>
  ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;

function jpegAfmetingen(b: Uint8Array): Afmetingen | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    // Opvulling (0xFF 0xFF) en markers zonder lengte overslaan.
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const lengte = be16(b, i + 2);
    // SOF0..SOF15, behalve DHT (C4), JPG (C8) en DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = be16(b, i + 5);
      const w = be16(b, i + 7);
      return w && h ? { w, h } : null;
    }
    if (marker === 0xda || lengte < 2) return null; // begin van de beelddata: geen SOF gevonden
    i += 2 + lengte;
  }
  return null;
}

function webpAfmetingen(b: Uint8Array): Afmetingen | null {
  if (b.length < 30) return null;
  const soort = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
  if (soort === 'VP8 ') {
    // Frame-kop: 3 bytes, dan start-code 9D 01 2A, dan 14 bits breedte/hoogte.
    return { w: le16(b, 26) & 0x3fff, h: le16(b, 28) & 0x3fff };
  }
  if (soort === 'VP8L') {
    const b0 = b[21]!, b1 = b[22]!, b2 = b[23]!, b3 = b[24]!;
    return {
      w: 1 + (((b1 & 0x3f) << 8) | b0),
      h: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (soort === 'VP8X') {
    return {
      w: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
      h: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
    };
  }
  return null;
}

/**
 * Afmetingen in pixels uit de bestandskop. Let op: de EXIF-oriëntatie van een
 * JPEG wordt niet toegepast. Het dashboard (een `<img>` in de browser) doet
 * dat wél; voor een staande telefoonfoto kunnen breedte en hoogte dus
 * omgewisseld zijn. Logo's en handtekeningen (PNG) hebben daar geen last van.
 */
export function afmetingenUitBytes(b: Uint8Array): Afmetingen | null {
  const mime = mimeUitBytes(b);
  if (mime === 'image/png') {
    if (b.length < 24) return null;
    const w = be32(b, 16);
    const h = be32(b, 20);
    return w && h ? { w, h } : null;
  }
  if (mime === 'image/gif') return { w: le16(b, 6), h: le16(b, 8) };
  if (mime === 'image/jpeg') return jpegAfmetingen(b);
  if (mime === 'image/webp') return webpAfmetingen(b);
  return null;
}

/** De bytes achter een data-URL (base64), of null als het geen base64-URL is. */
export function bytesUitDataUrl(dataUrl: string): Uint8Array | null {
  if (!/^data:[^,]*;base64,/i.test(dataUrl)) return null;
  return base64NaarBytes(dataUrl);
}

export function afmetingenUitDataUrl(dataUrl: string): Afmetingen | null {
  const bytes = bytesUitDataUrl(dataUrl);
  return bytes ? afmetingenUitBytes(bytes) : null;
}

/** Maat op papier: passend in maxWmm × maxHmm, verhouding behouden (zoals het dashboard). */
export function maatOpPapier(dims: Afmetingen, maxWmm: number, maxHmm: number) {
  const schaalMm = Math.min(maxWmm / dims.w, maxHmm / dims.h);
  return { breedte: dims.w * schaalMm, hoogte: dims.h * schaalMm };
}

/** jsPDF-formaat uit de MIME van de data-URL, met JPEG als terugval (dashboard). */
export function formaatUitDataUrl(dataUrl: string): string {
  const bronMime = (dataUrl.match(/^data:image\/([^;]+)/i)?.[1] || 'jpeg').toLowerCase();
  return FORMAAT_UIT_MIME[bronMime] || 'JPEG';
}

/**
 * `bereidAfbeelding` zonder canvas: zelfde maat op papier als het dashboard,
 * het bestand ongewijzigd. Gelijk aan de tak "al klein genoeg" van
 * bereidAfbeeldingVoor in generatePdf.js.
 */
export function bereidZonderCanvas(
  dataUrl: string | null | undefined,
  maxWmm: number,
  maxHmm: number,
): VoorbereideAfbeelding | null {
  if (!dataUrl) return null;
  const dims = afmetingenUitDataUrl(dataUrl);
  if (!dims || !dims.w || !dims.h) return null;
  const { breedte, hoogte } = maatOpPapier(dims, maxWmm, maxHmm);
  return { dataUrl, formaat: formaatUitDataUrl(dataUrl), breedte, hoogte };
}
