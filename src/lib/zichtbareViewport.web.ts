import { useSyncExternalStore } from 'react';

/**
 * Het zichtbare deel van het scherm in de browser — vooral: wat er overblijft
 * als het toetsenbord open is.
 *
 * Waarom dit nodig is. Op iOS krimpt bij een open toetsenbord alleen de
 * *visual viewport*; de pagina zelf (de layout viewport) blijft schermhoog.
 * De app en elke formulier-`Modal` zijn schermhoog (`height: 100%`,
 * `position: fixed; inset: 0`), en `KeyboardAvoidingView` doet in
 * react-native-web niets. iOS lost dat op door het hele beeld omhoog te
 * schuiven tot het veld boven het toetsenbord staat — en dan verdwijnen de kop
 * en de bovenste velden uit beeld, zeker als het veld al gefocust werd tijdens
 * de slide-in van een `Modal` (zoals de titel van een nieuwe afspraak).
 *
 * Wat hier gebeurt, één keer voor de hele app:
 *
 * - We houden de hoogte en verschuiving van `window.visualViewport` bij.
 *   `MobielKader` (rond de app én rond elke schermvullende modal) neemt die
 *   over: de app past dan precies in het stuk boven het toetsenbord, en een
 *   scrollende lijst of formulier daarbinnen scrolt gewoon zelf.
 * - Schuift iOS het document toch (`window.scrollY`), dan zetten we dat terug:
 *   de app scrolt nooit het document, alleen zijn eigen lijsten.
 * - Na het openen van het toetsenbord, en bij wisselen van veld, scrollen we
 *   het actieve veld mét zijn label minimaal in beeld, alleen binnen de eigen
 *   scrollcontainer van het formulier: zo weinig als nodig, nooit naar het
 *   einde van het formulier.
 * - Bij inzoomen met twee vingers (`scale` ≠ 1) doen we niets; anders zou
 *   zoomen de hele app vervormen.
 */

export type ZichtbareViewport = {
  /** Zichtbare hoogte in pixels, of `null`: gebruik gewoon de volle ruimte. */
  hoogte: number | null;
  /** Hoeveel het zichtbare deel naar beneden is verschoven. */
  boven: number;
  toetsenbordOpen: boolean;
};

/** Zoveel moet er van het scherm af zijn voordat we het een toetsenbord noemen. */
const TOETSENBORD_DREMPEL = 120;

const VOL: ZichtbareViewport = { hoogte: null, boven: 0, toetsenbordOpen: false };

let huidig: ZichtbareViewport = VOL;
const luisteraars = new Set<() => void>();
let geinstalleerd = false;

/**
 * Pure berekening (los te testen): wat is er zichtbaar, gegeven de visual
 * viewport en de hoogte van de pagina zelf?
 */
export function berekenViewport(
  vv: Pick<VisualViewport, 'height' | 'offsetTop' | 'scale'> | null | undefined,
  layout: number,
): ZichtbareViewport {
  if (!vv || Math.abs(vv.scale - 1) > 0.01) return VOL;
  const hoogte = Math.round(vv.height);
  const boven = Math.max(0, Math.round(vv.offsetTop));
  const toetsenbordOpen = layout - hoogte > TOETSENBORD_DREMPEL;
  // Zonder toetsenbord en zonder verschuiving: gewoon de volle ruimte.
  if (!toetsenbordOpen && boven === 0) return VOL;
  return { hoogte, boven, toetsenbordOpen };
}

function meet(): ZichtbareViewport {
  return berekenViewport(
    window.visualViewport,
    document.documentElement.clientHeight || window.innerHeight,
  );
}

function isTekstveld(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return ['text', 'email', 'password', 'search', 'tel', 'url', 'number', ''].includes(el.type);
}

/** De dichtstbijzijnde voorouder die echt scrolt (een ScrollView), of null. */
function scrollContainerVan(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Ruimte tussen het veld en de rand van het zichtbare deel. */
const MARGE = 12;

/**
 * Het actieve veld met zijn label (de omliggende veldcontainer) minimaal in
 * beeld. Bewust géén `scrollIntoView`: dat scrolt ook voorouders met
 * `overflow: hidden` (zoals het kader van de app), waardoor de kop van een
 * formulier alsnog uit beeld schuift. Hier verschuift alleen de eigen
 * scrollcontainer van het formulier, en alleen zoveel als nodig.
 */
function actiefVeldInBeeld() {
  const el = document.activeElement;
  if (!isTekstveld(el)) return;
  // FormField: <View> met label + invoer; die ouder brengt het label mee.
  const doel = el.parentElement ?? el;
  const container = scrollContainerVan(doel);
  if (!container) return;
  const vv = window.visualViewport;
  const c = container.getBoundingClientRect();
  const zichtTop = Math.max(c.top, vv ? vv.offsetTop : c.top) + MARGE;
  const zichtBodem = Math.min(c.bottom, vv ? vv.offsetTop + vv.height : c.bottom) - MARGE;
  const r = doel.getBoundingClientRect();
  if (r.top < zichtTop) {
    container.scrollTop -= zichtTop - r.top;
  } else if (r.bottom > zichtBodem) {
    // Omlaag, maar nooit zo ver dat de bovenkant (het label) verdwijnt.
    container.scrollTop += Math.min(r.bottom - zichtBodem, r.top - zichtTop);
  }
}

let veldTimer: ReturnType<typeof setTimeout> | null = null;
function planVeldInBeeld() {
  if (veldTimer) clearTimeout(veldTimer);
  // Wacht tot het toetsenbord en de nieuwe hoogte zijn doorgevoerd.
  veldTimer = setTimeout(() => requestAnimationFrame(actiefVeldInBeeld), 60);
}

function bijwerken() {
  const nieuw = meet();
  const toetsenbordGingOpen = nieuw.toetsenbordOpen && !huidig.toetsenbordOpen;
  if (
    nieuw.hoogte !== huidig.hoogte ||
    nieuw.boven !== huidig.boven ||
    nieuw.toetsenbordOpen !== huidig.toetsenbordOpen
  ) {
    huidig = nieuw;
    luisteraars.forEach((l) => l());
  }
  if (toetsenbordGingOpen) planVeldInBeeld();
}

function installeer() {
  if (geinstalleerd || typeof window === 'undefined') return;
  geinstalleerd = true;
  const vv = window.visualViewport;
  vv?.addEventListener('resize', bijwerken);
  vv?.addEventListener('scroll', bijwerken);
  window.addEventListener('resize', bijwerken);
  // De app scrolt nooit het document; schuift iOS het toch, zet het terug.
  window.addEventListener('scroll', () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
  });
  // Een element met `overflow: hidden` (zoals het kader van de app) is niet
  // bedoeld om te scrollen, maar de browser verschuift het wél om een
  // gefocust veld of de cursor in beeld te houden. Dat zetten we meteen
  // terug; het formulier zelf (een echte ScrollView) scrolt daarna minimaal.
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (el.scrollTop === 0 && el.scrollLeft === 0) return;
      if (getComputedStyle(el).overflowY !== 'hidden') return;
      el.scrollTop = 0;
      el.scrollLeft = 0;
      if (huidig.toetsenbordOpen) planVeldInBeeld();
    },
    true,
  );
  // Wisselen van veld, of verder typen in een groeiend tekstvak, terwijl het
  // toetsenbord al open is.
  document.addEventListener('focusin', () => {
    if (huidig.toetsenbordOpen) planVeldInBeeld();
  });
  document.addEventListener('input', () => {
    if (huidig.toetsenbordOpen) planVeldInBeeld();
  });
  huidig = meet();
}

function abonneer(luisteraar: () => void): () => void {
  installeer();
  luisteraars.add(luisteraar);
  return () => {
    luisteraars.delete(luisteraar);
  };
}

const snapshot = () => huidig;
const serverSnapshot = () => VOL;

export function useZichtbareViewport(): ZichtbareViewport {
  return useSyncExternalStore(abonneer, snapshot, serverSnapshot);
}

export function useToetsenbordOpen(): boolean {
  return useZichtbareViewport().toetsenbordOpen;
}
