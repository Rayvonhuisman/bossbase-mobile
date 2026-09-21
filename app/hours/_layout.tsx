import { Redirect, Stack } from 'expo-router';
import { HeaderActions, LoadingScreen } from '@/components';
import { useAuth, useTheme } from '@/providers';

/**
 * Stack for hour-entry sub-screens (e.g. /hours/new). The Uren tab itself lives
 * at app/(tabs)/hours.tsx (route /hours); this group only adds /hours/* detail
 * routes — same pattern as app/customers and app/work-orders.
 */
export default function HoursStackLayout() {
  const { status, session } = useAuth();
  const { colors: t } = useTheme();

  if (status === 'restoring' || status === 'loading-profile') {
    return <LoadingScreen />;
  }
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        animation: 'slide_from_right',
        headerTintColor: t.ink,
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: { color: t.ink },
        headerRight: () => <HeaderActions iconSize={32} />,
      }}
    >
      <Stack.Screen name="new" options={{ title: 'Uren toevoegen' }} />
    </Stack>
  );
}
