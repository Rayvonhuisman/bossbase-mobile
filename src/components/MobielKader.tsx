import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/providers';
import { bepaalSchermklasse, kolomMax } from '@/lib/schermklasseRegels';

/**
 * Het kader waarbinnen de app staat (iOS en Android).
 *
 * Op een telefoon is dat gewoon het scherm. Op een iPad (en in een breed Split
 * View- of Stage Manager-venster) dezelfde gecentreerde kolom als in de webapp:
 * maximaal 880 punten, formulieren 600 — geen kaarten en regels over de volle
 * breedte van een groot scherm. De toetsenbord- en viewportlogica van de
 * webvariant (`MobielKader.web.tsx`) is hier niet nodig: iOS regelt dat zelf
 * via KeyboardAvoidingView in de formulieren.
 */
export function MobielKader({ children, soort = 'app' }: { children: ReactNode; soort?: 'app' | 'formulier' }) {
  const { width } = useWindowDimensions();
  const { colors: t, colorMode } = useTheme();
  const max = kolomMax(bepaalSchermklasse(width), soort);
  // In een native vel (formulier, kiezer) bepaalt iOS de breedte al zelf; de
  // vensterbreedte zegt daar niets over het vel, dus geen extra kolom.
  if (soort === 'formulier' || width <= max) return <>{children}</>;
  return (
    <View style={[styles.buiten, { backgroundColor: colorMode === 'dark' ? '#000000' : '#E5E7EB' }]}>
      <View style={[styles.kolom, { maxWidth: max, backgroundColor: t.bg, borderColor: t.lineStrong }]}>{children}</View>
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
