import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { Dialog } from '@/lib/dialog';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Eye,
  FolderKanban,
  ImageIcon,
  ListChecks,
  Lock,
  MapPin,
  Package,
  Pencil,
  Phone,
  Play,
  Plus,
  PlusCircle,
  Send,
  Trash2,
  Truck,
  X,
} from 'lucide-react-native';
import {
  AnimatedScreen,
  AppTopBar,
  Button,
  DateField,
  ErrorState,
  FormField,
  LoadingScreen,
  MobielKader,
  SelectField,
  StatusBarScrim,
  TimeField,
} from '@/components';
import { WerkbonStatusBadge } from '@/components/WerkbonStatusBadge';
import { useAuth, usePermissions, useTheme } from '@/providers';
import * as ImagePicker from 'expo-image-picker';
import {
  addWorkOrderMaterial,
  addWorkOrderNote,
  addWorkOrderTask,
  canAddTask,
  canBookHours,
  canDeleteMaterial,
  canEditDetail,
  canManageWerkbonnen,
  deleteWorkOrderMaterial,
  deleteWorkOrderPhoto,
  deleteWorkOrderTask,
  getWorkOrder,
  listCompanyProfiles,
  listLeveranciersNamen,
  listTeamProfiles,
  listVoertuigen,
  listWorkOrderMaterials,
  listWorkOrderNotes,
  listWorkOrderPhotos,
  listWorkOrderTasks,
  setNoteVoorKlant,
  setTaskDone,
  updateMaterialAmount,
  updateWorkOrderStatus,
  uploadWorkOrderPhoto,
  type FotoCategorie,
  type Werkbon,
  type WerkbonMateriaalRegel,
  type WerkbonNotitie,
  FOTO_CATEGORIEEN,
} from '@/services/workOrderService';
import { listMaterialen, listLeveranciers, type Materiaal } from '@/services/materiaalService';
import { bereidFotoVoor, FOTO_ALS_BASE64 } from '@/lib/fotoVoorbereiden';
import { useFocusTerug } from '@/lib/focusTerug';
import { createWerkbonUur, listWerkbonUren } from '@/services/werkbonUrenService';
import { isGeldigeISODatum, vandaagISO } from '@/lib/datum';
import { lokaalNaarUtc } from '@/lib/nlTijd';
import { berekenUren } from '@/lib/urenBerekening';
import { useLaden } from '@/lib/useLaden';
import { formatDateNL, formatEUR, formatHours } from '@/lib/format';
import { terugOfNaar } from '@/lib/navigatie';
import { ds, dsShadow, spacing, type ThemeColors } from '@/theme';
import type { WerkbonUur, WorkOrderPhoto, WorkOrderTask } from '@/types/domain';
import { leesbreedte } from '@/lib/schermklasseRegels';
import { alsHtml, alsTekst } from '@/lib/notitieTekst';
import {
  dagVenster,
  dagWoord,
  EENHEDEN,
  FOTO_CATEGORIE_STIJL,
  hhmm,
  inclusiefBtw,
  korteDatum,
  leesBedrag,
  materiaalSubtotaal,
  mijnVolgendeDag,
  normaliseerStatus,
  planningLabel,
  ploegOpDag,
  rond2,
  rondAfOpVijf,
  tijdenVoorPersoon,
  werkbonDagen,
  werkbonVenster,
} from '@/lib/werkbonLogica';

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
}

const vandaag = () => vandaagISO();

/**
 * Werkbondetail — de blokken van het dashboard (WerkbonPageV2) in dezelfde
 * volgorde: kop, jouw planning, actierij (bel/route/start-afronden),
 * slot- en verstuurdmelding, omschrijving, planning, taken, uren, foto's,
 * materialen, meerwerk, notities (intern/klant) en waarschuwingen.
 */
export default function WorkOrderDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, role } = useAuth();
  const { can, hasFeature, readonly, loaded: rechtenGeladen } = usePermissions();
  const { colors: th } = useTheme();
  const styles = useMemo(() => makeStyles(th), [th]);

  const [workOrder, setWorkOrder] = useState<Werkbon | null>(null);
  const [voertuigen, setVoertuigen] = useState<Record<string, { naam: string; kleur: string | null }>>({});
  const [uren, setUren] = useState<WerkbonUur[]>([]);
  const [materials, setMaterials] = useState<WerkbonMateriaalRegel[]>([]);
  const [tasks, setTasks] = useState<WorkOrderTask[]>([]);
  const [notes, setNotes] = useState<WerkbonNotitie[]>([]);
  const [photos, setPhotos] = useState<WorkOrderPhoto[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [leveranciers, setLeveranciers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<Record<string, string | null>>({});
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState(false);
  const [notitieTab, setNotitieTab] = useState<'intern' | 'klant'>('intern');
  const [timeModal, setTimeModal] = useState(false);
  const [taskModal, setTaskModal] = useState<{ meerwerk: boolean } | null>(null);
  const [materialModal, setMaterialModal] = useState(false);
  const [startModal, setStartModal] = useState(false);
  const [fotoBezig, setFotoBezig] = useState<FotoCategorie | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);

    const [woResult, urenResult, matResult, taskResult, noteResult, photoResult, levs] = await Promise.all([
      getWorkOrder(id),
      listWerkbonUren(id),
      listWorkOrderMaterials(id),
      listWorkOrderTasks(id),
      listWorkOrderNotes(id),
      listWorkOrderPhotos(id),
      listLeveranciersNamen(),
    ]);

    if (woResult.error) {
      setError(woResult.error);
      setWorkOrder(null);
    } else if (!woResult.data) {
      setError('Deze werkbon bestaat niet of je hebt er geen toegang toe.');
      setWorkOrder(null);
    } else {
      setWorkOrder(woResult.data);
      const ids = [
        ...(woResult.data.assigned_to_ids ?? []),
        ...(woResult.data.verantwoordelijke_ids ?? []),
        ...(woResult.data.assigned_to ? [woResult.data.assigned_to] : []),
      ];
      const { data: names } = await listTeamProfiles(ids);
      setTeamNames(names);
      // Voertuigen: ook die per dag, niet alleen die van de werkbon.
      const busIds = [
        ...(woResult.data.voertuig_ids ?? []),
        ...werkbonDagen(woResult.data).flatMap((d) => d.voertuig_ids ?? []),
      ];
      const { data: bussen } = await listVoertuigen(busIds);
      setVoertuigen(bussen);
    }

    setUren(urenResult.data);
    setMaterials(matResult.data);
    setTasks(taskResult.data);
    setNotes(noteResult.data);
    setPhotos(photoResult.data);
    setLeveranciers(levs);
    setPartialErrors({
      uren: urenResult.error,
      materialen: matResult.error,
      taken: taskResult.error,
      notities: noteResult.error,
      fotos: photoResult.error,
    });
  }, [id]);

  const { loading, refreshing, onRefresh, opnieuw, herlaad } = useLaden(load, { onFout: setError });

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

  const opSlot = !!workOrder?.ondertekend_op;
  const klaar = rechtenGeladen && !!workOrder;
  // canManage: admin/planner/werkbonnen_bewerken → Bewerken + Nieuwe werkbon.
  const canManage = klaar && canManageWerkbonnen(rechten) && !readonly;
  // canEditDetail: beheerder of verantwoordelijke van deze bon.
  const editDetail = klaar && canEditDetail(workOrder!, rechten);
  const viewOnly = klaar && !editDetail;
  const canEdit = editDetail && !opSlot && !readonly;
  const canBook = klaar && canBookHours(workOrder!, rechten);
  // Taken/meerwerk toevoegen of weggooien en materiaal verwijderen: RLS eist
  // de rol admin of planner.
  const canTasks = klaar && canAddTask(workOrder!, rechten);
  const canDelMaterial = klaar && canDeleteMaterial(workOrder!, rechten);
  const canNote = editDetail && !readonly;
  const magInkoop = can('inkoopprijzen');
  const magBedragen = can('projectbedragen');
  const isAdminPlanner = role === 'admin' || role === 'planner';

  const status = normaliseerStatus(workOrder?.status);

  // ── Status ──────────────────────────────────────────────────────────────
  const zetStatus = async (next: 'in_uitvoering' | 'afgerond', gestartOp?: string | null) => {
    if (!workOrder) return;
    setStatusUpdating(true);
    const { data, error: updateError } = await updateWorkOrderStatus(workOrder, next, gestartOp);
    setStatusUpdating(false);
    if (updateError || !data) {
      Dialog.alert('Status niet opgeslagen', updateError ?? 'Probeer het opnieuw.');
      return;
    }
    setWorkOrder(data);
    if (next === 'afgerond') Dialog.alert('Klus afgerond.');
  };

  const startKlus = () =>
    Dialog.alert('Klus starten', 'De werkbon gaat naar "In uitvoering".', [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Start klus', onPress: () => zetStatus('in_uitvoering') },
    ]);

  const gewoneTaken = useMemo(() => tasks.filter((t) => !t.is_meerwerk), [tasks]);
  const meerwerkTaken = useMemo(() => tasks.filter((t) => t.is_meerwerk), [tasks]);
  const totaalUren = useMemo(() => uren.reduce((sum, u) => sum + Number(u.uren || 0), 0), [uren]);

  /** Afronden (WerkbonAfrondenModal, zonder handtekening). */
  const bevestigAfronden = (gestartOp?: string | null) => {
    const done = gewoneTaken.filter((t) => t.afgerond).length;
    const open = gewoneTaken.length - done;
    const regels = [
      `Taken ${done}/${gewoneTaken.length} · Uren ${formatHours(rond2(totaalUren))} · Materiaal ${materials.length} · Foto's ${photos.length}`,
      open > 0 ? `\n${open} ${open === 1 ? 'taak staat' : 'taken staan'} nog open; die komen niet op de bon die de klant tekent.` : '',
      uren.length === 0 ? '\nEr zijn nog geen uren op deze werkbon geboekt.' : '',
      '\nLaten ondertekenen (nu of per mail) doe je op het dashboard.',
    ].join('');
    Dialog.alert('Klus afronden', regels, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Afronden zonder handtekening', onPress: () => zetStatus('afgerond', gestartOp) },
    ]);
  };

  const vraagAfronden = () => {
    if (!workOrder) return;
    const effectiefGestart = workOrder.gestart_op || (workOrder.gepland_op && workOrder.starttijd);
    if (!effectiefGestart) {
      setStartModal(true);
      return;
    }
    bevestigAfronden();
  };

  // ── Taken ───────────────────────────────────────────────────────────────
  const handleToggleTask = async (task: WorkOrderTask) => {
    if (!canEdit) {
      Dialog.alert(
        opSlot ? 'Werkbon is ondertekend' : 'Alleen inzage',
        opSlot
          ? 'Deze werkbon staat op slot en kan niet meer worden gewijzigd.'
          : 'Alleen de verantwoordelijke, een admin of een planner kan taken afvinken.',
      );
      return;
    }
    setBusyTaskId(task.id);
    const { data, error: taskError } = await setTaskDone(task.id, !task.afgerond);
    setBusyTaskId(null);
    if (taskError || !data) {
      Dialog.alert('Niet opgeslagen', taskError ?? 'Probeer het opnieuw.');
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === data.id ? data : t)));
  };

  const bevestigVerwijderen = (titel: string, tekst: string, doe: () => Promise<string | null>) => {
    Dialog.alert(titel, tekst, [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Verwijderen',
        style: 'destructive',
        onPress: async () => {
          const fout = await doe();
          if (fout) Dialog.alert('Niet verwijderd', fout);
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
      `Taak "${task.omschrijving}" verwijderen?`,
      async () => {
        const { error: e } = await deleteWorkOrderTask(task.id);
        if (!e) setTasks((prev) => prev.filter((t) => t.id !== task.id));
        return e;
      },
    );

  // ── Materialen ──────────────────────────────────────────────────────────
  const handleMaterialAmount = async (m: WerkbonMateriaalRegel, nieuwAantal: number) => {
    if (nieuwAantal <= 0) return;
    const { data, error: e } = await updateMaterialAmount(m, nieuwAantal);
    if (e || !data) {
      Dialog.alert('Niet opgeslagen', e ?? 'Probeer het opnieuw.');
      return;
    }
    setMaterials((prev) => prev.map((x) => (x.id === data.id ? data : x)));
  };

  const handleDeleteMaterial = (m: WerkbonMateriaalRegel) =>
    bevestigVerwijderen('Materiaal verwijderen', `Materiaal "${m.naam}" verwijderen?`, async () => {
      const { error: e } = await deleteWorkOrderMaterial(m.id);
      if (!e) setMaterials((prev) => prev.filter((x) => x.id !== m.id));
      return e;
    });

  const materiaalTotaal = useMemo(
    () => ({
      excl: rond2(materials.reduce((s, m) => s + Number(m.subtotaal || 0), 0)),
      incl: rond2(materials.reduce((s, m) => s + inclusiefBtw(Number(m.subtotaal || 0), m.btw_percentage), 0)),
    }),
    [materials],
  );

  // ── Foto's ──────────────────────────────────────────────────────────────
  const kiesFoto = (categorie: FotoCategorie) => {
    if (!workOrder) return;
    Dialog.alert(`Foto toevoegen · ${FOTO_CATEGORIE_STIJL[categorie].label}`, 'Waar komt de foto vandaan?', [
      { text: 'Camera', onPress: () => pakEnUpload('camera', categorie) },
      { text: 'Fotobibliotheek', onPress: () => pakEnUpload('bibliotheek', categorie) },
      { text: 'Annuleren', style: 'cancel' },
    ]);
  };

  const pakEnUpload = async (bron: 'camera' | 'bibliotheek', categorie: FotoCategorie) => {
    if (!workOrder) return;
    try {
      // Op web geen toestemming vragen: elke await vóór de kiezer kan in
      // Safari de gebruikersactie laten verlopen.
      if (Platform.OS !== 'web') {
        const rechtenVraag =
          bron === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!rechtenVraag.granted) {
          Dialog.alert(
            'Geen toestemming',
            bron === 'camera'
              ? 'Geef BossBase toegang tot de camera om een foto te maken.'
              : "Geef BossBase toegang tot je foto's om er een te kiezen.",
          );
          return;
        }
      }
      const opties: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, base64: FOTO_ALS_BASE64 };
      const resultaat =
        bron === 'camera' ? await ImagePicker.launchCameraAsync(opties) : await ImagePicker.launchImageLibraryAsync(opties);
      if (resultaat.canceled) return;
      const asset = resultaat.assets?.[0];
      if (!asset) {
        Dialog.alert('Foto niet gelezen', 'Probeer het opnieuw of kies een andere foto.');
        return;
      }
      setFotoBezig(categorie);
      const foto = await bereidFotoVoor(asset);
      if (!foto.ok) {
        setFotoBezig(null);
        Dialog.alert(foto.titel, foto.tekst);
        return;
      }
      const { data, error: fotoError } = await uploadWorkOrderPhoto({
        werkbon_id: workOrder.id,
        company_id: workOrder.company_id,
        categorie,
        bytes: foto.bytes,
        contentType: foto.contentType,
        extensie: foto.extensie,
      });
      setFotoBezig(null);
      if (fotoError || !data) {
        Dialog.alert('Foto niet opgeslagen', fotoError ?? 'Probeer het opnieuw.');
        return;
      }
      setPhotos((prev) => [...prev, data]);
    } catch (e) {
      setFotoBezig(null);
      if (__DEV__) console.log('[werkbon] foto toevoegen mislukt', e);
      Dialog.alert('Foto niet opgeslagen', 'Er ging iets mis bij het toevoegen van de foto.');
    }
  };

  const handleDeletePhoto = (foto: WorkOrderPhoto) =>
    bevestigVerwijderen('Foto verwijderen?', 'De foto wordt definitief verwijderd.', async () => {
      const { error: e } = await deleteWorkOrderPhoto(foto.id, foto.url);
      if (!e) setPhotos((prev) => prev.filter((f) => f.id !== foto.id));
      return e;
    });

  // ── Notities ────────────────────────────────────────────────────────────
  const wisselZichtbaarheid = async (n: WerkbonNotitie) => {
    const { data, error: e } = await setNoteVoorKlant(n.id, !n.voor_klant);
    if (e || !data) {
      Dialog.alert('Niet gewijzigd', e ?? 'Probeer het opnieuw.');
      return;
    }
    setNotes((prev) => prev.map((x) => (x.id === data.id ? data : x)));
    Dialog.alert(data.voor_klant ? 'Staat nu op de werkbon' : 'Weer intern');
  };

  const namesFor = (ids: string[] | null | undefined): string =>
    (ids ?? []).map((uid) => teamNames[uid] ?? 'Onbekend').join(', ');

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Dialog.alert('Kon niet openen', 'Deze actie wordt niet door je toestel ondersteund.');
    }
  };

  const topBarLeeg = (
    <AppTopBar variant="detail" title="Werkbon" onBack={() => terugOfNaar(router, '/work-orders')} />
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          {topBarLeeg}
          <LoadingScreen label="Detail laden..." />
        </View>
      </>
    );
  }

  if (error || !workOrder) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          {topBarLeeg}
          <ErrorState
            title="Werkbon niet gevonden"
            message={error ?? 'Deze werkbon bestaat niet of je hebt geen toegang.'}
            onRetry={opnieuw}
          />
        </View>
      </>
    );
  }

  const assignedIds = workOrder.assigned_to_ids?.length
    ? workOrder.assigned_to_ids
    : workOrder.assigned_to
      ? [workOrder.assigned_to]
      : [];
  const verantwIds = workOrder.verantwoordelijke_ids ?? [];
  const uitvoerderIds = assignedIds.filter((x) => !verantwIds.includes(x));
  const dagen = werkbonDagen(workOrder);
  const venster = werkbonVenster(workOrder);
  const pLabel = planningLabel(workOrder);
  const mijn = mijnVolgendeDag(workOrder, user?.id, vandaag());
  const metVoertuigen = hasFeature('voertuigen');
  const busNaam = (vid: string) => voertuigen[vid]?.naam ?? 'Voertuig';
  const klantTel = workOrder.customer?.phone?.replace(/\s/g, '') ?? '';
  const internNotes = notes.filter((n) => !n.voor_klant);
  const klantNotes = notes.filter((n) => n.voor_klant);
  const waarschuwingen = klantNotes.filter((n) => n.waarschuwing_verzonden_op);
  const takenDone = gewoneTaken.filter((t) => t.afgerond).length;

  // Mijn voertuig (alleen met module, en niet als de planningsmelding al staat)
  const mijnBus =
    mijn?.dag && user?.id ? (mijn.dag.medewerker_voertuig?.[user.id] ?? null) : null;

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
          <AppTopBar
            variant="detail"
            onBack={() => terugOfNaar(router, '/work-orders')}
            eyebrow={[workOrder.nummer ?? 'Werkbon', pLabel].filter(Boolean).join(' · ')}
            title={workOrder.titel}
            subtitle={workOrder.customer?.name ?? undefined}
            rightAction={<WerkbonStatusBadge status={workOrder.status} />}
          />
          <AnimatedScreen style={[styles.stack, styles.stackPadding]}>
            {/* 1. Kopkaart */}
            <View style={styles.sectionBody}>
              <View style={styles.kopRij}>
                {workOrder.project ? (
                  <View style={styles.projectPil}>
                    <FolderKanban size={13} color="#0F7A3F" />
                    <Text style={styles.projectPilTekst} numberOfLines={1}>
                      {workOrder.project.name ?? 'Project'}
                    </Text>
                  </View>
                ) : null}
                {viewOnly ? (
                  <Pressable
                    onPress={() =>
                      Dialog.alert(
                        'Alleen inzage',
                        'Je bent gekoppeld aan deze werkbon maar niet verantwoordelijke; je kunt alleen inzien.',
                      )
                    }
                    style={styles.inzagePil}
                    accessibilityRole="button"
                  >
                    <Eye size={13} color={th.muted} />
                    <Text style={styles.inzageTekst}>Alleen inzage</Text>
                  </Pressable>
                ) : null}
                <View style={{ flex: 1 }} />
                {canManage ? (
                  <Pressable
                    onPress={() => router.push(`/work-orders/bewerk/${workOrder.id}`)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.bewerkKnop, pressed && { opacity: 0.8 }]}
                  >
                    <Pencil size={15} color={th.ink2} />
                    <Text style={styles.bewerkTekst}>Bewerken</Text>
                  </Pressable>
                ) : null}
              </View>
              {workOrder.customer ? (
                <Pressable
                  onPress={() => router.push(`/customers/${workOrder.customer!.id}`)}
                  accessibilityRole="link"
                  style={styles.minTouch}
                >
                  <Text style={styles.customerName}>{workOrder.customer.name ?? '—'}</Text>
                </Pressable>
              ) : null}
              {workOrder.locatie ? (
                <View style={styles.infoRegel}>
                  <MapPin size={15} color={th.muted} />
                  <Text style={styles.infoRegelTekst}>{workOrder.locatie}</Text>
                </View>
              ) : null}
              <View style={styles.infoRegel}>
                <CalendarDays size={15} color={th.muted} />
                <Text style={styles.infoRegelTekst}>
                  {pLabel
                    ? `${pLabel}${venster.starttijd ? ` · ${venster.starttijd}${venster.eindtijd ? ` – ${venster.eindtijd}` : ''}` : ''}`
                    : 'Nog niet ingepland'}
                </Text>
              </View>
              {assignedIds.length ? (
                <Text style={styles.ploegTekst}>
                  {verantwIds.length ? `Verantwoordelijk: ${namesFor(verantwIds)}` : ''}
                  {verantwIds.length && uitvoerderIds.length ? '\n' : ''}
                  {uitvoerderIds.length ? `Medewerkers: ${namesFor(uitvoerderIds)}` : ''}
                </Text>
              ) : (
                <Text style={styles.ploegTekst}>Nog niemand gekoppeld.</Text>
              )}
              {metVoertuigen && (workOrder.voertuig_ids ?? []).length && !mijn ? (
                <View style={styles.infoRegel}>
                  <Truck size={15} color={th.muted} />
                  <Text style={styles.infoRegelTekst}>
                    Voertuigen: {(workOrder.voertuig_ids ?? []).map(busNaam).join(', ')}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* 2. Jouw planning */}
            {mijn ? (
              <View style={styles.mijnMelding}>
                <Text style={styles.mijnTekst}>
                  <Text style={{ fontWeight: '800' }}>
                    Jij bent {dagWoord(mijn.dag.datum, vandaag())} ingepland
                  </Text>
                  {mijn.tijd.starttijd ? ` van ${mijn.tijd.starttijd}${mijn.tijd.eindtijd ? ` tot ${mijn.tijd.eindtijd}` : ''}` : ''}
                  {metVoertuigen && mijnBus ? ` · ${busNaam(mijnBus)}` : ''}
                  {mijn.collegas ? ` · samen met ${mijn.collegas} ${mijn.collegas === 1 ? 'collega' : "collega's"}` : ''}
                </Text>
              </View>
            ) : null}

            {/* 3. Actierij */}
            <View style={styles.actieRij}>
              <Pressable
                onPress={() =>
                  klantTel
                    ? openUrl(`tel:${klantTel}`)
                    : Dialog.alert('Geen telefoonnummer bekend voor deze klant')
                }
                disabled={!workOrder.customer}
                accessibilityRole="button"
                style={({ pressed }) => [styles.actieTegel, !workOrder.customer && styles.uit, pressed && { opacity: 0.8 }]}
              >
                <Phone size={18} color={ds.green700} />
                <Text style={styles.actieTegelTekst}>Bel klant</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  workOrder.locatie && openUrl(`https://maps.google.com/?q=${encodeURIComponent(workOrder.locatie)}`)
                }
                disabled={!workOrder.locatie}
                accessibilityRole="button"
                style={({ pressed }) => [styles.actieTegel, !workOrder.locatie && styles.uit, pressed && { opacity: 0.8 }]}
              >
                <MapPin size={18} color={ds.green700} />
                <Text style={styles.actieTegelTekst}>Route</Text>
              </Pressable>
              <Pressable
                onPress={status === 'gepland' ? startKlus : vraagAfronden}
                disabled={!canEdit || status === 'afgerond' || statusUpdating}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.actieTegel,
                  styles.actieTegelHoofd,
                  (!canEdit || status === 'afgerond') && styles.uit,
                  pressed && { opacity: 0.85 },
                ]}
              >
                {statusUpdating ? (
                  <ActivityIndicator size="small" color={ds.greenInk} />
                ) : status === 'gepland' ? (
                  <Play size={18} color={ds.greenInk} />
                ) : (
                  <CheckCircle2 size={18} color={ds.greenInk} />
                )}
                <Text style={[styles.actieTegelTekst, { color: ds.greenInk }]}>
                  {status === 'gepland' ? 'Start klus' : status === 'in_uitvoering' ? 'Afronden' : 'Afgerond'}
                </Text>
              </Pressable>
            </View>

            {/* 4. Slot- en verstuurdmelding */}
            {opSlot ? (
              <View style={[styles.melding, { borderLeftColor: '#0f9d58' }]}>
                <Lock size={16} color={th.muted} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.meldingTitel}>
                    Ondertekend{workOrder.ondertekend_door_naam ? ` door ${workOrder.ondertekend_door_naam}` : ''}
                  </Text>
                  <Text style={styles.meldingTekst}>
                    {workOrder.ondertekend_op ? formatDatumTijd(workOrder.ondertekend_op) : ''}
                    {'\n'}Uren, taken en materiaal staan op slot. Een correctie loopt via een nieuwe werkbon.
                    {!workOrder.ondertekende_pdf_url ? '\nGetekend, PDF ontbreekt — open de werkbon op het dashboard.' : ''}
                  </Text>
                </View>
              </View>
            ) : workOrder.verstuurd_op ? (
              <View style={[styles.melding, { borderLeftColor: '#FDBA74' }]}>
                <Send size={16} color={th.muted} />
                <Text style={[styles.meldingTekst, { flex: 1 }]}>
                  Ter ondertekening gestuurd naar {workOrder.verstuurd_naar_email ?? 'de klant'} op{' '}
                  {formatDateNL(workOrder.verstuurd_op)}. Nog niet getekend.
                </Text>
              </View>
            ) : null}

            {/* 5. Omschrijving */}
            {workOrder.omschrijving || workOrder.notes ? (
              <Section styles={styles} title="Omschrijving">
                {workOrder.omschrijving ? (
                  <Text style={styles.descriptionText}>{alsTekst(workOrder.omschrijving)}</Text>
                ) : null}
                {workOrder.notes?.trim() ? (
                  <View style={styles.interneBalk}>
                    <Text style={styles.interneLabel}>Interne notitie:</Text>
                    <Text style={styles.descriptionText}>{alsTekst(workOrder.notes)}</Text>
                  </View>
                ) : null}
              </Section>
            ) : null}

            {/* 6. Planning */}
            <Section
              styles={styles}
              title={`Planning · ${dagen.length} ${dagen.length === 1 ? 'dag' : 'dagen'}`}
              icon={<CalendarDays size={16} color={ds.green700} />}
              action={
                canManage && can('planning') && !opSlot ? (
                  <KopKnop styles={styles} label="Planning aanpassen" onPress={() => router.push(`/work-orders/bewerk/${workOrder.id}`)} />
                ) : null
              }
            >
              {dagen.length === 0 ? (
                <Text style={styles.empty}>Deze werkbon staat nog niet ingepland.</Text>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {dagen.map((d) => {
                    const v = dagVenster(workOrder, d);
                    const ploeg = ploegOpDag(workOrder, d);
                    const bussen = metVoertuigen
                      ? (Array.isArray(d.voertuig_ids) ? d.voertuig_ids : (workOrder.voertuig_ids ?? []))
                      : [];
                    return (
                      <View key={d.id ?? d.datum} style={styles.dagRij}>
                        <Text style={styles.dagDatum}>
                          {korteDatum(d.datum)}
                          {v.starttijd ? ` · ${v.starttijd}${v.eindtijd ? `–${v.eindtijd}` : ''}` : ''}
                        </Text>
                        <Text style={styles.dagWie}>
                          {ploeg.length
                            ? ploeg
                                .map((pid) => {
                                  const eigen = d.medewerker_tijden?.[pid];
                                  const tp = tijdenVoorPersoon(workOrder, d, pid);
                                  return `${teamNames[pid] ?? 'Onbekend'}${eigen?.starttijd ? ` (${tp.starttijd}–${tp.eindtijd ?? ''})` : ''}`;
                                })
                                .join(', ')
                            : 'Niemand ingepland'}
                        </Text>
                        {bussen.map((vid) => {
                          const vt = d.voertuig_tijden?.[vid];
                          const inzittenden = Object.entries(d.medewerker_voertuig ?? {})
                            .filter(([, b]) => b === vid)
                            .map(([pid]) => teamNames[pid] ?? 'Onbekend');
                          return (
                            <Text key={vid} style={styles.dagBus}>
                              {busNaam(vid)}
                              {vt?.starttijd ? ` · ${hhmm(vt.starttijd)}–${hhmm(vt.eindtijd)}` : ''}
                              {inzittenden.length ? ` · ${inzittenden.join(', ')}` : ''}
                            </Text>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              )}
            </Section>

            {/* 7. Taken */}
            <Section
              styles={styles}
              title={`Taken · ${takenDone} / ${gewoneTaken.length}`}
              icon={<ListChecks size={16} color={ds.green700} />}
              action={canTasks ? <KopKnop styles={styles} label="+ Taak" onPress={() => setTaskModal({ meerwerk: false })} /> : null}
            >
              {partialErrors.taken ? (
                <Text style={styles.sectionError}>{partialErrors.taken}</Text>
              ) : (
                <>
                  {gewoneTaken.length ? (
                    <View style={styles.balk}>
                      <View
                        style={[styles.balkVulling, { width: `${Math.round((takenDone / gewoneTaken.length) * 100)}%` }]}
                      />
                    </View>
                  ) : (
                    <Text style={styles.empty}>Nog geen taken.</Text>
                  )}
                  <View style={{ gap: spacing.sm }}>
                    {gewoneTaken.map((t) => (
                      <TaskRow
                        key={t.id}
                        styles={styles}
                        th={th}
                        task={t}
                        busy={busyTaskId === t.id}
                        disabled={!canEdit}
                        onToggle={() => handleToggleTask(t)}
                        onDelete={canTasks ? () => handleDeleteTask(t) : undefined}
                      />
                    ))}
                  </View>
                </>
              )}
            </Section>

            {/* 8. Uren — alleen lezen; boeken via het formulier */}
            <Section
              styles={styles}
              title={`Uren · ${formatHours(rond2(totaalUren))}`}
              action={canBook ? <KopKnop styles={styles} label="+ Boeken" onPress={() => setTimeModal(true)} /> : null}
            >
              {partialErrors.uren ? (
                <Text style={styles.sectionError}>{partialErrors.uren}</Text>
              ) : uren.length === 0 ? (
                <Text style={styles.empty}>Nog geen uren geboekt.</Text>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {[...uren]
                    .sort((a, b) => a.datum.localeCompare(b.datum) || (a.start_tijd ?? '').localeCompare(b.start_tijd ?? ''))
                    .map((u) => (
                      <View key={u.id} style={styles.timeEntry}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.timeEntryDate}>
                            {korteDatum(u.datum)} · {u.medewerker?.full_name ?? 'Onbekend'}
                          </Text>
                          {u.pauze_minuten || u.reis_km || u.notitie ? (
                            <Text style={styles.timeEntryNote} numberOfLines={2}>
                              {[
                                u.pauze_minuten ? `${u.pauze_minuten} min pauze` : null,
                                u.reis_km ? `${u.reis_km} km` : null,
                                u.notitie,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          ) : null}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          {u.start_tijd ? (
                            <Text style={styles.timeEntryNote}>
                              {hhmm(u.start_tijd)}–{hhmm(u.eind_tijd)}
                            </Text>
                          ) : null}
                          <Text style={styles.timeEntryHours}>{Number(u.uren).toFixed(2).replace('.', ',')}</Text>
                        </View>
                      </View>
                    ))}
                </View>
              )}
              {!canBook && !opSlot ? (
                <Text style={styles.photoHint}>
                  Uren op deze werkbon worden geboekt door de uitvoerder of de verantwoordelijke.
                </Text>
              ) : null}
            </Section>

            {/* 9. Foto's per fase */}
            <Section styles={styles} title={`Foto's · ${photos.length}`} icon={<ImageIcon size={16} color={ds.green700} />}>
              {partialErrors.fotos ? (
                <Text style={styles.sectionError}>{partialErrors.fotos}</Text>
              ) : !canEdit && photos.length === 0 ? (
                <Text style={styles.empty}>Geen foto&apos;s</Text>
              ) : (
                FOTO_CATEGORIEEN.map((cat) => {
                  const stijl = FOTO_CATEGORIE_STIJL[cat];
                  const lijst = photos.filter((p) => (p.categorie ?? 'tijdens') === cat);
                  if (!canEdit && lijst.length === 0) return null;
                  return (
                    <View key={cat} style={{ gap: 8 }}>
                      <View style={[styles.fotoLabel, { backgroundColor: stijl.bg }]}>
                        <Text style={[styles.fotoLabelTekst, { color: stijl.kleur }]}>
                          {stijl.label} · {lijst.length}
                        </Text>
                      </View>
                      <View style={styles.photoGrid}>
                        {lijst.map((ph) => (
                          <View key={ph.id}>
                            <Pressable
                              onPress={() => openUrl(ph.url)}
                              accessibilityLabel={`Foto ${stijl.label} openen`}
                              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                            >
                              <Image source={{ uri: ph.url }} style={styles.photo} />
                            </Pressable>
                            {canEdit ? (
                              <Pressable
                                onPress={() => handleDeletePhoto(ph)}
                                accessibilityLabel="Foto verwijderen"
                                hitSlop={8}
                                style={styles.fotoWeg}
                              >
                                <X size={14} color="#fff" strokeWidth={3} />
                              </Pressable>
                            ) : null}
                          </View>
                        ))}
                        {canEdit ? (
                          <Pressable
                            onPress={() => kiesFoto(cat)}
                            disabled={!!fotoBezig}
                            accessibilityRole="button"
                            accessibilityLabel={`Foto toevoegen bij ${stijl.label}`}
                            style={({ pressed }) => [styles.fotoToevoegen, pressed && { opacity: 0.8 }]}
                          >
                            {fotoBezig === cat ? (
                              <ActivityIndicator size="small" color={ds.green700} />
                            ) : (
                              <Plus size={20} color={th.muted} />
                            )}
                            <Text style={styles.fotoToevoegenTekst}>{fotoBezig === cat ? 'Uploaden…' : 'Foto toevoegen'}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </Section>

            {/* 10. Materialen */}
            <Section
              styles={styles}
              title="Materialen"
              icon={<Package size={16} color={ds.green700} />}
              action={canEdit ? <KopKnop styles={styles} label="+ Materiaal" onPress={() => setMaterialModal(true)} /> : null}
            >
              {partialErrors.materialen ? (
                <Text style={styles.sectionError}>{partialErrors.materialen}</Text>
              ) : materials.length === 0 ? (
                <Text style={styles.empty}>Geen materialen op deze werkbon.</Text>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {materials.map((m) => (
                    <View key={m.id} style={styles.materialKaart}>
                      <View style={styles.materialRow}>
                        <View style={styles.qtyPill}>
                          <Text style={styles.qtyPillText}>
                            {formatQty(m.aantal)} {m.eenheid ?? '×'}
                          </Text>
                        </View>
                        <Text style={styles.materialName} numberOfLines={2}>
                          {m.naam}
                        </Text>
                        {canEdit ? (
                          <View style={styles.stepper}>
                            <Pressable
                              onPress={() => handleMaterialAmount(m, m.aantal - 1)}
                              disabled={m.aantal <= 1}
                              accessibilityLabel={`Eén ${m.naam} minder`}
                              style={({ pressed }) => [styles.stepBtn, m.aantal <= 1 && styles.uit, pressed && { opacity: 0.6 }]}
                            >
                              <Text style={styles.stepText}>−</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleMaterialAmount(m, m.aantal + 1)}
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
                            accessibilityLabel={`${m.naam} verwijderen`}
                            style={({ pressed }) => [styles.iconKnop, pressed && { opacity: 0.6 }]}
                          >
                            <Trash2 size={16} color={th.muted} strokeWidth={2} />
                          </Pressable>
                        ) : null}
                      </View>
                      <Text style={styles.materialMeta}>
                        {[
                          magBedragen ? `Verkoop ${formatEUR(m.prijs_per)}` : null,
                          magInkoop && m.inkoopprijs_per != null ? `Inkoop ${formatEUR(m.inkoopprijs_per)}` : null,
                          m.leverancier_id ? (leveranciers[m.leverancier_id] ?? null) : null,
                          magBedragen ? `Subtotaal ${formatEUR(m.subtotaal)} (${formatEUR(inclusiefBtw(m.subtotaal, m.btw_percentage))} incl.)` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  ))}
                  {magBedragen ? (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Totaal materiaal (excl. BTW)</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.totalValue}>{formatEUR(materiaalTotaal.excl)}</Text>
                        <Text style={styles.timeEntryNote}>{formatEUR(materiaalTotaal.incl)} incl. BTW</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              )}
            </Section>

            {/* 11. Meerwerk */}
            <Section
              styles={styles}
              title="Meerwerk"
              icon={<PlusCircle size={16} color={ds.green700} />}
              action={canTasks ? <KopKnop styles={styles} label="+ Meerwerk" onPress={() => setTaskModal({ meerwerk: true })} /> : null}
            >
              <Text style={styles.meerwerkHint}>
                Werk dat er tijdens de klus bij kwam. Telt niet mee in de taakvoortgang.
              </Text>
              {meerwerkTaken.length === 0 ? <Text style={styles.empty}>Geen meerwerk op deze klus.</Text> : null}
              {meerwerkTaken.map((t) => (
                <TaskRow
                  key={t.id}
                  styles={styles}
                  th={th}
                  task={t}
                  busy={busyTaskId === t.id}
                  disabled={!canEdit}
                  onToggle={() => handleToggleTask(t)}
                  onDelete={canTasks ? () => handleDeleteTask(t) : undefined}
                />
              ))}
            </Section>

            {/* 12. Notities: Intern / Voor de klant */}
            <Section
              styles={styles}
              title="Notities"
              action={canNote ? <KopKnop styles={styles} label="+ Notitie" onPress={() => setNoteModal(true)} /> : null}
            >
              <View style={styles.tabRij}>
                {(['intern', 'klant'] as const).map((tab) => {
                  const aan = notitieTab === tab;
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => setNotitieTab(tab)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: aan }}
                      style={[styles.tab, aan && styles.tabAan]}
                    >
                      <Text style={[styles.tabTekst, aan && styles.tabTekstAan]}>
                        {tab === 'intern' ? `Intern · ${internNotes.length}` : `Voor de klant · ${klantNotes.length}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {notitieTab === 'klant' ? (
                <View style={styles.klantInfo}>
                  <Text style={styles.klantInfoTekst}>
                    Deze regels staan op de werkbon-PDF en op de pagina waar de klant tekent.
                  </Text>
                </View>
              ) : null}
              {partialErrors.notities ? (
                <Text style={styles.sectionError}>{partialErrors.notities}</Text>
              ) : (notitieTab === 'intern' ? internNotes : klantNotes).length === 0 ? (
                <Text style={styles.empty}>
                  {notitieTab === 'intern' ? 'Nog geen interne notities.' : 'Nog geen notities voor de klant.'}
                </Text>
              ) : (
                <View style={{ gap: spacing.md }}>
                  {(notitieTab === 'intern' ? internNotes : klantNotes).map((n) => {
                    const magWisselen = canNote && (n.created_by === user?.id || isAdminPlanner);
                    return (
                      <View key={n.id} style={styles.noteCard}>
                        <View style={styles.noteMetaRow}>
                          <Text style={styles.noteMeta}>
                            {[n.auteur?.full_name ?? 'Onbekend', formatDateNL(n.created_at)].join(' · ')}
                          </Text>
                          {n.waarschuwing_verzonden_op ? (
                            <View style={styles.notePill}>
                              <Text style={styles.notePillText}>Gewaarschuwd</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.noteBody}>{alsTekst(n.note)}</Text>
                        {magWisselen ? (
                          <Pressable
                            onPress={() => wisselZichtbaarheid(n)}
                            accessibilityRole="button"
                            style={styles.linkKnop}
                          >
                            <Text style={styles.addText}>{n.voor_klant ? 'Naar intern' : 'Naar de klant'}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </Section>

            {waarschuwingen.length ? (
              <Section
                styles={styles}
                title="Waarschuwingen aan de klant"
                icon={<AlertTriangle size={16} color="#F59E0B" />}
              >
                {waarschuwingen.map((n) => (
                  <View key={n.id} style={styles.waarschuwing}>
                    <Text style={styles.waarschuwingKop}>GECONSTATEERD</Text>
                    <Text style={styles.waarschuwingTekst}>{alsTekst(n.note)}</Text>
                    {n.gevolg ? (
                      <>
                        <Text style={styles.waarschuwingKop}>MOGELIJK GEVOLG</Text>
                        <Text style={styles.waarschuwingTekst}>{alsTekst(n.gevolg)}</Text>
                      </>
                    ) : null}
                    <Text style={styles.waarschuwingVoet}>
                      Schriftelijk gemeld op {formatDateNL(n.waarschuwing_verzonden_op)}
                      {n.waarschuwing_verzonden_naar ? ` aan ${n.waarschuwing_verzonden_naar}` : ''}
                    </Text>
                  </View>
                ))}
              </Section>
            ) : null}

            {/* 13. Eindactie */}
            {opSlot ? (
              <View style={[styles.eindKnop, styles.eindKnopKlaar]}>
                <Text style={styles.eindKnopTekst}>
                  Ondertekend en afgerond · {formatDateNL(workOrder.ondertekend_op)}
                </Text>
              </View>
            ) : status !== 'afgerond' && editDetail && !readonly ? (
              <Button label="Klus afronden" onPress={vraagAfronden} loading={statusUpdating} />
            ) : null}

            <View style={styles.metaBlock}>
              <Text style={styles.metaText}>
                Aangemaakt {formatDateNL(workOrder.created_at)}
                {workOrder.updated_at ? ` · bijgewerkt ${formatDateNL(workOrder.updated_at)}` : ''}
              </Text>
            </View>
          </AnimatedScreen>
        </ScrollView>
        <StatusBarScrim />
      </View>

      <AddNoteModal
        styles={styles}
        th={th}
        visible={noteModal}
        voorKlant={notitieTab === 'klant'}
        onClose={() => setNoteModal(false)}
        onSubmit={async (body) => {
          if (!user?.id) return { error: 'Sessie niet geladen.' };
          const { data, error: noteError } = await addWorkOrderNote({
            werkbon_id: workOrder.id,
            company_id: workOrder.company_id,
            created_by: user.id,
            note: alsHtml(body),
            voor_klant: notitieTab === 'klant',
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

      {materialModal ? (
        <AddMaterialModal
          styles={styles}
          th={th}
          magInkoop={magInkoop}
          magBedragen={magBedragen}
          onClose={() => setMaterialModal(false)}
          onSubmit={async (regel) => {
            const { data, error: matError } = await addWorkOrderMaterial({
              werkbon_id: workOrder.id,
              company_id: workOrder.company_id,
              ...regel,
            });
            if (matError || !data) return { error: matError ?? 'Opslaan mislukt.' };
            setMaterials((prev) => [...prev, data]);
            if (data.leverancier_id && !leveranciers[data.leverancier_id]) herlaad();
            return { error: null };
          }}
        />
      ) : null}

      {timeModal ? (
        <AddTimeEntryModal
          styles={styles}
          th={th}
          ikzelf={user?.id ?? null}
          kiesMedewerker={isAdminPlanner}
          onClose={() => setTimeModal(false)}
          onSubmit={async (input) => {
            if (!user?.id) return { error: 'Sessie niet geladen.' };
            const res = await createWerkbonUur({
              company_id: workOrder.company_id,
              werkbon_id: workOrder.id,
              profile_id: input.profileId ?? user.id,
              datum: input.datum,
              start_tijd: input.start,
              eind_tijd: input.eind,
              pauze_minuten: input.pauze,
              uren: input.uren,
              reis_km: input.km,
              notitie: input.notitie,
            });
            if (!res.ok) return { error: res.melding };
            setUren((prev) => [res.data, ...prev]);
            return { error: null };
          }}
        />
      ) : null}

      {startModal ? (
        <StartMomentModal
          styles={styles}
          th={th}
          onClose={() => setStartModal(false)}
          onSubmit={(iso) => {
            setStartModal(false);
            bevestigAfronden(iso);
          }}
        />
      ) : null}
    </>
  );
}

function formatDatumTijd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function KopKnop({ styles, label, onPress }: { styles: Styles; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.kopKnop, pressed && { opacity: 0.7 }]}>
      <Text style={styles.addText}>{label}</Text>
    </Pressable>
  );
}

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
          <CheckCircle2 size={20} color={ds.green700} strokeWidth={2.2} />
        ) : (
          <Circle size={20} color={disabled ? th.muted2 : th.muted} strokeWidth={2} />
        )}
        <Text style={[styles.taskText, task.afgerond && styles.taskTextDone]} numberOfLines={3}>
          {task.omschrijving}
        </Text>
      </Pressable>
      {busy ? <ActivityIndicator size="small" color={ds.green700} /> : null}
      {onDelete ? (
        <Pressable
          onPress={onDelete}
          accessibilityLabel={`${task.omschrijving} verwijderen`}
          style={({ pressed }) => [styles.iconKnop, pressed && { opacity: 0.6 }]}
        >
          <Trash2 size={16} color={th.muted} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function ModalKop({ styles, titel, onClose }: { styles: Styles; titel: string; onClose: () => void }) {
  return (
    <View style={styles.modalHeader}>
      <Pressable onPress={onClose} hitSlop={8} style={styles.minTouch} accessibilityRole="button">
        <Text style={styles.modalCancel}>Annuleren</Text>
      </Pressable>
      <Text style={styles.modalTitle}>{titel}</Text>
      <View style={{ width: 64 }} />
    </View>
  );
}

function AddNoteModal({
  styles,
  th,
  visible,
  voorKlant,
  onClose,
  onSubmit,
}: {
  styles: Styles;
  th: ThemeColors;
  visible: boolean;
  /** Waar je typt bepaalt de zichtbaarheid (tab van het dashboard). */
  voorKlant: boolean;
  onClose: () => void;
  onSubmit: (body: string) => Promise<{ error: string | null }>;
}) {
  useFocusTerug(visible);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const close = () => {
    setBody('');
    setSubmitting(false);
    setErrorMsg(null);
    onClose();
  };
  const submit = async () => {
    if (!body.trim()) {
      setErrorMsg('Voer een notitie in.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    const { error: submitError } = await onSubmit(body);
    setSubmitting(false);
    if (submitError) {
      setErrorMsg(submitError);
      return;
    }
    close();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="formSheet">
      <MobielKader soort="formulier">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: th.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ModalKop styles={styles} titel={voorKlant ? 'Notitie voor de klant' : 'Interne notitie'} onClose={close} />
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {voorKlant ? (
              <View style={styles.klantInfo}>
                <Text style={styles.klantInfoTekst}>
                  Deze regel komt op de werkbon-PDF en op de pagina waar de klant tekent.
                </Text>
              </View>
            ) : null}
            <FormField
              label="Notitie"
              value={body}
              onChangeText={setBody}
              multiline
              placeholder="Wat moet er bewaard blijven?"
              autoFocus
              editable={!submitting}
            />
            {errorMsg ? <Text style={styles.modalError}>{errorMsg}</Text> : null}
            <Button label="Opslaan" onPress={submit} loading={submitting} />
          </ScrollView>
        </KeyboardAvoidingView>
      </MobielKader>
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
  useFocusTerug(visible);
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
    // Dashboard: na opslaan meteen de volgende regel kunnen typen.
    setOmschrijving('');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="formSheet">
      <MobielKader soort="formulier">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: th.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ModalKop styles={styles} titel={meerwerk ? 'Meerwerk' : 'Taak'} onClose={close} />
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            {meerwerk ? (
              <Text style={styles.meerwerkHint}>
                Werk dat er tijdens de klus bij kwam. Telt niet mee in de taakvoortgang.
              </Text>
            ) : null}
            <FormField
              label="Omschrijving"
              value={omschrijving}
              onChangeText={setOmschrijving}
              placeholder={meerwerk ? 'Wat is er extra gedaan?' : 'Nieuwe taak…'}
              autoFocus
              editable={!submitting}
              onSubmitEditing={submit}
              returnKeyType="done"
            />
            {errorMsg ? <Text style={styles.modalError}>{errorMsg}</Text> : null}
            <Button label={meerwerk ? '+ Meerwerk' : '+ Taak'} onPress={submit} loading={submitting} />
            <Button label="Klaar" variant="secondary" onPress={close} disabled={submitting} />
          </ScrollView>
        </KeyboardAvoidingView>
      </MobielKader>
    </Modal>
  );
}

type NieuweRegel = {
  naam: string;
  eenheid: string;
  aantal: number;
  prijs_per: number | null;
  btw_percentage: number;
  materiaal_id: string | null;
  leverancier_id: string | null;
  inkoopprijs_per?: number | null;
};

const VRIJ = '__vrij__';

/**
 * Materiaal op de werkbon (MaterialenSection): kies uit de actieve
 * bibliotheek (prijs, btw, inkoop en leverancier liggen dan vast) of vul vrij
 * materiaal in. Verkoopprijs alleen met `projectbedragen`, inkoop alleen met
 * `inkoopprijzen`; zonder die rechten komt vrij materiaal op € 0.
 */
function AddMaterialModal({
  styles,
  th,
  magInkoop,
  magBedragen,
  onClose,
  onSubmit,
}: {
  styles: Styles;
  th: ThemeColors;
  magInkoop: boolean;
  magBedragen: boolean;
  onClose: () => void;
  onSubmit: (regel: NieuweRegel) => Promise<{ error: string | null }>;
}) {
  useFocusTerug(true);
  const [bibliotheek, setBibliotheek] = useState<Materiaal[]>([]);
  const [leveranciers, setLeveranciers] = useState<{ id: string; naam: string }[]>([]);
  const [keuze, setKeuze] = useState<string | null>(null);
  const [naam, setNaam] = useState('');
  const [eenheid, setEenheid] = useState('stuk');
  const [aantalStr, setAantalStr] = useState('1');
  const [prijsStr, setPrijsStr] = useState('');
  const [inkoopStr, setInkoopStr] = useState('');
  const [leverancierId, setLeverancierId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const laad = useCallback(async () => {
    const [m, l] = await Promise.all([listMaterialen({ inclusiefInactief: false }), listLeveranciers()]);
    setBibliotheek(m.data);
    setLeveranciers(l.data.filter((x) => x.actief));
  }, []);
  useLaden(laad, { bijFocus: false });

  const gekozen = bibliotheek.find((m) => m.id === keuze) ?? null;
  const vrij = keuze === VRIJ;

  const submit = async () => {
    const aantal = Number(aantalStr.replace(',', '.'));
    if (!keuze) return setErrorMsg('Kies een materiaal of vrij materiaal.');
    const regelNaam = gekozen ? gekozen.naam : naam;
    if (!regelNaam.trim()) return setErrorMsg('Vul een naam in.');
    if (!Number.isFinite(aantal) || aantal <= 0) return setErrorMsg('Vul een geldig aantal in.');
    const regel: NieuweRegel = gekozen
      ? {
          naam: gekozen.naam,
          eenheid: gekozen.eenheid,
          aantal,
          prijs_per: gekozen.verkoopprijs ?? 0,
          btw_percentage: gekozen.btwPct,
          materiaal_id: gekozen.id,
          leverancier_id: gekozen.leverancierId,
          ...(magInkoop && gekozen.inkoopprijs != null ? { inkoopprijs_per: gekozen.inkoopprijs } : {}),
        }
      : {
          naam: naam.trim(),
          eenheid,
          aantal,
          prijs_per: magBedragen ? (leesBedrag(prijsStr) ?? 0) : 0,
          btw_percentage: 21,
          materiaal_id: null,
          leverancier_id: leverancierId,
          ...(magInkoop && leesBedrag(inkoopStr) != null ? { inkoopprijs_per: leesBedrag(inkoopStr) } : {}),
        };
    setSubmitting(true);
    setErrorMsg(null);
    const { error: e } = await onSubmit(regel);
    setSubmitting(false);
    if (e) return setErrorMsg(e);
    onClose();
  };

  const aantalNum = Number(aantalStr.replace(',', '.')) || 0;
  const prijs = gekozen ? (gekozen.verkoopprijs ?? 0) : (leesBedrag(prijsStr) ?? 0);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="formSheet">
      <MobielKader soort="formulier">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: th.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ModalKop styles={styles} titel="Materiaal" onClose={onClose} />
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <SelectField
              label="Kies materiaal"
              value={keuze}
              onChange={setKeuze}
              placeholder="Kies materiaal"
              searchable
              options={[
                { id: VRIJ, label: 'Vrij materiaal (zelf invullen)…' },
                ...bibliotheek.map((m) => ({
                  id: m.id,
                  label: m.naam,
                  sub: [m.eenheid, m.artikelnummer, magBedragen && m.verkoopprijs != null ? formatEUR(m.verkoopprijs) : null]
                    .filter(Boolean)
                    .join(' · '),
                })),
              ]}
            />
            {vrij ? (
              <>
                <FormField label="Naam" value={naam} onChangeText={setNaam} placeholder="Bijv. Installatiedraad 2,5mm²" editable={!submitting} />
                <View>
                  <Text style={styles.veldLabel}>Eenheid</Text>
                  <View style={styles.chipRij}>
                    {EENHEDEN.map((e) => (
                      <Pressable
                        key={e}
                        onPress={() => setEenheid(e)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: eenheid === e }}
                        style={[styles.keuzeChip, eenheid === e && styles.keuzeChipAan]}
                      >
                        <Text style={[styles.keuzeChipTekst, eenheid === e && { color: th.green700 }]}>{e}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </>
            ) : gekozen ? (
              <Text style={styles.meerwerkHint}>
                {gekozen.eenheid}
                {magBedragen && gekozen.verkoopprijs != null ? ` · verkoop ${formatEUR(gekozen.verkoopprijs)}` : ''}
                {magInkoop && gekozen.inkoopprijs != null ? ` · inkoop ${formatEUR(gekozen.inkoopprijs)}` : ''}
                {'\n'}Prijs en leverancier liggen vast op het materiaal in de bibliotheek.
              </Text>
            ) : null}
            <FormField label="Aantal" value={aantalStr} onChangeText={setAantalStr} keyboardType="decimal-pad" editable={!submitting} />
            {vrij && magBedragen ? (
              <FormField label="Verkoopprijs per eenheid (excl. btw)" value={prijsStr} onChangeText={setPrijsStr} keyboardType="decimal-pad" placeholder="0,00" />
            ) : null}
            {vrij && magInkoop ? (
              <FormField label="Inkoop per eenheid (excl. btw · intern)" value={inkoopStr} onChangeText={setInkoopStr} keyboardType="decimal-pad" placeholder="0,00" />
            ) : null}
            {vrij ? (
              <SelectField
                label="Leverancier"
                value={leverancierId}
                onChange={setLeverancierId}
                allowEmpty
                emptyLabel="— Geen leverancier —"
                placeholder="— Geen leverancier —"
                options={leveranciers.map((l) => ({ id: l.id, label: l.naam }))}
              />
            ) : null}
            {magBedragen && keuze ? (
              <Text style={styles.meerwerkHint}>Subtotaal {formatEUR(materiaalSubtotaal(aantalNum, prijs))} (excl. btw)</Text>
            ) : null}
            {errorMsg ? <Text style={styles.modalError}>{errorMsg}</Text> : null}
            <Button label="Toevoegen" onPress={submit} loading={submitting} disabled={!keuze || (vrij && !naam.trim())} />
          </ScrollView>
        </KeyboardAvoidingView>
      </MobielKader>
    </Modal>
  );
}

/**
 * Uren boeken (HoursQuickAdd): datum, (admin/planner) medewerker, begin en eind
 * (afgerond op 5 min), pauze, gereden kilometers en notitie. Uren = eind −
 * begin − pauze.
 */
function AddTimeEntryModal({
  styles,
  th,
  ikzelf,
  kiesMedewerker,
  onClose,
  onSubmit,
}: {
  styles: Styles;
  th: ThemeColors;
  ikzelf: string | null;
  kiesMedewerker: boolean;
  onClose: () => void;
  onSubmit: (input: {
    profileId: string | null;
    datum: string;
    start: string;
    eind: string;
    pauze: number;
    uren: number;
    km: number | null;
    notitie: string | null;
  }) => Promise<{ error: string | null }>;
}) {
  useFocusTerug(true);
  const [datum, setDatum] = useState(vandaagISO());
  const [profileId, setProfileId] = useState<string | null>(ikzelf);
  const [team, setTeam] = useState<{ id: string; full_name: string | null }[]>([]);
  const [start, setStart] = useState('');
  const [eind, setEind] = useState('');
  const [pauzeStr, setPauzeStr] = useState('0');
  const [kmStr, setKmStr] = useState('');
  const [notitie, setNotitie] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const laad = useCallback(async () => {
    if (!kiesMedewerker) return;
    const { data } = await listCompanyProfiles();
    setTeam(data);
  }, [kiesMedewerker]);
  useLaden(laad, { bijFocus: false });

  const pauze = Math.max(0, Math.round(Number(pauzeStr.replace(',', '.')) || 0));
  const uren = start && eind ? berekenUren(start, eind, pauze) : null;
  const tijdFout =
    start && eind
      ? eind <= start
        ? 'Eindtijd moet later zijn dan starttijd'
        : uren === null || uren <= 0
          ? 'Er blijft geen tijd over na aftrek van de pauze'
          : null
      : null;

  const submit = async () => {
    if (!isGeldigeISODatum(datum)) return setErrorMsg('Kies een geldige datum.');
    if (!start || !eind) return setErrorMsg('Vul een begin- en eindtijd in.');
    if (tijdFout || uren === null) return setErrorMsg(tijdFout ?? 'Controleer de tijden.');
    const km = kmStr.trim() ? Math.round(Number(kmStr.replace(',', '.'))) : null;
    if (km !== null && (!Number.isFinite(km) || km < 0)) return setErrorMsg('Vul een geldig aantal kilometers in.');
    setSubmitting(true);
    setErrorMsg(null);
    const { error: e } = await onSubmit({
      profileId,
      datum,
      start,
      eind,
      pauze,
      uren,
      km,
      notitie: notitie.trim() || null,
    });
    setSubmitting(false);
    if (e) return setErrorMsg(e);
    onClose();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="formSheet">
      <MobielKader soort="formulier">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: th.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ModalKop styles={styles} titel="Uren boeken" onClose={onClose} />
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <DateField label="Datum *" value={datum} onChange={setDatum} disabled={submitting} />
            {kiesMedewerker ? (
              <SelectField
                label="Medewerker"
                value={profileId}
                onChange={setProfileId}
                options={team.map((c) => ({
                  id: c.id,
                  label: `${c.full_name ?? 'Naamloos'}${c.id === ikzelf ? ' (ikzelf)' : ''}`,
                }))}
              />
            ) : null}
            <View style={styles.tijdRij}>
              <View style={{ flex: 1 }}>
                <TimeField label="Starttijd *" value={start || null} onChange={(v) => setStart(rondAfOpVijf(v))} />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField label="Eindtijd *" value={eind || null} onChange={(v) => setEind(rondAfOpVijf(v))} />
              </View>
            </View>
            <View>
              <Text style={styles.veldLabel}>Pauze (minuten)</Text>
              <View style={styles.chipRij}>
                {[0, 15, 30, 45, 60].map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setPauzeStr(String(m))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: pauze === m }}
                    style={[styles.keuzeChip, pauze === m && styles.keuzeChipAan]}
                  >
                    <Text style={[styles.keuzeChipTekst, pauze === m && { color: th.green700 }]}>{m}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <FormField label="Of zelf (minuten)" value={pauzeStr} onChangeText={setPauzeStr} keyboardType="number-pad" />
            {uren !== null && !tijdFout ? (
              <Text style={styles.meerwerkHint}>
                ≈ {uren.toFixed(2).replace('.', ',')} uur{pauze ? ` (${pauze} min pauze eraf)` : ''}
              </Text>
            ) : null}
            {tijdFout ? <Text style={styles.modalError}>{tijdFout}</Text> : null}
            <FormField label="Gereden kilometers (optioneel)" value={kmStr} onChangeText={setKmStr} keyboardType="number-pad" />
            <FormField label="Notitie" value={notitie} onChangeText={setNotitie} multiline placeholder="Wat is er gedaan?" />
            {errorMsg ? <Text style={styles.modalError}>{errorMsg}</Text> : null}
            <Button label="Opslaan" onPress={submit} loading={submitting} disabled={!start || !eind || !!tijdFout} />
          </ScrollView>
        </KeyboardAvoidingView>
      </MobielKader>
    </Modal>
  );
}

/** "Wanneer is de klus gestart?" — nodig om af te ronden zonder startmoment. */
function StartMomentModal({
  styles,
  th,
  onClose,
  onSubmit,
}: {
  styles: Styles;
  th: ThemeColors;
  onClose: () => void;
  onSubmit: (iso: string) => void;
}) {
  useFocusTerug(true);
  const [datum, setDatum] = useState(vandaagISO());
  const [tijd, setTijd] = useState('');
  const [fout, setFout] = useState<string | null>(null);
  const opslaan = () => {
    if (!isGeldigeISODatum(datum) || datum > vandaagISO()) return setFout('Kies een startdatum van vandaag of eerder.');
    if (!tijd) return setFout('Vul de starttijd in.');
    const d = lokaalNaarUtc(datum, tijd);
    if (!d) return setFout('Controleer datum en tijd.');
    onSubmit(d.toISOString());
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="formSheet">
      <MobielKader soort="formulier">
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          <ModalKop styles={styles} titel="Wanneer is de klus gestart?" onClose={onClose} />
          <ScrollView contentContainerStyle={styles.modalBody}>
            <DateField label="Startdatum" value={datum} onChange={setDatum} maximum={vandaagISO()} />
            <TimeField label="Starttijd" value={tijd || null} onChange={setTijd} />
            {fout ? <Text style={styles.modalError}>{fout}</Text> : null}
            <Button label="Opslaan & verder" onPress={opslaan} />
          </ScrollView>
        </View>
      </MobielKader>
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
      // Op iPad/desktop niet uitrekken: één leeskolom, zoals de rest.
      ...leesbreedte,
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
      // ── Dashboardblokken ────────────────────────────────────────────────
    minTouch: { minHeight: 44, justifyContent: 'center' },
    uit: { opacity: 0.45 },
    kopRij: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    projectPil: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: '#E8FBEF',
      maxWidth: 220,
    },
    projectPilTekst: { fontSize: 12, fontWeight: '700', color: '#0F7A3F' },
    inzagePil: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      minHeight: 32,
      borderRadius: 999,
      backgroundColor: t.bgAlt,
    },
    inzageTekst: { fontSize: 12, fontWeight: '700', color: t.muted },
    bewerkKnop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.bg,
    },
    bewerkTekst: { fontSize: 13.5, fontWeight: '700', color: t.ink2 },
    infoRegel: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    infoRegelTekst: { flex: 1, fontSize: 14, color: t.ink, lineHeight: 20 },
    ploegTekst: { fontSize: 13, color: t.muted, lineHeight: 19 },
    mijnMelding: {
      padding: 12,
      borderRadius: t.rMd,
      backgroundColor: t.green50,
      borderWidth: 1,
      borderColor: t.green100,
    },
    mijnTekst: { fontSize: 13.5, lineHeight: 20, color: t.ink },
    actieRij: { flexDirection: 'row', gap: 10 },
    actieTegel: {
      flex: 1,
      minHeight: 56,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      ...dsShadow,
    },
    actieTegelHoofd: { backgroundColor: ds.green, borderColor: ds.green },
    actieTegelTekst: { fontSize: 12.5, fontWeight: '700', color: ds.green700 },
    melding: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 12,
      borderRadius: t.rMd,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
      borderLeftWidth: 4,
    },
    meldingTitel: { fontSize: 14, fontWeight: '700', color: t.ink },
    meldingTekst: { fontSize: 12.5, lineHeight: 18, color: t.ink2 },
    interneBalk: {
      padding: 10,
      borderRadius: 10,
      backgroundColor: '#FFFBEB',
      borderWidth: 1,
      borderColor: '#FDE68A',
      gap: 4,
    },
    interneLabel: { fontSize: 12, fontWeight: '800', color: '#92400E' },
    dagRij: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line, gap: 2 },
    dagDatum: { fontSize: 14, fontWeight: '700', color: t.ink, fontVariant: ['tabular-nums'] },
    dagWie: { fontSize: 13, color: t.ink2, lineHeight: 18 },
    dagBus: { fontSize: 12.5, color: t.muted },
    balk: { height: 6, borderRadius: 3, backgroundColor: t.bgAlt, overflow: 'hidden' },
    balkVulling: { height: 6, borderRadius: 3, backgroundColor: ds.green },
    fotoLabel: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
    fotoLabelTekst: { fontSize: 12, fontWeight: '800' },
    fotoWeg: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(11,15,18,0.72)',
    },
    fotoToevoegen: {
      width: 96,
      height: 96,
      borderRadius: 10,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: t.line,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      padding: 6,
    },
    fotoToevoegenTekst: { fontSize: 11, fontWeight: '700', color: t.muted, textAlign: 'center' },
    materialKaart: { backgroundColor: t.bg, borderRadius: t.rMd, paddingBottom: 8 },
    materialMeta: { fontSize: 12, color: t.muted, paddingHorizontal: 12, lineHeight: 17 },
    iconKnop: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    tabRij: { flexDirection: 'row', gap: 6, backgroundColor: t.bgAlt, borderRadius: 12, padding: 3 },
    tab: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    tabAan: { backgroundColor: t.card, ...dsShadow },
    tabTekst: { fontSize: 13, fontWeight: '600', color: t.muted },
    tabTekstAan: { color: t.ink, fontWeight: '700' },
    klantInfo: { padding: 10, borderRadius: 10, backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD' },
    klantInfoTekst: { fontSize: 12.5, lineHeight: 18, color: '#075985' },
    linkKnop: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    kopKnop: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 4 },
    waarschuwing: {
      padding: 12,
      borderRadius: 10,
      backgroundColor: '#FFFBEB',
      borderWidth: 1,
      borderColor: '#FDE68A',
      borderLeftWidth: 4,
      borderLeftColor: '#F59E0B',
      gap: 4,
    },
    waarschuwingKop: { fontSize: 11, fontWeight: '800', color: '#92400E', letterSpacing: 0.5 },
    waarschuwingTekst: { fontSize: 13.5, lineHeight: 19, color: '#1f2937' },
    waarschuwingVoet: { fontSize: 12, color: '#92400E', marginTop: 4 },
    eindKnop: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    eindKnopKlaar: { backgroundColor: t.green50, borderWidth: 1, borderColor: t.green100 },
    eindKnopTekst: { fontSize: 14, fontWeight: '700', color: t.green700, textAlign: 'center' },
    veldLabel: { fontSize: 12, fontWeight: '500', color: t.ink2, marginBottom: 6 },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    keuzeChip: {
      minHeight: 44,
      minWidth: 52,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keuzeChipAan: { borderColor: ds.green, backgroundColor: t.green50 },
    keuzeChipTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    tijdRij: { flexDirection: 'row', gap: spacing.md },
  });
