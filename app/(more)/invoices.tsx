import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Dialog } from '@/lib/dialog';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Lock, Plus, Receipt, Trash2 } from 'lucide-react-native';
import {
  AppFilterChips,
  AppListGroup,
  AppListItem,
  AppSearchBar,
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
  NoticeBanner,
  RegelEditor,
} from '@/components';
import { usePermissions, useTheme } from '@/providers';
import {
  createFactuurRegel,
  deleteFactuur,
  deleteFactuurRegel,
  FACTUUR_STATUS_OPTIES,
  createCreditFactuur,
  getFactuurDetail,
  getFactuurRegels,
  listFacturenMetDocument,
  type FactuurDetail,
  herberekenFactuurTotalen,
  inhoudLigtVast,
  isGeimporteerd,
  listFacturen,
  markeerBetaald,
  updateFactuur,
  type FactuurInput,
  type FactuurRegel,
  type FactuurRow,
  createFactuur,
  createFactuurMetRegels,
} from '@/services/factuurService';
import { listCustomers } from '@/services/customerService';
import { listProjects } from '@/services/projectService';
import { getCompanySettings } from '@/services/settingsService';
import { listEigenEenheden } from '@/services/eigenEenheidService';
import {
  berekenTotalen,
  legeRegel,
  omschrijvingVoorOpslag,
  veldNaarNummer,
  type EigenEenheid,
  type Regel,
} from '@/lib/regels';
import { isoVanDatum } from '@/lib/datum';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { vandaagIso } from '@/lib/nlTijd';
import { formatDateNL, formatEUR } from '@/lib/format';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { alsTekst } from '@/lib/notitieTekst';
import { useSchermklasse } from '@/lib/schermklasse';
import {
  documentTotalen,
  FACTUUR_FILTERS,
  factuurKpis,
  factuurStatusInfo,
  factuurWeergaveStatus,
  filterFacturen,
  isFactuurVerlopen,
  magCrediteren,
  telFactuurFilters,
  type FactuurFilter,
} from '@/lib/documentLogica';
import { Paneel } from '@/components/Paneel';
import { PdfWeergave, type PdfDocument } from '@/components/PdfWeergave';
import {
  DetailRij,
  DocumentStatusBadge,
  RegelLijst,
  TegelRaster,
  TotalenBlok,
} from '@/components/DocumentOnderdelen';
import { useOnthouden } from '@/lib/useOnthouden';

/**
 * Facturen — dezelfde `facturen` + `factuur_regels` als het dashboard.
 *
 * Gelijk aan de facturenpagina van het dashboard: KPI's (Totaal, Openstaand,
 * Betaald deze maand, Verlopen), filtertabs (Alle/Concept/Verzonden/Betaald/
 * Verlopen/Gecrediteerd), zoeken op nummer en klant, "Te laat" als de
 * vervaldatum verstreken is, CF-badge voor creditfacturen en "Gecrediteerd".
 * De detailweergave opent de bewaarde PDF uit `factuur-pdfs` (tijdelijke
 * link); zonder bewaard bestand is er een afdrukbare weergave. Volledig
 * crediteren (`BB-CF…`) kan hier; versturen, herinneringen en gedeeltelijk
 * crediteren gaan via het dashboard.
 *
 * Betaald zetten loopt via de RPC `mark_factuur_betaald`, precies de route die
 * de Stripe-webhook ook gebruikt. Die is idempotent en geeft terug óf er iets
 * veranderd is: twee keer tikken levert dus geen tweede boeking naar de
 * boekhouding op, en de app zegt eerlijk "stond al op betaald" in plaats van
 * een succesmelding te tonen voor iets wat niet gebeurd is.
 *
 * Let op de gates: de factuur zelf hangt op het recht `facturen`, de REGELS op
 * de rol (admin/planner voor toevoegen, admin voor verwijderen). Een verstuurde
 * factuur ligt inhoudelijk vast; een geïmporteerde factuur helemaal.
 */

export default function InvoicesScreen() {
  return (
    <PermissionGate permission="facturen" label="Facturen">
      <InvoicesScreenInhoud />
    </PermissionGate>
  );
}

type Concept = {
  id: string | null;
  customerId: string | null;
  projectId: string | null;
  factuurdatum: string;
  betaaltermijn: string;
  vervaldatum: string;
  notities: string;
  status: string;
  opSlot: boolean;
  geimporteerd: boolean;
};

type RegelConcept = { omschrijving: string; aantal: string; prijs: string; btw: string };

const LEGE_REGEL: RegelConcept = { omschrijving: '', aantal: '1', prijs: '', btw: '21' };

function subtitleFor(f: FactuurRow, vandaag: string): string {
  const delen: string[] = [];
  if (f.is_credit) delen.push('Creditfactuur');
  if (f.customer?.name) delen.push(f.customer.name);
  if (f.betaald_op) delen.push(`Betaald ${formatDateNL(f.betaald_op)}`);
  else if (f.vervaldatum) {
    delen.push(
      `${isFactuurVerlopen(f, vandaag) ? 'Verviel' : 'Vervalt'} ${formatDateNL(f.vervaldatum)}`,
    );
  }
  if (f.gecrediteerd) delen.push('Gecrediteerd');
  return delen.join(' · ') || 'Factuur';
}

function regelMeta(r: FactuurRegel): string {
  const btw =
    r.btw_regime === 'verlegd'
      ? 'btw verlegd'
      : r.btw_regime === 'vrijgesteld'
        ? 'geen btw'
        : `${Number(r.btw_pct ?? 21)}% btw`;
  return `${String(r.aantal).replace('.', ',')} × ${formatEUR(r.eenheidsprijs)} · ${btw}`;
}

function InvoicesScreenInhoud() {
  const router = useRouter();
  // `?nieuw=1&klant=&project=` opent meteen een nieuwe factuur voor dat
  // project — de plusknop op de projectkaart (`prefill` van de dashboardmodal).
  // Na opslaan of annuleren gaat het terug naar het project.
  const {
    id: openId,
    nieuw: nieuwParam,
    klant: klantParam,
    project: projectParam,
  } = useLocalSearchParams<{ id?: string; nieuw?: string; klant?: string; project?: string }>();
  const terugNaarProject = useRef<string | null>(null);
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();
  const { klasse } = useSchermklasse();
  const breed = klasse === 'tablet';
  const vandaag = vandaagIso();

  const [items, setItems] = useState<FactuurRow[]>([]);
  const [metDocument, setMetDocument] = useState<Set<string>>(new Set());
  const [zoek, setZoek] = useState('');
  const [filter, setFilter] = useOnthouden<FactuurFilter>(
    'facturen.filter',
    'alle',
    FACTUUR_FILTERS.map((f) => f.id),
  );

  // Detailweergave
  const [detail, setDetail] = useState<FactuurRow | null>(null);
  const [detailData, setDetailData] = useState<FactuurDetail | null>(null);
  const [detailRegels, setDetailRegels] = useState<FactuurRegel[]>([]);
  const [detailLaden, setDetailLaden] = useState(false);
  const [detailFout, setDetailFout] = useState<string | null>(null);
  const [klanten, setKlanten] = useState<SelectOption[]>([]);
  const [projecten, setProjecten] = useState<SelectOption[]>([]);
  const [instellingen, setInstellingen] = useState({
    uurtarief: 55,
    reiskostenPerKm: 0.23,
    btwPct: 21,
    geldigDagen: 14,
  });
  const [eenheden, setEenheden] = useState<EigenEenheid[]>([]);
  /** De regels van een NIEUWE factuur; bestaande facturen bewerken hun regels apart. */
  const [nieuweRegels, setNieuweRegels] = useState<Regel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [concept, setConcept] = useState<Concept | null>(null);
  const [regelsVoor, setRegelsVoor] = useState<FactuurRow | null>(null);
  const [regels, setRegels] = useState<FactuurRegel[]>([]);
  const [nieuweRegel, setNieuweRegel] = useState<RegelConcept>(LEGE_REGEL);

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveRegel, saving: regelBezig, error: regelFout } = useSave<unknown>();

  const magMaken = mag('facturen', 'maken');
  const magWijzigen = mag('facturen', 'wijzigen');
  const magVerwijderen = mag('facturen', 'verwijderen');
  const magBetaald = mag('facturen', 'betaaldZetten');
  const magRegels = mag('factuurRegels', 'maken');
  const magRegelWeg = mag('factuurRegels', 'verwijderen');

  const load = useCallback(async () => {
    setError(null);

    const [factRes, klantRes, projRes, instRes, eenheidRes, docRes] = await Promise.all([
      listFacturen(),
      listCustomers(),
      listProjects(),
      getCompanySettings(),
      listEigenEenheden(),
      listFacturenMetDocument(),
    ]);
    setMetDocument(docRes);

    if (factRes.error) setError(factRes.error);
    else setItems(factRes.data);
    if (!klantRes.error) {
      setKlanten(klantRes.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant' })));
    }
    if (!projRes.error) {
      setProjecten(projRes.data.map((p) => ({ id: p.id, label: p.name ?? 'Project' })));
    }
    // Standaardtarieven en eigen eenheden: dezelfde bron als de factuurmodal
    // van het dashboard gebruikt om een nieuwe regel voor te vullen.
    if (!instRes.error) {
      setInstellingen({
        uurtarief: instRes.data.uurtarief,
        reiskostenPerKm: instRes.data.reiskosten_per_km,
        btwPct: instRes.data.btw_pct,
        geldigDagen: instRes.data.offerte_geldig_dagen,
      });
    }
    if (!eenheidRes.error) setEenheden(eenheidRes.data);
  }, []);

  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });


  /**
   * Detailweergave (`ViewFactuurModal`). Regels, klant- en bedrijfsgegevens en
   * — als er een bewaard bestand is — de tijdelijke PDF-link worden bij het
   * openen opgehaald, zodat de knoppen daarna synchroon een venster openen
   * (Safari blokkeert vensters die pas na een netwerkverzoek komen).
   */
  const openDetail = async (f: FactuurRow) => {
    setDetail(f);
    setDetailData(null);
    setDetailRegels([]);
    setDetailFout(null);
    setDetailLaden(true);
    const [d, r] = await Promise.all([getFactuurDetail(f.id), getFactuurRegels(f.id)]);
    setDetailData(d.data);
    setDetailRegels(r.data);
    setDetailFout(d.error ?? r.error);
    setDetailLaden(false);
  };

  // Openen vanuit een melding of link: /invoices?id=<id>
  useEffect(() => {
    if (!openId || loading) return;
    const f = items.find((x) => x.id === openId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (f) void openDetail(f);
    router.setParams({ id: undefined });
  }, [openId, loading, items, router]);

  /**
   * PDF bekijken (`PdfWeergave`), zoals de paperclip in het dashboard: het
   * bewaarde bestand als dat er is (wat de klant kreeg, of het origineel uit
   * de boekhouding), anders dezelfde PDF die het dashboard opbouwt.
   */
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const bekijkPdf = (f: FactuurRow) =>
    setPdfDoc({ soort: 'factuur', id: f.id, titel: `Factuur ${f.nummer ?? ''}`.trim(), opgeslagenEerst: true });

  const crediteren = (f: FactuurRow) => {
    Dialog.alert(
      'Factuur crediteren?',
      `Er komt een creditfactuur (BB-CF…) voor het volledige bedrag van ${f.nummer}. ` +
        'Gedeeltelijk crediteren kan in het dashboard.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Crediteren',
          style: 'destructive',
          onPress: () => {
            save(() => createCreditFactuur(f.id), {
              onSuccess: async (res) => {
                setDetail(null);
                const credit = res as FactuurRow;
                Dialog.alert('Creditfactuur aangemaakt', `${credit.nummer} staat in de lijst.`);
                await herlaad();
              },
            });
          },
        },
      ],
    );
  };

  const openNieuw = (vooraf?: { customerId?: string | null; projectId?: string | null }) => {
    setSaveError(null);
    // Vervaldatum = factuurdatum + de betaaltermijn uit de bedrijfsinstellingen,
    // net als de factuurmodal van het dashboard hem voorinvult.
    const verval = new Date();
    verval.setDate(verval.getDate() + instellingen.geldigDagen);
    setNieuweRegels([legeRegel({ uurtarief: instellingen.uurtarief, btwPct: instellingen.btwPct })]);
    setConcept({
      id: null,
      customerId: vooraf?.customerId ?? null,
      projectId: vooraf?.projectId ?? null,
      factuurdatum: vandaagIso(),
      betaaltermijn: String(instellingen.geldigDagen),
      vervaldatum: isoVanDatum(verval),
      notities: '',
      status: 'concept',
      opSlot: false,
      geimporteerd: false,
    });
  };

  // Nieuw vanaf de projectkaart: pas openen als de instellingen er zijn, anders
  // klopt de voorinvulling (vervaldatum, btw, uurtarief) niet.
  useEffect(() => {
    if (nieuwParam !== '1' || loading || !rechtenGeladen) return;
    terugNaarProject.current = projectParam || null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (magMaken) openNieuw({ customerId: klantParam || null, projectId: projectParam || null });
    router.setParams({ nieuw: undefined, klant: undefined, project: undefined });
    // openNieuw leest alleen de net geladen instellingen; hem als afhankelijkheid
    // nemen zou bij elke render opnieuw openen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nieuwParam, loading, rechtenGeladen]);

  const openBewerk = (f: FactuurRow) => {
    if (!magWijzigen) return;
    setSaveError(null);
    setConcept({
      id: f.id,
      customerId: f.customer_id,
      projectId: f.project_id,
      factuurdatum: f.factuurdatum,
      betaaltermijn: String(f.betaaltermijn_dagen ?? 14),
      vervaldatum: f.vervaldatum ?? '',
      notities: f.notities ?? '',
      status: f.status,
      opSlot: inhoudLigtVast(f),
      geimporteerd: isGeimporteerd(f),
    });
  };

  const opslaan = () => {
    if (!concept) return;
    const invoer: Partial<FactuurInput> & { status?: string } =
      concept.opSlot || concept.geimporteerd
        ? { status: concept.status === 'betaald' ? undefined : concept.status }
        : {
            customer_id: concept.customerId,
            project_id: concept.projectId,
            factuurdatum: concept.factuurdatum,
            betaaltermijn_dagen: Number(concept.betaaltermijn || 14),
            vervaldatum: concept.vervaldatum || null,
            notities: concept.notities,
            ...(concept.id && concept.status !== 'betaald' ? { status: concept.status } : {}),
          };

    save(
      () => {
        if (concept.id) return updateFactuur(concept.id, invoer);
        // Nieuwe factuur: kop én regels in één handeling, met de totalen uit de
        // regels — zelfde volgorde en zelfde bedragen als het dashboard.
        if (!magRegels) {
          return createFactuur(invoer as FactuurInput);
        }
        const totalen = berekenTotalen(nieuweRegels);
        return createFactuurMetRegels(
          {
            ...(invoer as FactuurInput),
            totaal_excl: totalen.excl,
            totaal_incl: totalen.incl,
          },
          nieuweRegels.map((r) => ({
            omschrijving: omschrijvingVoorOpslag(r, eenheden),
            type: r.type,
            aantal: veldNaarNummer(r.aantal),
            eenheidsprijs: veldNaarNummer(r.prijs),
            btw_pct: r.btwPct,
            btw_regime: r.btwRegime,
          })),
        );
      },
      {
        onSuccess: async () => {
          setConcept(null);
          setNieuweRegels([]);
          const naar = terugNaarProject.current;
          if (!concept.id && naar) {
            terugNaarProject.current = null;
            terugOfNaar(router, `/project/${naar}`);
            return;
          }
          await herlaad();
        },
      },
    );
  };

  /**
   * Betaald zetten. De RPC vertelt of er echt iets veranderd is; stond de
   * factuur al op betaald, dan zeggen we dat en doen we niet alsof.
   */
  const betaaldZetten = (f: FactuurRow) => {
    if (!magBetaald) return;
    Dialog.alert(
      'Factuur op betaald zetten?',
      `${f.nummer} · ${formatEUR(Number(f.totaal_incl ?? 0))}`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Betaald',
          onPress: () => {
            save(() => markeerBetaald(f.id), {
              onSuccess: async (res) => {
                const uitkomst = res as { gewijzigd: boolean };
                if (!uitkomst.gewijzigd) {
                  Dialog.alert('Geen wijziging', 'Deze factuur stond al op betaald.');
                }
                await herlaad();
              },
            });
          },
        },
      ],
    );
  };

  const verwijderen = () => {
    if (!concept?.id) return;
    const id = concept.id;
    const uitBoekhouding = concept.geimporteerd;
    bevestigVerwijderen(
      'Factuur',
      () => {
        save(() => deleteFactuur(id), {
          onSuccess: async (_data, extra) => {
            setConcept(null);
            // De factuur is weg; lukte de prullenbak niet, dan komt hij bij de
            // volgende synchronisatie terug en moet de gebruiker dat weten.
            if (typeof extra?.waarschuwing === 'string') Dialog.alert('Let op', extra.waarschuwing);
            await herlaad();
          },
        });
      },
      uitBoekhouding
        ? 'Deze factuur komt uit je boekhouding. Hij wordt ook op de negeerlijst gezet, zodat de volgende synchronisatie hem niet terughaalt.'
        : 'Dit kan niet ongedaan worden gemaakt.',
    );
  };

  const openRegels = async (f: FactuurRow) => {
    setRegelsVoor(f);
    setNieuweRegel(LEGE_REGEL);
    setRegels([]);
    const { data } = await getFactuurRegels(f.id);
    setRegels(data);
  };

  const herlaadRegels = async (factuurId: string) => {
    const { data } = await getFactuurRegels(factuurId);
    setRegels(data);
    await herberekenFactuurTotalen(factuurId);
    await herlaad();
  };

  const regelToevoegen = () => {
    if (!regelsVoor) return;
    const factuurId = regelsVoor.id;
    saveRegel(
      () =>
        createFactuurRegel({
          factuur_id: factuurId,
          omschrijving: nieuweRegel.omschrijving,
          aantal: Number(nieuweRegel.aantal.replace(',', '.') || 0),
          eenheidsprijs: Number(nieuweRegel.prijs.replace(',', '.') || 0),
          btw_pct: Number(nieuweRegel.btw.replace(',', '.') || 21),
          volgorde: regels.length,
        }),
      {
        onSuccess: async () => {
          setNieuweRegel(LEGE_REGEL);
          await herlaadRegels(factuurId);
        },
      },
    );
  };

  const regelVerwijderen = (r: FactuurRegel) => {
    bevestigVerwijderen('Regel', () => {
      saveRegel(() => deleteFactuurRegel(r.id), {
        onSuccess: async () => herlaadRegels(r.factuur_id),
      });
    });
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Facturen laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Facturen" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const kpis = factuurKpis(items, vandaag);
  const tellingen = telFactuurFilters(items, vandaag);
  const zichtbaar = filterFacturen(items, { filter, zoek, vandaag });
  const magCreditMaken = mag('facturen', 'maken') && mag('factuurRegels', 'maken');

  const detailTotalen = detail
    ? detailRegels.length > 0
      ? documentTotalen(
          detailRegels.map((r) => ({
            bedrag: r.regelprijs,
            btwPct: r.btw_pct,
            btwRegime: r.btw_regime,
          })),
        )
      : {
          excl: Number(detail.totaal_excl ?? 0),
          btwPerTarief: [],
          incl: Number(detail.totaal_incl ?? 0),
        }
    : null;
  const detailStatus = factuurStatusInfo(detail ? factuurWeergaveStatus(detail, vandaag) : null);
  const detailVerlopen = detail ? isFactuurVerlopen(detail, vandaag) : false;
  const detailGeimporteerd = detail ? isGeimporteerd(detail) || detail.status === 'geboekt' : false;

  const regelsOpSlot = regelsVoor ? inhoudLigtVast(regelsVoor) : false;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Facturen"
            subtitle={`${items.length} ${items.length === 1 ? 'factuur' : 'facturen'}`}
            meta={kpis.openstaand !== 0 ? `${formatEUR(kpis.openstaand)} open` : undefined}
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              magMaken ? (
                <HeaderIconButton icon={Plus} label="Nieuwe factuur" onPress={() => openNieuw()} />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {saveError ? (
          <View style={styles.foutBanner}>
            <Text style={styles.foutTekst}>{saveError}</Text>
          </View>
        ) : null}

        <TegelRaster
          breed={breed}
          tegels={[
            { id: 'totaal', label: 'Totaal facturen', waarde: String(kpis.totaal) },
            { id: 'open', label: 'Openstaand', waarde: formatEUR(kpis.openstaand) },
            { id: 'betaald', label: 'Betaald deze maand', waarde: formatEUR(kpis.betaaldDezeMaand), toon: 'goed' },
            { id: 'verlopen', label: 'Verlopen', waarde: String(kpis.verlopen) },
          ]}
        />

        <View style={styles.zoekRij}>
          <AppSearchBar value={zoek} onChange={setZoek} placeholder="Zoek factuur..." />
        </View>
        <View style={{ paddingTop: 12 }}>
          <AppFilterChips
            chips={FACTUUR_FILTERS.map((f) => ({ id: f.id, label: f.label, count: tellingen[f.id] }))}
            active={filter}
            onChange={setFilter}
          />
        </View>

        {items.length === 0 ? (
          <EmptyState
            icon={<Receipt size={40} color={ds.green} strokeWidth={1.6} />}
            title="Geen facturen"
            message={
              magMaken
                ? 'Maak met de plusknop je eerste factuur.'
                : (waaromNiet('facturen', 'maken') ?? 'Er zijn nog geen facturen.')
            }
          />
        ) : zichtbaar.length === 0 ? (
          <EmptyState
            icon={<Receipt size={40} color={ds.green} strokeWidth={1.6} />}
            title="Geen facturen gevonden"
            message="Geen facturen die passen bij je zoekopdracht of filter."
          />
        ) : (
          <>
            <AppSection
              title={filter === 'alle' ? 'Alle facturen' : (FACTUUR_FILTERS.find((f) => f.id === filter)?.label ?? '')}
              count={zichtbaar.length}
              variant="eyebrow"
            />
            <AppListGroup>
              {zichtbaar.map((f, i) => {
                const st = factuurStatusInfo(factuurWeergaveStatus(f, vandaag));
                return (
                  <AppListItem
                    key={f.id}
                    first={i === 0}
                    icon={isGeimporteerd(f) ? Lock : Receipt}
                    title={f.is_credit ? `${f.nummer} · CF` : f.nummer}
                    subtitle={subtitleFor(f, vandaag)}
                    onPress={() => void openDetail(f)}
                    trailing={
                      <View style={styles.trailing}>
                        <Text style={styles.bedrag}>{formatEUR(Number(f.totaal_incl ?? 0))}</Text>
                        <DocumentStatusBadge toon={st.toon} label={st.label} />
                      </View>
                    }
                  />
                );
              })}
            </AppListGroup>
          </>
        )}
      </AppScreen>

      {/* Factuur bekijken */}
      <Paneel
        open={detail !== null}
        titel={detail?.nummer ?? 'Factuur'}
        subtitel={detail?.customer?.name ?? undefined}
        onSluit={() => setDetail(null)}
        voet={
          detail ? (
            <View style={styles.knoppen}>
              {metDocument.has(detail.id) || !detailGeimporteerd ? (
                <Button
                  label={detailGeimporteerd ? 'Origineel document' : 'PDF bekijken'}
                  onPress={() => bekijkPdf(detail)}
                  style={styles.knop}
                />
              ) : null}
              {magBetaald && !detailGeimporteerd && detail.status !== 'betaald' ? (
                <Button
                  label="Markeer als betaald"
                  variant="secondary"
                  disabled={saving}
                  onPress={() => {
                    const f = detail;
                    setDetail(null);
                    betaaldZetten(f);
                  }}
                  style={styles.knop}
                />
              ) : null}
              {magWijzigen ? (
                <Button
                  label="Bewerken"
                  variant="secondary"
                  onPress={() => {
                    const f = detail;
                    setDetail(null);
                    openBewerk(f);
                  }}
                  style={styles.knop}
                />
              ) : null}
              {!detailGeimporteerd ? (
                <Button
                  label="Regels"
                  variant="ghost"
                  onPress={() => {
                    const f = detail;
                    setDetail(null);
                    void openRegels(f);
                  }}
                  style={styles.knop}
                />
              ) : null}
              {magCreditMaken && magCrediteren(detail) ? (
                <Button
                  label="Crediteer factuur"
                  variant="ghost"
                  disabled={saving}
                  onPress={() => crediteren(detail)}
                  style={styles.knop}
                />
              ) : null}
            </View>
          ) : null
        }
      >
        {detail ? (
          <ScrollView contentContainerStyle={styles.detailInhoud} keyboardShouldPersistTaps="handled">
            {detailFout ? <NoticeBanner toon="fout" message={detailFout} /> : null}
            {saveError ? <NoticeBanner toon="fout" message={saveError} /> : null}
            <View>
              <DetailRij label="Klant" waarde={detail.customer?.name ?? 'Geen klant'} />
              <DetailRij
                label="Status"
                waarde={
                  <View style={styles.badgeRij}>
                    {detail.is_credit ? <DocumentStatusBadge toon="red" label="CF" /> : null}
                    {detail.gecrediteerd ? (
                      <DocumentStatusBadge toon="gray" label="Gecrediteerd" />
                    ) : null}
                    <DocumentStatusBadge toon={detailStatus.toon} label={detailStatus.label} />
                  </View>
                }
              />
              <DetailRij label="Factuurdatum" waarde={formatDateNL(detail.factuurdatum)} />
              <DetailRij
                label="Betaaltermijn"
                waarde={
                  detail.vervaldatum
                    ? `${formatDateNL(detail.vervaldatum)}${detailVerlopen ? ' · Te laat' : ''}`
                    : '—'
                }
                toon={detailVerlopen ? 'rood' : undefined}
              />
              {detail.betalingskenmerk ? (
                <DetailRij label="Betalingskenmerk" waarde={detail.betalingskenmerk} />
              ) : null}
              {detail.betaald_op ? (
                <DetailRij label="Betaald op" waarde={formatDateNL(detail.betaald_op)} />
              ) : null}
              {detailData?.herinnering_1_verstuurd_at ? (
                <DetailRij
                  label="Herinnering 1 verstuurd"
                  waarde={formatDateNL(detailData.herinnering_1_verstuurd_at)}
                />
              ) : null}
              {detailData?.herinnering_2_verstuurd_at ? (
                <DetailRij
                  label="Herinnering 2 verstuurd"
                  waarde={formatDateNL(detailData.herinnering_2_verstuurd_at)}
                />
              ) : null}
            </View>

            {detailGeimporteerd ? (
              <NoticeBanner
                toon="info"
                message={
                  metDocument.has(detail.id)
                    ? 'Deze factuur komt uit je boekhouding; het originele document staat hierboven.'
                    : 'Deze factuur komt uit je boekhouding. Er is geen document meegekomen.'
                }
              />
            ) : null}

            <RegelLijst
              laden={detailLaden}
              leegTekst="Deze factuur heeft geen regels."
              regels={detailRegels.map((r) => ({
                id: r.id,
                omschrijving: r.omschrijving,
                meta: regelMeta(r),
                bedrag: r.regelprijs,
              }))}
            />
            {detailTotalen ? <TotalenBlok {...detailTotalen} /> : null}

            {detail.notities ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={styles.label}>Notities</Text>
                <Text style={styles.uitleg}>{alsTekst(detail.notities)}</Text>
              </View>
            ) : null}

            <Text style={styles.uitleg}>
              Versturen per mail en herinneringen sturen doe je in het dashboard.
            </Text>
          </ScrollView>
        ) : null}
        {/* In het paneel, zodat hij op iOS bovenop het paneel opent. */}
        <PdfWeergave document={pdfDoc} onSluit={() => setPdfDoc(null)} />
      </Paneel>

      {/* Factuur aanmaken / bewerken */}
      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Factuur bewerken' : 'Nieuwe factuur'}
        subtitle={concept?.id ? undefined : 'Het nummer wordt automatisch toegekend'}
        error={saveError}
        saving={saving}
        submitDisabled={
          !concept?.id && (!concept?.customerId || (magRegels && nieuweRegels.length === 0))
        }
        onSubmit={opslaan}
        onClose={() => {
          setConcept(null);
          // Geopend vanaf de projectkaart en geannuleerd: terug naar het project.
          const naar = terugNaarProject.current;
          if (naar) {
            terugNaarProject.current = null;
            terugOfNaar(router, `/project/${naar}`);
          }
        }}
        destructive={
          concept?.id && magVerwijderen
            ? { label: 'Factuur verwijderen', onPress: verwijderen }
            : undefined
        }
      >
        {concept?.geimporteerd ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              Deze factuur komt uit je boekhouding. Wijzigen doe je daar; verwijderen kan hier wel
              — hij gaat dan meteen op de negeerlijst zodat de synchronisatie hem niet terughaalt.
            </Text>
          </View>
        ) : concept?.opSlot ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              Deze factuur is verstuurd. De inhoud ligt vast; de betaalstand bijwerken kan wel.
            </Text>
          </View>
        ) : null}

        {concept?.id && concept.status !== 'betaald' && magBetaald ? (
          <Button
            label="Op betaald zetten"
            variant="secondary"
            disabled={saving}
            onPress={() => {
              const f = items.find((x) => x.id === concept.id);
              if (f) {
                setConcept(null);
                betaaldZetten(f);
              }
            }}
          />
        ) : null}

        {concept?.id && concept.status !== 'betaald' && !concept.geimporteerd ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRij}>
              {FACTUUR_STATUS_OPTIES.filter((s) => s.id !== 'betaald').map((s) => {
                const actief = concept.status === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setConcept((c) => (c ? { ...c, status: s.id } : c))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: actief }}
                    aria-pressed={actief}
                    style={[styles.chip, actief && styles.chipActief]}
                  >
                    <Text style={[styles.chipTekst, actief && styles.chipTekstActief]}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Betaald zetten gaat via de knop hierboven: die boekt één keer door naar je
              boekhouding, ook als je twee keer tikt.
            </Text>
          </View>
        ) : null}

        <SelectField
          label="Klant"
          value={concept?.customerId ?? null}
          options={klanten}
          onChange={(id) => setConcept((c) => (c ? { ...c, customerId: id } : c))}
          allowEmpty
          emptyLabel="Geen klant"
          placeholder="Geen klant"
          disabled={concept?.opSlot || concept?.geimporteerd}
        />
        <SelectField
          label="Project"
          value={concept?.projectId ?? null}
          options={projecten}
          onChange={(id) => setConcept((c) => (c ? { ...c, projectId: id } : c))}
          allowEmpty
          emptyLabel="Geen project"
          placeholder="Geen project"
          disabled={concept?.opSlot || concept?.geimporteerd}
        />
        <View style={styles.rij}>
          <View style={{ flex: 1.4 }}>
            <DateField
              label="Factuurdatum"
              value={concept?.factuurdatum || null}
              onChange={(v) => setConcept((c) => (c ? { ...c, factuurdatum: v } : c))}
              placeholder="Kies"
              disabled={concept?.opSlot || concept?.geimporteerd}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Termijn"
              value={concept?.betaaltermijn ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, betaaltermijn: v } : c))}
              placeholder="14"
              keyboardType="number-pad"
              hint="dagen"
              editable={!concept?.opSlot && !concept?.geimporteerd}
            />
          </View>
        </View>
        {/* Regels horen bij het aanmaken: één handeling, één set totalen — net
            als in het dashboard. Bij een bestaande factuur blijven de regels in
            hun eigen blad staan. */}
        {concept && !concept.id && !magRegels ? (
          <NoticeBanner
            toon="waarschuwing"
            message={
              waaromNiet('factuurRegels', 'maken') ??
              'Je mag wel een factuur aanmaken, maar geen regels toevoegen. Vraag een beheerder of planner om de regels te zetten.'
            }
          />
        ) : null}

        {concept && !concept.id && magRegels ? (
          <RegelEditor
            regels={nieuweRegels}
            onChange={setNieuweRegels}
            standaard={{
              uurtarief: instellingen.uurtarief,
              reiskostenPerKm: instellingen.reiskostenPerKm,
              btwPct: instellingen.btwPct,
            }}
            eenheden={eenheden}
          />
        ) : null}

        <FormField
          label="Notities"
          value={concept?.notities ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, notities: v } : c))}
          placeholder="Optioneel"
          multiline
          editable={!concept?.opSlot && !concept?.geimporteerd}
        />
      </FormSheet>

      {/* Factuurregels */}
      <FormSheet
        visible={regelsVoor !== null}
        title="Factuurregels"
        subtitle={regelsVoor?.nummer}
        error={regelFout}
        saving={regelBezig}
        submitLabel="Regel toevoegen"
        submitDisabled={
          !magRegels ||
          regelsOpSlot ||
          !nieuweRegel.omschrijving.trim() ||
          !nieuweRegel.prijs.trim()
        }
        onSubmit={regelToevoegen}
        onClose={() => setRegelsVoor(null)}
      >
        {regelsOpSlot ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              Deze factuur is verstuurd of betaald; de regels liggen vast.
            </Text>
          </View>
        ) : !magRegels ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              {waaromNiet('factuurRegels', 'maken') ??
                'Factuurregels wijzigen kan alleen als beheerder of planner.'}
            </Text>
          </View>
        ) : (
          <>
            <FormField
              label="Omschrijving"
              value={nieuweRegel.omschrijving}
              onChangeText={(v) => setNieuweRegel((r) => ({ ...r, omschrijving: v }))}
              placeholder="Bijv. Arbeidsuren week 37"
            />
            <View style={styles.rij}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Aantal"
                  value={nieuweRegel.aantal}
                  onChangeText={(v) => setNieuweRegel((r) => ({ ...r, aantal: v }))}
                  placeholder="1"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 1.2 }}>
                <FormField
                  label="Prijs"
                  value={nieuweRegel.prijs}
                  onChangeText={(v) => setNieuweRegel((r) => ({ ...r, prijs: v }))}
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={{ flex: 0.9 }}>
                <FormField
                  label="Btw %"
                  value={nieuweRegel.btw}
                  onChangeText={(v) => setNieuweRegel((r) => ({ ...r, btw: v }))}
                  placeholder="21"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </>
        )}

        {regels.length === 0 ? (
          <Text style={styles.uitleg}>Deze factuur heeft nog geen regels.</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {regels.map((r) => (
              <View key={r.id} style={styles.regel}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.regelTitel}>{r.omschrijving}</Text>
                  <Text style={styles.regelMeta}>
                    {r.aantal} × {formatEUR(r.eenheidsprijs)} · {r.btw_pct}% btw
                  </Text>
                </View>
                <Text style={styles.bedrag}>{formatEUR(r.regelprijs)}</Text>
                {magRegelWeg && !regelsOpSlot ? (
                  <Pressable
                    onPress={() => regelVerwijderen(r)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Regel verwijderen"
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
    // Het paneel zelf heeft geen opvulling: de inhoud scrolt en houdt afstand tot de rand.
    detailInhoud: { gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
    trailing: { alignItems: 'flex-end', gap: 4 },
    zoekRij: { paddingHorizontal: 16, paddingTop: 14 },
    knoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    knop: { flexGrow: 1, minWidth: 140, minHeight: 44 },
    badgeRij: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
    bedrag: { fontSize: 14, fontWeight: '700', color: t.ink2 },
    regelKnop: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.bgAlt,
    },
    label: { ...typography.label, color: t.ink2 },
    hint: { fontSize: 12.5, lineHeight: 18, color: t.muted },
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
    slotBanner: { padding: spacing.md, borderRadius: radius.md, backgroundColor: t.statusDraftBg },
    slotTekst: { fontSize: 13, lineHeight: 19, color: t.statusDraftFg, fontWeight: '600' },
    uitleg: { fontSize: 13.5, lineHeight: 19, color: t.muted },
    regel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    regelTitel: { fontSize: 14, fontWeight: '600', color: t.ink },
    regelMeta: { fontSize: 12, color: t.muted, marginTop: 2 },
    foutBanner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.statusRejectBg,
    },
    foutTekst: { fontSize: 13, fontWeight: '600', color: t.statusRejectFg },
    voetnoot: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
    },
  });
