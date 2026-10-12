import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Dialog } from '@/lib/dialog';
import {
  ChevronRight,
  Navigation as NavigationIcon,
  Phone,
  Search,
  Plus,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import {
  AppCard,
  AppFilterChips,
  AppScreen,
  AppSearchBar,
  AppTopBar,
  HeaderIconButton,
  ErrorState,
  LoadingScreen,
  type ChipDef,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import { listCustomers } from '@/services/customerService';
import { callPhone, openMaps } from '@/lib/linking';
import { avatarKleuren, initialen } from '@/lib/avatar';
import { ds, dsShadow, type ThemeColors } from '@/theme';
import type { Customer } from '@/types/domain';
import { useLaden } from '@/lib/useLaden';

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type FilterKey =
  | 'alle'
  | 'recent'
  | 'actief'
  | 'zakelijk'
  | 'particulier';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lastTouchedISO(c: Customer): string | null {
  return c.updated_at ?? c.created_at ?? null;
}

function activityLabel(c: Customer): string {
  const iso = lastTouchedISO(c);
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const days = Math.floor((now - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'Vandaag';
  if (days === 1) return 'Gisteren';
  if (days < 7) return `${days} dagen geleden`;
  if (days < 14) return '1 week geleden';
  if (days < 30) return `${Math.floor(days / 7)} weken geleden`;
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(d);
}

/**
 * De accentkleur van een klantavatar. Komt uit `tint()` in het thema, zodat de
 * avatars in dark mode meekleuren in plaats van lichte vlakjes te blijven; de
 * naam bepaalt welke van de vier het wordt, zodat dezelfde klant altijd
 * dezelfde kleur houdt.
 */
function isZakelijk(c: Customer): boolean {
  return !!(c.kvk_number && c.kvk_number.trim());
}

function matchesQuery(c: Customer, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return [c.name, c.email, c.phone, c.address, c.postcode, c.city, c.kvk_number].some(
    (f) => f?.toLowerCase().includes(lower),
  );
}

function matchesFilter(c: Customer, key: FilterKey, todayMs: number): boolean {
  switch (key) {
    case 'alle':
      return true;
    case 'recent': {
      const iso = lastTouchedISO(c);
      if (!iso) return false;
      const ms = new Date(iso).getTime();
      return !Number.isNaN(ms) && todayMs - ms < 7 * 24 * 60 * 60 * 1000;
    }
    case 'actief': {
      // Heuristic: recente activiteit (afgelopen 30 dagen) = "actief"
      const iso = lastTouchedISO(c);
      if (!iso) return false;
      const ms = new Date(iso).getTime();
      return !Number.isNaN(ms) && todayMs - ms < 30 * 24 * 60 * 60 * 1000;
    }
    case 'zakelijk':
      return isZakelijk(c);
    case 'particulier':
      return !isZakelijk(c);
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CustomersScreen() {
  const router = useRouter();
  const { can, readonly, planStatus, loaded: rechtenGeladen } = usePermissions();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  /**
   * Klanten aanmaken volgt het dashboard: het recht `klanten_bewerken`. RLS
   * laat de INSERT zelf al toe voor iedereen in het bedrijf, maar het dashboard
   * houdt de lijst zonder dit recht alleen-lezen — de app doet hetzelfde, zodat
   * beide kanten dezelfde knoppen tonen.
   *
   * Daarnaast twee harde grenzen uit de database: `readonly_customers` eist een
   * geldig abonnement en `plan_limiet_klanten` een vrije plek binnen de limiet.
   */
  const klantenLimiet = planStatus?.limits?.klanten;
  const limietVol =
    !!klantenLimiet && klantenLimiet.max != null && klantenLimiet.gebruikt >= klantenLimiet.max;
  const canCreate = rechtenGeladen && can('klanten_bewerken') && !readonly && !limietVol;

  const [items, setItems] = useState<Customer[]>([]);  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('alle');

  // Eén keer bij het openen vastgelegd (useState: geen onzuivere aanroep
  // tijdens het renderen).
  const [todayMs] = useState(() => Date.now());

  const load = useCallback(
    async () => {
      setError(null);
      const { data, error: fetchError } = await listCustomers();
      if (fetchError) {
        setError(fetchError);
        setItems([]);
      } else {
        setItems(data);
      }
    },
    [],
  );

  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn drie
   * verschillende dingen. Alleen de laatste zet `refreshing`; terugkeren op
   * dit scherm ververst dus stil, zonder dat de lijst omlaag schuift.
   */
  const { loading, refreshing, onRefresh, opnieuw } = useLaden(load, { onFout: setError });


  const counts = useMemo(() => {
    let actief = 0;
    items.forEach((c) => {
      const iso = lastTouchedISO(c);
      if (!iso) return;
      if (todayMs - new Date(iso).getTime() < 30 * 24 * 60 * 60 * 1000) actief++;
    });
    return { all: items.length, actief };
  }, [items, todayMs]);

  const chips: ChipDef<FilterKey>[] = useMemo(
    () => [
      { id: 'alle', label: 'Alle', count: counts.all },
      { id: 'actief', label: 'Actief', count: counts.actief },
      { id: 'recent', label: 'Recent' },
      { id: 'zakelijk', label: 'Zakelijk' },
      { id: 'particulier', label: 'Particulier' },
    ],
    [counts],
  );

  const filtered = useMemo(
    () => items.filter((c) => matchesFilter(c, filter, todayMs) && matchesQuery(c, query)),
    [items, filter, query, todayMs],
  );

  // Favorites strip: most recently touched 4
  const favorites = useMemo(() => {
    return [...items]
      .sort((a, b) => {
        const aMs = new Date(lastTouchedISO(a) ?? 0).getTime();
        const bMs = new Date(lastTouchedISO(b) ?? 0).getTime();
        return bMs - aMs;
      })
      .slice(0, 4);
  }, [items]);

  // A-Z grouping
  const grouped = useMemo(() => {
    const map: Record<string, Customer[]> = {};
    filtered.forEach((c) => {
      const letter = (c.name?.charAt(0) ?? '#').toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      (map[key] = map[key] ?? []).push(c);
    });
    return map;
  }, [filtered]);

  const letters = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const onCall = (c: Customer) => {
    if (!callPhone(c.phone)) {
      Dialog.alert('Geen telefoonnummer', 'Voor deze klant is geen nummer bekend.');
    }
  };
  const onNavigate = (c: Customer) => {
    const addr = [c.address, c.postcode, c.city].filter(Boolean).join(', ');
    if (!openMaps(addr)) {
      Dialog.alert('Geen adres', 'Voor deze klant is geen adres bekend.');
    }
  };
  const onOpenCustomer = (c: Customer) => {
    router.push(`/customers/${c.id}`);
  };
  const onCreate = () => router.push('/customers/new');

  // Stale-while-refresh: only take over the screen when there is no data yet.
  if (loading && items.length === 0) return <LoadingScreen label="Klanten laden..." />;
  if (error && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ErrorState
          title="Klanten niet geladen"
          message="Controleer je verbinding en probeer opnieuw."
          onRetry={opnieuw}
        />
      </View>
    );
  }

  const totalCount = items.length;
  const openWoCount = items.filter((c) => isZakelijk(c)).length; // placeholder count

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          /* Aanmaken staat rechtsboven, zoals in het ontwerp — niet meer als
             zwevende knop over de onderste rijen heen. */
          <AppTopBar
            title="Klanten"
            subtitle={`${totalCount} klanten · ${openWoCount} zakelijk · ${counts.actief} actief`}
            rightAction={
              canCreate ? (
                <HeaderIconButton icon={Plus} label="Nieuwe klant" size={42} onPress={onCreate} />
              ) : undefined
            }
            showProfileButton
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <AppSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Zoek op naam, plaats of nummer…"
          />
        </View>

        {/* Filter chips */}
        <View style={{ paddingTop: 14 }}>
          <AppFilterChips chips={chips} active={filter} onChange={setFilter} />
        </View>

        {/* Favorites strip (only when no query) */}
        {!query && favorites.length > 0 ? (
          <>
            <Text style={styles.recentKop}>Recent</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentRij}
            >
              {favorites.map((c) => (
                <RecentPil
                  key={c.id}
                  styles={styles}
                  customer={c}
                  onPress={() => onOpenCustomer(c)}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        {/* A-Z-lijst */}
        {filtered.length === 0 ? (
          <View style={{ paddingHorizontal: 16 }}>
            <AppCard padding={28} style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Search size={28} color={ds.green} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>Geen klanten gevonden</Text>
              <Text style={styles.emptyBody}>
                {items.length === 0
                  ? 'Er zijn nog geen klanten in dit bedrijf.'
                  : 'Geen klanten die passen bij je zoekopdracht of filter.'}
              </Text>
              <Pressable
                onPress={() => {
                  setQuery('');
                  setFilter('alle');
                }}
                style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.emptyBtnText}>Filters wissen</Text>
              </Pressable>
            </AppCard>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, paddingTop: 0 }}>
            {letters.map((L) => {
              const list = grouped[L] ?? [];
              return (
                <View key={L}>
                  <Text style={styles.letterHeader}>{L}</Text>
                  <View style={[styles.group, dsShadow]}>
                    {list.map((c, i) => (
                      <CustomerRow
                        key={c.id}
                        styles={styles}
                        t={t}
                        c={c}
                        first={i === 0}
                        onPress={() => onOpenCustomer(c)}
                        onCall={() => onCall(c)}
                        onNavigate={() => onNavigate(c)}
                      />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </AppScreen>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Een recent geopende klant als pil, zoals in het ontwerp: avatar plus naam,
 * horizontaal scrollend. Dit is een snelkoppeling, geen kaart met cijfers —
 * die staan op het klantdetail.
 */
function RecentPil({
  styles,
  customer,
  onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  customer: Customer;
  onPress: () => void;
}) {
  const { colorMode } = useTheme();
  const av = avatarKleuren(customer.name, colorMode === 'dark');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.recentPil, pressed && { opacity: 0.9 }]}
    >
      <View style={[styles.recentAvatar, { backgroundColor: av.bg }]}>
        <Text style={[styles.recentAvatarText, { color: av.fg }]}>{initialen(customer.name)}</Text>
      </View>
      <Text style={styles.recentNaam} numberOfLines={1}>
        {customer.name ?? '—'}
      </Text>
    </Pressable>
  );
}

function CustomerRow({
  styles,
  t,
  c,
  first,
  onPress,
  onCall,
  onNavigate,
}: {
  styles: ReturnType<typeof makeStyles>;
  t: ThemeColors;
  c: Customer;
  first: boolean;
  onPress: () => void;
  onCall: () => void;
  onNavigate: () => void;
}) {
  const { colorMode } = useTheme();
  const av = avatarKleuren(c.name, colorMode === 'dark');
  // Plaats en laatste contact; het onderscheid zakelijk/particulier zit al in
  // de filterchips, en die derde waarde duwde het adres uit beeld.
  const cityLine = [c.address, c.city].filter(Boolean).join(', ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && styles.rowBorder, pressed && { opacity: 0.95 }]}
    >
      <View style={[styles.rowAvatar, { backgroundColor: av.bg }]}>
        <Text style={[styles.rowAvatarText, { color: av.fg }]}>{initialen(c.name)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {c.name ?? '—'}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[cityLine || c.city, activityLabel(c)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={styles.rowActions}>
        {c.phone ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onCall();
            }}
            hitSlop={6}
            style={({ pressed }) => [styles.iconAction, pressed && { opacity: 0.7 }]}
          >
            <Phone size={15} color={t.ink} strokeWidth={2} />
          </Pressable>
        ) : null}
        {c.address || c.city ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onNavigate();
            }}
            hitSlop={6}
            style={({ pressed }) => [styles.iconAction, pressed && { opacity: 0.7 }]}
          >
            <NavigationIcon size={15} color={t.ink} strokeWidth={2} />
          </Pressable>
        ) : null}
        <ChevronRight size={16} color={t.muted2} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
  // Recent geopend
  recentKop: {
    paddingHorizontal: 18,
    paddingTop: 14,
    fontSize: 14,
    fontWeight: '700',
    color: t.ink,
  },
  recentRij: { gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  recentPil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 22,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
  },
  recentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentAvatarText: { fontSize: 11, fontWeight: '700' },
  recentNaam: { fontSize: 13, fontWeight: '600', color: t.ink },

  // List
  letterHeader: {
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: t.muted2,
    letterSpacing: 0.72,
  },
  group: {
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
    borderRadius: ds.rMd,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: t.line,
  },
  rowAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarText: {
    fontSize: 13,
    fontWeight: '800',
  },
  rowName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: t.ink,
    letterSpacing: -0.2,
  },
  rowSub: {
    fontSize: 12,
    color: t.muted,
    marginTop: 1,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconAction: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: t.bg,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: ds.green,
  },
  emptyBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: t.greenInk,
  },
});
