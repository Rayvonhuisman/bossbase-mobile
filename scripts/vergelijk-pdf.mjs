#!/usr/bin/env node
/**
 * Vergelijkt de offerte- en factuur-PDF van de app met die van het dashboard,
 * op echte gegevens van het TEST-bedrijf. Alleen-lezen: het script schrijft
 * niets in de database en verstuurt niets.
 *
 *   App:       src/lib/pdf (pdfData → bouwPdf), met de omgeving zonder DOM
 *              die de telefoon gebruikt.
 *   Dashboard: de échte services van het dashboard (getOfferteById,
 *              getOfferteItems, getCustomer, getCompany, getFacturen,
 *              getFactuurRegels, companyForDocument) en generatePdf.js
 *              (buildPdf + browserOmgeving), in Node met een ingelogde client.
 *              FileReader en Image krijgen een kleine Node-vervanger; de
 *              afmetingen komen dan uit fast-png, los van de app-code.
 *
 * Beide met een vaste aanmaakdatum en bestands-id, zodat de PDF's byte voor
 * byte vergelijkbaar zijn. Daarnaast per pagina de tekst (pdf.js, als
 * PDFJS_DIR naar een map met pdfjs-dist wijst) en de content streams.
 *
 * Gebruik:
 *   BB_TEST_EMAIL=… BB_TEST_WACHTWOORD=… [PDFJS_DIR=…] [UIT=map] \
 *     node scripts/vergelijk-pdf.mjs <offerte-id> <factuur-id>
 */
import '../tests/hulp/tsPaden.mjs';
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve as padResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dashboardRepo } from './pdf-opbouw-bron.mjs';

const TEST_BEDRIJF = '7e57c0de-0000-4000-b000-000000000000';
const hier = dirname(fileURLToPath(import.meta.url));
const appRoot = padResolve(hier, '..');
const [offerteId, factuurId] = process.argv.slice(2);
const uitMap = process.env.UIT || join(tmpdir(), 'pdf-vergelijk');
if (!offerteId || !factuurId) {
  console.error('Gebruik: node scripts/vergelijk-pdf.mjs <offerte-id> <factuur-id>');
  process.exit(2);
}
const repo = dashboardRepo();
if (!repo) throw new Error('Dashboardrepo niet gevonden (BOSSBASE_DASHBOARD).');
const dashSrc = join(repo, 'src');

// ── .env lezen (sleutel nooit tonen) ───────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(appRoot, '.env'), 'utf8')
    .split('\n')
    .map((r) => r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '')]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// ── Het dashboard in Node laden ────────────────────────────────────────────
// lib/supabase.js van het dashboard leest Vite-variabelen en maakt zijn eigen
// client; die vervangen we door onze ingelogde client. import.meta.env wordt
// een gewoon object. Importen zonder extensie krijgen .js.
const SHIM = 'bb-shim:supabase';
registerHooks({
  resolve(spec, ctx, next) {
    const ouder = ctx.parentURL?.startsWith('file:') ? fileURLToPath(ctx.parentURL) : null;
    if (ouder?.startsWith(dashSrc) && (spec.startsWith('./') || spec.startsWith('../'))) {
      const pad = padResolve(dirname(ouder), spec);
      if (pad.replace(/\.js$/, '') === join(dashSrc, 'lib/supabase')) return { url: SHIM, shortCircuit: true };
      if (!/\.[cm]?jsx?$/.test(pad)) return next(pathToFileURL(`${pad}.js`).href, ctx);
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url === SHIM) {
      return { format: 'module', shortCircuit: true, source: 'export const supabase = globalThis.__bbSupabase; export const isDemo = false;' };
    }
    if (url.startsWith('file:') && fileURLToPath(url).startsWith(dashSrc)) {
      const bron = readFileSync(fileURLToPath(url), 'utf8').replace(/import\.meta\.env/g, 'globalThis.__viteEnv');
      return { format: 'module', shortCircuit: true, source: bron };
    }
    return next(url, ctx);
  },
});
globalThis.__viteEnv = { VITE_SUPABASE_URL: URL_, DEV: false, PROD: true };

const dashRequire = createRequire(join(repo, 'package.json'));
const { decode: pngDecode } = await import(pathToFileURL(dashRequire.resolve('fast-png')).href);

// Kleine vervangers voor wat browserOmgeving uit de browser gebruikt.
globalThis.FileReader = class {
  readAsDataURL(blob) {
    blob.arrayBuffer().then(
      (ab) => {
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(ab).toString('base64')}`;
        this.onload?.();
      },
      () => this.onerror?.(),
    );
  }
};
globalThis.Image = class {
  set src(dataUrl) {
    setTimeout(() => {
      try {
        const b64 = String(dataUrl).split(',')[1] || '';
        const png = pngDecode(Buffer.from(b64, 'base64'));
        this.naturalWidth = png.width;
        this.naturalHeight = png.height;
        this.onload?.();
      } catch {
        this.onerror?.(); // alleen PNG; voor dit testbedrijf genoeg (geen logo)
      }
    });
  }
};

// ── Inloggen ───────────────────────────────────────────────────────────────
const { createClient } = await import('@supabase/supabase-js');
const client = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: login, error: loginFout } = await client.auth.signInWithPassword({
  email: process.env.BB_TEST_EMAIL,
  password: process.env.BB_TEST_WACHTWOORD,
});
if (loginFout) throw new Error(`Inloggen mislukt: ${loginFout.message}`);
globalThis.__bbSupabase = client;
const { data: profiel } = await client.from('profiles').select('company_id').eq('id', login.user.id).maybeSingle();
if (profiel?.company_id !== TEST_BEDRIJF) throw new Error('Niet het TEST-bedrijf; gestopt.');

// ── App-module ─────────────────────────────────────────────────────────────
const D = await import('../src/lib/pdf/pdfData.ts');
const { bouwPdf } = await import('../src/lib/pdf/bouwPdf.ts');
const { omgevingZonderDom } = await import('../src/lib/pdf/omgevingBasis.ts');
const { jsPDF: AppJsPDF } = await import('jspdf');

// ── Dashboard-module ───────────────────────────────────────────────────────
const dashImport = (p) => import(pathToFileURL(join(dashSrc, p)).href);
const offSvc = await dashImport('services/offerteService.js');
const facSvc = await dashImport('services/factuurService.js');
const klantSvc = await dashImport('services/customerService.js');
const profSvc = await dashImport('services/profileService.js');
const { companyForDocument } = await dashImport('utils/documentSnapshot.js');
const gen = await dashImport('utils/generatePdf.js');
const { jsPDF: DashJsPDF } = await import(pathToFileURL(dashRequire.resolve('jspdf')).href);

const vast = (K) =>
  class extends K {
    constructor(o) {
      super(o);
      this.setCreationDate("D:20261015120000+02'00'");
      this.setFileId('00000000000000000000000000000000');
    }
  };

async function dashboardPdf(soort, id) {
  const company = await profSvc.getCompany(TEST_BEDRIJF);
  let document, regels, customer;
  if (soort === 'offerte') {
    document = await offSvc.getOfferteById(id);
    regels = await offSvc.getOfferteItems(id);
    customer = document.customerId ? await klantSvc.getCustomer(document.customerId).catch(() => null) : null;
  } else {
    const f = (await facSvc.getFacturen()).find((x) => x.id === id);
    regels = await facSvc.getFactuurRegels(id);
    customer = f.customerId ? await klantSvc.getCustomer(f.customerId).catch(() => null) : null;
    document = f.isCredit ? { ...f, creditNote: f.notities } : f;
  }
  const K = vast(DashJsPDF);
  const doc = new K({ unit: 'mm', format: 'a4' });
  await gen.buildPdf(doc, soort, document, regels, customer, companyForDocument(document, company), gen.browserOmgeving);
  return { doc, bytes: new Uint8Array(doc.output('arraybuffer')), companyId: document.companyId };
}

async function appPdf(soort, id) {
  const invoer = soort === 'offerte' ? await D.laadOfferteInvoer(client, id) : await D.laadFactuurInvoer(client, id);
  const r = await bouwPdf(invoer, omgevingZonderDom(client, URL_), vast(AppJsPDF));
  return { ...r, companyId: invoer.document.companyId };
}

let pdfjs = null;
if (process.env.PDFJS_DIR) {
  pdfjs = await import(pathToFileURL(join(process.env.PDFJS_DIR, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
}
async function tekstPerPagina(bytes) {
  if (!pdfjs) return null;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const uit = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const c = await (await pdf.getPage(p)).getTextContent();
    uit.push(c.items.map((i) => i.str).join('|'));
  }
  return uit;
}

const contentStreams = (doc) =>
  Array.from({ length: doc.getNumberOfPages() }, (_, i) => doc.internal.pages[i + 1].join('\n'));

mkdirSync(uitMap, { recursive: true });
let allesGelijk = true;
for (const [soort, id] of [['offerte', offerteId], ['factuur', factuurId]]) {
  const app = await appPdf(soort, id);
  const dash = await dashboardPdf(soort, id);
  if (app.companyId !== TEST_BEDRIJF || dash.companyId !== TEST_BEDRIJF) throw new Error('Document is niet van het TEST-bedrijf.');
  writeFileSync(join(uitMap, `${soort}-app.pdf`), app.bytes);
  writeFileSync(join(uitMap, `${soort}-dashboard.pdf`), dash.bytes);

  const csA = contentStreams(app.doc);
  const csD = contentStreams(dash.doc);
  const tA = await tekstPerPagina(app.bytes);
  const tD = await tekstPerPagina(dash.bytes);
  const r = {
    soort,
    bestandsnaam: app.bestandsnaam,
    paginas: { app: app.paginas, dashboard: dash.doc.getNumberOfPages() },
    bytes: { app: app.bytes.length, dashboard: dash.bytes.length },
    bytesGelijk: Buffer.compare(Buffer.from(app.bytes), Buffer.from(dash.bytes)) === 0,
    contentStreamsGelijk: csA.length === csD.length && csA.every((s, i) => s === csD[i]),
    tekstGelijk: tA ? tA.length === tD.length && tA.every((s, i) => s === tD[i]) : 'niet gecontroleerd',
    afbeeldingen: (Buffer.from(app.bytes).toString('latin1').match(/\/Subtype \/Image/g) || []).length,
    tekstPagina1: tA ? `${tA[0].slice(0, 160)}…` : undefined,
  };
  if (!r.bytesGelijk || !r.contentStreamsGelijk || r.tekstGelijk === false || r.paginas.app !== r.paginas.dashboard) {
    allesGelijk = false;
  }
  console.log(JSON.stringify(r, null, 2));
}

// Het bewaarde exemplaar, ter informatie (wat haalDocumentPdf eerst probeert).
const { data: fRij } = await client.from('facturen').select('company_id').eq('id', factuurId).maybeSingle();
const { data: opgeslagen } = await client.storage.from('factuur-pdfs').createSignedUrl(`${fRij.company_id}/${factuurId}.pdf`, 60);
const { data: getekend, error: getekendFout } = await client.functions.invoke('offerte-pdf-url', { body: { offerte_id: offerteId } });
for (const [naam, url] of [['factuur-opgeslagen', opgeslagen?.signedUrl], ['offerte-ondertekend', getekend?.url]]) {
  if (!url) {
    console.log(`${naam}: geen bewaard bestand${naam.startsWith('offerte') && getekendFout ? ` (${getekendFout.message})` : ''}`);
    continue;
  }
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  writeFileSync(join(uitMap, `${naam}.pdf`), bytes);
  const t = await tekstPerPagina(bytes);
  console.log(`${naam}: ${bytes.length} bytes, ${t ? `${t.length} pagina('s)` : ''}`);
}

await client.auth.signOut();
console.log(allesGelijk ? 'RESULTAAT: app en dashboard gelijk' : 'RESULTAAT: VERSCHIL');
process.exit(allesGelijk ? 0 : 1);
