import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderKanban, Plus } from 'lucide-react-native';
import {
  AppListGroup,
  AppListItem,
  AppScreen,
  AppSection,
  AppTopBar,
  EmptyState,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  PermissionGate,
  SelectField,
  type SelectOption,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  createDeal,
  DEAL_PRIORITEITEN,
  deleteDeal,
  listDeals,
  listPipelineStages,
  prioriteitLabel,
  updateDeal,
  type DealRow,
  type PipelineStage,
} from '@/services/dealService';
import { listCustomers } from '@/services/customerService';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { formatEUR } from '@/lib/format';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { alsTekst } from '@/lib/notitieTekst';

/**
 * Pipeline — deals per fase, uit dezelfde `deals`-tabel als het dashboard.
 *
 * Rechten: zien én aanmaken/wijzigen vragen `verkoop` (server-side afgedwongen,
 * dus zonder dat recht zijn deals überhaupt onzichtbaar). Verwijderen vraagt rol
 * admin — een aparte gate, want een planner met verkooprecht mag wel bewerken en
 * niet weggooien.
 */

export default function PipelineScreen() {
  return (
    <PermissionGate permission="verkoop" label="Pipeline">
      <PipelineScreenInhoud />
    </PermissionGate>
  );
}

type Concept = {
  id: string | null;
  title: string;
  customerId: string | null;
  stageId: string | null;
  bedrag: string;
  priority: string;
  description: string;
};

function subtitleFor(d: DealRow): string {
  const delen: string[] = [];
  if (d.customer?.name) delen.push(d.customer.name);
  if (d.priority && d.priority !== 'med') delen.push(prioriteitLabel(d.priority));
  if (d.lost_reason) delen.push(`Verloren: ${d.lost_reason}`);
  return delen.join(' · ') || 'Deal';
}

function PipelineScreenInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag } = usePermissions();

  const [deals, setDeals] = useState<DealRow[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [klanten, setKlanten] = useState<SelectOption[]>([]);  const [error, setError] = useState<string | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();

  const magMaken = mag('pipeline', 'maken');
  const magWijzigen = mag('pipeline', 'wijzigen');
  const magVerwijderen = mag('pipeline', 'verwijderen');

  const load = useCallback(async () => {
    setError(null);

    const [stageRes, dealRes, klantRes] = await Promise.all([
      listPipelineStages(),
      listDeals(),
      listCustomers(),
    ]);

    if (stageRes.error || dealRes.error) {
      setError(stageRes.error ?? dealRes.error);
    } else {
      setStages(stageRes.data);
      setDeals(dealRes.data);
    }
    if (!klantRes.error) {
      setKlanten(
        klantRes.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant', sub: k.city ?? undefined })),
      );
    }
  }, []);


  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });



  const stageOpties = useMemo<SelectOption[]>(
    () => stages.map((s) => ({ id: s.id, label: s.name ?? 'Fase' })),
    [stages],
  );

  // Deals per fase, in de volgorde van de fasen. Zonder bekende fase → "Overig".
  const gegroepeerd = useMemo(() => {
    const perFase = new Map<string, DealRow[]>();
    for (const d of deals) {
      const sleutel = d.stage_id ?? 'overig';
      const lijst = perFase.get(sleutel) ?? [];
      lijst.push(d);
      perFase.set(sleutel, lijst);
    }
    const groepen = stages
      .map((s) => ({ id: s.id, naam: s.name ?? 'Fase', rijen: perFase.get(s.id) ?? [] }))
      .filter((g) => g.rijen.length > 0);
    const overig = perFase.get('overig') ?? [];
    if (overig.length > 0) groepen.push({ id: 'overig', naam: 'Overig', rijen: overig });
    return groepen;
  }, [deals, stages]);

  const openNieuw = () => {
    setSaveError(null);
    setConcept({
      id: null,
      title: '',
      customerId: null,
      // Standaard de eerste fase — dezelfde plek waar het dashboard een nieuwe
      // lead neerzet.
      stageId: stages[0]?.id ?? null,
      bedrag: '',
      priority: 'med',
      description: '',
    });
  };

  const openBewerk = (d: DealRow) => {
    if (!magWijzigen) return;
    setSaveError(null);
    setConcept({
      id: d.id,
      title: d.title ?? '',
      customerId: d.customer_id,
      stageId: d.stage_id,
      bedrag: d.expected_revenue != null ? String(d.expected_revenue) : '',
      priority: d.priority ?? 'med',
      description: alsTekst(d.description),
    });
  };

  const opslaan = () => {
    if (!concept) return;
    // Komma als decimaalteken is wat een Nederlandse gebruiker typt.
    const bedrag = Number(concept.bedrag.replace(',', '.') || 0);
    const invoer = {
      title: concept.title,
      customer_id: concept.customerId,
      stage_id: concept.stageId,
      expected_revenue: bedrag,
      priority: concept.priority,
      description: concept.description,
    };
    save(() => (concept.id ? updateDeal(concept.id, invoer) : createDeal(invoer)), {
      onSuccess: async () => {
        setConcept(null);
        await herlaad();
      },
    });
  };

  const verwijderen = () => {
    if (!concept?.id) return;
    const id = concept.id;
    bevestigVerwijderen('Deal', () => {
      save(() => deleteDeal(id), {
        onSuccess: async () => {
          setConcept(null);
          await herlaad();
        },
      });
    });
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Pipeline laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Pipeline" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const totaal = deals.reduce((s, d) => s + Number(d.expected_revenue ?? 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Pipeline"
            subtitle={`${deals.length} ${deals.length === 1 ? 'deal' : 'deals'}`}
            meta={totaal > 0 ? formatEUR(totaal) : undefined}
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              magMaken ? (
                <HeaderIconButton icon={Plus} label="Nieuwe deal" onPress={openNieuw} />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {deals.length === 0 ? (
          <EmptyState
            icon={<FolderKanban size={40} color={ds.green} strokeWidth={1.6} />}
            title="Geen deals"
            message={
              magMaken
                ? 'Zet met de plusknop je eerste deal in de pipeline.'
                : 'Er staan nog geen deals in de pipeline.'
            }
          />
        ) : (
          gegroepeerd.map((groep) => (
            <View key={groep.id}>
              <AppSection title={groep.naam} count={groep.rijen.length} variant="eyebrow" />
              <AppListGroup>
                {groep.rijen.map((d, i) => (
                  <AppListItem
                    key={d.id}
                    first={i === 0}
                    icon={FolderKanban}
                    title={d.title ?? 'Deal'}
                    subtitle={subtitleFor(d)}
                    onPress={magWijzigen ? () => openBewerk(d) : undefined}
                    trailing={
                      <Text style={styles.bedrag}>
                        {formatEUR(Number(d.expected_revenue ?? 0))}
                      </Text>
                    }
                  />
                ))}
              </AppListGroup>
            </View>
          ))
        )}
      </AppScreen>

      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Deal bewerken' : 'Nieuwe deal'}
        error={saveError}
        saving={saving}
        submitDisabled={!concept?.title.trim()}
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
        destructive={
          concept?.id && magVerwijderen
            ? { label: 'Deal verwijderen', onPress: verwijderen }
            : undefined
        }
      >
        <FormField
          label="Titel"
          value={concept?.title ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, title: v } : c))}
          placeholder="Bijv. Dakrenovatie Jansen"
          autoFocus={!concept?.id}
        />
        <SelectField
          label="Klant"
          value={concept?.customerId ?? null}
          options={klanten}
          onChange={(id) => setConcept((c) => (c ? { ...c, customerId: id } : c))}
          allowEmpty
          emptyLabel="Geen klant"
          placeholder="Geen klant"
        />
        <SelectField
          label="Fase"
          value={concept?.stageId ?? null}
          options={stageOpties}
          onChange={(id) => setConcept((c) => (c ? { ...c, stageId: id } : c))}
          placeholder="Kies een fase"
        />
        <FormField
          label="Verwachte omzet"
          value={concept?.bedrag ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, bedrag: v } : c))}
          placeholder="0,00"
          keyboardType="decimal-pad"
          hint="Bedrag exclusief btw."
        />
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>Prioriteit</Text>
          <View style={styles.chipRij}>
            {DEAL_PRIORITEITEN.map((p) => {
              const actief = concept?.priority === p.id;
              return (
                <Pressable
                  key={String(p.id)}
                  onPress={() => setConcept((c) => (c ? { ...c, priority: String(p.id) } : c))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actief }}
                  style={[styles.chip, actief && styles.chipActief]}
                >
                  <Text style={[styles.chipTekst, actief && styles.chipTekstActief]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <FormField
          label="Omschrijving"
          value={concept?.description ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, description: v } : c))}
          placeholder="Optioneel"
          multiline
        />
      </FormSheet>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    bedrag: { fontSize: 14, fontWeight: '700', color: t.ink2 },
    label: { ...typography.label, color: t.ink2 },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipActief: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    chipTekstActief: { color: t.greenInk },
  });
