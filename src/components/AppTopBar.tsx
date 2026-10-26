import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '@/providers';
import type { ThemeColors } from '@/theme';
import { HeaderActions } from './HeaderActions';
import { ThemeToggleButton } from './ThemeToggleButton';

export type AppTopBarVariant = 'default' | 'detail' | 'compact';

type Props = {
  /** Primary page title. */
  title: string;
  /** Muted line under the title (date, count context, …). */
  subtitle?: string;
  /** Small uppercase label above the title (greeting, company, section). */
  eyebrow?: string;
  /**
   * Tiny green-accented pill on the subtitle line — for a single contextual
   * stat ("3 open", "8u vandaag"). Keep it short.
   */
  meta?: string;
  /** Custom far-left slot. Overrides the built-in back button. */
  leftAction?: ReactNode;
  /** Custom slot left of the profile cluster (e.g. a create/filter button). */
  rightAction?: ReactNode;
  /** Convenience back button (chevron) at the far left. Ignored if leftAction set. */
  onBack?: () => void;
  /** Show the theme + notifications + Boss + profile cluster. Default false (then only the theme toggle). */
  showProfileButton?: boolean;
  /** Visual density. `detail` is for pushed sub-pages (smaller title). */
  variant?: AppTopBarVariant;
};

/**
 * Canonical page header — the large title block used on every screen.
 *
 *   [‹]  EYEBROW                              [action] [🌙] [avatar]
 *        Title
 *        Subtitle · ( meta )
 *
 * - Sits directly on the page background, without its own surface, border or
 *   shadow — exactly like the header in the design.
 * - Owns the top safe-area inset. On scrolling pages it is the FIRST child of
 *   the scroll content (see AppScreen `header` prop), so it scrolls up with the
 *   page and slides under the status-bar scrim; there is no sticky copy.
 * - Theme-aware (light/dark). Green is used only for the small `meta` accent.
 */
export function AppTopBar({
  title,
  subtitle,
  eyebrow,
  meta,
  leftAction,
  rightAction,
  onBack,
  showProfileButton = false,
  variant = 'default',
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const left =
    leftAction ??
    (onBack ? (
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Terug"
        hitSlop={8}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
      >
        <ChevronLeft size={22} color={t.ink} strokeWidth={2.4} />
      </Pressable>
    ) : null);

  const titleStyle =
    variant === 'detail'
      ? styles.titleDetail
      : variant === 'compact'
        ? styles.titleCompact
        : styles.title;

  return (
    <View
      style={[styles.bar, { paddingTop: insets.top + (variant === 'compact' ? 4 : 6) }]}
    >
      <View style={styles.row}>
        {left}

        <View style={styles.center}>
          {eyebrow ? (
            <Text style={styles.eyebrow} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text style={titleStyle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle || meta ? (
            <View style={styles.subRow}>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
              {meta ? (
                <View style={styles.metaPill}>
                  <Text style={styles.metaText} numberOfLines={1}>
                    {meta}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Rechts: eventuele schermactie, dan altijd de themaknop (zelfde plek
            op elke ingelogde pagina), en op hoofdpagina's meldingen, Boss en
            profiel. HeaderActions bevat de themaknop zelf: nooit twee. */}
        <View style={styles.right}>
          {rightAction}
          {showProfileButton ? <HeaderActions /> : <ThemeToggleButton />}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    bar: {
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: t.bgAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      color: t.green700,
      letterSpacing: 0.88,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    title: {
      // Paginatitel uit het ontwerp: 26/700 met een strakke regelhoogte.
      fontSize: 26,
      lineHeight: 30,
      fontWeight: '700',
      color: t.ink,
      letterSpacing: -0.4,
    },
    titleDetail: {
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '700',
      color: t.ink,
      letterSpacing: -0.4,
    },
    titleCompact: {
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '700',
      color: t.ink,
      letterSpacing: -0.3,
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 2,
    },
    subtitle: {
      flexShrink: 1,
      fontSize: 13.5,
      lineHeight: 18,
      color: t.muted,
    },
    metaPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: t.green50,
    },
    metaText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: t.green700,
      letterSpacing: -0.1,
    },
    right: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
  });
