import { useEffect, useRef } from 'react';

/**
 * Een `Modal` van react-native-web zet de focus bij het sluiten niet terug.
 * Wie met een extern toetsenbord werkt (iPad, desktop) belandde na Escape of
 * "Annuleren" op <body> en moest opnieuw beginnen met tabben.
 *
 * We houden daarom bij welk element buiten een vel het laatst focus had. Het
 * moment van openen zelf is te laat: een veld met `autoFocus` in het vel heeft
 * de focus dan al overgenomen. Sluit het vel, dan krijgt dat element zijn
 * focus terug — als het nog op de pagina staat.
 */
let laatsteBuitenVel: HTMLElement | null = null;
let luistert = false;

function luister() {
  if (luistert || typeof document === 'undefined') return;
  luistert = true;
  document.addEventListener(
    'focusin',
    (e) => {
      const el = e.target;
      if (el instanceof HTMLElement && !el.closest('[aria-modal="true"]')) laatsteBuitenVel = el;
    },
    true,
  );
}
luister();

export function useFocusTerug(open: boolean): void {
  const terugNaar = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      terugNaar.current = laatsteBuitenVel;
      return;
    }
    const doel = terugNaar.current;
    terugNaar.current = null;
    if (!doel || !document.contains(doel)) return;
    // Pas als er geen vel meer openstaat: tijdens de sluitanimatie houdt de
    // focusval van de modal de focus nog vast. Hooguit een seconde wachten.
    let frame = 0;
    const start = performance.now();
    const probeer = () => {
      const nogOpen = document.querySelector('[aria-modal="true"]');
      if (nogOpen && performance.now() - start < 1000) {
        frame = requestAnimationFrame(probeer);
        return;
      }
      if (document.contains(doel)) doel.focus({ preventScroll: true });
    };
    frame = requestAnimationFrame(probeer);
    return () => cancelAnimationFrame(frame);
  }, [open]);
}
