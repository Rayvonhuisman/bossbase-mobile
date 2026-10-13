import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/providers';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import { PAUZE_KEUZES } from '@/lib/urenRegels';

/**
 * Pauze kiezen zoals in het dashboard (`UrenVelden.jsx`): vaste knoppen
 * geen / 15 / 30 / 60 minuten, en "anders" voor een vrij aantal minuten.
 * De waarde is altijd een geheel aantal minuten ≥ 0.
 */
export function PauzeKeuze({
  label = 'Pauze',
  waarde,
  onChange,
}: {
  label?: string;
  waarde: number;
  onChange: (minuten: number) => void;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const vast = (PAUZE_KEUZES as readonly number[]).includes(waarde);
  const [anders, setAnders] = useState(!vast);
  const toonAnders = anders || !vast;

  const knop = (sleutel: string, tekst: string, aan: boolean, onPress: () => void) => (
    <Pressable
      key={sleutel}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: aan }}
      style={({ pressed }) => [styles.knop, aan && styles.knopAan, pressed && { opacity: 0.85 }]}
    >
      <Text style={[styles.knopTekst, aan && styles.knopTekstAan]}>{tekst}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rij}>
        {PAUZE_KEUZES.map((m) =>
          knop(String(m), m === 0 ? 'geen' : `${m} min`, !toonAnders && waarde === m, () => {
            setAnders(false);
            onChange(m);
          }),
        )}
        {knop('anders', 'anders', toonAnders, () => setAnders(true))}
      </View>
      {toonAnders ? (
        <TextInput
          value={String(waarde)}
          onChangeText={(v) => onChange(Math.max(0, Math.round(Number(v.replace(',', '.')) || 0)))}
          keyboardType="number-pad"
          placeholder="minuten"
          placeholderTextColor={t.muted2}
          accessibilityLabel="Pauze in minuten"
          style={styles.invoer}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: spacing.xs },
    label: { ...typography.label, color: t.muted2 },
    rij: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    knop: {
      minHeight: 44,
      minWidth: 56,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      backgroundColor: t.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    knopAan: { backgroundColor: t.ink, borderColor: t.ink },
    knopTekst: { fontSize: 14, fontWeight: '600', color: t.ink },
    knopTekstAan: { color: t.bg },
    invoer: {
      minHeight: 48,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      fontSize: 15,
      color: t.ink,
      backgroundColor: t.card,
    },
  });
