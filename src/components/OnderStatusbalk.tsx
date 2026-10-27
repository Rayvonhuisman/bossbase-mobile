import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

// Extra ruimte onder de veilige zone. 0: de vervaging van iOS verdwijnt door de
// vaste strook in public/index.html (body::before), zoals in de superadmin-app;
// de inhoud kan dus gewoon direct onder de statusbalk beginnen.
export const VERVAGING_MARGE = 0;

/**
 * Laat de scrollende inhoud pas ónder het Dynamic Island beginnen.
 *
 * De iPhone legt onder de statusbalk een eigen vervaging over webinhoud die
 * eronder door scrolt; daar kan de app niet bovenop. Daarom staat er een vaste
 * strook in de paginakleur (de achtergrond van het scherm eromheen), iets hoger
 * dan de veilige zone, en begint de inhoud daaronder. Binnen deze wrapper is de
 * veilige zone bovenaan 0, zodat koppen die zelf `insets.top` optellen niet
 * dubbel ruimte maken.
 */
export function OnderStatusbalk({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const strook = insets.top > 0 ? insets.top + VERVAGING_MARGE : 0;
  return (
    <View style={{ flex: 1, paddingTop: strook }}>
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>{children}</SafeAreaInsetsContext.Provider>
    </View>
  );
}
