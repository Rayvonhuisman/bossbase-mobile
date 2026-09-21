import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

export type ChipDef<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  chips: ChipDef<T>[];
  active: T;
  onChange: (id: T) => void;
};

/**
 * Canonical filter chips per design — horizontal scroll, active state = dark ink.
 */
export function AppFilterChips<T extends string>({ chips, active, onChange }: Props<T>) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {chips.map((c) => {
        const on = c.id === active;
        return (
          <Pressable
            key={c.id}
            onPress={() => onChange(c.id)}
            style={({ pressed }) => [
              styles.chip,
              on && styles.chipOn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{c.label}</Text>
            {c.count != null ? (
              <View style={[styles.count, on && styles.countOn]}>
                <Text style={[styles.countText, on && styles.countTextOn]}>
                  {c.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
  },
  chipOn: {
    // Het ontwerp maakt de actieve chip DONKER in plaats van groen. Groen is
    // daar voorbehouden aan "nu" en aan primaire acties; een rij groene
    // filterchips zou met de FAB en de actieve tab om aandacht concurreren.
    backgroundColor: t.ink,
    borderColor: 'transparent',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: t.ink,
    letterSpacing: -0.1,
  },
  labelOn: {
    color: t.bg,
    fontWeight: '600',
  },
  count: {
    minWidth: 18,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: t.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countOn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  countText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: t.muted,
  },
  countTextOn: {
    color: t.bg,
  },
});
