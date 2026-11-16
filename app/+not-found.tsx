import { Link, Stack, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppTopBar } from '@/components';
import { colors, spacing, typography } from '@/theme';
import { tx } from '@/i18n';

export default function NotFound() {
  const router = useRouter();

  return (
    <>
      {/* The root stack hides its header, so the back affordance lives here. */}
      <Stack.Screen options={{ headerShown: false }} />
      <AppTopBar
        variant="detail"
        title={tx('Niet gevonden')}
        onBack={router.canGoBack() ? () => router.back() : undefined}
      />
      <View style={styles.container}>
        <Text style={styles.title}>{tx('Deze pagina bestaat niet.')}</Text>
        <Link href="/" style={styles.link}>
          {tx('Terug naar start')}
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  link: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: '600',
  },
});
