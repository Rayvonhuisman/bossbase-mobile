import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Lock,
  Plus,
} from 'lucide-react-native';
import {
  ActivityFormSheet,
  AppCard,
  AppScreen,
  AppTopBar,
  conceptVanActiviteit,
  ErrorState,
  HeaderIconButton,
  LoadingScreen,
  NoticeBanner,
  PermissionGate,
  type ActivityConcept,
  type SelectOption,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  listActiviteitenInBereik,
  listAlleVoertuigen,
  listNietIngeplandeKandidaten,
  listWerkbonnenInBereik,
  type PlanningActiviteit,
  type PlanWerkbon,
  type Voertuig,
} from '@/services/planningService';
import { listCompanyProfiles } from '@/services/workOrderService';
import {
  getActivity,
  upsertActiviteitAgendaItem,
  verwijderActiviteitAgendaItem,
  type ActivityRow,
} from '@/services/activityService';
import { listCustomers } from '@/services/customerService';
import {
  activiteitBlokken,
  dubbelMetActiviteiten,
  dubbeleBlokken,
  medewerkerKleur,
  nietIngepland,
  roosterBlokken,
  type ActiviteitBlok,
  type RoosterBlok,
} from '@/lib/planningRegels';
import { splitsLokaal } from '@/lib/nlTijd';
import { dagenVanWeek, isoWeek, maandagVan, plusDagen } from '@/lib/urenRegels';
import { todayISO } from '@/lib/format';
import { useLaden } from '@/lib/useLaden';
import { useSchermklasse } from '@/lib/schermklasse';
import { terugOfNaar } from '@/lib/navigatie';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import { useOnthouden } from '@/lib/useOnthouden';
import {
  ActiviteitInplannenPaneel,
  BlokPaneel,
  InplannenPaneel,
  type PlanBronnen,
} from '@/components/planning/PlanningPanelen';

/**
 * Planning — de planningpagina van het dashboard (`PlanningPage.jsx`), om te
 * bekijken en plannen: wie werkt wanneer waar, welk voertuig rijdt, en wat nog
 * niet is ingepland.
 *
 * Toegang: recht `planning` + feature `planning` (pakket Team of module bij
 * Groei), zoals de NAV-gate van het dashboard. Voertuigweergave alleen met de
 * module `voertuigen`.
 *
 * - Dag of week (ma t/m zo); vorige / Vandaag / volgende.
 * - Totaal (standaard, zoals het dashboard): iedereen tegelijk, per dag op
 *   tijd — één blok per persoon in de dagploeg in diens kleur, "niet
 *   toegewezen" grijs, plus de activiteiten met een toewijzing.
 * - Medewerkers: één blok per persoon in de dagploeg, met diens eigen tijd,
 *   en zijn activiteiten. Een dag zonder ploeg staat onder "Niet toegewezen".
 * - Voertuigen: één blok per voertuig met de voertuigtijd en de inzittenden.
 * - Dubbel ingepland krijgt een oranje driehoek (waarschuwing, geen blokkade),
 *   ook als een activiteit botst met een werkbon of een andere activiteit.
 * - Tik op een blok: details en de tijd aanpassen (per persoon of per dag,
 *   `verzetTijd` van het dashboard), en dagen, dagploeg, verantwoordelijke en
 *   voertuigen per dag plannen (de DetailModal). Tik op een niet-ingeplande
 *   werkbon: inplannen, met dezelfde velden. "+" plant een activiteit los van
 *   een werkbon (PlanActivityModal). Met dezelfde meldingen,
 *   `planning_wijzigingen` en agenda-items als het dashboard; zie
 *   components/planning/PlanningPanelen.
 *
 * Op een iPad (tabletbreedte) een breed rooster: resources als rijen, dagen als
 * kolommen. Op een telefoon een weekstrip zoals de agenda, per medewerker/dag.
 */
export default function PlanningbordRoute() {
  return (
    <PermissionGate permission="planning" feature="planning" label="Planning">
      <PlanningbordScreen />
    </PermissionGate>
  );
}

type Zicht = 'dag' | 'week';
type Modus = 'totaal' | 'medewerker' | 'voertuig';

/** Eén regel in het rooster: een werkbonblok of een activiteit. */
type Item =
  | { soort: 'werkbon'; sleutel: string; datum: string; resource: string | null; starttijd: string; blok: RoosterBlok<PlanWerkbon> }
  | {
      soort: 'activiteit';
      sleutel: string;
      datum: string;
      resource: string | null;
      starttijd: string;
      blok: ActiviteitBlok<PlanningActiviteit>;
    };

const ACTIVITEIT_KLEUR = ds.green;

type Resource = { id: string | null; naam: string; kleur: string; sub?: string };

const DAG_LANG = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const DAG_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const datum = (iso: string) => new Date(`${iso}T12:00:00`);

function periodeLabel(zicht: Zicht, anker: string, dagen: string[]): string {
  if (zicht === 'dag') return DAG_LANG.format(datum(anker));
  const a = datum(dagen[0]!);
  const b = datum(dagen[6]!);
  const links = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MAAND_KORT[a.getMonth()]}`;
  // Het jaar alleen als het niet dit jaar is: anders past het op een telefoon niet.
  const jaar = b.getFullYear() === new Date().getFullYear() ? '' : ` ${b.getFullYear()}`;
  return `${links}–${b.getDate()} ${MAAND_KORT[b.getMonth()]}${jaar} · wk ${isoWeek(dagen[0]!)}`;
}

function dagKort(iso: string): string {
  const d = datum(iso);
  return `${DAG_KORT[d.getDay()]} ${d.getDate()}`;
}

function PlanningbordScreen() {
  const router = useRouter();
  const { hasFeature, can, readonly } = usePermissions();
  // Plannen zoals het dashboard: recht `planning` én de module planning (magSlepen).
  const magPlannen = can('planning') && hasFeature('planning') && !readonly;
  const waaromNiet = readonly
    ? 'Je abonnement staat op alleen-lezen; plannen kan pas weer met een lopend abonnement.'
    : 'Plannen vraagt het recht Planning.';
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { klasse } = useSchermklasse();
  const breed = klasse === 'tablet';
  const metVoertuigen = hasFeature('voertuigen');

  const { zicht: zichtParam } = useLocalSearchParams<{ zicht?: string }>();
  // Een ?zicht= in de link wint; anders de laatst gekozen weergave.
  const [bewaardZicht, setZicht] = useOnthouden<Zicht>('planning.zicht', 'week', ['dag', 'week']);
  const zicht: Zicht = zichtParam === 'dag' || zichtParam === 'week' ? zichtParam : bewaardZicht;
  const [bewaardeModus, setModus] = useOnthouden<Modus>('planning.modus', 'totaal', ['totaal', 'medewerker', 'voertuig']);
  const modus: Modus = bewaardeModus === 'voertuig' && !metVoertuigen ? 'totaal' : bewaardeModus;
  const vandaag = todayISO();
  const [anker, setAnker] = useState(vandaag);
  const weekDatums = useMemo(() => dagenVanWeek(maandagVan(anker)), [anker]);
  const dagen = zicht === 'dag' ? [anker] : weekDatums;
  const van = dagen[0]!;
  const tot = dagen[dagen.length - 1]!;

  const [werkbonnen, setWerkbonnen] = useState<PlanWerkbon[]>([]);
  const [activiteiten, setActiviteiten] = useState<PlanningActiviteit[]>([]);
  const [los, setLos] = useState<PlanWerkbon[]>([]);
  const [team, setTeam] = useState<{ id: string; naam: string }[]>([]);
  const [voertuigen, setVoertuigen] = useState<Voertuig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deelFout, setDeelFout] = useState<string | null>(null);
  const [losOpen, setLosOpen] = useState(true);
  const [gekozen, setGekozen] = useState<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    setError(null);
    const [wb, nl, tm, vt, ac] = await Promise.all([
      listWerkbonnenInBereik(van, tot),
      listNietIngeplandeKandidaten(),
      listCompanyProfiles(),
      metVoertuigen ? listAlleVoertuigen() : Promise.resolve({ data: [] as Voertuig[], error: null }),
      listActiviteitenInBereik(van, tot),
    ]);
    if (wb.error) {
      setError(wb.error);
      return;
    }
    setWerkbonnen(wb.data);
    setLos(nietIngepland(nl.data));
    setTeam(tm.data.map((p) => ({ id: p.id, naam: p.full_name ?? 'Medewerker' })));
    setVoertuigen(vt.data);
    setActiviteiten(ac.data);
    setDeelFout(
      nl.error
        ? 'De niet-ingeplande werkbonnen konden niet worden geladen.'
        : ac.error
          ? 'De activiteiten konden niet worden geladen.'
          : tm.error || vt.error
            ? 'Niet alle namen konden worden geladen.'
            : null,
    );
  }, [van, tot, metVoertuigen]);

  const { loading, refreshing, onRefresh, opnieuw, herlaad } = useLaden(load, { onFout: setError });
  const [blokOpen, setBlokOpen] = useState<RoosterBlok<PlanWerkbon> | null>(null);
  const [inplannen, setInplannen] = useState<PlanWerkbon | null>(null);
  const [nieuweActiviteit, setNieuweActiviteit] = useState(false);
  const [activiteitOpen, setActiviteitOpen] = useState<ActivityConcept | null>(null);
  const [klantOpties, setKlantOpties] = useState<SelectOption[]>([]);

  const actieveModus: Modus = modus;
  const blokken = useMemo(
    () => roosterBlokken(werkbonnen, { van, tot, modus: actieveModus === 'voertuig' ? 'voertuig' : 'medewerker' }),
    [werkbonnen, van, tot, actieveModus],
  );
  const actBlokken = useMemo(
    () => activiteitBlokken(activiteiten, { van, tot, modus: actieveModus, metTeam: team.length > 0 }),
    [activiteiten, van, tot, actieveModus, team.length],
  );
  const dubbel = useMemo(
    () =>
      new Set([
        ...dubbeleBlokken(blokken),
        ...(actieveModus === 'voertuig' ? [] : dubbelMetActiviteiten(blokken, actBlokken)),
      ]),
    [blokken, actBlokken, actieveModus],
  );

  /** Werkbonblokken en activiteiten samen, op dag en tijd. */
  const items: Item[] = useMemo(
    () =>
      [
        ...blokken.map((b) => ({ soort: 'werkbon' as const, sleutel: b.sleutel, datum: b.datum, resource: b.resource, starttijd: b.starttijd, blok: b })),
        ...actBlokken.map((b) => ({ soort: 'activiteit' as const, sleutel: b.sleutel, datum: b.datum, resource: b.resource, starttijd: b.starttijd, blok: b })),
      ].sort((a, b) => (a.datum === b.datum ? a.starttijd.localeCompare(b.starttijd) : a.datum.localeCompare(b.datum))),
    [blokken, actBlokken],
  );

  const naamVan = useMemo(() => new Map(team.map((m) => [m.id, m.naam])), [team]);
  const voertuigVan = useMemo(() => new Map(voertuigen.map((v) => [v.id, v])), [voertuigen]);

  /** Rijen van het rooster: het team (of de actieve bussen), plus wie er verder in voorkomt. */
  const resources: Resource[] = useMemo(() => {
    const inBlokken = new Set(items.map((b) => b.resource));
    if (actieveModus === 'voertuig') {
      const lijst = voertuigen.filter((v) => v.actief || inBlokken.has(v.id));
      const rijen: Resource[] = lijst.map((v) => ({
        id: v.id,
        naam: v.naam,
        kleur: v.kleur || ds.green,
        sub: [v.kenteken, v.zitplaatsen ? `${v.zitplaatsen} plekken` : null].filter(Boolean).join(' · ') || undefined,
      }));
      for (const id of inBlokken) {
        if (id && !voertuigVan.has(id)) rijen.push({ id, naam: 'Voertuig', kleur: '#9ca3af' });
      }
      return rijen;
    }
    const rijen: Resource[] = team.map((m, i) => ({ id: m.id, naam: m.naam, kleur: medewerkerKleur(i) }));
    for (const id of inBlokken) {
      if (id && !naamVan.has(id)) rijen.push({ id, naam: 'Oud-medewerker', kleur: '#9ca3af' });
    }
    if (inBlokken.has(null)) rijen.push({ id: null, naam: 'Niet toegewezen', kleur: medewerkerKleur(-1) });
    return rijen;
  }, [actieveModus, items, team, voertuigen, naamVan, voertuigVan]);

  const itemsVan = useCallback(
    (resource: string | null, dag: string) => items.filter((b) => b.resource === resource && b.datum === dag),
    [items],
  );

  /** Kleur van een medewerker, op volgorde van het team; grijs voor niemand of onbekend. */
  const kleurIndex = useMemo(() => new Map(team.map((m, i) => [m.id, medewerkerKleur(i)])), [team]);
  const kleurVan = (pid: string | null) => (pid ? (kleurIndex.get(pid) ?? medewerkerKleur(-1)) : medewerkerKleur(-1));

  /** Een activiteit aantikken: het activiteitenvenster, zoals ActivityEditModal. */
  const openActiviteit = async (a: PlanningActiviteit) => {
    const [r, k] = await Promise.all([
      getActivity(a.id),
      klantOpties.length ? Promise.resolve(null) : listCustomers(),
    ]);
    if (k) setKlantOpties(k.data.map((c) => ({ id: c.id, label: c.name ?? '—' })));
    if (r.data) setActiviteitOpen(conceptVanActiviteit(r.data));
    else setDeelFout(r.error ?? 'De activiteit kon niet worden geopend.');
  };

  /** Na het activiteitenvenster: het agenda-item bestaat of komt er; zonder datum weg. */
  const naActiviteit = async (rij?: ActivityRow | null) => {
    if (rij) {
      const { date, time } = splitsLokaal(rij.due_at);
      if (date && time) {
        await upsertActiviteitAgendaItem({
          activiteitId: rij.id,
          titel: rij.title,
          datum: date,
          tijd: time,
          eind: rij.end_time ? String(rij.end_time).slice(0, 5) : '',
          customerId: rij.customer_id,
          locatie: rij.location ?? null,
        });
      } else {
        await verwijderActiviteitAgendaItem(rij.id);
      }
    }
    void herlaad();
  };

  const stap = (richting: -1 | 1) => setAnker((a) => plusDagen(a, richting * (zicht === 'dag' ? 1 : 7)));

  const blokTekst = (b: RoosterBlok<PlanWerkbon>) => {
    const w = b.werkbon;
    const persoon =
      actieveModus === 'totaal' ? (b.resource ? (naamVan.get(b.resource) ?? 'Oud-medewerker') : 'Niet toegewezen') : null;
    const wie =
      actieveModus === 'voertuig'
        ? b.inzittenden.map((p) => naamVan.get(p) ?? 'Medewerker').join(', ')
        : b.voertuigId
          ? (voertuigVan.get(b.voertuigId)?.naam ?? null)
          : null;
    const bezet =
      actieveModus === 'voertuig' && b.resource && voertuigVan.get(b.resource)?.zitplaatsen
        ? `${b.inzittenden.length}/${voertuigVan.get(b.resource)!.zitplaatsen}`
        : null;
    return {
      titel: w.titel || w.nummer || 'Werkbon',
      tijd: `${b.starttijd}${b.eindtijd ? `–${b.eindtijd}` : ''}${b.dagenTotaal > 1 ? ` · dag ${b.dagNr}/${b.dagenTotaal}` : ''}`,
      meta: [persoon, w.customer?.name, wie, bezet].filter(Boolean).join(' · '),
    };
  };

  const activiteitBlok = (b: ActiviteitBlok<PlanningActiviteit>, compact?: boolean) => {
    const a = b.activiteit;
    const isDubbel = dubbel.has(b.sleutel);
    const titel = a.title || 'Activiteit';
    const tijd = `${b.starttijd}–${b.eindtijd}`;
    const meta = [
      actieveModus === 'totaal' ? b.personen.map((p) => naamVan.get(p) ?? 'Medewerker').join(', ') : null,
      a.customer?.name,
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <Pressable
        key={b.sleutel}
        onPress={() => void openActiviteit(a)}
        accessibilityRole="button"
        accessibilityLabel={`Activiteit ${titel}, ${tijd}${a.completed ? ', afgerond' : ''}${isDubbel ? ', dubbel ingepland' : ''}`}
        style={({ pressed }) => [styles.blok, styles.blokActiviteit, compact && styles.blokCompact, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.blokStreep, { backgroundColor: ACTIVITEIT_KLEUR }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.blokKop}>
            <Text style={[styles.blokTijd, compact && styles.blokTijdCompact]} numberOfLines={1}>
              {tijd}
            </Text>
            {isDubbel ? <AlertTriangle size={13} color={t.statusWarnFg} strokeWidth={2.4} /> : null}
          </View>
          <Text style={[styles.blokTitel, a.completed && styles.afgerond]} numberOfLines={compact ? 2 : 1}>
            {titel}
          </Text>
          {meta ? (
            <Text style={styles.blokMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  /** Een regel tekenen: werkbonblok in `kleur` (of de kleur van de persoon in Totaal), of een activiteit. */
  const item = (i: Item, kleur: string | null, compact?: boolean) =>
    i.soort === 'activiteit'
      ? activiteitBlok(i.blok, compact)
      : blok(i.blok, kleur ?? kleurVan(i.blok.resource), compact);

  const blok = (b: RoosterBlok<PlanWerkbon>, kleur: string, compact?: boolean) => {
    const tekst = blokTekst(b);
    const isDubbel = dubbel.has(b.sleutel);
    const opSlot = !!b.werkbon.ondertekend_op;
    return (
      <Pressable
        key={b.sleutel}
        onPress={() => setBlokOpen(b)}
        accessibilityRole="button"
        accessibilityLabel={`${tekst.titel}, ${tekst.tijd}${isDubbel ? ', dubbel ingepland' : ''}`}
        style={({ pressed }) => [styles.blok, compact && styles.blokCompact, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.blokStreep, { backgroundColor: kleur }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.blokKop}>
            <Text style={[styles.blokTijd, compact && styles.blokTijdCompact]} numberOfLines={1}>
              {tekst.tijd}
            </Text>
            {isDubbel ? <AlertTriangle size={13} color={t.statusWarnFg} strokeWidth={2.4} /> : null}
            {opSlot ? <Lock size={12} color={t.muted} strokeWidth={2.2} /> : null}
          </View>
          <Text style={styles.blokTitel} numberOfLines={compact ? 2 : 1}>
            {tekst.titel}
          </Text>
          {tekst.meta ? (
            <Text style={styles.blokMeta} numberOfLines={1}>
              {tekst.meta}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  if (loading && werkbonnen.length === 0 && !error) return <LoadingScreen label="Planning laden…" />;

  const kop = (
    <AppTopBar
      variant="detail"
      title="Planning"
      subtitle="Weekplanning per medewerker en voertuig"
      onBack={() => terugOfNaar(router, '/menu')}
      rightAction={
        magPlannen ? (
          <HeaderIconButton icon={Plus} label="Activiteit inplannen" onPress={() => setNieuweActiviteit(true)} />
        ) : undefined
      }
    />
  );

  if (error && werkbonnen.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen scroll={false} header={kop}>
          <ErrorState title="Planning niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const standaardDatum = zicht === 'dag' ? anker : anker < vandaag ? vandaag : anker;
  const bronnen: PlanBronnen = {
    team: team.map((m) => ({ id: m.id, full_name: m.naam })),
    voertuigen,
    metVoertuigen,
  };

  // Telefoon, week: één medewerker of voertuig tegelijk.
  const gekozenResource =
    gekozen !== undefined && resources.some((r) => r.id === gekozen) ? gekozen : (resources[0]?.id ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen header={kop} refreshing={refreshing} onRefresh={onRefresh}>
        {/* Dag/Week en Medewerkers/Voertuigen */}
        <View style={styles.schakelRij}>
          <Schakel
            opties={[
              ['dag', 'Dag'],
              ['week', 'Week'],
            ]}
            waarde={zicht}
            onChange={(v) => setZicht(v as Zicht)}
            styles={styles}
          />
          <Schakel
            opties={[
              ['totaal', 'Totaal'],
              ['medewerker', 'Medewerkers'],
              ...(metVoertuigen ? ([['voertuig', 'Voertuigen']] as [string, string][]) : []),
            ]}
            waarde={actieveModus}
            onChange={(v) => {
              setModus(v as Modus);
              setGekozen(undefined);
            }}
            styles={styles}
          />
        </View>

        <View style={styles.navRow}>
          <Pressable
            onPress={() => stap(-1)}
            accessibilityRole="button"
            accessibilityLabel={zicht === 'dag' ? 'Vorige dag' : 'Vorige week'}
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}
          >
            <ChevronLeft size={20} color={t.ink} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.navLabel} numberOfLines={1}>
            {periodeLabel(zicht, anker, dagen)}
          </Text>
          <Pressable
            onPress={() => setAnker(vandaag)}
            accessibilityRole="button"
            accessibilityLabel="Naar vandaag"
            style={({ pressed }) => [styles.todayBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.todayBtnText}>Vandaag</Text>
          </Pressable>
          <Pressable
            onPress={() => stap(1)}
            accessibilityRole="button"
            accessibilityLabel={zicht === 'dag' ? 'Volgende dag' : 'Volgende week'}
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}
          >
            <ChevronRight size={20} color={t.ink} strokeWidth={2.4} />
          </Pressable>
        </View>

        {deelFout ? (
          <View style={styles.pad}>
            <NoticeBanner toon="waarschuwing" message={deelFout} />
          </View>
        ) : null}
        {dubbel.size > 0 ? (
          <View style={styles.pad}>
            <NoticeBanner
              toon="waarschuwing"
              message="Blokken met een oranje driehoek zijn dubbel ingepland: dezelfde persoon of hetzelfde voertuig staat op dat moment op twee werkbonnen of activiteiten."
            />
          </View>
        ) : null}

        {/* Weekstrip zoals in de agenda: dag, datum en een stip als er werk is.
            In de weekweergave opent een tik die dag. */}
        {!breed ? (
          <View style={styles.dagStrip}>
            {weekDatums.map((d) => {
              const aan = zicht === 'dag' && d === anker;
              const werk = items.some((b) => b.datum === d);
              const dt = datum(d);
              return (
                <Pressable
                  key={d}
                  onPress={() => {
                    setAnker(d);
                    if (zicht !== 'dag') setZicht('dag');
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: aan }}
                  aria-pressed={aan}
                  accessibilityLabel={`${dagKort(d)}${werk ? ', heeft werk' : ''}`}
                  style={[styles.dagKnop, aan && styles.dagKnopAan, d === vandaag && !aan && styles.dagKnopVandaag]}
                >
                  <Text style={[styles.dagKnopDag, aan && styles.dagKnopTekstAan]}>{DAG_KORT[dt.getDay()]}</Text>
                  <Text style={[styles.dagKnopTekst, aan && styles.dagKnopTekstAan]}>{dt.getDate()}</Text>
                  <View style={[styles.dagKnopStip, { backgroundColor: werk ? ds.green : 'transparent' }]} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {actieveModus === 'totaal' ? (
          <TotaalRooster
            dagen={dagen}
            items={items}
            zicht={zicht}
            breed={breed}
            vandaag={vandaag}
            regel={item}
            styles={styles}
            t={t}
          />
        ) : resources.length === 0 ? (
          <View style={styles.pad}>
            <AppCard padding={20}>
              <Text style={styles.leeg}>
                {actieveModus === 'voertuig' ? 'Er zijn nog geen voertuigen.' : 'Er zijn nog geen teamleden.'}
              </Text>
            </AppCard>
          </View>
        ) : breed ? (
          /* iPad: breed rooster — rijen = medewerkers/voertuigen, kolommen = dagen. */
          <ScrollView horizontal contentContainerStyle={styles.roosterScroll} showsHorizontalScrollIndicator>
            <View style={[styles.rooster, dsShadow]}>
              <View style={styles.roosterRij}>
                <View style={[styles.roosterNaamCel, styles.roosterKopCel]} />
                {dagen.map((d) => (
                  <View
                    key={d}
                    style={[
                      zicht === 'dag' ? styles.roosterDagCelBreed : styles.roosterDagCel,
                      styles.roosterKopCel,
                      d === vandaag && styles.roosterVandaag,
                    ]}
                  >
                    <Text style={[styles.roosterKopTekst, d === vandaag && { color: t.green700 }]}>
                      {d === vandaag ? `${dagKort(d)} · vandaag` : dagKort(d)}
                    </Text>
                  </View>
                ))}
              </View>
              {resources.map((r) => (
                <View key={r.id ?? 'niemand'} style={styles.roosterRij}>
                  <View style={styles.roosterNaamCel}>
                    <View style={[styles.dot, { backgroundColor: r.kleur }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.roosterNaam} numberOfLines={2}>
                        {r.naam}
                      </Text>
                      {r.sub ? (
                        <Text style={styles.blokMeta} numberOfLines={1}>
                          {r.sub}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {dagen.map((d) => (
                    <View
                      key={d}
                      style={[
                        zicht === 'dag' ? styles.roosterDagCelBreed : styles.roosterDagCel,
                        d === vandaag && styles.roosterVandaag,
                        zicht === 'dag' && styles.roosterDagWrap,
                      ]}
                    >
                      {itemsVan(r.id, d).map((b) => (
                        <View key={b.sleutel} style={zicht === 'dag' ? { width: 200 } : undefined}>
                          {item(b, r.kleur, zicht === 'week')}
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        ) : zicht === 'dag' ? (
          /* Telefoon, dag: per medewerker (of voertuig) de blokken van die dag. */
          <View style={[styles.pad, { gap: 12 }]}>
            {resources.map((r) => {
              const lijst = itemsVan(r.id, anker);
              return (
                <View key={r.id ?? 'niemand'} style={{ gap: 6 }}>
                  <View style={styles.resKop}>
                    <View style={[styles.dot, { backgroundColor: r.kleur }]} />
                    <Text style={styles.resNaam} numberOfLines={1}>
                      {r.naam}
                    </Text>
                    <Text style={styles.resAantal}>{lijst.length ? `${lijst.length}` : 'vrij'}</Text>
                  </View>
                  {lijst.map((b) => item(b, r.kleur))}
                </View>
              );
            })}
          </View>
        ) : (
          /* Telefoon, week: kies een medewerker of voertuig, dan per dag. */
          <View style={{ gap: 10 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRij}>
              {resources.map((r) => {
                const aan = r.id === gekozenResource;
                const aantal = items.filter((b) => b.resource === r.id).length;
                return (
                  <Pressable
                    key={r.id ?? 'niemand'}
                    onPress={() => setGekozen(r.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: aan }}
                    aria-pressed={aan}
                    style={[styles.chip, aan && styles.chipAan]}
                  >
                    <View style={[styles.dot, { backgroundColor: r.kleur }]} />
                    <Text style={[styles.chipTekst, aan && styles.chipTekstAan]} numberOfLines={1}>
                      {r.naam}
                    </Text>
                    <Text style={[styles.chipAantal, aan && styles.chipTekstAan]}>{aantal}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={[styles.pad, { gap: 10 }]}>
              {dagen.map((d) => {
                const r = resources.find((x) => x.id === gekozenResource);
                const lijst = itemsVan(gekozenResource, d);
                return (
                  <View key={d} style={{ gap: 6 }}>
                    <Text style={[styles.dagKop, d === vandaag && { color: t.green700 }]}>
                      {d === vandaag ? `${dagKort(d)} · vandaag` : dagKort(d)}
                    </Text>
                    {lijst.length === 0 ? (
                      <Text style={styles.vrij}>Niet ingepland</Text>
                    ) : (
                      lijst.map((b) => item(b, r?.kleur ?? ds.green))
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Niet-ingeplande werkbonnen (inklapbaar), zoals het dashboard. */}
        <View style={[styles.pad, { marginTop: 16 }]}>
          <Pressable
            onPress={() => setLosOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: losOpen }}
            aria-expanded={losOpen}
            style={styles.losKop}
          >
            <Text style={styles.losTitel}>Niet ingepland ({los.length})</Text>
            {losOpen ? (
              <ChevronUp size={18} color={t.muted} strokeWidth={2.2} />
            ) : (
              <ChevronDown size={18} color={t.muted} strokeWidth={2.2} />
            )}
          </Pressable>
          {losOpen ? (
            los.length === 0 ? (
              <Text style={styles.vrij}>Alle werkbonnen zijn ingepland.</Text>
            ) : (
              <View style={[styles.losLijst, breed && styles.losLijstBreed]}>
                {los.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => setInplannen(w)}
                    accessibilityRole="button"
                    accessibilityHint={magPlannen ? 'Inplannen' : 'Werkbon openen'}
                    style={({ pressed }) => [styles.losKaart, breed && styles.losKaartBreed, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.losKaartTitel} numberOfLines={1}>
                      {[w.nummer, w.titel || 'Werkbon'].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.losKaartMeta} numberOfLines={1}>
                      {[
                        w.customer?.name,
                        w.assigned_to_ids?.length
                          ? w.assigned_to_ids.map((p) => naamVan.get(p) ?? 'Medewerker').join(', ')
                          : 'Niemand toegewezen',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )
          ) : null}
          <Text style={styles.voetnoot}>
            {magPlannen
              ? 'Tik op een blok om de tijd aan te passen of de dagen, ploeg en voertuigen te plannen, of op een werkbon hierboven om hem in te plannen. Met + plan je een activiteit zonder werkbon.'
              : 'Tik op een blok of werkbon voor de details.'}
          </Text>
        </View>
      </AppScreen>

      <BlokPaneel
        blok={blokOpen}
        modus={actieveModus}
        bronnen={bronnen}
        naamVan={(id) => naamVan.get(id) ?? 'Medewerker'}
        voertuigNaam={(id) => voertuigVan.get(id)?.naam ?? 'Voertuig'}
        magPlannen={magPlannen}
        waaromNiet={waaromNiet}
        onSluit={() => setBlokOpen(null)}
        onGewijzigd={() => void herlaad()}
      />
      <InplannenPaneel
        werkbon={inplannen}
        bronnen={bronnen}
        standaardDatum={standaardDatum}
        magPlannen={magPlannen}
        waaromNiet={waaromNiet}
        onSluit={() => setInplannen(null)}
        onGewijzigd={() => void herlaad()}
      />
      <ActiviteitInplannenPaneel
        open={nieuweActiviteit}
        team={bronnen.team}
        standaardDatum={standaardDatum}
        onSluit={() => setNieuweActiviteit(false)}
        onGewijzigd={() => void herlaad()}
      />
      <ActivityFormSheet
        concept={activiteitOpen}
        klanten={klantOpties}
        medewerkers={team.map((m) => ({ id: m.id, label: m.naam }))}
        magBewerken={magPlannen}
        onClose={() => setActiviteitOpen(null)}
        onSaved={naActiviteit}
      />
    </View>
  );
}

/** Totaal: iedereen tegelijk, per dag op tijd (de Totaal-tijdlijn van het dashboard). */
function TotaalRooster({
  dagen,
  items,
  zicht,
  breed,
  vandaag,
  regel,
  styles,
  t,
}: {
  dagen: string[];
  items: Item[];
  zicht: Zicht;
  breed: boolean;
  vandaag: string;
  regel: (i: Item, kleur: string | null, compact?: boolean) => ReactNode;
  styles: ReturnType<typeof makeStyles>;
  t: ThemeColors;
}) {
  return breed ? (
    /* iPad, Totaal: dagen als kolommen, per dag iedereen op tijd. Zonder
       naamkolom past de week in de breedte; niets om opzij te schuiven. */
    <View style={styles.roosterScroll}>
      <View style={[styles.rooster, dsShadow]}>
        <View style={styles.roosterRij}>
          {dagen.map((d) => (
            <View
              key={d}
              style={[
                zicht === 'dag' ? styles.roosterDagCelBreed : styles.totaalDagCel,
                styles.roosterKopCel,
                d === vandaag && styles.roosterVandaag,
              ]}
            >
              <Text style={[styles.roosterKopTekst, d === vandaag && { color: t.green700 }]}>
                {d === vandaag ? `${dagKort(d)} · vandaag` : dagKort(d)}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.roosterRij}>
          {dagen.map((d) => {
            const lijst = items.filter((b) => b.datum === d);
            return (
              <View
                key={d}
                style={[
                  zicht === 'dag' ? styles.roosterDagCelBreed : styles.totaalDagCel,
                  d === vandaag && styles.roosterVandaag,
                  zicht === 'dag' && styles.roosterDagWrap,
                ]}
              >
                {lijst.length === 0 ? (
                  <Text style={[styles.vrij, { padding: 4 }]}>Niets</Text>
                ) : (
                  lijst.map((b) => (
                    <View key={b.sleutel} style={zicht === 'dag' ? { width: 200 } : undefined}>
                      {regel(b, null, zicht === 'week')}
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  ) : (
    /* Telefoon, Totaal: per dag iedereen op tijd, in de kleur van de persoon. */
    <View style={[styles.pad, { gap: 10 }]}>
      {dagen.map((d) => {
        const lijst = items.filter((b) => b.datum === d);
        return (
          <View key={d} style={{ gap: 6 }}>
            {zicht === 'week' ? (
              <Text style={[styles.dagKop, d === vandaag && { color: t.green700 }]}>
                {d === vandaag ? `${dagKort(d)} · vandaag` : dagKort(d)}
              </Text>
            ) : null}
            {lijst.length === 0 ? (
              <Text style={styles.vrij}>Niets ingepland</Text>
            ) : (
              lijst.map((b) => regel(b, null))
            )}
          </View>
        );
      })}
    </View>
  );
}

function Schakel({
  opties,
  waarde,
  onChange,
  styles,
}: {
  opties: [string, string][];
  waarde: string;
  onChange: (v: string) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.schakel}>
      {opties.map(([id, label]) => {
        const aan = id === waarde;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: aan }}
            aria-pressed={aan}
            style={[styles.schakelKnop, aan && [styles.schakelKnopAan, dsShadow]]}
          >
            <Text style={[styles.schakelTekst, aan && styles.schakelTekstAan]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const NAAM_BREEDTE = 150;
const DAG_BREEDTE = 104;

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    pad: { paddingHorizontal: 16, paddingBottom: 8 },
    schakelRij: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
    schakel: { flexDirection: 'row', backgroundColor: t.bgAlt, borderRadius: 14, padding: 4, gap: 4, flexGrow: 1 },
    schakelKnop: { flex: 1, minHeight: 40, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    schakelKnopAan: { backgroundColor: t.card },
    schakelTekst: { fontSize: 13.5, fontWeight: '600', color: t.muted },
    schakelTekstAan: { color: t.ink },

    navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
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

    dagStrip: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingBottom: 10 },
    dagKnop: {
      flex: 1,
      minHeight: 58,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dagKnopAan: { backgroundColor: t.ink, borderColor: t.ink },
    dagKnopVandaag: { borderColor: ds.green, borderWidth: 1.5 },
    dagKnopTekst: { fontSize: 16, fontWeight: '700', color: t.ink },
    dagKnopDag: { fontSize: 11, fontWeight: '600', color: t.muted, textTransform: 'capitalize' },
    dagKnopStip: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
    dagKnopTekstAan: { color: t.bg },

    dot: { width: 10, height: 10, borderRadius: 5 },
    resKop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    resNaam: { flex: 1, fontSize: 14, fontWeight: '700', color: t.ink },
    resAantal: { fontSize: 12, fontWeight: '600', color: t.muted },
    dagKop: { fontSize: 13, fontWeight: '700', color: t.ink, marginTop: 4, textTransform: 'capitalize' },
    vrij: { fontSize: 12.5, color: t.muted },
    leeg: { fontSize: 13.5, color: t.muted, textAlign: 'center' },

    blok: {
      flexDirection: 'row',
      gap: 10,
      minHeight: 44,
      padding: 10,
      borderRadius: 12,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    blokCompact: { padding: 6, gap: 6, borderRadius: 8 },
    // Activiteiten zoals de tijdlijn van het dashboard: lichtgroen met een groene streep.
    blokActiviteit: { backgroundColor: t.green50 },
    afgerond: { textDecorationLine: 'line-through', color: t.muted },
    blokStreep: { width: 4, borderRadius: 2, alignSelf: 'stretch' },
    blokKop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    blokTijd: { fontSize: 11.5, fontWeight: '700', color: t.muted, flexShrink: 1 },
    // Weekrooster op een iPad: smalle kolommen, dus kleiner, zodat "07:30–16:00" heel blijft.
    blokTijdCompact: { fontSize: 10, letterSpacing: -0.2 },
    blokTitel: { fontSize: 13.5, fontWeight: '600', color: t.ink, marginTop: 1 },
    blokMeta: { fontSize: 11.5, color: t.muted, marginTop: 1 },

    chipRij: { paddingHorizontal: 16, gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      maxWidth: 220,
      paddingHorizontal: 12,
      borderRadius: 22,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipAan: { backgroundColor: t.ink, borderColor: t.ink },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink, flexShrink: 1 },
    chipTekstAan: { color: t.bg },
    chipAantal: { fontSize: 12, fontWeight: '700', color: t.muted },

    roosterScroll: { paddingHorizontal: 16, paddingBottom: 8, flexGrow: 1 },
    rooster: {
      flexGrow: 1,
      borderRadius: ds.rMd,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      overflow: 'hidden',
    },
    roosterRij: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.line },
    roosterKopCel: { paddingVertical: 8, backgroundColor: t.bgAlt },
    roosterKopTekst: { fontSize: 12, fontWeight: '700', color: t.ink, textTransform: 'capitalize', paddingHorizontal: 6 },
    roosterNaamCel: {
      width: NAAM_BREEDTE,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 8,
      borderRightWidth: 1,
      borderRightColor: t.line,
    },
    roosterNaam: { fontSize: 13, fontWeight: '700', color: t.ink },
    roosterDagCel: {
      width: DAG_BREEDTE,
      padding: 4,
      gap: 4,
      borderRightWidth: 1,
      borderRightColor: t.line,
    },
    roosterDagCelBreed: { flex: 1, minWidth: 420, padding: 6, gap: 6 },
    // Totaal op een iPad: geen naamkolom, dus de dagen delen de breedte.
    totaalDagCel: {
      flex: 1,
      minWidth: 0,
      padding: 4,
      gap: 4,
      borderRightWidth: 1,
      borderRightColor: t.line,
    },
    roosterDagWrap: { flexDirection: 'row', flexWrap: 'wrap' },
    roosterVandaag: { backgroundColor: t.green50 },

    losKop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    losTitel: { fontSize: 15, fontWeight: '700', color: t.ink },
    losLijst: { gap: 8 },
    losLijstBreed: { flexDirection: 'row', flexWrap: 'wrap' },
    losKaart: {
      minHeight: 44,
      padding: 12,
      borderRadius: 12,
      backgroundColor: t.statusWarnBg,
      borderWidth: 1,
      borderColor: t.line,
    },
    losKaartBreed: { width: '48%' },
    losKaartTitel: { fontSize: 13.5, fontWeight: '700', color: t.ink },
    losKaartMeta: { fontSize: 12, color: t.muted, marginTop: 2 },
    voetnoot: { fontSize: 12, color: t.muted, marginTop: 12 },
  });
