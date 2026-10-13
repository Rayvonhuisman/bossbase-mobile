import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, Plus } from 'lucide-react-native';
import {
  ActivityFormSheet,
  AppFilterChips,
  AppListGroup,
  AppScreen,
  AppSearchBar,
  AppSection,
  AppTopBar,
  Button,
  EmptyState,
  ErrorState,
  HeaderIconButton,
  LoadingScreen,
  SelectField,
  conceptVanActiviteit,
  leegConcept,
  type ActivityConcept,
  type SelectOption,
} from '@/components';
import { ActiviteitRij } from '@/components/ActiviteitRij';
import { usePermissions, useTheme } from '@/providers';
import {
  listAllActivities,
  setActivityCompleted,
  type ActivityRow,
} from '@/services/activityService';
import { listCustomers } from '@/services/customerService';
import { listCompanyProfiles } from '@/services/teamService';
import {
  activiteitStatus,
  filterActiviteiten,
  groepeerActiviteiten,
  telActiviteiten,
  ACTIVITEIT_FILTERS,
  type ActiviteitFilter,
} from '@/lib/activiteitStatus';
import { lokaleDatum, vandaagIso } from '@/lib/nlTijd';
import { useSave } from '@/lib/useSave';
import { useLaden } from '@/lib/useLaden';
import { useSchermklasse } from '@/lib/schermklasse';
import { terugOfNaar } from '@/lib/navigatie';
import { ds, spacing, type ThemeColors } from '@/theme';

/**
 * Activiteiten — gelijk aan `ActivitiesPageV2` in het dashboard.
 *
 * - Status wordt afgeleid uit `completed` en de Nederlandse dag van `due_at`
 *   (te laat / vandaag / binnenkort / afgerond), zie `lib/activiteitStatus`.
 * - Filters: status (met tellers), verantwoordelijke en zoeken op titel of
 *   klant; lijst in datumgroepen (Te laat, Vandaag, Morgen, Deze week, Later,
 *   Afgerond).
 * - Aanmaken mag iedereen (behalve read-only); wijzigen en verwijderen alleen
 *   admin of recht planning, net als `ActivityEditModal`; afronden en heropenen mag
 *   iedereen die de activiteit ziet.
 * - `?id=<id>` opent een activiteit (de homepage linkt zo), `?nieuw=1` opent
 *   een nieuwe. De oude pagina Taken (`/tasks`) verwijst hierheen.
 *
 * RLS: een gewone medewerker krijgt alleen zijn eigen activiteiten terug
 * (gedeelde werkruimte, planning, agenda_inzien of zelf toegewezen).
 */

const FILTER_LABEL: Record<ActiviteitFilter, string> = {
  all: 'Alle',
  overdue: 'Te laat',
  today: 'Vandaag',
  open: 'Binnenkort',
  done: 'Afgerond',
};

const dagVan = (iso: string) => lokaleDatum(iso);

type TeamLid = { id: string; full_name: string; role: string; actief: boolean };

export default function ActivitiesScreen() {
  const router = useRouter();
  const { id: openId, nieuw } = useLocalSearchParams<{ id?: string; nieuw?: string }>();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { klasse } = useSchermklasse();
  const tablet = klasse === 'tablet';
  const { loaded: rechtenGeladen, mag, can, waaromNiet } = usePermissions();

  const [items, setItems] = useState<ActivityRow[]>([]);
  const [klanten, setKlanten] = useState<SelectOption[]>([]);
  const [team, setTeam] = useState<TeamLid[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState<ActivityConcept | null>(null);

  const [filter, setFilter] = useState<ActiviteitFilter>('all');
  const [zoek, setZoek] = useState('');
  const [medewerker, setMedewerker] = useState<string | null>(null);

  const { save: saveVink, saving: vinkBezig, error: vinkFout } = useSave<unknown>();

  const magMaken = mag('activiteiten', 'maken');
  const magAfronden = mag('activiteiten', 'afronden');
  // Dashboard (ActivityEditModal): wijzigen en verwijderen met
  // magBewerken('planning') — admin of het recht planning. De rol 'planner'
  // bestaat niet meer (20261002135952).
  const magBewerken = mag('activiteiten', 'wijzigen') && can('planning');

  const load = useCallback(async () => {
    setError(null);
    const [actRes, klantRes, teamRes] = await Promise.all([
      listAllActivities(),
      listCustomers(),
      listCompanyProfiles(),
    ]);
    if (actRes.error) setError(actRes.error);
    else setItems(actRes.data);
    // Keuzelijsten zijn hulpmiddelen: mislukken ze, dan werkt de lijst nog.
    if (!klantRes.error) {
      setKlanten(
        klantRes.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant', sub: k.city ?? undefined })),
      );
    }
    if (!teamRes.error) setTeam(teamRes.data);
  }, []);

  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });

  // Deep links vanaf de homepage: ?id=<id> opent de activiteit, ?nieuw=1 een nieuwe.
  useEffect(() => {
    if (loading || !rechtenGeladen) return;
    if (openId) {
      const a = items.find((x) => x.id === openId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (a) setConcept(conceptVanActiviteit(a));
      router.setParams({ id: undefined });
    } else if (nieuw) {
      if (magMaken) setConcept(leegConcept('task'));
      router.setParams({ nieuw: undefined });
    }
  }, [loading, rechtenGeladen, openId, nieuw, items, magMaken, router]);

  const vandaag = vandaagIso();

  const naamVan = useMemo(() => {
    const namen = new Map(team.map((p) => [p.id, p.full_name]));
    return (a: ActivityRow): string => {
      if (!a.assigned_to) return '';
      return namen.get(a.assigned_to) || a.assigned_profile?.full_name || 'Onbekend';
    };
  }, [team]);

  // Unieke verantwoordelijken uit de lijst zelf (primair én meegewezen).
  const medewerkerOpties = useMemo<SelectOption[]>(() => {
    const namen = new Map(team.map((p) => [p.id, p.full_name]));
    const gevonden = new Map<string, string>();
    for (const a of items) {
      const ids = [a.assigned_to, ...(a.assigned_to_ids ?? [])].filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      );
      for (const id of ids) {
        if (gevonden.has(id)) continue;
        const naam =
          namen.get(id) || (id === a.assigned_to ? a.assigned_profile?.full_name : null) || 'Onbekend';
        gevonden.set(id, naam);
      }
    }
    return [...gevonden.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((x, y) => x.label.localeCompare(y.label, 'nl'));
  }, [items, team]);

  const medewerkersVoorFormulier = useMemo<SelectOption[]>(
    () => team.filter((p) => p.actief).map((p) => ({ id: p.id, label: p.full_name, sub: p.role })),
    [team],
  );

  const telling = useMemo(() => telActiviteiten(items, vandaag, dagVan), [items, vandaag]);
  const gefilterd = useMemo(
    () => filterActiviteiten(items, { filter, medewerker, zoek }, vandaag, dagVan),
    [items, filter, medewerker, zoek, vandaag],
  );
  const groepen = useMemo(
    () => groepeerActiviteiten(gefilterd, vandaag, dagVan),
    [gefilterd, vandaag],
  );

  const vink = (a: ActivityRow) => {
    if (!magAfronden || vinkBezig) return;
    saveVink(() => setActivityCompleted(a.id, !a.completed), {
      onSuccess: async () => herlaad(),
    });
  };

  const filtersWissen = () => {
    setFilter('all');
    setZoek('');
    setMedewerker(null);
  };

  const terug = () => terugOfNaar(router, '/menu');
  const nieuwKnop = () => setConcept(leegConcept('task'));

  if (loading || !rechtenGeladen) return <LoadingScreen label="Activiteiten laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Activiteiten" onBack={terug} />}
        >
          <ErrorState
            title="Activiteiten konden niet worden geladen"
            message={error}
            onRetry={opnieuw}
          />
        </AppScreen>
      </View>
    );
  }

  const openstaand = telling.open + telling.today + telling.overdue;
  const subtitel = `${openstaand} openstaand${telling.overdue > 0 ? ` · ${telling.overdue} te laat` : ''}`;

  const samenvatting: {
    id: ActiviteitFilter;
    label: string;
    aantal: number;
    sub: string;
    kleur: string;
  }[] = [
    { id: 'overdue', label: 'Te laat', aantal: telling.overdue, sub: 'Pak deze het eerst aan', kleur: t.statusRejectFg },
    { id: 'today', label: 'Vandaag', aantal: telling.today, sub: 'Gepland voor vandaag', kleur: t.statusSubmitFg },
    { id: 'open', label: 'Binnenkort', aantal: telling.open, sub: 'Nog niet aan de beurt', kleur: t.ink2 },
    { id: 'done', label: 'Afgerond', aantal: telling.done, sub: 'Gereed gemeld', kleur: t.green700 },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Activiteiten"
            subtitle={subtitel}
            onBack={terug}
            rightAction={
              magMaken ? (
                <HeaderIconButton icon={Plus} label="Nieuwe activiteit" onPress={nieuwKnop} />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* Samenvattingstegels (klikbaar = filter), zoals bovenaan het dashboard. */}
        <View style={styles.tegels}>
          {samenvatting.map((s) => {
            const aan = filter === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => setFilter(aan ? 'all' : s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: aan }}
                accessibilityLabel={`${s.label}: ${s.aantal}`}
                style={({ pressed }) => [
                  styles.tegel,
                  tablet ? styles.tegelTablet : styles.tegelTelefoon,
                  aan && { borderColor: s.kleur, borderWidth: 1.5 },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.tegelLabel}>{s.label}</Text>
                <Text
                  style={[
                    styles.tegelGetal,
                    s.id === 'overdue' && s.aantal > 0 ? { color: s.kleur } : null,
                  ]}
                >
                  {s.aantal}
                </Text>
                {tablet ? <Text style={styles.tegelSub}>{s.sub}</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.filterblok}>
          <AppFilterChips
            chips={ACTIVITEIT_FILTERS.map((id) => ({
              id,
              label: FILTER_LABEL[id],
              count: telling[id],
            }))}
            active={filter}
            onChange={setFilter}
          />
          <View style={[styles.zoekRij, tablet && styles.zoekRijTablet]}>
            <View style={tablet ? styles.zoekVak : undefined}>
              <AppSearchBar value={zoek} onChange={setZoek} placeholder="Zoek activiteit of klant…" />
            </View>
            {medewerkerOpties.length > 0 ? (
              <View style={tablet ? styles.medewerkerVak : undefined}>
                <SelectField
                  label="Verantwoordelijke"
                  value={medewerker}
                  options={medewerkerOpties}
                  onChange={setMedewerker}
                  allowEmpty
                  emptyLabel="Alle medewerkers"
                  placeholder="Alle medewerkers"
                />
              </View>
            ) : null}
          </View>
        </View>

        {vinkFout ? (
          <View style={styles.foutBanner}>
            <Text style={styles.foutTekst}>{vinkFout}</Text>
          </View>
        ) : null}

        {gefilterd.length === 0 ? (
          <View>
            <EmptyState
              icon={<CheckCircle2 size={40} color={ds.green} strokeWidth={1.6} />}
              title="Geen activiteiten"
              message={
                items.length > 0
                  ? 'Geen activiteiten die aan deze filters voldoen.'
                  : magMaken
                    ? 'Alles bijgewerkt. Plan een nieuwe activiteit of geniet van de rust.'
                    : (waaromNiet('activiteiten', 'maken') ?? 'Er staan nog geen activiteiten klaar.')
              }
            />
            <View style={styles.legeKnoppen}>
              {magMaken ? <Button label="Nieuwe activiteit" onPress={nieuwKnop} /> : null}
              {items.length > 0 ? (
                <Button label="Filters wissen" variant="secondary" onPress={filtersWissen} />
              ) : null}
            </View>
          </View>
        ) : (
          groepen.map((g) => (
            <View key={g.key}>
              {g.key === 'overdue' ? (
                // De groep "Te laat" in rood, net als in het dashboard.
                <View style={styles.groepKop}>
                  <Text style={[styles.groepTitel, { color: t.statusRejectFg }]}>{g.titel}</Text>
                  <Text style={[styles.groepAantal, { color: t.statusRejectFg }]}>
                    {g.rijen.length}
                  </Text>
                </View>
              ) : (
                <AppSection title={g.titel} count={g.rijen.length} variant="eyebrow" />
              )}
              <AppListGroup>
                {g.rijen.map((a, i) => (
                  <ActiviteitRij
                    key={a.id}
                    activiteit={a}
                    status={activiteitStatus(a, vandaag, dagVan)}
                    medewerker={naamVan(a)}
                    first={i === 0}
                    onPress={() => setConcept(conceptVanActiviteit(a))}
                    onVink={magAfronden ? () => vink(a) : undefined}
                    vinkBezig={vinkBezig}
                  />
                ))}
              </AppListGroup>
            </View>
          ))
        )}
      </AppScreen>

      <ActivityFormSheet
        concept={concept}
        klanten={klanten}
        medewerkers={medewerkersVoorFormulier}
        magBewerken={magBewerken}
        onClose={() => setConcept(null)}
        onSaved={() => herlaad()}
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    tegels: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: 16,
      marginTop: spacing.sm,
    },
    tegel: {
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: t.rMd,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 44,
    },
    tegelTablet: { flex: 1 },
    // Twee per rij op een telefoon.
    tegelTelefoon: { flexBasis: '46%', flexGrow: 1 },
    tegelLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.66,
      textTransform: 'uppercase',
      color: t.muted2,
    },
    tegelGetal: { fontSize: 22, fontWeight: '700', marginTop: 2, color: t.ink },
    tegelSub: { fontSize: 12, color: t.muted, marginTop: 2 },
    filterblok: { marginTop: spacing.md, gap: spacing.sm },
    zoekRij: { paddingHorizontal: 16, gap: spacing.sm },
    zoekRijTablet: { flexDirection: 'row', alignItems: 'flex-end' },
    zoekVak: { flex: 1.4 },
    medewerkerVak: { flex: 1 },
    groepKop: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 22,
      paddingBottom: 8,
    },
    groepTitel: {
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      letterSpacing: 0.72,
      textTransform: 'uppercase',
    },
    groepAantal: { fontSize: 12, fontWeight: '600' },
    legeKnoppen: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: 16,
    },
    foutBanner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: t.rMd,
      backgroundColor: t.statusRejectBg,
    },
    foutTekst: { fontSize: 13, fontWeight: '600', color: t.statusRejectFg },
  });
