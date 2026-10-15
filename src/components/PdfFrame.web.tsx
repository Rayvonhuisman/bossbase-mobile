import { useEffect, useMemo, useRef } from 'react';
import { PDFJS_PAD_WEB, pdfWeergaveHtml } from '@/lib/pdfWeergaveHtml';

export type PdfBericht = { type: 'gereed' | 'klaar' | 'fout' | 'tik'; paginas?: number; melding?: string };

/**
 * Web/PWA: de PDF-pagina (`lib/pdfWeergaveHtml`) in een iframe, met
 * postMessage heen en weer. Geen `<embed>` of browserviewer: die laat op een
 * iPhone alleen de eerste pagina zien en vangt de tik voor de knoppenlaag weg.
 *
 * CSP (vercel.json): pdf.js komt van het eigen domein (`public/pdfjs/`, met
 * SRI); het inline script staat er met zijn sha256 in. De srcdoc-iframe erft
 * de CSP van de app. Zonder `allow-same-origin` heeft hij een eigen, lege
 * herkomst, daarom stuurt `/pdfjs/` een CORS-kop mee.
 */
export function PdfFrame({ base64, onBericht }: { base64: string; onBericht: (b: PdfBericht) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => pdfWeergaveHtml(`${window.location.origin}${PDFJS_PAD_WEB}`), []);
  const onBerichtRef = useRef(onBericht);
  useEffect(() => {
    onBerichtRef.current = onBericht;
  });

  useEffect(() => {
    const luister = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const b = (e.data as { bbPdf?: PdfBericht } | null)?.bbPdf;
      if (!b) return;
      if (b.type === 'gereed') ref.current?.contentWindow?.postMessage({ bbPdf: { type: 'pdf', base64 } }, '*');
      onBerichtRef.current(b);
    };
    window.addEventListener('message', luister);
    return () => window.removeEventListener('message', luister);
  }, [base64]);

  return (
    <iframe
      ref={ref}
      title="PDF"
      srcDoc={html}
      // Scripts nodig voor pdf.js; geen same-origin, zodat de pagina niet bij de app kan.
      sandbox="allow-scripts"
      style={{ flex: 1, width: '100%', height: '100%', border: 0, backgroundColor: '#2b2b2b' }}
    />
  );
}
