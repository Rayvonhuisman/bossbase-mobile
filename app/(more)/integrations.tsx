import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppScreen, AppTopBar, PermissionGate } from '@/components';
import { useTheme } from '@/providers';
import { IntegratiesOverzicht } from '@/components/instellingen/IntegratiesOverzicht';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Integraties — dezelfde inhoud als de tab Integraties in Instellingen (in het
 * dashboard is het ook een tab van Instellingen). Deze losse route blijft
 * bestaan voor bestaande links; alleen de status, koppelen gaat via het
 * dashboard.
 */
export default function IntegrationsScreen() {
  return (
    <PermissionGate permission="instellingen" label="Integraties">
      <IntegrationsInhoud />
    </PermissionGate>
  );
}

function IntegrationsInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const [ververs, setVervers] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setVervers((v) => v + 1);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Integraties"
            subtitle="Boekhouding en betalingen"
            onBack={() => terugOfNaar(router, '/settings')}
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        <IntegratiesOverzicht key={ververs} />
      </AppScreen>
    </View>
  );
}
