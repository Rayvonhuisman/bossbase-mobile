import { voegDialoogToe, type DialogKnop, type DialogOpties } from './dialogStore';

/**
 * Webvariant van `Dialog` (zie `dialog.ts`). De aanvraag gaat in de wachtrij;
 * `DialogHost.web.tsx` in de root-layout tekent hem als toegankelijke modal.
 *
 * Zonder knoppen krijgt de dialoog één "OK", net als `Alert.alert`.
 */
export const Dialog = {
  alert(titel: string, bericht?: string, knoppen?: DialogKnop[], opties?: DialogOpties): void {
    voegDialoogToe({
      titel,
      bericht,
      knoppen: knoppen && knoppen.length > 0 ? knoppen : [{ text: 'OK' }],
      opties,
    });
  },
};

export type { DialogKnop, DialogOpties };
