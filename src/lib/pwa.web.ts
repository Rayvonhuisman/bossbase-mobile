/**
 * De service worker registreren (zie `public/sw.js`).
 *
 * Alleen in een productiebuild: tijdens `expo start` zou een service worker de
 * dev-server en hot reload in de weg zitten. Alleen in een veilige context
 * (https, of localhost bij lokaal testen) — anders weigert de browser hem toch.
 *
 * `updateViaCache: 'none'`: de browser haalt `sw.js` bij elke controle vers op
 * en nooit uit zijn HTTP-cache, zodat een nieuwe versie niet blijft hangen.
 * Daarnaast controleren we op een update telkens als de app weer in beeld komt:
 * een geïnstalleerde PWA blijft soms dagen open staan.
 */
export function registreerServiceWorker(): void {
  if (__DEV__) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;

  const registreer = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registratie) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registratie.update().catch(() => {});
        });
      })
      .catch((e) => console.warn('[pwa] service worker niet geregistreerd', e));
  };

  // Na het laden, zodat de registratie het opstarten van de app niet vertraagt.
  if (document.readyState === 'complete') registreer();
  else window.addEventListener('load', registreer, { once: true });
}
