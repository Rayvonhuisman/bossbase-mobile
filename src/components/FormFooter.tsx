import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/providers';
import type { ThemeColors } from '@/theme';
import { Button } from './Button';
import { leesbreedte } from '@/lib/schermklasseRegels';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Foutmelding boven de knop — blijft staan, in tegenstelling tot een toast. */
  error?: string | null;
  /** Regel onder de knop, bijvoorbeeld waarom opslaan niet kan. */
  hint?: string | null;
};

/**
 * De vaste opslagbalk onderaan een formulierscherm, zoals in het goedgekeurde
 * ontwerp.
 *
 * Waarom vast en niet onderaan de pagina: op een formulier van tien velden
 * stond de knop voorheen ná al die velden. Wie halverwege klaar was moest eerst
 * naar beneden scrollen om te kunnen opslaan. Nu is de knop altijd bereikbaar,
 * met de veilige zone van het toestel eronder, zodat hij niet onder de
 * home-indicator valt.
 *
 * De foutmelding staat bewust hier en niet in een toast: hij hoort bij de
 * handeling die de gebruiker net probeerde, en hij hoort te blijven staan.
 */
export function FormFooter({ label, onPress, loading, disabled, error, hint }: Props) {
  const insets = useSafeAreaInsets();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={[styles.balk, { paddingBottom: Math.max(insets.bottom, 16) + 6 }]}>
      <View style={styles.inhoud}>
        {error ? <Text style={styles.fout}>{error}</Text> : null}
        <Button label={label} onPress={onPress} loading={loading} disabled={disabled} />
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    balk: {
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: t.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.line,
    },
    inhoud: { ...leesbreedte, gap: 10 },
    fout: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: t.statusRejectFg,
    },
    hint: {
      fontSize: 12.5,
      lineHeight: 17,
      color: t.muted,
      textAlign: 'center',
    },
  });
