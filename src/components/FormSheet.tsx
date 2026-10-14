import { useMemo, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Button } from './Button';
import { MobielKader } from './MobielKader';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';
import { useToetsenbordOpen } from '@/lib/zichtbareViewport';
import { useFocusTerug } from '@/lib/focusTerug';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** Foutmelding van de laatste opslagpoging. Blijft staan tot het lukt. */
  error?: string | null;
  /** True zolang de opslagactie loopt: knop uit, sluiten geblokkeerd. */
  saving?: boolean;
  submitLabel?: string;
  /** Uit wanneer het formulier ongeldig is. */
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
  /** Extra actie links onderin, bijvoorbeeld verwijderen. */
  destructive?: { label: string; onPress: () => void };
};

/**
 * Het formulier voor elke schrijfactie in de app.
 *
 * Twee dingen zitten hier bewust in plaats van in elk scherm apart:
 *
 * 1. Tijdens het opslaan is de knop uit én is sluiten geblokkeerd. Twee keer
 *    tikken op "Opslaan" is de makkelijkste manier om twee identieke rijen te
 *    maken, en een insert is niet vanzelf idempotent.
 * 2. De foutmelding staat bóven de knop en verdwijnt niet vanzelf. Een toast
 *    die na drie seconden weg is, is precies hoe een mislukte opslag voor een
 *    geslaagde wordt aangezien.
 */
export function FormSheet({
  visible,
  title,
  subtitle,
  error,
  saving = false,
  submitLabel = 'Opslaan',
  submitDisabled = false,
  onSubmit,
  onClose,
  children,
  destructive,
}: Props) {
  const { colors: t } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(t), [t]);
  // Web: ligt het toetsenbord over de homebalk, dan is die ruimte niet nodig.
  // Native: altijd false.
  const toetsenbordOpen = useToetsenbordOpen();
  // Web: na sluiten (ook met Escape) de focus terug naar de knop die het opende.
  useFocusTerug(visible);

  // Tijdens het opslaan mag het formulier niet dicht: anders verdwijnt de
  // uitkomst voordat iemand hem gezien heeft.
  const sluit = () => {
    if (saving) return;
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={sluit}
    >
      {/* Op web staat het vel op telefoonbreedte, net als de app eronder. */}
      <MobielKader soort="formulier">
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: t.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <Pressable
            onPress={sluit}
            disabled={saving}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Sluiten"
            style={[styles.closeBtn, saving && styles.closeBtnUit]}
          >
            <X size={20} color={t.ink2} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          // Native: toetsenbord weg bij slepen. Op web niet: react-native-web
          // sluit het toetsenbord dan bij élk scroll-event, ook als de browser
          // het actieve veld zelf in beeld scrolt — en dan raakt het veld zijn
          // focus kwijt zodra het toetsenbord opent.
          keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
        >
          {children}
        </ScrollView>

        {/* Ondermarge uit de safe-area: minimaal 20, meer op een toestel met
            homebalk. Zo blijft de knop op elke iPhone bereikbaar. */}
        <View
          style={[
            styles.footer,
            { paddingBottom: toetsenbordOpen ? 12 : Math.max(insets.bottom, 20) },
          ]}
        >
          {error ? (
            <View style={styles.foutBanner}>
              <Text style={styles.foutTekst}>{error}</Text>
            </View>
          ) : null}
          <Button
            label={submitLabel}
            onPress={onSubmit}
            loading={saving}
            disabled={submitDisabled || saving}
          />
          {destructive ? (
            <Pressable
              onPress={destructive.onPress}
              disabled={saving}
              style={styles.destructive}
              accessibilityRole="button"
            >
              <Text style={[styles.destructiveTekst, saving && { opacity: 0.4 }]}>
                {destructive.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
      </MobielKader>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.line,
    },
    title: { fontSize: 19, lineHeight: 24, fontWeight: '700', color: t.ink },
    subtitle: { fontSize: 12.5, lineHeight: 17, color: t.muted, marginTop: 2 },
    closeBtn: {
      // 36 rond op het tweede vlak — de sluitknop uit het ontwerp.
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bgAlt,
    },
    closeBtnUit: { opacity: 0.4 },
    body: {
      padding: spacing.lg,
      gap: spacing.lg,
      paddingBottom: spacing.xl,
    },
    footer: {
      // Het ontwerp zet de knopzone op een eigen vel met ronde bovenhoeken en
      // ruime onderruimte (`28px 28px 0 0`, `padding 10px 20px 44px`). De
      // onderruimte komt hier uit de safe-area, zodat de knop op een iPhone met
      // homebalk niet onder de streep valt en op een kleiner toestel geen
      // onnodige lucht krijgt.
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.md,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: t.card,
      shadowColor: '#0D0D0D',
      shadowOpacity: 0.12,
      shadowRadius: 40,
      shadowOffset: { width: 0, height: -10 },
      elevation: 12,
    },
    foutBanner: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: t.statusRejectBg,
    },
    foutTekst: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: t.statusRejectFg,
    },
    destructive: { alignItems: 'center', paddingVertical: spacing.sm },
    destructiveTekst: { fontSize: 14, fontWeight: '700', color: t.statusRejectFg },
  });
