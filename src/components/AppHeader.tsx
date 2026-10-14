import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { ds, type ThemeColors } from '@/theme';
import { HeaderActions } from './HeaderActions';

type Action = {
  /** Optional explicit icon. If omitted, a `+` is used for the primary slot. */
  icon?: ReactNode;
  onPress: () => void;
  /** Primary action — dark ink filled button. */
  primary?: boolean;
  /** Accessibility label (used by VoiceOver / TalkBack). */
  label?: string;
};

type Props = {
  /** Optional kicker shown above the title (date, week, etc.). */
  kicker?: string;
  title: string;
  /** Subtitle line below the title. */
  subtitle?: string;
  /** Trailing icon buttons, rendered left of the header actions. */
  actions?: Action[];
  /** Right-side custom slot — rendered left of the header actions. */
  rightSlot?: ReactNode;
  /**
   * Back affordance. When set, a chevron-left button is rendered at the far
   * left and pressing it calls this handler (typically `router.back()`).
   */
  onBack?: () => void;
  /**
   * Show the canonical header actions (theme toggle + profile avatar) at the
   * far right. Defaults to true so every page gets a consistent entry point.
   */
  showProfileButton?: boolean;
};

/** Dark "ink" surface kept constant across themes (primary action button). */
/** Vaste inkt op het donkere kopvlak. */
const INK_FIXED = ds.greenInk;

/**
 * Canonical header per the design system. Theme-aware (light/dark).
 *
 *   [‹]  Kicker (small muted)
 *        Title  28px ExtraBold        [filter] [PLUS] [THEME] [AVATAR]
 *        Subtitle 13.5px muted
 *
 * The far-right cluster is the theme toggle directly left of the profile/
 * account avatar, on every page by default.
 */
export function AppHeader({
  kicker,
  title,
  subtitle,
  actions,
  rightSlot,
  onBack,
  showProfileButton = true,
}: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Terug"
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <ChevronLeft size={22} color={t.ink} strokeWidth={2.4} />
        </Pressable>
      ) : null}

      <View style={{ flex: 1, minWidth: 0 }}>
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {rightSlot || (actions && actions.length > 0) || showProfileButton ? (
        <View style={styles.right}>
          {rightSlot}
          {actions?.map((a, idx) => (
            <Pressable
              accessibilityRole="button"
              key={idx}
              onPress={a.onPress}
              accessibilityLabel={a.label}
              hitSlop={6}
              style={({ pressed }) => [
                a.primary ? styles.iconBtnPrimary : styles.iconBtnGhost,
                pressed && { opacity: 0.85 },
              ]}
            >
              {a.icon ?? (
                <Plus size={20} color={a.primary ? '#fff' : t.ink} strokeWidth={2.4} />
              )}
            </Pressable>
          ))}
          {showProfileButton ? <HeaderActions /> : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 6,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    kicker: {
      fontSize: 13.5,
      fontWeight: '600',
      color: t.muted,
      letterSpacing: -0.1,
    },
    title: {
      marginTop: 2,
      fontSize: 28,
      fontWeight: '800',
      color: t.ink,
      letterSpacing: -0.7,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13.5,
      color: t.muted,
    },
    right: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 4,
    },
    iconBtnGhost: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnPrimary: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: INK_FIXED,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
