import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { dsShadow, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

type Props = {
  /** Small uppercase label above value. */
  label: string;
  /** Big number / value text. */
  value: string;
  /** Sub-text next to value, e.g. "/ 8 u" or "+12%". */
  sub?: string;
  tone?: 'default' | 'good' | 'warn';
  /** Kleur van het getal zelf: groen voor positief, amber voor "hier ligt nog iets". */
  valueTone?: 'default' | 'good' | 'warn';
};

/**
 * Compact KPI cell used on Vandaag/Uren horizontal strip. Theme-aware.
 */
export function AppKpiCard({ label, value, sub, tone = 'default', valueTone = 'default' }: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const subColor =
    tone === 'warn' ? t.statusWarnFg : tone === 'good' ? t.green700 : t.muted;
  return (
    <View style={[styles.card, dsShadow]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text
          style={[
            styles.value,
            valueTone === 'good' && { color: t.green700 },
            valueTone === 'warn' && { color: t.statusWarnFg },
          ]}
        >
          {value}
        </Text>
        {sub ? <Text style={[styles.sub, { color: subColor }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    card: {
      flex: 1,
      minWidth: 110,
      backgroundColor: t.card,
      borderRadius: t.rMd,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      ...dsShadow,
    },
    label: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      color: t.muted2,
      textTransform: 'uppercase',
      letterSpacing: 0.88,
    },
    valueRow: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    value: {
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '700',
      color: t.ink,
      letterSpacing: -0.4,
    },
    sub: {
      fontSize: 12,
      fontWeight: '600',
    },
  });
