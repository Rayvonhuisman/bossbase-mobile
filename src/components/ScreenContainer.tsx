import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/theme';

type Props = {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  scroll?: boolean;
};

export function ScreenContainer({ title, subtitle, children, scroll = true }: Props) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Body
        style={styles.body}
        contentContainerStyle={scroll ? styles.content : undefined}
      >
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </Body>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
});
