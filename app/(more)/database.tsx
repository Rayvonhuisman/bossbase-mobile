import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database, MoreHorizontal, SlidersHorizontal, X } from 'lucide-react-native';
import {
  AppFilterChips,
  AppListGroup,
  AppListItem,
  AppScreen,
  AppSearchBar,
  AppTopBar,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  FormSheet,
  LoadingScreen,
  NoticeBanner,
  PermissionGate,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import { Dialog } from '@/lib/dialog';
import { useLaden, type LaadBron } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { formatDateNL, formatEUR } from '@/lib/format';
import { deelCsv, CSV_ALS_BESTAND } from '@/lib/csvExport';
import { openDashboard } from '@/lib/dashboardLink';
import { ds, radius, spacing, type ThemeColors } from '@/theme';
import {
  LEGE_FILTERS,
  aantalActieveFilters,
  exportRegels,
  filterKlanten,
  indexeerPerKlant,
  isoDatum,
  laatsteMail,
  laatsteProject,
  naarCsv,
  pagina,
  projectStatusLabel,
  segmentSleutel,
  sumBetaald,
  type DatabaseData,
  type DbFilters,
  type DbKlant,
  type SnelTab,
} from '@/lib/databaseFilters';
import { laadDatabase, logExport, type DatabaseExtra } from '@/services/databaseService';
import { deleteCustomer } from '@/services/customerService';
import { useSave } from '@/lib/useSave';
import { FilterPaneel } from '@/components/database/FilterPaneel';
import { FotoOverzicht } from '@/components/database/FotoOverzicht';

/**
 * Database — zoals `DatabasePage.jsx` ("Database & Export") in het dashboard:
 * een gefilterde klantenlijst (alle filters van het dashboard, zoeken op naam,
 * snel-tab "Lopend project", 50 per pagina), selectie per pagina, export naar
 * CSV, opgeslagen segmenten en per rij klant openen of verwijderen.
 *
 * Daarnaast het overzicht van foto's & bestanden (werkbonfoto's), dat eerder
 * het losse scherm `/files` was.
 *
 * Bewust niet in de app (wel op het dashboard): e-mail naar de selectie
 * versturen, export als Excel en het downloaden van offertes/facturen als
 * PDF/ZIP. De pagina zegt dat en verwijst naar het dashboard.
 *
 * Recht `database` (UI-gate, geen RLS); verwijderen van een klant vraagt
 * daarnaast `klanten_verwijderen` (RLS).
 */

type Weergave = 'klanten' | 'fotos';
type Segment = { name: string; filters: DbFilters };

export default function DatabaseScreen() {
  return (
    <PermissionGate permission="database" label="Database">
      <DatabaseInhoud />
    </PermissionGate>
  );
}

function DatabaseInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { mag } = usePermissions();
  const { user } = useAuth();
  // Per gebruiker, zoals het dashboard: een gedeeld toestel toont de volgende
  // gebruiker niet de segmenten van de vorige.
  const sleutel = segmentSleutel(user?.id);
  const params = useLocalSearchParams<{ weergave?: string; tab?: string }>();

  const weergave: Weergave = params.weergave === 'fotos' ? 'fotos' : 'klanten';
  const snelTab: SnelTab = params.tab === 'lopend_project' ? 'lopend_project' : 'alle';

  const [data, setData] = useState<DatabaseData | null>(null);
  const [extra, setExtra] = useState<DatabaseExtra | null>(null);
  const [fouten, setFouten] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ververs, setVervers] = useState(0);

  const [zoek, setZoek] = useState('');
  const [filters, setFilters] = useState<DbFilters>(LEGE_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [paginaNr, setPaginaNr] = useState(1);
  const [geselecteerd, setGeselecteerd] = useState<Set<string>>(new Set());
  const [segmenten, setSegmenten] = useState<Segment[]>([]);
  const [segmentNaam, setSegmentNaam] = useState<string | null>(null);
  const { save, saving } = useSave<unknown>();

  const magVerwijderen = mag('klanten', 'verwijderen');

  const load = useCallback(async (bron: LaadBron) => {
    setError(null);
    if (bron === 'pull') setVervers((v) => v + 1);
    const res = await laadDatabase();
    if (res.error) {
      setError(res.error);
      return;
    }
    setData(res.data);
    setExtra(res.extra);
    setFouten(res.fouten);
  }, []);

  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });

  // Segmenten: lokaal per toestel én per gebruiker, zoals het dashboard ze per
  // browser en profiel bewaart.
  useEffect(() => {
    let actief = true;
    AsyncStorage.getItem(sleutel)
      .then((v) => {
        if (!actief) return;
        const lijst = v ? (JSON.parse(v) as Segment[]) : [];
        setSegmenten(
          Array.isArray(lijst) ? lijst.map((x) => ({ ...x, filters: { ...LEGE_FILTERS, ...x.filters } })) : [],
        );
      })
      .catch(() => {});
    return () => {
      actief = false;
    };
  }, [sleutel]);

  const bewaarSegmenten = (lijst: Segment[]) => {
    setSegmenten(lijst);
    AsyncStorage.setItem(sleutel, JSON.stringify(lijst)).catch(() => {});
  };

  const perKlant = useMemo(() => (data ? indexeerPerKlant(data) : new Map()), [data]);
  const gefilterd = useMemo(
    () => (data ? filterKlanten(data, perKlant, filters, { zoek, tab: snelTab }) : []),
    [data, perKlant, filters, zoek, snelTab],
  );
  const pag = pagina(gefilterd, paginaNr);
  const actieveFilters = aantalActieveFilters(filters);
  const filtersActief = actieveFilters > 0 || zoek.trim() !== '' || snelTab !== 'alle';

  const zet = useCallback(<K extends keyof DbFilters>(k: K, v: DbFilters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPaginaNr(1);
  }, []);

  const wisFilters = () => {
    setFilters(LEGE_FILTERS);
    setZoek('');
    setPaginaNr(1);
    router.setParams({ tab: 'alle' });
  };

  const allesOpPagina = pag.items.length > 0 && pag.items.every((c) => geselecteerd.has(c.id));
  const wisselPagina = () =>
    setGeselecteerd((s) => {
      const n = new Set(s);
      if (allesOpPagina) pag.items.forEach((c) => n.delete(c.id));
      else pag.items.forEach((c) => n.add(c.id));
      return n;
    });
  const wisselEen = (id: string) =>
    setGeselecteerd((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exporteerCsv = async () => {
    if (!data) return;
    const klanten = data.klanten.filter((c) => geselecteerd.has(c.id));
    if (klanten.length === 0) return;
    const csv = naarCsv(exportRegels(klanten, perKlant));
    const gelukt = await deelCsv(`BossBase-export-${isoDatum(new Date())}.csv`, csv);
    if (gelukt) {
      void logExport(
        klanten.map((c) => c.id),
        'CSV',
      );
    }
  };

  const klantActies = (c: DbKlant) => {
    const knoppen: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[] = [
      { text: 'Klantgegevens openen', onPress: () => router.push(`/customers/${c.id}`) },
    ];
    if (magVerwijderen) {
      knoppen.push({
        text: 'Klant verwijderen',
        style: 'destructive',
        onPress: () =>
          Dialog.alert(
            'Klant verwijderen?',
            `Weet je zeker dat je ${c.name} wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`,
            [
              { text: 'Annuleren', style: 'cancel' },
              {
                text: 'Verwijderen',
                style: 'destructive',
                onPress: () =>
                  save(() => deleteCustomer(c.id), {
                    onSuccess: async () => {
                      setGeselecteerd((s) => {
                        const n = new Set(s);
                        n.delete(c.id);
                        return n;
                      });
                      await herlaad();
                    },
                    succesMelding: `${c.name} verwijderd`,
                  }),
              },
            ],
          ),
      });
    }
    knoppen.push({ text: 'Annuleren', style: 'cancel' });
    Dialog.alert(c.name, undefined, knoppen);
  };

  const segmentOpslaan = () => {
    const naam = (segmentNaam ?? '').trim();
    if (!naam) return;
    bewaarSegmenten([...segmenten.filter((x) => x.name !== naam), { name: naam, filters }]);
    setSegmentNaam(null);
  };

  if (loading) return <LoadingScreen label="Database laden..." />;

  const kop = (
    <AppTopBar
      variant="detail"
      title="Database"
      subtitle={
        weergave === 'fotos'
          ? "Foto's & bestanden"
          : data
            ? filtersActief
              ? `${gefilterd.length} van ${data.klanten.length} klanten`
              : `${data.klanten.length} klanten`
            : undefined
      }
      onBack={() => terugOfNaar(router, '/menu')}
    />
  );

  if (error && weergave === 'klanten') {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen scroll={false} header={kop}>
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen header={kop} refreshing={refreshing} onRefresh={onRefresh}>
        <View style={{ paddingTop: 4 }}>
          <AppFilterChips
            chips={[
              { id: 'klanten', label: 'Klanten' },
              { id: 'fotos', label: "Foto's & bestanden" },
            ]}
            active={weergave}
            onChange={(id) => router.setParams({ weergave: id })}
          />
        </View>

        {weergave === 'fotos' ? (
          <FotoOverzicht key={ververs} />
        ) : (
          <>
            <View style={styles.zoekRij}>
              <AppSearchBar
                value={zoek}
                onChange={(v) => {
                  setZoek(v);
                  setPaginaNr(1);
                }}
                placeholder="Zoek klant…"
              />
            </View>
            <AppFilterChips
              chips={[
                { id: 'alle', label: 'Alle' },
                { id: 'lopend_project', label: 'Lopend project' },
              ]}
              active={snelTab}
              onChange={(id) => {
                setPaginaNr(1);
                router.setParams({ tab: id });
              }}
            />
            <View style={styles.knopRij}>
              <Pressable
                onPress={() => setFilterOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Filters"
                style={({ pressed }) => [styles.filterKnop, pressed && { opacity: 0.85 }]}
              >
                <SlidersHorizontal size={16} color={t.ink} />
                <Text style={styles.filterTekst}>
                  Filters{actieveFilters > 0 ? ` (${actieveFilters})` : ''}
                </Text>
              </Pressable>
              {filtersActief ? (
                <Pressable
                  onPress={wisFilters}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.filterKnop, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.filterTekst}>Wis filters</Text>
                </Pressable>
              ) : null}
            </View>

            {segmenten.length > 0 ? (
              <View style={styles.segmentRij}>
                {segmenten.map((sg) => (
                  <View key={sg.name} style={styles.segment}>
                    <Pressable
                      onPress={() => {
                        setFilters({ ...LEGE_FILTERS, ...sg.filters });
                        setPaginaNr(1);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Segment ${sg.name} toepassen`}
                      style={styles.segmentNaam}
                    >
                      <Text style={styles.segmentTekst}>{sg.name}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => bewaarSegmenten(segmenten.filter((x) => x.name !== sg.name))}
                      accessibilityRole="button"
                      accessibilityLabel={`Segment ${sg.name} verwijderen`}
                      style={styles.segmentWeg}
                    >
                      <X size={14} color={t.muted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {fouten.map((f) => (
              <View key={f} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
                <NoticeBanner message={f} />
              </View>
            ))}

            {data && data.klanten.length > 0 ? (
              <View style={styles.selectieRij}>
                <Pressable
                  onPress={wisselPagina}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allesOpPagina }}
                  style={styles.vinkKnop}
                >
                  <View style={[styles.vak, allesOpPagina && styles.vakAan]}>
                    {allesOpPagina ? <Text style={styles.vink}>✓</Text> : null}
                  </View>
                  <Text style={styles.selectieTekst}>
                    {geselecteerd.size > 0 ? `${geselecteerd.size} geselecteerd` : 'Selecteer deze pagina'}
                  </Text>
                </Pressable>
                {geselecteerd.size > 0 ? (
                  <Pressable onPress={() => setGeselecteerd(new Set())} accessibilityRole="button" style={styles.linkKnop}>
                    <Text style={styles.link}>Wis selectie</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {gefilterd.length === 0 ? (
              <EmptyState
                icon={<Database size={40} color={ds.green} strokeWidth={1.6} />}
                title={filtersActief ? 'Geen klanten gevonden met deze filters.' : 'Geen klanten.'}
              />
            ) : (
              <AppListGroup>
                {pag.items.map((c, i) => {
                  const rel = perKlant.get(c.id);
                  const lp = rel ? laatsteProject(rel) : null;
                  const lm = rel ? laatsteMail(rel) : null;
                  const delen = [
                    c.city,
                    lp ? `${lp.name} (${projectStatusLabel(lp.status)})` : null,
                    lm?.sent_at ? `Mail ${formatDateNL(lm.sent_at)}` : null,
                    `${rel?.projecten.length ?? 0} projecten`,
                    `Betaald ${formatEUR(sumBetaald(rel?.facturen ?? []))}`,
                  ].filter(Boolean);
                  const aan = geselecteerd.has(c.id);
                  return (
                    <AppListItem
                      key={c.id}
                      first={i === 0}
                      leading={
                        <Pressable
                          onPress={() => wisselEen(c.id)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: aan }}
                          accessibilityLabel={`${c.name} selecteren`}
                          style={styles.rijVink}
                        >
                          <View style={[styles.vak, aan && styles.vakAan]}>
                            {aan ? <Text style={styles.vink}>✓</Text> : null}
                          </View>
                        </Pressable>
                      }
                      title={c.name || 'Naamloos'}
                      subtitle={delen.join(' · ')}
                      trailing={
                        <Pressable
                          onPress={() => klantActies(c)}
                          accessibilityRole="button"
                          accessibilityLabel={`Acties voor ${c.name}`}
                          style={styles.rijActie}
                          disabled={saving}
                        >
                          <MoreHorizontal size={18} color={t.muted} />
                        </Pressable>
                      }
                      onPress={() => router.push(`/customers/${c.id}`)}
                    />
                  );
                })}
              </AppListGroup>
            )}

            {pag.totaal > 1 ? (
              <View style={styles.pager}>
                <Button label="‹ Vorige" variant="secondary" disabled={pag.huidig <= 1} onPress={() => setPaginaNr(pag.huidig - 1)} />
                <Text style={styles.pagerTekst}>
                  Pagina {pag.huidig} van {pag.totaal}
                </Text>
                <Button
                  label="Volgende ›"
                  variant="secondary"
                  disabled={pag.huidig >= pag.totaal}
                  onPress={() => setPaginaNr(pag.huidig + 1)}
                />
              </View>
            ) : null}

            {geselecteerd.size > 0 ? (
              <View style={styles.bulk}>
                <Text style={styles.bulkTitel}>{geselecteerd.size} klanten geselecteerd</Text>
                <View style={styles.knopRij2}>
                  <Button label={CSV_ALS_BESTAND ? 'Exporteren als CSV' : 'CSV delen'} onPress={exporteerCsv} />
                  <Button label="Segment opslaan" variant="secondary" onPress={() => setSegmentNaam('')} />
                </View>
              </View>
            ) : null}

            <Text style={styles.voetnoot}>
              E-mail naar je selectie versturen, exporteren als Excel en offertes of facturen als PDF/ZIP
              downloaden doe je op het dashboard.
            </Text>
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
              <Button label="Database openen op het dashboard" variant="ghost" onPress={() => openDashboard('database')} />
            </View>
          </>
        )}
      </AppScreen>

      <FormSheet
        visible={filterOpen}
        title="Filters"
        subtitle={`${gefilterd.length} klanten`}
        submitLabel={`Toon ${gefilterd.length} klanten`}
        onSubmit={() => setFilterOpen(false)}
        onClose={() => setFilterOpen(false)}
        destructive={actieveFilters > 0 ? { label: 'Wis filters', onPress: () => setFilters(LEGE_FILTERS) } : undefined}
      >
        {extra ? <FilterPaneel filters={filters} zet={zet} extra={extra} /> : null}
      </FormSheet>

      <FormSheet
        visible={segmentNaam !== null}
        title="Segment opslaan"
        subtitle="De huidige filters, alleen op dit toestel bewaard"
        submitDisabled={!segmentNaam?.trim()}
        onSubmit={segmentOpslaan}
        onClose={() => setSegmentNaam(null)}
      >
        <FormField
          label="Naam"
          value={segmentNaam ?? ''}
          onChangeText={setSegmentNaam}
          placeholder="Bijv. Klanten zonder project"
          autoFocus
        />
      </FormSheet>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    zoekRij: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
    knopRij: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    knopRij2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    filterKnop: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.lineStrong,
      backgroundColor: t.card,
    },
    filterTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink },
    segmentRij: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    segment: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.pill,
      backgroundColor: t.bgAlt,
      borderWidth: 1,
      borderColor: t.line,
    },
    segmentNaam: { minHeight: 44, justifyContent: 'center', paddingLeft: 14, paddingRight: 4 },
    segmentTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    segmentWeg: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
    selectieRij: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    vinkKnop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
    selectieTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    linkKnop: { minHeight: 44, justifyContent: 'center' },
    link: { fontSize: 13.5, fontWeight: '600', color: t.green700 },
    rijVink: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
    rijActie: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    vak: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: t.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vakAan: { backgroundColor: t.green, borderColor: t.green },
    vink: { fontSize: 13, fontWeight: '800', color: t.greenInk },
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    pagerTekst: { fontSize: 13, color: t.muted },
    bulk: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      padding: spacing.md,
      gap: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.green,
    },
    bulkTitel: { fontSize: 14, fontWeight: '700', color: t.ink },
    voetnoot: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
    },
  });
