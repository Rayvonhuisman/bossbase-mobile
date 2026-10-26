import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Check, Eye, EyeOff, FolderKanban, Plus, SlidersHorizontal } from 'lucide-react-native';
import {
  AppFilterChips,
  AppScreen,
  AppSearchBar,
  AppTopBar,
  Button,
  EmptyState,
  ErrorState,
  HeaderIconButton,
  LoadingScreen,
  PermissionGate,
  SelectField,
  type SelectOption,
} from '@/components';
import { Paneel } from '@/components/Paneel';
import { DealKaart } from '@/components/pipeline/DealKaart';
import { FaseBadge } from '@/components/pipeline/FaseBadge';
import { NieuweAanvraagSheet } from '@/components/pipeline/NieuweAanvraagSheet';
import { VerlorenSheet } from '@/components/pipeline/VerlorenSheet';
import type { Lid } from '@/components/pipeline/LedenKeuze';
import { usePermissions, useTheme } from '@/providers';
import {
  DEAL_PRIORITEITEN,
  listDeals,
  listPipelineStages,
  listVervolgActiviteiten,
  updateDeal,
  updateDealStage,
  zetDealAfgerond,
  type DealRow,
  type PipelineStage,
} from '@/services/dealService';
import { listCustomers } from '@/services/customerService';
import { listCompanyProfiles } from '@/services/teamService';
import {
  dealWaarde,
  dealsPerFase,
  faseKeuzes,
  filterDeals,
  filterIsActief,
  heeftGeenVervolg,
  STANDAARD_FILTER,
  STATUS_FILTER_OPTIES,
  totaalWaarde,
  verlorenFase,
  vervolgSleutels,
  zichtbareFasen,
  type PipelineFilter,
  type VervolgActiviteit,
} from '@/lib/pipelineLogica';
import { useSave } from '@/lib/useSave';
import { formatEUR } from '@/lib/format';
import { vandaagIso } from '@/lib/nlTijd';
import { useSchermklasse } from '@/lib/schermklasse';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Pipeline — het bord van het dashboard (`BbDashboard.jsx`), op dezelfde
 * `deals` en `pipeline_stages`.
 *
 * - iPad/desktop: alle fasen als kolommen naast elkaar, horizontaal scrollbaar.
 * - Telefoon (en iPad in Split View): per fase, met fasetabs en aantallen.
 * - Een kaart opent het projectdetail van die aanvraag (`/deal/<id>`), net als
 *   `openDeal` in het dashboard.
 * - Slepen bestaat hier niet; het ⋮-menu heeft "Verplaats naar fase".
 *
 * Rechten: zien en wijzigen vragen `verkoop` (RLS). De status volgt de fase in
 * de database (trigger `bb_deal_status_uit_fase`).
 */

export default function PipelineScreen() {
  return (
    <PermissionGate permission="verkoop" label="Pipeline">
      <PipelineScreenInhoud />
    </PermissionGate>
  );
}

const KOLOM_BREEDTE = 272;

function PipelineScreenInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag } = usePermissions();
  const { klasse } = useSchermklasse();
  const tablet = klasse === 'tablet';

  const [deals, setDeals] = useState<DealRow[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [klanten, setKlanten] = useState<SelectOption[]>([]);
  const [leden, setLeden] = useState<Lid[]>([]);
  const [vervolg, setVervolg] = useState<VervolgActiviteit[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<PipelineFilter>(STANDAARD_FILTER);
  const [toonFilters, setToonFilters] = useState(false);
  const [telefoonFase, setTelefoonFase] = useState<string | null>(null);
  const [verlorenIn, setVerlorenIn] = useState(false);
  const [nieuw, setNieuw] = useState<{ fase: string | null } | null>(null);
  const [menuDeal, setMenuDeal] = useState<DealRow | null>(null);
  const [verlorenDeal, setVerlorenDeal] = useState<DealRow | null>(null);

  const { save: saveActie } = useSave<DealRow>();

  const magMaken = mag('pipeline', 'maken');
  const magWijzigen = mag('pipeline', 'wijzigen');

  const load = useCallback(async () => {
    setError(null);
    const [stageRes, dealRes, klantRes, ledenRes, acts] = await Promise.all([
      listPipelineStages(),
      listDeals(),
      listCustomers(),
      listCompanyProfiles(),
      listVervolgActiviteiten(),
    ]);

    if (stageRes.error || dealRes.error) {
      setError(stageRes.error ?? dealRes.error);
      return;
    }
    setStages(stageRes.data);
    setDeals(dealRes.data);
    setVervolg(acts);
    if (!klantRes.error) {
      setKlanten(
        klantRes.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant', sub: k.city ?? undefined })),
      );
    }
    if (!ledenRes.error) {
      setLeden(ledenRes.data.filter((l) => l.actief).map((l) => ({ id: l.id, full_name: l.full_name })));
    }
  }, []);

  const { loading, refreshing, onRefresh, opnieuw } = useLaden(load, { onFout: setError });

  // ── Afgeleid ─────────────────────────────────────────────────────────────
  const gefilterd = useMemo(() => filterDeals(deals, filter), [deals, filter]);
  const kolommen = useMemo(() => zichtbareFasen(stages, filter), [stages, filter]);
  const perFase = useMemo(() => dealsPerFase(gefilterd, kolommen), [gefilterd, kolommen]);
  const sleutels = useMemo(() => vervolgSleutels(vervolg, vandaagIso()), [vervolg]);
  const verloren = useMemo(() => verlorenFase(stages), [stages]);
  const totaal = totaalWaarde(gefilterd, filter);

  const faseOpties = useMemo<SelectOption[]>(
    () =>
      [...stages]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((s) => ({ id: s.id, label: s.name ?? 'Fase' })),
    [stages],
  );
  const actieveTelefoonFase =
    telefoonFase && kolommen.some((k) => k.id === telefoonFase) ? telefoonFase : (kolommen[0]?.id ?? null);

  // ── Acties ───────────────────────────────────────────────────────────────
  const vervang = (bij: DealRow) => setDeals((lijst) => lijst.map((d) => (d.id === bij.id ? bij : d)));

  const zetPrio = (d: DealRow, priority: string) => {
    setMenuDeal(null);
    saveActie(() => updateDeal(d.id, { priority }), { onSuccess: vervang });
  };

  const verplaats = (d: DealRow, faseId: string) => {
    setMenuDeal(null);
    if (faseId === d.stage_id) return;
    // Naar Verloren gaat nooit stil: dan eerst de reden.
    if (verloren && faseId === verloren.id) {
      setVerlorenDeal(d);
      return;
    }
    // Optimistisch verplaatsen, bij een fout terug.
    setDeals((lijst) => lijst.map((x) => (x.id === d.id ? { ...x, stage_id: faseId } : x)));
    saveActie(() => updateDealStage(d.id, faseId), { onSuccess: vervang }).then((res) => {
      if (res && !res.ok) vervang(d);
    });
  };

  const voltooi = (d: DealRow) => {
    setMenuDeal(null);
    saveActie(() => zetDealAfgerond(d.id, true), { onSuccess: vervang, succesMelding: 'Project voltooid' });
  };

  const openDeal = (d: DealRow) => router.push(`/deal/${d.id}` as Href);

  const menuVoor = (d: DealRow) =>
    magWijzigen && d.stage_id !== verloren?.id ? () => setMenuDeal(d) : undefined;

  if (loading || !rechtenGeladen) return <LoadingScreen label="Pipeline laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Pipeline" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState title="Pipeline laden is mislukt." message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const n = gefilterd.length;
  const actief = filterIsActief(filter);

  const kolomInhoud = (faseId: string, faseNaam: string) => {
    const rijen = perFase.get(faseId) ?? [];
    return (
      <View style={{ gap: spacing.sm }}>
        {rijen.map((d) => (
          <DealKaart
            key={d.id}
            deal={d}
            geenVervolg={heeftGeenVervolg(d, sleutels)}
            onOpen={() => openDeal(d)}
            onMenu={menuVoor(d)}
          />
        ))}
        {rijen.length === 0 ? <Text style={styles.geenItems}>Geen items</Text> : null}
        {magMaken ? (
          <Pressable
            onPress={() => setNieuw({ fase: faseId })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.leadKnop, pressed && { opacity: 0.7 }]}
          >
            <Plus size={16} color={t.muted} />
            <Text style={styles.leadTekst} numberOfLines={1}>
              {tablet ? 'Aanvraag toevoegen' : `Aanvraag toevoegen aan ${faseNaam}`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const telefoonKolom = kolommen.find((x) => x.id === actieveTelefoonFase) ?? null;
  const telefoonRijen = telefoonKolom ? (perFase.get(telefoonKolom.id) ?? []) : [];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Pipeline"
            subtitle={`${n} ${n === 1 ? 'aanvraag' : 'aanvragen'} · ${formatEUR(totaal)} totaal`}
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              magMaken ? (
                <HeaderIconButton icon={Plus} label="Nieuwe aanvraag" onPress={() => setNieuw({ fase: null })} />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* Zoeken en filters */}
        <View style={styles.zoekRij}>
          <View style={{ flex: 1 }}>
            <AppSearchBar
              value={filter.text}
              onChange={(v) => setFilter((f) => ({ ...f, text: v }))}
              placeholder="Zoek op titel, klant of plaats"
            />
          </View>
          <Pressable
            onPress={() => setToonFilters((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: toonFilters }}
            aria-expanded={toonFilters}
            accessibilityLabel={actief ? 'Filter (actief)' : 'Filter'}
            style={({ pressed }) => [styles.filterKnop, actief && styles.filterKnopAan, pressed && { opacity: 0.8 }]}
          >
            <SlidersHorizontal size={18} color={actief ? t.green700 : t.ink2} />
            {tablet ? (
              <Text style={[styles.filterTekst, actief && { color: t.green700 }]}>
                {actief ? 'Filter (actief)' : 'Filter'}
              </Text>
            ) : null}
          </Pressable>
        </View>

        {toonFilters ? (
          <View style={[styles.filterPaneel, tablet && styles.filterPaneelTablet]}>
            <View style={tablet ? styles.filterVeldTablet : undefined}>
              <SelectField
                label="Pipeline fase"
                value={filter.stage === 'all' ? null : filter.stage}
                options={faseOpties}
                onChange={(id) => setFilter((f) => ({ ...f, stage: id ?? 'all' }))}
                allowEmpty
                emptyLabel="Alle fases"
                placeholder="Alle fases"
              />
            </View>
            <View style={tablet ? styles.filterVeldTablet : undefined}>
              <SelectField
                label="Status"
                value={filter.status}
                options={STATUS_FILTER_OPTIES}
                onChange={(id) =>
                  setFilter((f) => ({ ...f, status: (id as PipelineFilter['status'] | null) ?? 'open' }))
                }
              />
            </View>
            <View style={tablet ? styles.filterVeldTablet : undefined}>
              <SelectField
                label="Behandeld door"
                value={filter.persoon === 'all' ? null : filter.persoon}
                options={leden.map((l) => ({ id: l.id, label: l.full_name || 'Teamlid' }))}
                onChange={(id) => setFilter((f) => ({ ...f, persoon: id ?? 'all' }))}
                allowEmpty
                emptyLabel="Iedereen"
                placeholder="Iedereen"
              />
            </View>
            <View style={tablet ? styles.filterVeldTablet : undefined}>
              <SelectField
                label="Prioriteit"
                value={filter.priority === 'all' ? null : filter.priority}
                options={DEAL_PRIORITEITEN.map((p) => ({ id: String(p.id), label: p.label }))}
                onChange={(id) => setFilter((f) => ({ ...f, priority: id ?? 'all' }))}
                allowEmpty
                emptyLabel="Alle"
                placeholder="Alle"
              />
            </View>
            <Button
              label="Reset filters"
              variant="ghost"
              onPress={() => setFilter(STANDAARD_FILTER)}
              disabled={!actief}
            />
          </View>
        ) : null}

        {n === 0 ? (
          <View>
            <EmptyState
              icon={<FolderKanban size={40} color={ds.green} strokeWidth={1.6} />}
              title="Geen aanvragen gevonden"
              message={actief ? 'Pas je filter aan of voeg een nieuwe aanvraag toe.' : 'Begin met je eerste aanvraag.'}
            />
            <View style={styles.legeKnoppen}>
              {actief ? (
                <Button label="Reset" variant="secondary" onPress={() => setFilter(STANDAARD_FILTER)} />
              ) : null}
              {magMaken ? <Button label="Nieuwe aanvraag" onPress={() => setNieuw({ fase: null })} /> : null}
            </View>
          </View>
        ) : tablet ? (
          // ── iPad/desktop: kolommen naast elkaar ───────────────────────────
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.bord}
            keyboardShouldPersistTaps="handled"
          >
            {kolommen.map((k) => {
              const rijen = perFase.get(k.id) ?? [];
              const som = rijen.reduce((s, d) => s + dealWaarde(d), 0);
              const isVerloren = k.id === verloren?.id;
              if (isVerloren && !verlorenIn) {
                return (
                  <Pressable
                    key={k.id}
                    onPress={() => setVerlorenIn(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`Verloren tonen (${rijen.length})`}
                    style={({ pressed }) => [styles.strook, pressed && { opacity: 0.7 }]}
                  >
                    <Eye size={16} color={t.muted} />
                    <Text style={styles.strookTekst}>Verloren</Text>
                    <Text style={styles.strookTel}>{rijen.length}</Text>
                  </Pressable>
                );
              }
              return (
                <View key={k.id} style={styles.kolom}>
                  <View style={styles.kolomKop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <FaseBadge label={k.name ?? 'Fase'} colorClass={k.color_class} positie={k.position} />
                      <Text style={styles.kolomSom}>{formatEUR(som)}</Text>
                    </View>
                    <View style={styles.tel}>
                      <Text style={styles.telTekst}>{rijen.length}</Text>
                    </View>
                    {isVerloren ? (
                      <Pressable
                        onPress={() => setVerlorenIn(false)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Verloren verbergen"
                        style={styles.oog}
                      >
                        <EyeOff size={16} color={t.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                  {kolomInhoud(k.id, k.name ?? 'fase')}
                </View>
              );
            })}
          </ScrollView>
        ) : (
          // ── Telefoon: per fase ────────────────────────────────────────────
          <View>
            <AppFilterChips
              chips={kolommen.map((k) => ({
                id: k.id,
                label: k.name ?? 'Fase',
                count: (perFase.get(k.id) ?? []).length,
              }))}
              active={actieveTelefoonFase ?? ''}
              onChange={setTelefoonFase}
            />
            {telefoonKolom ? (
              <View style={styles.telefoonLijst}>
                <View style={styles.telefoonKop}>
                  <FaseBadge
                    label={telefoonKolom.name ?? 'Fase'}
                    colorClass={telefoonKolom.color_class}
                    positie={telefoonKolom.position}
                    groot
                  />
                  <Text style={styles.kolomSom}>
                    {telefoonRijen.length} {telefoonRijen.length === 1 ? 'aanvraag' : 'aanvragen'} ·{' '}
                    {formatEUR(telefoonRijen.reduce((s, d) => s + dealWaarde(d), 0))}
                  </Text>
                </View>
                {kolomInhoud(telefoonKolom.id, telefoonKolom.name ?? 'fase')}
              </View>
            ) : null}
          </View>
        )}
      </AppScreen>

      {/* ⋮-menu van een kaart */}
      <Paneel
        open={menuDeal !== null}
        titel={menuDeal?.customer?.name || 'Klant'}
        subtitel={menuDeal?.title ?? undefined}
        onSluit={() => setMenuDeal(null)}
      >
        {menuDeal ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
            <Text style={styles.menuLabel}>Prioriteit</Text>
            {DEAL_PRIORITEITEN.map((p) => (
              <Pressable
                key={String(p.id)}
                onPress={() => zetPrio(menuDeal, String(p.id))}
                accessibilityRole="button"
                style={({ pressed }) => [styles.menuRij, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.menuTekst}>{p.label}</Text>
                {(menuDeal.priority || 'med') === p.id ? <Check size={18} color={t.green700} /> : null}
              </Pressable>
            ))}
            <Text style={styles.menuLabel}>Verplaats naar fase</Text>
            {faseKeuzes(stages, menuDeal.stage_id).map((s) => (
              <Pressable
                key={s.id}
                onPress={() => verplaats(menuDeal, s.id)}
                accessibilityRole="button"
                accessibilityLabel={`Verplaats naar ${s.name ?? 'fase'}`}
                style={({ pressed }) => [styles.menuRij, pressed && { opacity: 0.7 }]}
              >
                <FaseBadge label={s.name ?? 'Fase'} colorClass={s.color_class} positie={s.position} />
                {menuDeal.stage_id === s.id ? <Check size={18} color={t.green700} /> : null}
              </Pressable>
            ))}
            <View style={styles.menuScheiding} />
            <Pressable
              onPress={() => voltooi(menuDeal)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.menuRij, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.menuTekst, { color: t.green700 }]}>Project voltooien</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const d = menuDeal;
                setMenuDeal(null);
                setVerlorenDeal(d);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.menuRij, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.menuTekst, { color: t.statusRejectFg }]}>Markeer als verloren</Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </Paneel>

      <VerlorenSheet
        deal={verlorenDeal}
        verlorenFaseId={verloren?.id ?? null}
        onClose={() => setVerlorenDeal(null)}
        onSaved={vervang}
      />

      <NieuweAanvraagSheet
        open={nieuw !== null}
        startFaseId={nieuw?.fase ?? null}
        fasen={faseOpties}
        klanten={klanten}
        leden={leden}
        onClose={() => setNieuw(null)}
        onSaved={(d) => setDeals((lijst) => [d, ...lijst])}
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    zoekRij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: 16,
      marginBottom: spacing.md,
    },
    filterKnop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 46,
      minWidth: 46,
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
    },
    filterKnopAan: { borderColor: t.green600, backgroundColor: t.green50 },
    filterTekst: { fontSize: 14, fontWeight: '600', color: t.ink2 },
    filterPaneel: {
      marginHorizontal: 16,
      marginBottom: spacing.md,
      padding: spacing.md,
      gap: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
    },
    filterPaneelTablet: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
    filterVeldTablet: { flexBasis: 180, flexGrow: 1 },
    legeKnoppen: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
    bord: { paddingHorizontal: 16, gap: spacing.md, alignItems: 'flex-start', paddingBottom: spacing.md },
    kolom: {
      width: KOLOM_BREEDTE,
      padding: spacing.sm,
      gap: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: t.bgAlt,
    },
    kolomKop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingHorizontal: 4,
      paddingTop: 4,
    },
    kolomSom: { fontSize: 12.5, color: t.muted, marginTop: 4 },
    tel: {
      minWidth: 26,
      height: 22,
      paddingHorizontal: 7,
      borderRadius: 11,
      backgroundColor: t.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    telTekst: { fontSize: 12, fontWeight: '700', color: t.ink2 },
    oog: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -6 },
    strook: {
      width: 44,
      minHeight: 160,
      borderRadius: radius.lg,
      backgroundColor: t.bgAlt,
      alignItems: 'center',
      paddingTop: spacing.md,
      gap: spacing.xl,
    },
    strookTekst: {
      fontSize: 12,
      fontWeight: '700',
      color: t.muted,
      width: 80,
      textAlign: 'center',
      transform: [{ rotate: '90deg' }],
    },
    strookTel: { fontSize: 12, fontWeight: '700', color: t.muted },
    geenItems: { fontSize: 12.5, color: t.muted, textAlign: 'center', paddingVertical: spacing.md },
    leadKnop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.lineStrong,
      paddingHorizontal: spacing.md,
    },
    leadTekst: { fontSize: 13.5, fontWeight: '600', color: t.muted, flexShrink: 1 },
    telefoonLijst: { paddingHorizontal: 16, marginTop: spacing.md, gap: spacing.sm },
    telefoonKop: { gap: 4, marginBottom: spacing.xs },
    menuLabel: { ...typography.eyebrow, color: t.muted2, marginTop: spacing.md, marginBottom: spacing.xs },
    menuRij: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      paddingVertical: 6,
      gap: spacing.sm,
    },
    menuTekst: { fontSize: 15, fontWeight: '600', color: t.ink },
    menuScheiding: { height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginVertical: spacing.sm },
  });
