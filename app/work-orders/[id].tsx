import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  Circle,
  Clock,
  FolderKanban,
  ImageIcon,
  ListChecks,
  Lock,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  PlusCircle,
  Tag,
  Trash2,
  Truck,
  User as UserIcon,
  Users,
} from 'lucide-react-native';
import {
  AnimatedScreen,
  AppTopBar,
  Button,
  DateField,
  ErrorState,
  FormField,
  LoadingScreen,
  StatusBadge,
  StatusBarScrim,
  statusLabel,
} from '@/components';
import { useAuth, usePermissions, useTheme } from '@/providers';
import * as ImagePicker from 'expo-image-picker';
import {
  addWorkOrderMaterial,
  addWorkOrderNote,
  addWorkOrderTask,
  canAddTask,
  canBookHours,
  canDeleteMaterial,
  canEditWorkOrder,
  deleteWorkOrderMaterial,
  deleteWorkOrderPhoto,
  deleteWorkOrderTask,
  getAllowedNextStatuses,
  getWorkOrder,
  listTeamProfiles,
  listWorkOrderMaterials,
  listWorkOrderNotes,
  listWorkOrderPhotos,
  listWorkOrderTasks,
  setTaskDone,
  updateMaterialAmount,
  updateWorkOrderStatus,
  uploadWorkOrderPhoto,
  type FotoCategorie,
  listVoertuigen,
} from '@/services/workOrderService';
import { base64NaarBytes } from '@/lib/base64';
import {
  createWerkbonUur,
  listWerkbonUren,
} from '@/services/werkbonUrenService';
import { isGeldigeISODatum, vandaagISO } from '@/lib/datum';
import { useLaden } from '@/lib/useLaden';
import {
  formatDagLabel,
  formatDateLongNL,
  formatDateNL,
  formatHours,
  formatTimeNL,
} from '@/lib/format';
import { ds, dsShadow, dsShadowGreen, spacing, type ThemeColors } from '@/theme';
import type {
  WerkbonUur,
  WorkOrderMaterial,
  WorkOrderNote,
  WorkOrderPhoto,
  WorkOrderStatus,
  WorkOrderTask,
  WorkOrderWithRelations,
} from '@/types/domain';

// Dark "ink" surface kept constant across themes (status button).
/** Vaste inkt op de donkere herokaart — blijft in beide thema's donker. */
const INK_FIXED = ds.greenInk;

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

export default function WorkOrderDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, role } = useAuth();
  const { can, hasFeature, readonly, loaded: rechtenGeladen } = usePermissions();
  const { colors: th } = useTheme();
  const styles = useMemo(() => makeStyles(th), [th]);

  const [workOrder, setWorkOrder] = useState<WorkOrderWithRelations | null>(null);
  const [voertuigen, setVoertuigen] = useState<Record<string, { naam: string; kleur: string | null }>>({});
  const [uren, setUren] = useState<WerkbonUur[]>([]);
  const [materials, setMaterials] = useState<WorkOrderMaterial[]>([]);
  const [tasks, setTasks] = useState<WorkOrderTask[]>([]);
  const [notes, setNotes] = useState<WorkOrderNote[]>([]);
  const [photos, setPhotos] = useState<WorkOrderPhoto[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  /**
   * Failures of the child lists are kept apart from the page-level error, so a
   * blocked sub-query is reported as a failure instead of being rendered as an
   * empty section ("geen materialen", "0 uren") that looks like real data.
   */
  const [partialErrors, setPartialErrors] = useState<Record<string, string | null>>({});
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState(false);
  const [timeModal, setTimeModal] = useState(false);
  const [taskModal, setTaskModal] = useState<{ meerwerk: boolean } | null>(null);
  const [materialModal, setMaterialModal] = useState(false);
  const [fotoBezig, setFotoBezig] = useState(false);

  const load = useCallback(
    async () => {
      if (!id) return;
      setError(null);

      const [woResult, urenResult, matResult, taskResult, noteResult, photoResult] =
        await Promise.all([
          getWorkOrder(id),
          listWerkbonUren(id),
          listWorkOrderMaterials(id),
          listWorkOrderTasks(id),
          listWorkOrderNotes(id),
          listWorkOrderPhotos(id),
        ]);

      if (woResult.error) {
        setError(woResult.error);
        setWorkOrder(null);
      } else if (!woResult.data) {
        // No error and no row: RLS filtered it out, or it is gone.
        setError('Deze werkbon bestaat niet of je hebt er geen toegang toe.');
        setWorkOrder(null);
      } else {
        setWorkOrder(woResult.data);
        // Names behind assigned_to_ids — the array carries no foreign key.
        const ids = [
          ...(woResult.data.assigned_to_ids ?? []),
          ...(woResult.data.verantwoordelijke_ids ?? []),
        ];
        const { data: names } = await listTeamProfiles(ids);
        setTeamNames(names);
        // Voertuigen staan sinds de dag-planning in een uuid[] zonder relatie,
        // dus die namen halen we los op. Mislukt dat, dan blijft de werkbon
        // gewoon staan — zonder busnaam.
        const { data: bussen } = await listVoertuigen(woResult.data.voertuig_ids ?? []);
        setVoertuigen(bussen);
      }

      // A child list that fails must not blank the page — show what loaded and
      // name what did not.
      setUren(urenResult.data);
      setMaterials(matResult.data);
      setTasks(taskResult.data);
      setNotes(noteResult.data);
      setPhotos(photoResult.data);
      setPartialErrors({
        uren: urenResult.error,
        materialen: matResult.error,
        taken: taskResult.error,
        notities: noteResult.error,
        fotos: photoResult.error,
      });

    },
    [id],
  );

  /**
   * Terugkomen op dit scherm leest de bon opnieuw, zodat een wijziging die
   * intussen op het dashboard is gedaan meteen klopt. Dat gebeurt stil: alleen
   * een echte pull-to-refresh zet `refreshing` en toont de indicator.
   */
  const { loading, refreshing, onRefresh, opnieuw } = useLaden(load, { onFout: setError });

  const voertuigNamen = (workOrder?.voertuig_ids ?? [])
    .map((id) => voertuigen[id]?.naam)
    .filter((n): n is string => !!n);

  const isSigned = !!workOrder?.ondertekend_op;

  /**
   * De rechtenstand, doorgegeven aan de servicelaag die de RLS-predicaten
   * naspeelt. `gedeelde_werkruimte` komt uit get_plan_status() en is exact
   * waar bb_gedeelde_werkruimte() op draait — dat gat is hiermee dicht.
   */
  const rechten = useMemo(
    () => ({
      userId: user?.id ?? null,
      role,
      can,
      gedeeldeWerkruimte: hasFeature('gedeelde_werkruimte'),
      readonly,
    }),
    [user?.id, role, can, hasFeature, readonly],
  );

  // Zolang de rechten laden geldt: niets aanbieden. Anders flitst een knop die
  // deze gebruiker helemaal niet mag gebruiken.
  const canManage = workOrder && rechtenGeladen ? canEditWorkOrder(workOrder, rechten) : false;
  const canBook = workOrder && rechtenGeladen ? canBookHours(workOrder, rechten) : false;
  // Regels toevoegen/weggooien eist de ROL admin of planner (zie de policies op
  // werkbon_taken en de delete-policy op werkbon_materialen).
  const canTasks = workOrder && rechtenGeladen ? canAddTask(workOrder, rechten) : false;
  const canDelMaterial = workOrder && rechtenGeladen ? canDeleteMaterial(workOrder, rechten) : false;
  // Notities mag iedereen binnen het bedrijf; alleen een read-only account niet.
  const canNote = rechtenGeladen && !readonly && !isSigned;

  const handleStatusChange = (next: WorkOrderStatus) => {
    if (!workOrder) return;
    Alert.alert('Status wijzigen', `Werkbon markeren als "${statusLabel(next)}"?`, [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Bevestigen',
        onPress: async () => {
          setStatusUpdating(true);
          const { data, error: updateError } = await updateWorkOrderStatus(workOrder, next);
          setStatusUpdating(false);
          if (updateError || !data) {
            Alert.alert('Status niet opgeslagen', updateError ?? 'Probeer het opnieuw.');
            return;
          }
          // Take the row the database returned, not our guess of it.
          setWorkOrder(data);
        },
      },
    ]);
  };

  /**
   * Het label van de primaire knop volgt de toegestane overgang. Is er maar
   * één volgende status, dan zegt de knop precies wat er gebeurt; zijn er
   * meerdere, dan opent hij de keuze — hetzelfde gedrag als voorheen.
   */
  const volgendeStatussen = workOrder ? getAllowedNextStatuses(workOrder.status, role) : [];
  const primaireActie =
    volgendeStatussen.length === 1
      ? volgendeStatussen[0] === 'in_uitvoering'
        ? 'Klus starten'
        : volgendeStatussen[0] === 'afgerond'
          ? 'Klus afronden'
          : `Naar ${statusLabel(volgendeStatussen[0]!).toLowerCase()}`
      : 'Status wijzigen';

  const openStatusActions = () => {
    if (!workOrder) return;
    if (isSigned) {
      Alert.alert(
        'Werkbon is ondertekend',
        'Deze werkbon is afgetekend door de klant en staat op slot. Maak een nieuwe werkbon voor een correctie.',
      );
      return;
    }
    if (!canManage) {
      Alert.alert(
        'Geen rechten',
        'Alleen de verantwoordelijke voor deze werkbon, een admin of een planner kan de status wijzigen.',
      );
      return;
    }
    const next = getAllowedNextStatuses(workOrder.status, role);
    if (next.length === 0) {
      Alert.alert('Geen status-wijzigingen mogelijk', 'Deze werkbon kan niet verder.');
      return;
    }
    const buttons = next.map((s) => ({
      text: statusLabel(s),
      onPress: () => handleStatusChange(s),
    }));
    Alert.alert('Status wijzigen', undefined, [
      ...buttons,
      { text: 'Annuleren', style: 'cancel' as const },
    ]);
  };

  const handleToggleTask = async (task: WorkOrderTask) => {
    if (isSigned || !canManage) {
      Alert.alert(
        isSigned ? 'Werkbon is ondertekend' : 'Geen rechten',
        isSigned
          ? 'Deze werkbon staat op slot en kan niet meer worden gewijzigd.'
          : 'Alleen de verantwoordelijke, een admin of een planner kan taken afvinken.',
      );
      return;
    }
    setBusyTaskId(task.id);
    const { data, error: taskError } = await setTaskDone(task.id, !task.afgerond);
    setBusyTaskId(null);
    if (taskError || !data) {
      Alert.alert('Niet opgeslagen', taskError ?? 'Probeer het opnieuw.');
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)));
  };

  /** Bevestigen en verwijderen, met de foutmelding van de server als die komt. */
  const bevestigVerwijderen = (titel: string, tekst: string, doe: () => Promise<string | null>) => {
    Alert.alert(titel, tekst, [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Verwijderen',
        style: 'destructive',
        onPress: async () => {
          const fout = await doe();
          if (fout) Alert.alert('Niet verwijderd', fout);
        },
      },
    ]);
  };

  const handleAddTask = async (omschrijving: string, meerwerk: boolean) => {
    if (!workOrder) return { error: 'Werkbon niet geladen.' };
    const volgende = tasks.reduce((max, t) => Math.max(max, t.volgorde), -1) + 1;
    const { data, error: taskError } = await addWorkOrderTask({
      werkbon_id: workOrder.id,
      company_id: workOrder.company_id,
      omschrijving,
      is_meerwerk: meerwerk,
      volgorde: volgende,
    });
    if (taskError || !data) return { error: taskError ?? 'Opslaan mislukt.' };
    setTasks((prev) => [...prev, data]);
    return { error: null };
  };

  const handleDeleteTask = (task: WorkOrderTask) =>
    bevestigVerwijderen(
      task.is_meerwerk ? 'Meerwerk verwijderen' : 'Taak verwijderen',
      `"${task.omschrijving}" wordt definitief verwijderd.`,
      async () => {
        const { error: e } = await deleteWorkOrderTask(task.id);
        if (!e) setTasks((prev) => prev.filter((t) => t.id !== task.id));
        return e;
      },
    );

  const handleAddMaterial = async (naam: string, eenheid: string, aantal: number) => {
    if (!workOrder) return { error: 'Werkbon niet geladen.' };
    const { data, error: matError } = await addWorkOrderMaterial({
      werkbon_id: workOrder.id,
      company_id: workOrder.company_id,
      naam,
      eenheid,
      aantal,
    });
    if (matError || !data) return { error: matError ?? 'Opslaan mislukt.' };
    setMaterials((prev) => [...prev, data].sort((a, b) => a.naam.localeCompare(b.naam)));
    return { error: null };
  };

  /** Aantal bijstellen met +/- knoppen; onder 1 gaat het naar verwijderen. */
  const handleMaterialAmount = async (m: WorkOrderMaterial, nieuwAantal: number) => {
    if (nieuwAantal < 1) return;
    const { data, error: e } = await updateMaterialAmount(m.id, nieuwAantal);
    if (e || !data) {
      Alert.alert('Niet opgeslagen', e ?? 'Probeer het opnieuw.');
      return;
    }
    setMaterials((prev) => prev.map((x) => (x.id === data.id ? data : x)));
  };

  const handleDeleteMaterial = (m: WorkOrderMaterial) =>
    bevestigVerwijderen('Materiaal verwijderen', `"${m.naam}" wordt van deze werkbon gehaald.`, async () => {
      const { error: e } = await deleteWorkOrderMaterial(m.id);
      if (!e) setMaterials((prev) => prev.filter((x) => x.id !== m.id));
      return e;
    });

  /**
   * Foto toevoegen: eerst waar hij vandaan komt, dan in welke categorie hij
   * hoort (de CHECK op werkbon_fotos kent alleen voor/tijdens/na).
   */
  const kiesFoto = () => {
    if (!workOrder) return;
    Alert.alert('Foto toevoegen', 'Waar komt de foto vandaan?', [
      { text: 'Camera', onPress: () => kiesCategorie('camera') },
      { text: 'Fotobibliotheek', onPress: () => kiesCategorie('bibliotheek') },
      { text: 'Annuleren', style: 'cancel' },
    ]);
  };

  const kiesCategorie = (bron: 'camera' | 'bibliotheek') => {
    Alert.alert('Welke fase?', 'Zo staat de foto straks op de juiste plek op de werkbon.', [
      { text: 'Voor', onPress: () => pakEnUpload(bron, 'voor') },
      { text: 'Tijdens', onPress: () => pakEnUpload(bron, 'tijdens') },
      { text: 'Na', onPress: () => pakEnUpload(bron, 'na') },
      { text: 'Annuleren', style: 'cancel' },
    ]);
  };

  const pakEnUpload = async (bron: 'camera' | 'bibliotheek', categorie: FotoCategorie) => {
    if (!workOrder) return;
    try {
      const rechtenVraag =
        bron === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!rechtenVraag.granted) {
        Alert.alert(
          'Geen toestemming',
          bron === 'camera'
            ? 'Geef BossBase toegang tot de camera om een foto te maken.'
            : 'Geef BossBase toegang tot je foto\'s om er een te kiezen.',
        );
        return;
      }

      // Een telefoonfoto is al gauw een paar megabyte. De werkbon toont hem nooit
      // groter dan het scherm, dus verkleinen scheelt opslag én wachttijd —
      // dezelfde afweging als het dashboard maakt bij het uploaden.
      const opties: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
      };
      const resultaat =
        bron === 'camera'
          ? await ImagePicker.launchCameraAsync(opties)
          : await ImagePicker.launchImageLibraryAsync(opties);

      if (resultaat.canceled) return;
      const asset = resultaat.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('Foto niet gelezen', 'Probeer het opnieuw of kies een andere foto.');
        return;
      }

      setFotoBezig(true);
      const bytes = base64NaarBytes(asset.base64);
      const extensie = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase().split('?')[0] || 'jpg';
      const { data, error: fotoError } = await uploadWorkOrderPhoto({
        werkbon_id: workOrder.id,
        company_id: workOrder.company_id,
        categorie,
        bytes: bytes.buffer as ArrayBuffer,
        contentType: asset.mimeType ?? 'image/jpeg',
        extensie: extensie === 'heic' ? 'jpg' : extensie,
      });
      setFotoBezig(false);
      if (fotoError || !data) {
        Alert.alert('Foto niet opgeslagen', fotoError ?? 'Probeer het opnieuw.');
        return;
      }
      setPhotos((prev) => [...prev, data]);
    } catch (e) {
      setFotoBezig(false);
      if (__DEV__) console.log('[werkbon] foto toevoegen mislukt', e);
      Alert.alert('Foto niet opgeslagen', 'Er ging iets mis bij het toevoegen van de foto.');
    }
  };

  const handleDeletePhoto = (foto: WorkOrderPhoto) =>
    bevestigVerwijderen('Foto verwijderen', 'De foto wordt definitief verwijderd.', async () => {
      const { error: e } = await deleteWorkOrderPhoto(foto.id, foto.url);
      if (!e) setPhotos((prev) => prev.filter((f) => f.id !== foto.id));
      return e;
    });

  const namesFor = (ids: string[] | null | undefined): string =>
    (ids ?? []).map((uid) => teamNames[uid] ?? 'Onbekend').join(', ');

  const gewoneTaken = useMemo(() => tasks.filter((t) => !t.is_meerwerk), [tasks]);
  const meerwerkTaken = useMemo(() => tasks.filter((t) => t.is_meerwerk), [tasks]);
  const totaalUren = useMemo(
    () => uren.reduce((sum, u) => sum + Number(u.uren || 0), 0),
    [uren],
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          <AppTopBar variant="detail" title="Werkbon" onBack={() => router.back()} />
          <LoadingScreen label="Werkbon laden..." />
        </View>
      </>
    );
  }

  if (error || !workOrder) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          <AppTopBar variant="detail" title="Werkbon" onBack={() => router.back()} />
          <ErrorState
            title="Werkbon niet gevonden"
            message={error ?? 'Deze werkbon bestaat niet of je hebt geen toegang.'}
            onRetry={opnieuw}
          />
        </View>
      </>
    );
  }

  // Assignment comes from assigned_to_ids; the legacy assigned_to column is
  // only a fallback for rows the dashboard has not touched since the change.
  const assignedIds = workOrder.assigned_to_ids?.length
    ? workOrder.assigned_to_ids
    : workOrder.assigned_to
      ? [workOrder.assigned_to]
      : [];
  const assignedLabel = assignedIds.length
    ? namesFor(assignedIds)
    : 'Niet toegewezen';
  const responsibleLabel = workOrder.verantwoordelijke_ids?.length
    ? namesFor(workOrder.verantwoordelijke_ids)
    : null;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <ScrollView
          style={[styles.screen, { backgroundColor: th.bg }]}
          contentContainerStyle={styles.scrollContent}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={th.green}
              colors={[th.green]}
              progressViewOffset={insets.top}
            />
          }
        >
        {/* De kop scrolt mee met de pagina, zoals in het ontwerp. */}
        <AppTopBar
          variant="detail"
          onBack={() => router.back()}
          eyebrow={`${workOrder.nummer ?? 'Werkbon'}${
            workOrder.gepland_op ? ` · ${formatDagLabel(workOrder.gepland_op)}` : ''
          }`}
          title={workOrder.titel}
          subtitle={workOrder.customer?.name ?? undefined}
          rightAction={<StatusBadge status={workOrder.status} />}
        />
        {/* `stack` gives real vertical spacing between cards (the children of
            AnimatedScreen) — the old gap sat on the wrong container. */}
        <AnimatedScreen style={[styles.stack, styles.stackPadding]}>
          {/* 1. De twee getallen uit het ontwerp: wat is gepland, en wat is er
              daadwerkelijk geschreven. De status staat in de bovenbalk, de
              statusactie onderaan binnen duimbereik. */}
          <View style={styles.kernRij}>
            <View style={styles.kernKaart}>
              <Text style={styles.kernLabel}>Gepland</Text>
              <Text style={styles.kernWaarde}>
                {workOrder.gepland_op
                  ? [
                      formatDagLabel(workOrder.gepland_op),
                      workOrder.starttijd ? formatTimeNL(workOrder.starttijd) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Niet ingepland'}
              </Text>
            </View>
            <View style={styles.kernKaart}>
              <Text style={styles.kernLabel}>Geschreven</Text>
              <Text style={[styles.kernWaarde, { color: th.green700 }]}>
                {formatHours(totaalUren)}
              </Text>
            </View>
          </View>

          {/* A signed work order is locked by the database itself: triggers
              reject every write on its tasks, materials and hours. Say so up
              front instead of letting an action fail. */}
          {isSigned ? (
            <View style={styles.lockBanner}>
              <Lock size={16} color={th.muted} />
              <Text style={styles.lockText}>
                Ondertekend
                {workOrder.ondertekend_door_naam ? ` door ${workOrder.ondertekend_door_naam}` : ''}
                {workOrder.ondertekend_op ? ` op ${formatDateNL(workOrder.ondertekend_op)}` : ''}.
                Deze werkbon staat op slot — maak een nieuwe werkbon voor een correctie.
              </Text>
            </View>
          ) : null}

          {/* 2. Customer + route/call */}
          {workOrder.customer ? (
            <Section styles={styles} title="Klant">
              <Text style={styles.customerName}>{workOrder.customer.name ?? '—'}</Text>
              <CustomerActions styles={styles} customer={workOrder.customer} locatie={workOrder.locatie} />
            </Section>
          ) : null}

          {/* 3. Assignment / planning / description */}
          <Section styles={styles} title="Informatie">
            <InfoRow
              styles={styles}
              icon={<UserIcon size={16} color={th.muted} />}
              label={assignedIds.length > 1 ? 'Uitvoerders' : 'Toegewezen aan'}
              value={assignedLabel}
            />
            {responsibleLabel ? (
              <InfoRow
                styles={styles}
                icon={<Users size={16} color={th.muted} />}
                label="Verantwoordelijk"
                value={responsibleLabel}
              />
            ) : null}
            <InfoRow
              styles={styles}
              icon={<Clock size={16} color={th.muted} />}
              label="Gepland"
              value={
                workOrder.gepland_op
                  ? `${formatDateLongNL(workOrder.gepland_op)}${workOrder.starttijd ? ` · ${formatTimeNL(workOrder.starttijd)}` : ''}${workOrder.eindtijd ? `–${formatTimeNL(workOrder.eindtijd)}` : ''}`
                  : '—'
              }
            />
            {workOrder.locatie ? (
              <InfoRow
                styles={styles}
                icon={<MapPin size={16} color={th.muted} />}
                label="Locatie"
                value={workOrder.locatie}
              />
            ) : null}
            {workOrder.project ? (
              <InfoRow
                styles={styles}
                icon={<FolderKanban size={16} color={th.muted} />}
                label="Project"
                value={workOrder.project.name ?? '—'}
              />
            ) : null}
            {voertuigNamen.length > 0 ? (
              <InfoRow
                styles={styles}
                icon={<Truck size={16} color={th.muted} />}
                label={voertuigNamen.length > 1 ? 'Voertuigen' : 'Voertuig'}
                value={voertuigNamen.join(', ')}
              />
            ) : null}
            {workOrder.gestart_op || workOrder.afgerond_op ? (
              <InfoRow
                styles={styles}
                icon={<Clock size={16} color={th.muted} />}
                label="Verloop"
                value={[
                  workOrder.gestart_op ? `gestart ${formatDateNL(workOrder.gestart_op)}` : null,
                  workOrder.afgerond_op ? `afgerond ${formatDateNL(workOrder.afgerond_op)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ) : null}
            {workOrder.deal_id || workOrder.offerte_id ? (
              <InfoRow
                styles={styles}
                icon={<Tag size={16} color={th.muted} />}
                label="Gekoppeld"
                value={[workOrder.deal_id ? 'Deal' : null, workOrder.offerte_id ? 'Offerte' : null]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ) : null}
            {workOrder.omschrijving ? (
              <View style={styles.descriptionBlock}>
                <Text style={styles.descriptionLabel}>Omschrijving</Text>
                <Text style={styles.descriptionText}>{workOrder.omschrijving}</Text>
              </View>
            ) : null}
          </Section>

          {/* 4. Materials / benodigdheden — what to bring */}
          <Section
            styles={styles}
            title="Materialen"
            icon={<Package size={16} color={ds.green700} />}
            action={
              canManage ? (
                <Pressable onPress={() => setMaterialModal(true)} hitSlop={8}>
                  <View style={styles.addRow}>
                    <Plus size={16} color={ds.green700} />
                    <Text style={styles.addText}>Toevoegen</Text>
                  </View>
                </Pressable>
              ) : null
            }
          >
            {partialErrors.materialen ? (
              <Text style={styles.sectionError}>{partialErrors.materialen}</Text>
            ) : materials.length === 0 ? (
              <Text style={styles.empty}>Geen materialen gekoppeld aan deze werkbon.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {materials.map((m) => (
                  <View key={m.id} style={styles.materialRow}>
                    <View style={styles.qtyPill}>
                      <Text style={styles.qtyPillText}>
                        {m.eenheid ? `${formatQty(m.aantal)} ${m.eenheid}` : `${formatQty(m.aantal)}×`}
                      </Text>
                    </View>
                    <Text style={styles.materialName} numberOfLines={2}>
                      {m.naam}
                    </Text>
                    {canManage ? (
                      <View style={styles.stepper}>
                        <Pressable
                          onPress={() => handleMaterialAmount(m, m.aantal - 1)}
                          hitSlop={6}
                          accessibilityLabel={`Eén ${m.naam} minder`}
                          style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
                        >
                          <Text style={styles.stepText}>−</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleMaterialAmount(m, m.aantal + 1)}
                          hitSlop={6}
                          accessibilityLabel={`Eén ${m.naam} meer`}
                          style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
                        >
                          <Text style={styles.stepText}>+</Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {canDelMaterial ? (
                      <Pressable
                        onPress={() => handleDeleteMaterial(m)}
                        hitSlop={6}
                        accessibilityLabel={`${m.naam} verwijderen`}
                        style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                      >
                        <Trash2 size={16} color={th.muted} strokeWidth={2} />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </Section>

          {/* 5. Werkzaamheden — tickable when the job allows it.
              Meerwerk is the same table with is_meerwerk set (migration
              20260905130000), so it renders as its own block but behaves
              exactly like a normal task. */}
          {partialErrors.taken ? (
            <Section
              styles={styles}
              title="Werkzaamheden"
              icon={<ListChecks size={16} color={ds.green700} />}
            >
              <Text style={styles.sectionError}>{partialErrors.taken}</Text>
            </Section>
          ) : gewoneTaken.length > 0 ? (
            <Section
              styles={styles}
              title="Werkzaamheden"
              icon={<ListChecks size={16} color={ds.green700} />}
              action={
                <View style={styles.sectionActions}>
                  <Text style={styles.sectionMeta}>
                    {gewoneTaken.filter((t) => t.afgerond).length}/{gewoneTaken.length} af
                  </Text>
                  {canTasks ? (
                    <Pressable onPress={() => setTaskModal({ meerwerk: false })} hitSlop={8}>
                      <View style={styles.addRow}>
                        <Plus size={16} color={ds.green700} />
                        <Text style={styles.addText}>Toevoegen</Text>
                      </View>
                    </Pressable>
                  ) : null}
                </View>
              }
            >
              <View style={{ gap: spacing.sm }}>
                {gewoneTaken.map((t) => (
                  <TaskRow
                    key={t.id}
                    styles={styles}
                    th={th}
                    task={t}
                    busy={busyTaskId === t.id}
                    disabled={isSigned || !canManage}
                    onToggle={() => handleToggleTask(t)}
                    onDelete={canTasks ? () => handleDeleteTask(t) : undefined}
                  />
                ))}
              </View>
            </Section>
          ) : null}

          {meerwerkTaken.length > 0 || canTasks ? (
            <Section
              styles={styles}
              title="Meerwerk"
              icon={<PlusCircle size={16} color={ds.green700} />}
              action={
                canTasks ? (
                  <Pressable onPress={() => setTaskModal({ meerwerk: true })} hitSlop={8}>
                    <View style={styles.addRow}>
                      <Plus size={16} color={ds.green700} />
                      <Text style={styles.addText}>Toevoegen</Text>
                    </View>
                  </Pressable>
                ) : null
              }
            >
              <Text style={styles.meerwerkHint}>
                Tijdens de klus erbij gevraagd — zat niet in de oorspronkelijke opdracht.
              </Text>
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                {meerwerkTaken.length === 0 ? (
                  <Text style={styles.empty}>Geen meerwerk op deze klus.</Text>
                ) : null}
                {meerwerkTaken.map((t) => (
                  <TaskRow
                    key={t.id}
                    styles={styles}
                    th={th}
                    task={t}
                    busy={busyTaskId === t.id}
                    disabled={isSigned || !canManage}
                    onToggle={() => handleToggleTask(t)}
                    onDelete={canTasks ? () => handleDeleteTask(t) : undefined}
                  />
                ))}
              </View>
            </Section>
          ) : null}

          {/* 6. Notities — real rows in werkbon_notities, so each note keeps its
              own author and timestamp and the dashboard shows the same log. */}
          <Section
            styles={styles}
            title="Notities"
            action={
              canNote ? (
                <Pressable onPress={() => setNoteModal(true)} hitSlop={8}>
                  <View style={styles.addRow}>
                    <Plus size={16} color={ds.green700} />
                    <Text style={styles.addText}>Toevoegen</Text>
                  </View>
                </Pressable>
              ) : null
            }
          >
            {partialErrors.notities ? (
              <Text style={styles.sectionError}>{partialErrors.notities}</Text>
            ) : notes.length === 0 ? (
              <Text style={styles.empty}>Nog geen notities.</Text>
            ) : (
              <View style={{ gap: spacing.md }}>
                {notes.map((n) => (
                  <View key={n.id} style={styles.noteCard}>
                    <View style={styles.noteMetaRow}>
                      <Text style={styles.noteMeta}>
                        {[n.auteur?.full_name ?? 'Onbekend', formatDateNL(n.created_at)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      {n.voor_klant ? (
                        <View style={styles.notePill}>
                          <Text style={styles.notePillText}>Voor klant</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.noteBody}>{n.note}</Text>
                  </View>
                ))}
              </View>
            )}
          </Section>

          {/* The planner's own remark on the job, if there is one. Read-only:
              it belongs to the work order, not to the note log. */}
          {workOrder.notes?.trim() ? (
            <Section styles={styles} title="Opmerking van kantoor">
              <Text style={styles.descriptionText}>{workOrder.notes.trim()}</Text>
            </Section>
          ) : null}

          {/* 7. Uren — table werkbon_uren, the same rows the dashboard's work
              order shows. Working-day hours live in urenregistratie and are a
              different thing entirely; they are not mixed in here. */}
          <Section
            styles={styles}
            title="Uren"
            action={
              !canBook ? null : (
                <Pressable onPress={() => setTimeModal(true)} hitSlop={8}>
                  <View style={styles.addRow}>
                    <Plus size={16} color={ds.green700} />
                    <Text style={styles.addText}>Toevoegen</Text>
                  </View>
                </Pressable>
              )
            }
          >
            {partialErrors.uren ? (
              <Text style={styles.sectionError}>{partialErrors.uren}</Text>
            ) : uren.length === 0 ? (
              <Text style={styles.empty}>Nog geen uren geboekt.</Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {uren.map((u) => (
                  <View key={u.id} style={styles.timeEntry}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timeEntryDate}>{formatDateLongNL(u.datum)}</Text>
                      <Text style={styles.timeEntryNote} numberOfLines={2}>
                        {[u.medewerker?.full_name, u.notitie].filter(Boolean).join(' · ') || ' '}
                      </Text>
                    </View>
                    <Text style={styles.timeEntryHours}>{formatHours(Number(u.uren))}</Text>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Totaal</Text>
                  <Text style={styles.totalValue}>{formatHours(totaalUren)}</Text>
                </View>
              </View>
            )}
          </Section>

          {/* 7b. Foto's — camera en fotorol, upload naar de privébucket
              werkbon-fotos. Verwijderen via lang indrukken. */}
          <Section
            styles={styles}
            title="Foto's"
            icon={<ImageIcon size={16} color={ds.green700} />}
            action={
              canManage ? (
                <Pressable onPress={kiesFoto} hitSlop={8} disabled={fotoBezig}>
                  <View style={styles.addRow}>
                    {fotoBezig ? (
                      <ActivityIndicator size="small" color={ds.green700} />
                    ) : (
                      <Plus size={16} color={ds.green700} />
                    )}
                    <Text style={styles.addText}>{fotoBezig ? 'Uploaden…' : 'Toevoegen'}</Text>
                  </View>
                </Pressable>
              ) : null
            }
          >
            {partialErrors.fotos ? (
              <Text style={styles.sectionError}>{partialErrors.fotos}</Text>
            ) : photos.length === 0 ? (
              <Text style={styles.empty}>
                {canManage ? 'Nog geen foto\'s. Leg de klus vast met de camera.' : "Nog geen foto's."}
              </Text>
            ) : (
              <View style={styles.photoGrid}>
                {photos.map((ph) => (
                  <Pressable
                    key={ph.id}
                    onLongPress={canManage ? () => handleDeletePhoto(ph) : undefined}
                    accessibilityLabel={`Foto ${ph.categorie ?? ''}`}
                    style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                  >
                    <Image source={{ uri: ph.url }} style={styles.photo} />
                    {ph.categorie ? (
                      <View style={styles.photoTag}>
                        <Text style={styles.photoTagText}>{ph.categorie}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}
            {canManage && photos.length > 0 ? (
              <Text style={styles.photoHint}>Houd een foto ingedrukt om hem te verwijderen.</Text>
            ) : null}
          </Section>

          {/* 8. Metadata */}
          <View style={styles.metaBlock}>
            <Text style={styles.metaText}>
              Aangemaakt {formatDateNL(workOrder.created_at)}
              {workOrder.updated_at ? ` · bijgewerkt ${formatDateNL(workOrder.updated_at)}` : ''}
            </Text>
          </View>
        </AnimatedScreen>
        </ScrollView>
        <StatusBarScrim />

        {/* De primaire actie staat vast onderaan, zoals in het ontwerp. Geen
            rechten of een ondertekende bon? Dan staat hij er niet — een knop
            die tóch weigert is erger dan geen knop. */}
        {!isSigned && canManage && volgendeStatussen.length > 0 ? (
          <View style={[styles.actieBalk, { paddingBottom: Math.max(insets.bottom, 16) + 6 }]}>
            <Pressable
              onPress={openStatusActions}
              disabled={statusUpdating}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.actieKnop,
                pressed && { opacity: 0.9 },
                statusUpdating && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.actieTekst}>
                {statusUpdating ? 'Bijwerken…' : primaireActie}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <AddNoteModal
        styles={styles}
        th={th}
        visible={noteModal}
        onClose={() => setNoteModal(false)}
        onSubmit={async (body, voorKlant) => {
          if (!user?.id) return { error: 'Sessie niet geladen.' };
          // Write into the work order's own company, so a note can never end up
          // under another tenant even if the profile were stale.
          const { data, error: noteError } = await addWorkOrderNote({
            werkbon_id: workOrder.id,
            company_id: workOrder.company_id,
            created_by: user.id,
            note: body,
            voor_klant: voorKlant,
          });
          if (noteError || !data) return { error: noteError ?? 'Notitie kon niet worden toegevoegd.' };
          setNotes((prev) => [data, ...prev]);
          return { error: null };
        }}
      />

      <AddTaskModal
        styles={styles}
        th={th}
        visible={taskModal !== null}
        meerwerk={taskModal?.meerwerk ?? false}
        onClose={() => setTaskModal(null)}
        onSubmit={(omschrijving) => handleAddTask(omschrijving, taskModal?.meerwerk ?? false)}
      />

      <AddMaterialModal
        styles={styles}
        th={th}
        visible={materialModal}
        onClose={() => setMaterialModal(false)}
        onSubmit={handleAddMaterial}
      />

      <AddTimeEntryModal
        styles={styles}
        th={th}
        visible={timeModal}
        onClose={() => setTimeModal(false)}
        onSubmit={async (input) => {
          if (!user?.id) return { error: 'Sessie niet geladen.' };
          // company_id follows the work order, never a separately held value:
          // that is what keeps the hours in the same tenant as the job.
          const res = await createWerkbonUur({
            company_id: workOrder.company_id,
            werkbon_id: workOrder.id,
            profile_id: user.id,
            datum: input.datum,
            uren: input.uren,
            notitie: input.notitie,
          });
          // Alleen bij een teruggegeven rij is er écht geschreven; alles
          // anders is een mislukking met de melding uit de classificatie.
          if (!res.ok) return { error: res.melding };
          setUren((prev) => [res.data, ...prev]);
          return { error: null };
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type Styles = ReturnType<typeof makeStyles>;

function Section({
  styles,
  title,
  icon,
  action,
  children,
}: {
  styles: Styles;
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          {icon}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {action}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/**
 * One checklist line. Ticking it writes straight to `werkbon_taken`; when the
 * job is signed or the user is not a responsible, the row stays readable but
 * does not pretend to be actionable.
 */
function TaskRow({
  styles,
  th,
  task,
  busy,
  disabled,
  onToggle,
  onDelete,
}: {
  styles: Styles;
  th: ThemeColors;
  task: WorkOrderTask;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
  /** Alleen meegegeven als deze gebruiker regels mag weggooien. */
  onDelete?: () => void;
}) {
  return (
    <View style={styles.taskRow}>
      <Pressable
        onPress={onToggle}
        disabled={busy}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.afgerond, disabled }}
        accessibilityLabel={task.omschrijving}
        style={({ pressed }) => [styles.taskPress, pressed && !busy && { opacity: 0.7 }]}
      >
        {task.afgerond ? (
          <CheckCircle2 size={18} color={ds.green700} strokeWidth={2.2} />
        ) : (
          <Circle size={18} color={disabled ? th.muted2 : th.muted} strokeWidth={2} />
        )}
        <Text style={[styles.taskText, task.afgerond && styles.taskTextDone]} numberOfLines={3}>
          {task.omschrijving}
        </Text>
      </Pressable>
      {busy ? <ActivityIndicator size="small" color={ds.green700} /> : null}
      {onDelete ? (
        <Pressable
          onPress={onDelete}
          hitSlop={6}
          accessibilityLabel={`${task.omschrijving} verwijderen`}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Trash2 size={16} color={th.muted} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

function InfoRow({
  styles,
  icon,
  label,
  value,
}: {
  styles: Styles;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function CustomerActions({
  styles,
  customer,
  locatie,
}: {
  styles: Styles;
  customer: NonNullable<WorkOrderWithRelations['customer']>;
  locatie: string | null;
}) {
  const address = [customer.address, customer.postcode, customer.city].filter(Boolean).join(', ');

  const handle = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (e) {
      console.warn('[CustomerActions] openURL failed', e);
      Alert.alert('Kon niet openen', 'Deze actie wordt niet door je toestel ondersteund.');
    }
  };

  const mapsQuery = locatie ?? address;

  return (
    <View style={styles.customerActions}>
      {customer.phone ? (
        <ActionButton
          styles={styles}
          icon={<Phone size={18} color={ds.green700} />}
          label="Bel"
          onPress={() => handle(`tel:${customer.phone!.replace(/\s/g, '')}`)}
        />
      ) : null}
      {customer.email ? (
        <ActionButton
          styles={styles}
          icon={<Mail size={18} color={ds.green700} />}
          label="Mail"
          onPress={() => handle(`mailto:${customer.email!}`)}
        />
      ) : null}
      {mapsQuery ? (
        <ActionButton
          styles={styles}
          icon={<MapPin size={18} color={ds.green700} />}
          label="Route"
          onPress={() => handle(`https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`)}
        />
      ) : null}
    </View>
  );
}

function ActionButton({
  styles,
  icon,
  label,
  onPress,
}: {
  styles: Styles;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
    >
      {icon}
      <Text style={styles.actionBtnLabel}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function AddNoteModal({
  styles,
  th,
  visible,
  onClose,
  onSubmit,
}: {
  styles: Styles;
  th: ThemeColors;
  visible: boolean;
  onClose: () => void;
  onSubmit: (body: string, voorKlant: boolean) => Promise<{ error: string | null }>;
}) {
  const [body, setBody] = useState('');
  const [voorKlant, setVoorKlant] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setBody('');
    setVoorKlant(false);
    setSubmitting(false);
    setErrorMsg(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    if (!body.trim()) {
      setErrorMsg('Voer een notitie in.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    const { error: submitError } = await onSubmit(body, voorKlant);
    setSubmitting(false);
    if (submitError) {
      setErrorMsg(submitError);
      return;
    }
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="formSheet">
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: th.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={close} hitSlop={8}>
            <Text style={styles.modalCancel}>Annuleren</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Notitie</Text>
          <View style={{ width: 64 }} />
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <FormField
            label="Notitie"
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="Wat moet er bewaard blijven?"
            autoFocus
            editable={!submitting}
          />
          {/* werkbon_notities.voor_klant — an internal note stays internal
              unless it is explicitly meant for the customer. */}
          <Pressable
            onPress={() => setVoorKlant((v) => !v)}
            disabled={submitting}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: voorKlant }}
            style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.7 }]}
          >
            {voorKlant ? (
              <CheckCircle2 size={20} color={ds.green700} strokeWidth={2.2} />
            ) : (
              <Circle size={20} color={th.muted} strokeWidth={2} />
            )}
            <Text style={styles.checkLabel}>
              Zichtbaar voor de klant op de werkbon
            </Text>
          </Pressable>
          {errorMsg ? <Text style={styles.modalError}>{errorMsg}</Text> : null}
          <Button label="Opslaan" onPress={submit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AddTaskModal({
  styles,
  th,
  visible,
  meerwerk,
  onClose,
  onSubmit,
}: {
  styles: Styles;
  th: ThemeColors;
  visible: boolean;
  meerwerk: boolean;
  onClose: () => void;
  onSubmit: (omschrijving: string) => Promise<{ error: string | null }>;
}) {
  const [omschrijving, setOmschrijving] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const close = () => {
    setOmschrijving('');
    setSubmitting(false);
    setErrorMsg(null);
    onClose();
  };

  const submit = async () => {
    if (!omschrijving.trim()) {
      setErrorMsg('Vul een omschrijving in.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    const { error: e } = await onSubmit(omschrijving);
    setSubmitting(false);
    if (e) {
      setErrorMsg(e);
      return;
    }
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="formSheet">
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: th.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={close} hitSlop={8}>
            <Text style={styles.modalCancel}>Annuleren</Text>
          </Pressable>
          <Text style={styles.modalTitle}>{meerwerk ? 'Meerwerk' : 'Taak'}</Text>
          <View style={{ width: 64 }} />
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          {meerwerk ? (
            <Text style={styles.meerwerkHint}>
              Meerwerk is werk dat tijdens de klus is bijgevraagd en niet in de opdracht zat. Het
              komt in een eigen blok op de werkbon te staan.
            </Text>
          ) : null}
          <FormField
            label="Omschrijving"
            value={omschrijving}
            onChangeText={setOmschrijving}
            placeholder={meerwerk ? 'Bijv. kozijn extra schilderen' : 'Wat moet er gebeuren?'}
            multiline
            autoFocus
            editable={!submitting}
          />
          {errorMsg ? <Text style={styles.modalError}>{errorMsg}</Text> : null}
          <Button label="Opslaan" onPress={submit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Materiaal bijzetten. Bewust géén prijsveld: bedragen zijn kantoorwerk en de
 * inkoopprijs is server-side afgeschermd op het recht `inkoopprijzen`. Een
 * monteur noteert wát hij nodig heeft en hoevéél.
 */
function AddMaterialModal({
  styles,
  th,
  visible,
  onClose,
  onSubmit,
}: {
  styles: Styles;
  th: ThemeColors;
  visible: boolean;
  onClose: () => void;
  onSubmit: (naam: string, eenheid: string, aantal: number) => Promise<{ error: string | null }>;
}) {
  const [naam, setNaam] = useState('');
  const [eenheid, setEenheid] = useState('');
  const [aantalStr, setAantalStr] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const close = () => {
    setNaam('');
    setEenheid('');
    setAantalStr('1');
    setSubmitting(false);
    setErrorMsg(null);
    onClose();
  };

  const submit = async () => {
    const aantal = parseFloat(aantalStr.replace(',', '.'));
    if (!naam.trim()) {
      setErrorMsg('Vul een naam in.');
      return;
    }
    if (!Number.isFinite(aantal) || aantal <= 0) {
      setErrorMsg('Vul een geldig aantal in.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    const { error: e } = await onSubmit(naam, eenheid, aantal);
    setSubmitting(false);
    if (e) {
      setErrorMsg(e);
      return;
    }
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="formSheet">
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: th.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={close} hitSlop={8}>
            <Text style={styles.modalCancel}>Annuleren</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Materiaal</Text>
          <View style={{ width: 64 }} />
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <FormField
            label="Naam"
            value={naam}
            onChangeText={setNaam}
            placeholder="Bijv. Keramische dakpan"
            autoFocus
            editable={!submitting}
          />
          <FormField
            label="Aantal"
            value={aantalStr}
            onChangeText={setAantalStr}
            keyboardType="decimal-pad"
            editable={!submitting}
          />
          <FormField
            label="Eenheid (optioneel)"
            value={eenheid}
            onChangeText={setEenheid}
            placeholder="stuk, m2, meter…"
            autoCapitalize="none"
            editable={!submitting}
          />
          {errorMsg ? <Text style={styles.modalError}>{errorMsg}</Text> : null}
          <Button label="Opslaan" onPress={submit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AddTimeEntryModal({
  styles,
  th,
  visible,
  onClose,
  onSubmit,
}: {
  styles: Styles;
  th: ThemeColors;
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: {
    datum: string;
    uren: number;
    notitie: string | null;
  }) => Promise<{ error: string | null }>;
}) {
  const [datum, setDatum] = useState(vandaagISO());
  const [urenStr, setUrenStr] = useState('');
  const [notitie, setNotitie] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setDatum(vandaagISO());
    setUrenStr('');
    setNotitie('');
    setSubmitting(false);
    setErrorMsg(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    const hours = parseFloat(urenStr.replace(',', '.'));
    if (!isGeldigeISODatum(datum)) {
      setErrorMsg('Kies een geldige datum.');
      return;
    }
    if (Number.isNaN(hours) || hours <= 0) {
      setErrorMsg('Vul het aantal uren in.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    const { error: submitError } = await onSubmit({
      datum,
      uren: hours,
      notitie: notitie.trim() || null,
    });
    setSubmitting(false);
    if (submitError) {
      setErrorMsg(submitError);
      return;
    }
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="formSheet">
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: th.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <Pressable onPress={close} hitSlop={8}>
            <Text style={styles.modalCancel}>Annuleren</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Uren toevoegen</Text>
          <View style={{ width: 64 }} />
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <DateField
            label="Datum"
            value={datum}
            onChange={setDatum}
            disabled={submitting}
          />
          <FormField
            label="Uren"
            value={urenStr}
            onChangeText={setUrenStr}
            keyboardType="decimal-pad"
            placeholder="bijv. 1,5"
            editable={!submitting}
          />
          <FormField
            label="Notitie (optioneel)"
            value={notitie}
            onChangeText={setNotitie}
            multiline
            placeholder="Wat is er gedaan?"
            editable={!submitting}
          />
          {errorMsg ? <Text style={styles.modalError}>{errorMsg}</Text> : null}
          <Button label="Opslaan" onPress={submit} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: t.bg,
    },
    scrollContent: {
      paddingBottom: 140, // clear the floating tab bar / home indicator
    },
    // De kop staat bovenaan de scrollinhoud en heeft zijn eigen marges; de
    // kaarten eronder houden de vertrouwde binnenruimte.
    stackPadding: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    // Vertical rhythm between the header + all cards (≈18px).
    stack: {
      gap: 18,
    },
    headerBlock: {
      gap: spacing.md,
      paddingHorizontal: 4,
      paddingTop: 4,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
      color: t.ink,
      letterSpacing: -0.6,
    },
    photoTag: {
      position: 'absolute',
      left: 6,
      bottom: 6,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: 'rgba(11,15,18,0.72)',
    },
    photoTagText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#fff',
      textTransform: 'capitalize',
    },
    photoHint: {
      marginTop: 8,
      fontSize: 12,
      color: t.muted,
    },
    sectionActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    taskPress: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    stepBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bgAlt,
    },
    stepText: {
      fontSize: 16,
      fontWeight: '800',
      color: t.ink2,
      lineHeight: 18,
    },
    lockBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 12,
      borderRadius: t.rMd,
      backgroundColor: t.bgAlt,
      borderWidth: 1,
      borderColor: t.line,
    },
    lockText: {
      flex: 1,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.ink2,
    },
    sectionError: {
      fontSize: 13,
      lineHeight: 19,
      color: t.statusRejectFg,
    },
    sectionMeta: {
      fontSize: 12,
      fontWeight: '700',
      color: t.muted,
    },
    meerwerkHint: {
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
    },
    noteMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    notePill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: t.green50,
    },
    notePillText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: t.green700,
    },
    totalRow: {
      marginTop: 4,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: t.line,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    totalLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: t.ink2,
    },
    totalValue: {
      fontSize: 15,
      fontWeight: '800',
      color: t.ink,
      letterSpacing: -0.2,
    },
    photoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    photo: {
      width: 96,
      height: 96,
      borderRadius: t.rSm ?? 10,
      backgroundColor: t.bgAlt,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 4,
    },
    checkLabel: {
      flex: 1,
      fontSize: 13.5,
      color: t.ink2,
    },
    kernRij: { flexDirection: 'row', gap: 10 },
    kernKaart: {
      flex: 1,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: ds.rMd,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    kernLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.66,
      textTransform: 'uppercase',
      color: t.muted2,
    },
    kernWaarde: {
      fontSize: 17,
      fontWeight: '700',
      color: t.ink,
      marginTop: 4,
      fontVariant: ['tabular-nums'],
    },
    actieBalk: {
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: t.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.line,
    },
    actieKnop: {
      height: 52,
      borderRadius: 16,
      backgroundColor: ds.green,
      alignItems: 'center',
      justifyContent: 'center',
      ...dsShadowGreen,
    },
    actieTekst: { fontSize: 15, fontWeight: '700', color: ds.greenInk },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    statusButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 12,
      backgroundColor: INK_FIXED,
    },
    statusButtonDisabled: {
      opacity: 0.6,
    },
    statusButtonText: {
      fontSize: 13,
      color: '#fff',
      fontWeight: '700',
      letterSpacing: -0.1,
    },

    section: {
      gap: 8,
    },
    /** De kaart waar de inhoud van een sectie in staat. */
    sectionBody: {
      backgroundColor: t.card,
      borderRadius: t.rLg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      padding: spacing.lg,
      gap: spacing.md,
      ...dsShadow,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      // Ontwerp: 12 px, kapitaal, ruime letterafstand, in de lichtste
      // tekstkleur. Bewust NIET groen zoals de sectiekop op lijstschermen —
      // op een detailpagina staan er tien onder elkaar en dan wordt groen
      // lawaai in plaats van accent.
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
      letterSpacing: 0.72,
      textTransform: 'uppercase',
      color: t.muted2,
    },
    empty: {
      fontSize: 13,
      color: t.muted,
    },

    customerName: {
      fontSize: 16,
      fontWeight: '700',
      color: t.ink,
      letterSpacing: -0.2,
    },
    customerActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: t.green50,
    },
    actionBtnPressed: {
      backgroundColor: t.green100,
    },
    actionBtnLabel: {
      fontSize: 13,
      color: ds.green700,
      fontWeight: '700',
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    infoIcon: {
      paddingTop: 2,
    },
    infoLabel: {
      fontSize: 11.5,
      fontWeight: '700',
      color: t.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    infoValue: {
      fontSize: 14.5,
      color: t.ink,
      fontWeight: '600',
      marginTop: 2,
    },
    descriptionBlock: {
      paddingTop: spacing.sm,
    },
    descriptionLabel: {
      fontSize: 11.5,
      fontWeight: '700',
      color: t.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: spacing.xs,
    },
    descriptionText: {
      fontSize: 14,
      color: t.ink,
      lineHeight: 22,
    },

    // Materials
    materialRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: t.bg,
      borderRadius: t.rMd,
    },
    qtyPill: {
      minWidth: 44,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: t.green50,
      alignItems: 'center',
    },
    qtyPillText: {
      fontSize: 13,
      fontWeight: '800',
      color: ds.green700,
      letterSpacing: -0.2,
    },
    materialName: {
      flex: 1,
      fontSize: 14.5,
      fontWeight: '600',
      color: t.ink,
    },

    // Checklist
    taskRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 4,
    },
    taskText: {
      flex: 1,
      fontSize: 14,
      color: t.ink,
      lineHeight: 20,
    },
    taskTextDone: {
      color: t.muted,
      textDecorationLine: 'line-through',
    },

    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    addText: {
      fontSize: 13,
      color: ds.green700,
      fontWeight: '700',
    },
    noteCard: {
      padding: spacing.md,
      backgroundColor: t.bg,
      borderRadius: t.rMd,
      borderLeftWidth: 3,
      borderLeftColor: ds.green,
      gap: spacing.xs,
    },
    noteMeta: {
      fontSize: 11.5,
      color: t.muted,
      fontWeight: '600',
    },
    noteBody: {
      fontSize: 14,
      color: t.ink,
      lineHeight: 21,
    },

    timeEntry: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      backgroundColor: t.bg,
      borderRadius: t.rMd,
      gap: spacing.md,
    },
    timeEntryDate: {
      fontSize: 14,
      color: t.ink,
      fontWeight: '700',
    },
    timeEntryNote: {
      fontSize: 12.5,
      color: t.muted,
      marginTop: 2,
    },
    timeEntryHours: {
      fontSize: 15,
      color: ds.green700,
      fontWeight: '800',
    },

    // Metadata
    metaBlock: {
      paddingHorizontal: 4,
      paddingTop: 2,
    },
    metaText: {
      fontSize: 12,
      color: t.muted2,
      textAlign: 'center',
    },

    // Modals
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: t.line,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: t.ink,
      letterSpacing: -0.3,
    },
    modalCancel: {
      fontSize: 15,
      color: t.muted,
      minWidth: 64,
    },
    modalBody: {
      padding: spacing.lg,
      gap: spacing.lg,
      backgroundColor: t.bg,
    },
    modalError: {
      fontSize: 13,
      color: t.statusRejectFg,
      fontWeight: '600',
    },
  });
