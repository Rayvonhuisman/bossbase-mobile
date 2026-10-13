import { useMemo } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AppTopBar, ErrorState, LoadingScreen } from '@/components';
import { WerkbonFormulier } from '@/components/WerkbonFormulier';
import { useAuth, usePermissions, useTheme } from '@/providers';
import { canCreateWorkOrder } from '@/services/workOrderService';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Nieuwe werkbon — de `WerkbonModal` (modus nieuw) van het dashboard.
 *
 * Policy `werkbonnen_insert` eist `planning` of `werkbonnen_bewerken` (admin
 * valt daaronder), plus een account dat mag schrijven.
 */
export default function NewWorkOrderScreen() {
  const router = useRouter();
  // De klantkaart opent `/work-orders/new?customerId=<id>`.
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();
  const { user, role } = useAuth();
  const { can, hasFeature, readonly, loaded } = usePermissions();
  const { colors: t } = useTheme();

  const magAanmaken = useMemo(
    () =>
      loaded &&
      canCreateWorkOrder({
        userId: user?.id ?? null,
        role,
        can,
        gedeeldeWerkruimte: hasFeature('gedeelde_werkruimte'),
        readonly,
      }),
    [loaded, user?.id, role, can, hasFeature, readonly],
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppTopBar variant="detail" title="Nieuwe werkbon" onBack={() => terugOfNaar(router, '/work-orders')} />
        {!loaded ? (
          <LoadingScreen label="Rechten controleren..." />
        ) : !magAanmaken ? (
          <ErrorState
            title="Geen rechten"
            message={
              readonly
                ? 'Je account staat op alleen-lezen; er kan niets worden aangemaakt.'
                : 'Een werkbon aanmaken kan een beheerder of iemand met het recht planning of werkbonnen bewerken.'
            }
          />
        ) : (
          <WerkbonFormulier
            klantVooraf={typeof customerId === 'string' && customerId ? customerId : null}
            onKlaar={(id) => router.replace(`/work-orders/${id}`)}
          />
        )}
      </View>
    </>
  );
}
