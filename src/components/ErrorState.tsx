import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { Button } from './Button';
import { spacing, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

/**
 * De foutstaat: dezelfde opbouw als `EmptyState`, maar in rood in plaats van
 * groen. Dat verschil is het hele punt — "er staat nog niets" en "het laden is
 * mislukt" mogen er nooit hetzelfde uitzien, want ze vragen iets anders van de
 * gebruiker.
 *
 * De kleuren komen uit de thematokens, zodat het vlak ook in donkere modus
 * leesbaar blijft.
 */
export function ErrorState({
  title = 'Er ging iets mis',
  message = 'Probeer het opnieuw.',
  onRetry,
  retryLabel = 'Opnieuw proberen',
}: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <AlertCircle size={28} color={t.statusRejectFg} strokeWidth={1.8} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <View style={styles.action}>
          <Button label={retryLabel} variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xxl,
      gap: 10,
    },
    icon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: t.statusRejectBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    title: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      color: t.ink,
      textAlign: 'center',
    },
    message: {
      fontSize: 13.5,
      lineHeight: 20,
      color: t.muted,
      textAlign: 'center',
      maxWidth: 320,
    },
    action: {
      marginTop: 8,
      alignSelf: 'stretch',
    },
  });
