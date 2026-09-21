import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components';
import { useAuth } from '@/providers';

export default function AuthLayout() {
  const { status, session } = useAuth();

  if (status === 'restoring') {
    return <LoadingScreen />;
  }
  if (session) {
    return <Redirect href="/(tabs)/today" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
