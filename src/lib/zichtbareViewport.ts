/**
 * Het zichtbare deel van het scherm. Op iOS en Android regelt het
 * besturingssysteem het toetsenbord zelf (met `KeyboardAvoidingView` waar
 * nodig), dus hier valt niets te meten. De webvariant staat in
 * `zichtbareViewport.web.ts`.
 */
export type ZichtbareViewport = {
  /** Zichtbare hoogte in pixels, of `null`: gebruik gewoon de volle ruimte. */
  hoogte: number | null;
  /** Hoeveel het zichtbare deel naar beneden is verschoven. */
  boven: number;
  toetsenbordOpen: boolean;
};

const VOL: ZichtbareViewport = { hoogte: null, boven: 0, toetsenbordOpen: false };

export function useZichtbareViewport(): ZichtbareViewport {
  return VOL;
}

export function useToetsenbordOpen(): boolean {
  return false;
}
