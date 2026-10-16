import { useEffect, useRef, useState } from 'react';

export type PdfBericht = { type: 'gereed' | 'klaar' | 'fout' | 'tik'; paginas?: number; melding?: string };

/**
 * Web/PWA: pdf.js tekent de PDF rechtstreeks in de pagina, elke pagina op
 * A4-verhouding in een canvas, onder elkaar en scrollbaar. Knijpen om te
 * zoomen doet de browser zelf. Geen `<embed>` of browserviewer: die laat op een
 * iPhone alleen de eerste pagina zien en vangt de tik voor de knoppenlaag weg.
 *
 * Waarom geen iframe (zoals in de app de WebView): een `srcdoc`-iframe erft de
 * Content-Security-Policy van de app (vercel.json). Daar mag alleen script van
 * het eigen domein draaien (`script-src 'self'`), dus het ingebouwde script en
 * pdf.js van een CDN werden geblokkeerd en bleef het scherm op "PDF laden…"
 * staan. Op de devserver (zonder die header) leek het wél te werken.
 *
 * pdf.js staat daarom zelf in `public/pdfjs/<versie>/` (de legacy-build van
 * pdfjs-dist, ook voor oudere iPhones; Apache-2.0, zie LICENSE.txt daar) en
 * komt zo van het eigen domein: het script past binnen `script-src 'self'`,
 * de worker binnen `worker-src 'self'`. Pas `PDFJS_MAP` aan bij een nieuwe
 * versie en zet de map ernaast: `pdfjs-dist/legacy/build/pdf.min.mjs` en
 * `pdf.worker.min.mjs`, hernoemd naar `.js`.
 */
const PDFJS_MAP = '/pdfjs/4.10.38';

type PdfPagina = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPagina>; destroy: () => Promise<void> };
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (o: { data: Uint8Array; isEvalSupported?: boolean }) => { promise: Promise<PdfDoc> };
};

let pdfjsLaden: Promise<PdfJs> | null = null;

/**
 * pdf.js één keer laden, als module-script van het eigen domein. Het zet
 * zichzelf op `globalThis.pdfjsLib`. (Een `import()` met een variabele kan
 * Metro niet bundelen, en via `new Function` mag het niet van de CSP.)
 */
function laadPdfJs(): Promise<PdfJs> {
  const klaar = (globalThis as { pdfjsLib?: PdfJs }).pdfjsLib;
  if (klaar) return Promise.resolve(klaar);
  if (pdfjsLaden) return pdfjsLaden;
  pdfjsLaden = new Promise<PdfJs>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = `${PDFJS_MAP}/pdf.min.js`;
    script.onload = () => {
      const lib = (globalThis as { pdfjsLib?: PdfJs }).pdfjsLib;
      if (!lib) return reject(new Error('pdf.js niet gevonden na laden'));
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_MAP}/pdf.worker.min.js`;
      resolve(lib);
    };
    script.onerror = () => reject(new Error('pdf.js kon niet worden geladen'));
    document.head.appendChild(script);
  }).catch((e) => {
    // Volgende keer opnieuw proberen (bijv. na een netwerkfout).
    pdfjsLaden = null;
    throw e;
  });
  return pdfjsLaden;
}

function naarBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function PdfFrame({ base64, onBericht }: { base64: string; onBericht: (b: PdfBericht) => void }) {
  const houderRef = useRef<HTMLDivElement>(null);
  const [laden, setLaden] = useState(true);
  const [mislukt, setMislukt] = useState(false);
  const onBerichtRef = useRef(onBericht);
  useEffect(() => {
    onBerichtRef.current = onBericht;
  });

  useEffect(() => {
    let actief = true;
    let doc: PdfDoc | null = null;
    const houder = houderRef.current;
    (async () => {
      try {
        const pdfjs = await laadPdfJs();
        // isEvalSupported: false — eval mag niet van de CSP; zonder deze vlag
        // probeert pdf.js het toch en meldt de browser een overtreding.
        doc = await pdfjs.getDocument({ data: naarBytes(base64), isEvalSupported: false }).promise;
        if (!actief || !houder) return;
        houder.innerHTML = '';
        const breedte = Math.min((houder.clientWidth || window.innerWidth) - 16, 900);
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        for (let n = 1; n <= doc.numPages; n++) {
          const pagina = await doc.getPage(n);
          if (!actief) return;
          const basis = pagina.getViewport({ scale: 1 });
          const schaal = breedte / basis.width;
          const vp = pagina.getViewport({ scale: schaal * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          // Breedte vast op het moment van tekenen; draait de iPad, dan
          // schaalt hij mee omlaag (max-width) zonder opnieuw te tekenen.
          canvas.style.cssText =
            `display:block;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35);` +
            `width:${Math.floor(basis.width * schaal)}px;max-width:calc(100% - 16px);height:auto;`;
          canvas.setAttribute('aria-label', `Pagina ${n} van ${doc.numPages}`);
          houder.appendChild(canvas);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Geen canvas');
          await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
          if (n === 1 && actief) setLaden(false);
        }
        if (actief) onBerichtRef.current({ type: 'klaar', paginas: doc.numPages });
      } catch (e) {
        if (__DEV__) console.log('[PdfFrame] tekenen mislukt', e);
        if (!actief) return;
        setLaden(false);
        setMislukt(true);
        onBerichtRef.current({ type: 'fout', melding: String((e as Error)?.message ?? e) });
      }
    })();
    return () => {
      actief = false;
      void doc?.destroy();
      if (houder) houder.innerHTML = '';
    };
  }, [base64]);

  return (
    <div
      // Een tik (geen veeg: dan vuurt de browser geen click) toont of verbergt de knoppenlaag.
      onClick={() => onBerichtRef.current({ type: 'tik' })}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        backgroundColor: '#2b2b2b',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div
        ref={houderRef}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '12px 0 24px' }}
      />
      {laden || mislukt ? (
        <div
          style={{
            color: '#ddd',
            font: '15px -apple-system, system-ui, sans-serif',
            textAlign: 'center',
            padding: '40vh 24px 0',
          }}
        >
          {mislukt ? 'De PDF kon niet worden getoond.' : 'PDF laden…'}
        </div>
      ) : null}
    </div>
  );
}
