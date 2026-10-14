import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

type Props = {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  padding?: number;
  /** Visual: 'card' (default white+shadow) or 'flat' (no shadow). */
  variant?: 'card' | 'flat';
};

/**
 * Canonical white card per design — soft drop shadow, 14px radius, no border.
 */
export function AppCard({ children, style, onPress, padding = 14, variant = 'card' }: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const base = [
    styles.card,
    variant === 'card' && dsShadow,
    { padding },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [...base, pressed && { opacity: 0.92 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  card: {
    backgroundColor: t.card,
    borderRadius: ds.rMd,
    overflow: 'hidden',
    // Het ontwerp scheidt kaarten met een haarlijn én een heel lichte schaduw.
    // De rand doet het meeste werk; de schaduw geeft alleen diepte, zodat een
    // lijst met tien kaarten rustig blijft.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.line,
    ...dsShadow,
  },
});
