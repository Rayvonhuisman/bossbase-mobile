import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/providers';
import { bepaalSchermklasse, kolomMax } from '@/lib/schermklasseRegels';

/**
 * Het kader waarbinnen de app staat, in de iOS- en Android-app. Op een
 * telefoon is dat het scherm zelf. Op een iPad (of Android-tablet) dezelfde
 * gecentreerde kolom als in de webapp (`MobielKader.web.tsx`): maximaal 880
 * breed, formulieren 600, zodat kaarten en regels niet over het hele scherm
 * uitrekken — staand en liggend.
 */
export function MobielKader({ children, soort = 'app' }: { children: ReactNode; soort?: 'app' | 'formulier' }) {
  const { colors: t, colorMode } = useTheme();
  const { width } = useWindowDimensions();
  const maxBreedte = kolomMax(bepaalSchermklasse(width), soort);
  if (width <= maxBreedte) return <>{children}</>;
  return (
    <View style={[styles.buiten, { backgroundColor: colorMode === 'dark' ? '#000000' : '#E5E7EB' }]}>
      <View style={[styles.kolom, { maxWidth: maxBreedte, backgroundColor: t.bg, borderColor: t.lineStrong }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  buiten: { flex: 1, alignItems: 'center' },
  kolom: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
});
