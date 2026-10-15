import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Het zichtbare deel van het scherm. Op iOS en Android regelt het
 * besturingssysteem het toetsenbord zelf (met `KeyboardAvoidingView` /
 * `ToetsenbordVlak` waar nodig), dus hoogte en verschuiving hoeven hier niet
 * gemeten te worden. Wél of het toetsenbord open is: dan is de ondermarge voor
 * de homebalk niet nodig (het toetsenbord ligt eroverheen), net als op web.
 * De webvariant staat in `zichtbareViewport.web.ts`.
 */
export type ZichtbareViewport = {
  /** Zichtbare hoogte in pixels, of `null`: gebruik gewoon de volle ruimte. */
  hoogte: number | null;
  /** Hoeveel het zichtbare deel naar beneden is verschoven. */
  boven: number;
  toetsenbordOpen: boolean;
};

const VOL: ZichtbareViewport = { hoogte: null, boven: 0, toetsenbordOpen: false };

const OPEN: ZichtbareViewport = { hoogte: null, boven: 0, toetsenbordOpen: true };

export function useZichtbareViewport(): ZichtbareViewport {
  return useToetsenbordOpen() ? OPEN : VOL;
}

export function useToetsenbordOpen(): boolean {
  const [open, setOpen] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    // iOS meldt het vóór de animatie (zelfde moment als de verschuiving),
    // Android pas erna.
    const toon = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const verberg = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [
      // Een iPad met hardwaretoetsenbord toont alleen de snelkoppelingsbalk;
      // die telt niet als open toetsenbord.
      Keyboard.addListener(toon, (e) => setOpen((e?.endCoordinates?.height ?? 0) > 80)),
      Keyboard.addListener(verberg, () => setOpen(false)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return open;
}
