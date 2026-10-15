import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Briefcase, Plus } from 'lucide-react-native';
import {
  AppFilterChips,
  AppKpiCard,
  AppScreen,
  AppSearchBar,
  AppTopBar,
  Button,
  DateField,
  EmptyState,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  PermissionGate,
  SelectField,
  StatusBadge,
  type SelectOption,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  createProject,
  getFactuurBedragenPerProject,
  getProjectUrenMap,
  listProjects,
  type ProjectRow,
} from '@/services/projectService';
import { listDeals } from '@/services/dealService';
import { listCustomers } from '@/services/customerService';
import { listCompanyProfiles } from '@/services/teamService';
import {
  filterProjecten,
  formatUren,
  isVerlopen,
  projectCijfers,
  projectKpi,
  type FacturatieFilter,
  type ProjectCijfers,
  type ProjectStatusFilter,
} from '@/lib/projectLogica';
import { useSave } from '@/lib/useSave';
import { formatDateNL, formatEUR } from '@/lib/format';
import { vandaagIso } from '@/lib/nlTijd';
import { useSchermklasse } from '@/lib/schermklasse';
import { ds, radius, spacing, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { useOnthouden } from '@/lib/useOnthouden';

/**
 * Projecten — de projectenpagina van het dashboard (`ProjectsPage.jsx`):
 * KPI's, statusfilter (Gepland · In uitvoering · Afgerond), facturatiefilter,
 * zoeken op project/klant/aanvraag/offerte, en per project waarde, gefactureerd,
 * uren en deadline. Een project opent het detail (`/project/<id>`).
 *
 * Bedragen staan achter het recht `projectbedragen`. Nieuw project:
 * `projecten_bewerken` (RLS). De status wordt niet gekozen; hij volgt de
 * werkbonnen (database-trigger).
 */

export default function ProjectsScreen() {
  return (
    <PermissionGate permission="projecten" label="Projecten">
      <ProjectsInhoud />
    </PermissionGate>
  );
}

type Item = ProjectRow &
  ProjectCijfers & { customerName: string | null; dealTitle: string | null; offerteNummer: string | null };

type Concept = {
  name: string;
  customerId: string | null;
  dealId: string | null;
  waarde: string;
  uren: string;
  start: string;
  deadline: string;
  toegewezen: string | null;
  description: string;
};

const LEEG_CONCEPT: Concept = {
  name: '',
  customerId: null,
  dealId: null,
  waarde: '',
  uren: '',
  start: '',
  deadline: '',
  toegewezen: null,
  description: '',
};

function ProjectsInhoud() {
  const router = useRouter();
  // `?nieuw=1&klant=<id>` (de "+" op de klantkaart) opent meteen een nieuw
  // project met die klant ingevuld, zoals NewProjectModal in het dashboard.
  const {
    id: openId,
    nieuw: nieuwParam,
    klant: klantParam,
  } = useLocalSearchParams<{ id?: string; nieuw?: string; klant?: string }>();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, can } = usePermissions();

  // `/projects?id=<id>` (bijv. vanaf de klantkaart) opent dat project direct;
  // de parameter gaat daarna weg, zodat terugkomen op de lijst niet opnieuw opent.
  useEffect(() => {
    if (!openId) return;
    router.setParams({ id: undefined });
    router.push(`/project/${openId}` as Href);
  }, [openId, router]);
  const { klasse } = useSchermklasse();
  const tablet = klasse === 'tablet';

  const [items, setItems] = useState<Item[]>([]);
  const [klanten, setKlanten] = useState<SelectOption[]>([]);
  const [deals, setDeals] = useState<{ id: string; label: string; customerId: string | null }[]>([]);
  const [leden, setLeden] = useState<SelectOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useOnthouden<ProjectStatusFilter>('projecten.status', 'all', [
    'all',
    'gepland',
    'in_uitvoering',
    'afgerond',
  ]);
  const [facturatieKeuze, setFacturatie] = useOnthouden<FacturatieFilter>('projecten.facturatie', 'all', [
    'all',
    'unbilled',
    'billed',
  ]);
  const [zoek, setZoek] = useState('');
  const [concept, setConcept] = useState<Concept | null>(null);

  const { save, saving, error: saveError, setError: setSaveError } = useSave<ProjectRow>();

  const magMaken = mag('projecten', 'maken');
  const magBedragen = can('projectbedragen');
  // Zonder recht op bedragen geen (onzichtbaar) facturatiefilter.
  const facturatie: FacturatieFilter = magBedragen ? facturatieKeuze : 'all';
  const magVerkoop = can('verkoop');

  const load = useCallback(async () => {
    setError(null);
    const [projRes, urenMap, facturen] = await Promise.all([
      listProjects(),
      getProjectUrenMap(),
      getFactuurBedragenPerProject(),
    ]);
    if (projRes.error) {
      setError(projRes.error);
      return;
    }
    setItems(
      projRes.data.map((p) => ({
        ...p,
        ...projectCijfers(p, urenMap[p.id] ?? 0, facturen[p.id] ?? []),
        customerName: p.customer?.name ?? null,
        dealTitle: p.deal?.title ?? null,
        offerteNummer: p.offerte?.nummer ?? null,
      })),
    );
  }, []);

  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });

  const gefilterd = useMemo(
    () => filterProjecten(items, status, facturatie, zoek),
    [items, status, facturatie, zoek],
  );
  const kpi = useMemo(() => projectKpi(items), [items]);
  const tellingen = useMemo(() => {
    const tel = (s: string) => items.filter((p) => (p.status || 'gepland') === s).length;
    return { gepland: tel('gepland'), in_uitvoering: tel('in_uitvoering'), afgerond: tel('afgerond') };
  }, [items]);
  const vandaag = vandaagIso();

  const openNieuw = async (klantId?: string | null) => {
    setSaveError(null);
    setConcept(klantId ? { ...LEEG_CONCEPT, customerId: klantId } : LEEG_CONCEPT);
    // Keuzelijsten pas bij het openen: de lijst zelf heeft ze niet nodig.
    const [k, l, d] = await Promise.all([
      klanten.length ? null : listCustomers(),
      leden.length ? null : listCompanyProfiles(),
      magVerkoop && !deals.length ? listDeals() : null,
    ]);
    if (k && !k.error) {
      setKlanten(k.data.map((x) => ({ id: x.id, label: x.name ?? 'Klant', sub: x.city ?? undefined })));
    }
    if (l && !l.error) {
      setLeden(l.data.filter((x) => x.actief).map((x) => ({ id: x.id, label: x.full_name })));
    }
    if (d && !d.error) {
      setDeals(d.data.map((x) => ({ id: x.id, label: x.title ?? 'Aanvraag', customerId: x.customer_id })));
    }
  };

  const opslaan = () => {
    if (!concept) return;
    const getal = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : 0);
    save(
      () =>
        createProject({
          name: concept.name,
          customer_id: concept.customerId,
          deal_id: concept.dealId,
          project_value: magBedragen ? getal(concept.waarde) : 0,
          quoted_hours: getal(concept.uren),
          start_date: concept.start || null,
          deadline: concept.deadline || null,
          assigned_to: concept.toegewezen,
          description: concept.description,
        }),
      {
        onSuccess: async (p, extra) => {
          setConcept(null);
          await herlaad();
          if (extra?.bestond) router.push(`/project/${p.id}` as Href);
        },
        succesMelding: 'Project opgeslagen',
      },
    );
  };

  useEffect(() => {
    if (nieuwParam !== '1' || loading || !rechtenGeladen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (magMaken) openNieuw(klantParam || null);
    router.setParams({ nieuw: undefined, klant: undefined });
    // openNieuw als afhankelijkheid zou bij elke render opnieuw openen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nieuwParam, loading, rechtenGeladen]);

  if (loading || !rechtenGeladen) return <LoadingScreen label="Projecten laden…" />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Projecten" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState title="Laden mislukt" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const dealOpties = deals
    .filter((d) => !concept?.customerId || d.customerId === concept.customerId)
    .map((d) => ({ id: d.id, label: d.label }));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Projecten"
            subtitle="Beheer projecten, uren, offertes en facturatie"
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              magMaken ? <HeaderIconButton icon={Plus} label="Nieuw project" onPress={() => openNieuw()} /> : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* KPI's */}
        <View style={[styles.kpis, tablet && styles.kpisTablet]}>
          <View style={styles.kpi}>
            <AppKpiCard label="Actieve projecten" value={String(kpi.actief)} />
          </View>
          {magBedragen ? (
            <View style={styles.kpi}>
              <AppKpiCard label="Totale projectwaarde" value={formatEUR(kpi.totaleWaarde)} valueTone="good" />
            </View>
          ) : null}
          {magBedragen ? (
            <View style={styles.kpi}>
              <AppKpiCard
                label="Te factureren"
                value={formatEUR(kpi.teFactureren)}
                valueTone={kpi.teFactureren > 0 ? 'warn' : 'default'}
              />
            </View>
          ) : null}
          <View style={styles.kpi}>
            <AppKpiCard label="Gewerkte uren" value={formatUren(kpi.uren)} />
          </View>
        </View>

        <View style={styles.zoek}>
          <AppSearchBar value={zoek} onChange={setZoek} placeholder="Zoek project, klant…" />
        </View>
        <AppFilterChips<ProjectStatusFilter>
          chips={[
            { id: 'all', label: 'Alle', count: items.length },
            { id: 'gepland', label: 'Gepland', count: tellingen.gepland },
            { id: 'in_uitvoering', label: 'In uitvoering', count: tellingen.in_uitvoering },
            { id: 'afgerond', label: 'Afgerond', count: tellingen.afgerond },
          ]}
          active={status}
          onChange={setStatus}
        />
        {magBedragen ? (
          <View style={{ marginTop: spacing.sm }}>
            <AppFilterChips<FacturatieFilter>
              chips={[
                { id: 'all', label: 'Alle facturatie' },
                { id: 'unbilled', label: 'Nog te factureren' },
                { id: 'billed', label: 'Al gefactureerd' },
              ]}
              active={facturatie}
              onChange={setFacturatie}
            />
          </View>
        ) : null}

        {gefilterd.length === 0 ? (
          <View>
            <EmptyState
              icon={<Briefcase size={40} color={ds.green} strokeWidth={1.6} />}
              title={items.length === 0 ? 'Nog geen projecten' : 'Geen projecten gevonden'}
              message={
                items.length === 0
                  ? 'Elke nieuwe aanvraag wordt hier vanzelf een project.'
                  : 'Pas de filters of zoekterm aan om meer projecten te zien.'
              }
            />
            {items.length === 0 && magMaken ? (
              <View style={{ alignItems: 'center' }}>
                <Button label="Eerste project" onPress={() => openNieuw()} />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.lijst, tablet && styles.lijstTablet]}>
            {gefilterd.map((p) => {
              const verlopen = isVerlopen(p.deadline, p.status, vandaag);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/project/${p.id}` as Href)}
                  accessibilityRole="button"
                  accessibilityLabel={`Project ${p.name ?? ''} openen`}
                  style={({ pressed }) => [styles.kaart, tablet && styles.kaartTablet, pressed && { opacity: 0.9 }]}
                >
                  <View style={styles.kaartKop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.naam} numberOfLines={1}>
                        {p.name || 'Project'}
                      </Text>
                      <Text style={styles.klant} numberOfLines={1}>
                        {p.customerName || 'Geen klant'}
                        {p.offerteNummer ? ` · ${p.offerteNummer}` : ''}
                      </Text>
                    </View>
                    <StatusBadge status={p.status ?? 'gepland'} />
                  </View>
                  <View style={styles.cijfers}>
                    {magBedragen ? (
                      <View style={styles.cijfer}>
                        <Text style={styles.cijferLabel}>Waarde</Text>
                        <Text style={styles.cijferWaarde}>{formatEUR(Number(p.project_value ?? 0))}</Text>
                      </View>
                    ) : null}
                    <View style={styles.cijfer}>
                      <Text style={styles.cijferLabel}>Uren</Text>
                      <Text style={styles.cijferWaarde}>
                        {formatUren(p.usedHours)} / {formatUren(p.quoted_hours)}
                      </Text>
                    </View>
                    <View style={styles.cijfer}>
                      <Text style={styles.cijferLabel}>Deadline</Text>
                      <Text style={[styles.cijferWaarde, verlopen && { color: t.statusRejectFg }]}>
                        {p.deadline ? formatDateNL(p.deadline) : '—'}
                      </Text>
                    </View>
                  </View>
                  {magBedragen ? (
                    <Text style={styles.gefactureerd}>
                      {p.invoicedAmount > 0
                        ? `${formatEUR(p.omzetExclBtw)} gefactureerd`
                        : 'Nog niet gefactureerd'}
                      {p.remainingToInvoice > 0 && p.invoicedAmount > 0
                        ? ` · nog ${formatEUR(p.remainingToInvoice)}`
                        : ''}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </AppScreen>

      <FormSheet
        visible={concept !== null}
        title="Nieuw project"
        error={saveError}
        saving={saving}
        submitLabel="Project aanmaken"
        submitDisabled={!concept?.name.trim()}
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
      >
        <FormField
          label="Projectnaam"
          value={concept?.name ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, name: v } : c))}
          placeholder="Bv. Renovatie badkamer Jansen"
          autoFocus
        />
        <SelectField
          label="Klant"
          value={concept?.customerId ?? null}
          options={klanten}
          onChange={(id) => setConcept((c) => (c ? { ...c, customerId: id, dealId: null } : c))}
          allowEmpty
          emptyLabel="— Geen klant —"
          placeholder="— Geen klant —"
          searchable
        />
        {magVerkoop ? (
          <SelectField
            label="Aanvraag"
            value={concept?.dealId ?? null}
            options={dealOpties}
            onChange={(id) => setConcept((c) => (c ? { ...c, dealId: id } : c))}
            allowEmpty
            emptyLabel="— Geen aanvraag —"
            placeholder="— Geen aanvraag —"
            hint="Heeft deze aanvraag al een project, dan wordt dat bijgewerkt."
            searchable
          />
        ) : null}
        <View style={styles.formRij}>
          {magBedragen ? (
            <View style={{ flex: 1 }}>
              <FormField
                label="Projectwaarde (excl. btw)"
                value={concept?.waarde ?? ''}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, waarde: v } : c))}
                placeholder="0,00"
                keyboardType="decimal-pad"
              />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <FormField
              label="Begrote uren"
              value={concept?.uren ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, uren: v } : c))}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <View style={styles.formRij}>
          <View style={{ flex: 1 }}>
            <DateField
              label="Startdatum"
              value={concept?.start || null}
              onChange={(v) => setConcept((c) => (c ? { ...c, start: v } : c))}
              maximum={concept?.deadline || null}
              placeholder="Kies"
            />
          </View>
          <View style={{ flex: 1 }}>
            <DateField
              label="Deadline"
              value={concept?.deadline || null}
              onChange={(v) => setConcept((c) => (c ? { ...c, deadline: v } : c))}
              minimum={concept?.start || null}
              placeholder="Kies"
            />
          </View>
        </View>
        <SelectField
          label="Toegewezen aan"
          value={concept?.toegewezen ?? null}
          options={leden}
          onChange={(id) => setConcept((c) => (c ? { ...c, toegewezen: id } : c))}
          allowEmpty
          emptyLabel="— Geen medewerker —"
          placeholder="— Geen medewerker —"
        />
        <FormField
          label="Omschrijving"
          value={concept?.description ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, description: v } : c))}
          placeholder="Werkomschrijving, bijzonderheden, aandachtspunten…"
          multiline
        />
      </FormSheet>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: 16, marginBottom: spacing.md },
    kpisTablet: { flexWrap: 'nowrap' },
    kpi: { flexBasis: '45%', flexGrow: 1 },
    zoek: { paddingHorizontal: 16, marginBottom: spacing.sm },
    lijst: { paddingHorizontal: 16, marginTop: spacing.md, gap: spacing.sm },
    lijstTablet: { flexDirection: 'row', flexWrap: 'wrap' },
    kaart: {
      backgroundColor: t.card,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      padding: spacing.md,
      gap: spacing.sm,
    },
    kaartTablet: { flexBasis: '48%', flexGrow: 1 },
    kaartKop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    naam: { fontSize: 15, fontWeight: '700', color: t.ink },
    klant: { fontSize: 12.5, color: t.muted, marginTop: 2 },
    cijfers: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
    cijfer: { flexGrow: 1, flexBasis: 80 },
    cijferLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: t.muted2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    cijferWaarde: { fontSize: 13.5, fontWeight: '600', color: t.ink, marginTop: 2 },
    gefactureerd: { fontSize: 12, color: t.muted, textAlign: 'right' },
    formRij: { flexDirection: 'row', gap: spacing.md },
  });
