import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Dialog } from '@/lib/dialog';
import { useRouter } from 'expo-router';
import { Lock, Plus, Wallet } from 'lucide-react-native';
import {
  AppListGroup,
  AppListItem,
  AppScreen,
  AppSection,
  AppTopBar,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  PermissionGate,
  SelectField,
  type SelectOption,
  DateField,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  createJobCost,
  createLeverancier,
  deleteJobCost,
  isVergrendeld,
  KOSTEN_CATEGORIEEN,
  listJobCosts,
  listLeveranciers,
  updateJobCost,
  type JobCostRow,
} from '@/services/jobCostService';
import { listCustomers } from '@/services/customerService';
import { listProjects } from '@/services/projectService';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { vandaagIso } from '@/lib/nlTijd';
import { formatDateNL, formatEUR } from '@/lib/format';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Kosten — dezelfde `job_costs`-tabel als het dashboard.
 *
 * Twee dingen die de database afdwingt en die je hier terugziet:
 *
 * - `job_costs_leverancier_verplicht`: een kostenpost met een positief bedrag
 *   moet een leverancier hebben (tenzij hij aan een werkbon of een import
 *   hangt). Het leveranciersveld is daarom verplicht en niet optioneel.
 * - `plan_feature_kosten`: een losse kostenpost vraagt de feature
 *   Kosten & nacalculatie.
 *
 * Geïmporteerde kosten en spiegelregels van werkbonmateriaal staan op slot: hun
 * bron ligt elders en een wijziging hier zou bij de volgende sync verdwijnen.
 */

export default function ExpensesScreen() {
  return (
    <PermissionGate permission="kosten" feature="kosten_nacalculatie" label="Kosten">
      <ExpensesScreenInhoud />
    </PermissionGate>
  );
}

type Concept = {
  id: string | null;
  /** Inhoud ligt vast (import of werkbonmateriaal); verwijderen mag wel. */
  opSlot: boolean;
  description: string;
  bedrag: string;
  category: string;
  datum: string;
  leverancierId: string | null;
  customerId: string | null;
  projectId: string | null;
  btwPct: string;
  btwInclusief: boolean;
};

function subtitleFor(k: JobCostRow): string {
  const delen: string[] = [];
  if (k.category) delen.push(k.category);
  if (k.leverancier) delen.push(k.leverancier);
  if (k.customer?.name) delen.push(k.customer.name);
  if (k.cost_date) delen.push(formatDateNL(k.cost_date));
  return delen.join(' · ') || 'Kostenpost';
}

function ExpensesScreenInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();

  const [items, setItems] = useState<JobCostRow[]>([]);
  const [leveranciers, setLeveranciers] = useState<SelectOption[]>([]);
  const [klanten, setKlanten] = useState<SelectOption[]>([]);
  const [projecten, setProjecten] = useState<SelectOption[]>([]);  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [nieuweLeverancier, setNieuweLeverancier] = useState('');

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveLev, saving: levBezig, error: levFout } = useSave<{ id: string; naam: string }>();

  const magMaken = mag('kosten', 'maken');
  const magWijzigen = mag('kosten', 'wijzigen');
  const magVerwijderen = mag('kosten', 'verwijderen');

  const load = useCallback(async () => {
    setError(null);

    const [kostRes, levRes, klantRes, projRes] = await Promise.all([
      listJobCosts(),
      listLeveranciers(),
      listCustomers(),
      listProjects(),
    ]);

    if (kostRes.error) setError(kostRes.error);
    else setItems(kostRes.data);
    if (!levRes.error) setLeveranciers(levRes.data.map((l) => ({ id: l.id, label: l.naam })));
    if (!klantRes.error) {
      setKlanten(klantRes.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant' })));
    }
    if (!projRes.error) {
      setProjecten(projRes.data.map((p) => ({ id: p.id, label: p.name ?? 'Project' })));
    }
  }, []);


  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });



  const openNieuw = () => {
    setSaveError(null);
    setConcept({
      id: null,
      opSlot: false,
      description: '',
      bedrag: '',
      category: 'Materiaal',
      datum: vandaagIso(),
      leverancierId: null,
      customerId: null,
      projectId: null,
      btwPct: '21',
      btwInclusief: false,
    });
  };

  const openBewerk = (k: JobCostRow) => {
    if (!magWijzigen) return;
    setSaveError(null);
    setConcept({
      // Een geïmporteerde kost of een spiegelregel van werkbonmateriaal is
      // inhoudelijk niet te wijzigen — de bron ligt elders — maar verwijderen
      // kan wel, mét de prullenbakstap die de import tegenhoudt.
      opSlot: isVergrendeld(k),
      id: k.id,
      description: k.description ?? '',
      bedrag: k.amount != null ? String(k.amount) : '',
      category: k.category ?? 'Overig',
      datum: k.cost_date ?? vandaagIso(),
      leverancierId: k.leverancier_id,
      customerId: k.customer_id,
      projectId: k.project_id,
      btwPct: k.btw_percentage != null ? String(k.btw_percentage) : '21',
      btwInclusief: k.btw_inclusief === true,
    });
  };

  const opslaan = () => {
    if (!concept) return;
    const invoer = {
      description: concept.description,
      amount: Number(concept.bedrag.replace(',', '.') || 0),
      category: concept.category,
      cost_date: concept.datum || null,
      leverancier_id: concept.leverancierId,
      customer_id: concept.customerId,
      project_id: concept.projectId,
      btw_percentage: Number(concept.btwPct.replace(',', '.') || 21),
      btw_inclusief: concept.btwInclusief,
      klant_type: (concept.customerId ? 'klant' : 'algemeen') as 'klant' | 'algemeen',
    };
    save(() => (concept.id ? updateJobCost(concept.id, invoer) : createJobCost(invoer)), {
      onSuccess: async () => {
        setConcept(null);
        await herlaad();
      },
    });
  };

  // De databaseconstraint eist een leverancier bij elke nieuwe kostenpost. Heeft
  // het bedrijf er nog geen, dan zou het formulier een verplicht veld tonen met
  // een lege lijst; daarom kan hij hier ter plekke worden aangemaakt.
  const leverancierToevoegen = () => {
    saveLev(() => createLeverancier(nieuweLeverancier), {
      onSuccess: async (nieuw) => {
        setNieuweLeverancier('');
        setLeveranciers((lijst) =>
          [...lijst, { id: nieuw.id, label: nieuw.naam }].sort((a, b) =>
            a.label.localeCompare(b.label, 'nl'),
          ),
        );
        setConcept((c) => (c ? { ...c, leverancierId: nieuw.id } : c));
      },
    });
  };

  const verwijderen = () => {
    if (!concept?.id) return;
    const id = concept.id;
    const opSlot = concept.opSlot;
    bevestigVerwijderen(
      'Kostenpost',
      () => {
        save(() => deleteJobCost(id), {
          onSuccess: async (_data, extra) => {
            setConcept(null);
            if (typeof extra?.waarschuwing === 'string') Dialog.alert('Let op', extra.waarschuwing);
            await herlaad();
          },
        });
      },
      opSlot
        ? 'Komt deze kost uit je boekhouding, dan gaat hij ook op de negeerlijst zodat de volgende synchronisatie hem niet terughaalt. Hoort hij bij werkbonmateriaal, dan verdwijnt dat materiaal mee.'
        : 'Dit kan niet ongedaan worden gemaakt.',
    );
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Kosten laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Kosten" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const totaal = items.reduce((s, k) => s + Number(k.amount ?? 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Kosten"
            subtitle={`${items.length} ${items.length === 1 ? 'kostenpost' : 'kostenposten'}`}
            meta={totaal > 0 ? formatEUR(totaal) : undefined}
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              magMaken ? (
                <HeaderIconButton icon={Plus} label="Nieuwe kostenpost" onPress={openNieuw} />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Wallet size={40} color={ds.green} strokeWidth={1.6} />}
            title="Geen kosten"
            message={
              magMaken
                ? 'Leg met de plusknop je eerste kostenpost vast.'
                : (waaromNiet('kosten', 'maken') ?? 'Er zijn nog geen kosten geregistreerd.')
            }
          />
        ) : (
          <>
            <AppSection title="Alle kosten" count={items.length} variant="eyebrow" />
            <AppListGroup>
              {items.map((k, i) => {
                const opSlot = isVergrendeld(k);
                return (
                  <AppListItem
                    key={k.id}
                    first={i === 0}
                    icon={opSlot ? Lock : Wallet}
                    title={k.description ?? 'Kostenpost'}
                    subtitle={subtitleFor(k)}
                    onPress={magWijzigen ? () => openBewerk(k) : undefined}
                    trailing={
                      <Text style={styles.bedrag}>{formatEUR(Number(k.amount ?? 0))}</Text>
                    }
                  />
                );
              })}
            </AppListGroup>
            <Text style={styles.voetnoot}>
              Kosten met een slotje komen uit je boekhouding of van werkbonmateriaal. Die pas je
              aan bij de bron; verwijderen kan hier wel.
            </Text>
          </>
        )}
      </AppScreen>

      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Kostenpost bewerken' : 'Nieuwe kostenpost'}
        error={saveError}
        saving={saving}
        submitDisabled={
          concept?.opSlot || !concept?.description.trim() || !concept?.bedrag.trim()
        }
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
        destructive={
          concept?.id && magVerwijderen
            ? { label: 'Kostenpost verwijderen', onPress: verwijderen }
            : undefined
        }
      >
        {concept?.opSlot ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              Deze kostenpost komt uit je boekhouding of hoort bij werkbonmateriaal. De inhoud pas
              je aan bij de bron; verwijderen kan hier wel.
            </Text>
          </View>
        ) : null}

        <FormField
          label="Omschrijving"
          value={concept?.description ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, description: v } : c))}
          placeholder="Bijv. Dakpannen 200 stuks"
          autoFocus={!concept?.id}
        />

        <View style={styles.rij}>
          <View style={{ flex: 1.3 }}>
            <FormField
              label="Bedrag"
              value={concept?.bedrag ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, bedrag: v } : c))}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Btw %"
              value={concept?.btwPct ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, btwPct: v } : c))}
              placeholder="21"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.schakelRij}>
          <View style={{ flex: 1 }}>
            <Text style={styles.schakelTitel}>Bedrag is inclusief btw</Text>
            <Text style={styles.schakelUitleg}>
              Staat dit uit, dan is het ingevulde bedrag exclusief btw.
            </Text>
          </View>
          <Switch
            value={concept?.btwInclusief ?? false}
            onValueChange={(v) => setConcept((c) => (c ? { ...c, btwInclusief: v } : c))}
            disabled={saving}
          />
        </View>

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>Categorie</Text>
          <View style={styles.chipRij}>
            {KOSTEN_CATEGORIEEN.map((cat) => {
              const actief = concept?.category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setConcept((c) => (c ? { ...c, category: cat } : c))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actief }}
                  style={[styles.chip, actief && styles.chipActief]}
                >
                  <Text style={[styles.chipTekst, actief && styles.chipTekstActief]}>{cat}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <SelectField
          label="Leverancier"
          value={concept?.leverancierId ?? null}
          options={leveranciers}
          onChange={(id) => setConcept((c) => (c ? { ...c, leverancierId: id } : c))}
          placeholder={leveranciers.length === 0 ? 'Nog geen leveranciers' : 'Kies een leverancier'}
          disabled={leveranciers.length === 0}
          hint="Verplicht: zonder leverancier weigert de administratie de kostenpost."
        />

        <View style={styles.levBlok}>
          <FormField
            label="Nieuwe leverancier"
            value={nieuweLeverancier}
            onChangeText={setNieuweLeverancier}
            placeholder="Naam van de leverancier"
            hint={
              leveranciers.length === 0
                ? 'Je hebt nog geen leveranciers. Voeg er hier één toe.'
                : 'Staat je leverancier er niet bij? Voeg hem hier toe.'
            }
          />
          {levFout ? <Text style={styles.levFout}>{levFout}</Text> : null}
          <Button
            label={levBezig ? 'Toevoegen…' : 'Leverancier toevoegen'}
            variant="secondary"
            loading={levBezig}
            disabled={!nieuweLeverancier.trim() || levBezig || saving}
            onPress={leverancierToevoegen}
          />
        </View>

        <DateField
          label="Kostendatum"
          value={concept?.datum || null}
          onChange={(v) => setConcept((c) => (c ? { ...c, datum: v } : c))}
          placeholder="Kies"
        />

        <SelectField
          label="Klant"
          value={concept?.customerId ?? null}
          options={klanten}
          onChange={(id) => setConcept((c) => (c ? { ...c, customerId: id } : c))}
          allowEmpty
          emptyLabel="Algemene kosten"
          placeholder="Algemene kosten"
        />

        <SelectField
          label="Project"
          value={concept?.projectId ?? null}
          options={projecten}
          onChange={(id) => setConcept((c) => (c ? { ...c, projectId: id } : c))}
          allowEmpty
          emptyLabel="Geen project"
          placeholder="Geen project"
          hint="Bepaalt onder welk project de nacalculatie deze kost meetelt."
        />
      </FormSheet>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    bedrag: { fontSize: 14, fontWeight: '700', color: t.ink2 },
    label: { ...typography.label, color: t.ink2 },
    rij: { flexDirection: 'row', gap: spacing.md },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipActief: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    chipTekstActief: { color: t.greenInk },
    schakelRij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    schakelTitel: { fontSize: 14.5, fontWeight: '700', color: t.ink },
    schakelUitleg: { fontSize: 12.5, color: t.muted, marginTop: 2 },
    slotBanner: { padding: spacing.md, borderRadius: radius.md, backgroundColor: t.statusDraftBg },
    slotTekst: { fontSize: 13, lineHeight: 19, color: t.statusDraftFg, fontWeight: '600' },
    levBlok: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.bgAlt,
    },
    levFout: { fontSize: 12.5, fontWeight: '600', color: t.statusRejectFg },
    voetnoot: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
    },
  });
