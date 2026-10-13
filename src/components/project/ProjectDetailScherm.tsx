import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react-native';
import {
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
import { usePermissions, useTheme } from '@/providers';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { formatDateNL, formatEUR } from '@/lib/format';
import { lokaleDatum, vandaagIso } from '@/lib/nlTijd';
import { getUserId } from '@/lib/sessionContext';
import { alsTekst } from '@/lib/notitieTekst';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { leesbreedte } from '@/lib/schermklasseRegels';
import { writeFout } from '@/lib/writeResult';
import { faseKeuzes, heropenFase, isAfgerond, verlorenFase, behandelaarIds } from '@/lib/pipelineLogica';
import {
  formatUren,
  isVerlopen,
  planRegels,
  projectCijfers,
  projectStatusLabel,
  urenToon,
  waardeBronUitleg,
  wanneerLabel,
} from '@/lib/projectLogica';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
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
  addProjectNote,
  deleteProject,
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
  type ProjectFactuur,
  type ProjectFoto,
  type ProjectNote,
  type ProjectOfferte,
  type ProjectRow,
  type ProjectUur,
  type ProjectWerkbon,
} from '@/services/projectService';
import { getCustomer, listCustomers } from '@/services/customerService';
import { listCompanyProfiles } from '@/services/teamService';
import { OFFERTE_STATUS } from '@/services/offerteService';
import { factuurStatusLabel } from '@/services/factuurService';
import { ACTIVITEIT_TYPES, activiteitTypeLabel, createActivity } from '@/services/activityService';
import type { Customer } from '@/types/domain';

/**
 * Het projectdetail — de app-versie van `ProjectDetailDrawer` uit het
 * dashboard. Wordt geopend vanuit Projecten (`/project/<id>`) en vanuit de
 * pipeline (`/deal/<id>`): voor de gebruiker zijn aanvraag en project één ding.
 *
 * Tabs: Overzicht · Uren · Notities. Overzicht bevat het aanvraagblok (fase,
 * voltooien, verloren, behandelaars), de aanvraag, projectinformatie,
 * planning, werkbonnen, offertes, facturen, activiteiten en klantgegevens.
 *
 * Rechten (zoals het dashboard):
 * - aanvraagblok: `verkoop` (deals_update);
 * - project wijzigen: `projecten_bewerken` (via `mag('projecten', …)`);
 * - bedragen (projectwaarde, offerte- en factuurbedragen): `projectbedragen`;
 * - offertes: `offertes`; werkbonnen: pakket `werkbonnen`.
 */

type Tab = 'overzicht' | 'uren' | 'notities';

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
  bron: { bron: string | null; binnenOp: string | null } | null;
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
  | { soort: 'deal'; titel: string; waarde: string; tekst: string }
  | { soort: 'activiteit'; titel: string; type: string; datum: string; tijd: string };

export function ProjectDetailScherm({ projectId, dealId }: { projectId?: string; dealId?: string }) {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, can, mag, hasFeature } = usePermissions();

  const [data, setData] = useState<Data>(LEEG);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overzicht');
  const [bewerk, setBewerk] = useState<Bewerk | null>(null);
  const [klantOpties, setKlantOpties] = useState<SelectOption[]>([]);
  const [verlorenOpen, setVerlorenOpen] = useState(false);
  const [toewijzen, setToewijzen] = useState(false);
  const [nieuweNotitie, setNieuweNotitie] = useState('');

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveDeal } = useSave<DealRow>();
  const { save: saveNotitie, saving: notitieBezig, error: notitieFout } = useSave<ProjectNote>();

  const magBedragen = can('projectbedragen');
  const magOffertes = can('offertes');
  const magVerkoop = mag('pipeline', 'wijzigen');
  const magProject = mag('projecten', 'wijzigen');
  const magProjectWeg = mag('projecten', 'verwijderen');
  const magActiviteit = mag('activiteiten', 'maken');
  const metWerkbonnen = hasFeature('werkbonnen');

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
        setError('Deze aanvraag bestaat niet (meer) of je mag hem niet zien.');
        return;
      }
    } else if (projectId) {
      const p = await getProject(projectId);
      if (p.error || !p.data) {
        setError(p.error ?? 'Dit project bestaat niet (meer) of je mag het niet zien.');
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
        pid && magBedragen ? listProjectFacturen(pid) : leeg<ProjectFactuur[]>([]),
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
  }, [dealId, projectId, magBedragen, magOffertes, metWerkbonnen]);

  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });

  const { project, deal, klant, stages } = data;
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

  if (loading || !rechtenGeladen) return <LoadingScreen label="Project laden…" />;

  if (error || (!project && !deal)) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen scroll={false} header={<AppTopBar variant="detail" title="Project" onBack={terug} />}>
          <ErrorState title="Niet geladen" message={error ?? 'Project niet gevonden.'} onRetry={opnieuw} />
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
      succesMelding: aan ? 'Project voltooid' : 'Project heropend',
    });
  };
  const heropenVerloren = () => {
    const eerste = heropenFase(stages);
    if (!deal || !eerste) return;
    saveDeal(() => heropenVerlorenDeal(deal.id, eerste.id), {
      onSuccess: zetDeal,
      succesMelding: 'Aanvraag heropend',
    });
  };
  const wijzigBehandelaars = (ids: string[]) => {
    if (!deal) return;
    zetDeal({ ...deal, assigned_to_ids: ids, assigned_to: ids[0] ?? null });
    saveDeal(() => updateDeal(deal.id, { assigned_to_ids: ids }), { onSuccess: zetDeal });
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
        { ...naHerladen, succesMelding: 'Activiteit ingepland' },
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
            : Promise.resolve(writeFout('validatie', 'Een project moet een naam houden')),
        naHerladen,
      );
    } else if (bewerk.soort === 'aanvraag') {
      save(() => updateProject(project.id, { description: bewerk.tekst }), {
        ...naHerladen,
        succesMelding: 'Aanvraag bijgewerkt',
      });
    } else if (bewerk.soort === 'info') {
      const waardeGewijzigd =
        magBedragen && getal(bewerk.waarde) !== Number(project.project_value ?? 0);
      save(
        () =>
          updateProject(project.id, {
            start_date: bewerk.start || null,
            deadline: bewerk.eind || null,
            quoted_hours: getal(bewerk.uren),
            // Een zelf getypte waarde blijft staan (waarde_bron 'handmatig').
            ...(waardeGewijzigd ? { project_value: getal(bewerk.waarde), waarde_bron: 'handmatig' as const } : {}),
          }),
        { ...naHerladen, succesMelding: 'Project bijgewerkt' },
      );
    } else if (bewerk.soort === 'klant') {
      save(() => updateProject(project.id, { customer_id: bewerk.klantId }), {
        ...naHerladen,
        succesMelding: 'Klant gewijzigd',
      });
    }
  };

  const waardeAutomatisch = () => {
    if (!project) return;
    save(() => updateProject(project.id, { waarde_bron: 'aanvraag' }), {
      onSuccess: herlaad,
      succesMelding: 'Projectwaarde wordt weer automatisch berekend',
    });
  };

  const openKlantKiezen = async () => {
    setSaveError(null);
    setBewerk({ soort: 'klant', klantId: project?.customer_id ?? null });
    if (klantOpties.length === 0) {
      const r = await listCustomers();
      setKlantOpties(r.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant', sub: k.city ?? undefined })));
    }
  };

  const verwijderProject = () => {
    if (!project) return;
    bevestigVerwijderen(
      `Project "${project.name ?? ''}"`,
      () => {
        save(() => deleteProject(project.id), {
          onSuccess: () => terug(),
          succesMelding: 'Project verwijderd',
        });
      },
      'Werkbonnen en facturen die eraan hangen blijven bestaan, maar verliezen hun projectkoppeling.',
    );
  };

  const notitieToevoegen = () => {
    if (!project) return;
    saveNotitie(() => addProjectNote(project.id, nieuweNotitie), {
      onSuccess: async () => {
        setNieuweNotitie('');
        const r = await listProjectNotes(project.id);
        setData((d) => ({ ...d, notities: r.data }));
      },
    });
  };
  const notitieWeg = (n: ProjectNote) => {
    bevestigVerwijderen('Notitie', () => {
      save(() => deleteProjectNote(n.id), {
        onSuccess: () => setData((d) => ({ ...d, notities: d.notities.filter((x) => x.id !== n.id) })),
      });
    });
  };

  // ── Weergave-hulpjes ─────────────────────────────────────────────────────
  const titel = project?.name || deal?.title || 'Project';
  const verlopen = isVerlopen(project?.deadline, project?.status, vandaag);
  const komend = regels.filter((r) => r.datum >= vandaag);
  const aanvraagTekst = alsTekst(project?.description || deal?.description || '');
  const behandelaars = deal ? behandelaarIds(deal).map((id) => naamVan(id)).filter(Boolean) : [];
  const urenKleur = { rood: t.statusRejectFg, oranje: t.statusWarnFg, normaal: t.muted }[
    urenToon(cijfers.hoursPercentage)
  ];

  // ── Overzicht ────────────────────────────────────────────────────────────
  const overzicht = (
    <>
      {deal ? (
        <Blok titel="Status">
          {dealVerloren ? (
            <View style={styles.rijMidden}>
              <StatusBadge status="Verloren" />
              {deal.lost_reason ? <Text style={styles.klein}>{deal.lost_reason}</Text> : null}
            </View>
          ) : dealAfgerond ? (
            <StatusBadge status="Project voltooid" />
          ) : magVerkoop && stages.length ? (
            <SelectField
              label="Fase"
              value={deal.stage_id}
              options={faseKeuzes(stages, deal.stage_id).map((s) => ({ id: s.id, label: s.name ?? 'Fase' }))}
              onChange={wijzigFase}
              placeholder="Kies een fase"
            />
          ) : huidigeFase ? (
            <FaseBadge label={huidigeFase.name ?? 'Fase'} colorClass={huidigeFase.color_class} positie={huidigeFase.position} groot />
          ) : (
            <Text style={styles.waarde}>Loopt</Text>
          )}
          {huidigeFase && magVerkoop && !dealVerloren && !dealAfgerond ? (
            <FaseBadge label={huidigeFase.name ?? 'Fase'} colorClass={huidigeFase.color_class} positie={huidigeFase.position} />
          ) : null}

          {magVerkoop ? (
            <View style={styles.knoppen}>
              {dealVerloren ? (
                <Button label="Heropenen" variant="secondary" onPress={heropenVerloren} />
              ) : (
                <>
                  <Button
                    label={dealAfgerond ? 'Heropenen' : 'Project voltooien'}
                    variant={dealAfgerond ? 'secondary' : 'primary'}
                    onPress={() => zetAfgerond(!dealAfgerond)}
                  />
                  {!dealAfgerond ? (
                    <Button label="Verloren" variant="ghost" onPress={() => setVerlorenOpen(true)} />
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {magVerkoop ? (
            <>
              <Veld label="Behandeld door">
                {toewijzen && !dealAfgerond ? (
                  <LedenKeuze
                    label=""
                    leden={data.leden}
                    waarde={behandelaarIds(deal)}
                    onChange={wijzigBehandelaars}
                  />
                ) : (
                  <Pressable
                    onPress={() => setToewijzen(true)}
                    disabled={dealAfgerond}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.toewijsKnop, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.waarde} numberOfLines={2}>
                      {behandelaars.length ? behandelaars.join(', ') : 'Niemand toegewezen'}
                    </Text>
                    {!dealAfgerond ? <Pencil size={14} color={t.muted} /> : null}
                  </Pressable>
                )}
              </Veld>
              <Veld label="Prioriteit">
                <View style={styles.chipRij}>
                  {DEAL_PRIORITEITEN.map((p) => {
                    const aan = (deal.priority || 'med') === p.id;
                    return (
                      <Pressable
                        key={String(p.id)}
                        onPress={() => wijzigPrio(String(p.id))}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: aan }}
                        style={[styles.chip, aan && styles.chipAan]}
                      >
                        <Text style={[styles.chipTekst, aan && styles.chipTekstAan]}>{p.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Veld>
            </>
          ) : null}
          {!project && magVerkoop ? (
            <Text style={styles.klein}>Bij deze aanvraag hoort nog geen project.</Text>
          ) : null}
        </Blok>
      ) : project ? (
        <Blok titel="Status">
          <StatusBadge status={project.status ?? 'gepland'} />
          <Text style={styles.klein}>
            De status volgt de werkbonnen: {projectStatusLabel(project.status).toLowerCase()}.
          </Text>
        </Blok>
      ) : null}

      <Blok
        titel="De aanvraag"
        actie={
          project && magProject ? (
            <KleineKnop
              label="Bewerken"
              onPress={() => {
                setSaveError(null);
                setBewerk({ soort: 'aanvraag', tekst: aanvraagTekst });
              }}
            />
          ) : !project && deal && magVerkoop ? (
            <KleineKnop
              label="Bewerken"
              onPress={() => {
                setSaveError(null);
                setBewerk({
                  soort: 'deal',
                  titel: deal.title ?? '',
                  waarde: deal.expected_revenue != null ? String(deal.expected_revenue) : '',
                  tekst: alsTekst(deal.description),
                });
              }}
            />
          ) : undefined
        }
      >
        <Text style={[styles.tekst, !aanvraagTekst && { color: t.muted }]}>
          {aanvraagTekst || 'Nog niets opgeschreven over deze aanvraag.'}
        </Text>
        <View style={styles.raster}>
          <Veld label="Waar">
            <Text style={styles.waarde}>{klant?.address || '—'}</Text>
            {klant?.postcode || klant?.city ? (
              <Text style={styles.klein}>{[klant?.postcode, klant?.city].filter(Boolean).join(' ')}</Text>
            ) : null}
          </Veld>
          <Veld label="Wanneer">
            <Text style={styles.waarde}>{wanneerLabel(regels, project?.start_date ?? null, vandaag)}</Text>
            {project?.deadline ? <Text style={styles.klein}>deadline {formatDateNL(project.deadline)}</Text> : null}
          </Veld>
          {deal ? (
            <Veld label="Via">
              <Text style={styles.waarde}>
                {data.bron?.bron === 'bossbase_website'
                  ? 'Websiteformulier'
                  : data.bron?.bron
                    ? data.bron.bron
                    : magVerkoop
                      ? 'Handmatig aangemaakt'
                      : '—'}
              </Text>
              {data.bron?.binnenOp || deal.created_at ? (
                <Text style={styles.klein}>
                  binnen op {formatDateNL(lokaleDatum(data.bron?.binnenOp || deal.created_at))}
                </Text>
              ) : null}
            </Veld>
          ) : null}
          <Veld label="Contact">
            <Text style={styles.waarde}>{klant?.phone || klant?.email || '—'}</Text>
          </Veld>
          {!project && deal ? (
            <Veld label="Verwachte omzet">
              <Text style={styles.waarde}>{formatEUR(Number(deal.expected_revenue ?? 0))}</Text>
            </Veld>
          ) : null}
        </View>
        {data.fotos.length ? (
          <Veld label="Foto's">
            <View style={styles.fotos}>
              {data.fotos.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => Linking.openURL(f.url)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Foto openen"
                >
                  <Image source={{ uri: f.url }} style={styles.foto} />
                </Pressable>
              ))}
            </View>
          </Veld>
        ) : null}
      </Blok>

      {project ? (
        <Blok
          titel="Projectinformatie"
          actie={
            magProject ? (
              <KleineKnop
                label="Bewerken"
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
            <Veld label="Startdatum">
              <Text style={[styles.waarde, !project.start_date && { color: t.muted }]}>
                {project.start_date ? formatDateNL(project.start_date) : 'Niet ingevuld'}
              </Text>
            </Veld>
            <Veld label="Einddatum">
              <Text
                style={[
                  styles.waarde,
                  !project.deadline && { color: t.muted },
                  verlopen && { color: t.statusRejectFg },
                ]}
              >
                {project.deadline ? formatDateNL(project.deadline) : 'Niet ingevuld'}
                {verlopen ? '  verlopen' : ''}
              </Text>
            </Veld>
            <Veld label="Begrote uren">
              <Text style={styles.waarde}>{formatUren(project.quoted_hours)}</Text>
            </Veld>
            <Veld label="Gewerkte uren">
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
              <Veld label="Projectwaarde">
                <Text style={styles.waarde}>{formatEUR(Number(project.project_value ?? 0))}</Text>
                <Text style={styles.klein}>{waardeBronUitleg(project.waarde_bron)}</Text>
                {project.waarde_bron === 'handmatig' && magProject ? (
                  <Pressable onPress={waardeAutomatisch} accessibilityRole="link" hitSlop={8}>
                    <Text style={styles.link}>automatisch berekenen</Text>
                  </Pressable>
                ) : null}
              </Veld>
            ) : null}
            {magBedragen ? (
              <Veld label="Gefactureerd">
                <Text style={styles.waarde}>{formatEUR(cijfers.omzetExclBtw)}</Text>
                {cijfers.remainingToInvoice > 0 ? (
                  <Text style={[styles.klein, { color: t.statusWarnFg }]}>
                    nog {formatEUR(cijfers.remainingToInvoice)}
                  </Text>
                ) : null}
              </Veld>
            ) : null}
          </View>
        </Blok>
      ) : null}

      {project ? (
        <Blok titel="Planning">
          {regels.length === 0 ? (
            <Text style={styles.leeg}>Nog niets ingepland voor dit project.</Text>
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
        <Blok titel="Werkbonnen">
          {data.werkbonnen.length === 0 ? (
            <Text style={styles.leeg}>Geen werkbonnen</Text>
          ) : (
            [...data.werkbonnen]
              .sort((a, b) => String(b.gepland_op ?? '').localeCompare(String(a.gepland_op ?? '')))
              .map((w) => (
                <Rij
                  key={w.id}
                  titel={w.titel || 'Werkbon'}
                  sub={`${w.nummer || 'geen nummer'}${w.locatie ? ` · ${w.locatie}` : ''}`}
                  rechts={<StatusBadge status={w.status ?? 'gepland'} />}
                  onPress={() => router.push(`/work-orders/${w.id}`)}
                />
              ))
          )}
        </Blok>
      ) : null}

      {magOffertes ? (
        <Blok titel="Offertes">
          {data.offertes.length === 0 ? (
            <Text style={styles.leeg}>Geen offertes</Text>
          ) : (
            data.offertes.map((o) => (
              <Rij
                key={o.id}
                titel={o.omschrijving || o.nummer || 'Offerte'}
                sub={[o.omschrijving ? o.nummer : null, OFFERTE_STATUS[o.status ?? ''] ?? o.status]
                  .filter(Boolean)
                  .join(' · ')}
                rechts={magBedragen ? <Text style={styles.bedrag}>{formatEUR(Number(o.totaal_incl ?? 0))}</Text> : undefined}
                onPress={() => router.push('/offers')}
              />
            ))
          )}
        </Blok>
      ) : null}

      {project && magBedragen ? (
        <Blok titel="Facturen">
          {data.facturen.length === 0 ? (
            <Text style={styles.leeg}>Geen facturen</Text>
          ) : (
            data.facturen.map((f) => (
              <Rij
                key={f.id}
                titel={f.nummer || 'Factuur'}
                sub={[
                  f.factuurdatum ? formatDateNL(f.factuurdatum) : null,
                  f.vervaldatum ? `vervalt ${formatDateNL(f.vervaldatum)}` : null,
                  factuurStatusLabel(f.status),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                rechts={<Text style={styles.bedrag}>{formatEUR(Number(f.totaal_incl ?? 0))}</Text>}
                onPress={can('facturen') ? () => router.push('/invoices') : undefined}
              />
            ))
          )}
        </Blok>
      ) : null}

      {deal ? (
        <Blok
          titel="Activiteiten"
          actie={
            magActiviteit ? (
              <KleineKnop
                label="Inplannen"
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
            <Text style={styles.leeg}>Geen activiteiten. Plan een vervolgactie in.</Text>
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
                    dag ? formatDateNL(dag) : 'Geen datum',
                    a.completed ? 'afgerond' : teLaat ? 'te laat' : null,
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
          titel="Klantgegevens"
          actie={
            project && magProject ? (
              <KleineKnop label={klant ? 'Andere klant' : 'Klant kiezen'} onPress={openKlantKiezen} />
            ) : undefined
          }
        >
          {klant ? (
            <>
              <Rij
                titel={klant.name || 'Klant'}
                sub="Klantkaart openen"
                onPress={() => router.push(`/customers/${klant.id}`)}
              />
              <View style={styles.raster}>
                <Veld label="Telefoon">
                  <Text style={styles.waarde}>{klant.phone || '—'}</Text>
                </Veld>
                <Veld label="E-mail">
                  <Text style={styles.waarde}>{klant.email || '—'}</Text>
                </Veld>
                <Veld label="Adres">
                  <Text style={styles.waarde}>
                    {[klant.address, [klant.postcode, klant.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') ||
                      '—'}
                  </Text>
                </Veld>
              </View>
            </>
          ) : (
            <Text style={styles.leeg}>Geen klant gekoppeld.</Text>
          )}
        </Blok>
      ) : null}

      {project && magProjectWeg ? (
        <View style={styles.voet}>
          <Button label="Verwijder project" variant="ghost" onPress={verwijderProject} />
        </View>
      ) : null}
    </>
  );

  // ── Uren ─────────────────────────────────────────────────────────────────
  const urenTab = (
    <Blok titel={`Uren · ${formatUren(cijfers.usedHours)}`}>
      <Text style={styles.klein}>Uit de werkbonuren van dit project. Boeken gaat via de werkbon.</Text>
      {data.uren.length === 0 ? (
        <Text style={styles.leeg}>Nog geen uren geboekt.</Text>
      ) : (
        data.uren.map((u) => (
          <Rij
            key={u.id}
            titel={`${formatDateNL(u.datum)} · ${u.medewerker?.full_name ?? 'Onbekend'}`}
            sub={u.notitie ? alsTekst(u.notitie) : undefined}
            rechts={<Text style={styles.bedrag}>{formatUren(u.uren)}</Text>}
            onPress={u.werkbon_id ? () => router.push(`/work-orders/${u.werkbon_id}`) : undefined}
          />
        ))
      )}
    </Blok>
  );

  // ── Notities ─────────────────────────────────────────────────────────────
  const eigenId = getUserId();
  const notitiesTab = (
    <Blok titel="Notities">
      <FormField
        label="Nieuwe notitie"
        value={nieuweNotitie}
        onChangeText={setNieuweNotitie}
        placeholder="Schrijf een notitie over dit project…"
        multiline
      />
      {notitieFout ? <Text style={[styles.klein, { color: t.statusRejectFg }]}>{notitieFout}</Text> : null}
      <View style={{ alignItems: 'flex-end' }}>
        <Button
          label="Notitie toevoegen"
          onPress={notitieToevoegen}
          loading={notitieBezig}
          disabled={!nieuweNotitie.trim() || notitieBezig || !mag('projectNotities', 'maken')}
        />
      </View>
      {data.notities.length === 0 ? (
        <Text style={styles.leeg}>Nog geen notities. Voeg de eerste notitie toe.</Text>
      ) : (
        data.notities.map((n) => (
          <View key={n.id} style={styles.notitie}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.notitieMeta}>
                {n.auteur?.full_name || 'Onbekend'} · {formatDateNL(lokaleDatum(n.created_at))}
              </Text>
              <Text style={styles.tekst}>{alsTekst(n.note)}</Text>
            </View>
            {/* De policy laat de auteur en admin/planner verwijderen. */}
            {n.created_by === eigenId || mag('team', 'wijzigen') ? (
              <Pressable
                onPress={() => notitieWeg(n)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Notitie verwijderen"
                style={styles.notitieWeg}
              >
                <Trash2 size={16} color={t.statusRejectFg} />
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </Blok>
  );

  const tabs: { id: Tab; label: string; count?: number }[] = project
    ? [
        { id: 'overzicht', label: 'Overzicht' },
        { id: 'uren', label: 'Uren' },
        { id: 'notities', label: 'Notities', count: data.notities.length },
      ]
    : [{ id: 'overzicht', label: 'Overzicht' }];

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
              project && magProject ? (
                <HeaderIconButton
                  icon={Pencil}
                  label="Projectnaam wijzigen"
                  onPress={() => {
                    setSaveError(null);
                    setBewerk({ soort: 'naam', naam: project.name ?? '' });
                  }}
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
          {tab === 'overzicht' ? overzicht : tab === 'uren' ? urenTab : notitiesTab}
        </View>
      </AppScreen>

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
            ? 'Projectnaam'
            : bewerk?.soort === 'aanvraag'
              ? 'De aanvraag'
              : bewerk?.soort === 'info'
                ? 'Projectinformatie'
                : bewerk?.soort === 'klant'
                  ? 'Klant kiezen'
                  : bewerk?.soort === 'activiteit'
                    ? 'Activiteit inplannen'
                    : 'Aanvraag bewerken'
        }
        subtitle={titel}
        error={saveError}
        saving={saving}
        submitDisabled={
          (bewerk?.soort === 'naam' && !bewerk.naam.trim()) ||
          (bewerk?.soort === 'activiteit' && !bewerk.titel.trim()) ||
          (bewerk?.soort === 'deal' && !bewerk.titel.trim())
        }
        onSubmit={opslaan}
        onClose={() => setBewerk(null)}
      >
        {bewerk?.soort === 'naam' ? (
          <FormField
            label="Projectnaam"
            value={bewerk.naam}
            onChangeText={(v) => setBewerk({ ...bewerk, naam: v })}
            autoFocus
          />
        ) : null}
        {bewerk?.soort === 'aanvraag' ? (
          <FormField
            label="Omschrijving"
            value={bewerk.tekst}
            onChangeText={(v) => setBewerk({ ...bewerk, tekst: v })}
            placeholder="Wat wil de klant? Wat moet er gebeuren, waar moet op gelet worden?"
            multiline
            autoFocus
          />
        ) : null}
        {bewerk?.soort === 'info' ? (
          <>
            <View style={styles.formRij}>
              <View style={{ flex: 1 }}>
                <DateField
                  label="Startdatum"
                  value={bewerk.start || null}
                  onChange={(v) => setBewerk({ ...bewerk, start: v })}
                  maximum={bewerk.eind || null}
                  placeholder="Kies"
                />
              </View>
              <View style={{ flex: 1 }}>
                <DateField
                  label="Einddatum"
                  value={bewerk.eind || null}
                  onChange={(v) => setBewerk({ ...bewerk, eind: v })}
                  minimum={bewerk.start || null}
                  placeholder="Kies"
                />
              </View>
            </View>
            <FormField
              label="Begrote uren"
              value={bewerk.uren}
              onChangeText={(v) => setBewerk({ ...bewerk, uren: v })}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            {magBedragen ? (
              <FormField
                label="Projectwaarde (excl. btw)"
                value={bewerk.waarde}
                onChangeText={(v) => setBewerk({ ...bewerk, waarde: v })}
                keyboardType="decimal-pad"
                placeholder="0,00"
                hint="Een zelf ingevulde waarde wordt niet meer automatisch berekend."
              />
            ) : null}
          </>
        ) : null}
        {bewerk?.soort === 'klant' ? (
          <SelectField
            label="Klant"
            value={bewerk.klantId}
            options={klantOpties}
            onChange={(id) => setBewerk({ ...bewerk, klantId: id })}
            allowEmpty
            emptyLabel="— Geen klant —"
            placeholder="Kies een klant"
            searchable
          />
        ) : null}
        {bewerk?.soort === 'deal' ? (
          <>
            <FormField label="Titel" value={bewerk.titel} onChangeText={(v) => setBewerk({ ...bewerk, titel: v })} />
            <FormField
              label="Verwachte omzet"
              value={bewerk.waarde}
              onChangeText={(v) => setBewerk({ ...bewerk, waarde: v })}
              keyboardType="decimal-pad"
              placeholder="0,00"
            />
            <FormField
              label="Omschrijving"
              value={bewerk.tekst}
              onChangeText={(v) => setBewerk({ ...bewerk, tekst: v })}
              multiline
            />
          </>
        ) : null}
        {bewerk?.soort === 'activiteit' ? (
          <>
            <FormField
              label="Titel"
              value={bewerk.titel}
              onChangeText={(v) => setBewerk({ ...bewerk, titel: v })}
              placeholder="Bijv. Klant terugbellen"
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
                  label="Datum"
                  value={bewerk.datum || null}
                  onChange={(v) => setBewerk({ ...bewerk, datum: v })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField
                  label="Tijd"
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


// ── Bouwstenen (buiten de render, anders verliest een invoerveld zijn focus) ──

function useStijl() {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return { t, styles };
}

function Blok({ titel, actie, children }: { titel: string; actie?: ReactNode; children: ReactNode }) {
  const { styles } = useStijl();
  return (
    <View style={styles.blok}>
      <View style={styles.blokKop}>
        <Text style={styles.blokTitel}>{titel}</Text>
        {actie}
      </View>
      {children}
    </View>
  );
}

function Veld({ label, children }: { label: string; children: ReactNode }) {
  const { styles } = useStijl();
  return (
    <View style={styles.veld}>
      {label ? <Text style={styles.veldLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

function KleineKnop({ label, onPress, icon }: { label: string; onPress: () => void; icon?: 'plus' | 'pen' }) {
  const { t, styles } = useStijl();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.kleineKnop, pressed && { opacity: 0.7 }]}
    >
      {icon === 'plus' ? <Plus size={16} color={t.ink2} /> : <Pencil size={14} color={t.ink2} />}
      <Text style={styles.kleineKnopTekst}>{label}</Text>
    </Pressable>
  );
}

function Rij({
  titel,
  sub,
  rechts,
  onPress,
}: {
  titel: string;
  sub?: string;
  rechts?: ReactNode;
  onPress?: () => void;
}) {
  const { t, styles } = useStijl();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.rij, pressed && onPress ? { opacity: 0.7 } : null]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rijTitel} numberOfLines={1}>
          {titel}
        </Text>
        {sub ? (
          <Text style={styles.rijSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {rechts}
      {onPress ? <ChevronRight size={16} color={t.muted2} /> : null}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    inhoud: { paddingHorizontal: 16, gap: spacing.md },
    blok: {
      backgroundColor: t.card,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      padding: spacing.lg,
      gap: spacing.md,
    },
    blokKop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    blokTitel: { fontSize: 15, fontWeight: '700', color: t.ink },
    veld: { gap: 2, flexBasis: 140, flexGrow: 1 },
    veldLabel: { ...typography.eyebrow, color: t.muted2 },
    waarde: { fontSize: 14, fontWeight: '600', color: t.ink },
    klein: { fontSize: 12.5, color: t.muted },
    tekst: { fontSize: 14, lineHeight: 21, color: t.ink },
    leeg: { fontSize: 13, color: t.muted },
    link: { fontSize: 12.5, color: t.green700, textDecorationLine: 'underline', marginTop: 2 },
    raster: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    rijMidden: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    knoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    toewijsKnop: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
    kleineKnop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: t.bgAlt,
    },
    kleineKnopTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    rij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      paddingVertical: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.line,
    },
    rijTitel: { fontSize: 14, fontWeight: '600', color: t.ink },
    rijSub: { fontSize: 12.5, color: t.muted, marginTop: 1 },
    bedrag: { fontSize: 13.5, fontWeight: '700', color: t.ink2 },
    fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
    foto: { width: 92, height: 70, borderRadius: 8, backgroundColor: t.bgAlt },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipAan: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    chipTekstAan: { color: t.green700 },
    voet: { alignItems: 'flex-end' },
    formRij: { flexDirection: 'row', gap: spacing.md },
    notitie: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.line,
    },
    notitieMeta: { fontSize: 12, color: t.muted, marginBottom: 2 },
    notitieWeg: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  });
