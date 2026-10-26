/**
 * De pagina die een PDF schermvullend tekent, voor de PDF-weergave van
 * offertes, facturen en werkbonnen (`components/PdfWeergave`), in de app
 * (WebView, `PdfFrame.tsx`) — ook op iOS, waar een ingesloten PDF anders alleen
 * zijn eerste pagina laat zien.
 *
 * Niet op web: daar erft een iframe de CSP van de app. Web tekent zelf in de
 * pagina met pdf.js van het eigen domein (`PdfFrame.web.tsx`), op dezelfde
 * manier.
 *
 * pdf.js tekent elke pagina op A4-verhouding in een canvas, scherp op het
 * scherm (devicePixelRatio), onder elkaar en scrollbaar. Knijpen om te zoomen
 * mag. Een tik (geen veeg) meldt zich bij de app, die dan de knoppenlaag
 * toont of verbergt.
 *
 * Berichten:
 *   app → pagina  { type: 'pdf', base64 }
 *   pagina → app  { type: 'klaar', paginas } | { type: 'fout', melding } | { type: 'tik' }
 *
 * pdf.js (zie PDFJS_VERSIE, Apache-2.0) komt met twee gewone
 * module-scripttags mét Subresource Integrity (sha384): een gewijzigd bestand
 * op de CDN wordt dan gewoon niet uitgevoerd. Het is de legacy-build: de
 * gewone build gebruikt o.a. `Promise.withResolvers` en draait daardoor niet op
 * iOS vóór 17.4 (en oudere Android-WebViews). cdnjs heeft geen legacy-build,
 * jsDelivr wel; het zijn dezelfde bestanden als web zelf host
 * (`public/pdfjs/<versie>/`, daar hernoemd naar `.js`), dus dezelfde hashes.
 *
 * Geen imports: draait in de Node-tests.
 */

export const PDFJS_VERSIE = '4.10.38';

/**
 * SRI (sha384) van de legacy-build van pdfjs-dist@4.10.38
 * (`legacy/build/pdf.min.mjs` en `pdf.worker.min.mjs`); gelijk aan
 * `public/pdfjs/4.10.38/pdf.min.js` en `pdf.worker.min.js`.
 */
export const PDFJS_SRI = {
  lib: 'sha384-z/XbAtvhBXJoK+yvYimnFuTCF6/2wTCDSIFD09/HtIfwFtvDKOMdAe5Z3wOChkmW',
  worker: 'sha384-vbNBYP03jHFPlgtK4qSXtazEmGfmpTWlSsfq9OiU20MroW/Q9TbaEXiM7PpeWg+6',
} as const;

/** App (WebView): de legacy-build van jsDelivr, met SRI. */
export const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSIE}/legacy/build`;

/** Het vaste inline script van de pagina (zonder variabelen). */
export const PDF_SCRIPT = `  const stuur = (bericht) => {
    const tekst = JSON.stringify(bericht);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(tekst);
    else if (window.parent !== window) window.parent.postMessage({ bbPdf: bericht }, '*');
  };

  // Tik = kort, zonder te bewegen; vegen en knijpen tellen niet.
  let start = null;
  document.addEventListener('touchstart', (e) => {
    start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!start || e.changedTouches.length !== 1) return;
    const p = e.changedTouches[0];
    if (Math.abs(p.clientX - start.x) < 10 && Math.abs(p.clientY - start.y) < 10 && Date.now() - start.t < 400) stuur({ type: 'tik' });
    start = null;
  }, { passive: true });
  let laatsteTouch = 0;
  document.addEventListener('touchend', () => { laatsteTouch = Date.now(); }, { passive: true });
  document.addEventListener('click', () => { if (Date.now() - laatsteTouch > 600) stuur({ type: 'tik' }); });

  async function teken(base64) {
    const melding = document.getElementById('melding');
    try {
      // pdf.js staat er al (de twee scripttags hierboven, met SRI). De worker
      // draait in deze pagina zelf (globalThis.pdfjsWorker): geen Worker of
      // blob-URL nodig, dus ook geen versoepeling van de CSP.
      const pdfjs = globalThis.pdfjsLib;
      if (!pdfjs || !globalThis.pdfjsWorker) throw new Error('pdf.js niet geladen');
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
      const houder = document.getElementById('paginas');
      houder.innerHTML = '';
      const breedte = Math.min(window.innerWidth - 16, 900);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      for (let n = 1; n <= doc.numPages; n++) {
        const pagina = await doc.getPage(n);
        const basis = pagina.getViewport({ scale: 1 });
        const schaal = breedte / basis.width;
        const vp = pagina.getViewport({ scale: schaal * dpr });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = Math.floor(basis.width * schaal) + 'px';
        canvas.style.height = Math.floor(basis.height * schaal) + 'px';
        canvas.setAttribute('aria-label', 'Pagina ' + n + ' van ' + doc.numPages);
        houder.appendChild(canvas);
        await pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        if (n === 1) melding.style.display = 'none';
      }
      stuur({ type: 'klaar', paginas: doc.numPages });
    } catch (e) {
      melding.textContent = 'De PDF kon niet worden getoond.';
      stuur({ type: 'fout', melding: String((e && e.message) || e) });
    }
  }

  const ontvang = (data) => {
    try {
      const b = typeof data === 'string' ? JSON.parse(data) : (data && data.bbPdf) || data;
      if (b && b.type === 'pdf' && typeof b.base64 === 'string') teken(b.base64);
    } catch (_) {}
  };
  window.addEventListener('message', (e) => ontvang(e.data));
  document.addEventListener('message', (e) => ontvang(e.data));
  stuur({ type: 'gereed' });
`;

/**
 * De pagina. `basis` = map waar pdf.min.mjs en pdf.worker.min.mjs staan
 * (PDFJS_CDN).
 */
export function pdfWeergaveHtml(basis: string): string {
  const src = (bestand: string, sri: string) =>
    `<script type="module" src="${basis}/${bestand}" integrity="${sri}" crossorigin="anonymous"></script>`;
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4, user-scalable=yes">
<style>
  html, body { margin: 0; padding: 0; background: #2b2b2b; -webkit-tap-highlight-color: transparent; }
  #paginas { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 12px 0 24px; }
  canvas { display: block; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.35); }
  #melding { color: #ddd; font: 15px -apple-system, system-ui, sans-serif; text-align: center; padding: 40vh 24px 0; }
</style>
</head>
<body>
<div id="paginas"></div>
<div id="melding">PDF laden…</div>
${src('pdf.min.mjs', PDFJS_SRI.lib)}
${src('pdf.worker.min.mjs', PDFJS_SRI.worker)}
<script type="module">${PDF_SCRIPT}</script>
</body>
</html>`;
}
