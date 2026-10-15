/**
 * Navigatiefilter voor de WebViews in de app (PDF-weergave, handtekening,
 * mailvoorbeeld). Die tonen alleen HTML die de app zelf aanlevert; elke
 * navigatie naar een andere URL (een link in een mail, een script dat
 * `location` verandert) wordt tegengehouden.
 *
 * Let op: react-native-webview opent een URL die níet in `originWhitelist`
 * staat zelf via `Linking` (buiten de app). Een link in het mailvoorbeeld
 * gaat dus naar de browser en nooit in de WebView open.
 *
 * Geen imports: draait in de Node-tests.
 */

/** Altijd toegestaan: de eigen, ingeladen pagina zonder echte herkomst. */
export const WEBVIEW_LEGE_PAGINA = 'about:blank';

/** Herkomst van de PDF-weergave in de app (`source.baseUrl`). Wordt niet geladen. */
export const PDF_WEBVIEW_BASIS = 'https://app.bossbase.nl/';

/**
 * Mag de WebView naar deze URL? Alleen de lege pagina en de exact opgegeven
 * basis-URL('s) van de eigen inhoud; alles daarbuiten niet.
 */
export function magWebviewLaden(url: string | null | undefined, toegestaan: readonly string[] = []): boolean {
  if (!url) return false;
  if (url === WEBVIEW_LEGE_PAGINA || url === 'about:srcdoc') return true;
  return toegestaan.includes(url);
}
