/**
 * PDF's op iOS/Android: de TextDecoder van Expo kent alleen UTF-8, en fast-png
 * (via jsPDF) vraagt bij het laden om `new TextDecoder('latin1')`. Op een
 * iPhone sloot de app daardoor af bij "Bekijken" (27-10-2026, build 0.2.0 (5)).
 *
 * Dit bestand bootst die omgeving na vóórdat jsPDF of fast-png geladen wordt:
 * node --test draait elk testbestand in een eigen proces, dus de nagebootste
 * TextDecoder raakt de andere tests niet.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { deflateSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const NodeDecoder = globalThis.TextDecoder;

// Zoals expo/src/winter/TextDecoder.ts: alleen UTF-8-labels, verder RangeError.
const UTF8 = ['unicode-1-1-utf-8', 'unicode11utf8', 'unicode20utf8', 'utf-8', 'utf8', 'x-unicode20utf8'];
class AlleenUtf8Decoder extends NodeDecoder {
  constructor(label = 'utf-8', opties) {
    const n = String(label).trim().toLowerCase();
    if (!UTF8.includes(n)) throw new RangeError(`Unknown encoding: ${label} (normalized: ${n})`);
    super(label, opties);
  }
}
const IOS_DECODER_BRON = `
  const N = globalThis.TextDecoder;
  const U = ${JSON.stringify(UTF8)};
  globalThis.TextDecoder = class extends N {
    constructor(l = 'utf-8', o) {
      const n = String(l).trim().toLowerCase();
      if (!U.includes(n)) throw new RangeError('Unknown encoding: ' + l + ' (normalized: ' + n + ')');
      super(l, o);
    }
  };`;
globalThis.TextDecoder = AlleenUtf8Decoder;

const L = await import('../src/lib/pdf/latin1Decoder.ts');
const J = await import('../src/lib/pdf/jspdf.ts');
const D = await import('../src/lib/pdf/pdfData.ts');
const { bouwPdf } = await import('../src/lib/pdf/bouwPdf.ts');
const { omgevingZonderDom } = await import('../src/lib/pdf/omgevingBasis.ts');

// ── PNG's maken, met en zonder alpha, met een tEXt-chunk in latin1 ─────────

const LATIN1_TEKST = Buffer.concat([
  Buffer.from('Café Ruïne, coöperatie ', 'latin1'),
  Buffer.from([0x80, 0x20]), // € in windows-1252
  Buffer.from('1.234,56, ', 'latin1'),
  Buffer.from([0x92]), // ’ in windows-1252
  Buffer.from('s-Hertogenbosch, IJsselstein', 'latin1'),
]);
const LATIN1_VERWACHT = 'Café Ruïne, coöperatie € 1.234,56, ’s-Hertogenbosch, IJsselstein';

function png(w, h, { alpha = true, tekst = null } = {}) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const kanalen = alpha ? 4 : 3;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2; // RGBA of RGB
  const rij = Buffer.alloc(1 + w * kanalen, 0);
  for (let x = 0; x < w; x++) {
    rij[1 + x * kanalen] = x % 2 ? 0x22 : 0xee;
    rij[2 + x * kanalen] = 0x55;
    rij[3 + x * kanalen] = 0xaa;
    if (alpha) rij[4 + x * kanalen] = x % 3 ? 0xff : 0x40;
  }
  const ruw = Buffer.concat(Array.from({ length: h }, () => rij));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(tekst ? [chunk('tEXt', Buffer.concat([Buffer.from('Comment'), Buffer.from([0]), tekst]))] : []),
    chunk('IDAT', deflateSync(ruw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 1. Het probleem zelf ───────────────────────────────────────────────────

test('nagebootste iOS-omgeving: zonder terugval faalt fast-png al bij het laden', () => {
  const script = `${IOS_DECODER_BRON}
    try { require('fast-png'); console.log('GELADEN'); }
    catch (e) { console.log(e.name + ': ' + e.message); }`;
  const uit = execFileSync(process.execPath, ['-e', script], { cwd: join(hier, '..'), encoding: 'utf8' }).trim();
  assert.equal(uit, 'RangeError: Unknown encoding: latin1 (normalized: latin1)');
});

test('nagebootste iOS-omgeving: met de terugval laadt fast-png wel', () => {
  // Zelfde volgorde als laadJsPDF: eerst de terugval, dan pas het pakket.
  const script = `${IOS_DECODER_BRON}
    import('./src/lib/pdf/latin1Decoder.ts').then((L) => {
      console.log(L.zorgVoorLatin1Decoder());
      require('fast-png');
      console.log('GELADEN');
    }).catch((e) => console.log(e.name + ': ' + e.message));`;
  const uit = execFileSync(process.execPath, ['-e', script], { cwd: join(hier, '..'), encoding: 'utf8' }).trim();
  assert.equal(uit, 'true\nGELADEN');
});

// ── 2. De decoder ──────────────────────────────────────────────────────────

test('terugval wordt alleen geïnstalleerd als latin1 ontbreekt; utf-8 blijft de originele decoder', () => {
  assert.throws(() => new globalThis.TextDecoder('latin1'), /Unknown encoding: latin1/);
  assert.equal(L.zorgVoorLatin1Decoder(), true);
  assert.notEqual(globalThis.TextDecoder, AlleenUtf8Decoder);
  const utf8 = new globalThis.TextDecoder('utf-8');
  assert.ok(utf8 instanceof AlleenUtf8Decoder, 'utf-8 gaat naar de oorspronkelijke decoder');
  assert.equal(utf8.decode(Buffer.from('coöperatie €', 'utf8')), 'coöperatie €');
  assert.equal(new globalThis.TextDecoder().decode(Buffer.from('ïë', 'utf8')), 'ïë');
  assert.throws(() => new globalThis.TextDecoder('koi8-r'), RangeError);
  // Een tweede keer doet niets meer.
  const nu = globalThis.TextDecoder;
  assert.equal(L.zorgVoorLatin1Decoder(), true);
  assert.equal(globalThis.TextDecoder, nu);
});

test('latin1 decodeert alle 256 bytes precies zoals de browser/Node (WHATWG windows-1252)', () => {
  const alle = Uint8Array.from({ length: 256 }, (_, i) => i);
  const referentie = new NodeDecoder('latin1').decode(alle);
  for (const label of ['latin1', 'LATIN1', ' iso-8859-1 ', 'ascii', 'us-ascii', 'windows-1252', 'cp1252', 'l1']) {
    const d = new globalThis.TextDecoder(label);
    assert.equal(d.encoding, 'windows-1252');
    assert.equal(d.decode(alle), referentie, label);
  }
  const d = new globalThis.TextDecoder('latin1');
  assert.equal(d.decode(Buffer.from('é ë ï ö ü ç', 'latin1')), 'é ë ï ö ü ç');
  assert.equal(d.decode(Uint8Array.of(0x80, 0x91, 0x92, 0x93, 0x94)), '€‘’“”');
  // Ook ArrayBuffer, DataView, een deel van een buffer, streamen en leeg.
  const bytes = Buffer.from('xxCafé xx', 'latin1');
  const deel = new Uint8Array(bytes.buffer, bytes.byteOffset + 2, 5);
  assert.equal(d.decode(deel), 'Café ');
  assert.equal(d.decode(new DataView(deel.buffer, deel.byteOffset, deel.byteLength)), 'Café ');
  assert.equal(d.decode(Uint8Array.from(deel).buffer), 'Café ');
  assert.equal(d.decode(deel, { stream: true }) + d.decode(), 'Café ');
  assert.equal(d.decode(), '');
  // Lang genoeg om de stukken van 4096 te raken.
  const lang = Uint8Array.from({ length: 10000 }, (_, i) => i & 255);
  assert.equal(d.decode(lang), new NodeDecoder('latin1').decode(lang));
});

test('fast-png leest tEXt in latin1 met de terugval (het pad van fast-png zelf)', async () => {
  const { decode } = await import('fast-png');
  const r = decode(png(4, 3, { tekst: LATIN1_TEKST }));
  assert.equal(r.width, 4);
  assert.equal(r.text.Comment, LATIN1_VERWACHT);
});

// ── 3. laadJsPDF en een echte offerte-PDF ──────────────────────────────────

test('laadJsPDF werkt in de nagebootste iOS-omgeving en geeft de jsPDF-klasse', async () => {
  const K = await J.laadJsPDF();
  assert.equal(typeof K, 'function');
  assert.equal(await J.laadJsPDF(), K, 'tweede keer uit het geheugen');
});

test('de ES-build van jsPDF (die Metro in de app bundelt) laadt en plaatst een PNG met tEXt', async () => {
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const url = `data:image/png;base64,${png(120, 40, { tekst: LATIN1_TEKST }).toString('base64')}`;
  doc.addImage(url, 'PNG', 10, 10, 60, 20);
  doc.text('Café Ruïne', 10, 40);
  const tekst = Buffer.from(doc.output('arraybuffer')).toString('latin1');
  assert.match(tekst, /\/Subtype \/Image/);
  assert.match(tekst, /\(Café Ruïne\) Tj/);
});

const LOGO_URL = 'https://logo.test/logo.png';
const HANDTEKENING_URL = 'https://logo.test/handtekening.png';
const nepClient = { functions: { invoke: async () => ({ data: null, error: new Error('offline') }) } };

function offerteInvoer() {
  const document = D.naarOfferte({
    id: 'o1', company_id: 'c', nummer: 'BB-099', btw_pct: 21, created_at: '2026-10-27T10:00:00Z',
    geldig_tot: '2026-11-27', omschrijving: 'Café Ruïne, coöperatie',
    signed_at: '2026-10-27T12:00:00Z', signed_by_name: 'Jan ’t Hart', signature_url: HANDTEKENING_URL,
  });
  const regels = [
    D.naarOfferteItem({ id: 'i1', omschrijving: 'Tegels zetten in de keuken (ë, ï, ö, ü, ç, é)', aantal: 1, prijs_per: 1234.56, subtotaal: 1234.56, btw_pct: 21, volgorde: 0 }),
    D.naarOfferteItem({ id: 'i2', omschrijving: 'Voorrijkosten ’s-Hertogenbosch – IJsselstein', aantal: 1, prijs_per: 1, subtotaal: 1, btw_pct: 9, volgorde: 1 }),
  ];
  return {
    soort: 'offerte', document, regels,
    customer: D.naarKlant({ id: 'k', name: 'APP-TEST – Café Ruïne', address: 'Coöperatiestraat 1', postcode: '5211 AB', city: '’s-Hertogenbosch' }),
    company: D.naarBedrijf({ id: 'c', name: 'Bouwbedrijf IJsselstein', address: 'Weg 2', postal_code: '3401 AA', city: 'IJsselstein', kvk: '123', branding_color: '#2255aa', logo_url: LOGO_URL }),
    bestandsnaam: 'BB-099.pdf',
  };
}

async function metNepFetch(bestanden, fn) {
  const echt = globalThis.fetch;
  const opgehaald = [];
  globalThis.fetch = async (url) => {
    opgehaald.push(String(url));
    const b = bestanden[String(url)];
    return b ? new Response(b, { status: 200, headers: { 'content-type': 'image/png' } }) : new Response(null, { status: 404 });
  };
  try {
    return { r: await fn(), opgehaald };
  } finally {
    globalThis.fetch = echt;
  }
}

for (const [naam, opties] of [
  ['PNG-logo met alpha en tEXt', { alpha: true, tekst: LATIN1_TEKST }],
  ['PNG-logo zonder alpha', { alpha: false, tekst: LATIN1_TEKST }],
]) {
  test(`offerte-PDF in nagebootste iOS-omgeving: ${naam}, Nederlandse tekens`, async () => {
    const JsPDF = await J.laadJsPDF();
    const { r, opgehaald } = await metNepFetch(
      { [LOGO_URL]: png(240, 80, opties), [HANDTEKENING_URL]: png(300, 100, { tekst: LATIN1_TEKST }) },
      () => bouwPdf(offerteInvoer(), omgevingZonderDom(nepClient, 'https://x.supabase.co'), JsPDF),
    );
    assert.ok(opgehaald.includes(LOGO_URL), 'logo is opgehaald');
    const tekst = Buffer.from(r.bytes).toString('latin1');
    assert.match(tekst, /^%PDF-1\.3/);
    assert.match(tekst, /%%EOF\s*$/);
    // Logo (en bij alpha een SMask) staat er echt in; addImage faalt in de opmaak stil.
    const plaatjes = tekst.match(/\/Subtype \/Image/g) ?? [];
    assert.ok(plaatjes.length >= 2, `verwacht logo en handtekening, kreeg ${plaatjes.length} afbeelding(en)`);
    if (opties.alpha) assert.match(tekst, /\/SMask/);
    // Standaardlettertypen: tekst in WinAnsi, dus é ï ö ’ als één byte.
    for (const s of ['Café Ruïne', 'Coöperatiestraat', 'IJsselstein', '’s-Hertogenbosch', 'ë, ï, ö, ü, ç, é']) {
      assert.ok(tekst.includes(Buffer.from(s.replace('’', '\x92'), 'latin1').toString('latin1')), `tekst ontbreekt: ${s}`);
    }
    // Bedrag zoals de gedeelde opmaak het schrijft (zonder duizendtallen), met € als WinAnsi 0x80.
    assert.match(tekst, /\(\x80 1234,56\) Tj/);
  });
}

// ── 4. Fout bij het laden: geen afsluiting maar een nette melding ──────────

function nepErrorUtils() {
  const gemeld = [];
  const eu = {
    h: (e, isFatal) => gemeld.push({ e, isFatal }),
    getGlobalHandler() { return this.h; },
    setGlobalHandler(h) { this.h = h; },
    reportFatalError(e) { this.h(e, true); },
    reportError(e) { this.h(e, false); },
  };
  return { eu, gemeld };
}

test('importeerZonderAfsluiten: fatale laadfout zoals Metro die meldt wordt een PdfFout', async () => {
  const { eu, gemeld } = nepErrorUtils();
  const oorspronkelijk = eu.h;
  globalThis.ErrorUtils = eu;
  const waarschuwing = console.warn;
  console.warn = () => {};
  try {
    // Zo gedraagt asyncRequire → guardedLoadModule zich in een release-build:
    // synchroon reportFatalError, daarna een lege module.
    const importeer = () => {
      eu.reportFatalError(new RangeError('Unknown encoding: latin1 (normalized: latin1)'));
      return Promise.resolve({ default: undefined });
    };
    await assert.rejects(J.importeerZonderAfsluiten(importeer), (e) => e instanceof D.PdfFout && /webversie/.test(e.message));
    assert.equal(gemeld.length, 0, 'de app-handler (afsluiten) is niet aangeroepen');
    assert.equal(eu.h, oorspronkelijk, 'oorspronkelijke handler terug');

    // Daarna gaat een fatale fout gewoon weer naar de oorspronkelijke handler.
    eu.reportFatalError(new Error('later'));
    assert.equal(gemeld.length, 1);
  } finally {
    console.warn = waarschuwing;
    delete globalThis.ErrorUtils;
  }
});

test('importeerZonderAfsluiten: gelukte import en niet-fatale meldingen gaan ongewijzigd door', async () => {
  const { eu, gemeld } = nepErrorUtils();
  const oorspronkelijk = eu.h;
  globalThis.ErrorUtils = eu;
  try {
    const mod = await J.importeerZonderAfsluiten(() => {
      eu.reportError(new Error('waarschuwing'));
      return Promise.resolve({ jsPDF: 'klasse' });
    });
    assert.deepEqual(mod, { jsPDF: 'klasse' });
    assert.equal(gemeld.length, 1);
    assert.equal(gemeld[0].isFatal, false);
    assert.equal(eu.h, oorspronkelijk);

    // Gooit de importfunctie zelf, dan ook de handler terug en de fout door.
    await assert.rejects(J.importeerZonderAfsluiten(() => { throw new Error('stuk'); }), /stuk/);
    assert.equal(eu.h, oorspronkelijk);
  } finally {
    delete globalThis.ErrorUtils;
  }
});

test('zonder ErrorUtils (web, Node) is het een gewone import', async () => {
  assert.equal(globalThis.ErrorUtils, undefined);
  assert.deepEqual(await J.importeerZonderAfsluiten(() => Promise.resolve({ a: 1 })), { a: 1 });
});
