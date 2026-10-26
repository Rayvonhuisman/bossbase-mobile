/**
 * PDF-weergave onder de CSP van de PWA en veilig in de WebView van de app:
 * web tekent zelf met pdf.js van het eigen domein (zie ook config.test.mjs);
 * de app laadt dezelfde legacy-build van jsDelivr met SRI; PDOK mag in
 * connect-src.
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

test('SRI-hashes horen bij de legacy-build die web zelf host (zelfde bytes als jsDelivr)', () => {
  for (const [bestand, sri] of [
    ['pdf.min.js', P.PDFJS_SRI.lib],
    ['pdf.worker.min.js', P.PDFJS_SRI.worker],
  ]) {
    const hash = createHash('sha384').update(leesBytes(`public/pdfjs/${P.PDFJS_VERSIE}/${bestand}`)).digest('base64');
    assert.equal(sri, `sha384-${hash}`, bestand);
  }
  assert.ok(lees(`public/pdfjs/${P.PDFJS_VERSIE}/LICENSE.txt`).includes('Apache License'));
});

test('de pagina laadt pdf.js alleen via scripttags met integrity, zonder dynamische import', () => {
  const html = P.pdfWeergaveHtml('https://voorbeeld.test/pdfjs');
  const tags = [...html.matchAll(/<script type="module" src="([^"]+)" integrity="([^"]+)" crossorigin="anonymous"><\/script>/g)];
  assert.deepEqual(
    tags.map((t) => t[1]),
    ['https://voorbeeld.test/pdfjs/pdf.min.mjs', 'https://voorbeeld.test/pdfjs/pdf.worker.min.mjs'],
  );
  assert.doesNotMatch(P.PDF_SCRIPT, /import\(|cdnjs|jsdelivr|https?:\/\//);
  assert.match(P.PDF_SCRIPT, /isEvalSupported: false/);
  // Precies één inline script, en dat is PDF_SCRIPT (anders klopt de hash niet).
  const inline = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.deepEqual(inline, [P.PDF_SCRIPT]);
});

test('CSP: script-src alleen self, geen unsafe-inline/eval, hash of CDN', () => {
  const c = csp();
  assert.deepEqual(c['script-src'], ["'self'"]);
  const alles = Object.values(c).flat().join(' ');
  assert.doesNotMatch(alles, /cdnjs|jsdelivr|unsafe-eval/);
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

test('web tekent zelf (geen iframe); de app laadt de legacy-build van jsDelivr', () => {
  const web = lees('src/components/PdfFrame.web.tsx');
  assert.doesNotMatch(web, /<iframe|srcDoc|pdfWeergaveHtml/);
  assert.match(web, new RegExp(`PDFJS_MAP = '/pdfjs/${P.PDFJS_VERSIE.replace(/\./g, '\\.')}'`));
  const app = lees('src/components/PdfFrame.tsx');
  assert.match(app, /pdfWeergaveHtml\(PDFJS_CDN\)/);
  assert.equal(P.PDFJS_CDN, `https://cdn.jsdelivr.net/npm/pdfjs-dist@${P.PDFJS_VERSIE}/legacy/build`);
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
    assert.doesNotMatch(bron, /baseUrl: 'https:\/\/(cdnjs|cdn\.jsdelivr)/, pad);
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
