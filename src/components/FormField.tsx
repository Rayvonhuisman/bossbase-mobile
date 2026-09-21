import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

type Props = TextInputProps & {
  label: string;
  hint?: string;
  multiline?: boolean;
};

export function FormField({ label, hint, multiline, style, ...rest }: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={t.muted2}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          style,
        ]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    container: {
      gap: spacing.xs,
    },
    label: {
      ...typography.label,
      color: t.muted2,
    },
    input: {
      minHeight: 48,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: spacing.sm,
      fontSize: 15,
      color: t.ink,
      backgroundColor: t.card,
    },
    inputMultiline: {
      minHeight: 96,
      textAlignVertical: 'top',
      paddingTop: spacing.md,
    },
    hint: {
      ...typography.small,
      color: t.muted,
    },
  });
