import { useMemo, useRef, useState } from 'react';
import type { TouchGebeurtenis, TrekOmTeVerversen } from './trekOmTeVerversen';

/**
 * Pull-to-refresh in de browser en de geïnstalleerde webapp.
 *
 * react-native-web tekent `RefreshControl` niet, en in een geïnstalleerde app
 * (en met `overscroll-behavior: none` op de pagina) is er ook geen
 * browserverversing. Zonder dit kon je een lijst in de webapp dus nergens
 * verversen. Alleen met aanraking: met een muis of trackpad is er geen
 * "trekken", en daar ververst het scherm al bij focus.
 *
 * Werkt alleen als de lijst helemaal bovenaan staat; verder omlaag is het
 * gewoon scrollen.
 */
const DREMPEL = 70; // pixels trekken (na demping) om te verversen
const DEMPING = 0.5;

export function useTrekOmTeVerversen(
  onRefresh: (() => void) | undefined,
  bovenaan: () => boolean,
): TrekOmTeVerversen {
  const [afstand, setAfstand] = useState(0);
  const startY = useRef<number | null>(null);
  const afstandRef = useRef(0);

  const handlers = useMemo(() => {
    if (!onRefresh) return {};
    const zet = (d: number) => {
      afstandRef.current = d;
      setAfstand(d);
    };
    return {
      onTouchStart: (e: TouchGebeurtenis) => {
        const aanraking = e.nativeEvent.touches[0];
        startY.current = aanraking && bovenaan() ? aanraking.pageY : null;
      },
      onTouchMove: (e: TouchGebeurtenis) => {
        const aanraking = e.nativeEvent.touches[0];
        if (startY.current === null || !aanraking) return;
        const d = (aanraking.pageY - startY.current) * DEMPING;
        // Omhoog vegen, of de lijst is intussen gescrold: geen trekgebaar.
        if (d <= 0 || !bovenaan()) {
          if (afstandRef.current) zet(0);
          return;
        }
        zet(Math.min(d, DREMPEL * 1.4));
      },
      onTouchEnd: () => {
        const ver = afstandRef.current >= DREMPEL;
        startY.current = null;
        if (afstandRef.current) zet(0);
        if (ver) onRefresh();
      },
    };
  }, [onRefresh, bovenaan]);

  return { handlers, voortgang: Math.min(1, afstand / DREMPEL), eigenIndicator: true };
}
