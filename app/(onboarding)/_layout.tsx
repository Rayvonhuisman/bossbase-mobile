import { View } from 'react-native';
import { Redirect, Stack, useSegments } from 'expo-router';
import { LoadingScreen } from '@/components';
import { useAuth } from '@/providers';
import { leesbreedte } from '@/lib/schermklasseRegels';

const ACHTERGROND = '#F5F5F1';

export default function OnboardingLayout() {
  const { status, session } = useAuth();
  const segments = useSegments();
  const scherm = segments[segments.length - 1];

  if (status === 'restoring') return <LoadingScreen />;
  if (session) {
    // Net geregistreerd of nooit bevestigd: eerst de code, zoals de gate van het dashboard.
    if (status === 'needs-verification') {
      if (scherm !== 'verify') return <Redirect href="/(onboarding)/verify" />;
    } else if (status !== 'loading-profile' && scherm !== 'verify' && scherm !== 'success') {
      // Ingelogd en klaar: hoort niet in de onboarding. Het codescherm en het
      // successcherm blijven staan, want daar komt de gebruiker juist ingelogd
      // aan (na de code). Tijdens 'loading-profile' (meteen na signUp) blijft
      // de stapel staan in plaats van te verspringen.
      return <Redirect href="/(tabs)/today" />;
    }
  }

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
          <Stack.Screen name="pakket" />
          <Stack.Screen name="company" />
          <Stack.Screen name="account" />
          <Stack.Screen name="verify" options={{ gestureEnabled: false }} />
          <Stack.Screen name="success" />
        </Stack>
      </View>
    </View>
  );
}
