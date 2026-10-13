import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw } from 'lucide-react-native';
import { herlaadNieuweVersie, useNieuweVersie } from '@/lib/pwa';
import { useTheme } from '@/providers';
import { fonts, radius, spacing, type ThemeColors } from '@/theme';

/**
 * "Nieuwe versie beschikbaar" — alleen in de webapp, zodra een nieuwe build
 * klaarstaat (zie `pwa.web.ts`). Herladen gebeurt pas als iemand op de knop
 * tikt, zodat een half ingevuld formulier niet zomaar verdwijnt. Op iOS en
 * Android tekent dit niets.
 */
export function NieuweVersieMelding() {
  const nieuweVersie = useNieuweVersie();
  const insets = useSafeAreaInsets();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  if (!nieuweVersie) return null;

  return (
    <View style={[styles.wrap, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
      <View style={styles.kaart} accessibilityRole="alert">
        <Text style={styles.tekst}>Nieuwe versie beschikbaar</Text>
        <Pressable
          onPress={herlaadNieuweVersie}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.knop, pressed && { opacity: 0.7 }]}
        >
          <RefreshCw size={15} color={t.greenInk} strokeWidth={2.4} />
          <Text style={styles.knopTekst}>Herladen</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      alignItems: 'center',
      zIndex: 1000,
    },
    kaart: {
      width: '100%',
      maxWidth: 440,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      paddingLeft: spacing.lg,
      paddingRight: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      shadowColor: '#0D0D0D',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
    },
    tekst: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', fontFamily: fonts.semibold, color: t.ink },
    knop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: t.green,
    },
    knopTekst: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: t.greenInk },
  });
