import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ds, type ThemeColors, dsShadowGreen } from '@/theme';
import { useTheme } from '@/providers';

type Props = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  /** Groen gevuld voor de primaire actie op het scherm (meestal "nieuw"). */
  variant?: 'primary' | 'plain';
  disabled?: boolean;
  size?: number;
};

/**
 * Ronde actieknop in de topbalk van een detailscherm.
 *
 * De `(more)`-schermen zitten buiten de tabbalk, dus de zwevende AppFab zou
 * daar los in het niets hangen. Deze knop staat op dezelfde plek als de
 * profielknop op de tabbladen, zodat "de actie van dit scherm" altijd
 * rechtsboven zit.
 */
export function HeaderIconButton({
  icon: Icon,
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  size = 38,
}: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const primair = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.knop,
        { width: size, height: size, borderRadius: size / 2 },
        primair ? styles.primair : styles.plain,
        disabled && styles.uit,
        pressed && !disabled && { opacity: 0.85 },
      ]}
    >
      <Icon
        size={Math.round(size * 0.5)}
        color={primair ? ds.greenInk : t.ink2}
        strokeWidth={primair ? 2.6 : 2}
      />
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    knop: { alignItems: 'center', justifyContent: 'center' },
    primair: { backgroundColor: ds.green, ...dsShadowGreen },
    plain: {
      backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
    },
    uit: { opacity: 0.4 },
  });
