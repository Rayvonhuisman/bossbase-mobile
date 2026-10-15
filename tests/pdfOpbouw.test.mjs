/**
 * De offerte- en factuur-PDF: overgenomen opmaak, afbeeldingen zonder DOM, en
 * de omzetting van databaserijen naar wat de opmaak verwacht.
 *
 * De eerste test is het alarm: wijkt src/lib/pdf/vendored/ af van het
 * dashboard (supabase/functions/_shared/ op HEAD), dan faalt hij. Bijwerken met
 * `node scripts/pdf-opbouw-overnemen.mjs`. Staat de dashboardrepo niet op deze
 * machine (CI), dan wordt hij overgeslagen — met een melding, niet stil.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  VENDOR_BESTANDEN,
  VENDOR_MAP_DASHBOARD,
  commitUitKop,
  dashboardRepo,
  zonderKop,
} from '../scripts/pdf-opbouw-bron.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const vendorMap = join(hier, '../src/lib/pdf/vendored');
const repo = dashboardRepo();

const A = await import('../src/lib/pdf/afbeelding.ts');
const D = await import('../src/lib/pdf/pdfData.ts');
const { bouwPdf } = await import('../src/lib/pdf/bouwPdf.ts');
const { omgevingZonderDom } = await import('../src/lib/pdf/omgevingBasis.ts');
const { jsPDF } = await import('jspdf');

// ── 1. Overgenomen opmaak gelijk aan het dashboard ─────────────────────────

test('vendored PDF-opmaak is gelijk aan het dashboard (HEAD)', (t) => {
  if (!repo) {
    t.skip('dashboardrepo niet gevonden (zet BOSSBASE_DASHBOARD); vergelijking overgeslagen');
    return;
  }
  for (const naam of VENDOR_BESTANDEN) {
    const lokaal = readFileSync(join(vendorMap, naam), 'utf8');
    assert.ok(commitUitKop(lokaal), `${naam}: kop met dashboardcommit ontbreekt`);
    const dashboard = execFileSync('git', ['-C', repo, 'show', `HEAD:${VENDOR_MAP_DASHBOARD}/${naam}`], {
      encoding: 'utf8',
    });
    assert.ok(
      zonderKop(lokaal) === dashboard,
      `${naam} wijkt af van het dashboard. Draai: node scripts/pdf-opbouw-overnemen.mjs`,
    );
  }
});

test('vendored bestanden importeren alleen elkaar', () => {
  for (const naam of VENDOR_BESTANDEN) {
    const tekst = readFileSync(join(vendorMap, naam), 'utf8');
    for (const [, spec] of tekst.matchAll(/^import .* from ['"]([^'"]+)['"]/gm)) {
      assert.ok(VENDOR_BESTANDEN.includes(spec.replace(/^\.\//, '')), `${naam} importeert ${spec}; neem dat ook over`);
    }
  }
});

// ── 2. Afbeeldingen zonder DOM ─────────────────────────────────────────────

function png(w, h) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bitdiepte
  ihdr[9] = 6; // RGBA
  const rij = Buffer.alloc(1 + w * 4, 0);
  for (let x = 0; x < w; x++) rij.writeUInt32BE(x % 2 ? 0x14161cff : 0x00000000, 1 + x * 4);
  const ruw = Buffer.concat(Array.from({ length: h }, () => rij));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(ruw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('base64 van bytes is gelijk aan Buffer, voor elke restlengte', () => {
  for (let n = 0; n < 40; n++) {
    const b = Uint8Array.from({ length: n * 997 + n }, (_, i) => (i * 31 + n) & 255);
    assert.equal(A.bytesNaarBase64(b), Buffer.from(b).toString('base64'));
  }
});

test('afmetingen uit de bestandskop: PNG, JPEG, GIF, WebP', () => {
  assert.deepEqual(A.afmetingenUitBytes(new Uint8Array(png(321, 77))), { w: 321, h: 77 });

  // JPEG met een APP0-segment vóór de SOF0.
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0),
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, ...Array(12).fill(0),
  ]);
  assert.deepEqual(A.afmetingenUitBytes(jpeg), { w: 600, h: 300 });

  const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00]);
  assert.deepEqual(A.afmetingenUitBytes(gif), { w: 320, h: 240 });

  const webpX = new Uint8Array(30);
  webpX.set([0x52, 0x49, 0x46, 0x46], 0);
  webpX.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8);
  webpX.set([799 & 255, 799 >> 8, 0, 449 & 255, 449 >> 8, 0], 24);
  assert.deepEqual(A.afmetingenUitBytes(webpX), { w: 800, h: 450 });

  assert.equal(A.afmetingenUitBytes(Uint8Array.from([1, 2, 3])), null);
});

test('bereidZonderCanvas: zelfde maat op papier als het dashboard', () => {
  const url = `data:image/png;base64,${png(1000, 200).toString('base64')}`;
  const r = A.bereidZonderCanvas(url, 55, 20);
  // min(55/1000, 20/200) = 0.055 → 55 × 11 mm
  assert.equal(r.formaat, 'PNG');
  assert.ok(Math.abs(r.breedte - 55) < 1e-9 && Math.abs(r.hoogte - 11) < 1e-9);
  assert.equal(r.dataUrl, url);
  assert.equal(A.bereidZonderCanvas(null, 55, 20), null);
});

// ── 3. Omzettingen zoals het dashboard ─────────────────────────────────────

test('offerte: btw 0 wordt 21 (|| 21), regel zonder percentage blijft null', () => {
  const o = D.naarOfferte({ id: 'o1', company_id: 'c', nummer: 'BB-1', btw_pct: 0, created_at: '2026-01-01' });
  assert.equal(o.btwPct, 21);
  assert.equal(o.notes, '');
  const i = D.naarOfferteItem({ id: 'i', omschrijving: 'x', btw_pct: null, aantal: 0 });
  assert.equal(i.btwPct, null);
  assert.equal(i.aantal, 1);
  // regimeVanPct(null) → Number(null) = 0 → vrijgesteld. Zo doet het dashboard het ook.
  assert.equal(i.btwRegime, 'vrijgesteld');
});

test('factuurregel: btw ?? 21, type standaard stuks; klant zonder naam heet Naamloos', () => {
  const r = D.naarFactuurRegel({ id: 'r', btw_pct: 0, btw_regime: 'verlegd' });
  assert.equal(r.btwPct, 0);
  assert.equal(r.type, 'stuks');
  assert.equal(D.naarKlant({ id: 'k', name: '  ' }).name, 'Naamloos');
});

test('bedrijf: bevroren gegevens gaan voor, IBAN valt terug op het huidige', () => {
  const live = D.naarBedrijf({ id: 'c', name: 'Nu', iban: 'NL01', branding_color: null });
  assert.equal(live.brandingColor, '#1DDB62');
  const f = D.naarFactuur({ id: 'f', company_id: 'c', snapshot_bedrijfsnaam: 'Toen', snapshot_iban: null });
  const b = D.bedrijfVoorDocument(f, live);
  assert.equal(b.name, 'Toen');
  assert.equal(b.iban, 'NL01');
  const zonder = D.naarFactuur({ id: 'f', company_id: 'c' });
  assert.equal(D.bedrijfVoorDocument(zonder, live), live);
});

test('bestandsnamen en geïmporteerde facturen', () => {
  assert.equal(D.bestandsnaamVoor('offerte', 'BB-7'), 'BB-7.pdf');
  assert.equal(D.bestandsnaamVoor('offerte', ''), 'offerte.pdf');
  assert.equal(D.bestandsnaamVoor('factuur', 'BB-F7'), 'Factuur-BB-F7.pdf');
  assert.equal(D.isGeimporteerdeFactuur({ externeReferentie: null, status: 'geboekt' }), true);
  assert.equal(D.isGeimporteerdeFactuur({ externeReferentie: null, status: 'verzonden' }), false);
});

// ── 4. Opbouw: zelfde PDF als het dashboard ────────────────────────────────

/** jsPDF met vaste datum en id, zodat twee PDF's byte voor byte te vergelijken zijn. */
class VasteJsPDF extends jsPDF {
  constructor(o) {
    super(o);
    this.setCreationDate('D:20261015120000+02\'00\'');
    this.setFileId('00000000000000000000000000000000');
  }
}

const handtekening = `data:image/png;base64,${png(300, 100).toString('base64')}`;
const nepClient = { functions: { invoke: async () => ({ data: null, error: new Error('offline') }) } };

function offerteInvoer() {
  const document = {
    ...D.naarOfferte({
      id: 'o1', company_id: 'c', nummer: 'BB-042', btw_pct: 21, created_at: '2026-10-01T10:00:00Z',
      geldig_tot: '2026-11-01', signed_at: '2026-10-02T22:30:00Z', signed_by_name: 'Jan Klant',
      signed_by_email: 'jan@example.nl',
    }),
    signatureDataUrl: handtekening,
  };
  const regels = Array.from({ length: 30 }, (_, i) =>
    D.naarOfferteItem({
      id: `i${i}`, omschrijving: `Regel ${i + 1} met een omschrijving`, aantal: 2.5, prijs_per: 40,
      subtotaal: 100, btw_pct: i % 3 ? 21 : 9, volgorde: i,
    }));
  return {
    soort: 'offerte', document, regels,
    customer: D.naarKlant({ id: 'k', name: 'Klant BV', address: 'Straat 1', postcode: '1234 AB', city: 'Utrecht', btw_number: 'NL0B01' }),
    company: D.naarBedrijf({ id: 'c', name: 'Bouw BV', address: 'Weg 2', postal_code: '9999 ZZ', city: 'Zwolle', kvk: '123', branding_color: '#2255aa' }),
    bestandsnaam: 'BB-042.pdf',
  };
}

test('bouwPdf: meerdere pagina\'s, handtekening erin, base64 klopt met de bytes', async () => {
  const r = await bouwPdf(offerteInvoer(), omgevingZonderDom(nepClient, 'https://x.supabase.co'), VasteJsPDF);
  assert.ok(r.paginas >= 2, `verwacht ≥ 2 pagina's, kreeg ${r.paginas}`);
  assert.equal(r.base64, Buffer.from(r.bytes).toString('base64'));
  const tekst = Buffer.from(r.bytes).toString('latin1');
  assert.match(tekst, /^%PDF-1\.3/);
  assert.match(tekst, /\/Subtype \/Image/);
  assert.match(tekst, /Pagina 1 van/);
});

test('bouwPdf geeft byte voor byte dezelfde PDF als de opmaak uit het dashboard', async (t) => {
  if (!repo) {
    t.skip('dashboardrepo niet gevonden; vergelijking overgeslagen');
    return;
  }
  const dash = await import(pathToFileURL(join(repo, VENDOR_MAP_DASHBOARD, 'pdfOpbouw.js')).href);
  const omgeving = omgevingZonderDom(nepClient, 'https://x.supabase.co');
  const app = await bouwPdf(offerteInvoer(), omgeving, VasteJsPDF);

  const doc = new VasteJsPDF({ unit: 'mm', format: 'a4' });
  const inv = offerteInvoer();
  await dash.buildPdf(doc, 'offerte', inv.document, inv.regels, inv.customer, inv.company, omgeving);
  const dashboard = new Uint8Array(doc.output('arraybuffer'));
  assert.equal(Buffer.compare(Buffer.from(app.bytes), Buffer.from(dashboard)), 0);
});
