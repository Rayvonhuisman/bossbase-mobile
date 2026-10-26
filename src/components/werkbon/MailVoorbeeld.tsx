import { magWebviewLaden, WEBVIEW_LEGE_PAGINA } from '@/lib/webviewVeilig';
import { WebView } from 'react-native-webview';

/**
 * Voorbeeld van een mail zoals de klant hem krijgt: de echte HTML, in een
 * WebView zonder scripts. Web: MailVoorbeeld.web.tsx (iframe).
 */
export function MailVoorbeeld({ html, hoogte = 380 }: { html: string; hoogte?: number }) {
  return (
    <WebView
      originWhitelist={[WEBVIEW_LEGE_PAGINA]}
      source={{ html }}
      onShouldStartLoadWithRequest={(r) => magWebviewLaden(r.url)}
      allowFileAccess={false}
      javaScriptEnabled={false}
      style={{ height: hoogte, borderRadius: 8, backgroundColor: '#fff' }}
    />
  );
}
