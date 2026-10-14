import { type ReactNode, useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { useZichtbareViewport } from '@/lib/zichtbareViewport';
import { useFocusTerug } from '@/lib/focusTerug';
import { bepaalSchermklasse, FORMULIER_MAX } from '@/lib/schermklasseRegels';
import { fonts, radius, spacing, type ThemeColors } from '@/theme';

/**
 * Een zwevend paneel voor Boss, "Bug of idee" en Meldingen — bewust geen
 * schermvullend formulier.
 *
 * - Telefoon (en iPad in Split View): een paneel vanaf de onderkant, tot ~88%
 *   van de zichtbare hoogte, met de app er nog net achter.
 * - iPad en desktop: een gecentreerd paneel van maximaal 600 breed.
 * - Toetsenbord: op web volgen we de zichtbare viewport (zoals `MobielKader`),
 *   op iOS schuift `KeyboardAvoidingView` de invoer omhoog.
 * - Escape (web) en de terugknop (Android) sluiten; de focus gaat daarna terug
 *   naar wat hem had.
 */
export function Paneel({
  open,
  titel,
  subtitel,
  kop,
  onSluit,
  children,
  voet,
}: {
  open: boolean;
  titel: string;
  subtitel?: string;
  /** Eigen element links van de titel (bijv. een avatar). */
  kop?: ReactNode;
  onSluit: () => void;
  children: ReactNode;
  /** Vast onderaan (invoer, knoppen). */
  voet?: ReactNode;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const viewport = useZichtbareViewport();
  const tablet = bepaalSchermklasse(width, Platform.OS) === 'tablet';
  useFocusTerug(open);

  return (
    <Modal visible={open} transparent animationType={tablet ? 'fade' : 'slide'} onRequestClose={onSluit}>
      <View
        style={[
          styles.laag,
          viewport.hoogte !== null && {
            flexGrow: 0,
            flexShrink: 0,
            flexBasis: 'auto',
            height: viewport.hoogte,
            transform: [{ translateY: viewport.boven }],
          },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onSluit}
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.houder, tablet ? styles.houderMidden : styles.houderOnder]}
          pointerEvents="box-none"
        >
          <View
            accessibilityViewIsModal
            style={[
              styles.paneel,
              tablet ? styles.paneelTablet : [styles.paneelTelefoon, { paddingBottom: viewport.toetsenbordOpen ? 0 : insets.bottom }],
            ]}
          >
            <View style={styles.kop}>
              {kop}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.titel} numberOfLines={1}>
                  {titel}
                </Text>
                {subtitel ? (
                  <Text style={styles.subtitel} numberOfLines={1}>
                    {subtitel}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={onSluit}
                accessibilityRole="button"
                accessibilityLabel="Sluiten"
                hitSlop={10}
                style={({ pressed }) => [styles.sluit, pressed && { opacity: 0.6 }]}
              >
                <X size={20} color={t.ink2} />
              </Pressable>
            </View>
            <View style={styles.inhoud}>{children}</View>
            {voet ? <View style={styles.voet}>{voet}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    laag: { flex: 1, backgroundColor: 'rgba(13,13,13,0.45)' },
    houder: { flex: 1, paddingHorizontal: spacing.md },
    houderOnder: { justifyContent: 'flex-end', paddingHorizontal: 0 },
    houderMidden: { justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xl },
    paneel: {
      backgroundColor: t.bg,
      overflow: 'hidden',
      shadowColor: '#0D0D0D',
      shadowOpacity: 0.2,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    paneelTelefoon: {
      width: '100%',
      maxHeight: '88%',
      minHeight: '55%',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    },
    paneelTablet: {
      width: '100%',
      maxWidth: FORMULIER_MAX,
      height: '100%',
      maxHeight: 720,
      borderRadius: radius.xl,
    },
    kop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.line,
    },
    titel: { fontSize: 18, lineHeight: 23, fontWeight: '700', fontFamily: fonts.bold, color: t.ink },
    subtitel: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.regular, color: t.muted, marginTop: 2 },
    sluit: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bgAlt,
    },
    inhoud: { flex: 1, minHeight: 0 },
    voet: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.line,
      backgroundColor: t.card,
    },
  });
