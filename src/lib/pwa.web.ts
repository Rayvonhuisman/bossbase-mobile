import { useSyncExternalStore } from 'react';
import type { Installatie, InstallatieSoort } from './pwa';

/**
 * De installeerbare webapp (PWA): service worker, updates en installeren.
 * De native variant staat in `pwa.ts` en doet niets.
 */

// ---------------------------------------------------------------------------
// Kleine gedeelde toestand, zodat schermen opnieuw tekenen als er iets
// verandert (nieuwe versie klaar, installatieprompt beschikbaar, geïnstalleerd).
// ---------------------------------------------------------------------------

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let nieuweVersie = false;
let uitgesteldePrompt: BeforeInstallPromptEvent | null = null;
let netGeinstalleerd = false;
let versie = 0;
const luisteraars = new Set<() => void>();

function gewijzigd() {
  versie += 1;
  luisteraars.forEach((l) => l());
}

function abonneer(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}
const snapshot = () => versie;

if (typeof window !== 'undefined') {
  // Chrome, Edge en Android: de browser biedt installeren aan. We houden het
  // aanbod vast en tonen het pas als iemand zelf op "Installeer BossBase" tikt.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    uitgesteldePrompt = e as BeforeInstallPromptEvent;
    gewijzigd();
  });
  window.addEventListener('appinstalled', () => {
    uitgesteldePrompt = null;
    netGeinstalleerd = true;
    gewijzigd();
  });
}

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------

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
 *
 * Een nieuwe service worker neemt meteen over (`skipWaiting` in `sw.js`), maar
 * de JavaScript die al draait blijft de oude tot de pagina herlaadt. Dat doen
 * we niet ongevraagd — iemand kan midden in een formulier zitten — maar we
 * melden het (`useNieuweVersie`), met een knop om te herladen.
 */
export function registreerServiceWorker(): void {
  if (__DEV__) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;

  // Had deze pagina al een service worker, dan is een wissel een update. Bij
  // het allereerste bezoek neemt de eerste service worker ook over, maar dan
  // draait de pagina al de nieuwste versie.
  const hadServiceWorker = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadServiceWorker || nieuweVersie) return;
    nieuweVersie = true;
    gewijzigd();
  });

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

/** True zodra er een nieuwere versie van de app klaarstaat. */
export function useNieuweVersie(): boolean {
  useSyncExternalStore(abonneer, snapshot, snapshot);
  return nieuweVersie;
}

/** De nieuwe versie laden. Sessie en instellingen staan in localStorage en blijven. */
export function herlaadNieuweVersie(): void {
  window.location.reload();
}

// ---------------------------------------------------------------------------
// Installeren
// ---------------------------------------------------------------------------

/** Draait de app als geïnstalleerde app (vanaf het beginscherm of de Dock)? */
function isGeinstalleerd(): boolean {
  if (netGeinstalleerd) return true;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari kent display-mode niet in elke versie; dit wel.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone of iPad (iPadOS doet zich voor als Mac, maar heeft wel een touchscreen). */
export function isIos(userAgent: string, touchPunten: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && touchPunten > 1;
}

/** Pure beslisregel (los te testen): welke installatieroute past hier? */
export function bepaalInstallatieSoort(s: {
  geinstalleerd: boolean;
  prompt: boolean;
  userAgent: string;
  touchPunten: number;
}): InstallatieSoort {
  if (s.geinstalleerd) return 'geinstalleerd';
  if (s.prompt) return 'prompt';
  if (isIos(s.userAgent, s.touchPunten)) return 'ios';
  return 'handmatig';
}

function huidigeSoort(): InstallatieSoort {
  if (typeof window === 'undefined') return 'native';
  return bepaalInstallatieSoort({
    geinstalleerd: isGeinstalleerd(),
    prompt: !!uitgesteldePrompt,
    userAgent: navigator.userAgent,
    touchPunten: navigator.maxTouchPoints,
  });
}

async function installeer(): Promise<boolean> {
  const prompt = uitgesteldePrompt;
  if (!prompt) return false;
  // Een prompt is maar één keer te gebruiken.
  uitgesteldePrompt = null;
  gewijzigd();
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === 'accepted';
}

export function useInstallatie(): Installatie {
  useSyncExternalStore(abonneer, snapshot, snapshot);
  return { soort: huidigeSoort(), installeer };
}
