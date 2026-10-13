import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  AppTopBar,
  DateField,
  ErrorState,
  FormField,
  FormFooter,
  LoadingScreen,
  NoticeBanner,
  SelectField,
  TimeField,
  type SelectOption,
} from '@/components';
import { useAuth, usePermissions, useTheme, useToast } from '@/providers';
import { canBookHours, listCompanyProfiles, listWorkOrders } from '@/services/workOrderService';
import { PauzeKeuze } from '@/components/PauzeKeuze';
import { leesKm, rondAfOpVijf } from '@/lib/urenRegels';
import { createWerkbonUur } from '@/services/werkbonUrenService';
import { createWerkdagUur } from '@/services/timeEntryService';
import { isGeldigeISODatum, minutenVanTijd, vandaagISO } from '@/lib/datum';
import { berekenUren } from '@/lib/urenBerekening';
import { formatDagLabel } from '@/lib/format';
import { spacing, type ThemeColors } from '@/theme';
import type { WriteResult } from '@/lib/writeResult';
import { terugOfNaar } from '@/lib/navigatie';
import type { WorkOrderWithCustomer } from '@/types/domain';
import { leesbreedte } from '@/lib/schermklasseRegels';

/**
 * Uren vastleggen — op een werkbon, of algemeen.
 *
 * De database houdt die twee bewust gescheiden, en dit scherm doet dat ook:
 *
 * - **Werkbon** → `werkbon_uren`. Dat is de tabel die de werkbon in het
 *   dashboard leest en die nacalculatie, facturatie en de werkbon-PDF voedt.
 *   Hier is een werkbon verplicht; zonder klus horen de uren er niet in.
 * - **Overig** → `urenregistratie`. De gewone urenstaat: reistijd, overleg,
 *   magazijn, verlof. Die tabel kent geen werkbon (meer), en er komt ook geen
 *   werkbonnummer in de notitie: een verzonnen koppeling levert
 *   een tweede administratie op die het kantoor nooit ziet kloppen.
 *
 * Beide paden lopen via `schrijf()`, dus een door RLS geweigerde rij komt hier
 * terug als een fout en nooit als "opgeslagen".
 */

type Soort = 'werkbon' | 'overig';

/*
 * Gelijk aan het dashboard (UrenModal): werkdaguren met datum, (admin/planner)
 * medewerker, start- en eindtijd afgerond op vijf minuten, pauzeknoppen,
 * gereden kilometers en een notitie. Werkdag is de standaard; "Werkbon" blijft
 * beschikbaar voor wie vanaf de telefoon op een klus boekt
 * (`/hours/new?soort=werkbon&werkbon=<id>`).
 */

export default function NewTimeEntryScreen() {
  const router = useRouter();
  const { user, companyId, role } = useAuth();
  const { can, hasFeature, readonly, loaded: rechtenGeladen } = usePermissions();
  const { colors: t } = useTheme();
  const { toonResultaat } = useToast();
  const styles = useMemo(() => makeStyles(t), [t]);

  const params = useLocalSearchParams<{ soort?: string; werkbon?: string }>();
  const [soort, setSoort] = useState<Soort>(params.soort === 'werkbon' || params.werkbon ? 'werkbon' : 'overig');
  // Uren voor een ander boeken: alleen admin/planner, zoals het dashboard.
  const magVoorAnderen = role === 'admin' || role === 'planner';
  const [voorWie, setVoorWie] = useState<string | null>(null);
  const [collegas, setCollegas] = useState<SelectOption[]>([]);
  const [km, setKm] = useState('');

  const [workOrders, setWorkOrders] = useState<WorkOrderWithCustomer[]>([]);
  const [loadingWo, setLoadingWo] = useState(true);
  const [woError, setWoError] = useState<string | null>(null);

  const [selectedWoId, setSelectedWoId] = useState<string | null>(params.werkbon ?? null);
  const [datum, setDatum] = useState(vandaagISO());
  const [van, setVan] = useState<string | null>(null);
  const [tot, setTot] = useState<string | null>(null);
  const [pauze, setPauze] = useState(0);
  const [uren, setUren] = useState('');
  const [notitie, setNotitie] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWo = useCallback(async () => {
    setLoadingWo(true);
    setWoError(null);
    const assignedToUserId = role === 'medewerker' ? (user?.id ?? null) : null;
    const { data, error: e } = await listWorkOrders({ assignedToUserId });
    if (e) setWoError('Werkbonnen konden niet worden geladen.');
    else setWorkOrders(data);
    if (magVoorAnderen) {
      const p = await listCompanyProfiles();
      if (!p.error) {
        setCollegas(
          p.data.map((x) => ({
            id: x.id,
            label: `${x.full_name ?? 'Medewerker'}${x.id === user?.id ? ' (ikzelf)' : ''}`,
          })),
        );
      }
    }
    setLoadingWo(false);
  }, [role, user?.id, magVoorAnderen]);

  useEffect(() => {
    // Gegevens laden bij openen; loadWo zet zelf de laadstatus.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadWo();
  }, [loadWo]);

  /**
   * Alleen werkbonnen waarop deze gebruiker daadwerkelijk uren mag boeken —
   * dezelfde regel als `bb_mag_werkbon_uren_beheren` in de database. Een bon
   * aanbieden waar de insert daarna op strandt, is een val.
   */
  const boekbaar = useMemo(() => {
    if (!rechtenGeladen) return [];
    const rechten = {
      userId: user?.id ?? null,
      role,
      can,
      gedeeldeWerkruimte: hasFeature('gedeelde_werkruimte'),
      readonly,
    };
    return workOrders.filter((w) => canBookHours(w, rechten));
  }, [workOrders, rechtenGeladen, user?.id, role, can, hasFeature, readonly]);

  const selectedWo = useMemo(
    () => boekbaar.find((w) => w.id === selectedWoId) ?? null,
    [boekbaar, selectedWoId],
  );

  /**
   * Nummer en titel als label, klant en geplande dag eronder. Het zoekveld van
   * `SelectField` kijkt naar allebei, dus zoeken op WB-nummer, op titel én op
   * klantnaam werkt met dezelfde regel.
   */
  const werkbonOpties = useMemo<SelectOption[]>(
    () =>
      boekbaar.map((w) => ({
        id: w.id,
        label: [w.nummer, w.titel || 'Werkbon'].filter(Boolean).join(' · '),
        sub: [w.customer?.name, w.gepland_op ? formatDagLabel(w.gepland_op) : null]
          .filter(Boolean)
          .join(' · '),
      })),
    [boekbaar],
  );

  // ─── Uren: afgeleid zodra er een begin- én eindtijd staat ────────────────
  const pauzeMinuten = pauze;
  const kmWaarde = leesKm(km);
  // Dezelfde rekenregel als het dashboard: eind − begin − pauze, afgerond op
  // twee decimalen (lib/urenBerekening). Wat hier staat, is wat er opgeslagen
  // wordt — niet een afgerond getal op het scherm en een ander in de database.
  const berekendeUren = berekenUren(van, tot, pauzeMinuten);
  const tijdvakFout =
    van && tot && minutenVanTijd(tot) <= minutenVanTijd(van)
      ? 'Eindtijd moet later zijn dan starttijd.'
      : van && tot && berekendeUren === null
        ? 'Er blijft geen tijd over na aftrek van de pauze.'
        : null;
  const urenUitTijd = berekendeUren !== null;
  const urenWaarde = urenUitTijd ? berekendeUren.toString().replace('.', ',') : uren;

  const onSubmit = async () => {
    setError(null);
    if (soort === 'werkbon' && (!selectedWoId || !selectedWo)) {
      setError('Kies een werkbon.');
      return;
    }
    if (!isGeldigeISODatum(datum)) {
      setError('Kies een geldige datum.');
      return;
    }
    if (tijdvakFout) {
      setError(tijdvakFout);
      return;
    }
    const aantal = urenUitTijd ? berekendeUren! : parseFloat(uren.replace(',', '.'));
    if (soort === 'overig' && kmWaarde === undefined) {
      setError('Vul een geldig aantal kilometers in.');
      return;
    }
    if (!Number.isFinite(aantal) || aantal <= 0) {
      setError('Vul een geldig aantal uren in.');
      return;
    }
    if (!user?.id) {
      setError('Je sessie is nog niet geladen. Probeer het zo opnieuw.');
      return;
    }
    if (soort === 'overig' && !companyId) {
      setError('Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
      return;
    }

    setSaving(true);
    // Eén variabele voor beide paden: het type is `WriteResult<unknown>`, want
    // de rij die terugkomt verschilt per tabel. Wat telt is `ok` en `melding`.
    const res: WriteResult<unknown> =
      soort === 'werkbon'
        ? await createWerkbonUur({
            company_id: selectedWo!.company_id,
            werkbon_id: selectedWoId!,
            profile_id: user.id,
            datum,
            uren: aantal,
            start_tijd: van,
            eind_tijd: tot,
            pauze_minuten: pauzeMinuten,
            notitie,
          })
        : await createWerkdagUur({
            company_id: companyId!,
            profile_id: magVoorAnderen && voorWie ? voorWie : user.id,
            reis_km: kmWaarde ?? null,
            datum,
            uren: aantal,
            start_tijd: van,
            eind_tijd: tot,
            pauze_minuten: pauzeMinuten,
            notitie,
          });
    setSaving(false);

    // Alleen een teruggegeven rij telt als opgeslagen. `toonResultaat` leidt de
    // toon af uit ditzelfde resultaat, dus een weigering wordt nooit groen.
    if (!res.ok) {
      setError(res.melding);
      toonResultaat(res, '');
      return;
    }
    toonResultaat(
      res,
      soort === 'werkbon'
        ? `Uren geboekt op ${selectedWo?.nummer ?? 'de werkbon'}.`
        : 'Uren geregistreerd.',
    );
    terugOfNaar(router, '/hours');
  };

  // Every state keeps the top bar, so the back affordance is never lost.
  const topBar = <AppTopBar variant="detail" title="Uren toevoegen" onBack={() => terugOfNaar(router, '/hours')} />;

  if (loadingWo || !rechtenGeladen) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          {topBar}
          <LoadingScreen label="Uren laden..." />
        </View>
      </>
    );
  }
  if (woError) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          {topBar}
          <ErrorState title="Niet geladen" message={woError} onRetry={loadWo} />
        </View>
      </>
    );
  }
  // Alleen-lezen raakt beide soorten: dan valt er niets vast te leggen.
  if (readonly) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          {topBar}
          <ErrorState
            title="Alleen-lezen"
            message="Je account staat op alleen-lezen; er kunnen geen uren worden geboekt."
          />
        </View>
      </>
    );
  }

  const geenBoekbareBon = boekbaar.length === 0;

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
            {/* Waar horen deze uren bij? Die vraag staat bovenaan, want hij
                bepaalt in welke tabel de regel belandt. */}
            <View style={styles.keuze}>
              {(['overig', 'werkbon'] as const).map((k) => {
                const on = soort === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => setSoort(k)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [
                      styles.keuzeKnop,
                      on && styles.keuzeKnopOn,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={[styles.keuzeTekst, on && styles.keuzeTekstOn]}>
                      {k === 'werkbon' ? 'Werkbon' : 'Werkdag'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {soort === 'werkbon' ? (
              geenBoekbareBon ? (
                <NoticeBanner
                  toon="waarschuwing"
                  title="Geen werkbon beschikbaar"
                  message={
                    workOrders.length === 0
                      ? 'Er zijn nog geen werkbonnen. Maak er eerst een aan, of kies "Werkdag" voor je werkdaguren.'
                      : 'Er staat geen werkbon open waarop jij uren mag boeken. Vraag de planner om je op de klus te zetten, of kies "Werkdag".'
                  }
                />
              ) : (
                /* Eén regel in plaats van de hele lijst: de keuze opent een blad
                   met zoekveld. Daardoor staan datum, tijden en uren meteen in
                   beeld, ook bij honderd werkbonnen. */
                <SelectField
                  label="Werkbon *"
                  value={selectedWoId}
                  options={werkbonOpties}
                  onChange={setSelectedWoId}
                  placeholder="Kies een werkbon"
                  searchable
                  hint="Zoek op nummer, titel of klant."
                />
              )
            ) : (
              <>
                <NoticeBanner
                  toon="info"
                  message="Werkdaguren: je hele werkdag, voor loon en verlof. Uren op een klus boek je op de werkbon."
                />
                {magVoorAnderen && collegas.length > 1 ? (
                  <SelectField
                    label="Medewerker"
                    value={voorWie ?? user?.id ?? null}
                    options={collegas}
                    onChange={setVoorWie}
                    searchable={collegas.length > 8}
                  />
                ) : null}
              </>
            )}

            <DateField label="Datum *" value={datum} onChange={setDatum} />

            <View style={styles.rij}>
              <View style={{ flex: 1 }}>
                <TimeField
                  label="Van"
                  value={van}
                  onChange={(v) => {
                    const r = rondAfOpVijf(v);
                    setVan(r);
                    if (tot && minutenVanTijd(tot) <= minutenVanTijd(r)) setTot(null);
                  }}
                  placeholder="Kies"
                />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField label="Tot" value={tot} onChange={(v) => setTot(rondAfOpVijf(v))} placeholder="Kies" />
              </View>
            </View>

            {tijdvakFout ? <NoticeBanner toon="waarschuwing" message={tijdvakFout} /> : null}

            <PauzeKeuze waarde={pauze} onChange={setPauze} />

            <View style={styles.rij}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Uren *"
                  value={urenWaarde}
                  onChangeText={setUren}
                  placeholder="Bijv. 2,5"
                  keyboardType="decimal-pad"
                  editable={!urenUitTijd}
                  hint={
                    urenUitTijd
                      ? `≈ ${urenWaarde} uur${pauzeMinuten ? ` (${pauzeMinuten} min pauze eraf)` : ''}`
                      : undefined
                  }
                />
              </View>
              {soort === 'overig' ? (
                <View style={{ flex: 1 }}>
                  <FormField
                    label="Gereden kilometers"
                    value={km}
                    onChangeText={setKm}
                    placeholder="Optioneel"
                    keyboardType="decimal-pad"
                    hint={kmWaarde === undefined ? 'Vul een getal van 0 of meer in.' : undefined}
                  />
                </View>
              ) : null}
            </View>

            <FormField
              label="Notitie"
              value={notitie}
              onChangeText={setNotitie}
              placeholder="Optionele omschrijving"
              multiline
            />
          </ScrollView>
          <FormFooter
            label="Uren opslaan"
            onPress={onSubmit}
            loading={saving}
            error={error}
            disabled={soort === 'werkbon' && geenBoekbareBon}
          />
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    content: {
      ...leesbreedte,
      padding: spacing.lg,
      paddingBottom: 48,
      gap: spacing.lg,
    },
    // Segmentkeuze in de vorm van de Dag/Week/Maand-schakelaar in de agenda.
    keuze: {
      flexDirection: 'row',
      backgroundColor: t.bgAlt,
      borderRadius: 14,
      padding: 4,
      gap: 4,
    },
    keuzeKnop: {
      flex: 1,
      height: 38,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keuzeKnopOn: {
      backgroundColor: t.card,
      shadowColor: '#0D0D0D',
      shadowOpacity: 0.1,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    keuzeTekst: { fontSize: 13.5, fontWeight: '600', color: t.muted },
    keuzeTekstOn: { color: t.ink },

    rij: { flexDirection: 'row', gap: spacing.md },
  });
