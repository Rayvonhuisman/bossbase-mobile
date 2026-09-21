import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import {
  AppTopBar,
  ErrorState,
  DateField,
  FormField,
  FormFooter,
  LoadingScreen,
  PermissionGate,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  canCreateWorkOrder,
  createWorkOrder,
  listCompanyProfiles,
} from '@/services/workOrderService';
import { listCustomers } from '@/services/customerService';
import { isGeldigeISODatum, vandaagISO } from '@/lib/datum';
import { ds, spacing, type ThemeColors } from '@/theme';
import type { Customer } from '@/types/domain';


type Collega = { id: string; full_name: string | null; role: string | null };

/**
 * Een nieuwe werkbon aanmaken.
 *
 * Policy `werkbonnen_insert` eist de ROL admin of planner — niet het recht
 * `werkbonnen_bewerken`. Een medewerker die bonnen mag bewerken kan er dus geen
 * nieuwe maken, en dat scherm hoort hij ook niet te zien.
 */
export default function NewWorkOrderScreen() {
  return (
    <PermissionGate label="Nieuwe werkbon">
      <NewWorkOrderInhoud />
    </PermissionGate>
  );
}

function NewWorkOrderInhoud() {
  const router = useRouter();
  const { user, companyId, role } = useAuth();
  const { can, hasFeature, readonly, loaded } = usePermissions();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const rechten = useMemo(
    () => ({
      userId: user?.id ?? null,
      role,
      can,
      gedeeldeWerkruimte: hasFeature('gedeelde_werkruimte'),
      readonly,
    }),
    [user?.id, role, can, hasFeature, readonly],
  );
  const magAanmaken = loaded && canCreateWorkOrder(rechten);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [collegas, setCollegas] = useState<Collega[]>([]);
  const [laden, setLaden] = useState(true);
  const [laadFout, setLaadFout] = useState<string | null>(null);

  const [titel, setTitel] = useState('');
  const [omschrijving, setOmschrijving] = useState('');
  const [datum, setDatum] = useState(vandaagISO());
  const [locatie, setLocatie] = useState('');
  const [klantId, setKlantId] = useState<string | null>(null);
  const [uitvoerders, setUitvoerders] = useState<string[]>([]);
  const [verantwoordelijken, setVerantwoordelijken] = useState<string[]>([]);
  const [opslaan, setOpslaan] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const laadBronnen = useCallback(async () => {
    setLaden(true);
    setLaadFout(null);
    const [klantRes, teamRes] = await Promise.all([listCustomers(), listCompanyProfiles()]);
    if (klantRes.error && teamRes.error) {
      setLaadFout('De klanten en het team konden niet worden geladen.');
    } else {
      setLaadFout(klantRes.error ?? teamRes.error);
    }
    setCustomers(klantRes.data);
    setCollegas(teamRes.data);
    setLaden(false);
  }, []);

  useEffect(() => {
    // Data laden bij mount is het patroon van dit hele project (19 andere
    // schermen doen het net zo). De regel vlagt elke functie die uiteindelijk
    // state zet; dat is hier niet te vermijden zonder de laadaanpak van de hele
    // app om te bouwen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    laadBronnen();
  }, [laadBronnen]);

  /**
   * Uitvoerder aan/uit. De CHECK `werkbonnen_verantwoordelijke_subset` eist dat
   * elke verantwoordelijke ook uitvoerder is, dus wie als uitvoerder verdwijnt
   * verliest hier meteen zijn verantwoordelijkheid.
   */
  const toggleUitvoerder = (id: string) => {
    setUitvoerders((prev) => {
      const aan = prev.includes(id);
      if (aan) {
        setVerantwoordelijken((v) => v.filter((x) => x !== id));
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const toggleVerantwoordelijke = (id: string) => {
    if (!uitvoerders.includes(id)) return;
    setVerantwoordelijken((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const opslaanBon = async () => {
    setFout(null);
    if (!titel.trim()) {
      setFout('Een werkbon heeft een titel nodig.');
      return;
    }
    if (datum && !isGeldigeISODatum(datum)) {
      setFout('Kies een geldige datum.');
      return;
    }
    if (!companyId) {
      setFout('Je sessie is nog niet geladen. Probeer het zo opnieuw.');
      return;
    }
    setOpslaan(true);
    const { data, error } = await createWorkOrder({
      company_id: companyId,
      titel,
      customer_id: klantId,
      omschrijving,
      gepland_op: datum || null,
      locatie,
      assigned_to_ids: uitvoerders,
      verantwoordelijke_ids: verantwoordelijken,
    });
    setOpslaan(false);
    if (error || !data) {
      setFout(error ?? 'De werkbon kon niet worden aangemaakt.');
      return;
    }
    // Meteen naar de nieuwe bon: het nummer komt uit de database, dus dit is de
    // eerste plek waar de gebruiker ziet wat hij heeft gemaakt.
    Alert.alert('Werkbon aangemaakt', `${data.nummer ?? 'De werkbon'} is opgeslagen.`);
    router.replace(`/work-orders/${data.id}`);
  };

  const topBar = <AppTopBar variant="detail" title="Nieuwe werkbon" onBack={() => router.back()} />;

  if (!loaded || laden) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          {topBar}
          <LoadingScreen label="Gegevens laden..." />
        </View>
      </>
    );
  }

  if (!magAanmaken) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          {topBar}
          <ErrorState
            title="Geen rechten"
            message={
              readonly
                ? 'Je account staat op alleen-lezen; er kan niets worden aangemaakt.'
                : 'Alleen een admin of planner kan een werkbon aanmaken.'
            }
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {topBar}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {laadFout ? <Text style={styles.warn}>{laadFout}</Text> : null}

            <FormField
              label="Titel *"
              value={titel}
              onChangeText={setTitel}
              placeholder="Bijv. Kozijnen plaatsen begane grond"
            />
            <FormField
              label="Omschrijving"
              value={omschrijving}
              onChangeText={setOmschrijving}
              placeholder="Wat moet er gebeuren?"
              multiline
            />
            <DateField
              label="Gepland op"
              value={datum}
              onChange={setDatum}
              hint="De dag waarop de klus staat ingepland."
            />
            <FormField
              label="Locatie"
              value={locatie}
              onChangeText={setLocatie}
              placeholder="Adres of omschrijving van de plek"
            />

            <Text style={styles.label}>Klant</Text>
            <View style={styles.picker}>
              <Keuze
                styles={styles}
                aan={klantId === null}
                titel="Geen klant"
                onPress={() => setKlantId(null)}
                eerste
              />
              {customers.map((c) => (
                <Keuze
                  key={c.id}
                  styles={styles}
                  aan={klantId === c.id}
                  titel={c.name ?? '—'}
                  sub={[c.city, c.phone].filter(Boolean).join(' · ') || undefined}
                  onPress={() => setKlantId(c.id)}
                />
              ))}
            </View>

            <Text style={styles.label}>Uitvoerders</Text>
            <Text style={styles.hint}>
              Wie op de klus staat. Tik daarna nogmaals om iemand verantwoordelijk te maken — een
              verantwoordelijke mag de bon ook bewerken.
            </Text>
            <View style={styles.picker}>
              {collegas.length === 0 ? (
                <Text style={styles.leeg}>Geen collega&apos;s gevonden.</Text>
              ) : (
                collegas.map((c, i) => {
                  const isUitvoerder = uitvoerders.includes(c.id);
                  const isVerantwoordelijk = verantwoordelijken.includes(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() =>
                        isUitvoerder ? toggleVerantwoordelijke(c.id) : toggleUitvoerder(c.id)
                      }
                      onLongPress={() => toggleUitvoerder(c.id)}
                      style={({ pressed }) => [
                        styles.rij,
                        i > 0 && styles.rijRand,
                        isUitvoerder && styles.rijAan,
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.rijTitel} numberOfLines={1}>
                          {c.full_name ?? 'Naamloos'}
                        </Text>
                        <Text style={styles.rijSub} numberOfLines={1}>
                          {isVerantwoordelijk
                            ? 'Uitvoerder · verantwoordelijk'
                            : isUitvoerder
                              ? 'Uitvoerder — tik voor verantwoordelijk'
                              : (c.role ?? '')}
                        </Text>
                      </View>
                      {isUitvoerder ? (
                        <Check
                          size={18}
                          color={isVerantwoordelijk ? ds.green700 : t.muted}
                          strokeWidth={2.6}
                        />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </View>

          </ScrollView>
          <FormFooter
            label="Werkbon aanmaken"
            onPress={opslaanBon}
            loading={opslaan}
            error={fout}
          />
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

function Keuze({
  styles,
  aan,
  titel,
  sub,
  onPress,
  eerste,
}: {
  styles: ReturnType<typeof makeStyles>;
  aan: boolean;
  titel: string;
  sub?: string;
  onPress: () => void;
  eerste?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.rij,
        !eerste && styles.rijRand,
        aan && styles.rijAan,
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rijTitel} numberOfLines={1}>
          {titel}
        </Text>
        {sub ? (
          <Text style={styles.rijSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {aan ? <Check size={18} color={ds.green700} strokeWidth={2.6} /> : null}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    content: {
      padding: spacing.lg,
      paddingBottom: 64,
      gap: spacing.lg,
    },
    label: {
      fontSize: 12,
      fontWeight: '500',
      color: t.ink2,
      marginBottom: -spacing.sm,
    },
    hint: {
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
      marginBottom: -spacing.sm,
    },
    picker: {
      backgroundColor: t.card,
      borderRadius: t.rMd,
      borderWidth: 1,
      borderColor: t.line,
      overflow: 'hidden',
    },
    rij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rijRand: {
      borderTopWidth: 1,
      borderTopColor: t.line,
    },
    rijAan: {
      backgroundColor: t.green50,
    },
    rijTitel: {
      fontSize: 14.5,
      fontWeight: '600',
      color: t.ink,
    },
    rijSub: {
      fontSize: 12,
      color: t.muted,
      marginTop: 1,
    },
    leeg: {
      padding: 14,
      fontSize: 13,
      color: t.muted,
    },
    warn: {
      fontSize: 13,
      lineHeight: 19,
      color: t.statusRejectFg,
    },
    fout: {
      color: t.statusRejectFg,
      fontSize: 14,
      lineHeight: 20,
    },
  });
