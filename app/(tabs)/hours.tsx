import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { ChevronLeft, ChevronRight, ClipboardList, Clock, Plus } from 'lucide-react-native';
import {
  AppCard,
  AppFilterChips,
  AppScreen,
  AppTopBar,
  DateField,
  ErrorState,
  HeaderIconButton,
  FormField,
  FormSheet,
  LoadingScreen,
  NoticeBanner,
  SelectField,
  TimeField,
  type ChipDef,
  type SelectOption,
} from '@/components';
import { PauzeKeuze } from '@/components/PauzeKeuze';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  deleteTimeEntry,
  echteUurId,
  listCompanyUren,
  listUrenForProfile,
  updateTimeEntry,
} from '@/services/timeEntryService';
import { listCompanyProfiles } from '@/services/workOrderService';
import { todayISO, formatHours } from '@/lib/format';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import type { UrenRegel } from '@/types/domain';
import type { DagUren } from '@/lib/urenTotalen';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { useLaden } from '@/lib/useLaden';
import { telDagenOp, urenPerDag, urenVanDag } from '@/lib/urenTotalen';
import { berekenUren } from '@/lib/urenBerekening';
import {
  dagKop,
  dagenVanWeek,
  filterUren,
  groepeerPerDag,
  leesKm,
  maandagVan,
  plusDagen,
  rondAfOpVijf,
  urenKpi,
  weekLabel,
  type UrenFilter,
  magTeamWerkdagen,
} from '@/lib/urenRegels';
import { useOnthouden } from '@/lib/useOnthouden';

const NL_DAYS_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

function formatHM(hours: number): string {
  if (!hours) return '0u';
  if (Number.isInteger(hours)) return `${hours}u`;
  return `${hours.toFixed(2).replace(/0$/, '').replace('.', ',')}u`;
}

function timeRange(entry: UrenRegel): string | null {
  if (entry.start_tijd && entry.eind_tijd) {
    return `${entry.start_tijd.slice(0, 5)} – ${entry.eind_tijd.slice(0, 5)}`;
  }
  return null;
}

type Scope = 'ik' | 'team';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/**
 * Uren — gelijk aan de urenpagina van het dashboard:
 *
 * - **Werkdaguren** (`urenregistratie`) zijn hier te bewerken en verwijderen.
 * - **Werkbonuren** (`werkbon_uren`) staan er ter inzage; wijzigen gebeurt op
 *   de werkbon (tik → werkbon).
 * - De twee worden nooit opgeteld: totalen per soort, met het verschil.
 * - Weeknavigatie (ma t/m zo), tijden afgerond op vijf minuten.
 * - Admin en wie het recht planning heeft (dashboard: `canBookForOthers`) zien ook het team, met
 *   een medewerkerfilter; KPI's tellen over de periode, niet over dat filter.
 */
export default function HoursScreen() {
  const router = useRouter();
  const { user, role } = useAuth();
  const { can, readonly, loaded: rechtenGeladen } = usePermissions();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  // Dashboard: canBookForOthers = magBewerken('planning'); RLS op
  // urenregistratie: eigen rijen, of admin/recht planning.
  const magTeam = magTeamWerkdagen({ userId: user?.id ?? null, role, can });

  const vandaag = todayISO();
  const [maandag, setMaandag] = useState(() => maandagVan(todayISO()));
  const weekDatums = useMemo(() => dagenVanWeek(maandag), [maandag]);
  const zondag = weekDatums[6]!;
  const isDezeWeek = weekDatums.includes(vandaag);

  const [scope, setScope] = useOnthouden<Scope>('uren.scope', 'ik', ['ik', 'team']);
  const team = scope === 'team' && magTeam;
  const [medewerker, setMedewerker] = useOnthouden<string | null>('uren.medewerker', null, (v) => typeof v === 'string');
  const [namen, setNamen] = useState<Record<string, string>>({});

  const [entries, setEntries] = useState<UrenRegel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useOnthouden<UrenFilter>('uren.filter', 'alles', ['alles', 'werkdag', 'werkbon', 'open']);
  const [bewerken, setBewerken] = useState<UurConcept | null>(null);
  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();

  const userId = user?.id;
  const load = useCallback(async () => {
    if (!userId) return;
    setError(null);
    const { data, error: fetchError } = team
      ? await listCompanyUren(maandag, zondag)
      : await listUrenForProfile(userId, maandag, zondag);
    // Faalt één van de twee tabellen, dan is het totaal onvolledig — dat
    // melden we in plaats van een te laag getal als echt totaal te tonen.
    setError(fetchError);
    setEntries(data);
    if (team) {
      const p = await listCompanyProfiles();
      if (!p.error) {
        setNamen(Object.fromEntries(p.data.map((x) => [x.id, x.full_name ?? 'Medewerker'])));
      }
    }
  }, [userId, team, maandag, zondag]);

  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });

  // Medewerkerfilter (alleen team). KPI's en weekbalken tellen over de periode.
  const zichtbaar = useMemo(
    () => (team && medewerker ? entries.filter((e) => e.profile_id === medewerker) : entries),
    [entries, team, medewerker],
  );

  const vandaagUren = useMemo(() => urenVanDag(entries, vandaag), [entries, vandaag]);
  const vandaagAantal = useMemo(() => entries.filter((e) => e.datum === vandaag).length, [entries, vandaag]);
  const expectedToday = 8;
  const missingToday = Math.max(0, expectedToday - vandaagUren.werkdag);
  const pct = Math.min(100, (vandaagUren.werkdag / expectedToday) * 100);

  const weekDagen = useMemo(() => urenPerDag(entries, weekDatums), [entries, weekDatums]);
  const week = useMemo(() => telDagenOp(weekDagen), [weekDagen]);
  const kpiWerkdag = useMemo(() => urenKpi(entries.filter((e) => e.bron === 'werkdag')), [entries]);

  const gefilterd = useMemo(() => filterUren(zichtbaar, filter), [zichtbaar, filter]);
  const groepen = useMemo(() => groepeerPerDag(gefilterd), [gefilterd]);

  const chips: ChipDef<UrenFilter>[] = useMemo(
    () => [
      { id: 'alles', label: 'Alles', count: zichtbaar.length },
      { id: 'werkdag', label: 'Werkdaguren', count: filterUren(zichtbaar, 'werkdag').length },
      { id: 'werkbon', label: 'Werkbonuren', count: filterUren(zichtbaar, 'werkbon').length },
      { id: 'open', label: 'Open', count: filterUren(zichtbaar, 'open').length },
    ],
    [zichtbaar],
  );

  const medewerkerOpties: SelectOption[] = useMemo(() => {
    const ids = Array.from(new Set(entries.map((e) => e.profile_id)));
    return ids
      .map((id) => ({ id, label: namen[id] ?? 'Medewerker' }))
      .sort((a, b) => a.label.localeCompare(b.label, 'nl'));
  }, [entries, namen]);

  // Bewerken: staan begin én eind er, dan zijn de uren eind − begin − pauze.
  // Anders blijft het ingevulde aantal staan (oude regels zonder tijden).
  const bewerkUren = useMemo(() => {
    if (!bewerken) return { waarde: '', berekend: false, fout: null as string | null };
    if (bewerken.van && bewerken.tot) {
      const uren = berekenUren(bewerken.van, bewerken.tot, bewerken.pauze);
      if (uren === null) {
        const eindVoorStart = berekenUren(bewerken.van, bewerken.tot, 0) === null;
        return {
          waarde: bewerken.uren,
          berekend: false,
          fout: eindVoorStart
            ? 'Eindtijd moet later zijn dan starttijd.'
            : 'Er blijft geen tijd over na aftrek van de pauze.',
        };
      }
      return { waarde: String(uren).replace('.', ','), berekend: true, fout: null };
    }
    return { waarde: bewerken.uren, berekend: false, fout: null };
  }, [bewerken]);
  const kmWaarde = bewerken ? leesKm(bewerken.km) : null;

  const naarNieuw = () => router.push('/hours/new');
  const openRegel = (e: UrenRegel) => {
    if (e.bron === 'werkbon') {
      // Werkbonuren zijn hier alleen ter inzage; wijzigen doe je op de werkbon.
      if (e.werkbon_id) router.push(`/work-orders/${e.werkbon_id}`);
      return;
    }
    setSaveError(null);
    setBewerken({
      id: echteUurId(e.id),
      datum: e.datum,
      van: e.start_tijd ? e.start_tijd.slice(0, 5) : null,
      tot: e.eind_tijd ? e.eind_tijd.slice(0, 5) : null,
      uren: String(e.uren ?? '').replace('.', ','),
      pauze: e.pauze_minuten ?? 0,
      km: (e as { reis_km?: number | null }).reis_km != null ? String((e as { reis_km?: number | null }).reis_km).replace('.', ',') : '',
      notitie: e.notitie ?? '',
    });
  };

  if (loading && entries.length === 0) {
    return <LoadingScreen label="Uren laden..." />;
  }
  if (error && entries.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ErrorState title="Uren niet geladen" message={`Kon urenregistraties niet laden — ${error}`} onRetry={opnieuw} />
      </View>
    );
  }

  const todayWeekIdx = weekDatums.indexOf(vandaag);
  const magSchrijven = rechtenGeladen && !readonly;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            title="Uren"
            subtitle={team ? `Team · ${formatHM(week.werkdag)} werkdaguren` : `${formatHM(week.werkdag)} van 40 u deze week`}
            rightAction={
              magSchrijven ? (
                <HeaderIconButton icon={Plus} label="Uren registreren" size={42} onPress={naarNieuw} />
              ) : undefined
            }
            showProfileButton
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* Weeknavigatie: ma t/m zo, zoals de periodekeuze in het dashboard. */}
        <View style={styles.navRow}>
          <Pressable
            onPress={() => setMaandag((m) => plusDagen(m, -7))}
            accessibilityRole="button"
            accessibilityLabel="Vorige week"
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}
          >
            <ChevronLeft size={20} color={t.ink} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.navLabel} numberOfLines={1}>
            {weekLabel(maandag)}
          </Text>
          {!isDezeWeek ? (
            <Pressable
              onPress={() => setMaandag(maandagVan(todayISO()))}
              accessibilityRole="button"
              accessibilityLabel="Naar deze week"
              style={({ pressed }) => [styles.todayBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.todayBtnText}>Vandaag</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setMaandag((m) => plusDagen(m, 7))}
            accessibilityRole="button"
            accessibilityLabel="Volgende week"
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}
          >
            <ChevronRight size={20} color={t.ink} strokeWidth={2.4} />
          </Pressable>
        </View>

        {magTeam ? (
          <View style={styles.scopeWrap}>
            <View style={styles.scopeGroep}>
              {(['ik', 'team'] as const).map((k) => {
                const on = scope === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => {
                      setScope(k);
                      setMedewerker(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    aria-pressed={on}
                    style={[styles.scopeKnop, on && [styles.scopeKnopAan, dsShadow]]}
                  >
                    <Text style={[styles.scopeTekst, on && styles.scopeTekstAan]}>
                      {k === 'ik' ? 'Mijn uren' : 'Team'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {team ? (
              <SelectField
                label="Medewerker"
                value={medewerker}
                options={medewerkerOpties}
                onChange={setMedewerker}
                allowEmpty
                emptyLabel="Alle medewerkers"
                placeholder="Alle medewerkers"
                searchable={medewerkerOpties.length > 8}
              />
            ) : null}
          </View>
        ) : null}

        {/* Vandaag — alleen in de lopende week en voor je eigen uren. */}
        {isDezeWeek && !team ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
            <AppCard padding={18}>
              <View style={styles.summaryTop}>
                <ProgressRing pct={pct} styles={styles} t={t} />
                <View style={{ flex: 1, marginLeft: 16, minWidth: 0 }}>
                  <Text style={styles.summaryKicker}>Werkdag vandaag</Text>
                  <View style={styles.summaryNumberRow}>
                    <Text style={styles.summaryNumber}>{vandaagUren.werkdag.toString().replace('.', ',')}</Text>
                    <Text style={styles.summaryNumberSub}>/ {expectedToday} uur</Text>
                  </View>
                  <Text style={missingToday > 0 ? styles.summaryMissing : styles.summaryDone}>
                    {missingToday > 0 ? `Nog ${formatHM(missingToday)} te schrijven` : 'Dag compleet'} · {vandaagAantal}{' '}
                    {vandaagAantal === 1 ? 'registratie' : 'registraties'}
                  </Text>
                </View>
              </View>
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
        ) : null}
        {isDezeWeek ? <UrenSignaal dag={vandaagUren} wie={team ? 'team' : 'ik'} styles={styles} /> : null}

        {/* Weekoverzicht */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <AppCard padding={16}>
            <View style={styles.weekKop}>
              <Text style={styles.weekKopTitel}>Weekoverzicht</Text>
              <Text style={styles.weekKopMeta}>
                {team ? `${formatHM(week.werkdag)} werkdag` : `${formatHM(week.werkdag)} van 40 u werkdag`}
              </Text>
            </View>
            <View style={styles.weekRow}>
              {NL_DAYS_SHORT.map((label, idx) => {
                const dag = weekDagen[idx];
                const hours = dag?.werkdag ?? 0;
                const signaal = !!dag && (dag.zonderWerkdag > 0 || dag.klusGroter > 0);
                const on = idx === todayWeekIdx;
                const norm = team ? Math.max(8, ...weekDagen.map((d) => d.werkdag)) : 8;
                const height = Math.max(hours || signaal ? 6 : 4, Math.min(52, (hours / norm) * 52));
                return (
                  <View key={label} style={styles.weekItem}>
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
                    <Text style={[styles.weekLabel, on && styles.weekLabelOn]}>{label}</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.summaryStats}>
              <UrenStat label="Werkdag" uren={week.werkdag} styles={styles} />
              <UrenStat label="Op werkbonnen" uren={week.werkbon} styles={styles} />
              <UrenStat label="Niet aan een klus" uren={Math.max(0, week.verschil)} styles={styles} leeg={week.werkdag === 0} />
            </View>
            {team ? (
              <Text style={styles.kpiRegel}>
                {kpiWerkdag.medewerkers} {kpiWerkdag.medewerkers === 1 ? 'medewerker' : 'medewerkers'} · gem.{' '}
                {formatHM(kpiWerkdag.gemPerDag)} per dag over {kpiWerkdag.dagen}{' '}
                {kpiWerkdag.dagen === 1 ? 'dag' : 'dagen'}
              </Text>
            ) : null}
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

        {error && entries.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <NoticeBanner toon="fout" message={`${error} Het totaal hierboven kan daardoor onvolledig zijn.`} />
          </View>
        ) : null}

        <View style={{ height: 12 }} />
        <AppFilterChips chips={chips} active={filter} onChange={setFilter} />
        {filter === 'werkbon' ? (
          <Text style={styles.uitleg}>Hier alleen ter inzage; wijzigen doe je op de werkbon.</Text>
        ) : filter === 'open' ? (
          <Text style={styles.uitleg}>
            Dagen met werkbonuren waarbij de werkdaguren ontbreken of korter zijn dan de klusuren.
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: 16, gap: 10, marginTop: 12 }}>
          {groepen.length === 0 ? (
            <AppCard padding={26} style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Clock size={28} color={ds.green} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>
                {filter === 'werkbon'
                  ? 'Geen werkbonuren in deze periode'
                  : filter === 'open'
                    ? 'Niets open in deze periode'
                    : 'Geen urenregistraties gevonden'}
              </Text>
              {magSchrijven && filter !== 'werkbon' && filter !== 'open' ? (
                <Pressable
                  onPress={naarNieuw}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
                >
                  <Plus size={18} color={ds.greenInk} strokeWidth={2.4} />
                  <Text style={styles.emptyBtnText}>Uren registreren</Text>
                </Pressable>
              ) : null}
            </AppCard>
          ) : (
            groepen.map((g) => (
              <View key={g.datum} style={{ gap: 8 }}>
                <View style={styles.groepKop}>
                  <Text style={styles.groepTitel}>{dagKop(g.datum, vandaag)}</Text>
                  <Text style={styles.groepTotaal}>
                    {[
                      g.werkdag ? `${formatHours(g.werkdag)} werkdag` : null,
                      g.werkbon ? `${formatHours(g.werkbon)} werkbon` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {g.regels.map((e) => (
                  <EntryCard
                    key={e.id}
                    entry={e}
                    naam={team ? (namen[e.profile_id] ?? null) : null}
                    styles={styles}
                    t={t}
                    onPress={
                      e.bron === 'werkbon'
                        ? e.werkbon_id
                          ? () => openRegel(e)
                          : undefined
                        : rechtenGeladen
                          ? () => openRegel(e)
                          : undefined
                    }
                  />
                ))}
              </View>
            ))
          )}
        </View>
      </AppScreen>

      {/* Werkdaguren bewerken. Werkbonuren wijzig je op de werkbon zelf. */}
      <FormSheet
        visible={bewerken !== null}
        title="Werkdaguren bewerken"
        error={saveError}
        saving={saving}
        submitDisabled={readonly || !bewerkUren.waarde.trim() || !!bewerkUren.fout || kmWaarde === undefined}
        onSubmit={() => {
          if (!bewerken || bewerkUren.fout || kmWaarde === undefined) return;
          const velden = {
            datum: bewerken.datum,
            start_tijd: bewerken.van,
            eind_tijd: bewerken.tot,
            uren: Number(bewerkUren.waarde.replace(',', '.')),
            pauze_minuten: bewerken.pauze,
            reis_km: kmWaarde,
            notitie: bewerken.notitie,
          };
          save(() => updateTimeEntry(bewerken.id, velden), {
            onSuccess: async () => {
              setBewerken(null);
              await herlaad();
            },
          });
        }}
        onClose={() => setBewerken(null)}
        destructive={
          readonly
            ? undefined
            : {
                label: 'Uren verwijderen',
                onPress: () => {
                  if (!bewerken) return;
                  const { id } = bewerken;
                  bevestigVerwijderen('Uren', () => {
                    save(() => deleteTimeEntry(id), {
                      onSuccess: async () => {
                        setBewerken(null);
                        await herlaad();
                      },
                    });
                  });
                },
              }
        }
      >
        <DateField
          label="Datum"
          value={bewerken?.datum ?? null}
          onChange={(v) => setBewerken((c) => (c ? { ...c, datum: v } : c))}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TimeField
              label="Starttijd"
              value={bewerken?.van ?? null}
              onChange={(v) => setBewerken((c) => (c ? { ...c, van: rondAfOpVijf(v) } : c))}
              placeholder="Kies"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField
              label="Eindtijd"
              value={bewerken?.tot ?? null}
              onChange={(v) => setBewerken((c) => (c ? { ...c, tot: rondAfOpVijf(v) } : c))}
              placeholder="Kies"
            />
          </View>
        </View>
        <PauzeKeuze
          waarde={bewerken?.pauze ?? 0}
          onChange={(m) => setBewerken((c) => (c ? { ...c, pauze: m } : c))}
        />
        {bewerkUren.fout ? <NoticeBanner toon="waarschuwing" message={bewerkUren.fout} /> : null}
        <FormField
          label="Uren"
          value={bewerkUren.waarde}
          onChangeText={(v) => setBewerken((c) => (c ? { ...c, uren: v } : c))}
          placeholder="1,5"
          keyboardType="decimal-pad"
          editable={!bewerkUren.berekend}
          hint={
            bewerkUren.berekend
              ? `≈ ${bewerkUren.waarde} uur${bewerken?.pauze ? ` (${bewerken.pauze} min pauze eraf)` : ''}`
              : undefined
          }
        />
        <FormField
          label="Gereden kilometers"
          value={bewerken?.km ?? ''}
          onChangeText={(v) => setBewerken((c) => (c ? { ...c, km: v } : c))}
          placeholder="Optioneel"
          keyboardType="decimal-pad"
          hint={kmWaarde === undefined ? 'Vul een getal van 0 of meer in.' : undefined}
        />
        <FormField
          label="Notitie"
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
/** De bewerkbare velden van een werkdaguur (`urenregistratie`). */
type UurConcept = {
  id: string;
  datum: string;
  /** `HH:MM` of leeg. */
  van: string | null;
  tot: string | null;
  uren: string;
  pauze: number;
  /** Tekst; leeg = niet ingevuld. */
  km: string;
  notitie: string;
};

/**
 * Eén urenregistratie. Het tegeltje links draagt het werkbonnummer (groen,
 * werkbonuur, alleen-lezen → tik opent de werkbon) of "ALG" voor een
 * werkdaguur (grijs, tik = bewerken).
 */
function EntryCard({
  entry,
  naam,
  styles,
  t,
  onPress,
}: {
  entry: UrenRegel;
  /** Naam van de medewerker (teamoverzicht). */
  naam: string | null;
  styles: ReturnType<typeof makeStyles>;
  t: ThemeColors;
  onPress?: () => void;
}) {
  const werkbon = entry.bron === 'werkbon';
  const tag = werkbon ? (entry.werkbonLabel ?? 'WB').split(' · ')[0]!.replace(/^WB-?/i, '') || 'WB' : 'ALG';
  const titel = werkbon ? (entry.werkbonLabel ?? 'Werkbon') : entry.notitie?.trim() || 'Werkdag';
  const km = (entry as { reis_km?: number | null }).reis_km;
  const meta = [
    naam,
    timeRange(entry),
    entry.pauze_minuten ? `${entry.pauze_minuten} min pauze` : null,
    km != null ? `${String(km).replace('.', ',')} km` : null,
    werkbon ? 'Werkbonuur' : 'Werkdaguur',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? (werkbon ? 'Werkbon openen' : 'Werkdaguren bewerken') : undefined}
      style={({ pressed }) => [styles.entry, pressed && onPress && { opacity: 0.95 }]}
    >
      <View style={[styles.entryTag, { backgroundColor: werkbon ? t.green50 : t.bgAlt }]}>
        <Text style={[styles.entryTagText, { color: werkbon ? t.green700 : t.muted }]} numberOfLines={1}>
          {tag}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.entryTitle} numberOfLines={1}>
          {titel}
        </Text>
        <Text style={styles.entryMeta} numberOfLines={2}>
          {meta}
        </Text>
      </View>
      <Text style={styles.entryDur}>{formatHours(Number(entry.uren) || 0)}</Text>
      {werkbon && onPress ? <ClipboardList size={16} color={t.muted} strokeWidth={2} /> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: t.ink, textAlign: 'center' },
  todayBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: t.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: { fontSize: 13, fontWeight: '700', color: t.green700 },
  scopeWrap: { paddingHorizontal: 16, paddingBottom: 8, gap: 10 },
  scopeGroep: { flexDirection: 'row', backgroundColor: t.bgAlt, borderRadius: 14, padding: 4, gap: 4 },
  scopeKnop: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  scopeKnopAan: { backgroundColor: t.card },
  scopeTekst: { fontSize: 13.5, fontWeight: '600', color: t.muted },
  scopeTekstAan: { color: t.ink },
  kpiRegel: { marginTop: 10, fontSize: 12, fontWeight: '600', color: t.muted },
  uitleg: { paddingHorizontal: 16, marginTop: 8, fontSize: 12.5, color: t.muted },
  groepKop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6,
    gap: 8,
  },
  groepTitel: { fontSize: 13, fontWeight: '700', color: t.ink },
  groepTotaal: { fontSize: 12, fontWeight: '600', color: t.muted, flexShrink: 1, textAlign: 'right' },
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
