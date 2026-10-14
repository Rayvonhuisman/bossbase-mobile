import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { radius, spacing, typography, type ThemeColors } from '@/theme';

export type Lid = { id: string; full_name: string };

/**
 * Meerdere teamleden kiezen (de app-versie van `MemberMultiSelect`): chips
 * die aan/uit gaan. Leeg = niemand toegewezen.
 */
export function LedenKeuze({
  label,
  leden,
  waarde,
  onChange,
  disabled = false,
}: {
  label: string;
  leden: Lid[];
  waarde: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const wissel = (id: string) =>
    onChange(waarde.includes(id) ? waarde.filter((x) => x !== id) : [...waarde, id]);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      {leden.length === 0 ? (
        <Text style={styles.leeg}>Geen teamleden</Text>
      ) : (
        <View style={styles.rij}>
          {leden.map((l) => {
            const aan = waarde.includes(l.id);
            return (
              <Pressable
                key={l.id}
                disabled={disabled}
                onPress={() => wissel(l.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: aan, disabled }}
                aria-checked={aan}
                style={({ pressed }) => [
                  styles.chip,
                  aan && styles.chipAan,
                  disabled && { opacity: 0.5 },
                  pressed && { opacity: 0.8 },
                ]}
              >
                {aan ? <Check size={14} color={t.green700} /> : null}
                <Text style={[styles.chipTekst, aan && styles.chipTekstAan]}>{l.full_name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    label: { ...typography.label, color: t.ink2 },
    leeg: { fontSize: 13, color: t.muted },
    rij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipAan: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    chipTekstAan: { color: t.green700 },
  });
