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
import { usePermissions, useTheme, useToast } from '@/providers';
import {
  berekenVervaldatum,
  bewaarFactuurPdf,
  createFactuurRegel,
  deleteFactuur,
  zetFactuurVervallen,
  deleteFactuurRegel,
  FACTUUR_STATUS_OPTIES,
  createCreditFactuur,
  getFactuurDetail,
  getFactuurRegels,
  kopieerFactuur,
  listFacturenMetDocument,
  markeerFactuurVerstuurd,
  factuurRestbedrag,
  standaardBetaaltermijn,
  type FactuurDetail,
  herberekenFactuurTotalen,
  inhoudLigtVast,
  isGeimporteerd,
  listFacturen,
  markeerBetaald,
  updateFactuur,
  uploadFactuurPdf,
  zetHerinneringVerstuurd,
  type FactuurInput,
  type FactuurRegel,
  type FactuurRow,
  createFactuur,
  createFactuurMetRegels,
} from '@/services/factuurService';
import { getOfferteDetail, getOfferteItems } from '@/services/offerteService';
import { listCustomers } from '@/services/customerService';
import { listProjects, type ProjectRow } from '@/services/projectService';
import { getCompanySettings } from '@/services/settingsService';
import { listEigenEenheden } from '@/services/eigenEenheidService';
import {
  getBedrijfVoorDocument,
  getMailSjabloon,
  logVerstuurdeMail,
  maakBetaallink,
  stripeActief,
  verstuurMail,
} from '@/services/documentMailService';
import { logTijdlijn } from '@/services/klantTijdlijnService';
import { berekenTotalen, legeRegel, type EigenEenheid, type Regel } from '@/lib/regels';
import { factuurRegelVoorOpslag, regelUitOfferteItem } from '@/lib/regelOmzetting';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { writeFout, type WriteResult } from '@/lib/writeResult';
import { vandaagIso } from '@/lib/nlTijd';
import { formatDateNL, formatEUR, formatEURCent } from '@/lib/format';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { alsTekst } from '@/lib/notitieTekst';
import { useSchermklasse } from '@/lib/schermklasse';
import {
  binnenLimiet,
  documentTotalen,
  FACTUUR_FILTERS,
  factuurHerinneringen,
  factuurKpis,
  factuurStatusInfo,
  factuurStatusWeigering,
  factuurWeergaveStatus,
  filterFacturen,
  gedeeltelijkeCreditRegels,
  isFactuurVerlopen,
  magCrediteren,
  magFactuurVerwijderen,
  telFactuurFilters,
  wordtDefinitief,
  type FactuurFilter,
} from '@/lib/documentLogica';
import {
  bedrijfSnapshot,
  FACTUUR_MAIL_TITEL,
  factuurMailConcept,
  factuurMailHtml,
  type FactuurMailSoort,
} from '@/lib/documentMail';
import { maakFactuurPdf } from '@/lib/pdf';
import { bedrijfVoorDocument, naarFactuur, type PdfBedrijf } from '@/lib/pdf/pdfData';
import type { Customer } from '@/types/domain';
import { Paneel } from '@/components/Paneel';
import { PdfWeergave, type PdfDocument } from '@/components/PdfWeergave';
import { DocumentMailSheet, type MailConcept } from '@/components/DocumentMailSheet';
import { Keuze, Schakel } from '@/components/instellingen/Bouwstenen';
import {
  DetailRij,
  DocumentStatusBadge,
  RegelLijst,
  TegelRaster,
  TotalenBlok,
} from '@/components/DocumentOnderdelen';
import { useOnthouden } from '@/lib/useOnthouden';
import { getalOfNul } from '@/lib/getalNl';

/**
 * Facturen — dezelfde `facturen` + `factuur_regels` als het dashboard.
 *
 * Gelijk aan de facturenpagina van het dashboard: KPI's (Totaal, Openstaand,
 * Betaald deze maand, Verlopen), filtertabs (Alle/Concept/Verzonden/Betaald/
 * Verlopen/Gecrediteerd), zoeken op nummer en klant, "Te laat" als de
 * vervaldatum verstreken is, CF-badge voor creditfacturen en "Gecrediteerd".
 * De detailweergave heeft de acties van het dashboard, met dezelfde
 * voorwaarden:
 *
 * - **Versturen per mail** (`SendFactuurMailModal`): sjabloon `factuur`, de PDF
 *   als bijlage (en bewaard in `factuur-pdfs`), met de feature
 *   `stripe_betaallink` een iDEAL-betaalknop, archief, tijdlijn, en bij een
 *   concept status verzonden + bevroren bedrijfsgegevens met IBAN.
 * - **Herinnering 1 en 2** bij een te late factuur (feature
 *   `betaalherinneringen`): sjabloon `herinnering_1/2`, zet
 *   `herinnering_N_verstuurd_at` en een tijdlijnregel.
 * - **Crediteren**, volledig of per regel (aantal en prijs aanpasbaar).
 * - **Kopiëren naar nieuwe factuur**: een losse conceptfactuur.
 * - **Verwijderen** alleen bij een concept of een factuur uit de boekhouding.
 * - Wordt een factuur definitief (verzonden of betaald, of gemaild), dan
 *   wordt de PDF bewaard voor de Stripe-webhook en de boekhoudkoppeling.
 *
 * Betaald zetten loopt via de RPC `mark_factuur_betaald`, precies de route die
 * de Stripe-webhook ook gebruikt. Die is idempotent en geeft terug óf er iets
 * veranderd is; alleen dan gaat de factuur naar de boekhouding.
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
  /** Bij "Maak factuur" vanuit een offerte: die offerte (kolom offerte_id). */
  offerteId: string | null;
  factuurdatum: string;
  betaaltermijn: string;
  vervaldatum: string;
  /** Zelf gekozen vervaldatum: blijft staan als datum of termijn verandert. */
  vervalHandmatig: boolean;
  betalingskenmerk: string;
  notities: string;
  status: string;
  /** De status zoals hij geopend werd; voor de PDF bij een overgang. */
  oudeStatus: string;
  opSlot: boolean;
  geimporteerd: boolean;
  regels: Regel[];
};

type RegelConcept = { omschrijving: string; aantal: string; prijs: string; btw: string };

const LEGE_REGEL: RegelConcept = { omschrijving: '', aantal: '1', prijs: '', btw: '21' };

type MailStand = {
  factuur: FactuurRow;
  soort: FactuurMailSoort;
  laden: boolean;
  concept: MailConcept;
  bedrijf: PdfBedrijf | null;
};

type CreditKeuze = { regel: FactuurRegel; gekozen: boolean; aantal: string; prijs: string };
type CreditStand = {
  factuur: FactuurRow;
  regels: FactuurRegel[];
  modus: 'kies' | 'volledig' | 'gedeeltelijk';
  keuzes: CreditKeuze[];
};

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
  return `${String(r.aantal).replace('.', ',')} × ${formatEURCent(r.eenheidsprijs)} · ${btw}`;
}

/** Ontbrekende klantgegevens voor een factuur (`missingFields` in NewFactuurModal). */
function ontbrekendeKlantgegevens(k: Customer | undefined): string[] {
  if (!k) return [];
  return [!k.address && 'adres', !k.city && 'plaats', !k.email && 'e-mailadres'].filter(
    (x): x is string => Boolean(x),
  );
}

function InvoicesScreenInhoud() {
  const router = useRouter();
  // `?nieuw=1&klant=&project=` opent meteen een nieuwe factuur voor dat
  // project — de plusknop op de projectkaart (`prefill` van de dashboardmodal).
  // Na opslaan of annuleren gaat het terug naar het project.
  const {
    id: openId,
    vanOfferte,
    nieuw: nieuwParam,
    klant: klantParam,
    project: projectParam,
  } = useLocalSearchParams<{ id?: string; vanOfferte?: string; nieuw?: string; klant?: string; project?: string }>();
  const terugNaarProject = useRef<string | null>(null);
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, can, waaromNiet, hasFeature, planStatus } = usePermissions();
  const { toonResultaat } = useToast();
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
  const [klantenLijst, setKlantenLijst] = useState<Customer[]>([]);
  const [projectenLijst, setProjectenLijst] = useState<ProjectRow[]>([]);
  const [instellingen, setInstellingen] = useState({
    uurtarief: 55,
    reiskostenPerKm: 0.23,
    btwPct: 21,
  });
  const [eenheden, setEenheden] = useState<EigenEenheid[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [concept, setConcept] = useState<Concept | null>(null);
  const [regelsVoor, setRegelsVoor] = useState<FactuurRow | null>(null);
  const [regels, setRegels] = useState<FactuurRegel[]>([]);
  const [nieuweRegel, setNieuweRegel] = useState<RegelConcept>(LEGE_REGEL);
  const [mail, setMail] = useState<MailStand | null>(null);
  const [credit, setCredit] = useState<CreditStand | null>(null);

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveRegel, saving: regelBezig, error: regelFout } = useSave<unknown>();
  const { save: saveMail, saving: mailBezig, error: mailFout, setError: setMailFout } = useSave<unknown>();
  const { save: saveCredit, saving: creditBezig, error: creditFout, setError: setCreditFout } = useSave<unknown>();

  const magMaken = mag('facturen', 'maken');
  const magWijzigen = mag('facturen', 'wijzigen');
  const magVerwijderen = mag('facturen', 'verwijderen');
  const magBetaald = mag('facturen', 'betaaldZetten');
  const magRegels = mag('factuurRegels', 'maken');
  const magRegelWeg = mag('factuurRegels', 'verwijderen');
  const kanHerinneren = hasFeature('betaalherinneringen');
  const kanBetaallink = hasFeature('stripe_betaallink');

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
    if (!klantRes.error) setKlantenLijst(klantRes.data);
    if (!projRes.error) setProjectenLijst(projRes.data);
    // Standaardtarieven en eigen eenheden: dezelfde bron als de factuurmodal
    // van het dashboard gebruikt om een nieuwe regel voor te vullen.
    if (!instRes.error) {
      setInstellingen({
        uurtarief: instRes.data.uurtarief,
        reiskostenPerKm: instRes.data.reiskosten_per_km,
        btwPct: instRes.data.btw_pct,
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

  const klanten: SelectOption[] = useMemo(
    () =>
      klantenLijst
        .map((k) => ({ id: k.id, label: k.name ?? 'Klant' }))
        .sort((a, b) => a.label.localeCompare(b.label, 'nl')),
    [klantenLijst],
  );

  /**
   * Detailweergave (`ViewFactuurModal`). Regels, klant- en bedrijfsgegevens en
   * herinneringen worden bij het openen opgehaald.
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
   * Bekijken (`PdfWeergave`), zoals de paperclip in het dashboard: het
   * bewaarde bestand als dat er is (wat de klant kreeg, of het origineel uit
   * de boekhouding), anders dezelfde PDF die het dashboard opbouwt.
   */
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const bekijkPdf = (f: FactuurRow) =>
    setPdfDoc({ soort: 'factuur', id: f.id, titel: `Factuur ${f.nummer ?? ''}`.trim(), opgeslagenEerst: true });

  // ── Nieuw / bewerken ──────────────────────────────────────────────────────

  /** `guardLimiet('facturen', …)`: binnen de factuurlimiet van deze periode? */
  const limietBereikt = () => {
    if (binnenLimiet(planStatus?.limits, 'facturen')) return false;
    Dialog.alert(
      'Factuurlimiet bereikt',
      'Je factuurlimiet voor deze periode is bereikt. Je abonnement bekijk je bij Instellingen → Abonnement.',
    );
    return true;
  };

  /**
   * Een nieuwe factuur, eventueel met klant en regels vooraf ingevuld (vanuit
   * een geaccepteerde offerte). De betaaltermijn is die van de klant, anders
   * die uit Instellingen, anders 14 dagen; de vervaldatum volgt daaruit.
   */
  const openNieuw = (prefill?: {
    customerId: string | null;
    projectId?: string | null;
    offerteId?: string | null;
    regels?: Regel[];
  }) => {
    if (limietBereikt()) return;
    setSaveError(null);
    const factuurdatum = vandaagIso();
    setConcept({
      id: null,
      customerId: prefill?.customerId ?? null,
      projectId: prefill?.projectId ?? null,
      offerteId: prefill?.offerteId ?? null,
      factuurdatum,
      betaaltermijn: '14',
      vervaldatum: berekenVervaldatum(factuurdatum, 14),
      vervalHandmatig: false,
      betalingskenmerk: '',
      notities: '',
      status: 'concept',
      oudeStatus: 'concept',
      opSlot: false,
      geimporteerd: false,
      regels: prefill?.regels?.length
        ? prefill.regels
        : [legeRegel({ uurtarief: instellingen.uurtarief, btwPct: instellingen.btwPct })],
    });
    void zetTermijn(prefill?.customerId ?? null);
  };

  /** Termijn van de klant (of het bedrijf) ophalen en de vervaldatum bijwerken. */
  const zetTermijn = async (customerId: string | null) => {
    const termijn = await standaardBetaaltermijn(customerId);
    setConcept((c) =>
      c && !c.id && c.customerId === customerId
        ? {
            ...c,
            betaaltermijn: String(termijn),
            vervaldatum: c.vervalHandmatig ? c.vervaldatum : berekenVervaldatum(c.factuurdatum, termijn),
          }
        : c,
    );
  };

  // "Maak factuur" vanuit een geaccepteerde offerte: /invoices?vanOfferte=<id>
  const offerteVerwerkt = useRef<string | null>(null);
  useEffect(() => {
    if (!vanOfferte || loading || !rechtenGeladen || offerteVerwerkt.current === vanOfferte) return;
    offerteVerwerkt.current = vanOfferte;
    router.setParams({ vanOfferte: undefined });
    void (async () => {
      const [o, r] = await Promise.all([getOfferteDetail(vanOfferte), getOfferteItems(vanOfferte)]);
      if (!o.data) {
        Dialog.alert('Offerte niet gevonden', o.error ?? 'De offerte kon niet worden geladen.');
        return;
      }
      openNieuw({
        customerId: o.data.customer_id,
        offerteId: o.data.id,
        regels: r.data.map((it) => regelUitOfferteItem(it, o.data!)),
      });
    })();
    // openNieuw hangt af van state die hier niet hoort te herstarten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vanOfferte, loading, rechtenGeladen, router]);

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
      offerteId: null,
      factuurdatum: f.factuurdatum,
      betaaltermijn: String(f.betaaltermijn_dagen ?? 14),
      vervaldatum: f.vervaldatum ?? '',
      vervalHandmatig: true,
      betalingskenmerk: f.betalingskenmerk ?? '',
      notities: f.notities ?? '',
      status: f.status,
      oudeStatus: f.status,
      opSlot: inhoudLigtVast(f),
      geimporteerd: isGeimporteerd(f),
      regels: [],
    });
  };

  const opslaan = (enVersturen = false) => {
    if (!concept) return;
    const c = concept;
    const termijn = Number(c.betaaltermijn || 14);
    save(
      async (): Promise<WriteResult<FactuurRow>> => {
        if (c.id) {
          const invoer: Partial<FactuurInput> & { status?: string } =
            c.opSlot || c.geimporteerd
              ? { status: c.status === 'betaald' ? undefined : c.status }
              : {
                  customer_id: c.customerId,
                  project_id: c.projectId,
                  factuurdatum: c.factuurdatum,
                  betaaltermijn_dagen: termijn,
                  vervaldatum: c.vervaldatum || null,
                  betalingskenmerk: c.betalingskenmerk,
                  notities: c.notities,
                  ...(c.status !== 'betaald' ? { status: c.status } : {}),
                };
          const res = await updateFactuur(c.id, invoer);
          // Handmatig op verzonden zetten maakt de factuur net zo definitief
          // als mailen: dan de PDF bewaren (EditFactuurModal).
          if (res.ok && wordtDefinitief(c.oudeStatus, res.data.status)) await bewaarFactuurPdf(res.data.id);
          return res;
        }
        // Onvolledige klant: het dashboard maakt de factuur dan niet aan.
        const ontbreekt = ontbrekendeKlantgegevens(klantenLijst.find((k) => k.id === c.customerId));
        if (ontbreekt.length > 0) {
          return writeFout('validatie', 'Vul eerst de klantgegevens aan voordat je een factuur aanmaakt.');
        }
        const invoer: FactuurInput = {
          customer_id: c.customerId,
          project_id: c.projectId,
          factuurdatum: c.factuurdatum,
          betaaltermijn_dagen: termijn,
          vervaldatum: c.vervaldatum || null,
          notities: c.notities,
        };
        // Nieuwe factuur: kop én regels in één transactie, zoals het dashboard.
        if (!magRegels) return createFactuur(invoer);
        const totalen = berekenTotalen(c.regels);
        const res = await createFactuurMetRegels(
          { ...invoer, offerte_id: c.offerteId, totaal_excl: totalen.excl, totaal_incl: totalen.incl },
          c.regels.map((r) => factuurRegelVoorOpslag(r, eenheden)),
        );
        return res.ok ? { ok: true, data: res.data.factuur } : res;
      },
      {
        onSuccess: async (data) => {
          const f = data as FactuurRow;
          setConcept(null);
          const naar = terugNaarProject.current;
          if (!c.id && naar) {
            terugNaarProject.current = null;
            terugOfNaar(router, `/project/${naar}`);
            return;
          }
          await herlaad();
          if (enVersturen) void openMail(f, 'factuur');
        },
        succesMelding: c.id ? 'Factuur opgeslagen' : 'Factuur aangemaakt',
      },
    );
  };

  /**
   * Betaald zetten. De RPC vertelt of er echt iets veranderd is; stond de
   * factuur al op betaald, dan zeggen we dat en doen we niet alsof. Een
   * concept zonder regels mag niet op betaald (statusWeigering).
   */
  const betaaldZetten = async (f: FactuurRow) => {
    if (!magBetaald) return;
    const { data: r } = await getFactuurRegels(f.id);
    const weigering = factuurStatusWeigering(f, 'betaald', r.length);
    if (weigering) {
      Dialog.alert('Niet op betaald gezet', weigering);
      return;
    }
    Dialog.alert(
      'Factuur op betaald zetten?',
      `${f.nummer} · ${formatEURCent(Number(f.totaal_incl ?? 0))}`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Betaald',
          onPress: () => {
            save(
              async () => {
                const res = await markeerBetaald(f.id);
                if (res.ok && res.data.gewijzigd && wordtDefinitief(f.status, 'betaald')) {
                  await bewaarFactuurPdf(f.id);
                }
                return res;
              },
              {
                onSuccess: async (res) => {
                  const uitkomst = res as { gewijzigd: boolean };
                  if (!uitkomst.gewijzigd) {
                    Dialog.alert('Geen wijziging', 'Deze factuur stond al op betaald.');
                  }
                  await herlaad();
                },
                succesMelding: 'Factuur op betaald gezet',
              },
            );
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
        save(async () => {
          const r = await deleteFactuur(id);
          if (!r.ok && r.technisch === 'vervallen_ipv_verwijderen') setTimeout(() => vraagVervallen(id), 0);
          return r;
        }, {
          onSuccess: async (_data, extra) => {
            setConcept(null);
            // De factuur is weg; lukte de prullenbak niet, dan komt hij bij de
            // volgende synchronisatie terug en moet de gebruiker dat weten.
            if (typeof extra?.waarschuwing === 'string') Dialog.alert('Let op', extra.waarschuwing);
            await herlaad();
          },
          succesMelding: 'Factuur verwijderd',
        });
      },
      uitBoekhouding
        ? 'Deze factuur komt uit je boekhouding. Hij wordt ook op de negeerlijst gezet, zodat de volgende synchronisatie hem niet terughaalt.'
        : 'Dit kan niet ongedaan worden gemaakt.',
    );
  };

  // Een ouder concept kan niet weg (gat in de nummering): op Vervallen zetten.
  const vraagVervallen = (id: string) =>
    Dialog.alert(
      'Op Vervallen zetten?',
      'Deze factuur heeft al een nummer in de reeks. Op Vervallen blijft hij in de lijst staan, telt nergens meer mee en kan niet meer worden verstuurd.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Op Vervallen zetten',
          style: 'destructive',
          onPress: () =>
            save(() => zetFactuurVervallen(id), {
              onSuccess: async () => {
                setConcept(null);
                await herlaad();
              },
              succesMelding: 'Factuur op Vervallen gezet',
            }),
        },
      ],
    );

  // ── Regels van een concept ────────────────────────────────────────────────

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
          aantal: getalOfNul(nieuweRegel.aantal),
          eenheidsprijs: getalOfNul(nieuweRegel.prijs),
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

  // ── Versturen per mail en herinneringen ───────────────────────────────────

  /**
   * Het mailvenster openen, zoals `SendFactuurMailModal`: het sjabloon van
   * deze soort, het adres van de klant, het rekeningnummer van de factuur
   * (bevroren, anders dat van het bedrijf) en met een actieve Stripe-koppeling
   * de betaalinstructie voor online betalen.
   */
  const openMail = async (f: FactuurRow, soort: FactuurMailSoort) => {
    setMailFout(null);
    setMail({ factuur: f, soort, laden: true, concept: { aan: '', onderwerp: '', tekst: '' }, bedrijf: null });
    const [d, sjabloon, bedrijf, stripe] = await Promise.all([
      getFactuurDetail(f.id),
      getMailSjabloon(soort),
      getBedrijfVoorDocument(),
      kanBetaallink ? stripeActief() : Promise.resolve(false),
    ]);
    const doc = d.data;
    const docBedrijf = doc ? bedrijfVoorDocument(naarFactuur(doc as unknown as Record<string, unknown>), bedrijf) : bedrijf;
    // Een factuur zonder rekeningnummer gaat niet de deur uit: de klant weet dan
    // niet waar hij moet betalen (audit 2026-10-25, G-05). Creditnota's wel. De
    // database weigert het daarna ook, net als in het dashboard.
    if (soort === 'factuur' && !f.is_credit && !String(docBedrijf?.iban ?? '').trim()) {
      setMail(null);
      const magInstellingen = can('instellingen');
      Dialog.alert(
        'IBAN ontbreekt',
        'Deze factuur kan nog niet weg: het IBAN van je bedrijf ontbreekt. Zonder rekeningnummer weet je klant niet waar hij moet betalen. '
          + (magInstellingen
            ? 'Vul het IBAN in bij Instellingen › Bedrijfsprofiel en verstuur de factuur daarna opnieuw.'
            : 'Vraag een beheerder om het IBAN in te vullen bij Instellingen › Bedrijfsprofiel.'),
        magInstellingen
          ? [
              { text: 'Annuleren', style: 'cancel' },
              { text: 'Naar Bedrijfsprofiel', onPress: () => router.push('/settings?tab=bedrijf') },
            ]
          : [{ text: 'OK' }],
      );
      return;
    }
    const tekst = factuurMailConcept({
      sjabloon: sjabloon.error ? null : sjabloon.data,
      klantNaam: doc?.customer?.name ?? f.customer?.name,
      bedrijfsnaam: bedrijf?.name,
      nummer: f.nummer,
      // Een herinnering vraagt wat er nog openstaat, niet het factuurtotaal.
      totaalIncl:
        soort === 'factuur' || f.is_credit
          ? (doc?.totaal_incl ?? f.totaal_incl)
          : await factuurRestbedrag(f.id, Number(doc?.totaal_incl ?? f.totaal_incl ?? 0)),
      vervaldatum: doc?.vervaldatum ?? f.vervaldatum,
      betalingskenmerk: doc?.betalingskenmerk ?? f.betalingskenmerk,
      isCredit: Boolean(f.is_credit),
      iban: docBedrijf?.iban,
      ibanTnv: docBedrijf?.ibanTnv,
      documentBedrijfsnaam: docBedrijf?.name,
      stripeActief: stripe,
    });
    setMail((m) =>
      m && m.factuur.id === f.id
        ? {
            ...m,
            factuur: doc ? { ...f, status: doc.status } : f,
            laden: false,
            concept: { aan: doc?.customer?.email ?? '', onderwerp: tekst.onderwerp, tekst: tekst.tekst },
            bedrijf,
          }
        : m,
    );
    if (d.error) setMailFout(d.error);
  };

  /** Herinnering 1 vraagt de feature; zonder: uitleg in plaats van het venster (guardFeature). */
  const openHerinnering = (f: FactuurRow, nr: 1 | 2) => {
    if (!kanHerinneren) {
      Dialog.alert(
        'Betaalherinneringen',
        'Betaalherinneringen versturen zit niet in je huidige abonnement. Je abonnement wijzig je op het dashboard.',
      );
      return;
    }
    void openMail(f, nr === 1 ? 'herinnering_1' : 'herinnering_2');
  };

  const verstuurFactuur = () => {
    if (!mail) return;
    const m = mail;
    const f = m.factuur;
    const aan = m.concept.aan.trim();
    saveMail(
      async (): Promise<WriteResult<null>> => {
        if (!aan) return writeFout('validatie', 'E-mailadres is verplicht.');
        // De PDF als bijlage, en dezelfde PDF bewaren vóór het op verzonden
        // zetten: de boekhoudsync die daarop volgt moet hem kunnen vinden.
        let bijlagen: { filename: string; content: string }[] = [];
        try {
          const pdf = await maakFactuurPdf(f.id);
          bijlagen = [{ filename: `Factuur-${f.nummer}.pdf`, content: pdf.base64 }];
          await uploadFactuurPdf(f.id, f.company_id, pdf.bytes);
        } catch (e) {
          console.warn('[invoices] PDF-bijlage maken mislukt', e);
        }
        // Betaallink alleen met de feature; de Edge Function beslist verder
        // zelf (koppeling actief, bedrag > 0). Geen link = mail zonder knop.
        const betaalUrl = kanBetaallink ? await maakBetaallink(f.id) : null;
        const html = factuurMailHtml({
          onderwerp: m.concept.onderwerp,
          tekst: m.concept.tekst,
          betaalUrl,
          bedrijfsnaam: m.bedrijf?.name,
          logoUrl: m.bedrijf?.logoUrl,
          merkkleur: m.bedrijf?.brandingColor,
        });
        const verstuurd = await verstuurMail({ to: aan, subject: m.concept.onderwerp, html, attachments: bijlagen, soort: 'factuur', gerelateerdId: f.id });
        if (!verstuurd.ok) return writeFout('onbekend', verstuurd.melding);

        await logVerstuurdeMail({
          toEmail: aan,
          subject: m.concept.onderwerp,
          bodyHtml: html,
          relatedType: 'factuur',
          relatedId: f.id,
          customerId: f.customer_id,
        });

        let bijwerken: WriteResult<FactuurRow> | null = null;
        if (m.soort === 'factuur' && (f.status === 'concept' || f.status === 'aangemaakt')) {
          bijwerken = await markeerFactuurVerstuurd(f.id, bedrijfSnapshot(m.bedrijf, { metIban: true }));
        }
        if (m.soort === 'herinnering_1') bijwerken = await zetHerinneringVerstuurd(f, 1);
        if (m.soort === 'herinnering_2') bijwerken = await zetHerinneringVerstuurd(f, 2);
        if (m.soort === 'factuur') {
          void logTijdlijn(f.customer_id, 'email_verstuurd', `E-mail verstuurd: ${m.concept.onderwerp}`, {
            to: aan,
            subject: m.concept.onderwerp,
          });
        }
        if (bijwerken && !bijwerken.ok) {
          return writeFout('onbekend', `De e-mail is verstuurd, maar de factuur is niet bijgewerkt: ${bijwerken.melding}`);
        }
        return { ok: true, data: null };
      },
      {
        onSuccess: async () => {
          setMail(null);
          await herlaad();
        },
        succesMelding: 'E-mail verstuurd',
      },
    );
  };

  // ── Kopiëren ──────────────────────────────────────────────────────────────

  /** `handleKopieer`: een nieuwe conceptfactuur, daarna meteen bewerken. */
  const kopieren = (f: FactuurRow) => {
    save(() => kopieerFactuur(f.id), {
      onSuccess: async (data) => {
        const nieuw = data as FactuurRow;
        setDetail(null);
        toonResultaat({ ok: true, data: null }, `Factuur ${nieuw.nummer} aangemaakt als concept`);
        await herlaad();
        openBewerk(nieuw);
      },
    });
  };

  // ── Crediteren ────────────────────────────────────────────────────────────

  const openCredit = async (f: FactuurRow) => {
    setCreditFout(null);
    const { data, error: fout } = await getFactuurRegels(f.id);
    if (fout) {
      Dialog.alert('Regelitems laden mislukt', fout);
      return;
    }
    setCredit({
      factuur: f,
      regels: data,
      modus: 'kies',
      keuzes: data.map((r) => ({
        regel: r,
        gekozen: true,
        aantal: String(r.aantal).replace('.', ','),
        prijs: String(Math.abs(Number(r.eenheidsprijs))).replace('.', ','),
      })),
    });
  };

  const crediteren = () => {
    if (!credit || credit.modus === 'kies') return;
    const c = credit;
    saveCredit(
      async () => {
        if (c.modus === 'volledig') return createCreditFactuur(c.factuur.id);
        const keuze = gedeeltelijkeCreditRegels(c.keuzes);
        if (!keuze.ok) return writeFout('validatie', keuze.melding);
        return createCreditFactuur(c.factuur.id, keuze.regels);
      },
      {
        onSuccess: async (res) => {
          const cf = res as FactuurRow;
          setCredit(null);
          toonResultaat({ ok: true, data: null }, `Creditfactuur ${cf.nummer} aangemaakt`);
          await herlaad();
        },
      },
    );
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

  // De acties van de detailweergave, met de voorwaarden van het dashboard.
  // Eén primaire actie die de status volgt; de rest daaronder.
  type Actie = { id: string; label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' };
  const acties: Actie[] = [];
  if (detail) {
    const f = detail;
    const sluitEn = (doe: () => void) => () => {
      setDetail(null);
      doe();
    };
    const magMailen = magWijzigen && !detailGeimporteerd;
    const herinnering = factuurHerinneringen(
      {
        ...f,
        herinnering_1_verstuurd_at: detailData?.herinnering_1_verstuurd_at ?? f.herinnering_1_verstuurd_at,
        herinnering_2_verstuurd_at: detailData?.herinnering_2_verstuurd_at ?? f.herinnering_2_verstuurd_at,
      },
      vandaag,
      kanHerinneren,
    );
    const isConcept = ['concept', 'aangemaakt'].includes(f.status);
    const mailActie: Actie = { id: 'mail', label: 'Verstuur per mail', onPress: sluitEn(() => void openMail(f, 'factuur')) };
    const h1: Actie = { id: 'h1', label: 'Herinnering sturen', onPress: sluitEn(() => openHerinnering(f, 1)) };
    const h2: Actie = { id: 'h2', label: 'Tweede herinnering', onPress: sluitEn(() => openHerinnering(f, 2)) };
    const betaald: Actie = { id: 'betaald', label: 'Markeer als betaald', onPress: sluitEn(() => void betaaldZetten(f)) };
    const magBetaaldHier = magBetaald && !detailGeimporteerd && f.status !== 'betaald';

    let primair: Actie | null = null;
    if (!detailGeimporteerd) {
      if (magMailen && herinnering.eerste) primair = h1;
      else if (magMailen && herinnering.tweede) primair = h2;
      else if (magMailen && isConcept) primair = mailActie;
      else if (magBetaaldHier && f.status === 'verzonden') primair = betaald;
      else if (magMailen) primair = mailActie;
    }
    if (primair) acties.push({ ...primair, variant: 'primary' });
    if (metDocument.has(f.id) || !detailGeimporteerd) {
      acties.push({
        id: 'pdf',
        label: detailGeimporteerd ? 'Origineel document' : 'Bekijken',
        onPress: () => bekijkPdf(f),
        variant: detailGeimporteerd ? 'primary' : 'secondary',
      });
    }
    if (magMailen && primair?.id !== 'mail') acties.push({ ...mailActie, variant: 'secondary' });
    if (magMailen && herinnering.eerste && primair?.id !== 'h1') acties.push({ ...h1, label: 'Herinnering 1 sturen', variant: 'secondary' });
    if (magMailen && herinnering.tweede && primair?.id !== 'h2') acties.push({ ...h2, label: 'Herinnering 2 sturen', variant: 'secondary' });
    if (magBetaaldHier && primair?.id !== 'betaald') acties.push({ ...betaald, variant: 'secondary' });
    if (magWijzigen) {
      acties.push({
        id: 'bewerk',
        label: inhoudLigtVast(f) || detailGeimporteerd ? 'Status wijzigen' : 'Bewerken',
        onPress: sluitEn(() => openBewerk(f)),
        variant: 'secondary',
      });
    }
    if (!detailGeimporteerd && !inhoudLigtVast(f)) {
      acties.push({ id: 'regels', label: 'Regels', onPress: sluitEn(() => void openRegels(f)), variant: 'ghost' });
    }
    if (magMaken && !detailGeimporteerd) {
      acties.push({ id: 'kopie', label: 'Kopiëren naar nieuwe factuur', onPress: () => kopieren(f), variant: 'ghost' });
    }
    if (magCreditMaken && magCrediteren(f)) {
      acties.push({ id: 'credit', label: 'Crediteer factuur', onPress: sluitEn(() => void openCredit(f)), variant: 'ghost' });
    }
  }

  const regelsOpSlot = regelsVoor ? inhoudLigtVast(regelsVoor) : false;
  const conceptKlant = concept ? klantenLijst.find((k) => k.id === concept.customerId) : undefined;
  const ontbreekt = concept && !concept.id ? ontbrekendeKlantgegevens(conceptKlant) : [];
  const projectOpties: SelectOption[] = projectenLijst
    .filter((p) => !concept?.customerId || p.customer_id === concept.customerId)
    .map((p) => ({ id: p.id, label: p.name ?? 'Project' }));
  const conceptBron = concept?.id ? items.find((x) => x.id === concept.id) : undefined;
  const conceptMagWeg = Boolean(concept?.id) && magVerwijderen && (conceptBron ? magFactuurVerwijderen(conceptBron) : false);
  const nieuwOngeldig =
    !concept?.id && (!concept?.customerId || (magRegels && (concept?.regels.length ?? 0) === 0) || ontbreekt.length > 0);

  const creditTotaal =
    credit?.modus === 'gedeeltelijk'
      ? credit.keuzes
          .filter((k) => k.gekozen)
          .reduce(
            (s, k) =>
              s + getalOfNul(k.aantal) * Math.abs(getalOfNul(k.prijs)),
            0,
          )
      : null;

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
        {saveError && !concept ? (
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
                        <Text style={styles.bedrag}>{formatEURCent(Number(f.totaal_incl ?? 0))}</Text>
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
              {acties.map((a) => (
                <Button
                  key={a.id}
                  label={a.label}
                  variant={a.variant}
                  disabled={saving}
                  onPress={a.onPress}
                  style={styles.knop}
                />
              ))}
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
                label="Vervaldatum"
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
                    ? 'Deze factuur komt uit je boekhouding; het originele document staat hieronder.'
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
                <Text style={styles.label}>{detail.is_credit ? 'Toelichting' : 'Interne notitie'}</Text>
                <Text style={styles.uitleg}>{alsTekst(detail.notities)}</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}
        {/* In het paneel, zodat hij op iOS bovenop het paneel opent. */}
        <PdfWeergave document={pdfDoc} onSluit={() => setPdfDoc(null)} />
      </Paneel>

      {/* Factuur aanmaken / bewerken */}
      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Factuur bewerken' : 'Nieuwe factuur'}
        subtitle={concept?.id ? (conceptBron?.nummer ?? undefined) : 'Het nummer wordt automatisch toegekend'}
        error={saveError}
        saving={saving}
        submitDisabled={nieuwOngeldig}
        onSubmit={() => opslaan(false)}
        onClose={() => {
          setConcept(null);
          // Geopend vanaf de projectkaart en geannuleerd: terug naar het project.
          const naar = terugNaarProject.current;
          if (naar) {
            terugNaarProject.current = null;
            terugOfNaar(router, `/project/${naar}`);
          }
        }}
        destructive={conceptMagWeg ? { label: 'Factuur verwijderen', onPress: verwijderen } : undefined}
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
              Klopt er iets niet, crediteer hem dan en maak een nieuwe.
            </Text>
          </View>
        ) : null}

        {concept?.id && concept.status !== 'betaald' && magBetaald && !concept.geimporteerd ? (
          <Button
            label="Op betaald zetten"
            variant="secondary"
            disabled={saving}
            onPress={() => {
              const f = items.find((x) => x.id === concept.id);
              if (f) {
                setConcept(null);
                void betaaldZetten(f);
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
          onChange={(id) => {
            setConcept((c) => (c ? { ...c, customerId: id, projectId: null } : c));
            if (concept && !concept.id) void zetTermijn(id);
          }}
          allowEmpty
          emptyLabel="Geen klant"
          placeholder="Selecteer klant"
          disabled={concept?.opSlot || concept?.geimporteerd}
        />
        {ontbreekt.length > 0 ? (
          <NoticeBanner
            toon="waarschuwing"
            title="Klantgegevens onvolledig"
            message={`Ontbrekend: ${ontbreekt.join(', ')}. Vul eerst de klantgegevens aan voordat je een factuur aanmaakt.`}
          />
        ) : null}
        {projectOpties.length > 0 || concept?.projectId ? (
          <SelectField
            label="Project (optioneel)"
            value={concept?.projectId ?? null}
            options={projectOpties}
            onChange={(id) => setConcept((c) => (c ? { ...c, projectId: id } : c))}
            allowEmpty
            emptyLabel="Geen project"
            placeholder="Geen project"
            disabled={concept?.opSlot || concept?.geimporteerd}
          />
        ) : null}
        <View style={styles.rij}>
          <View style={{ flex: 1.4 }}>
            <DateField
              label="Factuurdatum"
              value={concept?.factuurdatum || null}
              onChange={(v) =>
                setConcept((c) =>
                  c
                    ? {
                        ...c,
                        factuurdatum: v,
                        vervaldatum: c.vervalHandmatig
                          ? c.vervaldatum
                          : berekenVervaldatum(v, Number(c.betaaltermijn || 14)),
                      }
                    : c,
                )
              }
              placeholder="Kies"
              disabled={concept?.opSlot || concept?.geimporteerd}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Termijn"
              value={concept?.betaaltermijn ?? ''}
              onChangeText={(v) =>
                setConcept((c) =>
                  c
                    ? {
                        ...c,
                        betaaltermijn: v,
                        vervaldatum:
                          c.vervalHandmatig || !c.factuurdatum
                            ? c.vervaldatum
                            : berekenVervaldatum(c.factuurdatum, Number(v || 14)),
                      }
                    : c,
                )
              }
              placeholder="14"
              keyboardType="number-pad"
              hint="dagen"
              editable={!concept?.opSlot && !concept?.geimporteerd}
            />
          </View>
        </View>
        <DateField
          label="Vervaldatum"
          value={concept?.vervaldatum || null}
          onChange={(v) => setConcept((c) => (c ? { ...c, vervaldatum: v, vervalHandmatig: true } : c))}
          placeholder="Kies"
          disabled={concept?.opSlot || concept?.geimporteerd}
        />
        {concept?.id ? (
          <FormField
            label="Betalingskenmerk"
            value={concept.betalingskenmerk}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, betalingskenmerk: v } : c))}
            placeholder={conceptBron?.nummer ?? ''}
            editable={!concept.opSlot && !concept.geimporteerd}
          />
        ) : null}
        {/* Regels horen bij het aanmaken: één handeling, één set totalen — net
            als in het dashboard. Bij een bestaande factuur blijven de regels in
            hun eigen blad staan. */}
        {concept && !concept.id && !magRegels ? (
          <NoticeBanner
            toon="waarschuwing"
            message={
              waaromNiet('factuurRegels', 'maken') ??
              'Je mag wel een factuur aanmaken, maar geen regels toevoegen. Vraag een beheerder om het recht Facturen.'
            }
          />
        ) : null}

        {concept && !concept.id && magRegels ? (
          <RegelEditor
            regels={concept.regels}
            onChange={(r) => setConcept((c) => (c ? { ...c, regels: r } : c))}
            standaard={{
              uurtarief: instellingen.uurtarief,
              reiskostenPerKm: instellingen.reiskostenPerKm,
              btwPct: instellingen.btwPct,
            }}
            eenheden={eenheden}
          />
        ) : null}

        <FormField
          label="Interne notitie"
          value={concept?.notities ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, notities: v } : c))}
          placeholder="Alleen voor jou en je collega's — niet op de factuur of in de mail"
          multiline
          editable={!concept?.opSlot && !concept?.geimporteerd}
        />

        {/* "Opslaan en versturen", zoals de factuurmodal: niet bij een
            verstuurde of geïmporteerde factuur. */}
        {concept && !concept.opSlot && !concept.geimporteerd && magWijzigen ? (
          <Button
            label="Opslaan en versturen"
            variant="secondary"
            disabled={saving || nieuwOngeldig}
            onPress={() => opslaan(true)}
          />
        ) : null}
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
                'Factuurregels wijzigen vraagt het recht Facturen.'}
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
                    {r.aantal} × {formatEURCent(r.eenheidsprijs)} · {r.btw_pct}% btw
                  </Text>
                </View>
                <Text style={styles.bedrag}>{formatEURCent(r.regelprijs)}</Text>
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

      {/* Versturen per mail / herinnering */}
      <DocumentMailSheet
        visible={mail !== null}
        titel={mail ? FACTUUR_MAIL_TITEL[mail.soort] : 'E-mail versturen'}
        nummer={mail?.factuur.nummer}
        laden={mail?.laden ?? false}
        concept={mail?.concept ?? { aan: '', onderwerp: '', tekst: '' }}
        onWijzig={(c) => setMail((m) => (m ? { ...m, concept: c } : m))}
        saving={mailBezig}
        error={mailFout}
        onVerstuur={verstuurFactuur}
        onSluit={() => setMail(null)}
      />

      {/* Crediteren */}
      <FormSheet
        visible={credit !== null}
        title="Crediteer factuur"
        subtitle={credit?.factuur.nummer}
        error={creditFout}
        saving={creditBezig}
        submitLabel={
          creditBezig
            ? 'Aanmaken...'
            : credit?.modus === 'volledig'
              ? 'Volledig crediteren'
              : 'Creditfactuur aanmaken'
        }
        submitDisabled={!credit || credit.modus === 'kies'}
        onSubmit={crediteren}
        onClose={() => setCredit(null)}
      >
        <Keuze
          label="Kies hoe je deze factuur wilt crediteren"
          opties={[
            { id: 'volledig', label: 'Volledig crediteren' },
            { id: 'gedeeltelijk', label: 'Gedeeltelijk crediteren' },
          ]}
          waarde={credit && credit.modus !== 'kies' ? credit.modus : null}
          onKies={(id) => setCredit((c) => (c ? { ...c, modus: id as CreditStand['modus'] } : c))}
          hint={
            credit?.modus === 'gedeeltelijk'
              ? 'Kies welke regelitems en voor welk bedrag je wilt crediteren.'
              : 'Crediteer alle regelitems voor het volledige bedrag.'
          }
        />
        {credit?.modus === 'volledig' ? (
          <NoticeBanner
            toon="fout"
            message={`Een creditfactuur wordt aangemaakt voor alle ${credit.regels.length} regelitem${
              credit.regels.length !== 1 ? 's' : ''
            } van factuur ${credit.factuur.nummer}. Totaal te crediteren: ${formatEURCent(
              Number(credit.factuur.totaal_incl ?? 0),
            )}.`}
          />
        ) : null}
        {credit?.modus === 'gedeeltelijk'
          ? credit.keuzes.map((k, i) => (
              <View key={k.regel.id} style={[styles.regel, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <Schakel
                  titel={k.regel.omschrijving}
                  uitleg={`${String(k.regel.aantal).replace('.', ',')} × ${formatEURCent(k.regel.eenheidsprijs)}`}
                  waarde={k.gekozen}
                  onWissel={(v) =>
                    setCredit((c) =>
                      c ? { ...c, keuzes: c.keuzes.map((x, j) => (j === i ? { ...x, gekozen: v } : x)) } : c,
                    )
                  }
                />
                {k.gekozen ? (
                  <View style={styles.rij}>
                    <View style={{ flex: 1 }}>
                      <FormField
                        label="Aantal"
                        value={k.aantal}
                        onChangeText={(v) =>
                          setCredit((c) =>
                            c ? { ...c, keuzes: c.keuzes.map((x, j) => (j === i ? { ...x, aantal: v } : x)) } : c,
                          )
                        }
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <FormField
                        label="Prijs"
                        value={k.prijs}
                        onChangeText={(v) =>
                          setCredit((c) =>
                            c ? { ...c, keuzes: c.keuzes.map((x, j) => (j === i ? { ...x, prijs: v } : x)) } : c,
                          )
                        }
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ))
          : null}
        {creditTotaal !== null ? (
          <Text style={styles.uitleg}>{`Te crediteren excl. btw: ${formatEURCent(creditTotaal)}`}</Text>
        ) : null}
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
  });
