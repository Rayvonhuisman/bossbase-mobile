import { useMemo, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { pdfWeergaveHtml } from '@/lib/pdfWeergaveHtml';

export type PdfBericht = { type: 'gereed' | 'klaar' | 'fout' | 'tik'; paginas?: number; melding?: string };

/**
 * De PDF-pagina (`lib/pdfWeergaveHtml`) in een WebView. Zodra de pagina klaar
 * is om te ontvangen, krijgt hij de PDF; tikken en fouten komen terug via
 * `onBericht`. Web: zie PdfFrame.web.tsx (iframe).
 */
export function PdfFrame({ base64, onBericht }: { base64: string; onBericht: (b: PdfBericht) => void }) {
  const ref = useRef<WebView>(null);
  const html = useMemo(() => pdfWeergaveHtml(), []);
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
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://cdnjs.cloudflare.com' }}
      onMessage={ontvang}
      style={{ flex: 1, backgroundColor: '#2b2b2b' }}
      // Knijpen om te zoomen; geen tekstselectie-menu bij lang drukken.
      scalesPageToFit
      setBuiltInZoomControls
      setDisplayZoomControls={false}
      allowsInlineMediaPlayback={false}
    />
  );
}
