import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { ds, dsShadowGreen, radius, spacing, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: Variant;
  loading?: boolean;
};

export function Button({ label, variant = 'primary', loading, disabled, style, ...rest }: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const isDisabled = disabled || loading;
  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        styles[variant],
        isDisabled && styles.disabled,
        state.pressed && !isDisabled && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? ds.greenInk : ds.green700} />
      ) : (
        <Text style={[styles.label, variant === 'primary' ? styles.labelPrimary : styles.labelDark]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    base: {
      height: 52,
      // 16 — de hoek van de primaire knop in het ontwerp.
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    primary: {
      backgroundColor: ds.green,
      // Dezelfde groene gloed als de FAB, zodat de primaire actie op elk
      // scherm hetzelfde gewicht heeft.
      ...dsShadowGreen,
    },
    secondary: {
      backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
    },
    ghost: {
      backgroundColor: 'transparent',
    },
    pressed: {
      opacity: 0.85,
    },
    disabled: {
      opacity: 0.5,
    },
    label: {
      fontSize: 15,
      fontWeight: '700',
    },
    labelPrimary: {
      color: ds.greenInk,
    },
    labelDark: {
      color: t.ink,
    },
  });
