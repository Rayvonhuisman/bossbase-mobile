import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BadgePercent,
  Building2,
  CalendarClock,
  Car,
  Euro,
  Percent,
  Pencil,
  Plug,
} from 'lucide-react-native';
import {
  AppListGroup,
  AppListItem,
  AppScreen,
  AppSection,
  AppTopBar,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  PermissionGate,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  getCompany,
  getCompanySettings,
  updateCompany,
  upsertCompanySettings,
  type CompanyRow,
  type CompanySettings,
} from '@/services/settingsService';
import { useSave } from '@/lib/useSave';
import { formatEUR } from '@/lib/format';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';

/**
 * Bedrijfsinstellingen — `bedrijfsinstellingen` (tarieven, btw, agenda) en
 * `companies` (bedrijfsgegevens), dezelfde twee tabellen als het dashboard.
 *
 * Zien mag iedereen met het recht `instellingen`; WIJZIGEN vraagt op allebei de
 * tabellen rol admin. Dat is een rolvergelijking in de policy en geen recht: een
 * medewerker mét het recht komt langs de menu-gate en niet langs de policy. De
 * app toont daarom wel de pagina en niet de bewerkknop, in plaats van een knop
 * die gegarandeerd op 42501 uitkomt.
 */

export default function SettingsScreen() {
  return (
    <PermissionGate permission="instellingen" label="Bedrijfsinstellingen">
      <SettingsScreenInhoud />
    </PermissionGate>
  );
}

type TariefConcept = {
  uurtarief: string;
  reiskosten: string;
  marge: string;
  btw: string;
  geldigDagen: string;
  btwStelsel: string;
  agendaStart: string;
  agendaEind: string;
  autoSync: boolean;
};

type BedrijfConcept = {
  name: string;
  kvk: string;
  btwNummer: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  website: string;
};

function SettingsScreenInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { company } = useAuth();
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();

  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [bedrijf, setBedrijf] = useState<CompanyRow | null>(null);  const [error, setError] = useState<string | null>(null);

  const [tarieven, setTarieven] = useState<TariefConcept | null>(null);
  const [gegevens, setGegevens] = useState<BedrijfConcept | null>(null);

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();

  const magWijzigen = mag('bedrijfsinstellingen', 'wijzigen');

  const load = useCallback(async () => {
    setError(null);
    const [instRes, bedrijfRes] = await Promise.all([getCompanySettings(), getCompany()]);
    if (instRes.error) setError(instRes.error);
    else setSettings(instRes.data);
    if (!bedrijfRes.error) setBedrijf(bedrijfRes.data);
  }, []);


  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });



  const openTarieven = () => {
    if (!settings || !magWijzigen) return;
    setSaveError(null);
    setTarieven({
      uurtarief: String(settings.uurtarief),
      reiskosten: String(settings.reiskosten_per_km),
      marge: String(settings.standaard_marge),
      btw: String(settings.btw_pct),
      geldigDagen: String(settings.offerte_geldig_dagen),
      btwStelsel: settings.btw_stelsel,
      agendaStart: String(settings.agenda_start_uur),
      agendaEind: String(settings.agenda_eind_uur),
      autoSync: settings.auto_sync_google_calendar,
    });
  };

  const openGegevens = () => {
    if (!magWijzigen) return;
    setSaveError(null);
    setGegevens({
      name: bedrijf?.name ?? company?.name ?? '',
      kvk: bedrijf?.kvk ?? '',
      btwNummer: bedrijf?.btw_number ?? '',
      email: bedrijf?.email ?? '',
      phone: bedrijf?.phone ?? '',
      address: bedrijf?.address ?? '',
      postalCode: bedrijf?.postal_code ?? '',
      city: bedrijf?.city ?? '',
      website: bedrijf?.website ?? '',
    });
  };

  const tarievenOpslaan = () => {
    if (!tarieven) return;
    const getal = (v: string) => Number(v.replace(',', '.'));
    save(
      () =>
        upsertCompanySettings({
          uurtarief: getal(tarieven.uurtarief),
          reiskosten_per_km: getal(tarieven.reiskosten),
          standaard_marge: getal(tarieven.marge),
          btw_pct: getal(tarieven.btw),
          offerte_geldig_dagen: Number(tarieven.geldigDagen),
          btw_stelsel: tarieven.btwStelsel,
          agenda_start_uur: Number(tarieven.agendaStart),
          agenda_eind_uur: Number(tarieven.agendaEind),
          auto_sync_google_calendar: tarieven.autoSync,
        }),
      {
        onSuccess: async () => {
          setTarieven(null);
          await herlaad();
        },
      },
    );
  };

  const gegevensOpslaan = () => {
    if (!gegevens) return;
    save(
      () =>
        updateCompany({
          name: gegevens.name,
          kvk: gegevens.kvk,
          btw_number: gegevens.btwNummer,
          email: gegevens.email,
          phone: gegevens.phone,
          address: gegevens.address,
          postal_code: gegevens.postalCode,
          city: gegevens.city,
          website: gegevens.website,
        }),
      {
        onSuccess: async () => {
          setGegevens(null);
          await herlaad();
        },
      },
    );
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Instellingen laden..." />;

  if (error || !settings) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={
            <AppTopBar variant="detail" title="Bedrijfsinstellingen" onBack={() => router.back()} />
          }
        >
          <ErrorState
            title="Niet geladen"
            message={error ?? 'De instellingen konden niet worden geladen.'}
            onRetry={opnieuw}
          />
        </AppScreen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Bedrijfsinstellingen"
            subtitle={bedrijf?.name ?? company?.name ?? 'Bedrijf'}
            onBack={() => router.back()}
            rightAction={
              magWijzigen ? (
                <HeaderIconButton
                  icon={Pencil}
                  label="Tarieven bewerken"
                  onPress={openTarieven}
                />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {!magWijzigen ? (
          <View style={styles.uitlegBanner}>
            <Text style={styles.uitlegTekst}>
              {waaromNiet('bedrijfsinstellingen', 'wijzigen') ??
                'Je kunt de instellingen bekijken maar niet wijzigen.'}
            </Text>
          </View>
        ) : null}

        <AppSection title="Tarieven en marge" variant="eyebrow" />
        <AppListGroup>
          <AppListItem
            first
            icon={Euro}
            title="Uurtarief"
            subtitle="Standaardtarief op offertes en werkbonnen"
            trailing={<Text style={styles.waarde}>{formatEUR(settings.uurtarief)}</Text>}
            onPress={magWijzigen ? openTarieven : undefined}
          />
          <AppListItem
            icon={Car}
            title="Kilometervergoeding"
            subtitle="Per gereden kilometer"
            trailing={<Text style={styles.waarde}>{formatEUR(settings.reiskosten_per_km)}</Text>}
            onPress={magWijzigen ? openTarieven : undefined}
          />
          <AppListItem
            icon={BadgePercent}
            title="Standaardmarge"
            subtitle="Voorstel bij een nieuwe offerte"
            trailing={<Text style={styles.waarde}>{settings.standaard_marge}%</Text>}
            onPress={magWijzigen ? openTarieven : undefined}
          />
        </AppListGroup>

        <AppSection title="Btw en offertes" variant="eyebrow" />
        <AppListGroup>
          <AppListItem
            first
            icon={Percent}
            title="Btw-percentage"
            subtitle="Standaard op nieuwe offertes en facturen"
            trailing={<Text style={styles.waarde}>{settings.btw_pct}%</Text>}
            onPress={magWijzigen ? openTarieven : undefined}
          />
          <AppListItem
            icon={Percent}
            title="Btw-stelsel"
            subtitle="Bepaalt wanneer btw wordt afgedragen"
            trailing={
              <Text style={styles.waarde}>
                {settings.btw_stelsel === 'kas' ? 'Kasstelsel' : 'Factuurstelsel'}
              </Text>
            }
            onPress={magWijzigen ? openTarieven : undefined}
          />
          <AppListItem
            icon={CalendarClock}
            title="Offerte geldig"
            subtitle="Aantal dagen na versturen"
            trailing={<Text style={styles.waarde}>{settings.offerte_geldig_dagen} dagen</Text>}
            onPress={magWijzigen ? openTarieven : undefined}
          />
        </AppListGroup>

        <AppSection title="Bedrijfsgegevens" variant="eyebrow" />
        <AppListGroup>
          <AppListItem
            first
            icon={Building2}
            title={bedrijf?.name ?? company?.name ?? 'Bedrijf'}
            subtitle={
              [bedrijf?.address, bedrijf?.postal_code, bedrijf?.city].filter(Boolean).join(', ') ||
              'Adres, KvK en btw-nummer'
            }
            onPress={magWijzigen ? openGegevens : undefined}
          />
        </AppListGroup>

        <AppSection title="Koppelingen" variant="eyebrow" />
        <AppListGroup>
          <AppListItem
            first
            icon={Plug}
            title="Integraties"
            subtitle="Boekhouding, agenda en betaallink"
            onPress={() => router.push('/integrations')}
          />
        </AppListGroup>
      </AppScreen>

      {/* Tarieven, btw en agenda */}
      <FormSheet
        visible={tarieven !== null}
        title="Tarieven en btw"
        error={saveError}
        saving={saving}
        onSubmit={tarievenOpslaan}
        onClose={() => setTarieven(null)}
      >
        <View style={styles.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Uurtarief"
              value={tarieven?.uurtarief ?? ''}
              onChangeText={(v) => setTarieven((c) => (c ? { ...c, uurtarief: v } : c))}
              placeholder="55"
              keyboardType="decimal-pad"
              hint="euro per uur"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Per kilometer"
              value={tarieven?.reiskosten ?? ''}
              onChangeText={(v) => setTarieven((c) => (c ? { ...c, reiskosten: v } : c))}
              placeholder="0,23"
              keyboardType="decimal-pad"
              hint="euro per km"
            />
          </View>
        </View>

        <View style={styles.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Standaardmarge"
              value={tarieven?.marge ?? ''}
              onChangeText={(v) => setTarieven((c) => (c ? { ...c, marge: v } : c))}
              placeholder="25"
              keyboardType="decimal-pad"
              hint="procent"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Btw"
              value={tarieven?.btw ?? ''}
              onChangeText={(v) => setTarieven((c) => (c ? { ...c, btw: v } : c))}
              placeholder="21"
              keyboardType="decimal-pad"
              hint="procent"
            />
          </View>
        </View>

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>Btw-stelsel</Text>
          <View style={styles.chipRij}>
            {[
              { id: 'factuur', label: 'Factuurstelsel' },
              { id: 'kas', label: 'Kasstelsel' },
            ].map((s) => {
              const actief = tarieven?.btwStelsel === s.id;
              return (
                <Text
                  key={s.id}
                  onPress={() => setTarieven((c) => (c ? { ...c, btwStelsel: s.id } : c))}
                  style={[styles.chip, actief && styles.chipActief]}
                >
                  {s.label}
                </Text>
              );
            })}
          </View>
        </View>

        <FormField
          label="Offerte geldig (dagen)"
          value={tarieven?.geldigDagen ?? ''}
          onChangeText={(v) => setTarieven((c) => (c ? { ...c, geldigDagen: v } : c))}
          placeholder="14"
          keyboardType="number-pad"
        />

        <View style={styles.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Agenda start"
              value={tarieven?.agendaStart ?? ''}
              onChangeText={(v) => setTarieven((c) => (c ? { ...c, agendaStart: v } : c))}
              placeholder="7"
              keyboardType="number-pad"
              hint="uur"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Agenda eind"
              value={tarieven?.agendaEind ?? ''}
              onChangeText={(v) => setTarieven((c) => (c ? { ...c, agendaEind: v } : c))}
              placeholder="19"
              keyboardType="number-pad"
              hint="uur"
            />
          </View>
        </View>

        <View style={styles.schakelRij}>
          <View style={{ flex: 1 }}>
            <Text style={styles.schakelTitel}>Agenda automatisch synchroniseren</Text>
            <Text style={styles.schakelUitleg}>
              Zet afspraken automatisch in de gekoppelde Google Agenda.
            </Text>
          </View>
          <Switch
            value={tarieven?.autoSync ?? false}
            onValueChange={(v) => setTarieven((c) => (c ? { ...c, autoSync: v } : c))}
            disabled={saving}
          />
        </View>
      </FormSheet>

      {/* Bedrijfsgegevens */}
      <FormSheet
        visible={gegevens !== null}
        title="Bedrijfsgegevens"
        subtitle="Deze gegevens staan op je offertes en facturen"
        error={saveError}
        saving={saving}
        submitDisabled={!gegevens?.name.trim()}
        onSubmit={gegevensOpslaan}
        onClose={() => setGegevens(null)}
      >
        <FormField
          label="Bedrijfsnaam"
          value={gegevens?.name ?? ''}
          onChangeText={(v) => setGegevens((c) => (c ? { ...c, name: v } : c))}
          placeholder="Bedrijfsnaam"
        />
        <View style={styles.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="KvK-nummer"
              value={gegevens?.kvk ?? ''}
              onChangeText={(v) => setGegevens((c) => (c ? { ...c, kvk: v } : c))}
              placeholder="12345678"
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1.3 }}>
            <FormField
              label="Btw-nummer"
              value={gegevens?.btwNummer ?? ''}
              onChangeText={(v) => setGegevens((c) => (c ? { ...c, btwNummer: v } : c))}
              placeholder="NL123456789B01"
              autoCapitalize="characters"
            />
          </View>
        </View>
        <FormField
          label="E-mailadres"
          value={gegevens?.email ?? ''}
          onChangeText={(v) => setGegevens((c) => (c ? { ...c, email: v } : c))}
          placeholder="info@bedrijf.nl"
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <FormField
          label="Telefoon"
          value={gegevens?.phone ?? ''}
          onChangeText={(v) => setGegevens((c) => (c ? { ...c, phone: v } : c))}
          placeholder="010 123 45 67"
          keyboardType="phone-pad"
        />
        <FormField
          label="Adres"
          value={gegevens?.address ?? ''}
          onChangeText={(v) => setGegevens((c) => (c ? { ...c, address: v } : c))}
          placeholder="Straat en huisnummer"
        />
        <View style={styles.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Postcode"
              value={gegevens?.postalCode ?? ''}
              onChangeText={(v) => setGegevens((c) => (c ? { ...c, postalCode: v } : c))}
              placeholder="1234 AB"
              autoCapitalize="characters"
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <FormField
              label="Plaats"
              value={gegevens?.city ?? ''}
              onChangeText={(v) => setGegevens((c) => (c ? { ...c, city: v } : c))}
              placeholder="Plaats"
            />
          </View>
        </View>
        <FormField
          label="Website"
          value={gegevens?.website ?? ''}
          onChangeText={(v) => setGegevens((c) => (c ? { ...c, website: v } : c))}
          placeholder="www.bedrijf.nl"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </FormSheet>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    waarde: { fontSize: 14, fontWeight: '700', color: t.ink2 },
    label: { ...typography.label, color: t.ink2 },
    rij: { flexDirection: 'row', gap: spacing.md },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      fontSize: 13.5,
      fontWeight: '600',
      color: t.ink2,
      overflow: 'hidden',
    },
    chipActief: { backgroundColor: t.green50, borderColor: t.green600, color: t.greenInk },
    schakelRij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    schakelTitel: { fontSize: 14.5, fontWeight: '700', color: t.ink },
    schakelUitleg: { fontSize: 12.5, color: t.muted, marginTop: 2 },
    uitlegBanner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.statusDraftBg,
    },
    uitlegTekst: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: t.statusDraftFg },
  });
