import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Briefcase, Plus, StickyNote, Trash2 } from 'lucide-react-native';
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
  SelectField,
  type SelectOption,
  DateField,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  addProjectNote,
  createProject,
  deleteProject,
  deleteProjectNote,
  listProjectNotes,
  listProjects,
  PROJECT_STATUS_OPTIES,
  projectStatusLabel,
  updateProject,
  type ProjectNote,
  type ProjectRow,
} from '@/services/projectService';
import { listCustomers } from '@/services/customerService';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { formatDateNL, formatEUR } from '@/lib/format';
import { getUserId } from '@/lib/sessionContext';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';

/**
 * Projecten — dezelfde `projects`-tabel en dezelfde statussen als het dashboard.
 *
 * Let op het verschil tussen zien en bewerken: de SELECT-policy laat een
 * medewerker met `alles_inzien` álle projecten zien, maar INSERT/UPDATE vragen
 * `projecten_bewerken` en DELETE vraagt rol admin. Inzage is hier dus
 * uitdrukkelijk geen bewerkrecht, en de knoppen volgen de policy en niet de
 * lijst.
 */

type Concept = {
  id: string | null;
  name: string;
  status: string;
  customerId: string | null;
  waarde: string;
  begroteUren: string;
  startDatum: string;
  deadline: string;
  description: string;
};

function subtitleFor(p: ProjectRow): string {
  const delen: string[] = [projectStatusLabel(p.status)];
  if (p.customer?.name) delen.push(p.customer.name);
  if (p.deadline) delen.push(`Deadline ${formatDateNL(p.deadline)}`);
  return delen.join(' · ');
}

export default function ProjectsScreen() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();

  const [items, setItems] = useState<ProjectRow[]>([]);
  const [klanten, setKlanten] = useState<SelectOption[]>([]);  const [error, setError] = useState<string | null>(null);

  const [concept, setConcept] = useState<Concept | null>(null);
  const [notitiesVoor, setNotitiesVoor] = useState<ProjectRow | null>(null);
  const [notities, setNotities] = useState<ProjectNote[]>([]);
  const [nieuweNotitie, setNieuweNotitie] = useState('');

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveNotitie, saving: notitieBezig, error: notitieFout } = useSave<unknown>();

  const magMaken = mag('projecten', 'maken');
  const magWijzigen = mag('projecten', 'wijzigen');
  const magVerwijderen = mag('projecten', 'verwijderen');
  const magNotitie = mag('projectNotities', 'maken');
  const eigenId = getUserId();

  const load = useCallback(async () => {
    setError(null);
    const [projRes, klantRes] = await Promise.all([listProjects(), listCustomers()]);
    if (projRes.error) setError(projRes.error);
    else setItems(projRes.data);
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



  const openNieuw = () => {
    setSaveError(null);
    setConcept({
      id: null,
      name: '',
      status: 'concept',
      customerId: null,
      waarde: '',
      begroteUren: '',
      startDatum: '',
      deadline: '',
      description: '',
    });
  };

  const openBewerk = (p: ProjectRow) => {
    if (!magWijzigen) return;
    setSaveError(null);
    setConcept({
      id: p.id,
      name: p.name ?? '',
      status: p.status ?? 'concept',
      customerId: p.customer_id,
      waarde: p.project_value != null ? String(p.project_value) : '',
      begroteUren: p.quoted_hours != null ? String(p.quoted_hours) : '',
      startDatum: p.start_date ?? '',
      deadline: p.deadline ?? '',
      description: p.description ?? '',
    });
  };

  const opslaan = () => {
    if (!concept) return;
    const getal = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : 0);
    const invoer = {
      name: concept.name,
      status: concept.status,
      customer_id: concept.customerId,
      project_value: getal(concept.waarde),
      quoted_hours: getal(concept.begroteUren),
      start_date: concept.startDatum || null,
      deadline: concept.deadline || null,
      description: concept.description,
    };
    save(() => (concept.id ? updateProject(concept.id, invoer) : createProject(invoer)), {
      onSuccess: async () => {
        setConcept(null);
        await herlaad();
      },
    });
  };

  const verwijderen = () => {
    if (!concept?.id) return;
    const id = concept.id;
    bevestigVerwijderen(
      'Project',
      () => {
        save(() => deleteProject(id), {
          onSuccess: async () => {
            setConcept(null);
            await herlaad();
          },
        });
      },
      'Werkbonnen en facturen die eraan hangen blijven bestaan, maar verliezen hun projectkoppeling.',
    );
  };

  const openNotities = async (p: ProjectRow) => {
    setNotitiesVoor(p);
    setNieuweNotitie('');
    setNotities([]);
    const { data } = await listProjectNotes(p.id);
    setNotities(data);
  };

  const notitieToevoegen = () => {
    if (!notitiesVoor) return;
    const projectId = notitiesVoor.id;
    saveNotitie(() => addProjectNote(projectId, nieuweNotitie), {
      onSuccess: async () => {
        setNieuweNotitie('');
        const { data } = await listProjectNotes(projectId);
        setNotities(data);
      },
    });
  };

  const notitieVerwijderen = (n: ProjectNote) => {
    bevestigVerwijderen('Notitie', () => {
      saveNotitie(() => deleteProjectNote(n.id), {
        onSuccess: async () => {
          if (!notitiesVoor) return;
          const { data } = await listProjectNotes(notitiesVoor.id);
          setNotities(data);
        },
      });
    });
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Projecten laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Projecten" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Projecten"
            subtitle={`${items.length} ${items.length === 1 ? 'project' : 'projecten'}`}
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              magMaken ? (
                <HeaderIconButton icon={Plus} label="Nieuw project" onPress={openNieuw} />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={40} color={ds.green} strokeWidth={1.6} />}
            title="Geen projecten"
            message={
              magMaken
                ? 'Maak met de plusknop je eerste project aan.'
                : (waaromNiet('projecten', 'maken') ?? 'Er zijn nog geen projecten.')
            }
          />
        ) : (
          <>
            <AppSection title="Alle projecten" count={items.length} variant="eyebrow" />
            <AppListGroup>
              {items.map((p, i) => (
                <AppListItem
                  key={p.id}
                  first={i === 0}
                  icon={Briefcase}
                  title={p.name ?? 'Project'}
                  subtitle={subtitleFor(p)}
                  onPress={magWijzigen ? () => openBewerk(p) : undefined}
                  trailing={
                    <View style={styles.trailing}>
                      {p.project_value ? (
                        <Text style={styles.bedrag}>{formatEUR(Number(p.project_value))}</Text>
                      ) : null}
                      <Pressable
                        onPress={() => openNotities(p)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Notities bij ${p.name ?? 'project'}`}
                        style={styles.notitieKnop}
                      >
                        <StickyNote size={16} color={t.muted} />
                      </Pressable>
                    </View>
                  }
                />
              ))}
            </AppListGroup>
          </>
        )}
      </AppScreen>

      {/* Project aanmaken / bewerken */}
      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Project bewerken' : 'Nieuw project'}
        error={saveError}
        saving={saving}
        submitDisabled={!concept?.name.trim()}
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
        destructive={
          concept?.id && magVerwijderen
            ? { label: 'Project verwijderen', onPress: verwijderen }
            : undefined
        }
      >
        <FormField
          label="Projectnaam"
          value={concept?.name ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, name: v } : c))}
          placeholder="Bijv. Dakrenovatie Kerkstraat 12"
          autoFocus={!concept?.id}
        />

        <View style={{ gap: spacing.xs }}>
          <Text style={styles.label}>Status</Text>
          <View style={styles.chipRij}>
            {PROJECT_STATUS_OPTIES.map((s) => {
              const actief = concept?.status === s.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setConcept((c) => (c ? { ...c, status: s.id } : c))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actief }}
                  style={[styles.chip, actief && styles.chipActief]}
                >
                  <Text style={[styles.chipTekst, actief && styles.chipTekstActief]}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <SelectField
          label="Klant"
          value={concept?.customerId ?? null}
          options={klanten}
          onChange={(id) => setConcept((c) => (c ? { ...c, customerId: id } : c))}
          allowEmpty
          emptyLabel="Geen klant"
          placeholder="Geen klant"
        />

        <View style={styles.rij}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Projectwaarde"
              value={concept?.waarde ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, waarde: v } : c))}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Begrote uren"
              value={concept?.begroteUren ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, begroteUren: v } : c))}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.rij}>
          <View style={{ flex: 1 }}>
            <DateField
              label="Startdatum"
              value={concept?.startDatum || null}
              onChange={(v) => setConcept((c) => (c ? { ...c, startDatum: v } : c))}
              placeholder="Kies"
              maximum={concept?.deadline || null}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DateField
              label="Deadline"
              value={concept?.deadline || null}
              onChange={(v) => setConcept((c) => (c ? { ...c, deadline: v } : c))}
              placeholder="Kies"
              minimum={concept?.startDatum || null}
              hint="Kan niet vóór de startdatum liggen."
            />
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

      {/* Projectnotities */}
      <FormSheet
        visible={notitiesVoor !== null}
        title="Projectnotities"
        subtitle={notitiesVoor?.name ?? undefined}
        error={notitieFout}
        saving={notitieBezig}
        submitLabel="Notitie toevoegen"
        submitDisabled={!nieuweNotitie.trim() || !magNotitie}
        onSubmit={notitieToevoegen}
        onClose={() => setNotitiesVoor(null)}
      >
        {magNotitie ? (
          <FormField
            label="Nieuwe notitie"
            value={nieuweNotitie}
            onChangeText={setNieuweNotitie}
            placeholder="Wat moet er bewaard blijven?"
            multiline
          />
        ) : (
          <Text style={styles.uitleg}>
            {waaromNiet('projectNotities', 'maken') ?? 'Je kunt hier geen notities toevoegen.'}
          </Text>
        )}

        {notities.length === 0 ? (
          <Text style={styles.uitleg}>Er zijn nog geen notities bij dit project.</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {notities.map((n) => (
              <View key={n.id} style={styles.notitie}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notitieTekst}>{n.note}</Text>
                  <Text style={styles.notitieMeta}>{formatDateNL(n.created_at)}</Text>
                </View>
                {/* De policy laat de auteur en admin/planner verwijderen; die
                    eerste helft kan alleen hier worden gezien. */}
                {n.created_by === eigenId || mag('team', 'wijzigen') ? (
                  <Pressable
                    onPress={() => notitieVerwijderen(n)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Notitie verwijderen"
                  >
                    <Trash2 size={16} color={t.statusRejectFg} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </FormSheet>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    bedrag: { fontSize: 14, fontWeight: '700', color: t.ink2 },
    notitieKnop: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bgAlt,
    },
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
    uitleg: { fontSize: 13.5, lineHeight: 19, color: t.muted },
    notitie: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    notitieTekst: { fontSize: 14, lineHeight: 20, color: t.ink },
    notitieMeta: { fontSize: 12, color: t.muted, marginTop: 4 },
  });
