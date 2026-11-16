import { Redirect, Stack } from 'expo-router';
import { HeaderActions, LoadingScreen } from '@/components';
import { useAuth, useTheme } from '@/providers';
import { tx } from '@/i18n';

export default function WorkOrdersLayout() {
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
      <Stack.Screen name="[id]" options={{ title: tx('Werkbon') }} />
      <Stack.Screen name="new" options={{ title: tx('Nieuwe werkbon') }} />
      <Stack.Screen name="bewerk/[id]" options={{ title: tx('Werkbon bewerken') }} />
    </Stack>
  );
}
