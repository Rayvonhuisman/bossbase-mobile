import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AppTopBar, ErrorState, LoadingScreen } from '@/components';
import { WerkbonFormulier } from '@/components/WerkbonFormulier';
import { useAuth, usePermissions, useTheme } from '@/providers';
import { canManageWerkbonnen, getWorkOrder, type Werkbon } from '@/services/workOrderService';
import { terugOfNaar } from '@/lib/navigatie';
import { useLaden } from '@/lib/useLaden';
import { tx } from '@/i18n';

/**
 * Werkbon bewerken — `WerkbonModal` (modus bewerken) van het dashboard. Alleen
 * voor wie werkbonnen beheert (admin of `werkbonnen_bewerken`), net als
 * de knop "Bewerken" op kantoor.
 */
export default function BewerkWerkbonScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, role } = useAuth();
  const { can, hasFeature, readonly, loaded } = usePermissions();
  const { colors: t } = useTheme();
  const [werkbon, setWerkbon] = useState<Werkbon | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const laad = useCallback(async () => {
    if (!id) return;
    const res = await getWorkOrder(id);
    if (res.error || !res.data) setFout(res.error ?? tx('Deze werkbon bestaat niet of je hebt er geen toegang toe.'));
    else {
      setFout(null);
      setWerkbon((huidig) => huidig ?? res.data);
    }
  }, [id]);
  const { loading, opnieuw } = useLaden(laad, { onFout: setFout, bijFocus: false });

  // Werkbonbeheer, of het recht planning: ook de planner past dagen, ploeg en
  // voertuigen aan, zoals vanuit de planning van het dashboard (RLS werkbonnen_update
  // staat `planning` toe).
  const mag = useMemo(
    () =>
      loaded &&
      !readonly &&
      (canManageWerkbonnen({ userId: user?.id ?? null, role, can, gedeeldeWerkruimte: hasFeature('gedeelde_werkruimte'), readonly }) ||
        can('planning')),
    [loaded, readonly, user?.id, role, can, hasFeature],
  );

  const terug = () => terugOfNaar(router, id ? `/work-orders/${id}` : '/work-orders');

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppTopBar variant="detail" title={tx('Werkbon bewerken')} onBack={terug} />
        {!loaded || (loading && !werkbon) ? (
          <LoadingScreen label={tx('Werkbon laden...')} />
        ) : !mag ? (
          <ErrorState
            title={tx('Geen rechten')}
            message={tx('Bewerken kan een beheerder of iemand met het recht werkbonnen bewerken.')}
          />
        ) : fout || !werkbon ? (
          <ErrorState title={tx('Werkbon niet gevonden')} message={fout ?? tx('Probeer het opnieuw.')} onRetry={opnieuw} />
        ) : (
          <WerkbonFormulier werkbon={werkbon} onKlaar={() => terug()} />
        )}
      </View>
    </>
  );
}
