#!/usr/bin/env node
/**
 * Vergelijkt de werkbon-PDF van de app met "Werkbon als PDF" van het dashboard,
 * op echte gegevens van het TEST-bedrijf. Alleen-lezen: het script schrijft
 * niets in de database en verstuurt niets.
 *
 *   App:       src/lib/pdf/werkbonPdf.ts (laadWerkbonInvoer → bouwWerkbonPdf),
 *              met de omgeving zonder DOM die de telefoon gebruikt.
 *   Dashboard: de échte services van het dashboard, precies zoals
 *              WerkbonPageV2.handleDownloadPdf ze gebruikt: getWerkbonById,
 *              getWerkbonTaken (taken en meerwerk), getWerkbonMaterialen,
 *              getWerkbonUren, getWerkbonFotos, getWerkbonNotities,
 *              getTeamMembers (uitvoerderNamen), listCustomers,
 *              getCurrentCompany, bouwPdfWerkbon en bouwPdfData — en dan
 *              buildWerkbonPdf met browserOmgeving (generateWerkbonPdf.js).
 *
 * Beide met een vaste aanmaakdatum en bestands-id, zodat de PDF's byte voor
 * byte vergelijkbaar zijn. Daarnaast de content streams en (met PDFJS_DIR)
 * de tekst per pagina. Zie scripts/vergelijk-pdf.mjs voor offerte en factuur.
 *
 * Gebruik:
 *   BB_TEST_EMAIL=… BB_TEST_WACHTWOORD=… [PDFJS_DIR=…] [UIT=map] \
 *     node scripts/vergelijk-werkbon-pdf.mjs <werkbon-id> [<werkbon-id> …]
 */
import '../tests/hulp/tsPaden.mjs';
import { registerHooks, createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve as padResolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { dashboardRepo } from './pdf-opbouw-bron.mjs';

const TEST_BEDRIJF = '7e57c0de-0000-4000-b000-000000000000';
const hier = dirname(fileURLToPath(import.meta.url));
const appRoot = padResolve(hier, '..');
const ids = process.argv.slice(2);
const uitMap = process.env.UIT || join(tmpdir(), 'pdf-vergelijk');
if (!ids.length) {
  console.error('Gebruik: node scripts/vergelijk-werkbon-pdf.mjs <werkbon-id> [...]');
  process.exit(2);
}
const repo = dashboardRepo();
if (!repo) throw new Error('Dashboardrepo niet gevonden (BOSSBASE_DASHBOARD).');
const dashSrc = join(repo, 'src');

const env = Object.fromEntries(
  readFileSync(join(appRoot, '.env'), 'utf8')
    .split('\n')
    .map((r) => r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^['"]|['"]$/g, '')]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Zelfde lader als vergelijk-pdf.mjs: lib/supabase van het dashboard wordt
// onze ingelogde client, import.meta.env een gewoon object.
const SHIM = 'bb-shim:supabase';
registerHooks({
  resolve(spec, ctx, next) {
    const ouder = ctx.parentURL?.startsWith('file:') ? fileURLToPath(ctx.parentURL) : null;
    if (ouder?.startsWith(dashSrc) && (spec.startsWith('./') || spec.startsWith('../'))) {
      const pad = padResolve(dirname(ouder), spec);
      if (pad.replace(/\.js$/, '') === join(dashSrc, 'lib/supabase')) return { url: SHIM, shortCircuit: true };
      if (!/\.[cm]?[jt]sx?$/.test(pad)) return next(pathToFileURL(`${pad}.js`).href, ctx);
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
const jpegAfmeting = (buf) => {
  // SOF0/SOF2-marker: hoogte en breedte staan erachter.
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
};
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
        const buf = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
        let maat;
        if (buf[0] === 0x89) {
          const png = pngDecode(buf);
          maat = { w: png.width, h: png.height };
        } else maat = jpegAfmeting(buf);
        if (!maat) throw new Error('onbekend');
        this.naturalWidth = maat.w;
        this.naturalHeight = maat.h;
        this.onload?.();
      } catch {
        this.onerror?.();
      }
    });
  }
};
// Geen canvas in Node: browserOmgeving valt dan terug op het origineel. De
// app-omgeving zonder DOM verkleint ook niet; zo vergelijken we dezelfde route.
globalThis.document = { createElement: () => ({ getContext: () => null }) };

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

const W = await import('../src/lib/pdf/werkbonPdf.ts');
const { omgevingZonderDom } = await import('../src/lib/pdf/omgevingBasis.ts');
const { jsPDF: AppJsPDF } = await import('jspdf');

const dashImport = (p) => import(pathToFileURL(join(dashSrc, p)).href);
const wbSvc = await dashImport('services/werkbonService.js');
const urenSvc = await dashImport('services/werkbonUrenService.js');
const notSvc = await dashImport('services/notificatieService.js');
const klantSvc = await dashImport('services/customerService.js');
const profSvc = await dashImport('services/profileService.js');
const ond = await dashImport('services/werkbonOndertekenenService.js');
const gen = await dashImport('utils/generatePdf.js');
const opbouw = await import(pathToFileURL(join(repo, 'supabase/functions/_shared/pdfOpbouw.js')).href);
const { jsPDF: DashJsPDF } = await import(pathToFileURL(dashRequire.resolve('jspdf')).href);

const vast = (K) =>
  class extends K {
    constructor(o) {
      super(o);
      this.setCreationDate("D:20261015120000+02'00'");
      this.setFileId('00000000000000000000000000000000');
    }
  };

async function dashboardPdf(id) {
  const [detail, taken, materialen, uren, fotos, meerwerk, notities, team, klanten, company] = await Promise.all([
    wbSvc.getWerkbonById(id),
    wbSvc.getWerkbonTaken(id),
    wbSvc.getWerkbonMaterialen(id),
    urenSvc.getWerkbonUren(id),
    wbSvc.getWerkbonFotos(id),
    wbSvc.getWerkbonTaken(id, { soort: 'meerwerk' }),
    wbSvc.getWerkbonNotities(id),
    notSvc.getTeamMembers(),
    klantSvc.listCustomers(),
    profSvc.getCurrentCompany(),
  ]);
  // uitvoerderNamen uit WerkbonPageV2.
  const uitvoerders = [...new Set([...(detail.verantwoordelijkeIds || []), ...(detail.assignedToIds || [])])]
    .map((x) => team.find((m) => m.profileId === x)?.fullName)
    .filter(Boolean);
  const customer = klanten.find((c) => c.id === detail.customerId) || { name: detail.customerName };
  const werkbon = ond.bouwPdfWerkbon(detail, { uitvoerders });
  const data = ond.bouwPdfData({ taken, uren, materialen, meerwerk, notities, fotos });
  const doc = new (vast(DashJsPDF))({ unit: 'mm', format: 'a4' });
  await opbouw.buildWerkbonPdf(doc, werkbon, data, customer, company, gen.browserOmgeving);
  return { doc, bytes: new Uint8Array(doc.output('arraybuffer')), werkbon, data, companyId: detail.companyId };
}

async function appPdf(id) {
  const invoer = await W.laadWerkbonInvoer(client, id);
  const r = await W.bouwWerkbonPdf(invoer, omgevingZonderDom(client, URL_), vast(AppJsPDF));
  return { ...r, invoer };
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
// Signed URLs verschillen per aanvraag; voor de vergelijking van de invoer telt het pad.
const zonderToken = (d) => JSON.parse(JSON.stringify(d).replace(/\?token=[^"]+/g, ''));

mkdirSync(uitMap, { recursive: true });
let allesGelijk = true;
for (const id of ids) {
  const app = await appPdf(id);
  const dash = await dashboardPdf(id);
  if (dash.companyId !== TEST_BEDRIJF) throw new Error('Werkbon is niet van het TEST-bedrijf.');
  writeFileSync(join(uitMap, `werkbon-${id}-app.pdf`), app.bytes);
  writeFileSync(join(uitMap, `werkbon-${id}-dashboard.pdf`), dash.bytes);
  const csA = contentStreams(app.doc);
  const csD = contentStreams(dash.doc);
  const tA = await tekstPerPagina(app.bytes);
  const tD = await tekstPerPagina(dash.bytes);
  const r = {
    werkbon: id,
    bestandsnaam: app.bestandsnaam,
    invoerGelijk:
      JSON.stringify(app.invoer.werkbon) === JSON.stringify(dash.werkbon) &&
      JSON.stringify(zonderToken(app.invoer.data)) === JSON.stringify(zonderToken(dash.data)),
    paginas: { app: app.paginas, dashboard: dash.doc.getNumberOfPages() },
    bytes: { app: app.bytes.length, dashboard: dash.bytes.length },
    bytesGelijk: Buffer.compare(Buffer.from(app.bytes), Buffer.from(dash.bytes)) === 0,
    contentStreamsGelijk: csA.length === csD.length && csA.every((s, i) => s === csD[i]),
    tekstGelijk: tA ? tA.length === tD.length && tA.every((s, i) => s === tD[i]) : 'niet gecontroleerd',
    inhoud: Object.fromEntries(Object.entries(app.invoer.data).map(([k, v]) => [k, v.length])),
    afbeeldingen: (Buffer.from(app.bytes).toString('latin1').match(/\/Subtype \/Image/g) || []).length,
    tekstPagina1: tA ? `${tA[0].slice(0, 200)}…` : undefined,
  };
  if (!r.invoerGelijk) {
    console.log('app-invoer', JSON.stringify({ w: app.invoer.werkbon, d: zonderToken(app.invoer.data) }));
    console.log('dashboard-invoer', JSON.stringify({ w: dash.werkbon, d: zonderToken(dash.data) }));
  }
  if (!r.invoerGelijk || !r.bytesGelijk || !r.contentStreamsGelijk || r.tekstGelijk === false || r.paginas.app !== r.paginas.dashboard) {
    allesGelijk = false;
  }
  console.log(JSON.stringify(r, null, 2));
}

await client.auth.signOut();
console.log(allesGelijk ? 'RESULTAAT: app en dashboard gelijk' : 'RESULTAAT: VERSCHIL');
process.exit(allesGelijk ? 0 : 1);
