import { Redirect, Stack } from 'expo-router';
import { LoadingScreen } from '@/components';
import { useAuth } from '@/providers';

/**
 * Shared stack for the dashboard/menu sub-pages reached from the menu hub
 * (activities, projects, pipeline, offers, invoices, expenses, materialen,
 * planningbord, database, team, settings, integrations, support).
 *
 * This is a route GROUP — the `(more)` segment does not appear in the URL, so
 * routes are still `/activities`, `/projects`, … Each screen renders its own
 * fixed AppTopBar (variant="detail", with onBack) via AppScreen's `header`
 * prop, so the native header is hidden. Auth is guarded once here for all of
 * them (defense-in-depth; the menu is already gated).
 */
export default function MoreLayout() {
  const { status, session } = useAuth();

  if (status === 'restoring' || status === 'loading-profile') {
    return <LoadingScreen />;
  }
  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
