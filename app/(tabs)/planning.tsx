import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MapPin,
  Navigation as NavigationIcon,
  Phone,
  Plus,
  User as UserIcon,
} from 'lucide-react-native';
import {
  AppCard,
  AppScreen,
  AppSection,
  AppTopBar,
  DateField,
  HeaderIconButton,
  NoticeBanner,
  FormField,
  FormSheet,
  SelectField,
  StatusBadge,
  TimeField,
  statusKey,
  type SelectOption,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  createAfspraak,
  deleteAfspraak,
  updateAfspraak,
  type PlanningItem,
} from '@/services/activityService';
import {
  listAgendaEvents,
  listAlleVoertuigen,
  listWerkbonnenInBereik,
  type AgendaEvent,
  type PlanWerkbon,
} from '@/services/planningService';
import {
  agendaWerkbonItems,
  magAfspraakBewerken,
  zichtbareAfspraken,
} from '@/lib/planningRegels';
import { listCustomers } from '@/services/customerService';
import {
  addDays,
  addMonths,
  getDayRange,
  getMonthRange,
  getWeekNumber,
  getWeekRange,
  groupItemsByDay,
  isSameLocalDay,
  isSameMonth,
  monthGridDays,
  toLocalISODate,
  weekDays,
} from '@/lib/dateRange';
import { formatPlanningDate, formatPlanningTime } from '@/lib/format';
import { minutenVanTijd } from '@/lib/datum';
import { useLaden } from '@/lib/useLaden';
import { callPhone, openMaps } from '@/lib/linking';
import { splitsLokaal } from '@/lib/nlTijd';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { notAvailableAlert } from '@/lib/notAvailable';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import { maakThemaStijlen, useStyles } from '@/lib/useStyles';
import { alsTekst } from '@/lib/notitieTekst';
import { useOnthouden } from '@/lib/useOnthouden';

type ViewMode = 'dag' | 'week' | 'maand';

const NL_DAYS_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const SHORT_DATE = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
const MONTH_YEAR = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Agenda-items, zoals het dashboard (CalendarPage)
// ---------------------------------------------------------------------------

/** Typelabels van `calendar_events` (dashboard calendarService). */
const EVENT_TYPE_LABEL: Record<string, string> = {
  job: 'Klus',
  visit: 'Opname',
  activity: 'Activiteit',
  event: 'Afspraak',
};

function eventType(e: AgendaEvent): string {
  if (e.type && EVENT_TYPE_LABEL[e.type]) return e.type;
  if (e.activiteit_id) return 'activity';
  if (e.customer_id) return 'visit';
  return 'event';
}

function adresVan(c: AgendaEvent['customer']): string | null {
  if (!c) return null;
  return [c.address, c.postcode, c.city].filter(Boolean).join(', ') || null;
}

/** Lokale datum + HH:MM als tijdstip; null zonder tijd. */
function lokaalTijdstip(datum: string, tijd: string | null): string | null {
  if (!tijd) return null;
  const d = new Date(`${datum}T${tijd.slice(0, 5)}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function eventStatus(e: AgendaEvent): string {
  const nu = Date.now();
  const van = e.start_at ? new Date(e.start_at).getTime() : NaN;
  const tot = e.end_at ? new Date(e.end_at).getTime() : NaN;
  if (van <= nu && nu <= tot) return 'in_progress';
  if (tot < nu) return 'completed';
  return 'gepland';
}

function eventNaarItem(e: AgendaEvent): PlanningItem {
  return {
    id: `event-${e.id}`,
    source: 'calendar_event',
    number: null,
    title: e.title ?? 'Afspraak',
    customerName: e.customer?.name ?? null,
    customerId: e.customer_id,
    description: e.notes,
    address: e.location ?? adresVan(e.customer),
    phone: e.customer?.phone ?? null,
    startAt: e.start_at,
    endAt: e.end_at,
    date: e.start_at ? toLocalISODate(new Date(e.start_at)) : '',
    status: eventStatus(e),
    assigneeName: null,
    assigneeId: e.assigned_to,
    workOrderId: null,
    typeLabel: EVENT_TYPE_LABEL[eventType(e)] ?? 'Afspraak',
  };
}

function sorteerMs(item: PlanningItem): number {
  const ms = item.startAt ? new Date(item.startAt).getTime() : NaN;
  if (!Number.isNaN(ms)) return ms;
  return new Date(`${item.date}T23:59:59`).getTime();
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/** De bewerkbare velden van een agenda-afspraak. */
type AfspraakConcept = {
  /** null = nieuwe afspraak. */
  id: string | null;
  title: string;
  date: string;
  time: string;
  end: string;
  location: string;
  notes: string;
  customerId: string | null;
  /**
   * Mag deze gebruiker het item wijzigen/verwijderen? Spiegelt de RLS: recht
   * `planning`, of je eigen item dat niet uit de planning komt.
   */
  magBewerken: boolean;
};

export default function PlanningScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors: th } = useTheme();
  const styles = useStyles(themaStijlen);
  const { loaded: rechtenGeladen, mag, can, hasFeature } = usePermissions();

  /**
   * Persoonlijke agenda, zoals het dashboard: iedereen — ook admin en planner —
   * ziet alleen zijn eigen afspraken en de werkbondagen waarop hij in de ploeg
   * staat. Alleen in een gedeelde werkruimte ziet iedereen alles.
   */
  const gedeeld = rechtenGeladen && hasFeature('gedeelde_werkruimte');
  const metVoertuigen = rechtenGeladen && hasFeature('voertuigen');
  const planningRecht = rechtenGeladen && can('planning');
  const currentUserId = user?.id ?? null;

  /**
   * De weergave staat ook in de route: `/(tabs)/planning?view=week`. Dat kost
   * niets en maakt de agenda deelbaar én testbaar — zonder deze parameter is
   * week of maand alleen met een tik te bereiken.
   */
  const { view: viewParam } = useLocalSearchParams<{ view?: string }>();
  // Zelfde standaard als het dashboard: de week. Een ?view= in de link wint
  // bij het openen; daarna telt de laatst gekozen weergave (per gebruiker).
  const [view, setView] = useOnthouden<ViewMode>('agenda.weergave', 'week', ['dag', 'week', 'maand']);
  useEffect(() => {
    if (viewParam === 'dag' || viewParam === 'week' || viewParam === 'maand') setView(viewParam);
  }, [viewParam, setView]);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deelFout, setDeelFout] = useState<string | null>(null);
  const [events, setEvents] = useState<Map<string, AgendaEvent>>(() => new Map());
  const [klanten, setKlanten] = useState<SelectOption[]>([]);
  const [afspraak, setAfspraak] = useState<AfspraakConcept | null>(null);
  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();

  const today = useMemo(() => new Date(), []);

  const range = useMemo(() => {
    if (view === 'dag') return getDayRange(selectedDate);
    if (view === 'week') return getWeekRange(selectedDate);
    return getMonthRange(selectedDate);
  }, [view, selectedDate]);

  const load = useCallback(
    async () => {
      setError(null);

      const [evRes, wbRes, vRes] = await Promise.all([
        listAgendaEvents(range.startISO, range.endISO),
        listWerkbonnenInBereik(range.startDate, range.endDate),
        metVoertuigen ? listAlleVoertuigen() : Promise.resolve({ data: [], error: null }),
      ]);

      if (evRes.error && wbRes.error) {
        setError('Agenda laden is mislukt.');
        setItems([]);
        return;
      }
      setDeelFout(
        evRes.error
          ? 'Je afspraken konden niet worden geladen; alleen de werkbonnen staan hieronder.'
          : wbRes.error
            ? 'De werkbonnen konden niet worden geladen; alleen je afspraken staan hieronder.'
            : null,
      );

      // 1. Handmatige agenda-items (geen werkbon-gekoppelde: die staan er als
      //    werkbon al in), persoonlijk tenzij gedeelde werkruimte.
      const eigen = zichtbareAfspraken(evRes.data, { uid: currentUserId, gedeeld });
      setEvents(new Map(eigen.map((e) => [`event-${e.id}`, e])));

      // 2. Werkbonnen per geplande dag, met jouw tijd (en jouw voertuig).
      const voertuigNaam = new Map(vRes.data.map((v) => [v.id, v.naam]));
      const wbItems = agendaWerkbonItems<PlanWerkbon>(wbRes.data, {
        uid: currentUserId,
        gedeeld,
        van: range.startDate,
        tot: range.endDate,
      }).map((i): PlanningItem => {
        const w = i.werkbon;
        const voertuig = i.voertuigId ? voertuigNaam.get(i.voertuigId) : null;
        return {
          id: i.sleutel,
          source: 'work_order',
          number: w.nummer,
          title: w.titel || 'Werkbon',
          customerName: w.customer?.name ?? null,
          customerId: w.customer_id,
          description: null,
          address: w.locatie ?? adresVan(w.customer),
          phone: w.customer?.phone ?? null,
          startAt: lokaalTijdstip(i.datum, i.starttijd),
          endAt: lokaalTijdstip(i.datum, i.eindtijd),
          date: i.datum,
          status: w.status,
          assigneeName: null,
          assigneeId: null,
          workOrderId: w.id,
          typeLabel: voertuig ? `Werkbon · ${voertuig}` : 'Werkbon',
        };
      });

      const alles = [...eigen.map(eventNaarItem), ...wbItems];
      alles.sort((a, b) => sorteerMs(a) - sorteerMs(b));
      setItems(alles);

      // De klantenlijst is alleen voor het keuzeveld in het afspraakformulier;
      // mislukt hij, dan blijft de afspraak gewoon te maken — zonder klant.
      const klantRes = await listCustomers();
      if (!klantRes.error) {
        setKlanten(klantRes.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant' })));
      }
    },
    [range.startISO, range.endISO, range.startDate, range.endDate, currentUserId, gedeeld, metVoertuigen],
  );

  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn drie
   * verschillende dingen. Alleen de laatste zet `refreshing`; een
   * automatische verversing laat het scherm dus niet omlaag hangen.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, {
    onFout: setError,
    klaarOmTeLaden: rechtenGeladen && !!currentUserId,
  });

  // ── Period navigation ────────────────────────────────────────────────────
  const step = (dir: -1 | 1) => {
    setSelectedDate((d) => {
      if (view === 'dag') return addDays(d, dir);
      if (view === 'week') return addDays(d, dir * 7);
      return addMonths(d, dir);
    });
  };
  const goToday = () => setSelectedDate(new Date());

  // ── Derived ────────────────────────────────────────────────────────────────
  const byDay = useMemo(() => groupItemsByDay(items, (i) => i.date), [items]);
  const selectedKey = toLocalISODate(selectedDate);
  const dayItems = useMemo(() => byDay.get(selectedKey) ?? [], [byDay, selectedKey]);

  const periodLabel =
    view === 'dag'
      ? formatPlanningDate(selectedDate)
      : view === 'week'
        ? `${SHORT_DATE.format(range.start)} – ${SHORT_DATE.format(range.end)} · wk ${getWeekNumber(selectedDate)}`
        : cap(MONTH_YEAR.format(selectedDate));

  const subtitle =
    view === 'dag'
      ? isSameLocalDay(selectedDate, today)
        ? 'Je agenda voor vandaag'
        : formatPlanningDate(selectedDate)
      : view === 'week'
        ? 'Je agenda voor deze week'
        : 'Overzicht van deze maand';

  // ── Actions ──────────────────────────────────────────────────────────────
  const onCall = (p: PlanningItem) => {
    if (!callPhone(p.phone)) notAvailableAlert('Bellen', 'Geen telefoonnummer bekend.');
  };
  const onRoute = (p: PlanningItem) => {
    if (!openMaps(p.address)) notAvailableAlert('Navigeren', 'Geen adres bekend.');
  };
  const openItem = (p: PlanningItem) => {
    if (p.workOrderId) return router.push(`/work-orders/${p.workOrderId}`);
    // Een eigen agenda-afspraak openen we in het formulier; een activiteit
    // hoort thuis op het Activiteiten-scherm en een klant op de klantkaart.
    if (p.source === 'calendar_event') {
      setSaveError(null);
      const { date, time } = splitsLokaal(p.startAt);
      const ev = events.get(p.id);
      setAfspraak({
        magBewerken: !!ev && magAfspraakBewerken(ev, { uid: currentUserId, planningRecht }),
        id: p.id.replace(/^event-/, ''),
        title: p.title,
        date: date || toLocalISODate(selectedDate),
        time,
        end: splitsLokaal(p.endAt).time,
        location: p.address ?? '',
        notes: alsTekst(p.description),
        customerId: p.customerId,
      });
      return;
    }
    if (p.customerId) router.push(`/customers/${p.customerId}`);
  };

  const nieuweAfspraak = () => {
    setSaveError(null);
    setAfspraak({
      magBewerken: true,
      id: null,
      title: '',
      date: toLocalISODate(selectedDate),
      time: '',
      end: '',
      location: '',
      notes: '',
      customerId: null,
    });
  };

  const afspraakOpslaan = () => {
    if (!afspraak) return;
    const invoer = {
      title: afspraak.title,
      date: afspraak.date,
      time: afspraak.time || null,
      end: afspraak.end || null,
      location: afspraak.location,
      notes: afspraak.notes,
      customer_id: afspraak.customerId,
    };
    save(
      () => (afspraak.id ? updateAfspraak(afspraak.id, invoer) : createAfspraak(invoer)),
      {
        onSuccess: async () => {
          setAfspraak(null);
          await herlaad();
        },
      },
    );
  };

  const afspraakVerwijderen = () => {
    if (!afspraak?.id) return;
    const id = afspraak.id;
    bevestigVerwijderen('Afspraak', () => {
      save(() => deleteAfspraak(id), {
        onSuccess: async () => {
          setAfspraak(null);
          await herlaad();
        },
      });
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <AppScreen
        header={
          <AppTopBar
            title="Agenda"
            subtitle={subtitle}
            rightAction={
              rechtenGeladen && mag('agenda', 'maken') ? (
                <HeaderIconButton
                  icon={Plus}
                  label="Nieuwe afspraak"
                  size={42}
                  onPress={nieuweAfspraak}
                />
              ) : undefined
            }
            showProfileButton
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* View toggle */}
        <View style={styles.toggleWrap}>
          <View style={styles.toggleGroup} accessibilityRole="tablist">
            {(['dag', 'week', 'maand'] as const).map((v) => {
              const on = view === v;
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  aria-selected={on}
                  key={v}
                  onPress={() => setView(v)}
                  style={[styles.toggleBtn, on && [styles.toggleBtnOn, dsShadow]]}
                >
                  <Text style={[styles.toggleLabel, on && styles.toggleLabelOn]}>{cap(v)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Period navigation */}
        <View style={styles.navRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => step(-1)}
            hitSlop={6}
            accessibilityLabel="Vorige periode"
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}
          >
            <ChevronLeft size={20} color={th.ink} strokeWidth={2.4} />
          </Pressable>
          <Text style={[styles.navLabel, { color: th.ink }]} numberOfLines={1}>
            {periodLabel}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={goToday}
            hitSlop={6}
            accessibilityLabel="Naar vandaag"
            style={({ pressed }) => [styles.todayBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.todayBtnText}>Vandaag</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => step(1)}
            hitSlop={6}
            accessibilityLabel="Volgende periode"
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}
          >
            <ChevronRight size={20} color={th.ink} strokeWidth={2.4} />
          </Pressable>
        </View>

        {deelFout && !loading && !error ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <NoticeBanner toon="waarschuwing" message={deelFout} />
          </View>
        ) : null}

        {/* Body */}
        {loading ? (
          <LoadingCard />
        ) : error ? (
          <ErrorCard message={error} onRetry={opnieuw} />
        ) : view === 'dag' ? (
          <DagView
            selectedDate={selectedDate}
            today={today}
            items={dayItems}
            byDay={byDay}
            onSelectDay={setSelectedDate}
            onCall={onCall}
            onRoute={onRoute}
            onOpen={openItem}
          />
        ) : view === 'week' ? (
          <WeekView
            selectedDate={selectedDate}
            today={today}
            byDay={byDay}
            totalCount={items.length}
            dayItems={dayItems}
            onPickDay={(d) => {
              setSelectedDate(d);
              setView('dag');
            }}
            onCall={onCall}
            onRoute={onRoute}
            onOpen={openItem}
          />
        ) : (
          <MaandView
            selectedDate={selectedDate}
            today={today}
            byDay={byDay}
            totalCount={items.length}
            dayItems={dayItems}
            onSelectDay={setSelectedDate}
            onCall={onCall}
            onRoute={onRoute}
            onOpen={openItem}
          />
        )}

        {/* Role hint: company-wide vs eigen (honest, no fake team data) */}
        {!loading && !error && items.length > 0 ? (
          <Text style={[styles.scopeNote, { color: th.muted }]}>
            {gedeeld
              ? 'Gedeelde agenda: afspraken en werkbonnen van het hele team'
              : 'Je eigen agenda: jouw afspraken en de werkbondagen waarop jij staat'}
          </Text>
        ) : null}
      </AppScreen>

      {/* Agenda-afspraak. Een ingeplande werkbon staat hier ook in de lijst,
          maar die opent het werkbondetail — dit formulier is voor de losse
          afspraken (herkomst 'zelf'). */}
      <FormSheet
        visible={afspraak !== null}
        title={
          !afspraak?.id ? 'Nieuwe afspraak' : afspraak.magBewerken ? 'Afspraak bewerken' : 'Afspraak'
        }
        error={saveError}
        saving={saving}
        submitDisabled={
          !afspraak?.magBewerken ||
          !afspraak?.title.trim() ||
          !afspraak?.date.trim() ||
          (!!afspraak?.time &&
            !!afspraak?.end &&
            minutenVanTijd(afspraak.end) <= minutenVanTijd(afspraak.time))
        }
        onSubmit={afspraakOpslaan}
        onClose={() => setAfspraak(null)}
        destructive={
          afspraak?.id && afspraak.magBewerken && mag('agenda', 'verwijderen')
            ? { label: 'Afspraak verwijderen', onPress: afspraakVerwijderen }
            : undefined
        }
      >
        {afspraak?.id && !afspraak.magBewerken ? (
          <NoticeBanner
            toon="info"
            message="Alleen-lezen: dit item komt uit de planning of is van een collega. Wijzigen kan met het recht Planning."
          />
        ) : null}
        <FormField
          label="Titel"
          value={afspraak?.title ?? ''}
          onChangeText={(v) => setAfspraak((c) => (c ? { ...c, title: v } : c))}
          placeholder="Bijv. Inmeten bij Jansen"
          autoFocus={!afspraak?.id}
        />
        <DateField
          label="Datum"
          value={afspraak?.date ?? null}
          onChange={(v) => setAfspraak((c) => (c ? { ...c, date: v } : c))}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TimeField
              label="Van"
              value={afspraak?.time || null}
              onChange={(v) =>
                setAfspraak((c) => {
                  if (!c) return c;
                  // Eindtijd vóór de begintijd bestaat niet: schuif hem mee in
                  // plaats van de gebruiker een foutmelding te geven voor iets
                  // wat hij niet zelf heeft ingesteld.
                  const eind =
                    c.end && minutenVanTijd(c.end) <= minutenVanTijd(v) ? '' : c.end;
                  return { ...c, time: v, end: eind };
                })
              }
              placeholder="Kies"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField
              label="Tot"
              value={afspraak?.end || null}
              onChange={(v) => setAfspraak((c) => (c ? { ...c, end: v } : c))}
              placeholder="Kies"
              hint="Optioneel"
            />
          </View>
        </View>
        {afspraak?.time && afspraak?.end && minutenVanTijd(afspraak.end) <= minutenVanTijd(afspraak.time) ? (
          <NoticeBanner
            toon="waarschuwing"
            message="De eindtijd ligt vóór de begintijd. Kies een latere eindtijd."
          />
        ) : null}
        <SelectField
          label="Klant"
          value={afspraak?.customerId ?? null}
          options={klanten}
          onChange={(id) => setAfspraak((c) => (c ? { ...c, customerId: id } : c))}
          allowEmpty
          emptyLabel="Geen klant"
          placeholder="Geen klant"
        />
        <FormField
          label="Locatie"
          value={afspraak?.location ?? ''}
          onChangeText={(v) => setAfspraak((c) => (c ? { ...c, location: v } : c))}
          placeholder="Adres of omschrijving van de plek"
        />
        <FormField
          label="Notities"
          value={afspraak?.notes ?? ''}
          onChangeText={(v) => setAfspraak((c) => (c ? { ...c, notes: v } : c))}
          placeholder="Optioneel"
          multiline
        />
      </FormSheet>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dag view
// ---------------------------------------------------------------------------

function DagView({
  selectedDate,
  today,
  items,
  byDay,
  onSelectDay,
  onCall,
  onRoute,
  onOpen,
}: {
  selectedDate: Date;
  today: Date;
  items: PlanningItem[];
  /** De items van de hele zichtbare periode, voor de stippen in de dagstrip. */
  byDay: Map<string, PlanningItem[]>;
  onSelectDay: (d: Date) => void;
  onCall: (p: PlanningItem) => void;
  onRoute: (p: PlanningItem) => void;
  onOpen: (p: PlanningItem) => void;
}) {
  const styles = useStyles(themaStijlen);
  const days = useMemo(() => weekDays(selectedDate), [selectedDate]);

  return (
    <>
      {/* Dagstrip uit het goedgekeurde ontwerp: de gekozen dag is een donker
          blokje, vandaag krijgt een groene omlijning, en een dag met werk
          toont een groene stip. Twee verschillende signalen dus, in plaats van
          één stip die beide moest doen. */}
      <View style={styles.weekCard}>
        {days.map((d) => {
          const on = isSameLocalDay(d, selectedDate);
          const isToday = isSameLocalDay(d, today);
          const heeftWerk = (byDay.get(toLocalISODate(d)) ?? []).length > 0;
          return (
            <Pressable
              key={d.toISOString()}
              onPress={() => onSelectDay(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              aria-pressed={on}
              accessibilityLabel={`${NL_DAYS_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()}${heeftWerk ? ', heeft werk' : ''}`}
              style={({ pressed }) => [
                styles.weekDay,
                on && styles.weekDayOn,
                !on && isToday && styles.weekDayToday,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.weekDayLabel, on && styles.weekDayLabelOn]}>
                {NL_DAYS_SHORT[(d.getDay() + 6) % 7]}
              </Text>
              <Text style={[styles.weekDayNum, on && styles.weekDayNumOn]}>{d.getDate()}</Text>
              <View
                style={[
                  styles.weekDayDot,
                  { backgroundColor: heeftWerk ? ds.green : 'transparent' },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Het uurrooster uit het ontwerp: de dag als kalender, met de rode
          lijn op het huidige tijdstip. Items zonder tijd kunnen er niet in —
          die staan in de lijst eronder, net als alle andere. */}
      <UurRooster items={items} isVandaag={isSameLocalDay(selectedDate, today)} onOpen={onOpen} />

      <AppSection title="Tijdlijn" count={items.length} />
      {items.length === 0 ? (
        <EmptyCard message="Geen afspraken gepland voor deze dag." />
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          {items.map((p) => (
            <PlanningCard key={p.id} item={p} onCall={onCall} onRoute={onRoute} onOpen={onOpen} />
          ))}
        </View>
      )}
    </>
  );
}

/**
 * De kleur van een agenda-item, op één plek.
 *
 * Eén betekenis per kleur, in beide weergaven hetzelfde: groen = deze klus
 * loopt nu, blauw = ingeplande werkbon, paars = afspraak, grijs = taak of
 * activiteit. Stond dit twee keer los in het bestand, dan kreeg dezelfde
 * afspraak in de dagweergave een andere kleur dan in de weekweergave — en
 * precies dat maakt kleur als signaal waardeloos.
 */
function agendaKleur(p: PlanningItem, t: ThemeColors): { vlak: string; tekst: string } {
  if (p.source === 'work_order') {
    return statusKey(p.status) === 'in_progress'
      ? { vlak: t.green50, tekst: t.green700 }
      : { vlak: t.statusSubmitBg, tekst: t.statusSubmitFg };
  }
  if (p.source === 'calendar_event') {
    return { vlak: t.statusInfoBg, tekst: t.statusInfoFg };
  }
  return { vlak: t.bgAlt, tekst: t.muted };
}

/**
 * Het uurrooster uit het ontwerp: één rij van 56 px per uur, met de afspraken
 * als blokjes op hun eigen tijd en een rode lijn op "nu".
 *
 * Alleen items mét een starttijd kunnen hier staan — een hele-dag-item heeft
 * geen plek op een tijdas. Die verdwijnen niet: ze staan (net als alles) in de
 * lijst eronder. Het rooster toont dus de dag, de lijst de details.
 */
function UurRooster({
  items,
  isVandaag,
  onOpen,
}: {
  items: PlanningItem[];
  isVandaag: boolean;
  onOpen: (p: PlanningItem) => void;
}) {
  const styles = useStyles(themaStijlen);
  const { colors: th } = useTheme();

  const RIJ = 56;
  const metTijd = items.filter((i) => i.startAt);
  const urenVan = (iso: string) => {
    const d = new Date(iso);
    return d.getHours() + d.getMinutes() / 60;
  };

  if (metTijd.length === 0) return null;

  const starts = metTijd.map((i) => urenVan(i.startAt!));
  const eindes = metTijd.map((i) => (i.endAt ? urenVan(i.endAt) : urenVan(i.startAt!) + 1));
  const vanUur = Math.max(0, Math.min(7, Math.floor(Math.min(...starts))));
  const totUur = Math.min(24, Math.max(18, Math.ceil(Math.max(...eindes))));
  const uren = Array.from({ length: totUur - vanUur }, (_, i) => vanUur + i);

  const nu = new Date();
  const nuUur = nu.getHours() + nu.getMinutes() / 60;
  const toonNu = isVandaag && nuUur >= vanUur && nuUur <= totUur;

  /**
   * Twee afspraken op hetzelfde uur mogen elkaar niet bedekken: dan is er
   * informatie die de gebruiker niet kán zien. Overlappende blokken delen
   * daarom de breedte, net als in een normale agenda.
   */
  const gelegd = (() => {
    const gesorteerd = metTijd
      .map((item) => {
        const van = urenVan(item.startAt!);
        return { item, van, tot: item.endAt ? urenVan(item.endAt) : van + 1 };
      })
      .sort((a, b) => a.van - b.van);
    const uit: { item: PlanningItem; van: number; tot: number; kolom: number; kolommen: number }[] =
      [];
    let groep: typeof uit = [];
    let groepEinde = -1;
    const sluit = () => {
      const n = Math.max(1, ...groep.map((g) => g.kolom + 1));
      groep.forEach((g) => (g.kolommen = n));
      groep = [];
    };
    gesorteerd.forEach((b) => {
      if (b.van >= groepEinde) {
        sluit();
        groepEinde = b.tot;
      } else {
        groepEinde = Math.max(groepEinde, b.tot);
      }
      const bezet = new Set(groep.filter((g) => g.tot > b.van).map((g) => g.kolom));
      let kolom = 0;
      while (bezet.has(kolom)) kolom++;
      const rij = { ...b, kolom, kolommen: 1 };
      groep.push(rij);
      uit.push(rij);
    });
    sluit();
    return uit;
  })();


  return (
    <View style={styles.rooster}>
      {uren.map((u) => (
        <View key={u} style={[styles.roosterRij, { height: RIJ }]}>
          <Text style={styles.roosterUur}>{String(u).padStart(2, '0')}:00</Text>
          <View style={styles.roosterLijn} />
        </View>
      ))}

      <View style={styles.roosterVlak} pointerEvents="box-none">
        {gelegd.map(({ item: p, van, tot, kolom, kolommen }) => {
          const kleur = agendaKleur(p, th);
          const breedte = 100 / kolommen;
          return (
            <Pressable
              key={p.id}
              onPress={() => onOpen(p)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.roosterBlok,
                {
                  top: (van - vanUur) * RIJ,
                  height: Math.max(30, (tot - van) * RIJ - 4),
                  backgroundColor: kleur.vlak,
                  left: `${kolom * breedte}%`,
                  width: `${breedte}%`,
                  right: undefined,
                },
                pressed && { opacity: 0.9 },
              ]}
            >
              <View style={styles.roosterBlokTop}>
                <View style={[styles.roosterStip, { backgroundColor: kleur.tekst }]} />
                <Text style={[styles.roosterTitel, { color: kleur.tekst }]} numberOfLines={1}>
                  {p.title}
                </Text>
              </View>
              <Text style={[styles.roosterMeta, { color: kleur.tekst }]} numberOfLines={1}>
                {[formatPlanningTime(p.startAt), p.customerName].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
          );
        })}

        {toonNu ? (
          <View style={[styles.nuLijn, { top: (nuUur - vanUur) * RIJ }]} pointerEvents="none">
            <View style={styles.nuStip} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Week view
// ---------------------------------------------------------------------------

/**
 * De weekweergave uit het ontwerp: zeven kolommen naast een uuras, waarin elke
 * afspraak een gekleurd blokje op zijn eigen tijd is.
 *
 * De as loopt van 08:00 tot 17:00 — precies zoals in het ontwerp. Dat is een
 * keuze met gevolgen: werk buiten die uren wordt aan de rand vastgeklemd in
 * plaats van weggelaten, zodat een klus van 06:00 zichtbaar blijft (bovenaan)
 * en niet stilletjes verdwijnt. Items zonder tijd kunnen niet op een tijdas —
 * die krijgen een streepje bovenin de kolom, en staan (net als alles) in de
 * lijst onder het rooster zodra je hun dag kiest.
 */
const WEEK_VAN = 8;
const WEEK_TOT = 17;

function WeekView({
  selectedDate,
  today,
  byDay,
  totalCount,
  dayItems,
  onPickDay,
  onCall,
  onRoute,
  onOpen,
}: {
  selectedDate: Date;
  today: Date;
  byDay: Map<string, PlanningItem[]>;
  totalCount: number;
  /** De items van de gekozen dag, voor de lijst onder het rooster. */
  dayItems: PlanningItem[];
  onPickDay: (d: Date) => void;
  onCall: (p: PlanningItem) => void;
  onRoute: (p: PlanningItem) => void;
  onOpen: (p: PlanningItem) => void;
}) {
  const styles = useStyles(themaStijlen);
  const { colors: th } = useTheme();
  const days = useMemo(() => weekDays(selectedDate), [selectedDate]);

  const pct = (uur: number) =>
    ((Math.min(Math.max(uur, WEEK_VAN), WEEK_TOT) - WEEK_VAN) / (WEEK_TOT - WEEK_VAN)) * 100;
  const uurVan = (iso: string) => {
    const d = new Date(iso);
    return d.getHours() + d.getMinutes() / 60;
  };
  const blokKleur = (p: PlanningItem) => agendaKleur(p, th).tekst;

  return (
    <>
      <View style={styles.periodeKop}>
        <Text style={styles.periodeTitel}>Week {getWeekNumber(selectedDate)}</Text>
        <Text style={styles.periodeMeta}>
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
        </Text>
      </View>

      <View style={styles.weekRooster}>
        <View style={styles.weekAs}>
          {[8, 11, 14, 17].map((u) => (
            <Text key={u} style={[styles.weekAsUur, { top: `${pct(u)}%` }]}>
              {String(u).padStart(2, '0')}
            </Text>
          ))}
        </View>

        {days.map((d) => {
          const key = toLocalISODate(d);
          const lijst = byDay.get(key) ?? [];
          const isToday = isSameLocalDay(d, today);
          const on = isSameLocalDay(d, selectedDate);
          return (
            <Pressable
              key={key}
              onPress={() => onPickDay(d)}
              accessibilityRole="button"
              accessibilityLabel={`${NL_DAYS_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()}, ${lijst.length} items`}
              style={({ pressed }) => [
                styles.weekKolom,
                isToday && styles.weekKolomVandaag,
                on && styles.weekKolomGekozen,
                pressed && { opacity: 0.85 },
              ]}
            >
              {lijst.map((p) => {
                if (!p.startAt) {
                  return <View key={p.id} style={[styles.weekBlok, styles.weekBlokVrij]} />;
                }
                const van = uurVan(p.startAt);
                const tot = p.endAt ? uurVan(p.endAt) : van + 1;
                return (
                  <View
                    key={p.id}
                    style={[
                      styles.weekBlok,
                      {
                        top: `${pct(van)}%`,
                        height: `${Math.max(3, pct(tot) - pct(van))}%`,
                        backgroundColor: blokKleur(p),
                      },
                    ]}
                  />
                );
              })}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.weekDagLabels}>
        {days.map((d) => {
          const on = isSameLocalDay(d, selectedDate);
          const isToday = isSameLocalDay(d, today);
          return (
            <Text
              key={toLocalISODate(d)}
              style={[
                styles.weekDagLabel,
                isToday && { color: th.green700, fontWeight: '700' },
                on && !isToday && { color: th.ink, fontWeight: '700' },
              ]}
            >
              {NL_DAYS_SHORT[(d.getDay() + 6) % 7]} {d.getDate()}
            </Text>
          );
        })}
      </View>

      <Text style={styles.weekHint}>Tik op een dag om de dagplanning te openen.</Text>

      {totalCount === 0 ? (
        <EmptyCard message="Geen agenda deze week." />
      ) : (
        <>
          <AppSection title={cap(formatPlanningDate(selectedDate))} count={dayItems.length} />
          {dayItems.length === 0 ? (
            <EmptyCard message="Geen afspraken op deze dag." />
          ) : (
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {dayItems.map((p) => (
                <PlanningCard key={p.id} item={p} onCall={onCall} onRoute={onRoute} onOpen={onOpen} />
              ))}
            </View>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Maand view
// ---------------------------------------------------------------------------

/**
 * De maandweergave uit het ontwerp: een raster van dagen, waarin de gekozen dag
 * een donker vlak is, vandaag een groene omlijning krijgt en een dag met werk
 * een groene stip. Drie signalen die elk iets anders zeggen — daarom drie
 * verschillende vormen en niet drie kleuren van hetzelfde bolletje.
 */
function MaandView({
  selectedDate,
  today,
  byDay,
  totalCount,
  dayItems,
  onSelectDay,
  onCall,
  onRoute,
  onOpen,
}: {
  selectedDate: Date;
  today: Date;
  byDay: Map<string, PlanningItem[]>;
  totalCount: number;
  dayItems: PlanningItem[];
  onSelectDay: (d: Date) => void;
  onCall: (p: PlanningItem) => void;
  onRoute: (p: PlanningItem) => void;
  onOpen: (p: PlanningItem) => void;
}) {
  const styles = useStyles(themaStijlen);
  const grid = useMemo(() => monthGridDays(selectedDate), [selectedDate]);

  return (
    <>
      <View style={styles.periodeKop}>
        <Text style={styles.periodeTitel}>{cap(MONTH_YEAR.format(selectedDate))}</Text>
        <Text style={styles.periodeMeta}>
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
        </Text>
      </View>

      <View style={styles.monthCard}>
        <View style={styles.monthHeaderRow}>
          {NL_DAYS_SHORT.map((d) => (
            <Text key={d} style={styles.monthHeaderCell}>
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.monthGrid}>
          {grid.map((d) => {
            const key = toLocalISODate(d);
            const count = byDay.get(key)?.length ?? 0;
            const inMonth = isSameMonth(d, selectedDate);
            const on = isSameLocalDay(d, selectedDate);
            const isToday = isSameLocalDay(d, today);
            return (
              <Pressable
                key={key}
                onPress={() => onSelectDay(d)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                aria-pressed={on}
                style={({ pressed }) => [
                  styles.monthCell,
                  on && styles.monthCellOn,
                  isToday && !on && styles.monthCellToday,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.monthCellNum,
                    !inMonth && styles.monthCellBuiten,
                    (on || isToday) && { fontWeight: '700' },
                    on && styles.monthCellNumOn,
                  ]}
                >
                  {d.getDate()}
                </Text>
                <View
                  style={[
                    styles.monthDot,
                    count > 0 && styles.monthDotAan,
                    on && count > 0 && styles.monthDotOpDonker,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      {totalCount === 0 ? (
        <EmptyCard message="Geen agenda deze maand." />
      ) : (
        <>
          <AppSection title={cap(formatPlanningDate(selectedDate))} count={dayItems.length} />
          {dayItems.length === 0 ? (
            <EmptyCard message="Geen afspraken op deze dag." />
          ) : (
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              {dayItems.map((p) => (
                <PlanningCard key={p.id} item={p} onCall={onCall} onRoute={onRoute} onOpen={onOpen} />
              ))}
            </View>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Planning item card
// ---------------------------------------------------------------------------

function PlanningCard({
  item,
  compact,
  highlight,
  onCall,
  onRoute,
  onOpen,
}: {
  item: PlanningItem;
  compact?: boolean;
  highlight?: boolean;
  onCall: (p: PlanningItem) => void;
  onRoute: (p: PlanningItem) => void;
  onOpen: (p: PlanningItem) => void;
}) {
  const styles = useStyles(themaStijlen);
  const { colors: th } = useTheme();
  const stripeColor = agendaKleur(item, th).tekst;
  const startLabel = formatPlanningTime(item.startAt);
  const endLabel = formatPlanningTime(item.endAt);
  const timeLabel = startLabel
    ? endLabel
      ? `${startLabel} – ${endLabel}`
      : startLabel
    : 'Hele dag';
  const tappable = !!item.workOrderId || !!item.customerId;

  const inner = (
    <View style={[styles.card, dsShadow, highlight && styles.cardHighlight]}>
      <View style={[styles.cardStripe, { backgroundColor: stripeColor }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTime}>{timeLabel}</Text>
          <View style={styles.cardTopRight}>
            <Text style={styles.cardType}>{item.typeLabel}</Text>
            {item.status ? <StatusBadge status={item.status} /> : null}
          </View>
        </View>

        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.customerName ? (
          <Text style={styles.cardCustomer} numberOfLines={1}>
            {item.customerName}
          </Text>
        ) : null}

        {item.address ? (
          <View style={styles.cardAddrRow}>
            <MapPin size={12} color={th.muted} strokeWidth={2} />
            <Text style={styles.cardAddr} numberOfLines={1}>
              {item.address}
            </Text>
          </View>
        ) : null}

        {item.assigneeName ? (
          <View style={styles.cardAddrRow}>
            <UserIcon size={12} color={th.muted} strokeWidth={2} />
            <Text style={styles.cardAddr} numberOfLines={1}>
              {item.assigneeName}
            </Text>
          </View>
        ) : null}

        {!compact ? (
          <View style={styles.cardActions}>
            {item.phone ? (
              <MiniBtn icon={<Phone size={13} color={th.ink} strokeWidth={2} />} label="Bel" onPress={() => onCall(item)} />
            ) : null}
            {item.address ? (
              <MiniBtn
                icon={<NavigationIcon size={13} color={th.ink} strokeWidth={2} />}
                label="Route"
                onPress={() => onRoute(item)}
              />
            ) : null}
            {item.workOrderId ? (
              <MiniBtn
                icon={<ClipboardList size={13} color={th.ink} strokeWidth={2} />}
                label="Werkbon"
                onPress={() => onOpen(item)}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );

  if (!tappable) return inner;
  return (
    <Pressable accessibilityRole="button" onPress={() => onOpen(item)} style={({ pressed }) => [pressed && { opacity: 0.95 }]}>
      {inner}
    </Pressable>
  );
}

function MiniBtn({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const styles = useStyles(themaStijlen);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={(e) => {
        e.stopPropagation?.();
        onPress();
      }}
      hitSlop={4}
      style={({ pressed }) => [styles.miniBtn, pressed && { opacity: 0.85 }]}
    >
      {icon}
      <Text style={styles.miniBtnText}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// State cards
// ---------------------------------------------------------------------------

function LoadingCard() {
  const { colors: th } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
      <AppCard padding={26} style={{ alignItems: 'center' }}>
        <Text style={{ color: th.muted, fontSize: 13 }}>Agenda wordt geladen…</Text>
      </AppCard>
    </View>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors: th } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
      <AppCard padding={20} style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: th.ink }}>Agenda niet geladen</Text>
        <Text style={{ fontSize: 13, color: th.muted, textAlign: 'center' }}>
          {message} Controleer je verbinding en probeer opnieuw.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [
            { backgroundColor: ds.green, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={{ color: ds.greenInk, fontWeight: '700' }}>Opnieuw proberen</Text>
        </Pressable>
      </AppCard>
    </View>
  );
}

function EmptyCard({ message }: { message: string }) {
  const styles = useStyles(themaStijlen);
  return (
    <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
      <View style={[styles.emptyCard, dsShadow]}>
        <View style={styles.emptyIcon}>
          <CalendarIcon size={28} color={ds.green} strokeWidth={1.8} />
        </View>
        <Text style={styles.emptyTitle}>Geen afspraken gepland</Text>
        <Text style={styles.emptyBody}>{message}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (t: ThemeColors) => StyleSheet.create({
    // ── Uurrooster ────────────────────────────────────────────────────────
    rooster: {
      marginHorizontal: 16,
      marginTop: 12,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: t.rLg,
      paddingTop: 14,
      paddingRight: 12,
      paddingBottom: 6,
      position: 'relative',
    },
    roosterRij: { flexDirection: 'row' },
    roosterUur: {
      width: 50,
      textAlign: 'right',
      paddingRight: 8,
      marginTop: -7,
      fontSize: 11,
      fontWeight: '600',
      color: t.muted2,
      fontVariant: ['tabular-nums'],
    },
    roosterLijn: { flex: 1, borderTopWidth: 1, borderTopColor: t.line },
    roosterVlak: { position: 'absolute', left: 56, right: 12, top: 14, bottom: 6 },
    roosterBlok: {
      position: 'absolute',
      left: 0,
      right: 0,
      borderWidth: 1.5,
      borderColor: 'transparent',
      borderRadius: 12,
      paddingVertical: 6,
      paddingHorizontal: 10,
      overflow: 'hidden',
    },
    roosterBlokTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    roosterStip: { width: 6, height: 6, borderRadius: 3 },
    roosterTitel: { flex: 1, fontSize: 12.5, fontWeight: '700' },
    roosterMeta: { fontSize: 11, marginTop: 2, opacity: 0.85 },
    nuLijn: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1.5,
      backgroundColor: t.statusRejectFg,
    },
    nuStip: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.statusRejectFg,
      marginLeft: -4,
      marginTop: -3,
    },

  toggleWrap: { paddingHorizontal: 16, paddingTop: 10 },
  toggleGroup: { flexDirection: 'row', backgroundColor: t.bgAlt, borderRadius: 12, padding: 3 },
  toggleBtn: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  toggleBtnOn: { backgroundColor: t.card },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: t.ink },
  toggleLabelOn: { fontWeight: '700' },

  // Period nav
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14.5,
    fontWeight: '800',
    color: t.ink,
    letterSpacing: -0.2,
  },
  todayBtn: {
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 12,
    backgroundColor: t.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: { fontSize: 12.5, fontWeight: '800', color: t.green700 },

  // Week strip (Dag view)
  // Ontwerp: kaart met haarlijn op radius 18 en 6 px padding; de zeven dagen
  // delen de breedte gelijk met 2 px ertussen.
  weekCard: {
    flexDirection: 'row',
    gap: 2,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 6,
    backgroundColor: t.card,
    borderRadius: ds.rLg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.line,
    ...dsShadow,
  },
  weekDay: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 14,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  weekDayOn: { backgroundColor: t.ink },
  /** Vandaag, maar niet geselecteerd: groene omlijning. */
  weekDayToday: { borderColor: ds.green },
  weekDayLabel: { fontSize: 11, fontWeight: '600', color: t.muted2 },
  weekDayLabelOn: { color: t.bg, opacity: 0.8 },
  weekDayNum: { fontSize: 17, lineHeight: 20, fontWeight: '700', color: t.ink },
  weekDayNumOn: { color: t.bg },
  weekDayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },

  // ── Periodekop (week / maand) ──────────────────────────────────────────
  periodeKop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  periodeTitel: { fontSize: 15, fontWeight: '700', color: t.ink },
  periodeMeta: { fontSize: 12.5, fontWeight: '600', color: t.muted2 },

  // ── Weekrooster ────────────────────────────────────────────────────────
  weekRooster: {
    flexDirection: 'row',
    gap: 5,
    height: 300,
    marginHorizontal: 16,
    marginTop: 10,
    paddingTop: 14,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 6,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: t.rLg,
    ...dsShadow,
  },
  weekAs: { width: 34 },
  weekAsUur: {
    position: 'absolute',
    right: 6,
    marginTop: -7,
    fontSize: 10.5,
    fontWeight: '600',
    color: t.muted2,
    fontVariant: ['tabular-nums'],
  },
  weekKolom: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: t.bgAlt,
    overflow: 'hidden',
  },
  weekKolomVandaag: { backgroundColor: t.green50 },
  weekKolomGekozen: { borderWidth: 2, borderColor: t.ink },
  weekBlok: {
    position: 'absolute',
    left: 3,
    right: 3,
    borderRadius: 4,
    minHeight: 4,
  },
  /** Zonder tijd: een streepje bovenin, zodat het item niet onzichtbaar wordt. */
  weekBlokVrij: { top: 2, height: 5, backgroundColor: t.muted2 },
  weekDagLabels: {
    flexDirection: 'row',
    gap: 5,
    marginHorizontal: 16,
    marginTop: 8,
    paddingLeft: 45,
    paddingRight: 12,
  },
  weekDagLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: t.muted2,
  },
  weekHint: {
    marginHorizontal: 18,
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: t.muted,
  },

  // ── Maandraster ────────────────────────────────────────────────────────
  monthCard: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingTop: 12,
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: t.rLg,
    ...dsShadow,
  },
  monthHeaderRow: { flexDirection: 'row', marginBottom: 6 },
  monthHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: t.muted2,
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  monthCell: {
    width: '14.2857%',
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  monthCellOn: { backgroundColor: t.ink },
  monthCellToday: { borderWidth: 1.5, borderColor: ds.green },
  monthCellNum: { fontSize: 14, fontWeight: '500', color: t.ink },
  monthCellNumOn: { color: t.bg },
  monthCellBuiten: { color: t.muted2, opacity: 0.5 },
  monthDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  monthDotAan: { backgroundColor: ds.green },
  monthDotOpDonker: { backgroundColor: t.bg },

  // Planning card
  card: {
    backgroundColor: t.card,
    borderRadius: ds.rMd,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  cardHighlight: { borderWidth: 1.5, borderColor: ds.green },
  cardStripe: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTime: { fontSize: 13, fontWeight: '800', color: t.ink, letterSpacing: -0.2 },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardType: { fontSize: 11, fontWeight: '700', color: t.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  cardTitle: { fontSize: 14.5, fontWeight: '700', color: t.ink, letterSpacing: -0.2, marginTop: 8 },
  cardCustomer: { fontSize: 12.5, color: t.muted, marginTop: 1 },
  cardAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardAddr: { fontSize: 12.5, color: t.muted, flexShrink: 1 },
  cardActions: { flexDirection: 'row', gap: 6, marginTop: 12 },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: t.bg,
  },
  miniBtnText: { fontSize: 11.5, fontWeight: '700', color: t.ink },

  // Empty
  emptyCard: { backgroundColor: t.card, borderRadius: ds.rLg, padding: 28, alignItems: 'center' },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: t.green50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: t.ink },
  emptyBody: { fontSize: 13.5, color: t.muted, marginTop: 6, textAlign: 'center' },

  scopeNote: {
    textAlign: 'center',
    fontSize: 11.5,
    color: t.muted2,
    fontWeight: '600',
    paddingTop: 18,
  },
});

/**
 * Licht en donker worden één keer opgebouwd; elke component in dit bestand
 * kiest er met `useStyles(themaStijlen)` tussen. Twee stylesheets kosten niets
 * — ze worden eenmalig aangemaakt — en zo mist geen enkele subcomponent het
 * thema.
 */
const themaStijlen = maakThemaStijlen(makeStyles);
