import { useMemo, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { PDFJS_CDN, pdfWeergaveHtml } from '@/lib/pdfWeergaveHtml';
import { magWebviewLaden, PDF_WEBVIEW_BASIS } from '@/lib/webviewVeilig';

export type PdfBericht = { type: 'gereed' | 'klaar' | 'fout' | 'tik'; paginas?: number; melding?: string };

/**
 * De PDF-pagina (`lib/pdfWeergaveHtml`) in een WebView. Zodra de pagina klaar
 * is om te ontvangen, krijgt hij de PDF; tikken en fouten komen terug via
 * `onBericht`. Web: zie PdfFrame.web.tsx (tekent zelf in de pagina).
 *
 * Beveiliging: pdf.js (legacy-build) komt van jsDelivr met Subresource Integrity (zie
 * `pdfWeergaveHtml`). De pagina krijgt de eigen herkomst als basis (een
 * veilige https-context), maar laadt daar niets vandaan; elke navigatie
 * buiten die ene pagina wordt tegengehouden.
 */
export function PdfFrame({ base64, onBericht }: { base64: string; onBericht: (b: PdfBericht) => void }) {
  const ref = useRef<WebView>(null);
  const html = useMemo(() => pdfWeergaveHtml(PDFJS_CDN), []);
  const ontvang = (e: WebViewMessageEvent) => {
    let b: PdfBericht | null = null;
    try {
      b = JSON.parse(e.nativeEvent.data) as PdfBericht;
    } catch {
      return;
    }
    if (b.type === 'gereed') ref.current?.postMessage(JSON.stringify({ type: 'pdf', base64 }));
    onBericht(b);
  };
  return (
    <WebView
      ref={ref}
      originWhitelist={[PDF_WEBVIEW_BASIS.replace(/\/$/, '')]}
      source={{ html, baseUrl: PDF_WEBVIEW_BASIS }}
      onShouldStartLoadWithRequest={(r) => magWebviewLaden(r.url, [PDF_WEBVIEW_BASIS])}
      onMessage={ontvang}
      allowFileAccess={false}
      mixedContentMode="never"
      style={{ flex: 1, backgroundColor: '#2b2b2b' }}
      // Knijpen om te zoomen; geen tekstselectie-menu bij lang drukken.
      scalesPageToFit
      setBuiltInZoomControls
      setDisplayZoomControls={false}
      allowsInlineMediaPlayback={false}
    />
  );
}
