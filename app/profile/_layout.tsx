import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components';
import { useAuth } from '@/providers';

/**
 * Profile / account-settings stack. Auth-guarded like the other top-level
 * stacks. The screen renders its own in-page header (back button), so the
 * native header is hidden. Opened from the top-right ProfileSettingsButton.
 */
export default function ProfileLayout() {
  const { status, session } = useAuth();

  if (status === 'restoring' || status === 'loading-profile') {
    return <LoadingScreen />;
  }
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
