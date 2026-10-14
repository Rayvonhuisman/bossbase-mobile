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
  Truck,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { listCustomers, listFactuurTotaalRijen } from '@/services/customerService';
import {
  isActief,
  leverancierNaam,
  listLeverancierKostenTotalen,
  listLeveranciersVolledig,
  type Leverancier,
} from '@/services/leverancierService';
import {
  isZakelijkeKlant,
  klantPastBijZoek,
  leverancierPastBijZoek,
  totalenPerKlant,
  type KlantTotalen,
  type LeverancierKosten,
} from '@/lib/relaties';
import { formatEUR } from '@/lib/format';
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

/** Relaties = klanten én leveranciers, net als de groep "Relaties" in het dashboard. */
type Soort = 'klanten' | 'leveranciers';

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
// Opgeslagen klanttype (dashboard 1-10), anders afgeleid van het KvK-nummer.
function isZakelijk(c: Customer): boolean {
  return isZakelijkeKlant(c);
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
  const params = useLocalSearchParams<{ soort?: string }>();
  const { can, readonly, planStatus, loaded: rechtenGeladen } = usePermissions();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  /**
   * Klanten en leveranciers op één pagina, met de keuze bovenin. De keuze
   * staat in de URL (`?soort=leveranciers`), zodat terug van een
   * leverancierskaart weer op de leverancierslijst uitkomt.
   */
  const soort: Soort = params.soort === 'leveranciers' ? 'leveranciers' : 'klanten';
  const kiesSoort = (s: Soort) => router.setParams({ soort: s === 'klanten' ? undefined : s });

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
  /**
   * Een leverancier toevoegen: `leveranciers_insert` eist het eigen bedrijf
   * plus het recht `klanten_bewerken` of `kosten`, en `readonly_leveranciers`
   * een lopend abonnement (live database, 13-10-2026). Zonder dat recht zou de
   * knop alleen tot een weigering leiden.
   */
  const magLeverancierMaken =
    rechtenGeladen && !readonly && (can('klanten_bewerken') || can('kosten'));
  /** Kostentotalen per leverancier alleen met het kostenrecht: zonder dat geeft
   * RLS op job_costs hooguit de werkbonkosten terug, en dan klopt het totaal niet. */
  const toonKosten = rechtenGeladen && can('kosten');
  const toonBedragen = rechtenGeladen && can('facturen');

  const [items, setItems] = useState<Customer[]>([]);
  const [leveranciers, setLeveranciers] = useState<Leverancier[]>([]);
  const [kosten, setKosten] = useState<Record<string, LeverancierKosten>>({});
  const [totalen, setTotalen] = useState<Map<string, KlantTotalen>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [levFout, setLevFout] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('alle');

  // Eén keer bij het openen vastgelegd (useState: geen onzuivere aanroep
  // tijdens het renderen).
  const [todayMs] = useState(() => Date.now());

  const load = useCallback(
    async () => {
      setError(null);
      const [klantRes, levRes, kostRes, totaalRes] = await Promise.all([
        listCustomers(),
        listLeveranciersVolledig(),
        toonKosten
          ? listLeverancierKostenTotalen()
          : Promise.resolve({} as Record<string, LeverancierKosten>),
        toonBedragen ? listFactuurTotaalRijen() : Promise.resolve({ data: [], error: null }),
      ]);
      if (klantRes.error) {
        setError(klantRes.error);
        setItems([]);
      } else {
        setItems(klantRes.data);
      }
      // Leveranciers zijn een eigen lijst: mislukt die, dan blijven de klanten staan.
      setLevFout(levRes.error);
      if (!levRes.error) setLeveranciers(levRes.data);
      setKosten(kostRes);
      if (!totaalRes.error) setTotalen(totalenPerKlant(totaalRes.data));
    },
    [toonBedragen, toonKosten],
  );

  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn drie
   * verschillende dingen. Alleen de laatste zet `refreshing`; terugkeren op
   * dit scherm ververst dus stil, zonder dat de lijst omlaag schuift.
   */
  const { loading, refreshing, onRefresh, opnieuw } = useLaden(load, {
    onFout: setError,
    klaarOmTeLaden: rechtenGeladen,
  });

  const counts = useMemo(() => {
    let actief = 0;
    let zakelijk = 0;
    items.forEach((c) => {
      if (isZakelijk(c)) zakelijk++;
      const iso = lastTouchedISO(c);
      if (!iso) return;
      if (todayMs - new Date(iso).getTime() < 30 * 24 * 60 * 60 * 1000) actief++;
    });
    return { all: items.length, actief, zakelijk };
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
    () => items.filter((c) => matchesFilter(c, filter, todayMs) && klantPastBijZoek(c, query)),
    [items, filter, query, todayMs],
  );

  const gefilterdeLeveranciers = useMemo(
    () => leveranciers.filter((l) => leverancierPastBijZoek(l, query)),
    [leveranciers, query],
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

  const onCall = (telefoon: string | null | undefined) => {
    if (!callPhone(telefoon)) {
      Dialog.alert('Geen telefoonnummer', 'Voor deze relatie is geen nummer bekend.');
    }
  };
  const onNavigate = (delen: (string | null | undefined)[]) => {
    const addr = delen.filter(Boolean).join(', ');
    if (!openMaps(addr)) {
      Dialog.alert('Geen adres', 'Voor deze relatie is geen adres bekend.');
    }
  };
  const onOpenCustomer = (c: Customer) => {
    router.push(`/customers/${c.id}`);
  };
  const onOpenLeverancier = (l: Leverancier) => {
    router.push(`/customers/leverancier/${l.id}`);
  };
  const onCreate = () =>
    router.push(soort === 'klanten' ? '/customers/new' : '/customers/leverancier/new');

  // Stale-while-refresh: only take over the screen when there is no data yet.
  if (loading && items.length === 0 && leveranciers.length === 0) {
    return <LoadingScreen label="Relaties laden..." />;
  }
  if (error && items.length === 0 && leveranciers.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ErrorState
          title="Relaties niet geladen"
          message="Controleer je verbinding en probeer opnieuw."
          onRetry={opnieuw}
        />
      </View>
    );
  }

  const aantalInactief = leveranciers.filter((l) => !isActief(l)).length;
  const subtitle =
    soort === 'klanten'
      ? `${items.length} ${items.length === 1 ? 'klant' : 'klanten'} · ${counts.zakelijk} zakelijk · ${counts.actief} actief`
      : `${leveranciers.length} ${leveranciers.length === 1 ? 'leverancier' : 'leveranciers'}` +
        (aantalInactief ? ` · ${aantalInactief} inactief` : '');
  const magMaken = soort === 'klanten' ? canCreate : magLeverancierMaken;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          /* Aanmaken staat rechtsboven, zoals in het ontwerp — niet meer als
             zwevende knop over de onderste rijen heen. */
          <AppTopBar
            title="Relaties"
            subtitle={subtitle}
            rightAction={
              magMaken ? (
                <HeaderIconButton
                  icon={Plus}
                  label={soort === 'klanten' ? 'Nieuwe klant' : 'Nieuwe leverancier'}
                  size={42}
                  onPress={onCreate}
                />
              ) : undefined
            }
            showProfileButton
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* Klanten / Leveranciers */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <View style={styles.segment} accessibilityRole="tablist">
            {(
              [
                { id: 'klanten', label: 'Klanten', n: items.length },
                { id: 'leveranciers', label: 'Leveranciers', n: leveranciers.length },
              ] as const
            ).map((s) => {
              const aan = soort === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => kiesSoort(s.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: aan }}
                  aria-selected={aan}
                  style={({ pressed }) => [
                    styles.segmentKnop,
                    aan && styles.segmentKnopAan,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.segmentTekst, aan && styles.segmentTekstAan]}>
                    {s.label} · {s.n}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <AppSearchBar
            value={query}
            onChange={setQuery}
            placeholder={
              soort === 'klanten'
                ? 'Zoek op naam, plaats of nummer…'
                : 'Zoek op naam, plaats of e-mail…'
            }
          />
        </View>

        {soort === 'leveranciers' ? (
          <LeverancierLijst
            styles={styles}
            t={t}
            leveranciers={gefilterdeLeveranciers}
            totaal={leveranciers.length}
            fout={levFout}
            kosten={kosten}
            query={query}
            onWis={() => setQuery('')}
            onOpen={onOpenLeverancier}
            onCall={(l) => onCall(l.telefoon || l.mobiel)}
          />
        ) : (
          <>
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
                      ? 'Maak je eerste klant aan of pas je zoekopdracht aan.'
                      : 'Geen klanten die passen bij je zoekopdracht of filter.'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
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
                            totalen={toonBedragen ? totalen.get(c.id) : undefined}
                            first={i === 0}
                            onPress={() => onOpenCustomer(c)}
                            onCall={() => onCall(c.phone)}
                            onNavigate={() => onNavigate([c.address, c.postcode, c.city])}
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </AppScreen>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Leveranciers
// ---------------------------------------------------------------------------

function LeverancierLijst({
  styles,
  t,
  leveranciers,
  totaal,
  fout,
  kosten,
  query,
  onWis,
  onOpen,
  onCall,
}: {
  styles: ReturnType<typeof makeStyles>;
  t: ThemeColors;
  leveranciers: Leverancier[];
  totaal: number;
  fout: string | null;
  kosten: Record<string, LeverancierKosten>;
  query: string;
  onWis: () => void;
  onOpen: (l: Leverancier) => void;
  onCall: (l: Leverancier) => void;
}) {
  const { colorMode } = useTheme();
  if (fout && totaal === 0) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <AppCard padding={20} style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Leveranciers niet geladen</Text>
          <Text style={styles.emptyBody}>{fout}</Text>
        </AppCard>
      </View>
    );
  }
  if (leveranciers.length === 0) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <AppCard padding={28} style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Truck size={28} color={ds.green} strokeWidth={1.8} />
          </View>
          <Text style={styles.emptyTitle}>Geen leveranciers gevonden</Text>
          <Text style={styles.emptyBody}>
            {totaal === 0
              ? 'Maak je eerste leverancier aan — dan landen je kosten in de boekhouding onder de juiste relatie.'
              : 'Pas je zoekopdracht aan.'}
          </Text>
          {query ? (
            <Pressable
              accessibilityRole="button"
              onPress={onWis}
              style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.emptyBtnText}>Zoekopdracht wissen</Text>
            </Pressable>
          ) : null}
        </AppCard>
      </View>
    );
  }
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
      <View style={[styles.group, dsShadow]}>
        {leveranciers.map((l, i) => {
          const naam = leverancierNaam(l);
          const av = avatarKleuren(naam, colorMode === 'dark');
          const actief = isActief(l);
          const k = kosten[l.id];
          const sub = [
            l.contactpersoon || (actief ? 'Leverancier' : null),
            l.city,
            k && k.bedrag ? `Kosten ${formatEUR(k.bedrag)}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          const tel = l.telefoon || l.mobiel;
          return (
            <Pressable
              key={l.id}
              onPress={() => onOpen(l)}
              accessibilityRole="button"
              accessibilityLabel={`${naam}${actief ? '' : ', inactief'}`}
              style={({ pressed }) => [
                styles.row,
                i > 0 && styles.rowBorder,
                !actief && { opacity: 0.6 },
                pressed && { opacity: 0.95 },
              ]}
            >
              <View style={[styles.rowAvatar, { backgroundColor: av.bg }]}>
                <Text style={[styles.rowAvatarText, { color: av.fg }]}>{initialen(naam)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.rowName, { flexShrink: 1 }]} numberOfLines={1}>
                    {naam}
                  </Text>
                  {!actief ? <Text style={styles.inactiefLabel}>Inactief</Text> : null}
                </View>
                {sub ? (
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {sub}
                  </Text>
                ) : null}
              </View>
              <View style={styles.rowActions}>
                {tel ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={(e) => {
                      e.stopPropagation();
                      onCall(l);
                    }}
                    hitSlop={6}
                    accessibilityLabel={`${naam} bellen`}
                    style={({ pressed }) => [styles.iconAction, pressed && { opacity: 0.7 }]}
                  >
                    <Phone size={15} color={t.ink} strokeWidth={2} />
                  </Pressable>
                ) : null}
                <ChevronRight size={16} color={t.muted2} strokeWidth={2} />
              </View>
            </Pressable>
          );
        })}
      </View>
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
  totalen,
  first,
  onPress,
  onCall,
  onNavigate,
}: {
  styles: ReturnType<typeof makeStyles>;
  t: ThemeColors;
  c: Customer;
  /** Alleen met het recht `facturen`; anders weggelaten. */
  totalen?: KlantTotalen;
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
      accessibilityRole="button"
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
        {totalen && totalen.gefactureerd ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            Gefactureerd {formatEUR(totalen.gefactureerd)}
            {' · '}
            <Text style={totalen.betaald > 0 ? styles.betaald : undefined}>
              Betaald {formatEUR(totalen.betaald)}
            </Text>
          </Text>
        ) : null}
      </View>
      <View style={styles.rowActions}>
        {c.phone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${c.name ?? 'Klant'} bellen`}
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
            accessibilityRole="button"
            accessibilityLabel={`Route naar ${c.name ?? 'klant'}`}
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
  // Klanten / Leveranciers
  segment: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: 14,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.line,
  },
  segmentKnop: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  segmentKnopAan: { backgroundColor: t.ink },
  segmentTekst: { fontSize: 14, fontWeight: '700', color: t.muted },
  segmentTekstAan: { color: t.bg },
  inactiefLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: t.muted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: t.bg,
    overflow: 'hidden',
  },
  betaald: { color: t.green700, fontWeight: '700' },

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
