import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import {
  Clock,
  Plus,
} from 'lucide-react-native';
import {
  AppCard,
  AppFilterChips,
  AppScreen,
  AppSection,
  AppTopBar,
  DateField,
  ErrorState,
  HeaderIconButton,
  FormField,
  FormSheet,
  LoadingScreen,
  NoticeBanner,
  TimeField,
  type ChipDef,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  deleteTimeEntry,
  echteUurId,
  listCompanyUren,
  listUrenForProfile,
  updateTimeEntry,
} from '@/services/timeEntryService';
import { todayISO, formatDagLabel, formatHours } from '@/lib/format';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import type { TimeEntryType, UrenRegel } from '@/types/domain';
import type { DagUren } from '@/lib/urenTotalen';
import { deleteWerkbonUur, updateWerkbonUur } from '@/services/werkbonUrenService';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { useLaden } from '@/lib/useLaden';
import { telDagenOp, urenPerDag, urenVanDag } from '@/lib/urenTotalen';
import { berekenUren } from '@/lib/urenBerekening';

const NL_DAYS_SHORT = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatHM(hours: number): string {
  if (!hours) return '0u';
  if (Number.isInteger(hours)) return `${hours}u`;
  return `${hours.toFixed(1).replace('.', ',')}u`;
}

function timeRange(entry: UrenRegel): string {
  if (entry.start_tijd && entry.eind_tijd) {
    return `${entry.start_tijd.slice(0, 5)} – ${entry.eind_tijd.slice(0, 5)}`;
  }
  return `${formatHours(entry.uren)}`;
}

function typeLabel(
  type: TimeEntryType,
  t: ThemeColors,
): { label: string; bg: string; fg: string } {
  switch (type) {
    case 'arbeid':
      return { label: 'Facturabel', bg: t.green50, fg: ds.green700 };
    case 'reistijd':
      return { label: 'Reistijd', bg: t.statusSubmitBg, fg: t.statusSubmitFg };
    case 'overhead':
      return { label: 'Niet-facturabel', bg: t.bgAlt, fg: t.muted };
    case 'overig':
      return { label: 'Overig', bg: t.statusWarnBg, fg: t.statusWarnFg };
  }
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

type FilterKey = 'vandaag' | 'week' | 'open' | 'mij' | 'team';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HoursScreen() {
  const router = useRouter();
  const { user, role } = useAuth();
  const { readonly, loaded: rechtenGeladen } = usePermissions();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const isTeamScope = role === 'admin' || role === 'planner';

  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeek(today), [today]);
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 6);
    return e;
  }, [weekStart]);
  const todayISOStr = useMemo(() => todayISO(), []);

  const [entries, setEntries] = useState<UrenRegel[]>([]);  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('vandaag');
  const [bewerken, setBewerken] = useState<UurConcept | null>(null);
  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();

  const userId = user?.id;
  const load = useCallback(
    async () => {
      if (!userId) return;
      setError(null);

      const from = toISODate(weekStart);
      const to = toISODate(weekEnd);
      const { data, error: fetchError } =
        filter === 'team' && isTeamScope
          ? await listCompanyUren(from, to)
          : await listUrenForProfile(userId, from, to);

      // Werkbonuren en werkdaguren komen uit twee tabellen. Faalt er één, dan
      // is het totaal onvolledig — dat melden we, want een te laag getal dat
      // eruitziet als een echt totaal is erger dan een foutmelding.
      setError(fetchError);
      setEntries(data);
    },
    [userId, weekStart, weekEnd, filter, isTeamScope],
  );

  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn drie
   * verschillende dingen. Alleen de laatste zet `refreshing`; terugkeren op
   * dit scherm ververst dus stil, zonder dat de lijst omlaag schuift.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });



  // Aggregates
  const todayEntries = useMemo(
    () => entries.filter((e) => e.datum === todayISOStr),
    [entries, todayISOStr],
  );
  // Werkdag- en werkbonuren apart, zoals het dashboard (zie lib/urenTotalen):
  // de norm van 8 uur per dag en 40 per week gaat over werkdaguren; werkbonuren
  // en het verschil staan ernaast. De lijst hieronder toont wél elke regel.
  const vandaagUren = useMemo(
    () => urenVanDag(todayEntries, todayISOStr),
    [todayEntries, todayISOStr],
  );
  const expectedToday = 8;
  const missingToday = Math.max(0, expectedToday - vandaagUren.werkdag);
  const pct = Math.min(100, (vandaagUren.werkdag / expectedToday) * 100);

  const weekDagen = useMemo(() => {
    const dagen = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return toISODate(d);
    });
    return urenPerDag(entries, dagen);
  }, [entries, weekStart]);
  const week = useMemo(() => telDagenOp(weekDagen), [weekDagen]);

  // Bewerken: staan begin én eind er, dan zijn de uren eind − begin − pauze
  // (dezelfde regel als het dashboard en het nieuwe-urenformulier). Anders
  // blijft het ingevulde aantal staan.
  const bewerkUren = useMemo(() => {
    if (!bewerken) return { waarde: '', berekend: false, fout: null as string | null };
    if (bewerken.van && bewerken.tot) {
      const uren = berekenUren(bewerken.van, bewerken.tot, bewerken.pauze.replace(',', '.'));
      if (uren === null) {
        return {
          waarde: bewerken.uren,
          berekend: false,
          fout: 'De eindtijd moet na de begintijd liggen, en de pauze moet erin passen.',
        };
      }
      return { waarde: String(uren).replace('.', ','), berekend: true, fout: null };
    }
    return { waarde: bewerken.uren, berekend: false, fout: null };
  }, [bewerken]);

  /** Weektotaal werkdaguren — de noemer die het ontwerp in de bovenbalk en de weekkaart toont. */
  const weekTotal = week.werkdag;

  const filteredList = useMemo(() => {
    if (filter === 'vandaag') return todayEntries;
    if (filter === 'mij') return entries.filter((e) => e.profile_id === user?.id);
    return entries;
  }, [filter, entries, todayEntries, user?.id]);

  const chips: ChipDef<FilterKey>[] = useMemo(
    () => [
      { id: 'vandaag', label: 'Vandaag', count: todayEntries.length },
      { id: 'week', label: 'Deze week', count: entries.length },
      { id: 'open', label: 'Open' },
      { id: 'mij', label: 'Mijn uren' },
      ...(isTeamScope ? [{ id: 'team' as FilterKey, label: 'Team' }] : []),
    ],
    [todayEntries.length, entries.length, isTeamScope],
  );

  // Uren toevoegen gaat via een formulier dat een werkbon laat kiezen; die uren
  // worden geboekt in werkbon_uren, dezelfde tabel die de werkbon in het
  // dashboard toont.
  const onAddPlaceholder = () => router.push('/hours/new');

  if (loading && entries.length === 0) {
    return <LoadingScreen label="Uren laden..." />;
  }
  if (error && entries.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ErrorState title="Uren niet geladen" message={error} onRetry={opnieuw} />
      </View>
    );
  }

  const todayWeekIdx = (today.getDay() + 6) % 7;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            title="Uren"
            subtitle={
              isTeamScope
                ? `Bedrijfsuren · ${formatHM(weekTotal)} deze week`
                : `${formatHM(weekTotal)} van 40 u deze week`
            }
            rightAction={
              rechtenGeladen && !readonly ? (
                <HeaderIconButton
                  icon={Plus}
                  label="Uren toevoegen"
                  size={42}
                  onPress={onAddPlaceholder}
                />
              ) : undefined
            }
            showProfileButton
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* Today summary card */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <AppCard padding={18}>
            <View style={styles.summaryTop}>
              <ProgressRing pct={pct} styles={styles} t={t} />
              <View style={{ flex: 1, marginLeft: 16, minWidth: 0 }}>
                <Text style={styles.summaryKicker}>Werkdag vandaag</Text>
                <View style={styles.summaryNumberRow}>
                  <Text style={styles.summaryNumber}>
                    {vandaagUren.werkdag.toString().replace('.', ',')}
                  </Text>
                  <Text style={styles.summaryNumberSub}>/ {expectedToday} uur</Text>
                </View>
                <Text style={missingToday > 0 ? styles.summaryMissing : styles.summaryDone}>
                  {missingToday > 0
                    ? `Nog ${formatHM(missingToday)} te schrijven`
                    : 'Dag compleet'}{' '}
                  · {todayEntries.length}{' '}
                  {todayEntries.length === 1 ? 'registratie' : 'registraties'}
                </Text>
              </View>
            </View>
            {/* Werkdag, klus en het verschil naast elkaar — nooit opgeteld. */}
            <View style={styles.summaryStats}>
              <UrenStat label="Werkdag" uren={vandaagUren.werkdag} styles={styles} />
              <UrenStat label="Op werkbonnen" uren={vandaagUren.werkbon} styles={styles} />
              <UrenStat
                label="Niet aan een klus"
                uren={Math.max(0, vandaagUren.verschil)}
                styles={styles}
                leeg={vandaagUren.werkdag === 0}
              />
            </View>
          </AppCard>
        </View>
        <UrenSignaal
          dag={vandaagUren}
          wie={filter === 'team' && isTeamScope ? 'team' : 'ik'}
          styles={styles}
        />

        {/* Weekoverzicht — kop in de kaart, zoals in het ontwerp */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <AppCard padding={16}>
            <View style={styles.weekKop}>
              <Text style={styles.weekKopTitel}>Weekoverzicht</Text>
              <Text style={styles.weekKopMeta}>{formatHM(weekTotal)} van 40 u werkdag</Text>
            </View>
            <View style={styles.weekRow}>
              {NL_DAYS_SHORT.slice(1).concat('Zo').map((label, idx) => {
                const dag = weekDagen[idx];
                const hours = dag?.werkdag ?? 0;
                // Een dag die niet klopt (klus zonder werkdag, of meer klus
                // dan werkdag) krijgt de waarschuwingskleur.
                const signaal = !!dag && (dag.zonderWerkdag > 0 || dag.klusGroter > 0);
                const on = idx === todayWeekIdx;
                const height = Math.max(hours || signaal ? 6 : 4, Math.min(52, (hours / 8) * 52));
                return (
                  <View key={label + idx} style={styles.weekItem}>
                    <Text style={[styles.weekHours, on && { color: t.ink }, signaal && styles.weekHoursLet]}>
                      {hours ? formatHM(hours) : signaal ? '!' : ''}
                    </Text>
                    <View style={styles.weekBarFrame}>
                      <View
                        style={[
                          styles.weekBar,
                          { height },
                          signaal
                            ? styles.weekBarLet
                            : on
                              ? styles.weekBarOn
                              : hours >= 8
                                ? styles.weekBarVol
                                : hours > 0
                                  ? styles.weekBarDeels
                                  : styles.weekBarIdle,
                        ]}
                      />
                    </View>
                    <Text style={[styles.weekLabel, on && styles.weekLabelOn]}>
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.summaryStats}>
              <UrenStat label="Werkdag" uren={week.werkdag} styles={styles} />
              <UrenStat label="Op werkbonnen" uren={week.werkbon} styles={styles} />
              <UrenStat
                label="Niet aan een klus"
                uren={Math.max(0, week.verschil)}
                styles={styles}
                leeg={week.werkdag === 0}
              />
            </View>
            {week.dagenZonderWerkdag > 0 || week.dagenKlusGroter > 0 ? (
              <Text style={styles.weekLetTekst}>
                {[
                  week.dagenZonderWerkdag > 0
                    ? `${week.dagenZonderWerkdag} ${week.dagenZonderWerkdag === 1 ? 'dag' : 'dagen'} met werkbonuren maar zonder werkdag`
                    : null,
                  week.dagenKlusGroter > 0
                    ? `${week.dagenKlusGroter} ${week.dagenKlusGroter === 1 ? 'dag' : 'dagen'} met meer werkbon- dan werkdaguren`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
          </AppCard>
        </View>

        {/* Filter chips + entries */}
        <AppSection title="Registraties" count={filteredList.length} />
        {error && entries.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
            <NoticeBanner
              toon="fout"
              message={`${error} Het totaal hierboven kan daardoor onvolledig zijn.`}
            />
          </View>
        ) : null}
        <AppFilterChips chips={chips} active={filter} onChange={setFilter} />

        <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 12 }}>
          {filteredList.length === 0 ? (
            <AppCard padding={26} style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Clock size={28} color={ds.green} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>Nog geen uren geregistreerd</Text>
              <Text style={styles.emptyBody}>
                Voeg je eerste urenregistratie voor vandaag toe.
              </Text>
              {rechtenGeladen && !readonly ? (
                <Pressable
                  onPress={onAddPlaceholder}
                  style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
                >
                  <Plus size={18} color={ds.greenInk} strokeWidth={2.4} />
                  <Text style={styles.emptyBtnText}>Uren toevoegen</Text>
                </Pressable>
              ) : null}
            </AppCard>
          ) : (
            filteredList.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                styles={styles}
                t={t}
                onEdit={
                  rechtenGeladen
                    ? () => {
                        setSaveError(null);
                        setBewerken({
                          // De lijst prefixt id's (wb:/ur:); de update wil de
                          // echte tabel-id.
                          id: echteUurId(e.id),
                          bron: e.bron,
                          datum: e.datum,
                          van: e.start_tijd ? e.start_tijd.slice(0, 5) : null,
                          tot: e.eind_tijd ? e.eind_tijd.slice(0, 5) : null,
                          uren: String(e.uren ?? '').replace('.', ','),
                          pauze: String(e.pauze_minuten ?? 0),
                          notitie: e.notitie ?? '',
                        });
                      }
                    : undefined
                }
              />
            ))
          )}
        </View>
        {/*
          TODO(backend): "Team vandaag"-aggregaat per medewerker is verwijderd
          (was mock). Echte per-persoon-aggregaten vereisen een view + een manier
          om profile_id → naam op te halen (profiles RLS toont alleen eigen rij).
          Het Team-filter hierboven toont wel de echte bedrijfsregistraties.
        */}
      </AppScreen>

      {/* Uren bijwerken. Werkbonuren en werkdaguren zijn twee tabellen met
          twee verschillende policies; het formulier is hetzelfde, de
          bestemming niet. */}
      <FormSheet
        visible={bewerken !== null}
        title="Uren bewerken"
        subtitle={bewerken?.bron === 'werkbon' ? 'Uren op een werkbon' : 'Werkdaguren'}
        error={saveError}
        saving={saving}
        submitDisabled={!bewerkUren.waarde.trim() || !!bewerkUren.fout}
        onSubmit={() => {
          if (!bewerken || bewerkUren.fout) return;
          const pauze = Math.max(0, Math.round(Number(bewerken.pauze.replace(',', '.')) || 0));
          // Met begin- en eindtijd rekent de service de uren zelf opnieuw uit
          // (eind − begin − pauze, zoals het dashboard); zonder tijden telt
          // het ingevulde aantal.
          const velden = {
            datum: bewerken.datum,
            start_tijd: bewerken.van,
            eind_tijd: bewerken.tot,
            uren: Number(bewerkUren.waarde.replace(',', '.')),
            pauze_minuten: pauze,
            notitie: bewerken.notitie,
          };
          save(
            () =>
              bewerken.bron === 'werkbon'
                ? updateWerkbonUur(bewerken.id, velden)
                : updateTimeEntry(bewerken.id, velden),
            {
              onSuccess: async () => {
                setBewerken(null);
                await herlaad();
              },
            },
          );
        }}
        onClose={() => setBewerken(null)}
        destructive={{
          label: 'Uren verwijderen',
          onPress: () => {
            if (!bewerken) return;
            const { id, bron } = bewerken;
            bevestigVerwijderen('Uren', () => {
              save(() => (bron === 'werkbon' ? deleteWerkbonUur(id) : deleteTimeEntry(id)), {
                onSuccess: async () => {
                  setBewerken(null);
                  await herlaad();
                },
              });
            });
          },
        }}
      >
        <DateField
          label="Datum"
          value={bewerken?.datum ?? null}
          onChange={(v) => setBewerken((c) => (c ? { ...c, datum: v } : c))}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TimeField
              label="Van"
              value={bewerken?.van ?? null}
              onChange={(v) => setBewerken((c) => (c ? { ...c, van: v } : c))}
              placeholder="Kies"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField
              label="Tot"
              value={bewerken?.tot ?? null}
              onChange={(v) => setBewerken((c) => (c ? { ...c, tot: v } : c))}
              placeholder="Kies"
            />
          </View>
        </View>
        {bewerkUren.fout ? <NoticeBanner toon="waarschuwing" message={bewerkUren.fout} /> : null}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Uren"
              value={bewerkUren.waarde}
              onChangeText={(v) => setBewerken((c) => (c ? { ...c, uren: v } : c))}
              placeholder="1,5"
              keyboardType="decimal-pad"
              editable={!bewerkUren.berekend}
              hint={bewerkUren.berekend ? 'Berekend uit de tijden' : undefined}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Pauze"
              value={bewerken?.pauze ?? ''}
              onChangeText={(v) => setBewerken((c) => (c ? { ...c, pauze: v } : c))}
              placeholder="0"
              keyboardType="number-pad"
              hint="minuten"
            />
          </View>
        </View>
        <FormField
          label="Omschrijving"
          value={bewerken?.notitie ?? ''}
          onChangeText={(v) => setBewerken((c) => (c ? { ...c, notitie: v } : c))}
          placeholder="Wat is er gedaan?"
          multiline
        />
      </FormSheet>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Eén getal uit de statistiekrij onder de samenvatting (stijl uit het ontwerp). */
function UrenStat({
  label,
  uren,
  styles,
  leeg,
}: {
  label: string;
  uren: number;
  styles: ReturnType<typeof makeStyles>;
  /** Geen getal tonen (bijvoorbeeld "niet aan een klus" zonder werkdag). */
  leeg?: boolean;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.summaryStatN}>{leeg ? '–' : formatHM(uren)}</Text>
      <Text style={styles.summaryStatL} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * De twee situaties die niet kloppen, als waarschuwing onder de samenvatting:
 * werkbonuren zonder werkdag, en meer werkbon- dan werkdaguren. Geen
 * wegrekenen, gewoon zeggen wat er ontbreekt.
 */
function UrenSignaal({
  dag,
  wie,
  styles,
}: {
  dag: DagUren;
  wie: 'ik' | 'team';
  styles: ReturnType<typeof makeStyles>;
}) {
  let tekst: string | null = null;
  if (wie === 'team') {
    const delen = [
      dag.zonderWerkdag > 0
        ? `${dag.zonderWerkdag} ${dag.zonderWerkdag === 1 ? 'medewerker heeft' : 'medewerkers hebben'} vandaag werkbonuren maar geen werkdag geschreven.`
        : null,
      dag.klusGroter > 0
        ? `Bij ${dag.klusGroter} ${dag.klusGroter === 1 ? 'medewerker zijn' : 'medewerkers zijn'} de werkbonuren hoger dan de werkdaguren.`
        : null,
    ].filter(Boolean);
    tekst = delen.length ? delen.join(' ') : null;
  } else if (dag.zonderWerkdag > 0) {
    tekst = `Je hebt vandaag ${formatHM(dag.werkbon)} op werkbonnen geboekt, maar nog geen werkdaguren geschreven. Vul je werkdag aan via "Uren toevoegen" → Overig.`;
  } else if (dag.klusGroter > 0) {
    tekst = `Je werkbonuren (${formatHM(dag.werkbon)}) zijn hoger dan je werkdaguren (${formatHM(dag.werkdag)}). Controleer je werkdag of de uren op de werkbonnen.`;
  }
  if (!tekst) return null;
  return (
    <View style={styles.signaalWrap}>
      <NoticeBanner
        toon="waarschuwing"
        title={dag.zonderWerkdag > 0 && wie === 'ik' ? 'Werkdaguren ontbreken' : 'Uren kloppen niet'}
        message={tekst}
      />
    </View>
  );
}

function ProgressRing({
  pct,
  styles,
  t,
}: {
  pct: number;
  styles: ReturnType<typeof makeStyles>;
  t: ThemeColors;
}) {
  const radius = 30;
  const stroke = 8;
  const size = 76;
  const c = 2 * Math.PI * radius;
  const offset = c * (1 - pct / 100);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={t.bgAlt}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ds.green}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringLabelWrap}>
        <Text style={styles.ringLabel}>{Math.round(pct)}%</Text>
      </View>
    </View>
  );
}


/** De bewerkbare velden van een uurregel, ongeacht uit welke tabel hij komt. */
type UurConcept = {
  id: string;
  bron: 'werkdag' | 'werkbon';
  datum: string;
  /** `HH:MM` of leeg. */
  van: string | null;
  tot: string | null;
  uren: string;
  pauze: string;
  notitie: string;
};

/**
 * Eén urenregistratie, in de vorm uit het ontwerp:
 *
 *   [ 004 ]  Schilderij verhuizen                        2,5 u
 *            Vandaag · 08:30–11:00 · 30 min pauze
 *
 * Het tegeltje links draagt het werkbonnummer (groen) of "ALG" voor
 * werkdaguren (grijs) — zo is met één blik te zien of een regel aan een klus
 * hangt, en dus in welke tabel hij staat.
 */
function EntryCard({
  entry,
  styles,
  t,
  onEdit,
}: {
  entry: UrenRegel;
  styles: ReturnType<typeof makeStyles>;
  t: ThemeColors;
  /** Ontbreekt als deze gebruiker niets mag wijzigen. */
  onEdit?: () => void;
}) {
  const werkbon = entry.bron === 'werkbon';
  const tag = werkbon
    ? (entry.werkbonLabel ?? 'WB').replace(/^WB-?/i, '') || 'WB'
    : 'ALG';
  const tt = typeLabel(entry.type, t);
  const titel = entry.werkbonLabel ?? entry.notitie ?? tt.label;
  const meta = [
    formatDagLabel(entry.datum),
    timeRange(entry),
    entry.pauze_minuten ? `${entry.pauze_minuten} min pauze` : null,
    werkbon ? null : tt.label,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onEdit}
      disabled={!onEdit}
      accessibilityRole={onEdit ? 'button' : undefined}
      accessibilityLabel={onEdit ? 'Uren bewerken' : undefined}
      style={({ pressed }) => [styles.entry, pressed && onEdit && { opacity: 0.95 }]}
    >
      <View
        style={[
          styles.entryTag,
          { backgroundColor: werkbon ? t.green50 : t.bgAlt },
        ]}
      >
        <Text
          style={[styles.entryTagText, { color: werkbon ? t.green700 : t.muted }]}
          numberOfLines={1}
        >
          {tag}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.entryTitle} numberOfLines={1}>
          {titel}
        </Text>
        <Text style={styles.entryMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={styles.entryDur}>{formatHours(Number(entry.uren) || 0)}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ringLabelWrap: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: t.ink,
    letterSpacing: -0.4,
  },
  summaryKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: t.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  summaryNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 2,
  },
  summaryNumber: {
    fontSize: 30,
    fontWeight: '800',
    color: t.ink,
    letterSpacing: -0.9,
  },
  summaryNumberSub: {
    fontSize: 14,
    fontWeight: '600',
    color: t.muted,
  },
  summaryMissing: {
    fontSize: 12.5,
    fontWeight: '700',
    color: t.statusWarnFg,
    marginTop: 4,
  },
  summaryDone: {
    fontSize: 12.5,
    fontWeight: '700',
    color: ds.green700,
    marginTop: 4,
  },
  summaryStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: t.line,
  },
  summaryStatN: {
    fontSize: 18,
    fontWeight: '800',
    color: t.ink,
    letterSpacing: -0.4,
  },
  summaryStatL: {
    fontSize: 11.5,
    fontWeight: '600',
    color: t.muted,
    marginTop: 1,
  },

  // Quick add
  quickAddHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickAddIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: t.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: t.ink,
    letterSpacing: -0.3,
  },
  miniFields: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  miniField: {
    flex: 1,
    backgroundColor: t.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  miniFieldLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: t.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  miniFieldValue: {
    fontSize: 16,
    fontWeight: '700',
    color: t.ink,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  quickAddPrimary: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: ds.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: t.greenInk,
    letterSpacing: -0.2,
  },
  quickAddNow: {
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickAddNowText: {
    fontSize: 13,
    fontWeight: '700',
    color: t.ink,
  },

  // Attention
  attention: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    backgroundColor: t.statusWarnBg,
    borderRadius: ds.rMd,
    borderWidth: 1,
    borderColor: 'rgba(255,194,58,0.35)',
  },
  attentionStripe: {
    width: 4,
    borderRadius: 4,
    backgroundColor: t.statusWarnStripe,
  },
  attentionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: t.ink,
    letterSpacing: -0.2,
  },
  attentionSub: {
    fontSize: 12,
    color: t.muted,
    marginTop: 2,
  },
  attentionBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: 'rgba(138,90,0,0.18)',
  },
  attentionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: t.statusWarnFg,
  },

  // Week strip
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  weekItem: {
    alignItems: 'center',
    gap: 6,
    width: 36,
  },
  weekHours: {
    fontSize: 11,
    fontWeight: '700',
    color: t.muted,
  },
  weekBarFrame: {
    height: 52,
    width: 18,
    justifyContent: 'flex-end',
  },
  weekBar: {
    width: '100%',
    borderRadius: 6,
  },
  weekBarVol: { backgroundColor: t.ink },
  weekBarDeels: { backgroundColor: t.muted2 },
  weekLabelOn: { color: t.green700, fontWeight: '700' },
  weekBarOn: {
    backgroundColor: ds.green,
  },
  weekBarIdle: {
    backgroundColor: t.bgAlt,
  },
  // Een dag die niet klopt: zelfde amber als de waarschuwingen elders.
  weekBarLet: {
    backgroundColor: t.statusWarnStripe,
  },
  weekHoursLet: {
    color: t.statusWarnFg,
  },
  weekLetTekst: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: t.statusWarnFg,
  },
  signaalWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  weekLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: t.muted,
  },

  // Entry card
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: ds.rMd,
    ...dsShadow,
  },
  entryTag: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryTagText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.24 },
  entryTitle: { fontSize: 14.5, fontWeight: '600', color: t.ink },
  entryMeta: { fontSize: 12.5, color: t.muted, marginTop: 2 },
  entryDur: {
    fontSize: 15,
    fontWeight: '700',
    color: t.ink,
    fontVariant: ['tabular-nums'],
  },

  // Weekkaart
  weekKop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  weekKopTitel: { fontSize: 14, fontWeight: '700', color: t.ink },
  weekKopMeta: { fontSize: 12.5, fontWeight: '600', color: t.muted },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Empty
  emptyCard: {
    alignItems: 'center',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: t.green50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: t.ink,
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 13.5,
    color: t.muted,
    textAlign: 'center',
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: ds.green,
    borderRadius: 12,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: t.greenInk,
  },

  // Team
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  teamRowBorder: {
    borderTopWidth: 1,
    borderTopColor: t.line,
  },
  teamAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: ds.green700,
  },
  teamHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  teamName: {
    fontSize: 14,
    fontWeight: '700',
    color: t.ink,
  },
  teamHours: {
    fontSize: 13,
    fontWeight: '700',
    color: t.ink,
  },
  teamBarFrame: {
    marginTop: 6,
    height: 5,
    borderRadius: 99,
    backgroundColor: t.bgAlt,
    overflow: 'hidden',
  },
  teamBar: {
    height: '100%',
    backgroundColor: ds.green,
  },
});
