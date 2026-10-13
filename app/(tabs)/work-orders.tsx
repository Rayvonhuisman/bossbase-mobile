import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ClipboardList, Plus } from 'lucide-react-native';
import {
  AppCard,
  AppFilterChips,
  AppScreen,
  AppSearchBar,
  AppTopBar,
  ErrorState,
  HeaderIconButton,
  LoadingScreen,
  NoticeBanner,
  StatusBadge,
  type ChipDef,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  canCreateWorkOrder,
  listTeamProfiles,
  listWorkOrders,
} from '@/services/workOrderService';
import { formatDateLongNL, formatTimeNL } from '@/lib/format';
import { avatarKleuren, initialen } from '@/lib/avatar';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import type { WorkOrderWithCustomer } from '@/types/domain';
import { useLaden } from '@/lib/useLaden';
import { alsTekst } from '@/lib/notitieTekst';

type ChipKey =
  | 'alles'
  | 'open'
  | 'lopend'
  | 'klaar'
  | 'mij';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildTimeLabel(wo: WorkOrderWithCustomer): string {
  if (!wo.gepland_op) return '—';
  const planned = new Date(wo.gepland_op);
  if (Number.isNaN(planned.getTime())) return '—';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = wo.starttijd ? formatTimeNL(wo.starttijd) : '';
  let datePart: string;
  if (isSameDay(planned, today)) datePart = 'Vandaag';
  else if (isSameDay(planned, tomorrow)) datePart = 'Morgen';
  else datePart = formatDateLongNL(wo.gepland_op);
  return start ? `${datePart} · ${start}` : datePart;
}

function matchesQuery(wo: WorkOrderWithCustomer, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return [
    wo.nummer,
    wo.titel,
    wo.omschrijving,
    wo.locatie,
    wo.customer?.name,
    wo.customer?.address,
    wo.customer?.city,
  ].some((f) => f?.toLowerCase().includes(lower));
}

/**
 * Status buckets. The live vocabulary is gepland / in_uitvoering / afgerond;
 * the older English spellings are still accepted so a legacy row is never
 * dropped from every filter at once.
 */
function isOpen(s: string) {
  return s === 'gepland' || s === 'concept' || s === 'open';
}
function isLopend(s: string) {
  return s === 'in_uitvoering' || s === 'in_progress' || s === 'bezig';
}
function isKlaar(s: string) {
  return s === 'afgerond' || s === 'completed' || s === 'voltooid';
}

/** Everyone working on the job — the array is the live model. */
function worksOn(wo: WorkOrderWithCustomer, userId: string): boolean {
  return (wo.assigned_to_ids ?? []).includes(userId) || wo.assigned_to === userId;
}

function matchesChip(
  wo: WorkOrderWithCustomer,
  chip: ChipKey,
  userId: string | null,
): boolean {
  const s = String(wo.status ?? '').toLowerCase();
  switch (chip) {
    case 'alles':
      return true;
    case 'open':
      return isOpen(s);
    case 'lopend':
      return isLopend(s);
    case 'klaar':
      return isKlaar(s);
    case 'mij':
      return userId ? worksOn(wo, userId) : true;
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function WorkOrdersScreen() {
  const router = useRouter();
  const { user, companyId, role } = useAuth();
  const { can, hasFeature, readonly, loaded: rechtenGeladen } = usePermissions();
  const { colors: t, colorMode } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const isField = role === 'medewerker';

  // Aanmaken volgt policy `werkbonnen_insert`: de ROL admin of planner, en een
  // account dat mag schrijven. Zolang de rechten laden: geen knop.
  const canCreate =
    rechtenGeladen &&
    canCreateWorkOrder({
      userId: user?.id ?? null,
      role,
      can,
      gedeeldeWerkruimte: hasFeature('gedeelde_werkruimte'),
      readonly,
    });

  const [items, setItems] = useState<WorkOrderWithCustomer[]>([]);
  const [namen, setNamen] = useState<Record<string, string>>({});  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<ChipKey>(isField ? 'mij' : 'alles');

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const load = useCallback(
    async () => {
      setError(null);
      if (__DEV__) {
        // Bewijs per stap, zonder tokens of persoonsgegevens: alleen of er een
        // sessie is, welk bedrijf en welke rol, en hoeveel rijen er binnenkomen.
        console.log('[werkbonnen] load start', {
          heeftSessie: !!user?.id,
          companyId: companyId ? 'aanwezig' : 'ontbreekt',
          rol: role,
          rechtenGeladen,
        });
      }
      // No role-based filter here on purpose: RLS already decides what this
      // user may see (own jobs, or the whole company with the 'alles_inzien' /
      // 'planning' permission). Filtering client-side by role hid work orders
      // from people the database explicitly grants them to. The personal view
      // is the "Mijn werkbonnen" chip, which defaults on for a medewerker.
      const { data, error: fetchError } = await listWorkOrders();
      if (__DEV__) {
        console.log('[werkbonnen] query klaar', {
          fout: fetchError ?? null,
          rijen: data.length,
        });
      }
      if (fetchError) {
        // A failed query must never look like "geen werkbonnen": keep whatever
        // is on screen and report the failure.
        setError(fetchError);
      } else {
        setItems(data);
        // Resolve the names behind assigned_to_ids (a uuid[] without FK).
        const ids = data.flatMap((w) => [
          ...(w.assigned_to_ids ?? []),
          ...(w.assigned_to ? [w.assigned_to] : []),
        ]);
        const { data: map } = await listTeamProfiles(ids);
        setNamen(map);
      }
      if (__DEV__) console.log('[werkbonnen] load klaar');
    },
    [user?.id, companyId, role, rechtenGeladen],
  );

  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn drie
   * verschillende dingen. Alleen de laatste zet `refreshing`; terugkeren op
   * dit scherm ververst dus stil, zonder dat de lijst omlaag schuift.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, {
    onFout: setError,
  });



  // Counts for chips
  const counts = useMemo(() => {
    let open = 0, lopend = 0, klaar = 0;
    items.forEach((w) => {
      const s = String(w.status ?? '').toLowerCase();
      if (isOpen(s)) open++;
      if (isLopend(s)) lopend++;
      if (isKlaar(s)) klaar++;
    });
    return { all: items.length, open, lopend, klaar };
  }, [items]);

  const chips: ChipDef<ChipKey>[] = useMemo(
    () => [
      { id: 'alles', label: 'Alles', count: counts.all },
      { id: 'open', label: 'Open', count: counts.open },
      { id: 'lopend', label: 'Lopend', count: counts.lopend },
      { id: 'klaar', label: 'Klaar', count: counts.klaar },
      { id: 'mij', label: 'Mijn werkbonnen' },
    ],
    [counts],
  );

  const filtered = useMemo(
    () =>
      items.filter(
        (w) => matchesChip(w, chip, user?.id ?? null) && matchesQuery(w, query),
      ),
    [items, chip, query, user?.id],
  );

  /**
   * De drie groepen uit het ontwerp: Vandaag, Binnenkort, Eerder. Bonnen zonder
   * planningsdatum bestaan in de praktijk wél (het ontwerp kent ze niet), dus
   * die krijgen een eigen groep onderaan in plaats van stilletjes te verdwijnen.
   */
  const groepen = useMemo(() => {
    const dagVan = (w: WorkOrderWithCustomer): number | null => {
      if (!w.gepland_op) return null;
      const d = new Date(w.gepland_op);
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const vandaag = today.getTime();
    const tijd = (w: WorkOrderWithCustomer) => w.starttijd ?? '';
    const buckets: { key: string; label: string; items: WorkOrderWithCustomer[] }[] = [
      { key: 'vandaag', label: 'Vandaag', items: [] },
      { key: 'binnenkort', label: 'Binnenkort', items: [] },
      { key: 'eerder', label: 'Eerder', items: [] },
      { key: 'open', label: 'Niet ingepland', items: [] },
    ];
    filtered.forEach((w) => {
      const d = dagVan(w);
      if (d === null) buckets[3]!.items.push(w);
      else if (d === vandaag) buckets[0]!.items.push(w);
      else if (d > vandaag) buckets[1]!.items.push(w);
      else buckets[2]!.items.push(w);
    });
    buckets[0]!.items.sort((a, b) => tijd(a).localeCompare(tijd(b)));
    buckets[1]!.items.sort(
      (a, b) => (dagVan(a)! - dagVan(b)!) || tijd(a).localeCompare(tijd(b)),
    );
    buckets[2]!.items.sort(
      (a, b) => (dagVan(b)! - dagVan(a)!) || tijd(b).localeCompare(tijd(a)),
    );
    const zichtbaar = buckets.filter((g) => g.items.length > 0);
    if (__DEV__) {
      // Wat er ná filteren en groeperen overblijft. Staat hier één van deze op
      // nul terwijl de query wél rijen gaf, dan zit het probleem in het filter
      // of de groepering — niet in de database.
      console.log('[werkbonnen] render', {
        opgehaald: items.length,
        naFilter: filtered.length,
        groepen: zichtbaar.length,
        chip,
        zoekterm: query ? 'ja' : 'nee',
      });
    }
    return zichtbaar;
  }, [filtered, today, items.length, chip, query]);

  const onOpen = (id: string) => router.push(`/work-orders/${id}`);

  // Stale-while-refresh: only take over the screen when there is no data yet.
  if (loading && items.length === 0) return <LoadingScreen label="Werkbonnen laden..." />;
  if (error && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ErrorState title="Werkbonnen niet geladen" message={error} onRetry={opnieuw} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          /* Aanmaken zit rechtsboven, zoals in het ontwerp. Dat is bewust geen
             zwevende knop meer: die legde zich over de onderste lijstrijen. */
          <AppTopBar
            title="Werkbonnen"
            subtitle={`${items.length} totaal · ${counts.open + counts.lopend} open · ${counts.klaar} klaar`}
            rightAction={
              canCreate ? (
                <HeaderIconButton
                  icon={Plus}
                  label="Nieuwe werkbon"
                  size={42}
                  onPress={() => router.push('/work-orders/new')}
                />
              ) : undefined
            }
            showProfileButton
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* A refresh that failed while older rows are still on screen: say so,
            rather than letting stale data pass for current. */}
        {error && items.length > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <NoticeBanner
              toon="fout"
              message={`${error} Je ziet de laatst geladen lijst — tik om opnieuw te proberen.`}
              onPress={() => herlaad()}
            />
          </View>
        ) : null}

        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <AppSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Zoek werkbon, klant of nummer…"
          />
        </View>

        {/* Filter chips */}
        <View style={{ paddingTop: 14 }}>
          <AppFilterChips chips={chips} active={chip} onChange={setChip} />
        </View>

        {/* Lijst, gegroepeerd per periode */}
        {groepen.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <AppCard padding={28} style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <ClipboardList size={28} color={t.green700} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>Geen werkbonnen gevonden</Text>
              <Text style={styles.emptyBody}>
                {items.length === 0
                  ? 'Er zijn nog geen werkbonnen aangemaakt of toegewezen.'
                  : 'Geen werkbonnen die passen bij deze filter.'}
              </Text>
              <Pressable
                onPress={() => {
                  setQuery('');
                  setChip(isField ? 'mij' : 'alles');
                }}
                style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.emptyBtnText}>Filters wissen</Text>
              </Pressable>
            </AppCard>
          </View>
        ) : (
          groepen.map((g) => (
            <View key={g.key} style={styles.groep}>
              <View style={styles.groepKop}>
                <Text style={styles.groepLabel}>{g.label}</Text>
                <Text style={styles.groepCount}>{g.items.length}</Text>
              </View>
              {g.items.map((w) => (
                <WerkbonKaart
                  key={w.id}
                  styles={styles}
                  donker={colorMode === 'dark'}
                  wo={w}
                  namen={namen}
                  onPress={() => onOpen(w.id)}
                />
              ))}
            </View>
          ))
        )}
      </AppScreen>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Eén werkbon in de lijst, in de vorm uit het ontwerp:
 *
 *   WB-004 · di 16 juni · 09:00                       [ Gepland ]
 *   Schilderij verhuizen
 *   (NG) Niels Grevink · Wilhelminastraat 4, Emmen
 *
 * De toewijzing staat niet meer op een eigen regel onderaan: wie de bon doet
 * blijkt uit het detailscherm, en de lijst gaat over wat er wanneer moet
 * gebeuren. Is niemand toegewezen, dan zegt de regel dat nog steeds.
 */
function WerkbonKaart({
  styles,
  donker,
  wo,
  namen,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  donker: boolean;
  wo: WorkOrderWithCustomer;
  /** profile-id → full name, for the uuid[] assignment columns. */
  namen: Record<string, string>;
  onPress: () => void;
}) {
  const assignees = wo.assigned_to_ids?.length
    ? wo.assigned_to_ids
    : wo.assigned_to
      ? [wo.assigned_to]
      : [];
  const assigneeLabel =
    assignees.length === 0
      ? null
      : assignees.length === 1
        ? (namen[assignees[0]!] ?? 'Toegewezen')
        : `${namen[assignees[0]!] ?? 'Toegewezen'} +${assignees.length - 1}`;

  const klant = wo.customer?.name ?? null;
  const av = avatarKleuren(klant ?? wo.titel, donker);
  const adres =
    wo.locatie ??
    [wo.customer?.address, wo.customer?.city].filter(Boolean).join(', ') ??
    null;
  const meta = [wo.nummer ?? '—', buildTimeLabel(wo)].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.kaart, pressed && { opacity: 0.95 }]}
    >
      <View style={styles.kaartTop}>
        <Text style={styles.kaartMeta} numberOfLines={1}>
          {meta}
        </Text>
        <StatusBadge status={wo.status} />
      </View>
      <Text style={styles.kaartTitel} numberOfLines={2}>
        {wo.titel || alsTekst(wo.omschrijving) || 'Werkbon'}
      </Text>
      <View style={styles.kaartVoet}>
        <View style={[styles.kaartAvatar, { backgroundColor: av.bg }]}>
          <Text style={[styles.kaartAvatarText, { color: av.fg }]}>
            {initialen(klant ?? wo.titel)}
          </Text>
        </View>
        <Text style={styles.kaartKlant} numberOfLines={1}>
          {[klant, adres].filter(Boolean).join(' · ') || (assigneeLabel ?? 'Niet toegewezen')}
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
  // Groepskop: "Vandaag  3"
  groep: { paddingHorizontal: 16, marginTop: 14, gap: 8 },
  groepKop: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 2 },
  groepLabel: { fontSize: 14, fontWeight: '700', color: t.ink },
  groepCount: { fontSize: 12.5, fontWeight: '600', color: t.muted2 },

  // Werkbonkaart
  kaart: {
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: ds.rMd,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 7,
    ...dsShadow,
  },
  kaartTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  kaartMeta: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: t.muted,
    fontVariant: ['tabular-nums'],
  },
  kaartTitel: { fontSize: 15.5, fontWeight: '600', color: t.ink, lineHeight: 19 },
  kaartVoet: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kaartAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kaartAvatarText: { fontSize: 9.5, fontWeight: '700' },
  kaartKlant: { flex: 1, fontSize: 12.5, color: t.muted },


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
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: ds.green,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: ds.greenInk,
  },
});
