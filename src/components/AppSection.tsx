import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { ds, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

type Props = {
  title: string;
  count?: number;
  /** Tappable trailing action label, e.g. "Open week". */
  action?: string;
  onActionPress?: () => void;
  /**
   * `heading` (standaard) is de sectiekop van een scherm: 16px/700 in de
   * tekstkleur, zoals "Planning vandaag" en "Registraties" in het ontwerp.
   * `eyebrow` is het kleine kapitale labeltje boven een groep rijen — het
   * ontwerp gebruikt dat binnen lijstschermen en op kaarten.
   */
  variant?: 'heading' | 'eyebrow';
};

/**
 * De sectiekop uit het goedgekeurde ontwerp, in twee maten.
 *
 * Waarom twee: het ontwerp zet boven een scherm-sectie een gewone kop (16/700)
 * en boven een groep rijen ín een lijst een klein kapitaal labeltje. Eén van de
 * twee overal gebruiken maakt of de lijstschermen luidruchtig, of de
 * scherm-secties onzichtbaar.
 */
export function AppSection({
  title,
  count,
  action,
  onActionPress,
  variant = 'heading',
}: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.row}>
      <View style={styles.titleRow}>
        <Text style={variant === 'eyebrow' ? styles.eyebrow : styles.title}>{title}</Text>
        {typeof count === 'number' ? (
          <Text style={variant === 'eyebrow' ? styles.eyebrowCount : styles.count}>{count}</Text>
        ) : null}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={onActionPress}
          hitSlop={6}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.actionText}>{action}</Text>
          <ChevronRight size={14} color={ds.green700} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 22,
      paddingBottom: 8,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    title: {
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '700',
      color: t.ink,
    },
    count: {
      fontSize: 12.5,
      fontWeight: '600',
      color: t.muted2,
    },
    eyebrow: {
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      letterSpacing: 0.72,
      textTransform: 'uppercase',
      color: t.muted2,
    },
    eyebrowCount: {
      fontSize: 12,
      fontWeight: '600',
      color: t.muted2,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    actionText: {
      fontSize: 13,
      fontWeight: '600',
      color: ds.green700,
    },
  });
