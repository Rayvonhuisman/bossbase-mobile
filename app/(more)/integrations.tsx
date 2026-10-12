import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Dialog } from '@/lib/dialog';
import { useRouter } from 'expo-router';
import { CalendarSync, CreditCard, Landmark, Lock } from 'lucide-react-native';
import {
  AppListGroup,
  AppListItem,
  AppScreen,
  AppSection,
  AppTopBar,
  ErrorState,
  LoadingScreen,
  PermissionGate,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  BOEKHOUD_PROVIDERS,
  getIntegratieStand,
  ontkoppelGoogle,
  ontkoppelStripe,
  providerLabel,
  startGoogleKoppeling,
  type IntegratieStand,
} from '@/services/integrationService';
import { useSave } from '@/lib/useSave';
import { formatDateNL } from '@/lib/format';
import { radius, spacing, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Integraties — de echte verbindingsstatus, uit de veilige RPC's.
 *
 * Er staat hier nergens een token: `get_accounting_status()` en
 * `google_calendar_status()` zijn SECURITY DEFINER-functies die alleen een
 * connected-vlag teruggeven, en `authenticated` heeft niet eens SELECT-recht op
 * `accounting_connections`. Koppelen aan Google loopt via de bestaande edge
 * function die de consent-URL ondertekent; de app opent alleen die URL.
 *
 * Ontkoppelen tonen we waar het dashboard dat ook heeft: Google Agenda en
 * Stripe. Een boekhoudkoppeling opzetten vraagt een API-token plus een
 * testronde en blijft daarom desktopwerk — dat is geen mobiele beperking maar
 * de flow zoals hij is.
 */

export default function IntegrationsScreen() {
  return (
    <PermissionGate permission="instellingen" label="Integraties">
      <IntegrationsScreenInhoud />
    </PermissionGate>
  );
}

function IntegrationsScreenInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();

  const [stand, setStand] = useState<IntegratieStand | null>(null);
  const { save, saving, error: saveError } = useSave<null>();

  const magBeheren = mag('integraties', 'wijzigen');

  const load = useCallback(async () => {
    setStand(await getIntegratieStand());
  }, []);


  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load);



  const googleKoppelen = () => {
    save(() => startGoogleKoppeling(), {
      onSuccess: () => {
        Dialog.alert(
          'Google Agenda',
          'Rond de koppeling af in je browser. Kom daarna terug; de status wordt automatisch ' +
            'bijgewerkt.',
        );
      },
    });
  };

  const googleOntkoppelen = () => {
    Dialog.alert(
      'Google Agenda ontkoppelen?',
      'Afspraken worden daarna niet meer gesynchroniseerd. Je agenda bij Google blijft bestaan.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Ontkoppelen',
          style: 'destructive',
          onPress: () => save(() => ontkoppelGoogle(), { onSuccess: () => herlaad() }),
        },
      ],
    );
  };

  const stripeOntkoppelen = () => {
    Dialog.alert(
      'Stripe ontkoppelen?',
      'Betaallinks op facturen werken daarna niet meer. Je account bij Stripe blijft bestaan.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Ontkoppelen',
          style: 'destructive',
          onPress: () => save(() => ontkoppelStripe(), { onSuccess: () => herlaad() }),
        },
      ],
    );
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Koppelingen laden..." />;

  if (!stand) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Integraties" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState
            title="Niet geladen"
            message="De koppelingen konden niet worden opgehaald."
            onRetry={opnieuw}
          />
        </AppScreen>
      </View>
    );
  }

  const badge = (aan: boolean) => (
    <View style={[styles.badge, aan ? styles.badgeAan : styles.badgeUit]}>
      <Text style={[styles.badgeTekst, aan ? styles.badgeTekstAan : styles.badgeTekstUit]}>
        {aan ? 'Gekoppeld' : 'Niet gekoppeld'}
      </Text>
    </View>
  );

  const gekoppeldeBoekhouding = stand.boekhouding.filter((b) => b.connected).length;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Integraties"
            subtitle={`${gekoppeldeBoekhouding + (stand.google?.connected ? 1 : 0) + (stand.stripe?.connected ? 1 : 0)} actief`}
            onBack={() => terugOfNaar(router, '/menu')}
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {saveError ? (
          <View style={styles.foutBanner}>
            <Text style={styles.foutTekst}>{saveError}</Text>
          </View>
        ) : null}

        {stand.fouten.map((f) => (
          <View key={f} style={styles.waarschuwBanner}>
            <Text style={styles.waarschuwTekst}>{f}</Text>
          </View>
        ))}

        <AppSection title="Boekhouding" variant="eyebrow" />
        <AppListGroup>
          {BOEKHOUD_PROVIDERS.map((p, i) => {
            const koppeling = stand.boekhouding.find((b) => b.provider === p.id);
            const aan = koppeling?.connected === true;
            return (
              <AppListItem
                key={p.id}
                first={i === 0}
                icon={Landmark}
                title={providerLabel(p.id)}
                subtitle={
                  aan
                    ? koppeling?.lastSyncedAt
                      ? `Laatst gesynchroniseerd ${formatDateNL(koppeling.lastSyncedAt)}`
                      : 'Gekoppeld, nog niet gesynchroniseerd'
                    : p.id === 'afas'
                      ? // AFAS wordt op het dashboard nog niet uitgerold ("verborgen,
                        // nog niet actief"), en de test die de koppeling bevestigt
                        // kan de app niet draaien. Dan is "koppelen doe je op het
                        // dashboard" geen eerlijke aanwijzing.
                        (koppeling?.reden ?? 'Nog geen werkende koppeling voor dit bedrijf.')
                      : 'Koppelen doe je op het dashboard'
                }
                trailing={badge(aan)}
              />
            );
          })}
        </AppListGroup>

        <AppSection title="Agenda" variant="eyebrow" />
        <AppListGroup>
          <AppListItem
            first
            icon={CalendarSync}
            title="Google Agenda"
            subtitle={
              stand.google?.connected
                ? stand.google.email
                : magBeheren
                  ? 'Tik om te koppelen met je Google-account'
                  : 'Koppelen doet een beheerder'
            }
            trailing={badge(stand.google?.connected === true)}
            onPress={
              magBeheren && !saving
                ? stand.google?.connected
                  ? googleOntkoppelen
                  : googleKoppelen
                : undefined
            }
          />
        </AppListGroup>

        <AppSection title="Betalingen" variant="eyebrow" />
        <AppListGroup>
          <AppListItem
            first
            icon={CreditCard}
            title="Stripe"
            subtitle={
              stand.stripe?.connected
                ? stand.stripe.chargesEnabled
                  ? 'Betaallinks actief'
                  : `Onboarding: ${stand.stripe.onboardingStatus}`
                : 'Instellen doe je op het dashboard'
            }
            trailing={badge(stand.stripe?.connected === true)}
            onPress={
              magBeheren && stand.stripe?.connected && !saving ? stripeOntkoppelen : undefined
            }
          />
        </AppListGroup>

        <AppSection title="Beveiliging" variant="eyebrow" />
        <AppListGroup>
          <AppListItem
            first
            icon={Lock}
            title="Waar staan mijn sleutels?"
            subtitle="Tokens verlaten de server niet"
            onPress={() =>
              Dialog.alert(
                'Veilig gekoppeld',
                'De API-sleutels van je koppelingen staan op de server en zijn voor de app niet ' +
                  'leesbaar — ook niet via een directe aanroep. De app ziet alleen of een ' +
                  'koppeling aan of uit staat.',
              )
            }
          />
        </AppListGroup>

        {!magBeheren ? (
          <Text style={styles.voetnoot}>
            {waaromNiet('integraties', 'wijzigen') ??
              'Koppelingen wijzigen kan alleen een beheerder.'}
          </Text>
        ) : null}
      </AppScreen>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.pill,
    },
    badgeAan: { backgroundColor: t.green50 },
    badgeUit: { backgroundColor: t.statusDraftBg },
    badgeTekst: { fontSize: 11.5, fontWeight: '700' },
    badgeTekstAan: { color: t.greenInk },
    badgeTekstUit: { color: t.statusDraftFg },
    foutBanner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.statusRejectBg,
    },
    foutTekst: { fontSize: 13, fontWeight: '600', color: t.statusRejectFg },
    waarschuwBanner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.statusDraftBg,
    },
    waarschuwTekst: { fontSize: 12.5, fontWeight: '600', color: t.statusDraftFg },
    voetnoot: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
    },
  });
