import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components';
import { useAuth } from '@/providers';

export default function OnboardingLayout() {
  const { status, session } = useAuth();

  if (status === 'restoring') return <LoadingScreen />;
  // Als de gebruiker al ingelogd is, hoort hij niet in de onboarding.
  if (session) return <Redirect href="/(tabs)/today" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#F5F5F1' },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="role" />
      <Stack.Screen name="company" />
      <Stack.Screen name="account" />
      <Stack.Screen name="success" />
    </Stack>
  );
}
