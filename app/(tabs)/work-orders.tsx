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
  type ChipDef,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  canCreateWorkOrder,
  listTakenTellingen,
  listTeamProfiles,
  listWorkOrders,
  type Werkbon,
} from '@/services/workOrderService';
import { avatarKleuren, initialen } from '@/lib/avatar';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { alsTekst } from '@/lib/notitieTekst';
import { vandaagIso } from '@/lib/nlTijd';
import {
  matchtStatus,
  matchtZoekterm,
  planningLabel,
  telStatussen,
  werkbonDagen,
  werkbonVenster,
  WERKBON_STATUS_STIJL,
  type StatusFilter,
} from '@/lib/werkbonLogica';
import { WerkbonStatusBadge } from '@/components/WerkbonStatusBadge';

type ChipKey = StatusFilter | 'mij';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "ma 3 nov · 08:00" of "ma 3 nov – vr 7 nov · 5 dagen · 08:00" (dashboardkaart). */
function datumLabel(wo: Werkbon): string {
  const label = planningLabel(wo);
  if (!label) return 'Niet ingepland';
  const { starttijd } = werkbonVenster(wo);
  return starttijd ? `${label} · ${starttijd}` : label;
}

/** Everyone working on the job — the array is the live model. */
function worksOn(wo: Werkbon, userId: string): boolean {
  return (wo.assigned_to_ids ?? []).includes(userId) || wo.assigned_to === userId;
}

function matchesChip(wo: Werkbon, chip: ChipKey, userId: string | null): boolean {
  if (chip === 'mij') return userId ? worksOn(wo, userId) : true;
  return matchtStatus(wo, chip);
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

  const [items, setItems] = useState<Werkbon[]>([]);
  const [namen, setNamen] = useState<Record<string, string>>({});
  const [taken, setTaken] = useState<Record<string, { done: number; total: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<ChipKey>(isField ? 'mij' : 'alle');

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
      const [{ data, error: fetchError }, takenRes] = await Promise.all([
        listWorkOrders(),
        listTakenTellingen(),
      ]);
      // De voortgangsbalk is bijzaak: mislukt hij, dan blijft de lijst staan.
      if (!takenRes.error) setTaken(takenRes.data);
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



  // Tellers per status, zoals de chips van het dashboard.
  const counts = useMemo(() => telStatussen(items), [items]);

  const chips: ChipDef<ChipKey>[] = useMemo(
    () => [
      { id: 'alle', label: 'Alle', count: counts.alle },
      { id: 'gepland', label: WERKBON_STATUS_STIJL.gepland.label, count: counts.gepland },
      { id: 'in_uitvoering', label: WERKBON_STATUS_STIJL.in_uitvoering.label, count: counts.in_uitvoering },
      { id: 'afgerond', label: WERKBON_STATUS_STIJL.afgerond.label, count: counts.afgerond },
      { id: 'mij', label: 'Mijn werkbonnen' },
    ],
    [counts],
  );

  const filtered = useMemo(
    () => items.filter((w) => matchesChip(w, chip, user?.id ?? null) && matchtZoekterm(w, query)),
    [items, chip, query, user?.id],
  );

  /**
   * Vandaag / Binnenkort / Eerder / Niet ingepland. Een meerdaagse bon telt als
   * "Vandaag" zodra één van zijn dagen vandaag is, en als "Binnenkort" zolang er
   * nog een dag komt.
   */
  const groepen = useMemo(() => {
    const vandaag = vandaagIso();
    const sleutel = (w: Werkbon) => {
      const dagen = werkbonDagen(w).map((d) => d.datum);
      return dagen.find((d) => d >= vandaag) ?? dagen[dagen.length - 1] ?? '';
    };
    const tijd = (w: Werkbon) => werkbonVenster(w).starttijd ?? '';
    const buckets: { key: string; label: string; items: Werkbon[] }[] = [
      { key: 'vandaag', label: 'Vandaag', items: [] },
      { key: 'binnenkort', label: 'Binnenkort', items: [] },
      { key: 'eerder', label: 'Eerder', items: [] },
      { key: 'open', label: 'Niet ingepland', items: [] },
    ];
    filtered.forEach((w) => {
      const dagen = werkbonDagen(w).map((d) => d.datum);
      if (!dagen.length) buckets[3]!.items.push(w);
      else if (dagen.includes(vandaag)) buckets[0]!.items.push(w);
      else if (dagen.some((d) => d > vandaag)) buckets[1]!.items.push(w);
      else buckets[2]!.items.push(w);
    });
    buckets[0]!.items.sort((a, b) => tijd(a).localeCompare(tijd(b)));
    buckets[1]!.items.sort((a, b) => sleutel(a).localeCompare(sleutel(b)) || tijd(a).localeCompare(tijd(b)));
    buckets[2]!.items.sort((a, b) => sleutel(b).localeCompare(sleutel(a)) || tijd(b).localeCompare(tijd(a)));
    return buckets.filter((g) => g.items.length > 0);
  }, [filtered]);

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
            subtitle={`${items.length} totaal · ${counts.gepland + counts.in_uitvoering} open · ${counts.afgerond} afgerond`}
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
            placeholder="Zoek op titel, klant of locatie…"
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
                  : 'Pas de filters aan of maak een nieuwe werkbon aan.'}
              </Text>
              <View style={styles.emptyKnoppen}>
                <Pressable
                  onPress={() => {
                    setQuery('');
                    setChip(isField ? 'mij' : 'alle');
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.emptyBtnText}>Filters wissen</Text>
                </Pressable>
                {canCreate ? (
                  <Pressable
                    onPress={() => router.push('/work-orders/new')}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.emptyBtn, styles.emptyBtnLicht, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={[styles.emptyBtnText, { color: t.ink }]}>Nieuwe werkbon</Text>
                  </Pressable>
                ) : null}
              </View>
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
                  taken={taken[w.id]}
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
  taken,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  donker: boolean;
  wo: Werkbon;
  /** profile-id → full name, for the uuid[] assignment columns. */
  namen: Record<string, string>;
  /** Takenvoortgang (meerwerk telt niet mee). */
  taken?: { done: number; total: number };
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
  const adres = wo.locatie || [wo.customer?.address, wo.customer?.city].filter(Boolean).join(', ') || null;
  const meta = [wo.nummer ?? '—', datumLabel(wo)].join(' · ');
  const pct = taken && taken.total > 0 ? Math.round((taken.done / taken.total) * 100) : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${wo.titel}${klant ? `, ${klant}` : ''}`}
      style={({ pressed }) => [styles.kaart, pressed && { opacity: 0.95 }]}
    >
      <View style={styles.kaartTop}>
        <Text style={styles.kaartMeta} numberOfLines={1}>
          {meta}
        </Text>
        <WerkbonStatusBadge status={wo.status} klein />
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
      {pct !== null && taken ? (
        <View style={styles.voortgang}>
          <View style={styles.voortgangBalk}>
            <View style={[styles.voortgangVulling, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.voortgangTekst}>
            {taken.done}/{taken.total}
          </Text>
        </View>
      ) : null}
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
  voortgang: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voortgangBalk: { flex: 1, height: 5, borderRadius: 3, backgroundColor: t.bgAlt, overflow: 'hidden' },
  voortgangVulling: { height: 5, borderRadius: 3, backgroundColor: ds.green },
  voortgangTekst: { fontSize: 11.5, fontWeight: '700', color: t.muted, fontVariant: ['tabular-nums'] },
  emptyKnoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 16 },
  emptyBtnLicht: { backgroundColor: t.bgAlt, borderWidth: 1, borderColor: t.line },


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
    minHeight: 44,
    justifyContent: 'center',
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
