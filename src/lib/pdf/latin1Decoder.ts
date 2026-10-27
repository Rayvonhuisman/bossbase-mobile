/**
 * `TextDecoder('latin1')` voor iOS en Android.
 *
 * jsPDF laadt fast-png (voor PNG-logo's en handtekeningen), en fast-png maakt
 * bij het laden meteen `new TextDecoder('latin1')` aan. De TextDecoder van
 * Expo in de app kent alleen UTF-8 en gooit dan "RangeError: Unknown encoding:
 * latin1". Omdat dat tijdens het laden van de module gebeurt, sloot de app
 * helemaal af bij het bekijken van een offerte, factuur of werkbon (27-10-2026).
 *
 * Browsers en Node kennen 'latin1' wel; daar verandert deze module niets.
 *
 * Volgens de WHATWG Encoding-standaard is 'latin1' (net als 'iso-8859-1',
 * 'ascii', 'us-ascii', 'cp1252' enz.) een label voor windows-1252: gelijk aan
 * ISO-8859-1, behalve 0x80–0x9F (0x80 = €, 0x91/0x92 = ‘ ’, …). We volgen de
 * standaard, zodat de app precies decodeert wat de browser (PWA, dashboard)
 * decodeert. Het enige gebruik is tEXt-tekst in PNG-bestanden.
 */

/** Alle WHATWG-labels voor windows-1252. */
const LABELS = new Set([
  'ansi_x3.4-1968',
  'ascii',
  'cp1252',
  'cp819',
  'csisolatin1',
  'ibm819',
  'iso-8859-1',
  'iso-ir-100',
  'iso8859-1',
  'iso88591',
  'iso_8859-1',
  'iso_8859-1:1987',
  'l1',
  'latin1',
  'us-ascii',
  'windows-1252',
  'x-cp1252',
]);

/** windows-1252 voor 0x80–0x9F; de vijf onbezette posities blijven zichzelf. */
const BOVEN_80 = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

export const isLatin1Label = (label: unknown) => LABELS.has(String(label).trim().toLowerCase());

function alsBytes(invoer?: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (invoer === undefined) return new Uint8Array(0);
  if (invoer instanceof Uint8Array) return invoer;
  if (ArrayBuffer.isView(invoer)) return new Uint8Array(invoer.buffer, invoer.byteOffset, invoer.byteLength);
  return new Uint8Array(invoer);
}

/** Bytes als windows-1252-tekst. Eén byte is één teken, dus streamen vraagt geen buffer. */
export function decodeerLatin1(invoer?: ArrayBuffer | ArrayBufferView): string {
  const bytes = alsBytes(invoer);
  let uit = '';
  // Per stuk van 4096: Hermes begrenst het aantal argumenten van apply.
  for (let i = 0; i < bytes.length; i += 4096) {
    const stuk = Array.from(bytes.subarray(i, i + 4096), (b) => (b >= 0x80 && b <= 0x9f ? BOVEN_80[b - 0x80]! : b));
    uit += String.fromCharCode.apply(null, stuk);
  }
  return uit;
}

type DecoderKlasse = new (label?: string, opties?: TextDecoderOptions) => TextDecoder;

function kentLatin1(Decoder: DecoderKlasse | undefined): boolean {
  if (typeof Decoder !== 'function') return false;
  try {
    new Decoder('latin1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Zorgt dat `new TextDecoder('latin1')` werkt. Doet niets als de bestaande
 * TextDecoder het al kan. Anders komt er een omhulsel: latin1-labels decodeert
 * het zelf, al het andere gaat ongewijzigd naar de oorspronkelijke decoder.
 * Geeft terug of 'latin1' daarna werkt.
 */
export function zorgVoorLatin1Decoder(): boolean {
  const g = globalThis as unknown as { TextDecoder?: DecoderKlasse };
  const Origineel = g.TextDecoder;
  if (kentLatin1(Origineel)) return true;

  class Latin1Decoder {
    readonly encoding = 'windows-1252';
    fatal = false;
    ignoreBOM = false;

    constructor(label: string = 'utf-8', opties: TextDecoderOptions = {}) {
      if (!isLatin1Label(label)) {
        if (!Origineel) throw new RangeError(`Unknown encoding: ${label}`);
        // Een constructor mag een ander object teruggeven: de echte decoder.
        return new Origineel(label, opties) as unknown as Latin1Decoder;
      }
      this.fatal = Boolean(opties.fatal);
      this.ignoreBOM = Boolean(opties.ignoreBOM);
    }

    decode(invoer?: ArrayBuffer | ArrayBufferView, _opties?: TextDecodeOptions): string {
      return decodeerLatin1(invoer);
    }
  }

  g.TextDecoder = Latin1Decoder as unknown as DecoderKlasse;
  return kentLatin1(g.TextDecoder);
}
