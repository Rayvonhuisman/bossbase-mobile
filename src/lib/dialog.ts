import { Alert } from 'react-native';
import type { DialogKnop, DialogOpties } from './dialogStore';

/**
 * Eén manier om een dialoog te tonen, op elk platform.
 *
 * Dezelfde aanroep als `Alert.alert` — titel, bericht, knoppen, opties — zodat
 * elke bestaande dialoog zijn labels en acties houdt. Op iOS en Android is dit
 * letterlijk `Alert.alert`: de systeemdialoog blijft wat hij was.
 *
 * Op web is `Alert` in react-native-web een lege functie: de dialoog verschijnt
 * niet en de knoppen worden nooit aangeroepen, dus uitloggen of verwijderen
 * gebeurt dan stilletjes níét. Daarvoor bestaat `dialog.web.ts`, dat dezelfde
 * aanvraag als eigen modal tekent.
 */
export const Dialog = {
  alert(titel: string, bericht?: string, knoppen?: DialogKnop[], opties?: DialogOpties): void {
    Alert.alert(titel, bericht, knoppen, opties);
  },
};

export type { DialogKnop, DialogOpties };
