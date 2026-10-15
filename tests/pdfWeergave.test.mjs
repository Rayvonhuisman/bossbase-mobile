/**
 * PDF-weergave onder de CSP van de PWA en veilig in de WebView van de app:
 * pdf.js zelf gehost (web) of van cdnjs (app), altijd met SRI; het inline
 * script staat op zijn sha256 in vercel.json; PDOK mag in connect-src.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const lees = (pad) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf8');
const leesBytes = (pad) => readFileSync(new URL(`../${pad}`, import.meta.url));
const P = await import('../src/lib/pdfWeergaveHtml.ts');
const W = await import('../src/lib/webviewVeilig.ts');

const csp = () => {
  const cfg = JSON.parse(lees('vercel.json'));
  const kop = cfg.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy');
  return Object.fromEntries(
    kop.value.split(';').map((d) => d.trim().split(/\s+/)).map(([naam, ...waarden]) => [naam, waarden]),
  );
};

test('SRI-hashes horen bij de zelf gehoste pdf.js-bestanden', () => {
  for (const [bestand, sri] of [
    ['pdf.min.mjs', P.PDFJS_SRI.lib],
    ['pdf.worker.min.mjs', P.PDFJS_SRI.worker],
  ]) {
    const hash = createHash('sha384').update(leesBytes(`public${P.PDFJS_PAD_WEB}/${bestand}`)).digest('base64');
    assert.equal(sri, `sha384-${hash}`, bestand);
  }
  assert.ok(lees(`public${P.PDFJS_PAD_WEB}/LICENSE.txt`).includes('Apache License'));
});

test('de pagina laadt pdf.js alleen via scripttags met integrity, zonder dynamische import', () => {
  const html = P.pdfWeergaveHtml('https://voorbeeld.test/pdfjs');
  const tags = [...html.matchAll(/<script type="module" src="([^"]+)" integrity="([^"]+)" crossorigin="anonymous"><\/script>/g)];
  assert.deepEqual(
    tags.map((t) => t[1]),
    ['https://voorbeeld.test/pdfjs/pdf.min.mjs', 'https://voorbeeld.test/pdfjs/pdf.worker.min.mjs'],
  );
  assert.doesNotMatch(P.PDF_SCRIPT, /import\(|cdnjs|https?:\/\//);
  assert.match(P.PDF_SCRIPT, /isEvalSupported: false/);
  // Precies één inline script, en dat is PDF_SCRIPT (anders klopt de hash niet).
  const inline = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.deepEqual(inline, [P.PDF_SCRIPT]);
});

test('CSP: script-src self + sha256 van het inline script, geen unsafe-inline/eval of CDN', () => {
  const c = csp();
  const hash = createHash('sha256').update(P.PDF_SCRIPT, 'utf8').digest('base64');
  assert.deepEqual(c['script-src'], ["'self'", `'sha256-${hash}'`]);
  const alles = Object.values(c).flat().join(' ');
  assert.doesNotMatch(c['script-src'].join(' '), /unsafe|cdnjs|https:/);
  assert.doesNotMatch(alles, /cdnjs/);
  assert.deepEqual(c['frame-src'], ["'none'"]);
});

test('CSP: connect-src staat alleen Supabase en PDOK toe naast self/blob', () => {
  assert.deepEqual(csp()['connect-src'], [
    "'self'",
    'blob:',
    'https://mawzqpnsluljxpbarhng.supabase.co',
    'https://api.pdok.nl',
  ]);
  assert.match(lees('src/lib/adresZoeken.ts'), /https:\/\/api\.pdok\.nl\//);
});

test('/pdfjs/ krijgt CORS (srcdoc-iframe zonder eigen herkomst) en een JS-type', () => {
  const cfg = JSON.parse(lees('vercel.json'));
  const regel = (bron) => cfg.headers.find((h) => h.source === bron)?.headers ?? [];
  assert.ok(regel('/pdfjs/(.*)').some((h) => h.key === 'Access-Control-Allow-Origin' && h.value === '*'));
  assert.ok(regel('/pdfjs/(.*).mjs').some((h) => h.key === 'Content-Type' && /^text\/javascript/.test(h.value)));
});

test('web gebruikt het eigen domein, de app cdnjs; beide met dezelfde SRI', () => {
  const web = lees('src/components/PdfFrame.web.tsx');
  assert.match(web, /pdfWeergaveHtml\(`\$\{window\.location\.origin\}\$\{PDFJS_PAD_WEB\}`\)/);
  assert.match(web, /sandbox="allow-scripts"/);
  assert.doesNotMatch(web, /sandbox="[^"]*allow-same-origin/);
  const app = lees('src/components/PdfFrame.tsx');
  assert.match(app, /pdfWeergaveHtml\(PDFJS_CDN\)/);
  assert.equal(P.PDFJS_CDN, `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${P.PDFJS_VERSIE}`);
});

test('WebViews: geen originWhitelist "*", wel een navigatiefilter', () => {
  for (const pad of [
    'src/components/PdfFrame.tsx',
    'src/components/werkbon/HandtekeningVak.tsx',
    'src/components/werkbon/MailVoorbeeld.tsx',
  ]) {
    const bron = lees(pad);
    assert.doesNotMatch(bron, /originWhitelist=\{\['\*'\]\}/, pad);
    assert.match(bron, /onShouldStartLoadWithRequest=\{\(r\) => magWebviewLaden\(r\.url/, pad);
    assert.doesNotMatch(bron, /baseUrl: 'https:\/\/cdnjs/, pad);
  }
});

test('navigatiefilter: alleen de eigen pagina', () => {
  assert.ok(W.magWebviewLaden('about:blank'));
  assert.ok(W.magWebviewLaden(W.PDF_WEBVIEW_BASIS, [W.PDF_WEBVIEW_BASIS]));
  assert.ok(!W.magWebviewLaden(W.PDF_WEBVIEW_BASIS));
  assert.ok(!W.magWebviewLaden('https://app.bossbase.nl/login', [W.PDF_WEBVIEW_BASIS]));
  assert.ok(!W.magWebviewLaden('https://evil.example/', [W.PDF_WEBVIEW_BASIS]));
  assert.ok(!W.magWebviewLaden('javascript:alert(1)'));
  assert.ok(!W.magWebviewLaden('data:text/html,<b>x</b>'));
  assert.ok(!W.magWebviewLaden('file:///etc/hosts'));
  assert.ok(!W.magWebviewLaden(''));
  assert.ok(!W.magWebviewLaden(undefined));
});
