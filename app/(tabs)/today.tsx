import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Camera,
  Clock,
  FileText,
  Navigation as NavigationIcon,
  Phone,
  Users,
} from 'lucide-react-native';
import { AppCard, AppScreen, AppTopBar, NoticeBanner, StatusBadge, statusKey } from '@/components';
import { useAuth, useTheme } from '@/providers';
import { listUrenForProfile } from '@/services/timeEntryService';
import {
  getNextPlanningItem,
  listPlanningItemsForRange,
  type PlanningItem,
} from '@/services/activityService';
import { getDayRange } from '@/lib/dateRange';
import { useLaden } from '@/lib/useLaden';
import { telDagenOp, urenPerDag, type DagUren } from '@/lib/urenTotalen';
import { formatPlanningTime } from '@/lib/format';
import { callPhone, openMaps } from '@/lib/linking';
import { notAvailableAlert } from '@/lib/notAvailable';
import { dsShadow, dsShadowPop, type ThemeColors } from '@/theme';

/**
 * Vandaag — het startscherm uit het goedgekeurde ontwerp.
 *
 * De opbouw volgt het ontwerp letterlijk: een donkere statuskaart met de twee
 * getallen die er 's ochtends toe doen (werkbonnen klaar en uren geschreven),
 * vier snelle acties, de klus waar je nú mee bezig bent, en daaronder de
 * tijdlijn van de dag. Alle cijfers komen uit dezelfde Supabase-services als
 * voorheen; er is geen voorbeelddata bijgekomen.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NL_LONG_DATE = new Intl.DateTimeFormat('nl-NL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function firstNameOf(fullName: string | null | undefined, fallback: string): string {
  if (!fullName) return fallback;
  return fullName.trim().split(/\s+/)[0] ?? fallback;
}

const NL_DAYS_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

/** De normwerkdag uit het ontwerp — dezelfde 8 uur als de oude KPI-kaart. */
const NORM_UREN = 8;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // Mon = 0
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

/** "6,5" — het getal zonder eenheid, zoals de herokaart het toont. */
function formatUren(hours: number): string {
  if (!hours) return '0';
  if (Number.isInteger(hours)) return String(hours);
  return hours.toFixed(1).replace('.', ',');
}

/** "6,5 u" — met eenheid, voor lopende tekst. */
function formatUrenLang(hours: number): string {
  return `${formatUren(hours)} u`;
}

/** Afgeronde werkbon? Eén bron voor de statusvertaling: `statusKey`. */
function isAfgerond(status: string | null): boolean {
  return statusKey(status) === 'completed';
}
function isBezig(status: string | null): boolean {
  return statusKey(status) === 'in_progress';
}
function isVervallen(status: string | null): boolean {
  return statusKey(status) === 'cancelled';
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TodayScreen() {
  const router = useRouter();
  const { user, profile, role } = useAuth();
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  const firstName = firstNameOf(profile?.full_name, user?.email?.split('@')[0] ?? 'gebruiker');
  const currentUserName = profile?.full_name ?? user?.email ?? null;
  const today = useMemo(() => {
    const d = NL_LONG_DATE.format(new Date());
    return d.charAt(0).toUpperCase() + d.slice(1);
  }, []);
  const assignedToUserId = role === 'medewerker' ? (user?.id ?? null) : null;

  // ─── Week + today hours (real, Supabase) ────────────────────────────────
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 6);
    return e;
  }, [weekStart]);
  const todayWeekIdx = useMemo(() => (new Date().getDay() + 6) % 7, []);

  const [weekDagen, setWeekDagen] = useState<DagUren[]>([]);
  const [nextItem, setNextItem] = useState<PlanningItem | null>(null);
  const [todayItems, setTodayItems] = useState<PlanningItem[]>([]);

  const load = useCallback(
    async () => {
      if (!user?.id) return;

      const dayRange = getDayRange(new Date());
      const [planRes, weekRes, nextRes] = await Promise.all([
        listPlanningItemsForRange({
          startISO: dayRange.startISO,
          endISO: dayRange.endISO,
          startDate: dayRange.startDate,
          endDate: dayRange.endDate,
          assignedToUserId,
          currentUserId: user.id,
          currentUserName,
        }),
        // Werkdag- én werkbonuren, net als de Uren-tab: wie alleen op klussen
        // boekt, zag hier anders altijd 0.
        listUrenForProfile(user.id, toISODate(weekStart), toISODate(weekEnd)),
        getNextPlanningItem({ assignedToUserId, currentUserId: user.id, currentUserName }),
      ]);

      setTodayItems(planRes.items);
      setNextItem(nextRes.item);

      if (!weekRes.error && weekRes.data) {
        // Zelfde telling als de Uren-tab: werkdag- en werkbonuren apart, nooit
        // opgeteld (zie lib/urenTotalen).
        const dagen = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(weekStart);
          d.setDate(d.getDate() + i);
          return toISODate(d);
        });
        setWeekDagen(urenPerDag(weekRes.data, dagen));
      }

    },
    [user?.id, assignedToUserId, currentUserName, weekStart, weekEnd],
  );


  /**
   * Drie gescheiden toestanden: eerste load, stille verversing bij focus en
   * pull-to-refresh. Alleen de laatste zet `refreshing`, zodat een
   * automatische verversing het scherm niet omlaag duwt.
   */
  const { loading, refreshing, onRefresh } = useLaden(load);

  // De norm (8 uur per dag) gaat over werkdaguren; werkbonuren staan ernaast.
  const week = useMemo(() => telDagenOp(weekDagen), [weekDagen]);
  const vandaagUren = weekDagen[todayWeekIdx];
  const loggedToday = vandaagUren?.werkdag ?? 0;
  const werkdagOntbreekt = (vandaagUren?.zonderWerkdag ?? 0) > 0;
  const klusGroter = (vandaagUren?.klusGroter ?? 0) > 0;

  // ─── Afgeleiden voor de herokaart ───────────────────────────────────────
  const werkbonnen = useMemo(
    () => todayItems.filter((i) => i.source === 'work_order'),
    [todayItems],
  );
  const afspraken = useMemo(
    () => todayItems.filter((i) => i.source !== 'work_order'),
    [todayItems],
  );
  const klaar = useMemo(() => werkbonnen.filter((w) => isAfgerond(w.status)).length, [werkbonnen]);

  /**
   * De klus die bovenaan staat: eerst een bon die daadwerkelijk loopt, anders
   * de eerstvolgende bon van vandaag die niet afgerond of geannuleerd is.
   * Staat er vandaag geen enkele bon, dan valt het scherm terug op de
   * eerstvolgende agenda-afspraak — dezelfde bron als voorheen.
   */
  const huidige = useMemo(() => {
    const bezig = werkbonnen.find((w) => isBezig(w.status));
    if (bezig) return bezig;
    const open = werkbonnen.find((w) => !isAfgerond(w.status) && !isVervallen(w.status));
    return open ?? nextItem;
  }, [werkbonnen, nextItem]);

  const huidigeIsBezig = !!huidige && isBezig(huidige.status);
  const urenOver = Math.max(0, NORM_UREN - loggedToday);

  const heroLinks = huidige
    ? `${huidigeIsBezig ? 'Nu bezig' : 'Volgende'}: ${huidige.title}`
    : werkbonnen.length > 0
      ? 'Alles afgerond voor vandaag'
      : 'Niets gepland voor vandaag';
  const heroRechts = werkdagOntbreekt
    ? 'werkdag ontbreekt'
    : urenOver > 0
      ? `nog ${formatUrenLang(urenOver)}`
      : 'dag compleet';

  // Kort gehouden: de bovenbalk geeft één regel, en "geschreven" erachter
  // viel er in de simulator al af op een iPhone 17.
  const subtitel = `${werkbonnen.length} ${werkbonnen.length === 1 ? 'werkbon' : 'werkbonnen'} · ${afspraken.length} ${afspraken.length === 1 ? 'afspraak' : 'afspraken'} · ${formatUrenLang(loggedToday)}`;

  // ─── Acties (ongewijzigd) ───────────────────────────────────────────────
  const openPlanningItem = (item: PlanningItem) => {
    if (item.workOrderId) router.push(`/work-orders/${item.workOrderId}`);
    else if (item.customerId) router.push(`/customers/${item.customerId}`);
  };
  const onNavigate = (addr: string | null) => {
    if (!openMaps(addr)) notAvailableAlert('Navigeren', 'Geen adres bekend.');
  };
  const onCall = (phone: string | null) => {
    if (!callPhone(phone)) notAvailableAlert('Bellen', 'Geen telefoonnummer bekend.');
  };

  const huidigeTijd = huidige
    ? [formatPlanningTime(huidige.startAt), formatPlanningTime(huidige.endAt)]
        .filter(Boolean)
        .join(' – ')
    : '';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AppScreen
        header={
          <AppTopBar
            eyebrow={today}
            title={`Hoi ${firstName}`}
            subtitle={subtitel}
            showProfileButton
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* ── Statuskaart ─────────────────────────────────────────────── */}
        <View style={styles.heroWrap}>
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroLabel}>Werkbonnen</Text>
                <View style={styles.heroValueRow}>
                  <Text style={styles.heroValue}>{klaar}</Text>
                  <Text style={styles.heroUnit}>van {werkbonnen.length} klaar</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.heroLabel}>Werkdag</Text>
                <View style={styles.heroValueRow}>
                  <Text style={[styles.heroValue, { color: c.green }]}>
                    {formatUren(loggedToday)}
                  </Text>
                  <Text style={styles.heroUnit}>/ {NORM_UREN} u</Text>
                </View>
              </View>
            </View>

            {werkbonnen.length > 0 ? (
              <View style={styles.heroSegs}>
                {werkbonnen.map((w) => (
                  <View
                    key={w.id}
                    style={[
                      styles.heroSeg,
                      isAfgerond(w.status)
                        ? { backgroundColor: c.green }
                        : isBezig(w.status)
                          ? { backgroundColor: 'rgba(34,197,94,0.45)' }
                          : null,
                    ]}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.heroFoot}>
              <Text style={styles.heroFootText} numberOfLines={1}>
                {loading ? 'Laden…' : heroLinks}
              </Text>
              <Text style={[styles.heroFootText, { flexShrink: 0 }]}>{heroRechts}</Text>
            </View>
          </View>
        </View>

        {/* Uren die niet kloppen: zeggen, niet wegrekenen (lib/urenTotalen). */}
        {!loading && (werkdagOntbreekt || klusGroter) && vandaagUren ? (
          <View style={styles.signaalWrap}>
            <NoticeBanner
              toon="waarschuwing"
              title={werkdagOntbreekt ? 'Werkdaguren ontbreken' : 'Uren kloppen niet'}
              message={
                werkdagOntbreekt
                  ? `Je hebt vandaag ${formatUrenLang(vandaagUren.werkbon)} op werkbonnen geboekt, maar nog geen werkdaguren geschreven.`
                  : `Je werkbonuren (${formatUrenLang(vandaagUren.werkbon)}) zijn hoger dan je werkdaguren (${formatUrenLang(vandaagUren.werkdag)}).`
              }
              onPress={() => router.push('/(tabs)/hours')}
            />
          </View>
        ) : null}

        {/* ── Snelle acties ───────────────────────────────────────────── */}
        <View style={styles.quickRow}>
          <QuickAction
            styles={styles}
            icon={<Clock size={20} color={c.green700} strokeWidth={1.9} />}
            label="Uren schrijven"
            onPress={() => router.push('/hours/new')}
          />
          <QuickAction
            styles={styles}
            icon={<Camera size={20} color={c.green700} strokeWidth={1.9} />}
            label="Foto bij werk"
            onPress={() => router.push('/(tabs)/work-orders')}
          />
          <QuickAction
            styles={styles}
            icon={<FileText size={20} color={c.green700} strokeWidth={1.9} />}
            label="Nieuwe werkbon"
            onPress={() => router.push('/work-orders/new')}
          />
          <QuickAction
            styles={styles}
            icon={<Users size={20} color={c.green700} strokeWidth={1.9} />}
            label="Klant zoeken"
            onPress={() => router.push('/(tabs)/customers')}
          />
        </View>

        {/* ── Nu bezig / Volgende ─────────────────────────────────────── */}
        {huidige ? (
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <Text style={styles.blockTitle}>{huidigeIsBezig ? 'Nu bezig' : 'Volgende'}</Text>
              {huidigeTijd ? <Text style={styles.blockMeta}>{huidigeTijd}</Text> : null}
            </View>
            <View style={styles.currentCard}>
              <Pressable onPress={() => openPlanningItem(huidige)} style={{ gap: 10 }}>
                <View style={styles.currentTopRow}>
                  <Text style={styles.currentId}>
                    {huidige.number ?? huidige.typeLabel.toUpperCase()}
                  </Text>
                  {huidige.status ? <StatusBadge status={huidige.status} /> : null}
                </View>
                <View>
                  <Text style={styles.currentTitle}>{huidige.title}</Text>
                  <Text style={styles.currentSub} numberOfLines={2}>
                    {[huidige.customerName, huidige.address].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.currentActions}>
                <FlatBtn
                  styles={styles}
                  icon={<Phone size={17} color={c.ink} strokeWidth={1.9} />}
                  label="Bel"
                  onPress={() => onCall(huidige.phone)}
                />
                <FlatBtn
                  styles={styles}
                  icon={<NavigationIcon size={17} color={c.ink} strokeWidth={1.9} />}
                  label="Route"
                  onPress={() => onNavigate(huidige.address)}
                />
                <FlatBtn
                  styles={styles}
                  grow={1.3}
                  primary
                  icon={<Clock size={17} color={c.greenInk} strokeWidth={2} />}
                  label="Uren"
                  onPress={() => router.push('/hours/new')}
                />
              </View>
            </View>
          </View>
        ) : null}

        {/* ── Planning vandaag ────────────────────────────────────────── */}
        <View style={styles.block}>
          <View style={styles.blockHead}>
            <Text style={styles.blockTitle}>Planning vandaag</Text>
            <Pressable onPress={() => router.push('/(tabs)/planning')} hitSlop={8}>
              <Text style={styles.blockLink}>Agenda ›</Text>
            </Pressable>
          </View>

          {todayItems.length === 0 ? (
            <AppCard padding={18} style={{ alignItems: 'center' }}>
              <Text style={styles.emptyText}>
                {loading ? 'Laden…' : 'Niets gepland voor vandaag.'}
              </Text>
            </AppCard>
          ) : (
            todayItems.map((t, idx) => (
              <TimelineRow
                key={t.id}
                styles={styles}
                c={c}
                item={t}
                laatste={idx === todayItems.length - 1}
                onPress={() => openPlanningItem(t)}
              />
            ))
          )}
        </View>

        {/* ── Deze week ───────────────────────────────────────────────── */}
        <View style={styles.block}>
          <View style={styles.blockHead}>
            <Text style={styles.blockTitle}>Deze week</Text>
            <Pressable onPress={() => router.push('/(tabs)/hours')} hitSlop={8}>
              <Text style={styles.blockLink}>Uren ›</Text>
            </Pressable>
          </View>
          <AppCard padding={16}>
            <View style={styles.weekHeader}>
              <Text style={styles.weekTotalLabel}>Werkdag deze week</Text>
              <Text style={styles.weekTotalValue}>{formatUrenLang(week.werkdag)}</Text>
            </View>
            <View style={styles.weekRow}>
              {NL_DAYS_SHORT.map((label, idx) => {
                const dag = weekDagen[idx];
                const hours = dag?.werkdag ?? 0;
                const signaal = !!dag && (dag.zonderWerkdag > 0 || dag.klusGroter > 0);
                const on = idx === todayWeekIdx;
                const height = Math.max(hours || signaal ? 6 : 4, Math.min(52, (hours / NORM_UREN) * 52));
                return (
                  <View key={label + idx} style={styles.weekItem}>
                    <Text style={[styles.weekHours, on && { color: c.ink }, signaal && styles.weekHoursLet]}>
                      {hours ? formatUren(hours) : signaal ? '!' : ''}
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
                              : hours >= NORM_UREN
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
            <Text style={styles.weekKlus}>
              Op werkbonnen {formatUrenLang(week.werkbon)}
              {week.werkdag > 0 ? ` · niet aan een klus ${formatUrenLang(Math.max(0, week.verschil))}` : ''}
            </Text>
          </AppCard>
        </View>
      </AppScreen>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type Styles = ReturnType<typeof makeStyles>;

function QuickAction({
  styles,
  icon,
  label,
  onPress,
}: {
  styles: Styles;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.quickCard, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.quickIcon}>{icon}</View>
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function FlatBtn({
  styles,
  icon,
  label,
  onPress,
  primary,
  grow = 1,
}: {
  styles: Styles;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  primary?: boolean;
  grow?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.flatBtn,
        { flexGrow: grow, flexShrink: 1, flexBasis: 0 },
        primary && styles.flatBtnPrimary,
        pressed && { opacity: 0.9 },
      ]}
    >
      {icon}
      <Text style={[styles.flatBtnText, primary && styles.flatBtnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Eén rij in de tijdlijn: tijd, stip met verbindingslijn, en de kaart.
 * De kleur van de stip zegt wat er met het item aan de hand is; de statusbadge
 * op de kaart zegt het óók in tekst, want kleur alleen is geen signaal.
 */
function TimelineRow({
  styles,
  c,
  item,
  laatste,
  onPress,
}: {
  styles: Styles;
  c: ThemeColors;
  item: PlanningItem;
  laatste: boolean;
  onPress: () => void;
}) {
  const afgerond = isAfgerond(item.status);
  const bezig = isBezig(item.status);
  const isWerkbon = item.source === 'work_order';
  const tijd = [formatPlanningTime(item.startAt), formatPlanningTime(item.endAt)]
    .filter(Boolean)
    .join('–');
  const tappable = !!item.workOrderId || !!item.customerId;

  const dot = bezig
    ? { backgroundColor: c.green, borderWidth: 0 }
    : afgerond
      ? { backgroundColor: c.muted2, borderWidth: 0 }
      : isWerkbon
        ? { backgroundColor: c.card, borderWidth: 2.5, borderColor: c.green }
        : { backgroundColor: c.statusInfoFg, borderWidth: 0 };

  return (
    <View style={[styles.tlRow, afgerond && { opacity: 0.6 }]}>
      <Text style={styles.tlTime}>{formatPlanningTime(item.startAt) || '—'}</Text>
      <View style={styles.tlRail}>
        <View style={[styles.tlDot, dot, bezig && styles.tlDotGlow]} />
        {laatste ? null : <View style={styles.tlLine} />}
      </View>
      <Pressable
        onPress={tappable ? onPress : undefined}
        style={({ pressed }) => [styles.tlCard, pressed && tappable && { opacity: 0.95 }]}
      >
        <View style={styles.tlCardTop}>
          <Text style={styles.tlTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.status ? (
            <StatusBadge status={item.status} />
          ) : (
            <View style={[styles.tlPill, { backgroundColor: c.statusInfoBg }]}>
              <Text style={[styles.tlPillText, { color: c.statusInfoFg }]}>{item.typeLabel}</Text>
            </View>
          )}
        </View>
        <Text style={styles.tlMeta} numberOfLines={1}>
          {[item.number ?? item.typeLabel, tijd].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.tlMeta} numberOfLines={1}>
          {[item.customerName, item.address].filter(Boolean).join(' · ') || '—'}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // ── Statuskaart ────────────────────────────────────────────────────
    heroWrap: { paddingHorizontal: 16 },
    hero: {
      backgroundColor: c.barBg,
      borderRadius: c.rXl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.barBorder,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 16,
      ...dsShadowPop,
    },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    heroLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.88,
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.62)',
    },
    heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 },
    heroValue: { fontSize: 34, fontWeight: '700', lineHeight: 36, color: '#FFFFFF' },
    heroUnit: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.72)' },
    heroSegs: { flexDirection: 'row', gap: 6, marginTop: 16 },
    heroSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
    heroFoot: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 10,
    },
    heroFootText: {
      flexShrink: 1,
      fontSize: 12,
      fontWeight: '500',
      color: 'rgba(255,255,255,0.72)',
    },

    // ── Snelle acties ──────────────────────────────────────────────────
    quickRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 14 },
    quickCard: {
      flex: 1,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: c.rMd,
      paddingTop: 12,
      paddingBottom: 10,
      paddingHorizontal: 4,
      alignItems: 'center',
      gap: 8,
    },
    quickIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.green50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLabel: {
      fontSize: 11.5,
      lineHeight: 14,
      fontWeight: '600',
      color: c.ink,
      textAlign: 'center',
    },

    // ── Sectiekop ──────────────────────────────────────────────────────
    block: { paddingHorizontal: 16, marginTop: 22, gap: 8 },
    blockHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 12,
    },
    blockTitle: { fontSize: 16, fontWeight: '700', color: c.ink },
    blockMeta: { fontSize: 12.5, fontWeight: '600', color: c.muted },
    blockLink: { fontSize: 13, fontWeight: '600', color: c.green700 },

    // ── Nu bezig ───────────────────────────────────────────────────────
    currentCard: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: 20,
      padding: 16,
      gap: 12,
      ...dsShadow,
    },
    currentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    currentId: { fontSize: 12, fontWeight: '700', letterSpacing: 0.48, color: c.muted },
    currentTitle: { fontSize: 18, fontWeight: '700', color: c.ink, lineHeight: 22 },
    currentSub: { fontSize: 13, color: c.muted, marginTop: 4 },
    currentActions: { flexDirection: 'row', gap: 8 },
    flatBtn: {
      height: 44,
      borderRadius: 13,
      backgroundColor: c.bgAlt,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    flatBtnPrimary: { backgroundColor: c.green },
    flatBtnText: { fontSize: 13, fontWeight: '600', color: c.ink },
    flatBtnTextPrimary: { fontWeight: '700', color: c.greenInk },

    emptyText: { fontSize: 13.5, color: c.muted, textAlign: 'center' },

    // ── Tijdlijn ───────────────────────────────────────────────────────
    tlRow: { flexDirection: 'row', gap: 10 },
    tlTime: {
      width: 42,
      textAlign: 'right',
      paddingTop: 14,
      fontSize: 12,
      fontWeight: '600',
      color: c.muted,
      fontVariant: ['tabular-nums'],
    },
    tlRail: { width: 14, alignItems: 'center' },
    tlDot: { width: 12, height: 12, borderRadius: 6, marginTop: 15 },
    tlDotGlow: {
      shadowColor: c.green,
      shadowOpacity: 0.9,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 0 },
      elevation: 3,
    },
    tlLine: { flex: 1, width: 2, borderRadius: 1, backgroundColor: c.line, marginTop: 6 },
    tlCard: {
      flex: 1,
      minWidth: 0,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.line,
      borderRadius: c.rMd,
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 3,
      marginBottom: 10,
    },
    tlCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    tlTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: c.ink },
    tlMeta: { fontSize: 12.5, color: c.muted },
    tlPill: { height: 24, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center' },
    tlPillText: { fontSize: 12, fontWeight: '600' },

    // ── Weekstaafjes ───────────────────────────────────────────────────
    weekHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    weekTotalLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: c.muted2,
      textTransform: 'uppercase',
      letterSpacing: 0.66,
    },
    weekTotalValue: { fontSize: 16, fontWeight: '700', color: c.ink },
    weekRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
    weekItem: { alignItems: 'center', gap: 6, width: 36 },
    weekHours: { fontSize: 11, fontWeight: '700', color: c.muted },
    weekBarFrame: { height: 52, width: 18, justifyContent: 'flex-end' },
    weekBar: { width: '100%', borderRadius: 6 },
    weekBarOn: { backgroundColor: c.green },
    weekBarVol: { backgroundColor: c.ink },
    weekBarDeels: { backgroundColor: c.muted2 },
    weekLabelOn: { color: c.green700, fontWeight: '700' },
    weekBarIdle: { backgroundColor: c.bgAlt },
    weekLabel: { fontSize: 11, fontWeight: '600', color: c.muted },
    // Een dag die niet klopt: zelfde amber als de waarschuwingen elders.
    weekBarLet: { backgroundColor: c.statusWarnStripe },
    weekHoursLet: { color: c.statusWarnFg },
    weekKlus: { marginTop: 12, fontSize: 12, fontWeight: '600', color: c.muted },
    signaalWrap: { paddingHorizontal: 16, paddingTop: 12 },
  });
