import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppFilterChips, AppScreen, AppTopBar, ErrorState, LoadingScreen } from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  getCompany,
  getCompanySettings,
  type CompanyRow,
  type CompanySettings,
} from '@/services/settingsService';
import { kiesTab, zichtbareTabs, type InstellingenTab } from '@/lib/instellingenRegels';
import { useLaden, type LaadBron } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { ProfielTab } from '@/components/instellingen/ProfielTab';
import { BedrijfTab } from '@/components/instellingen/BedrijfTab';
import { StandaardTab } from '@/components/instellingen/StandaardTab';
import { TemplatesTab } from '@/components/instellingen/TemplatesTab';
import { PipelineTab } from '@/components/instellingen/PipelineTab';
import { VoertuigenTab } from '@/components/instellingen/VoertuigenTab';
import { AbonnementTab } from '@/components/instellingen/AbonnementTab';
import { IntegratiesOverzicht } from '@/components/instellingen/IntegratiesOverzicht';

/**
 * Instellingen — de acht tabs van het dashboard (`InstellingenPage.jsx`), met
 * dezelfde zichtbaarheid:
 *
 *   Mijn profiel       iedereen
 *   Bedrijfsprofiel, Standaardwaarden, E-mailtemplates, Pipeline, Integraties
 *                      recht `instellingen`
 *   Voertuigen         + beheerder + feature `voertuigen`
 *   Abonnement         + beheerder
 *
 * Net als het dashboard heeft deze pagina zelf géén rechtgate: iedereen moet
 * bij zijn eigen profiel kunnen. Zonder het recht `instellingen` wordt er
 * niets van de bedrijfsgegevens geladen. Wijzigen van bedrijfsprofiel,
 * standaardwaarden en pipeline is beheerderswerk (policies op rol).
 *
 * De actieve tab staat in de URL (`?tab=`), zoals in het dashboard.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const { role } = useAuth();
  const { loaded: rechtenGeladen, can, hasFeature, mag } = usePermissions();
  const params = useLocalSearchParams<{ tab?: string }>();

  const magInstellingen = can('instellingen');
  const isAdmin = role === 'admin';
  const tabs = useMemo(
    () => zichtbareTabs({ instellingen: magInstellingen, isAdmin, voertuigen: hasFeature('voertuigen') }),
    [magInstellingen, isAdmin, hasFeature],
  );
  const tab = kiesTab(typeof params.tab === 'string' ? params.tab : null, tabs);
  const zetTab = (id: InstellingenTab) => router.setParams({ tab: id });

  const [instellingen, setInstellingen] = useState<CompanySettings | null>(null);
  const [bedrijf, setBedrijf] = useState<CompanyRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ververs, setVervers] = useState(0);
  // Nieuwe gegevens binnen → formulieren opnieuw opbouwen (via `key`).
  const [versie, setVersie] = useState(0);

  const load = useCallback(async (bron: LaadBron) => {
    setError(null);
    // Alleen bij trekken-om-te-verversen de tabs opnieuw laten laden; bij een
    // focuswissel zou dat een half ingevuld formulier wissen.
    if (bron === 'pull') setVervers((v) => v + 1);
    // Zonder het recht geen bedrijfsdata laden — net als het dashboard.
    if (!magInstellingen) return;
    const [instRes, bedrijfRes] = await Promise.all([getCompanySettings(), getCompany()]);
    if (instRes.error) setError(instRes.error);
    else setInstellingen(instRes.data);
    if (!bedrijfRes.error) setBedrijf(bedrijfRes.data);
    setVersie((v) => v + 1);
  }, [magInstellingen]);

  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, {
    onFout: setError,
    klaarOmTeLaden: rechtenGeladen,
  });

  const magBedrijfWijzigen = mag('bedrijfsinstellingen', 'wijzigen');

  if (!rechtenGeladen || loading) return <LoadingScreen label="Instellingen laden..." />;

  const bedrijfsTabFout = tab !== 'profiel' && tab !== 'integraties' && error;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Instellingen"
            subtitle={tabs.find((x) => x.id === tab)?.label}
            onBack={() => terugOfNaar(router, '/menu')}
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {tabs.length > 1 ? (
          <View style={{ paddingTop: 4 }}>
            <AppFilterChips
              chips={tabs.map((x) => ({ id: x.id, label: x.label }))}
              active={tab}
              onChange={zetTab}
            />
          </View>
        ) : null}

        {bedrijfsTabFout ? (
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        ) : tab === 'profiel' ? (
          <ProfielTab />
        ) : tab === 'bedrijf' ? (
          <BedrijfTab key={versie} bedrijf={bedrijf} magWijzigen={magBedrijfWijzigen} onGewijzigd={herlaad} />
        ) : tab === 'standaard' && instellingen ? (
          <StandaardTab key={versie} instellingen={instellingen} magWijzigen={magBedrijfWijzigen} onGewijzigd={herlaad} />
        ) : tab === 'templates' ? (
          <TemplatesTab key={ververs} magWijzigen={magInstellingen} />
        ) : tab === 'pipeline' ? (
          <PipelineTab key={ververs} isAdmin={isAdmin} />
        ) : tab === 'voertuigen' ? (
          <VoertuigenTab key={ververs} />
        ) : tab === 'abonnement' ? (
          <AbonnementTab key={ververs} />
        ) : tab === 'integraties' ? (
          <IntegratiesOverzicht key={ververs} />
        ) : null}
      </AppScreen>
    </View>
  );
}
