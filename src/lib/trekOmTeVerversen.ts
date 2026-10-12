/**
 * Pull-to-refresh voor de webapp. Op iOS en Android doet `RefreshControl` dat
 * zelf; daar levert deze hook niets. De webvariant staat in
 * `trekOmTeVerversen.web.ts`.
 */
export type TouchGebeurtenis = { nativeEvent: { touches: ArrayLike<{ pageY: number }> } };

export type TrekOmTeVerversen = {
  /** Touch-handlers voor de ScrollView (alleen op web gevuld). */
  handlers: {
    onTouchStart?: (e: TouchGebeurtenis) => void;
    onTouchMove?: (e: TouchGebeurtenis) => void;
    onTouchEnd?: () => void;
  };
  /** Hoe ver er getrokken is (0–1); bij 1 ververst loslaten. */
  voortgang: number;
  /** Of de webindicator bestaat (web: ja; native: RefreshControl). */
  eigenIndicator: boolean;
};

const NIETS: TrekOmTeVerversen = { handlers: {}, voortgang: 0, eigenIndicator: false };

export function useTrekOmTeVerversen(
  _onRefresh: (() => void) | undefined,
  _bovenaan: () => boolean,
): TrekOmTeVerversen {
  return NIETS;
}
