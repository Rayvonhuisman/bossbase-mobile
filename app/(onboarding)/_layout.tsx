import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components';
import { useAuth } from '@/providers';
import { leesbreedte } from '@/lib/schermklasseRegels';

const ACHTERGROND = '#F5F5F1';

export default function OnboardingLayout() {
  const { status, session } = useAuth();

  if (status === 'restoring') return <LoadingScreen />;
  // Als de gebruiker al ingelogd is, hoort hij niet in de onboarding.
  if (session) return <Redirect href="/(tabs)/today" />;

  // Op een iPad of desktop staat de onboarding in een kolom op leesbreedte in
  // het midden; op een telefoon vult hij het scherm, zoals altijd.
  return (
    <View style={{ flex: 1, backgroundColor: ACHTERGROND }}>
      <View style={{ flex: 1, ...leesbreedte }}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: ACHTERGROND },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="role" />
          <Stack.Screen name="company" />
          <Stack.Screen name="account" />
          <Stack.Screen name="success" />
        </Stack>
      </View>
    </View>
  );
}
