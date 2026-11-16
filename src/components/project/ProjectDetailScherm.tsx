import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Mail, MapPin, Pencil, Phone, Trash2 } from 'lucide-react-native';
import {
  AdresZoeker,
  AppFilterChips,
  AppScreen,
  AppTopBar,
  Button,
  DateField,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  SelectField,
  StatusBadge,
  TimeField,
  type SelectOption,
} from '@/components';
import { FaseBadge } from '@/components/pipeline/FaseBadge';
import { LedenKeuze, type Lid } from '@/components/pipeline/LedenKeuze';
import { VerlorenSheet } from '@/components/pipeline/VerlorenSheet';
import { FotoViewer } from '@/components/FotoViewer';
import { Dialog } from '@/lib/dialog';
import { bereidFotoVoor, FOTO_ALS_BASE64 } from '@/lib/fotoVoorbereiden';
import { toewijzingMeldingen } from '@/lib/collegaMeldingen';
import { pushNotificaties } from '@/services/collegaMeldingService';
import { useAuth, usePermissions, useTheme } from '@/providers';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { formatDateNL, formatEUR, formatEURCent } from '@/lib/format';
import { lokaleDatum, vandaagIso } from '@/lib/nlTijd';
import { getUserId } from '@/lib/sessionContext';
import { alsTekst } from '@/lib/notitieTekst';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { callPhone, openMaps, sendMail } from '@/lib/linking';
import { notAvailableAlert } from '@/lib/notAvailable';
import { leesbreedte } from '@/lib/schermklasseRegels';
import { writeFout } from '@/lib/writeResult';
import {
  faseKeuzes,
  heropenFase,
  isAfgerond,
  verlorenFase,
  behandelaarIds,
  pipelineFaseKleuren,
} from '@/lib/pipelineLogica';
import {
  formatUren,
  isVerlopen,
  planRegels,
  projectCijfers,
  projectStatusLabel,
  urenToon,
  urenBronUitleg,
  waardeBronUitleg,
  wanneerLabel,
  zichtbareProjectTabs,
  type ProjectTab,
} from '@/lib/projectLogica';
import { ActieTegel, Blok, KleineKnop, makeStyles, Rij, Veld } from './bouwstenen';
import { FacturenTab } from './FacturenTab';
import { KostenTab } from './KostenTab';
import { NotitiesTab } from './NotitiesTab';
import { OffertesTab } from './OffertesTab';
import { UrenTab } from './UrenTab';
import { WerkbonnenTab } from './WerkbonnenTab';
import {
  getDeal,
  heropenVerlorenDeal,
  listDealActiviteiten,
  listPipelineStages,
  updateDeal,
  updateDealStage,
  zetDealAfgerond,
  DEAL_PRIORITEITEN,
  type DealActiviteit,
  type DealRow,
  type PipelineStage,
} from '@/services/dealService';
import {
  deleteProject,
  deleteProjectFoto,
  deleteProjectNote,
  getAanvraagBron,
  getProject,
  getProjectByDeal,
  listProjectFacturen,
  listProjectFotos,
  listProjectNotes,
  listProjectOffertes,
  listProjectUren,
  listProjectWerkbonnen,
  updateProject,
  uploadProjectFoto,
  type ProjectFactuur,
  type ProjectFoto,
  type ProjectNote,
  type ProjectOfferte,
  type ProjectRow,
  type ProjectUur,
  type ProjectWerkbon,
  type AanvraagBron,
} from '@/services/projectService';
import { getCustomer, listCustomers, updateCustomer } from '@/services/customerService';
import { listCompanyProfiles } from '@/services/teamService';
import { OFFERTE_STATUS } from '@/services/offerteService';
import { factuurStatusLabel } from '@/services/factuurService';
import { ACTIVITEIT_TYPES, activiteitTypeLabel, createActivity } from '@/services/activityService';
import type { Customer } from '@/types/domain';
import { BestandenBlok } from '@/components/BestandenBlok';
import { MetingenBlok } from './MetingenBlok';
import { BossKnop } from '@/components/boss/BossKnop';
import { bijBossOpgeslagen } from '@/lib/boss/vastleggen';
import { tx, txn } from '@/i18n';
import { toonWaarde } from '@/i18n/databaseWaarden';

/**
 * Het projectdetail — de app-versie van `ProjectDetailDrawer` uit het
 * dashboard. Wordt geopend vanuit Projecten (`/project/<id>`) en vanuit de
 * pipeline (`/deal/<id>`): voor de gebruiker zijn aanvraag en project één ding.
 *
 * Tabs zoals het dashboard (`zichtbareTabs`): Overzicht · Offertes · Facturen ·
 * Uren · Nacalculatie · Werkbonnen · Notities. Overzicht bevat het aanvraagblok
 * (fase, voltooien, verloren, behandelaars), de aanvraag met foto's,
 * projectinformatie, planning, werkbonnen, offertes, facturen, activiteiten en
 * klantgegevens. De tabs staan in eigen bestanden in deze map.
 *
 * Rechten (zoals het dashboard):
 * - aanvraagblok: `verkoop` (deals_update);
 * - project wijzigen, foto's, offerte/factuur/werkbon vanaf het project:
 *   `projecten_bewerken` (via `mag('projecten', …)`);
 * - klantgegevens bewerken: `klanten_bewerken`;
 * - bedragen (projectwaarde, offerte- en factuurbedragen): `projectbedragen`;
 * - tabs: offertes `offertes`, facturen `facturen`, kosten `kosten` + pakket
 *   `kosten_nacalculatie`, werkbonnen pakket `werkbonnen`.
 */

type Tab = ProjectTab;

type Data = {
  project: ProjectRow | null;
  deal: DealRow | null;
  klant: Customer | null;
  stages: PipelineStage[];
  leden: Lid[];
  uren: ProjectUur[];
  facturen: ProjectFactuur[];
  werkbonnen: ProjectWerkbon[];
  offertes: ProjectOfferte[];
  notities: ProjectNote[];
  fotos: ProjectFoto[];
  activiteiten: DealActiviteit[];
  bron: AanvraagBron | null;
};

const LEEG: Data = {
  project: null,
  deal: null,
  klant: null,
  stages: [],
  leden: [],
  uren: [],
  facturen: [],
  werkbonnen: [],
  offertes: [],
  notities: [],
  fotos: [],
  activiteiten: [],
  bron: null,
};

type Bewerk =
  | { soort: 'naam'; naam: string }
  | { soort: 'aanvraag'; tekst: string }
  | { soort: 'info'; start: string; eind: string; uren: string; waarde: string }
  | { soort: 'klant'; klantId: string | null }
  | {
      soort: 'klantgegevens';
      naam: string;
      contactpersoon: string;
      telefoon: string;
      email: string;
      adres: string;
      postcode: string;
      plaats: string;
    }
  | { soort: 'deal'; titel: string; waarde: string; tekst: string }
  | { soort: 'activiteit'; titel: string; type: string; datum: string; tijd: string };

export function ProjectDetailScherm({ projectId, dealId }: { projectId?: string; dealId?: string }) {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, can, mag, hasFeature } = usePermissions();
  const { role } = useAuth();
  const projectTabs = useMemo(() => zichtbareProjectTabs(can, hasFeature), [can, hasFeature]);

  const [data, setData] = useState<Data>(LEEG);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overzicht');
  const [bewerk, setBewerk] = useState<Bewerk | null>(null);
  const [klantOpties, setKlantOpties] = useState<SelectOption[]>([]);
  const [verlorenOpen, setVerlorenOpen] = useState(false);
  const [toewijzen, setToewijzen] = useState(false);
  const [fotoIndex, setFotoIndex] = useState<number | null>(null);
  const [fotoBezig, setFotoBezig] = useState(false);
  const fotoSlot = useRef(false);

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveDeal } = useSave<DealRow>();

  const magBedragen = can('projectbedragen');
  const magOffertes = can('offertes');
  const magVerkoop = mag('pipeline', 'wijzigen');
  const magProject = mag('projecten', 'wijzigen');
  const magProjectWeg = mag('projecten', 'verwijderen');
  const magActiviteit = mag('activiteiten', 'maken');
  const magKlantBewerken = mag('klanten', 'wijzigen');
  const metWerkbonnen = hasFeature('werkbonnen');
  const magFacturen = can('facturen');

  const load = useCallback(async () => {
    setError(null);
    let project: ProjectRow | null = null;
    let deal: DealRow | null = null;

    if (dealId) {
      const [d, p] = await Promise.all([getDeal(dealId), getProjectByDeal(dealId)]);
      if (d.error) {
        setError(d.error);
        return;
      }
      deal = d.data;
      project = p.data;
      if (!deal && !project) {
        setError(tx('Deze aanvraag bestaat niet (meer) of je mag hem niet zien.'));
        return;
      }
    } else if (projectId) {
      const p = await getProject(projectId);
      if (p.error || !p.data) {
        setError(p.error ?? tx('Dit project bestaat niet (meer) of je mag het niet zien.'));
        return;
      }
      project = p.data;
      // Zonder verkooprecht komt de deal niet terug (RLS); dan valt het
      // aanvraagblok weg, net als in het dashboard.
      if (project.deal_id) deal = (await getDeal(project.deal_id)).data;
    }

    const pid = project?.id ?? null;
    const klantId = project?.customer_id ?? deal?.customer_id ?? null;
    const leeg = <T,>(v: T) => Promise.resolve(v);

    const [stages, leden, klant, uren, facturen, werkbonnen, offertes, notities, fotos, acts, bron] =
      await Promise.all([
        deal ? listPipelineStages().then((r) => r.data) : leeg<PipelineStage[]>([]),
        listCompanyProfiles().then((r) =>
          r.data.filter((l) => l.actief).map((l) => ({ id: l.id, full_name: l.full_name })),
        ),
        klantId ? getCustomer(klantId).then((r) => r.data) : leeg<Customer | null>(null),
        pid ? listProjectUren(pid) : leeg<ProjectUur[]>([]),
        pid && (magBedragen || magFacturen) ? listProjectFacturen(pid) : leeg<ProjectFactuur[]>([]),
        pid && metWerkbonnen ? listProjectWerkbonnen(pid) : leeg<ProjectWerkbon[]>([]),
        magOffertes && (project?.deal_id || deal?.id || project?.offerte_id)
          ? listProjectOffertes(project?.deal_id ?? deal?.id ?? null, project?.offerte_id ?? null)
          : leeg<ProjectOfferte[]>([]),
        pid ? listProjectNotes(pid).then((r) => r.data) : leeg<ProjectNote[]>([]),
        pid ? listProjectFotos(pid) : leeg<ProjectFoto[]>([]),
        deal ? listDealActiviteiten(deal.id, deal.customer_id).then((r) => r.data) : leeg<DealActiviteit[]>([]),
        deal ? getAanvraagBron(deal.id) : leeg(null),
      ]);

    setData({
      project,
      deal,
      klant,
      stages,
      leden,
      uren,
      facturen,
      werkbonnen,
      offertes,
      notities,
      fotos,
      activiteiten: acts,
      bron,
    });
  }, [dealId, projectId, magBedragen, magFacturen, magOffertes, metWerkbonnen]);

  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });

  const { project, deal, klant, stages } = data;

  // Boss legde een notitie vast voor dit project (chat): lijst verversen.
  const projectIdNu = project?.id ?? null;
  useEffect(
    () =>
      bijBossOpgeslagen((d) => {
        if (projectIdNu && d.project_id === projectIdNu)
          void listProjectNotes(projectIdNu).then((r) => setData((x) => ({ ...x, notities: r.data })));
      }),
    [projectIdNu],
  );

  const vandaag = vandaagIso();
  const naamVan = useCallback(
    (id: string) => data.leden.find((l) => l.id === id)?.full_name ?? null,
    [data.leden],
  );
  const regels = useMemo(() => planRegels(data.werkbonnen, naamVan), [data.werkbonnen, naamVan]);
  const cijfers = useMemo(
    () =>
      projectCijfers(
        { project_value: project?.project_value ?? 0, quoted_hours: project?.quoted_hours ?? 0 },
        data.uren.reduce((s, u) => s + u.uren, 0),
        data.facturen,
      ),
    [project, data.uren, data.facturen],
  );

  const terug = () => terugOfNaar(router, dealId ? '/pipeline' : '/projects');

  // Verdwijnt de open tab (recht ingetrokken, pakket omlaag), val dan terug op
  // het overzicht. Anders staar je naar een leeg paneel.
  const tabZichtbaar = !!project && projectTabs.some((x) => x.id === tab);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab !== 'overzicht' && !tabZichtbaar) setTab('overzicht');
  }, [tab, tabZichtbaar]);

  if (loading || !rechtenGeladen) return <LoadingScreen label={tx('Project laden…')} />;

  if (error || (!project && !deal)) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen scroll={false} header={<AppTopBar variant="detail" title={tx('Project')} onBack={terug} />}>
          <ErrorState title={tx('Niet geladen')} message={error ?? tx('Project niet gevonden.')} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  // ── Deal-acties ──────────────────────────────────────────────────────────
  const zetDeal = (bij: DealRow) => setData((d) => ({ ...d, deal: bij }));
  const dealAfgerond = isAfgerond(deal);
  const dealVerloren = deal?.status === 'lost';
  const huidigeFase = stages.find((s) => s.id === deal?.stage_id) ?? null;

  const wijzigFase = (id: string | null) => {
    if (!deal || !id || id === deal.stage_id) return;
    const verloren = verlorenFase(stages);
    if (verloren && id === verloren.id) {
      setVerlorenOpen(true);
      return;
    }
    saveDeal(() => updateDealStage(deal.id, id), { onSuccess: zetDeal });
  };
  const zetAfgerond = (aan: boolean) => {
    if (!deal) return;
    saveDeal(() => zetDealAfgerond(deal.id, aan), {
      onSuccess: zetDeal,
      succesMelding: aan ? tx('Project voltooid') : tx('Project heropend'),
    });
  };
  const heropenVerloren = () => {
    const eerste = heropenFase(stages);
    if (!deal || !eerste) return;
    saveDeal(() => heropenVerlorenDeal(deal.id, eerste.id), {
      onSuccess: zetDeal,
      succesMelding: tx('Aanvraag heropend'),
    });
  };
  const wijzigBehandelaars = (ids: string[]) => {
    if (!deal) return;
    const vorige = behandelaarIds(deal);
    zetDeal({ ...deal, assigned_to_ids: ids, assigned_to: ids[0] ?? null });
    saveDeal(() => updateDeal(deal.id, { assigned_to_ids: ids }), {
      onSuccess: (bij) => {
        zetDeal(bij);
        // Wie erbij komt, hoort dat (notifyNewAssignees, met mail) — net als
        // bij activiteiten en werkbonnen.
        void pushNotificaties(
          toewijzingMeldingen({
            userIds: ids,
            vorigeIds: vorige,
            maker: getUserId(),
            type: 'toewijzing_project',
            titel: `Je behandelt nu ${project?.name || deal.title || 'een project'}`,
            link: project ? 'projecten' : `deal/${deal.id}`,
            relatedType: project ? 'project' : null,
            relatedId: project?.id ?? null,
          }),
        );
      },
    });
  };
  const wijzigPrio = (p: string) => {
    if (!deal) return;
    saveDeal(() => updateDeal(deal.id, { priority: p }), { onSuccess: zetDeal });
  };

  // ── Opslaan van de bewerkvellen ──────────────────────────────────────────
  const getal = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : 0);
  const opslaan = () => {
    if (!bewerk) return;
    const naHerladen = { onSuccess: async () => { setBewerk(null); await herlaad(); } };
    if (bewerk.soort === 'activiteit') {
      save(
        () =>
          createActivity({
            title: bewerk.titel,
            type: bewerk.type,
            date: bewerk.datum || null,
            time: bewerk.tijd || null,
            deal_id: deal?.id ?? null,
            customer_id: deal?.customer_id ?? project?.customer_id ?? null,
          }),
        { ...naHerladen, succesMelding: tx('Activiteit ingepland') },
      );
      return;
    }
    if (bewerk.soort === 'deal') {
      if (!deal) return;
      save(
        () =>
          updateDeal(deal.id, {
            title: bewerk.titel,
            expected_revenue: getal(bewerk.waarde),
            description: bewerk.tekst,
          }),
        naHerladen,
      );
      return;
    }
    if (!project) return;
    if (bewerk.soort === 'naam') {
      save(
        () =>
          bewerk.naam.trim()
            ? updateProject(project.id, { name: bewerk.naam })
            : Promise.resolve(writeFout('validatie', tx('Een project moet een naam houden'))),
        naHerladen,
      );
    } else if (bewerk.soort === 'aanvraag') {
      save(() => updateProject(project.id, { description: bewerk.tekst }), {
        ...naHerladen,
        succesMelding: tx('Aanvraag bijgewerkt'),
      });
    } else if (bewerk.soort === 'info') {
      const waardeGewijzigd =
        magBedragen && getal(bewerk.waarde) !== Number(project.project_value ?? 0);
      // Begrote uren alleen meesturen als ze echt anders zijn: een andere
      // waarde maakt ze 'handmatig' (trigger bb_project_uren_handmatig), dan
      // komen ze niet meer uit de offertes.
      const urenGewijzigd = getal(bewerk.uren) !== Number(project.quoted_hours ?? 0);
      save(
        () =>
          updateProject(project.id, {
            start_date: bewerk.start || null,
            deadline: bewerk.eind || null,
            ...(urenGewijzigd ? { quoted_hours: getal(bewerk.uren) } : {}),
            // Een zelf getypte waarde blijft staan (waarde_bron 'handmatig').
            ...(waardeGewijzigd ? { project_value: getal(bewerk.waarde), waarde_bron: 'handmatig' as const } : {}),
          }),
        { ...naHerladen, succesMelding: tx('Project bijgewerkt') },
      );
    } else if (bewerk.soort === 'klantgegevens') {
      if (!klant) return;
      save(
        () =>
          updateCustomer(klant.id, {
            name: bewerk.naam,
            contactpersoon: bewerk.contactpersoon,
            phone: bewerk.telefoon,
            email: bewerk.email,
            address: bewerk.adres,
            postcode: bewerk.postcode,
            city: bewerk.plaats,
          }),
        { ...naHerladen, succesMelding: tx('Klantgegevens bijgewerkt') },
      );
    } else if (bewerk.soort === 'klant') {
      save(() => updateProject(project.id, { customer_id: bewerk.klantId }), {
        ...naHerladen,
        succesMelding: tx('Klant gewijzigd'),
      });
    }
  };

  // Begrote uren weer uit de geaccepteerde offertes: de database rekent ze
  // opnieuw uit (bb_begrote_uren_bijwerken).
  const urenUitOffertes = () => {
    if (!project) return;
    save(() => updateProject(project.id, { uren_bron: 'offertes' }), {
      onSuccess: herlaad,
      succesMelding: tx('Begrote uren komen weer uit de offertes'),
    });
  };

  const waardeAutomatisch = () => {
    if (!project) return;
    save(() => updateProject(project.id, { waarde_bron: 'aanvraag' }), {
      onSuccess: herlaad,
      succesMelding: tx('Projectwaarde wordt weer automatisch berekend'),
    });
  };

  const openKlantKiezen = async () => {
    setSaveError(null);
    setBewerk({ soort: 'klant', klantId: project?.customer_id ?? null });
    if (klantOpties.length === 0) {
      const r = await listCustomers();
      setKlantOpties(r.data.map((k) => ({ id: k.id, label: k.name ?? tx('Klant'), sub: k.city ?? undefined })));
    }
  };

  const verwijderProject = () => {
    if (!project) return;
    bevestigVerwijderen(
      tx('Project "{naam}"', { naam: project.name ?? '' }),
      () => {
        save(() => deleteProject(project.id), {
          onSuccess: () => terug(),
          succesMelding: tx('Project verwijderd'),
        });
      },
      tx(
        'Projectnotities, foto’s en projectkosten worden mee verwijderd. Werkbonnen, facturen en losse kostenposten blijven bestaan, maar verliezen hun projectkoppeling.',
      ),
    );
  };

  const notitiesHerladen = async () => {
    if (!project) return;
    const r = await listProjectNotes(project.id);
    setData((d) => ({ ...d, notities: r.data }));
  };

  // ── Foto's bij de aanvraag (uploadProjectFoto / deleteProjectFoto) ────────
  const fotoToevoegen = () => {
    if (!project || fotoSlot.current || fotoBezig) return;
    Dialog.alert(tx('Foto toevoegen'), tx('Waar komt de foto vandaan?'), [
      { text: tx('Camera'), onPress: () => pakEnUpload('camera') },
      { text: tx('Fotobibliotheek'), onPress: () => pakEnUpload('bibliotheek') },
      { text: tx('Annuleren'), style: 'cancel' },
    ]);
  };

  const pakEnUpload = async (bron: 'camera' | 'bibliotheek') => {
    if (!project || fotoSlot.current) return;
    fotoSlot.current = true;
    try {
      // Op web geen toestemming vragen: elke await vóór de kiezer kan in
      // Safari de gebruikersactie laten verlopen.
      if (Platform.OS !== 'web') {
        const vraag =
          bron === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!vraag.granted) {
          Dialog.alert(
            tx('Geen toestemming'),
            bron === 'camera'
              ? tx('Geef BossBase toegang tot de camera om een foto te maken.')
              : tx("Geef BossBase toegang tot je foto's om er een te kiezen."),
          );
          return;
        }
      }
      const opties: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.7,
        base64: FOTO_ALS_BASE64,
        // Meerdere tegelijk uit de bibliotheek, zoals het dashboard (`multiple`).
        allowsMultipleSelection: bron === 'bibliotheek',
      };
      const res =
        bron === 'camera' ? await ImagePicker.launchCameraAsync(opties) : await ImagePicker.launchImageLibraryAsync(opties);
      if (res.canceled || !res.assets?.length) return;
      setFotoBezig(true);
      for (const asset of res.assets) {
        const foto = await bereidFotoVoor(asset);
        if (!foto.ok) {
          Dialog.alert(foto.titel, foto.tekst);
          continue;
        }
        const up = await uploadProjectFoto({
          projectId: project.id,
          bytes: foto.bytes,
          contentType: foto.contentType,
          extensie: foto.extensie,
        });
        if (!up.ok) {
          Dialog.alert(tx('Foto niet opgeslagen'), up.melding);
          break;
        }
        setData((d) => ({ ...d, fotos: [...d.fotos, up.data] }));
      }
    } finally {
      setFotoBezig(false);
      fotoSlot.current = false;
    }
  };

  const fotoWeg = (foto: ProjectFoto) => {
    bevestigVerwijderen(tx('Deze foto'), () => {
      save(() => deleteProjectFoto(foto), {
        onSuccess: () => setData((d) => ({ ...d, fotos: d.fotos.filter((x) => x.id !== foto.id) })),
      });
    });
  };

  const koppelOfferte = async (offerteId: string) => {
    if (!project) return writeFout('onbekend', tx('Geen project.'));
    const res = await updateProject(project.id, { offerte_id: offerteId });
    if (res.ok) await herlaad();
    return res;
  };
  const notitieWeg = (n: ProjectNote) => {
    bevestigVerwijderen(tx('Notitie'), () => {
      save(() => deleteProjectNote(n.id), {
        onSuccess: () => setData((d) => ({ ...d, notities: d.notities.filter((x) => x.id !== n.id) })),
      });
    });
  };

  // ── Weergave-hulpjes ─────────────────────────────────────────────────────
  const titel = project?.name || deal?.title || tx('Project');
  const verlopen = isVerlopen(project?.deadline, project?.status, vandaag);
  const komend = regels.filter((r) => r.datum >= vandaag);
  const aanvraagTekst = alsTekst(project?.description || deal?.description || '');
  const behandelaars = deal ? behandelaarIds(deal).map((id) => naamVan(id)).filter(Boolean) : [];
  const urenKleur = { rood: t.statusRejectFg, oranje: t.statusWarnFg, normaal: t.muted }[
    urenToon(cijfers.hoursPercentage)
  ];

  const bronLabel = !deal
    ? null
    : data.bron?.bron === 'bossbase_website'
      ? tx('Via het websiteformulier')
      : data.bron?.bron === 'website'
        ? tx('Via de website')
        : data.bron?.bron
          ? tx('Via {bron}', { bron: data.bron.bron })
          : magVerkoop
            ? tx('Handmatig aangemaakt')
            : null;
  const binnenOp = deal ? data.bron?.binnenOp || deal.created_at : null;
  // De omschrijving staat al bovenaan; alleen een aangepaste tekst laat het origineel zien.
  const websiteVelden = (data.bron?.velden ?? []).filter(
    (v) => v.key !== 'omschrijving' || v.waarde.trim() !== aanvraagTekst.trim(),
  );
  const klantAdres = [klant?.address, [klant?.postcode, klant?.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const aanvraagBewerken =
    project && magProject
      ? () => {
          setSaveError(null);
          setBewerk({ soort: 'aanvraag', tekst: aanvraagTekst });
        }
      : !project && deal && magVerkoop
        ? () => {
            setSaveError(null);
            setBewerk({
              soort: 'deal',
              titel: deal.title ?? '',
              waarde: deal.expected_revenue != null ? String(deal.expected_revenue) : '',
              tekst: alsTekst(deal.description),
            });
          }
        : null;

  // ── Overzicht ────────────────────────────────────────────────────────────
  const overzicht = (
    <>
      {/* ── Status: compact, zoals de statusstrook van het dashboard ─────── */}
      {deal ? (
        <View style={styles.blok}>
          <View style={styles.blokKop}>
            <Text style={styles.blokTitel}>{tx('Status')}</Text>
            {magVerkoop && !dealVerloren && !dealAfgerond ? (
              <Pressable
                onPress={() => setVerlorenOpen(true)}
                accessibilityRole="button"
                hitSlop={10}
                style={({ pressed }) => [styles.stilLink, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.stilLinkTekst}>{tx('Verloren')}</Text>
              </Pressable>
            ) : null}
          </View>

          {dealVerloren ? (
            <View style={styles.rijMidden}>
              <StatusBadge status={tx('Verloren')} />
              {deal.lost_reason ? <Text style={styles.klein}>{toonWaarde(deal.lost_reason)}</Text> : null}
            </View>
          ) : dealAfgerond ? (
            <StatusBadge status={tx('Project voltooid')} />
          ) : magVerkoop && stages.length ? (
            <SelectField
              label={tx('Fase')}
              value={deal.stage_id}
              options={faseKeuzes(stages, deal.stage_id).map((s) => ({ id: s.id, label: s.name ?? tx('Fase') }))}
              onChange={wijzigFase}
              placeholder={tx('Kies een fase')}
            />
          ) : huidigeFase ? (
            <FaseBadge
              label={huidigeFase.name ?? tx('Fase')}
              colorClass={pipelineFaseKleuren(stages)[huidigeFase.id] ?? huidigeFase.color_class}
              positie={huidigeFase.position}
              groot
            />
          ) : (
            <Text style={styles.waarde}>{tx('Loopt')}</Text>
          )}

          {magVerkoop ? (
            toewijzen && !dealAfgerond ? (
              <View style={styles.veldKolom}>
                <Text style={styles.veldLabel}>{tx('Behandeld door')}</Text>
                <LedenKeuze label="" leden={data.leden} waarde={behandelaarIds(deal)} onChange={wijzigBehandelaars} />
              </View>
            ) : (
              <View style={styles.statusRij}>
                <Pressable
                  onPress={() => setToewijzen(true)}
                  disabled={dealAfgerond}
                  accessibilityRole="button"
                  accessibilityLabel={tx('Behandeld door: {namen}', {
                    namen: behandelaars.length ? behandelaars.join(', ') : tx('niemand'),
                  })}
                  style={({ pressed }) => [styles.behandelaarKnop, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.veldLabel}>{tx('Behandeld door')}</Text>
                  <View style={styles.rijMidden}>
                    <Text style={[styles.waarde, { flexShrink: 1 }]} numberOfLines={1}>
                      {behandelaars.length ? behandelaars.join(', ') : tx('Niemand toegewezen')}
                    </Text>
                    {!dealAfgerond ? <Pencil size={13} color={t.muted} /> : null}
                  </View>
                </Pressable>
                {dealVerloren ? (
                  <Button label={tx('Heropenen')} variant="secondary" onPress={heropenVerloren} />
                ) : (
                  <Button
                    label={dealAfgerond ? tx('Heropenen') : tx('Voltooien')}
                    variant={dealAfgerond ? 'secondary' : 'primary'}
                    onPress={() => zetAfgerond(!dealAfgerond)}
                  />
                )}
              </View>
            )
          ) : null}

          {magVerkoop && !dealVerloren && !dealAfgerond ? (
            <View style={styles.prioRij}>
              <Text style={styles.veldLabel}>{tx('Prioriteit')}</Text>
              <View style={styles.prioChips}>
                {DEAL_PRIORITEITEN.map((p) => {
                  const aan = (deal.priority || 'med') === p.id;
                  return (
                    <Pressable
                      key={String(p.id)}
                      onPress={() => wijzigPrio(String(p.id))}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: aan }}
                      aria-checked={aan}
                      hitSlop={6}
                      style={[styles.prioChip, aan && styles.chipAan]}
                    >
                      <Text style={[styles.prioChipTekst, aan && styles.chipTekstAan]}>{tx(p.label)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {!project && magVerkoop ? (
            <Text style={styles.klein}>{tx('Bij deze aanvraag hoort nog geen project.')}</Text>
          ) : null}
        </View>
      ) : project ? (
        <Blok titel={tx('Status')}>
          <StatusBadge status={project.status ?? 'gepland'} />
          <Text style={styles.klein}>
            {tx('De status volgt de werkbonnen: {status}.', {
              status: projectStatusLabel(project.status).toLocaleLowerCase(),
            })}
          </Text>
        </Blok>
      ) : null}

      {/* ── De aanvraag: het belangrijkste blok, en zo ziet het er ook uit ── */}
      <View style={[styles.blok, styles.aanvraagBlok]}>
        <View style={styles.blokKop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.aanvraagEyebrow}>{tx('De aanvraag')}</Text>
            <Text style={styles.klein} numberOfLines={2}>
              {[bronLabel, binnenOp ? tx('binnen op {datum}', { datum: formatDateNL(lokaleDatum(binnenOp)) }) : null].filter(Boolean).join(' · ') || ' '}
            </Text>
          </View>
          {aanvraagBewerken ? <KleineKnop label={tx('Bewerken')} onPress={aanvraagBewerken} /> : null}
        </View>

        <View style={styles.aanvraagVak}>
          <Text style={[styles.veldLabel, { color: t.green700 }]}>{tx('Wat de klant vraagt')}</Text>
          <Text style={[styles.aanvraagTekst, !aanvraagTekst && { color: t.muted, fontWeight: '400', fontSize: 15 }]}>
            {aanvraagTekst || tx('Nog niets opgeschreven over deze aanvraag.')}
          </Text>
        </View>

        {websiteVelden.length || data.bron?.fotos ? (
          <View style={styles.websiteVak}>
            <Text style={styles.veldLabel}>
              {data.bron?.isTest ? tx('Ingevuld op de website (testaanvraag)') : tx('Ingevuld op de website')}
            </Text>
            {websiteVelden.map((v) => (
              <View key={v.key} style={styles.websiteRij}>
                <Text style={styles.websiteLabel}>{v.label}</Text>
                <Text
                  style={[styles.websiteWaarde, (v.key === 'email' || v.key === 'telefoon') && styles.websiteLink]}
                  onPress={
                    v.key === 'email'
                      ? () => sendMail(v.waarde)
                      : v.key === 'telefoon'
                        ? () => callPhone(v.waarde)
                        : undefined
                  }
                >
                  {(v.key === 'gewensteDatum' || v.eigen) && /^\d{4}-\d{2}-\d{2}$/.test(v.waarde)
                    ? formatDateNL(v.waarde)
                    : v.waarde}
                </Text>
              </View>
            ))}
            {data.bron?.fotos ? (
              <View style={styles.websiteRij}>
                <Text style={styles.websiteLabel}>{tx("Foto's")}</Text>
                <Text style={styles.websiteWaarde}>
                  {txn('{n} foto, hieronder', "{n} foto's, hieronder", data.bron.fotos)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.raster}>
          <View style={styles.rasterVeld}>
            <Text style={styles.veldLabel}>{tx('Waar')}</Text>
            <Text style={styles.waarde}>{klant?.address || '—'}</Text>
            {klant?.postcode || klant?.city ? (
              <Text style={styles.klein}>{[klant?.postcode, klant?.city].filter(Boolean).join(' ')}</Text>
            ) : null}
          </View>
          <View style={styles.rasterVeld}>
            <Text style={styles.veldLabel}>{tx('Wanneer')}</Text>
            <Text style={styles.waarde}>{wanneerLabel(regels, project?.start_date ?? null, vandaag)}</Text>
            {project?.deadline ? <Text style={styles.klein}>{tx('deadline {datum}', { datum: formatDateNL(project.deadline) })}</Text> : null}
          </View>
          <View style={styles.rasterVeld}>
            <Text style={styles.veldLabel}>{tx('Contact')}</Text>
            <Text style={styles.waarde} numberOfLines={1}>{klant?.phone || klant?.email || '—'}</Text>
          </View>
          {!project && deal ? (
            <View style={styles.rasterVeld}>
              <Text style={styles.veldLabel}>{tx('Verwachte omzet')}</Text>
              <Text style={styles.waarde}>{formatEUR(Number(deal.expected_revenue ?? 0))}</Text>
            </View>
          ) : null}
        </View>

        {/* Bel, mail en route: dezelfde tegels als op de werkbon. */}
        <View style={styles.actieRij}>
          <ActieTegel
            icon={<Phone size={18} color={t.green700} />}
            label={tx('Bel')}
            uit={!klant?.phone}
            onPress={() => callPhone(klant?.phone) || notAvailableAlert(tx('Bellen'), tx('Geen telefoonnummer bekend.'))}
          />
          <ActieTegel
            icon={<Mail size={18} color={t.green700} />}
            label={tx('Mail')}
            uit={!klant?.email}
            onPress={() => sendMail(klant?.email) || notAvailableAlert(tx('Mailen'), tx('Geen e-mailadres bekend.'))}
          />
          <ActieTegel
            icon={<MapPin size={18} color={t.green700} />}
            label={tx('Route')}
            uit={!klantAdres}
            onPress={() => openMaps(klantAdres) || notAvailableAlert(tx('Navigeren'), tx('Geen adres bekend.'))}
          />
        </View>

        {/* Foto's: zelfde opzet als de werkbonfoto's (privébucket, verkleind
            bij het kiezen). Toevoegen en verwijderen met projecten_bewerken. */}
        {project && (data.fotos.length || magProject) ? (
          <View style={styles.veldKolom}>
            <Text style={styles.veldLabel}>{tx("Foto's")}</Text>
            <View style={styles.fotos}>
              {data.fotos.map((f, i) => (
                <View key={f.id} style={styles.fotoVak}>
                  <Pressable
                    onPress={() => setFotoIndex(i)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={tx('Foto {nr} van {totaal} bekijken', { nr: i + 1, totaal: data.fotos.length })}
                  >
                    <Image source={{ uri: f.url }} style={styles.foto} />
                  </Pressable>
                  {magProject ? (
                    <Pressable
                      onPress={() => fotoWeg(f)}
                      accessibilityRole="button"
                      accessibilityLabel={tx('Foto verwijderen')}
                      hitSlop={6}
                      style={styles.fotoWeg}
                    >
                      <Trash2 size={14} color={t.statusRejectFg} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {magProject ? (
                <Pressable
                  onPress={fotoToevoegen}
                  disabled={fotoBezig}
                  accessibilityRole="button"
                  accessibilityLabel={tx('Foto toevoegen')}
                  accessibilityState={{ disabled: fotoBezig, busy: fotoBezig }}
                  style={({ pressed }) => [styles.fotoToevoegen, pressed && { opacity: 0.7 }]}
                >
                  {fotoBezig ? <ActivityIndicator size="small" color={t.green700} /> : <Camera size={18} color={t.ink2} />}
                  <Text style={styles.kleineKnopTekst}>{fotoBezig ? tx('Bezig…') : tx('Foto')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {/* Metingen: de maten van de opname, zelf invullen of aan Boss vertellen
          (inspreken). Wie mag wijzigen bepaalt de database
          (bb_mag_metingen_beheren), net als in het dashboard. */}
      {project ? <MetingenBlok projectId={project.id} /> : null}

      {/* Alles wat bij deze klus bewaard is, plus eigen uploads (tekeningen,
          certificaten). Wie wat ziet, bepaalt de database per bron. */}
      {project ? <BestandenBlok projectId={project.id} /> : null}

      {project ? (
        <Blok
          titel={tx('Projectinformatie')}
          actie={
            magProject ? (
              <KleineKnop
                label={tx('Bewerken')}
                onPress={() => {
                  setSaveError(null);
                  setBewerk({
                    soort: 'info',
                    start: project.start_date ?? '',
                    eind: project.deadline ?? '',
                    uren: project.quoted_hours ? String(project.quoted_hours) : '',
                    waarde: project.project_value != null ? String(project.project_value) : '',
                  });
                }}
              />
            ) : undefined
          }
        >
          <View style={styles.raster}>
            <Veld label={tx('Startdatum')}>
              <Text style={[styles.waarde, !project.start_date && { color: t.muted }]}>
                {project.start_date ? formatDateNL(project.start_date) : tx('Niet ingevuld')}
              </Text>
            </Veld>
            <Veld label={tx('Einddatum')}>
              <Text
                style={[
                  styles.waarde,
                  !project.deadline && { color: t.muted },
                  verlopen && { color: t.statusRejectFg },
                ]}
              >
                {project.deadline ? formatDateNL(project.deadline) : tx('Niet ingevuld')}
                {verlopen ? `  ${tx('verlopen')}` : ''}
              </Text>
            </Veld>
            <Veld label={tx('Begrote uren')}>
              <Text style={styles.waarde}>{formatUren(project.quoted_hours)}</Text>
              {/* Waar de begrote uren vandaan komen: de urenregels en de
                  calculatie van de geaccepteerde offertes, of met de hand.
                  Zonder kolom (migratie nog niet gedraaid) niets. */}
              {project.uren_bron ? (
                <Text style={styles.klein}>{urenBronUitleg(project.uren_bron, project.quoted_hours)}</Text>
              ) : null}
              {project.uren_bron === 'handmatig' && magProject ? (
                <Pressable onPress={urenUitOffertes} accessibilityRole="link" hitSlop={8}>
                  <Text style={styles.link}>{tx('uit de offertes halen')}</Text>
                </Pressable>
              ) : null}
            </Veld>
            <Veld label={tx('Gewerkte uren')}>
              <Text style={styles.waarde}>
                {formatUren(cijfers.usedHours)}
                {Number(project.quoted_hours) > 0 ? (
                  <Text style={{ color: urenKleur, fontSize: 12 }}>
                    {'  '}({Math.round(cijfers.hoursPercentage * 100)}%)
                  </Text>
                ) : null}
              </Text>
            </Veld>
            {magBedragen ? (
              <Veld label={tx('Projectwaarde')}>
                <Text style={styles.waarde}>{formatEUR(Number(project.project_value ?? 0))}</Text>
                <Text style={styles.klein}>{waardeBronUitleg(project.waarde_bron)}</Text>
                {project.waarde_bron === 'handmatig' && magProject ? (
                  <Pressable onPress={waardeAutomatisch} accessibilityRole="link" hitSlop={8}>
                    <Text style={styles.link}>{tx('automatisch berekenen')}</Text>
                  </Pressable>
                ) : null}
              </Veld>
            ) : null}
            {magBedragen ? (
              <Veld label={tx('Gefactureerd')}>
                <Text style={styles.waarde}>{formatEUR(cijfers.omzetExclBtw)}</Text>
                {cijfers.remainingToInvoice > 0 ? (
                  <Text style={[styles.klein, { color: t.statusWarnFg }]}>
                    {tx('nog {bedrag}', { bedrag: formatEUR(cijfers.remainingToInvoice) })}
                  </Text>
                ) : null}
              </Veld>
            ) : null}
          </View>
        </Blok>
      ) : null}

      {project ? (
        <Blok titel={tx('Planning')}>
          {regels.length === 0 ? (
            <Text style={styles.leeg}>{tx('Nog niets ingepland voor dit project.')}</Text>
          ) : (
            (komend.length ? komend : regels).slice(0, 4).map((r) => (
              <Rij
                key={r.sleutel}
                titel={`${formatDateNL(r.datum)}${r.starttijd ? ` · ${r.starttijd}${r.eindtijd ? `–${r.eindtijd}` : ''}` : ''}`}
                sub={[r.titel, r.wie.join(', ')].filter(Boolean).join(' · ')}
                onPress={() => router.push(`/work-orders/${r.werkbonId}`)}
              />
            ))
          )}
        </Blok>
      ) : null}

      {project && metWerkbonnen ? (
        <Blok titel={tx('Werkbonnen')} onTitel={() => setTab('werkbonnen')}>
          {data.werkbonnen.length === 0 ? (
            <Text style={styles.leeg}>{tx('Geen werkbonnen')}</Text>
          ) : (
            [...data.werkbonnen]
              .sort((a, b) => String(b.gepland_op ?? '').localeCompare(String(a.gepland_op ?? '')))
              .map((w) => (
                <Rij
                  key={w.id}
                  titel={w.titel || tx('Werkbon')}
                  sub={`${w.nummer || tx('geen nummer')}${w.locatie ? ` · ${w.locatie}` : ''}`}
                  rechts={<StatusBadge status={w.status ?? 'gepland'} />}
                  onPress={() => router.push(`/work-orders/${w.id}`)}
                />
              ))
          )}
        </Blok>
      ) : null}

      {magOffertes ? (
        <Blok
          titel={tx('Offertes')}
          onTitel={project ? () => setTab('offertes') : undefined}
          actie={
            magProject && mag('offertes', 'maken') ? (
              <KleineKnop
                label={tx('Nieuwe offerte')}
                icon="plus"
                onPress={() =>
                  router.push(
                    `/offers?nieuw=1${project ? `&project=${encodeURIComponent(project.id)}` : ''}${
                      (project?.deal_id ?? deal?.id) ? `&deal=${encodeURIComponent((project?.deal_id ?? deal?.id) as string)}` : ''
                    }${klant ? `&klant=${encodeURIComponent(klant.id)}` : ''}`,
                  )
                }
              />
            ) : undefined
          }
        >
          {data.offertes.length === 0 ? (
            <Text style={styles.leeg}>{tx('Geen offertes')}</Text>
          ) : (
            data.offertes.map((o) => (
              <Rij
                key={o.id}
                titel={o.omschrijving || o.nummer || tx('Offerte')}
                sub={[o.omschrijving ? o.nummer : null, OFFERTE_STATUS[o.status ?? ''] ?? o.status]
                  .filter(Boolean)
                  .join(' · ')}
                rechts={magBedragen ? <Text style={styles.bedrag}>{formatEURCent(Number(o.totaal_incl ?? 0))}</Text> : undefined}
                onPress={() => router.push(`/offers?id=${encodeURIComponent(o.id)}`)}
              />
            ))
          )}
        </Blok>
      ) : null}

      {project && magBedragen ? (
        <Blok
          titel={tx('Facturen')}
          onTitel={magFacturen ? () => setTab('facturen') : undefined}
          actie={
            magProject && mag('facturen', 'maken') ? (
              <KleineKnop
                label={tx('Nieuwe factuur')}
                icon="plus"
                onPress={() =>
                  router.push(
                    `/invoices?nieuw=1&project=${encodeURIComponent(project.id)}${klant ? `&klant=${encodeURIComponent(klant.id)}` : ''}`,
                  )
                }
              />
            ) : undefined
          }
        >
          {data.facturen.length === 0 ? (
            <Text style={styles.leeg}>{tx('Geen facturen')}</Text>
          ) : (
            data.facturen.map((f) => (
              <Rij
                key={f.id}
                titel={f.nummer || tx('Factuur')}
                sub={[
                  f.factuurdatum ? formatDateNL(f.factuurdatum) : null,
                  f.vervaldatum ? tx('vervalt {datum}', { datum: formatDateNL(f.vervaldatum) }) : null,
                  factuurStatusLabel(f.status),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                rechts={<Text style={styles.bedrag}>{formatEURCent(Number(f.totaal_incl ?? 0))}</Text>}
                onPress={magFacturen ? () => router.push(`/invoices?id=${encodeURIComponent(f.id)}`) : undefined}
              />
            ))
          )}
        </Blok>
      ) : null}

      {deal ? (
        <Blok
          titel={tx('Activiteiten')}
          actie={
            magActiviteit ? (
              <KleineKnop
                label={tx('Inplannen')}
                icon="plus"
                onPress={() => {
                  setSaveError(null);
                  setBewerk({ soort: 'activiteit', titel: '', type: 'follow', datum: vandaag, tijd: '' });
                }}
              />
            ) : undefined
          }
        >
          {data.activiteiten.length === 0 ? (
            <Text style={styles.leeg}>{tx('Geen activiteiten. Plan een vervolgactie in.')}</Text>
          ) : (
            data.activiteiten.slice(0, 8).map((a) => {
              const dag = a.due_at ? lokaleDatum(a.due_at) : null;
              const teLaat = !a.completed && dag != null && dag < vandaag;
              return (
                <Rij
                  key={a.id}
                  titel={a.title || activiteitTypeLabel(a.type)}
                  sub={[
                    activiteitTypeLabel(a.type),
                    dag ? formatDateNL(dag) : tx('Geen datum'),
                    a.completed ? tx('afgerond') : teLaat ? tx('te laat') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={() => router.push('/activities')}
                />
              );
            })
          )}
        </Blok>
      ) : null}

      {klant || (project && magProject) ? (
        <Blok
          titel={tx('Klantgegevens')}
          actie={
            (project && magProject) || (klant && magKlantBewerken) ? (
              <View style={[styles.knoppen, { flexShrink: 1, justifyContent: 'flex-end' }]}>
                {klant && magKlantBewerken ? (
                  <KleineKnop
                    label={tx('Bewerken')}
                    onPress={() => {
                      setSaveError(null);
                      setBewerk({
                        soort: 'klantgegevens',
                        naam: klant.name ?? '',
                        contactpersoon: klant.contactpersoon ?? '',
                        telefoon: klant.phone ?? '',
                        email: klant.email ?? '',
                        adres: klant.address ?? '',
                        postcode: klant.postcode ?? '',
                        plaats: klant.city ?? '',
                      });
                    }}
                  />
                ) : null}
                {project && magProject ? (
                  <KleineKnop label={klant ? tx('Andere klant') : tx('Klant kiezen')} onPress={openKlantKiezen} />
                ) : null}
              </View>
            ) : undefined
          }
        >
          {klant ? (
            <>
              <Rij
                titel={klant.name || tx('Klant')}
                sub={tx('Klantkaart openen')}
                onPress={() => router.push(`/customers/${klant.id}`)}
              />
              <View style={styles.raster}>
                <Veld label={tx('Contactpersoon')}>
                  <Text style={styles.waarde}>{klant.contactpersoon || '—'}</Text>
                </Veld>
                <Veld label={tx('Telefoon')}>
                  <Text style={styles.waarde}>{klant.phone || '—'}</Text>
                </Veld>
                <Veld label={tx('E-mail')}>
                  <Text style={styles.waarde}>{klant.email || '—'}</Text>
                </Veld>
                <Veld label={tx('Adres')}>
                  <Text style={styles.waarde}>
                    {[klant.address, [klant.postcode, klant.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') ||
                      '—'}
                  </Text>
                </Veld>
              </View>
            </>
          ) : (
            <Text style={styles.leeg}>{tx('Geen klant gekoppeld.')}</Text>
          )}
        </Blok>
      ) : null}

      {project && magProjectWeg ? (
        <View style={styles.voet}>
          <Button label={tx('Verwijder project')} variant="ghost" onPress={verwijderProject} />
        </View>
      ) : null}
    </>
  );

  // ── De andere tabs (eigen bestanden in deze map) ──────────────────────────
  const eigenId = getUserId();
  const tabInhoud = (): ReactNode => {
    if (!project || tab === 'overzicht') return overzicht;
    switch (tab) {
      case 'offertes':
        return (
          <OffertesTab
            project={project}
            offertes={data.offertes}
            magBeheren={magProject}
            magOfferteMaken={mag('offertes', 'maken')}
            magFactuurMaken={mag('facturen', 'maken')}
            onKoppel={koppelOfferte}
          />
        );
      case 'facturen':
        return (
          <FacturenTab
            projectId={project.id}
            klantId={klant?.id ?? project.customer_id}
            projectWaarde={Number(project.project_value ?? 0)}
            cijfers={cijfers}
            facturen={data.facturen}
            magBedragen={magBedragen}
            magMaken={mag('facturen', 'maken')}
          />
        );
      case 'uren':
        return (
          <UrenTab
            begroot={project.quoted_hours}
            uren={data.uren}
            onWerkbon={(id) => router.push(`/work-orders/${id}`)}
          />
        );
      case 'kosten':
        return (
          <KostenTab
            projectId={project.id}
            omzetExclBtw={cijfers.omzetExclBtw}
            uren={data.uren}
            magBedragen={magBedragen}
            magInkoop={can('inkoopprijzen')}
            magBewerken={magProject && mag('kosten', 'wijzigen')}
            isAdmin={role === 'admin'}
          />
        );
      case 'werkbonnen':
        return (
          <WerkbonnenTab
            projectId={project.id}
            klantId={klant?.id ?? project.customer_id}
            werkbonnen={data.werkbonnen}
            magMaken={magProject && mag('werkbonnen', 'maken')}
            naamVan={naamVan}
          />
        );
      case 'notities':
        return (
          <NotitiesTab
            projectId={project.id}
            projectNaam={project.name ?? ''}
            notities={data.notities}
            leden={data.leden}
            magMaken={mag('projectNotities', 'maken')}
            // project_notes_delete: de auteur, of bb_is_admin_or_permission('projecten_bewerken').
            magVerwijderen={(n) => n.created_by === eigenId || can('projecten_bewerken')}
            onToegevoegd={notitiesHerladen}
            onVerwijder={notitieWeg}
          />
        );
      default:
        return overzicht;
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = project
    ? projectTabs.map((x) => ({
        ...x,
        label: tx(x.label),
        ...(x.id === 'notities' ? { count: data.notities.length } : {}),
      }))
    : [{ id: 'overzicht', label: tx('Overzicht') }];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title={titel}
            subtitle={klant?.name || project?.customer?.name || deal?.customer?.name || undefined}
            onBack={terug}
            rightAction={
              project ? (
                <BossKnop
                  projectId={project.id}
                  naast={
                    magProject ? (
                      <HeaderIconButton
                        icon={Pencil}
                        label={tx('Projectnaam wijzigen')}
                        onPress={() => {
                          setSaveError(null);
                          setBewerk({ soort: 'naam', naam: project.name ?? '' });
                        }}
                      />
                    ) : undefined
                  }
                />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        <View style={[leesbreedte, styles.inhoud]}>
          {tabs.length > 1 ? (
            <View style={{ marginHorizontal: -16 }}>
              <AppFilterChips chips={tabs} active={tab} onChange={setTab} />
            </View>
          ) : null}
          {tabInhoud()}
        </View>
      </AppScreen>

      <FotoViewer
        fotos={data.fotos}
        index={fotoIndex}
        titel={tx("Foto's bij de aanvraag")}
        onSluit={() => setFotoIndex(null)}
        onVerwijder={
          magProject
            ? (v) => {
                const foto = data.fotos.find((x) => x.id === v.id);
                if (foto) fotoWeg(foto);
              }
            : undefined
        }
      />

      <VerlorenSheet
        deal={verlorenOpen && deal ? deal : null}
        verlorenFaseId={verlorenFase(stages)?.id ?? null}
        onClose={() => setVerlorenOpen(false)}
        onSaved={zetDeal}
      />

      <FormSheet
        visible={bewerk !== null}
        title={
          bewerk?.soort === 'naam'
            ? tx('Projectnaam')
            : bewerk?.soort === 'aanvraag'
              ? tx('De aanvraag')
              : bewerk?.soort === 'info'
                ? tx('Projectinformatie')
                : bewerk?.soort === 'klant'
                  ? tx('Klant kiezen')
                  : bewerk?.soort === 'klantgegevens'
                    ? tx('Klantgegevens')
                  : bewerk?.soort === 'activiteit'
                    ? tx('Activiteit inplannen')
                    : tx('Aanvraag bewerken')

        }
        subtitle={titel}
        error={saveError}
        saving={saving}
        submitDisabled={
          (bewerk?.soort === 'naam' && !bewerk.naam.trim()) ||
          (bewerk?.soort === 'activiteit' && !bewerk.titel.trim()) ||
          (bewerk?.soort === 'deal' && !bewerk.titel.trim()) ||
          (bewerk?.soort === 'klantgegevens' && !bewerk.naam.trim())
        }
        onSubmit={opslaan}
        onClose={() => setBewerk(null)}
      >
        {bewerk?.soort === 'naam' ? (
          <FormField
            label={tx('Projectnaam')}
            value={bewerk.naam}
            onChangeText={(v) => setBewerk({ ...bewerk, naam: v })}
            autoFocus
          />
        ) : null}
        {bewerk?.soort === 'aanvraag' ? (
          <FormField
            label={tx('Omschrijving')}
            value={bewerk.tekst}
            onChangeText={(v) => setBewerk({ ...bewerk, tekst: v })}
            placeholder={tx('Wat wil de klant? Wat moet er gebeuren, waar moet op gelet worden?')}
            multiline
            autoFocus
          />
        ) : null}
        {bewerk?.soort === 'info' ? (
          <>
            <View style={styles.formRij}>
              <View style={{ flex: 1 }}>
                <DateField
                  label={tx('Startdatum')}
                  value={bewerk.start || null}
                  onChange={(v) => setBewerk({ ...bewerk, start: v })}
                  maximum={bewerk.eind || null}
                  placeholder={tx('Kies')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <DateField
                  label={tx('Einddatum')}
                  value={bewerk.eind || null}
                  onChange={(v) => setBewerk({ ...bewerk, eind: v })}
                  minimum={bewerk.start || null}
                  placeholder={tx('Kies')}
                />
              </View>
            </View>
            <FormField
              label={tx('Begrote uren')}
              value={bewerk.uren}
              onChangeText={(v) => setBewerk({ ...bewerk, uren: v })}
              keyboardType="decimal-pad"
              placeholder="0"
              hint={tx('Zelf ingevulde uren komen niet meer uit de geaccepteerde offertes.')}
            />
            {magBedragen ? (
              <FormField
                label={tx('Projectwaarde (excl. btw)')}
                value={bewerk.waarde}
                onChangeText={(v) => setBewerk({ ...bewerk, waarde: v })}
                keyboardType="decimal-pad"
                placeholder="0,00"
                hint={tx('Een zelf ingevulde waarde wordt niet meer automatisch berekend.')}
              />
            ) : null}
          </>
        ) : null}
        {bewerk?.soort === 'klant' ? (
          <SelectField
            label={tx('Klant')}
            value={bewerk.klantId}
            options={klantOpties}
            onChange={(id) => setBewerk({ ...bewerk, klantId: id })}
            allowEmpty
            emptyLabel={tx('— Geen klant —')}
            placeholder={tx('Kies een klant')}
            searchable
          />
        ) : null}
        {bewerk?.soort === 'klantgegevens' ? (
          <>
            {/* Dezelfde klant als op de klantkaart, geen kopie: dit schrijft naar customers. */}
            <FormField label={tx('Naam')} value={bewerk.naam} onChangeText={(v) => setBewerk({ ...bewerk, naam: v })} />
            <FormField
              label={tx('Contactpersoon')}
              value={bewerk.contactpersoon}
              onChangeText={(v) => setBewerk({ ...bewerk, contactpersoon: v })}
            />
            <FormField
              label={tx('Telefoon')}
              value={bewerk.telefoon}
              onChangeText={(v) => setBewerk({ ...bewerk, telefoon: v })}
              keyboardType="phone-pad"
            />
            <FormField
              label={tx('E-mail')}
              value={bewerk.email}
              onChangeText={(v) => setBewerk({ ...bewerk, email: v })}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <AdresZoeker
              onSelect={(a) =>
                setBewerk((b) =>
                  b?.soort === 'klantgegevens'
                    ? { ...b, adres: a.address || b.adres, postcode: a.postcode || b.postcode, plaats: a.city || b.plaats }
                    : b,
                )
              }
            />
            <FormField label={tx('Adres')} value={bewerk.adres} onChangeText={(v) => setBewerk({ ...bewerk, adres: v })} />
            <View style={styles.formRij}>
              <View style={{ flex: 1 }}>
                <FormField
                  label={tx('Postcode')}
                  value={bewerk.postcode}
                  onChangeText={(v) => setBewerk({ ...bewerk, postcode: v })}
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormField label={tx('Plaats')} value={bewerk.plaats} onChangeText={(v) => setBewerk({ ...bewerk, plaats: v })} />
              </View>
            </View>
          </>
        ) : null}
        {bewerk?.soort === 'deal' ? (
          <>
            <FormField label={tx('Titel')} value={bewerk.titel} onChangeText={(v) => setBewerk({ ...bewerk, titel: v })} />
            <FormField
              label={tx('Verwachte omzet')}
              value={bewerk.waarde}
              onChangeText={(v) => setBewerk({ ...bewerk, waarde: v })}
              keyboardType="decimal-pad"
              placeholder="0,00"
            />
            <FormField
              label={tx('Omschrijving')}
              value={bewerk.tekst}
              onChangeText={(v) => setBewerk({ ...bewerk, tekst: v })}
              multiline
            />
          </>
        ) : null}
        {bewerk?.soort === 'activiteit' ? (
          <>
            <FormField
              label={tx('Titel')}
              value={bewerk.titel}
              onChangeText={(v) => setBewerk({ ...bewerk, titel: v })}
              placeholder={tx('Bijv. Klant terugbellen')}
              autoFocus
            />
            <View style={styles.chipRij}>
              {ACTIVITEIT_TYPES.map((ty) => {
                const aan = bewerk.type === ty;
                return (
                  <Pressable
                    key={ty}
                    onPress={() => setBewerk({ ...bewerk, type: ty })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: aan }}
                    aria-checked={aan}
                    style={[styles.chip, aan && styles.chipAan]}
                  >
                    <Text style={[styles.chipTekst, aan && styles.chipTekstAan]}>{activiteitTypeLabel(ty)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.formRij}>
              <View style={{ flex: 1 }}>
                <DateField
                  label={tx('Datum')}
                  value={bewerk.datum || null}
                  onChange={(v) => setBewerk({ ...bewerk, datum: v })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField
                  label={tx('Tijd')}
                  value={bewerk.tijd || null}
                  onChange={(v) => setBewerk({ ...bewerk, tijd: v })}
                  placeholder="09:00"
                />
              </View>
            </View>
          </>
        ) : null}
      </FormSheet>
    </View>
  );
}
