import { Redirect } from 'expo-router';
import { LoadingScreen } from '@/components';
import { useAuth, useOnboarding } from '@/providers';

export default function Index() {
  const auth = useAuth();
  const onb = useOnboarding();

  // Wacht tot session + onboarding-flag bekend zijn voordat we routen.
  if (auth.status === 'restoring' || auth.status === 'loading-profile' || onb.status === 'restoring') {
    return <LoadingScreen label="Bezig met laden..." />;
  }

  // Ingelogd? → direct naar dashboard.
  if (auth.session) {
    return <Redirect href="/(tabs)/today" />;
  }

  // Niet ingelogd → toon altijd eerst de onboarding-flow.
  // Heeft de gebruiker al een account, dan klikt hij in Welcome op
  // "Ik heb al een account" en wordt doorgestuurd naar /(auth)/login.
  return <Redirect href="/(onboarding)" />;
}
