/**
 * Materialen importeren uit een CSV: de kopregel en de kolommen herkennen,
 * bedragen lezen, en dubbele materialen vinden. Letterlijk naar
 * `src/lib/materiaalImport.js` van het dashboard (zonder Excel: daarvoor
 * gebruikt het dashboard exceljs, en dat is te zwaar voor de app). Een PDF of
 * foto gaat naar de edge function `materialen-uitlezen`, die regels in
 * hetzelfde formaat teruggeeft.
 *
 * Geen netwerk en geen React: tests/offerteCalculatie.test.mjs.
 */
import { EENHEDEN } from './werkbonLogica';

export type ImportVeld = 'naam' | 'artikelnummer' | 'eenheid' | 'inkoopprijs' | 'verkoopprijs' | 'btwPct';
export type KolomMap = Partial<Record<ImportVeld, number>>;

export const VELDEN: { key: ImportVeld; label: string }[] = [
  { key: 'naam', label: 'Naam' },
  { key: 'artikelnummer', label: 'Artikelnummer' },
  { key: 'eenheid', label: 'Eenheid' },
  { key: 'inkoopprijs', label: 'Inkoopprijs' },
  { key: 'verkoopprijs', label: 'Verkoopprijs' },
  { key: 'btwPct', label: 'BTW' },
];

/** Eén regel in het controlescherm (uit een CSV of van de edge function). */
export type ImportRegel = {
  naam: string;
  artikelnummer: string;
  eenheid: string;
  inkoopprijs: number | null;
  verkoopprijs: number | null;
  btwPct: number | null;
  twijfel?: boolean;
  twijfelReden?: string;
};

export type BestaandMateriaal = {
  id: string;
  naam: string;
  artikelnummer: string | null;
  inkoopprijs: number | null;
  verkoopprijs: number | null;
};

// ── CSV ─────────────────────────────────────────────────────────────────────
// Scheidingsteken ; , of tab (wat het vaakst voorkomt), quotes, BOM. Dezelfde
// lezer als `csvRijen` in het dashboard (supabase/functions/_shared/metingKolommen.js).
export function leesCsv(tekst: string): string[][] {
  const regels = String(tekst || '').replace(/^﻿/, '').split(/\r?\n/);
  const proef = regels.slice(0, 10).join('\n');
  const tellen = (t: string) => (proef.match(new RegExp(t === '\t' ? '\t' : `\\${t}`, 'g')) || []).length;
  const sep = [';', '\t', ','].map((t) => [t, tellen(t)] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rijen: string[][] = [];
  for (const regel of regels) {
    if (!regel.trim()) continue;
    const cellen: string[] = [];
    let cel = '';
    let inQuote = false;
    for (let i = 0; i < regel.length; i++) {
      const c = regel[i];
      if (c === '"') {
        if (inQuote && regel[i + 1] === '"') {
          cel += '"';
          i++;
        } else inQuote = !inQuote;
      } else if (c === sep && !inQuote) {
        cellen.push(cel);
        cel = '';
      } else cel += c;
    }
    cellen.push(cel);
    rijen.push(cellen.map((x) => x.trim()));
  }
  return rijen;
}

// Windows-1252 voor 0x80–0x9F; de rest is Latin-1.
const CP1252 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

/** Strikte UTF-8; null bij een ongeldige reeks. Zelf, want Hermes kent niet elke TextDecoder. */
function utf8(bytes: Uint8Array): string | null {
  let uit = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    let cp: number;
    let n: number;
    if (b < 0x80) {
      cp = b;
      n = 0;
    } else if (b >= 0xc2 && b < 0xe0) {
      cp = b & 0x1f;
      n = 1;
    } else if (b >= 0xe0 && b < 0xf0) {
      cp = b & 0x0f;
      n = 2;
    } else if (b >= 0xf0 && b < 0xf5) {
      cp = b & 0x07;
      n = 3;
    } else return null;
    if (i + n >= bytes.length + (n ? 0 : 1)) return null;
    for (let k = 1; k <= n; k++) {
      const v = bytes[i + k];
      if (v === undefined || (v & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (v & 0x3f);
    }
    if ((n === 2 && cp < 0x800) || (n === 3 && (cp < 0x10000 || cp > 0x10ffff)) || (cp >= 0xd800 && cp <= 0xdfff)) {
      return null;
    }
    uit += String.fromCodePoint(cp);
    i += n + 1;
  }
  return uit;
}

/**
 * Tekst uit de bytes van een CSV: UTF-8, anders Windows-1252 (Excel op Windows
 * slaat "Opslaan als CSV" zo op, en dan worden ² en é anders onleesbaar).
 */
export function csvTekstUitBytes(bytes: Uint8Array): string {
  const u = utf8(bytes);
  if (u != null) return u;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b >= 0x80 && b < 0xa0 ? CP1252[b - 0x80]! : b);
  return s;
}

// ── Kolommen herkennen ──────────────────────────────────────────────────────
const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[._/\\()[\]:#%€-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

type Herkend = ImportVeld | 'nummer' | 'prijs';

// Per kop het veld. Volgorde telt: artikelnummer vóór naam ("artikel" is een
// naam, "artikelnummer" niet), prijzen vóór btw ("prijs excl btw" is een prijs).
const HERKEN: [Herkend, RegExp][] = [
  [
    'artikelnummer',
    /^(art ?nr|artikel ?(nr|nummer|code)|art ?nummer|artikelnr|artikelcode|productcode|product ?nr|item ?(code|nr)|sku|bestel ?(nummer|nr|code)|referentie|leveranciers? ?(code|nr|nummer))$/,
  ],
  // Algemeen ("Nr", "Code"): alleen als er geen duidelijke artikelnummerkolom is.
  ['nummer', /^(nr|nummer|code|ref|art)$/],
  ['verkoopprijs', /(verkoop|bruto|advies|consument|lijstprijs|catalogus|winkelprijs|retail|vkp)/],
  ['inkoopprijs', /(inkoop|netto|kostprijs|uw prijs|ink prijs|ikp|nettoprijs)/],
  ['prijs', /(^|\s)(prijs|price|bedrag|tarief|stukprijs|eenheidsprijs|prijs per stuk)(\s|$)/],
  ['btwPct', /^(btw|vat|btw ?tarief|btw ?percentage|btw ?perc|btw code|tax)$/],
  ['eenheid', /(^|\s)(eenheid|eh|unit|uom|besteleenheid|prijseenheid|verpakkingseenheid|per)(\s|$)/],
  [
    'naam',
    /(^|\s)(naam|omschrijving|artikel|artikelomschrijving|artikelnaam|product|productnaam|benaming|description|omschr|materiaal|item|titel)(\s|$)/,
  ],
];

export function herkenKop(cel: unknown): Herkend | null {
  const s = norm(cel);
  if (!s) return null;
  for (const [veld, re] of HERKEN) if (re.test(s)) return veld;
  // Aan elkaar geschreven: "artikelomschrijving", "nettoprijs", "inkoopprijs".
  if (/omschrijving|naam$/.test(s)) return 'naam';
  if (/prijs$/.test(s)) return 'prijs';
  return null;
}

/**
 * { veld: kolomindex } uit één kopregel. Een losse "prijs" wordt de
 * inkoopprijs als er geen inkoopkolom is, anders de verkoopprijs.
 */
export function koppelKolommen(kop: unknown[]): KolomMap {
  const map: KolomMap & { nummer?: number } = {};
  const prijzen: number[] = [];
  kop.forEach((cel, i) => {
    const veld = herkenKop(cel);
    if (!veld) return;
    if (veld === 'prijs') {
      prijzen.push(i);
      return;
    }
    if (veld === 'nummer') {
      if (map.nummer === undefined) map.nummer = i;
      return;
    }
    if (map[veld] === undefined) map[veld] = i;
  });
  if (map.artikelnummer === undefined && map.nummer !== undefined) map.artikelnummer = map.nummer;
  delete map.nummer;
  for (const i of prijzen) {
    if (map.inkoopprijs === undefined) map.inkoopprijs = i;
    else if (map.verkoopprijs === undefined) map.verkoopprijs = i;
  }
  return map;
}

/** De kopregel: de eerste van de eerste vijftien rijen met een naam- én een prijskolom. */
export function vindKop(rijen: unknown[][]): { kopIndex: number; map: KolomMap } | null {
  for (let k = 0; k < Math.min(rijen.length, 15); k++) {
    const map = koppelKolommen(rijen[k]!);
    if (map.naam !== undefined && (map.inkoopprijs !== undefined || map.verkoopprijs !== undefined)) {
      return { kopIndex: k, map };
    }
  }
  return rijen.length ? { kopIndex: 0, map: koppelKolommen(rijen[0]!) } : null;
}

// ── Waarden lezen ───────────────────────────────────────────────────────────
/** "€ 1.234,56", "1234.56", "12,5", "1,234.56", "12,50 /st". Null als het geen bedrag is. */
export function leesBedrag(cel: unknown): number | null {
  if (cel == null || cel === '') return null;
  if (typeof cel === 'number') return Number.isFinite(cel) && cel >= 0 ? Math.round(cel * 10000) / 10000 : null;
  let s = String(cel).replace(/ /g, ' ').trim();
  s = s
    .replace(/^(eur|€)\s*/i, '')
    .replace(/\s*(eur|€)$/i, '')
    .replace(/\s*(\/|per\s).*$/i, '')
    .replace(/,-$/, '')
    .replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const komma = s.lastIndexOf(',');
  const punt = s.lastIndexOf('.');
  if (komma > -1 && punt > -1) {
    // Het laatste teken is het decimaalteken.
    s = komma > punt ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (komma > -1) {
    // "1,250" is in een Nederlandse prijslijst bijna altijd 1,25; meerdere komma's: duizendtallen.
    s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (punt > -1 && ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s))) {
    // "1.250" of "1.250.000": duizendtallen.
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 10000) / 10000 : null;
}

/** 21, "21%", "0,21", "hoog", "laag", "9 %", "vrij". Null als onbekend. */
export function leesBtw(cel: unknown): number | null {
  if (cel == null || cel === '') return null;
  const s = norm(cel);
  if (/^(hoog|h|standaard)$/.test(s)) return 21;
  if (/^(laag|l)$/.test(s)) return 9;
  if (/^(0|nul|vrij|geen|verlegd|v)$/.test(s)) return 0;
  const n = typeof cel === 'number' ? cel : Number(s.replace(',', '.').replace(/\s/g, ''));
  if (!Number.isFinite(n)) return null;
  const pct = n > 0 && n < 1 ? Math.round(n * 100) : Math.round(n);
  return [0, 9, 21].includes(pct) ? pct : null;
}

const EENHEID_MAP: [RegExp, string][] = [
  [/^(st|stk|stuk|stuks|pcs|pc|piece|ea|each|x)$/, 'stuk'],
  [/^(m|m1|mtr|meter|lm|str m|strekkende meter)$/, 'm'],
  [/^(m2|m²|vierkante meter)$/, 'm²'],
  [/^(m3|m³|kuub)$/, 'm³'],
  [/^(kg|kilo|kilogram)$/, 'kg'],
  [/^(l|ltr|liter|litre)$/, 'liter'],
  [/^(u|uur|hr|hour)$/, 'uur'],
  [/^(rol|rollen)$/, 'rol'],
  [/^(ds|doos|dozen|box)$/, 'doos'],
  [/^(zak|zakken)$/, 'zak'],
  [/^(pak|pakken|pk)$/, 'pak'],
  [/^(set|sets)$/, 'set'],
  [/^(emmer|emmers)$/, 'emmer'],
  [/^(plaat|platen)$/, 'plaat'],
];
/** Eenheid op de schrijfwijze van de app, of zoals hij er stond. */
export function leesEenheid(cel: unknown): string {
  const ruw = String(cel ?? '').replace(/\s+/g, ' ').trim();
  if (!ruw) return '';
  const s = ruw.toLowerCase().replace(/^per\s+/, '').replace(/\.$/, '');
  for (const [re, e] of EENHEID_MAP) if (re.test(s)) return e;
  return (EENHEDEN as readonly string[]).includes(s) ? s : ruw.slice(0, 30);
}

const tekst = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** De regels uit een blad, met een kolomtoewijzing. Regels zonder naam vallen weg, net als tussenkopjes. */
export function regelsUitRijen(rijen: unknown[][], kopIndex: number, map: KolomMap): ImportRegel[] {
  const uit: ImportRegel[] = [];
  const cel = (rij: unknown[], veld: ImportVeld) => (map[veld] == null ? undefined : rij[map[veld]!]);
  for (const rij of rijen.slice(kopIndex + 1)) {
    const naam = tekst(cel(rij, 'naam')).slice(0, 200);
    if (!naam) continue;
    const inkoopprijs = leesBedrag(cel(rij, 'inkoopprijs'));
    const verkoopprijs = leesBedrag(cel(rij, 'verkoopprijs'));
    if (inkoopprijs == null && verkoopprijs == null && /totaal|subtotaal|btw/i.test(naam)) continue;
    uit.push({
      naam,
      artikelnummer: tekst(cel(rij, 'artikelnummer')).slice(0, 100),
      eenheid: leesEenheid(cel(rij, 'eenheid')),
      inkoopprijs,
      verkoopprijs,
      btwPct: leesBtw(cel(rij, 'btwPct')),
      twijfel: inkoopprijs == null && verkoopprijs == null,
      twijfelReden: inkoopprijs == null && verkoopprijs == null ? 'Geen prijs gevonden.' : '',
    });
  }
  return uit;
}

/** Verkoopprijs = inkoopprijs + pct% opslag, op centen. */
export const metOpslag = (inkoop: number | null | undefined, pct: number) =>
  inkoop == null || !Number.isFinite(Number(pct)) ? null : Math.round(inkoop * (1 + Number(pct) / 100) * 100) / 100;

// ── Dubbele materialen ──────────────────────────────────────────────────────
const sleutelNr = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, '').trim();
const sleutelNaam = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Per regel: `bestaand` (bijwerken) of null (nieuw), en `dubbel` als een
 * eerdere regel in hetzelfde bestand al hetzelfde materiaal is. Eerst op
 * artikelnummer, anders op exact dezelfde naam (hoofdletters tellen niet).
 */
export function koppelBestaand<R extends ImportRegel>(
  regels: R[],
  bestaande: BestaandMateriaal[],
): (R & { bestaand: BestaandMateriaal | null; dubbel: boolean })[] {
  const opNr = new Map<string, BestaandMateriaal>();
  const opNaam = new Map<string, BestaandMateriaal>();
  for (const m of bestaande) {
    const nr = sleutelNr(m.artikelnummer);
    if (nr && !opNr.has(nr)) opNr.set(nr, m);
    const nm = sleutelNaam(m.naam);
    if (nm && !opNaam.has(nm)) opNaam.set(nm, m);
  }
  const gezien = new Set<string>();
  return regels.map((r) => {
    const nr = sleutelNr(r.artikelnummer);
    const nm = sleutelNaam(r.naam);
    const bestaand = (nr && opNr.get(nr)) || opNaam.get(nm) || null;
    const sleutel = bestaand ? `id:${bestaand.id}` : nr ? `nr:${nr}` : `naam:${nm}`;
    const dubbel = gezien.has(sleutel);
    gezien.add(sleutel);
    return { ...r, bestaand, dubbel };
  });
}

/** Verandert er iets aan een bestaand materiaal? (Lege prijzen laten de bestaande staan.) */
export function wijzigtIets(r: ImportRegel & { bestaand: BestaandMateriaal | null }): boolean {
  if (!r.bestaand) return true;
  const anders = (nieuw: number | null, oud: number | null) =>
    nieuw != null && Math.round(nieuw * 100) !== Math.round((oud ?? -1) * 100);
  return anders(r.inkoopprijs, r.bestaand.inkoopprijs) || anders(r.verkoopprijs, r.bestaand.verkoopprijs);
}

/** Soort bestand uit de eerste bytes (zoals de edge function), anders uit de naam. */
export function soortVanBestand(bytes: Uint8Array, naam: string, mime: string | null): 'csv' | 'pdf' | 'foto' | 'xlsx' | 'xls' | 'heic' | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return 'pdf';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'foto';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'foto';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45) return 'foto';
  const ext = (naam.split('.').pop() || '').toLowerCase();
  if (ext === 'xlsx' || /spreadsheetml/.test(mime || '')) return 'xlsx';
  if (ext === 'xls') return 'xls';
  if (['heic', 'heif'].includes(ext) || /heic|heif/.test(mime || '')) return 'heic';
  if (['csv', 'txt'].includes(ext) || /^text\/(csv|plain)/.test(mime || '')) return 'csv';
  return null;
}
