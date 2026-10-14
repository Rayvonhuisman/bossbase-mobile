import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

type Props = {
  title: string;
  subtitle?: string;
  /** Leading icon (lucide). */
  icon?: LucideIcon;
  /** Custom leading element (e.g. initials avatar) — overrides `icon`. */
  leading?: ReactNode;
  /** Trailing content (badge, amount). Falls back to a chevron when onPress is set. */
  trailing?: ReactNode;
  first?: boolean;
  onPress?: () => void;
};

/**
 * Canonical list row used by the menu/dashboard pages. Grouped rows share a
 * card via the `<AppListGroup>` wrapper; pass `first` to suppress the top
 * border on the first row.
 */
export function AppListItem({ title, subtitle, icon: Icon, leading, trailing, first, onPress }: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const body = (
    <View style={[styles.row, !first && styles.rowBorder]}>
      {leading ? (
        leading
      ) : Icon ? (
        <View style={styles.icon}>
          <Icon size={18} color={t.ink2} strokeWidth={2} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <ChevronRight size={16} color={t.muted2} strokeWidth={2} /> : null)}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      {body}
    </Pressable>
  );
}

export function AppListGroup({ children }: { children: ReactNode }) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return <View style={styles.group}>{children}</View>;
}

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  group: {
    marginHorizontal: 16,
    backgroundColor: t.card,
    borderRadius: ds.rLg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.line,
    ...dsShadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.line,
  },
  icon: {
    // Icoonvlak uit het ontwerp: 40×40 op radius 12, in het tweede vlak.
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: t.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: t.ink,
    letterSpacing: -0.1,
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 17,
    color: t.muted,
    marginTop: 2,
  },
});
