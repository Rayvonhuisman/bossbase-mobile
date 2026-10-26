import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileText, Lock, Plus } from 'lucide-react-native';
import {
  AppFilterChips,
  AppListGroup,
  AppListItem,
  AppSearchBar,
  Button,
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
  DateField,
  NoticeBanner,
  RegelEditor,
} from '@/components';
import { usePermissions, useTheme, useToast } from '@/providers';
import {
  createOfferte,
  createOfferteMetRegels,
  deleteOfferte,
  getOfferteDetail,
  getOfferteItems,
  herzieOfferte,
  inhoudLigtVast,
  kopieerOfferte,
  listOffertes,
  markeerOfferteVerstuurd,
  OFFERTE_STATUS_OPTIES,
  stuurGetekendePdfNa,
  updateOfferte,
  vervangOfferteRegels,
  type OfferteDetail,
  type OfferteInput,
  type OfferteItem,
  type OfferteRow,
} from '@/services/offerteService';
import { listCustomers } from '@/services/customerService';
import { getCompanySettings } from '@/services/settingsService';
import { listEigenEenheden } from '@/services/eigenEenheidService';
import { listDeals } from '@/services/dealService';
import { updateProject } from '@/services/projectService';
import {
  getBedrijfVoorDocument,
  getMailSjabloon,
  logVerstuurdeMail,
  verstuurMail,
} from '@/services/documentMailService';
import { logTijdlijn } from '@/services/klantTijdlijnService';
import { berekenTotalen, legeRegel, type EigenEenheid, type Regel } from '@/lib/regels';
import { offerteRegelVoorOpslag, regelUitOfferteItem } from '@/lib/regelOmzetting';
import { isoVanDatum } from '@/lib/datum';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { writeFout, type WriteResult } from '@/lib/writeResult';
import { formatDateNL, formatEUR, formatEURCent } from '@/lib/format';
import { Dialog } from '@/lib/dialog';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { alsTekst } from '@/lib/notitieTekst';
import { useSchermklasse } from '@/lib/schermklasse';
import {
  binnenLimiet,
  documentTotalen,
  filterOffertes,
  magOfferteVerwijderen,
  OFFERTE_FILTERS,
  offerteHerzienbaar,
  offerteKpis,
  offerteStatusInfo,
  offerteVolledigVast,
  telOfferteFilters,
  type OfferteFilter,
} from '@/lib/documentLogica';
import { bedrijfSnapshot, offerteMailConcept, offerteMailHtml, ondertekenLink } from '@/lib/documentMail';
import { maakOffertePdf } from '@/lib/pdf';
import type { PdfBedrijf } from '@/lib/pdf/pdfData';
import { Paneel } from '@/components/Paneel';
import { PdfWeergave, type PdfDocument } from '@/components/PdfWeergave';
import { DocumentMailSheet, type MailConcept } from '@/components/DocumentMailSheet';
import { Keuze } from '@/components/instellingen/Bouwstenen';
import {
  DetailRij,
  DocumentStatusBadge,
  RegelLijst,
  TegelRaster,
  TotalenBlok,
} from '@/components/DocumentOnderdelen';
import { useOnthouden } from '@/lib/useOnthouden';

/**
 * Offertes — dezelfde `offertes` + `offerte_items` als het dashboard.
 *
 * Gelijk aan de offertepagina van het dashboard: vier KPI-tegels, filtertabs,
 * zoeken op nummer, omschrijving en klant, statusbadges in de dashboardkleuren,
 * en een detailweergave met regels, totalen per btw-tarief, notities en de
 * ondertekening. Met dezelfde acties:
 *
 * - **Versturen per mail** (`SendOfferteMailModal`): sjabloon `offerte`, de
 *   PDF als bijlage, de ondertekenlink als knop (alleen met de feature
 *   `digitale_handtekening`), archief in `sent_emails`, tijdlijn, en bij een
 *   concept status verzonden + bevroren bedrijfsgegevens.
 * - **Bewerken** (concept, regels inbegrepen), **Herzien** (verzonden, nog niet
 *   getekend: een nieuwe versie BB-…-v2, de oude ondertekenlink vervalt),
 *   alleen de **status** bij een afgewezen of vervangen offerte; een getekende
 *   of geaccepteerde offerte ligt helemaal vast.
 * - **Kopiëren**: als nieuwe versie voor dezelfde klant (telt niet mee voor de
 *   limiet) of als nieuwe offerte voor een andere klant (wel).
 * - **Maak factuur** bij een geaccepteerde offerte: een nieuwe factuur met de
 *   klant en de regels van de offerte.
 * - **Verwijderen** zolang de klant geen akkoord heeft gegeven.
 *
 * Offerte en regels hangen sinds migratie 20261002135952 allebei op het recht
 * `offertes`.
 */

export default function OffersScreen() {
  return (
    <PermissionGate permission="offertes" label="Offertes">
      <OffersScreenInhoud />
    </PermissionGate>
  );
}

type Concept = {
  id: string | null;
  /** De offerte zoals hij geopend werd; nodig voor herzien en de slotregels. */
  bron: OfferteRow | null;
  customerId: string | null;
  dealId: string | null;
  omschrijving: string;
  geldigTot: string;
  btwPct: string;
  notes: string;
  status: string;
  /** Verzonden en nog niet getekend: opslaan maakt een nieuwe versie. */
  herzien: boolean;
  /** Getekend of geaccepteerd: niets meer te wijzigen, ook de status niet. */
  volledigVast: boolean;
  /** Afgewezen of vervangen: alleen de status. */
  alleenStatus: boolean;
  regels: Regel[];
  regelsLaden: boolean;
};

type MailStand = {
  offerte: OfferteRow;
  laden: boolean;
  concept: MailConcept;
  signToken: string | null;
  kanOndertekenen: boolean;
  bedrijf: PdfBedrijf | null;
  /** De status zoals de database hem nu kent; bepaalt of dit de eerste verzending is. */
  status: string;
};

type KopieStand = { offerte: OfferteRow; modus: 'zelfde' | 'ander'; klantId: string | null };

const APP_URL = 'https://dashboard.bossbase.nl';

function subtitleFor(o: OfferteRow): string {
  const delen: string[] = [];
  if (o.customer?.name) delen.push(o.customer.name);
  if (o.omschrijving) delen.push(alsTekst(o.omschrijving));
  if (o.geldig_tot) delen.push(`Geldig t/m ${formatDateNL(o.geldig_tot)}`);
  return delen.join(' · ') || 'Offerte';
}

function regelMeta(r: OfferteItem, standaardPct: number): string {
  const aantal = String(r.aantal).replace('.', ',');
  const btw =
    r.btw_regime === 'verlegd'
      ? 'btw verlegd'
      : r.btw_regime === 'vrijgesteld'
        ? 'geen btw'
        : `${Number(r.btw_pct ?? standaardPct)}% btw`;
  return `${aantal}${r.eenheid ? ` ${r.eenheid}` : ''} × ${formatEURCent(r.prijs_per)} · ${btw}`;
}

function OffersScreenInhoud() {
  const router = useRouter();
  // `?nieuw=1&klant=&deal=` opent meteen een nieuwe offerte, voorgevuld — de
  // plusknop op de projectkaart (`prefillCustomerId`/`prefillDealId` van de
  // dashboardmodal). Met `project=` gaat het na opslaan terug naar dat project;
  // `koppel=1` hangt de nieuwe offerte er dan ook aan (`projects.offerte_id`),
  // zoals de Offertes-tab van de projectkaart in het dashboard doet.
  const {
    id: openId,
    nieuw: nieuwParam,
    klant: klantParam,
    deal: dealParam,
    project: projectParam,
    koppel: koppelParam,
  } = useLocalSearchParams<{
    id?: string;
    nieuw?: string;
    klant?: string;
    deal?: string;
    project?: string;
    koppel?: string;
  }>();
  const terugNaarProject = useRef<{ projectId: string; koppel: boolean } | null>(null);
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet, hasFeature, planStatus } = usePermissions();
  const { toonResultaat } = useToast();
  const { klasse } = useSchermklasse();
  const breed = klasse === 'tablet';

  const [items, setItems] = useState<OfferteRow[]>([]);
  const [zoek, setZoek] = useState('');
  const [filter, setFilter] = useOnthouden<OfferteFilter>(
    'offertes.filter',
    'alle',
    OFFERTE_FILTERS.map((f) => f.id),
  );

  // Detailweergave
  const [detail, setDetail] = useState<OfferteRow | null>(null);
  const [detailData, setDetailData] = useState<OfferteDetail | null>(null);
  const [detailRegels, setDetailRegels] = useState<OfferteItem[]>([]);
  const [detailLaden, setDetailLaden] = useState(false);
  const [detailFout, setDetailFout] = useState<string | null>(null);
  const [herstel, setHerstel] = useState<null | 'bezig' | 'klaar' | 'fout'>(null);
  const herstelGestart = useRef<Set<string>>(new Set());
  const [klanten, setKlanten] = useState<SelectOption[]>([]);
  const [standaardBtw, setStandaardBtw] = useState('21');
  const [instellingen, setInstellingen] = useState({
    uurtarief: 55,
    reiskostenPerKm: 0.23,
    btwPct: 21,
    geldigDagen: 14,
  });
  const [eenheden, setEenheden] = useState<EigenEenheid[]>([]);
  const [deals, setDeals] = useState<SelectOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [concept, setConcept] = useState<Concept | null>(null);
  const [mail, setMail] = useState<MailStand | null>(null);
  const [kopie, setKopie] = useState<KopieStand | null>(null);

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveMail, saving: mailBezig, error: mailFout, setError: setMailFout } = useSave<unknown>();
  const { save: saveKopie, saving: kopieBezig, error: kopieFout, setError: setKopieFout } = useSave<unknown>();

  const magMaken = mag('offertes', 'maken');
  const magWijzigen = mag('offertes', 'wijzigen');
  const magVerwijderen = mag('offertes', 'verwijderen');
  const magRegels = mag('offerteRegels', 'maken');
  const magFactuurMaken = mag('facturen', 'maken');
  const kanOndertekenen = hasFeature('digitale_handtekening');

  const load = useCallback(async () => {
    setError(null);

    const [offRes, klantRes, instRes, eenheidRes, dealRes] = await Promise.all([
      listOffertes(),
      listCustomers(),
      getCompanySettings(),
      listEigenEenheden(),
      listDeals(),
    ]);

    if (offRes.error) setError(offRes.error);
    else setItems(offRes.data);
    if (!klantRes.error) {
      setKlanten(
        klantRes.data
          .map((k) => ({ id: k.id, label: k.name ?? 'Klant' }))
          .sort((a, b) => a.label.localeCompare(b.label, 'nl')),
      );
    }
    // Het btw-percentage uit de bedrijfsinstellingen als voorinvulling — zelfde
    // bron als het dashboard bij een nieuwe offerte gebruikt.
    if (!instRes.error) {
      setStandaardBtw(String(instRes.data.btw_pct));
      setInstellingen({
        uurtarief: instRes.data.uurtarief,
        reiskostenPerKm: instRes.data.reiskosten_per_km,
        btwPct: instRes.data.btw_pct,
        geldigDagen: instRes.data.offerte_geldig_dagen,
      });
    }
    // Eigen eenheden en deals zijn bijzaak: mislukken ze, dan blijft het
    // formulier werken met de vaste regeltypes en zonder deal.
    if (!eenheidRes.error) setEenheden(eenheidRes.data);
    if (!dealRes.error) {
      setDeals(dealRes.data.map((d) => ({ id: d.id, label: d.title ?? 'Deal' })));
    }
  }, []);

  /**
   * Eerste load, stille verversing bij focus en pull-to-refresh zijn hier
   * drie verschillende dingen. Alleen de laatste zet `refreshing`, dus het
   * scherm hangt niet meer omlaag bij een automatische verversing.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, { onFout: setError });

  /**
   * De detailweergave (`ViewOfferteModal` in het dashboard). Regels, klant- en
   * bedrijfsgegevens worden bij het openen geladen.
   *
   * Vangnet zoals het dashboard: is de offerte getekend maar ontbreekt het
   * ondertekende bestand, dan vraagt de app de server het alsnog te maken en
   * na te sturen. Eén keer per offerte per sessie.
   */
  const openDetail = useCallback(async (o: OfferteRow) => {
    setDetail(o);
    setDetailData(null);
    setDetailRegels([]);
    setDetailFout(null);
    setHerstel(null);
    setDetailLaden(true);
    const [d, r] = await Promise.all([getOfferteDetail(o.id), getOfferteItems(o.id)]);
    setDetailData(d.data);
    setDetailRegels(r.data);
    setDetailFout(d.error ?? r.error);
    setDetailLaden(false);
    if (d.data?.signed_at && !d.data.signed_pdf_url && !herstelGestart.current.has(o.id)) {
      herstelGestart.current.add(o.id);
      setHerstel('bezig');
      const res = await stuurGetekendePdfNa(o.id);
      setHerstel(res.ok ? 'klaar' : 'fout');
    }
  }, []);

  // Openen vanuit een melding of link: /offers?id=<id>
  useEffect(() => {
    if (!openId || loading) return;
    const o = items.find((x) => x.id === openId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (o) void openDetail(o);
    router.setParams({ id: undefined });
  }, [openId, loading, items, openDetail, router]);

  /**
   * Bekijken: één knop, schermvullend (`PdfWeergave`), zoals de paperclip in
   * het dashboard. Getekend: het bewaarde ondertekende exemplaar met
   * handtekening (bucket `signed-offertes`, via `offerte-pdf-url`), wat de
   * klant ook kreeg; lukt dat niet, dan opgebouwd (ook met het
   * ondertekeningsblok). Niet getekend: dezelfde PDF die het dashboard opbouwt.
   */
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const bekijkPdf = (o: OfferteRow) =>
    setPdfDoc({
      soort: 'offerte',
      id: o.id,
      titel: `${o.signed_at ? 'Getekende offerte' : 'Offerte'} ${o.nummer ?? ''}`.trim(),
      opgeslagenEerst: Boolean(o.signed_at),
    });

  /** `guardLimiet('offertes', …)`: binnen de offertelimiet van deze periode? */
  const limietBereikt = () => {
    if (binnenLimiet(planStatus?.limits, 'offertes')) return false;
    Dialog.alert(
      'Offertelimiet bereikt',
      'Je offertelimiet voor deze periode is bereikt. Een nieuwe versie van een bestaande offerte kan nog wel. ' +
        'Je abonnement bekijk je bij Instellingen → Abonnement.',
    );
    return true;
  };

  const openNieuw = (vooraf?: { customerId?: string | null; dealId?: string | null }) => {
    if (limietBereikt()) return;
    setSaveError(null);
    // Geldig tot = vandaag + het aantal dagen uit de bedrijfsinstellingen,
    // precies zoals de offertemodal van het dashboard hem voorinvult.
    const geldig = new Date();
    geldig.setDate(geldig.getDate() + instellingen.geldigDagen);
    setConcept({
      id: null,
      bron: null,
      customerId: vooraf?.customerId ?? null,
      dealId: vooraf?.dealId ?? null,
      omschrijving: '',
      geldigTot: isoVanDatum(geldig),
      btwPct: standaardBtw,
      notes: '',
      status: 'concept',
      herzien: false,
      volledigVast: false,
      alleenStatus: false,
      regels: [legeRegel({ uurtarief: instellingen.uurtarief, btwPct: instellingen.btwPct })],
      regelsLaden: false,
    });
  };

  // Nieuw vanaf de projectkaart: pas openen als de instellingen er zijn, anders
  // klopt de voorinvulling (geldig tot, btw, uurtarief) niet.
  useEffect(() => {
    if (nieuwParam !== '1' || loading || !rechtenGeladen) return;
    terugNaarProject.current = projectParam ? { projectId: projectParam, koppel: koppelParam === '1' } : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (magMaken) openNieuw({ customerId: klantParam || null, dealId: dealParam || null });
    router.setParams({ nieuw: undefined, klant: undefined, deal: undefined, project: undefined, koppel: undefined });
    // openNieuw leest alleen de net geladen instellingen; hem als afhankelijkheid
    // nemen zou bij elke render opnieuw openen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nieuwParam, loading, rechtenGeladen]);

  /**
   * Bewerken zoals `EditOfferteModal`: concept = vrij bewerkbaar met regels;
   * verzonden en niet getekend = herzien als nieuwe versie; getekend of
   * geaccepteerd = vast; anders (afgewezen, vervangen) alleen de status.
   */
  const openBewerk = async (o: OfferteRow) => {
    if (!magWijzigen) return;
    setSaveError(null);
    const herzien = offerteHerzienbaar(o);
    const volledigVast = offerteVolledigVast(o);
    const bewerkbaar = o.status === 'concept' || herzien;
    setConcept({
      id: o.id,
      bron: o,
      customerId: o.customer_id,
      dealId: o.deal_id,
      omschrijving: o.omschrijving ?? '',
      geldigTot: o.geldig_tot ?? '',
      btwPct: o.btw_pct != null ? String(o.btw_pct) : standaardBtw,
      notes: alsTekst(o.notes),
      status: o.status ?? 'concept',
      herzien,
      volledigVast,
      alleenStatus: !bewerkbaar && !volledigVast,
      regels: [],
      regelsLaden: bewerkbaar,
    });
    if (!bewerkbaar) return;
    const { data, error: fout } = await getOfferteItems(o.id);
    setConcept((c) =>
      c && c.id === o.id
        ? {
            ...c,
            regels:
              data.length > 0
                ? data.map((it) => regelUitOfferteItem(it, o))
                : [legeRegel({ uurtarief: instellingen.uurtarief, btwPct: instellingen.btwPct })],
            regelsLaden: false,
          }
        : c,
    );
    if (fout) setSaveError(fout);
  };

  // ── Versturen per mail ────────────────────────────────────────────────────

  /**
   * Het mailvenster openen, zoals `SendOfferteMailModal`: het sjabloon
   * `offerte` met de gegevens van deze offerte, het adres van de klant. De
   * ondertekenlink alleen met de feature `digitale_handtekening`; zonder gaat
   * elke regel over ondertekenen er meteen uit.
   */
  const openMail = async (o: OfferteRow) => {
    setMailFout(null);
    const leeg: MailConcept = { aan: '', onderwerp: '', tekst: '' };
    setMail({
      offerte: o,
      laden: true,
      concept: leeg,
      signToken: null,
      kanOndertekenen,
      bedrijf: null,
      status: o.status ?? 'concept',
    });
    const [d, sjabloon, bedrijf] = await Promise.all([
      getOfferteDetail(o.id),
      getMailSjabloon('offerte'),
      getBedrijfVoorDocument(),
    ]);
    const doc = d.data;
    const tekst = offerteMailConcept({
      sjabloon: sjabloon.error ? null : sjabloon.data,
      kanOndertekenen,
      klantNaam: doc?.customer?.name ?? o.customer?.name,
      bedrijfsnaam: bedrijf?.name,
      nummer: doc?.nummer ?? o.nummer ?? '',
      omschrijving: doc?.omschrijving ?? o.omschrijving,
      totaalIncl: doc?.totaal_incl ?? o.totaal_incl,
      geldigTot: doc?.geldig_tot ?? o.geldig_tot,
    });
    setMail((m) =>
      m && m.offerte.id === o.id
        ? {
            ...m,
            laden: false,
            concept: { aan: doc?.customer?.email ?? '', onderwerp: tekst.onderwerp, tekst: tekst.tekst },
            signToken: doc?.sign_token ?? null,
            bedrijf,
            status: doc?.status ?? m.status,
          }
        : m,
    );
    if (d.error) setMailFout(d.error);
  };

  // ── Opslaan ───────────────────────────────────────────────────────────────

  const opslaan = (enVersturen = false) => {
    if (!concept) return;
    const c = concept;
    const regels = c.regels.map((r) => offerteRegelVoorOpslag(r, eenheden));
    const totalen = berekenTotalen(c.regels);

    save(
      async (): Promise<WriteResult<OfferteRow>> => {
        // Nieuwe offerte: kop én regels in één handeling, met de totalen uit
        // de regels — zelfde volgorde en bedragen als de offertemodal.
        if (!c.id) {
          const invoer: OfferteInput = {
            customer_id: c.customerId,
            deal_id: c.dealId,
            omschrijving: c.omschrijving,
            geldig_tot: c.geldigTot || null,
            btw_pct: Number(c.btwPct.replace(',', '.') || 21),
            notes: c.notes,
          };
          if (!magRegels) return createOfferte(invoer);
          const res = await createOfferteMetRegels(
            { ...invoer, totaal_excl: totalen.excl, totaal_incl: totalen.incl },
            regels,
          );
          return res.ok ? { ok: true, data: res.data.offerte } : res;
        }

        if (c.volledigVast) {
          return writeFout('op-slot', 'Deze offerte is ondertekend of geaccepteerd en ligt helemaal vast.');
        }

        // Verstuurd en nog niet getekend: een nieuwe versie met deze regels.
        if (c.herzien && c.bron) {
          const res = await herzieOfferte(
            c.bron,
            { customer_id: c.customerId, omschrijving: c.omschrijving, geldig_tot: c.geldigTot || null, notes: c.notes },
            regels,
            { totaal_excl: totalen.excl, totaal_incl: totalen.incl },
          );
          return res.ok ? { ok: true, data: res.data.offerte } : res;
        }

        // Afgewezen of vervangen: alleen de status.
        if (c.alleenStatus) return updateOfferte(c.id, { status: c.status });

        // Concept: eerst de regels (alles weg en opnieuw, zoals het
        // dashboard), dan de kop — zo staat een statuswissel nooit vóór de
        // regels die erbij horen.
        if (magRegels) {
          const r = await vervangOfferteRegels(c.id, regels);
          if (!r.ok) return r;
        }
        return updateOfferte(c.id, {
          customer_id: c.customerId,
          deal_id: c.dealId,
          omschrijving: c.omschrijving,
          geldig_tot: c.geldigTot || null,
          btw_pct: Number(c.btwPct.replace(',', '.') || 21),
          notes: c.notes,
          status: c.status,
        });
      },
      {
        onSuccess: async (data) => {
          const opgeslagen = data as OfferteRow;
          setConcept(null);
          const naar = terugNaarProject.current;
          if (!c.id && naar) {
            terugNaarProject.current = null;
            // Koppelen is best-effort, net als `handleCreated` in het dashboard.
            if (naar.koppel && opgeslagen?.id) await updateProject(naar.projectId, { offerte_id: opgeslagen.id });
            if (enVersturen) void openMail(opgeslagen);
            terugOfNaar(router, `/project/${naar.projectId}`);
            return;
          }
          await herlaad();
          if (enVersturen) void openMail(opgeslagen);
        },
        succesMelding: c.herzien ? 'Nieuwe versie aangemaakt' : c.id ? 'Offerte opgeslagen' : 'Offerte aangemaakt',
      },
    );
  };

  const verwijderen = () => {
    if (!concept?.id) return;
    const id = concept.id;
    bevestigVerwijderen('Offerte', () => {
      save(() => deleteOfferte(id), {
        onSuccess: async () => {
          setConcept(null);
          await herlaad();
        },
        succesMelding: 'Offerte verwijderd',
      });
    });
  };

  const verstuurOfferte = () => {
    if (!mail) return;
    const m = mail;
    const aan = m.concept.aan.trim();
    saveMail(
      async (): Promise<WriteResult<null>> => {
        if (!aan) return writeFout('validatie', 'E-mailadres is verplicht.');
        // De PDF als bijlage; mislukt die, dan gaat de mail zonder, zoals in
        // het dashboard.
        let bijlagen: { filename: string; content: string }[] = [];
        try {
          const pdf = await maakOffertePdf(m.offerte.id);
          bijlagen = [{ filename: `Offerte-${m.offerte.nummer}.pdf`, content: pdf.base64 }];
        } catch (e) {
          console.warn('[offers] PDF-bijlage maken mislukt', e);
        }
        const html = offerteMailHtml({
          onderwerp: m.concept.onderwerp,
          tekst: m.concept.tekst,
          kanOndertekenen: m.kanOndertekenen,
          signToken: m.signToken,
          appUrl: APP_URL,
          bedrijfsnaam: m.bedrijf?.name,
          logoUrl: m.bedrijf?.logoUrl,
          merkkleur: m.bedrijf?.brandingColor,
        });
        const verstuurd = await verstuurMail({ to: aan, subject: m.concept.onderwerp, html, attachments: bijlagen, soort: 'offerte', gerelateerdId: m.offerte?.id });
        if (!verstuurd.ok) return writeFout('onbekend', verstuurd.melding);

        await logVerstuurdeMail({
          toEmail: aan,
          subject: m.concept.onderwerp,
          bodyHtml: html,
          relatedType: 'offerte',
          relatedId: m.offerte.id,
          customerId: m.offerte.customer_id,
        });
        const status = await markeerOfferteVerstuurd(
          { ...m.offerte, status: m.status },
          aan,
          bedrijfSnapshot(m.bedrijf),
        );
        void logTijdlijn(m.offerte.customer_id, 'email_verstuurd', `E-mail verstuurd: ${m.concept.onderwerp}`, {
          to: aan,
          subject: m.concept.onderwerp,
        });
        if (!status.ok) {
          // De mail is weg; alleen het bijwerken van de offerte lukte niet.
          return writeFout('onbekend', `De e-mail is verstuurd, maar de offerte is niet bijgewerkt: ${status.melding}`);
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

  const kopieAnderGeblokkeerd = kopie?.modus === 'ander' && !binnenLimiet(planStatus?.limits, 'offertes');

  const kopieren = () => {
    if (!kopie) return;
    const k = kopie;
    const alsVersie = k.modus === 'zelfde';
    saveKopie(
      async () => {
        if (!alsVersie && !k.klantId) return writeFout('validatie', 'Kies een klant.');
        if (!alsVersie && !binnenLimiet(planStatus?.limits, 'offertes')) {
          return writeFout('plan-limiet', 'Je offertelimiet voor deze periode is bereikt.');
        }
        return kopieerOfferte(k.offerte.id, {
          customerId: alsVersie ? k.offerte.customer_id : k.klantId,
          alsVersie,
        });
      },
      {
        onSuccess: async (data) => {
          const nieuw = data as OfferteRow;
          setKopie(null);
          toonResultaat(
            { ok: true, data: null },
            alsVersie ? `Nieuwe versie ${nieuw.nummer} aangemaakt` : `Offerte ${nieuw.nummer} aangemaakt`,
          );
          await herlaad();
          // Zoals het dashboard: meteen de kopie openen om aan te passen.
          void openBewerk(nieuw);
        },
      },
    );
  };

  // ── Maak factuur ──────────────────────────────────────────────────────────

  /** Een nieuwe factuur met de klant en de regels van deze offerte (handleMaakFactuur). */
  const maakFactuur = (o: OfferteRow) => {
    setDetail(null);
    router.push({ pathname: '/invoices', params: { vanOfferte: o.id } });
  };

  if (loading || !rechtenGeladen) return <LoadingScreen label="Offertes laden..." />;

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppScreen
          scroll={false}
          header={<AppTopBar variant="detail" title="Offertes" onBack={() => terugOfNaar(router, '/menu')} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const kpis = offerteKpis(items);
  const tellingen = telOfferteFilters(items);
  const zichtbaar = filterOffertes(items, { filter, zoek });

  // Totalen van de detailweergave: uit de regels (zoals de PDF), en voor een
  // oude offerte zonder regels uit de kop.
  const detailStandaardPct = Number(detail?.btw_pct ?? 21);
  const detailTotalen = detail
    ? detailRegels.length > 0
      ? documentTotalen(
          detailRegels.map((r) => ({
            bedrag: r.subtotaal,
            btwPct: r.btw_pct,
            btwRegime: r.btw_regime,
          })),
          detailStandaardPct,
        )
      : {
          excl: Number(detail.totaal_excl ?? 0),
          btwPerTarief:
            Number(detail.totaal_incl ?? 0) - Number(detail.totaal_excl ?? 0) !== 0
              ? [
                  {
                    pct: detailStandaardPct,
                    bedrag:
                      Math.round(
                        (Number(detail.totaal_incl ?? 0) - Number(detail.totaal_excl ?? 0)) * 100,
                      ) / 100,
                  },
                ]
              : [],
          incl: Number(detail.totaal_incl ?? 0),
        }
    : null;
  const detailStatus = offerteStatusInfo(detail?.status);

  // De acties van de detailweergave, met de voorwaarden van het dashboard.
  const isGeaccepteerd = detail?.status === 'geaccepteerd';
  const detailVast = detail ? offerteVolledigVast(detail) : false;
  const detailHerzien = detail ? offerteHerzienbaar(detail) : false;
  const bewerkLabel =
    detail?.status === 'concept' ? 'Bewerken' : detailHerzien ? 'Herzien (nieuwe versie)' : 'Status wijzigen';
  const pdfOntbreekt = Boolean(detailData?.signed_at && !detailData.signed_pdf_url);

  const conceptBewerkbaar = concept ? !concept.id || concept.status === 'concept' || concept.herzien : false;
  const conceptBron = concept?.bron;
  const conceptMagWeg =
    Boolean(concept?.id) && magVerwijderen && (conceptBron ? magOfferteVerwijderen(conceptBron) : false);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Offertes"
            subtitle={`${items.length} ${items.length === 1 ? 'offerte' : 'offertes'}`}
            onBack={() => terugOfNaar(router, '/menu')}
            rightAction={
              magMaken ? (
                <HeaderIconButton icon={Plus} label="Nieuwe offerte" onPress={() => openNieuw()} />
              ) : undefined
            }
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        <TegelRaster
          breed={breed}
          tegels={[
            { id: 'totaal', label: 'Totaal offertes', waarde: String(kpis.totaal) },
            { id: 'concept', label: 'Concept', waarde: String(kpis.concept) },
            { id: 'verzonden', label: 'Verzonden', waarde: String(kpis.verzonden) },
            {
              id: 'geaccepteerd',
              label: 'Geaccepteerd',
              waarde: String(kpis.geaccepteerd),
              uitleg: formatEUR(kpis.geaccepteerdBedrag),
              toon: 'goed',
            },
          ]}
        />

        <View style={styles.zoekRij}>
          <AppSearchBar value={zoek} onChange={setZoek} placeholder="Zoek offerte..." />
        </View>
        <View style={{ paddingTop: 12 }}>
          <AppFilterChips
            chips={OFFERTE_FILTERS.map((f) => ({ id: f.id, label: f.label, count: tellingen[f.id] }))}
            active={filter}
            onChange={setFilter}
          />
        </View>

        {items.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} color={ds.green} strokeWidth={1.6} />}
            title="Geen offertes"
            message={
              magMaken
                ? 'Maak met de plusknop je eerste offerte.'
                : (waaromNiet('offertes', 'maken') ?? 'Er zijn nog geen offertes.')
            }
          />
        ) : zichtbaar.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} color={ds.green} strokeWidth={1.6} />}
            title="Geen offertes gevonden"
            message="Geen offertes die passen bij je zoekopdracht of filter."
          />
        ) : (
          <>
            <AppSection
              title={filter === 'alle' ? 'Alle offertes' : (OFFERTE_FILTERS.find((f) => f.id === filter)?.label ?? '')}
              count={zichtbaar.length}
              variant="eyebrow"
            />
            <AppListGroup>
              {zichtbaar.map((o, i) => {
                const st = offerteStatusInfo(o.status);
                return (
                  <AppListItem
                    key={o.id}
                    first={i === 0}
                    icon={inhoudLigtVast(o) ? Lock : FileText}
                    title={`${o.nummer ?? 'Offerte'}`}
                    subtitle={subtitleFor(o)}
                    onPress={() => void openDetail(o)}
                    trailing={
                      <View style={styles.trailing}>
                        <Text style={styles.bedrag}>{formatEURCent(Number(o.totaal_incl ?? 0))}</Text>
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

      {/* Offerte bekijken */}
      <Paneel
        open={detail !== null}
        titel={detail?.nummer ?? 'Offerte'}
        subtitel={detail?.customer?.name ?? undefined}
        onSluit={() => setDetail(null)}
        voet={
          detail ? (
            <View style={styles.knoppen}>
              {/* Eén primaire actie die de status volgt, zoals het dashboard. */}
              {isGeaccepteerd && magWijzigen && magFactuurMaken ? (
                <Button label="Maak factuur" onPress={() => maakFactuur(detail)} style={styles.knop} />
              ) : null}
              {magWijzigen ? (
                <Button
                  label="Verstuur per mail"
                  variant={isGeaccepteerd && magFactuurMaken ? 'secondary' : 'primary'}
                  onPress={() => {
                    const o = detail;
                    setDetail(null);
                    void openMail(o);
                  }}
                  style={styles.knop}
                />
              ) : null}
              <Button label="Bekijken" variant="secondary" onPress={() => bekijkPdf(detail)} style={styles.knop} />
              {magWijzigen && !detailVast ? (
                <Button
                  label={bewerkLabel}
                  variant="secondary"
                  onPress={() => {
                    const o = detail;
                    setDetail(null);
                    void openBewerk(o);
                  }}
                  style={styles.knop}
                />
              ) : null}
              {magMaken ? (
                <Button
                  label="Kopiëren"
                  variant="ghost"
                  onPress={() => {
                    const o = detail;
                    setDetail(null);
                    setKopieFout(null);
                    setKopie({ offerte: o, modus: 'zelfde', klantId: null });
                  }}
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
            <View>
              <DetailRij label="Klant" waarde={detail.customer?.name ?? 'Geen klant'} />
              <DetailRij
                label="Status"
                waarde={<DocumentStatusBadge toon={detailStatus.toon} label={detailStatus.label} />}
              />
              {detail.omschrijving ? (
                <DetailRij label="Omschrijving" waarde={alsTekst(detail.omschrijving)} />
              ) : null}
              <DetailRij label="Geldig tot" waarde={detail.geldig_tot ? formatDateNL(detail.geldig_tot) : '—'} />
              <DetailRij label="Aangemaakt" waarde={formatDateNL(detail.created_at)} />
              {detail.verzonden_op ? (
                <DetailRij label="Verzonden" waarde={formatDateNL(detail.verzonden_op)} />
              ) : null}
              {detailData?.sent_to_email ? (
                <DetailRij label="Verstuurd naar" waarde={detailData.sent_to_email} />
              ) : null}
              {detail.geaccepteerd_op ? (
                <DetailRij label="Geaccepteerd" waarde={formatDateNL(detail.geaccepteerd_op)} />
              ) : null}
            </View>

            {detail.vervangen_op ? (
              <NoticeBanner
                toon="info"
                message={`Deze offerte is vervangen door een nieuwere versie${
                  detail.vervangen_door_nummer ? ` (${detail.vervangen_door_nummer})` : ''
                }. De ondertekenlink van deze versie werkt niet meer.`}
              />
            ) : null}

            <RegelLijst
              laden={detailLaden}
              leegTekst="Deze offerte heeft geen regels."
              regels={detailRegels.map((r) => ({
                id: r.id,
                omschrijving: r.omschrijving,
                meta: regelMeta(r, detailStandaardPct),
                bedrag: r.subtotaal,
              }))}
            />
            {detailTotalen ? <TotalenBlok {...detailTotalen} /> : null}

            {detail.notes ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={styles.label}>Opmerking voor de klant</Text>
                <Text style={styles.uitleg}>{alsTekst(detail.notes)}</Text>
              </View>
            ) : null}

            {detail.signed_at ? (
              <View
                style={[
                  styles.getekend,
                  { backgroundColor: pdfOntbreekt ? t.statusWarnBg : t.statusApproveBg },
                ]}
              >
                <Text style={[styles.getekendTekst, { color: pdfOntbreekt ? t.statusWarnFg : t.statusApproveFg }]}>
                  {pdfOntbreekt ? 'Getekend, PDF ontbreekt' : 'Ondertekend'}
                  {detailData?.signed_by_name ? ` door ${detailData.signed_by_name}` : ''} op{' '}
                  {formatDateNL(detail.signed_at)}
                </Text>
                {pdfOntbreekt ? (
                  <Text style={[styles.uitleg, { color: t.statusWarnFg }]}>
                    {herstel === 'bezig'
                      ? 'Het getekende bestand wordt alsnog gemaakt…'
                      : herstel === 'klaar'
                        ? 'Gelukt — het bestand is opgeslagen en als bijlage nagestuurd. Ververs om hem te openen.'
                        : herstel === 'fout'
                          ? 'Het bestand kon niet alsnog gemaakt worden. Open de offerte opnieuw om het nog eens te proberen.'
                          : 'De handtekening is vastgelegd; alleen het PDF-bestand ontbreekt.'}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        ) : null}
        {/* In het paneel, zodat hij op iOS bovenop het paneel opent. */}
        <PdfWeergave document={pdfDoc} onSluit={() => setPdfDoc(null)} />
      </Paneel>

      {/* Offerte aanmaken / bewerken / herzien */}
      <FormSheet
        visible={concept !== null}
        title={concept?.id ? (concept.herzien ? 'Offerte herzien' : 'Offerte bewerken') : 'Nieuwe offerte'}
        subtitle={concept?.id ? (concept.bron?.nummer ?? undefined) : 'Het nummer wordt automatisch toegekend'}
        error={saveError}
        saving={saving}
        submitLabel={concept?.herzien ? 'Nieuwe versie opslaan' : 'Opslaan'}
        submitDisabled={
          !concept ||
          concept.volledigVast ||
          concept.regelsLaden ||
          (!concept.id && (!concept.customerId || (magRegels && concept.regels.length === 0)))
        }
        onSubmit={() => opslaan(false)}
        onClose={() => {
          setConcept(null);
          // Geopend vanaf de projectkaart en geannuleerd: terug naar het project.
          const naar = terugNaarProject.current;
          if (naar) {
            terugNaarProject.current = null;
            terugOfNaar(router, `/project/${naar.projectId}`);
          }
        }}
        destructive={conceptMagWeg ? { label: 'Offerte verwijderen', onPress: verwijderen } : undefined}
      >
        {concept?.herzien ? (
          <NoticeBanner
            toon="info"
            message="Deze offerte is al verstuurd. Bij opslaan maak je automatisch een nieuwe versie aan; de vorige versie blijft bewaard en de oude ondertekenlink vervalt."
          />
        ) : concept?.volledigVast ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              Deze offerte is ondertekend of geaccepteerd en ligt helemaal vast. Een nieuwe offerte
              maken kan via Kopiëren.
            </Text>
          </View>
        ) : concept?.alleenStatus ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              De inhoud van deze offerte ligt vast; alleen de status kun je nog aanpassen.
            </Text>
          </View>
        ) : null}

        {concept?.id ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRij}>
              {OFFERTE_STATUS_OPTIES.map((s) => {
                const actief = concept.status === s.id;
                const uit = concept.volledigVast || concept.herzien;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setConcept((c) => (c ? { ...c, status: s.id } : c))}
                    disabled={uit}
                    accessibilityRole="button"
                    accessibilityState={{ selected: actief, disabled: uit }}
                    aria-pressed={actief}
                    style={[styles.chip, actief && styles.chipActief, uit && { opacity: 0.55 }]}
                  >
                    <Text style={[styles.chipTekst, actief && styles.chipTekstActief]}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
          disabled={!conceptBewerkbaar}
        />
        {deals.length > 0 && !concept?.herzien ? (
          <SelectField
            label="Deal"
            value={concept?.dealId ?? null}
            options={deals}
            onChange={(id) => setConcept((c) => (c ? { ...c, dealId: id } : c))}
            allowEmpty
            emptyLabel="Geen deal"
            placeholder="Geen deal"
            disabled={!conceptBewerkbaar}
          />
        ) : null}
        <FormField
          label="Omschrijving"
          value={concept?.omschrijving ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, omschrijving: v } : c))}
          placeholder="Waar gaat de offerte over?"
          editable={conceptBewerkbaar}
        />
        <View style={styles.rij}>
          <View style={{ flex: 1.4 }}>
            <DateField
              label="Geldig tot"
              value={concept?.geldigTot || null}
              onChange={(v) => setConcept((c) => (c ? { ...c, geldigTot: v } : c))}
              placeholder="Kies"
              disabled={!conceptBewerkbaar}
            />
          </View>
          {!concept?.herzien ? (
            <View style={{ flex: 1 }}>
              <FormField
                label="Btw %"
                value={concept?.btwPct ?? ''}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, btwPct: v } : c))}
                placeholder="21"
                keyboardType="decimal-pad"
                editable={conceptBewerkbaar}
              />
            </View>
          ) : null}
        </View>

        {/* Regels horen bij de offerte, net als in het dashboard: één
            handeling, één set totalen. Bij een concept vervangt opslaan alle
            regels; bij herzien komen ze op de nieuwe versie. */}
        {concept && conceptBewerkbaar && !magRegels ? (
          <NoticeBanner
            toon="waarschuwing"
            message={
              waaromNiet('offerteRegels', 'maken') ??
              'Je mag geen offerteregels toevoegen. Vraag een beheerder om het recht Offertes.'
            }
          />
        ) : null}

        {concept && conceptBewerkbaar && magRegels ? (
          concept.regelsLaden ? (
            <Text style={styles.uitleg}>Regels laden…</Text>
          ) : (
            <RegelEditor
              regels={concept.regels}
              onChange={(regels) => setConcept((c) => (c ? { ...c, regels } : c))}
              standaard={{
                uurtarief: instellingen.uurtarief,
                reiskostenPerKm: instellingen.reiskostenPerKm,
                btwPct: instellingen.btwPct,
              }}
              eenheden={eenheden}
            />
          )
        ) : null}

        {concept && !conceptBewerkbaar && concept.bron ? (
          <Text style={styles.uitleg}>
            {`Totaal ${formatEURCent(Number(concept.bron.totaal_incl ?? 0))} incl. btw.`}
          </Text>
        ) : null}

        <FormField
          label="Opmerking voor de klant"
          value={concept?.notes ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, notes: v } : c))}
          placeholder="Staat op de offerte die de klant ontvangt"
          multiline
          editable={conceptBewerkbaar}
        />

        {/* "Opslaan en versturen", zoals de offertemodal: alleen als er nog
            iets op te slaan valt. */}
        {concept && conceptBewerkbaar && magWijzigen ? (
          <Button
            label={concept.herzien ? 'Nieuwe versie opslaan en versturen' : 'Opslaan en versturen'}
            variant="secondary"
            disabled={
              saving ||
              concept.regelsLaden ||
              (!concept.id && (!concept.customerId || (magRegels && concept.regels.length === 0)))
            }
            onPress={() => opslaan(true)}
          />
        ) : null}
      </FormSheet>

      {/* Versturen per mail */}
      <DocumentMailSheet
        visible={mail !== null}
        titel="Offerte versturen per e-mail"
        nummer={mail?.offerte.nummer}
        laden={mail?.laden ?? false}
        concept={mail?.concept ?? { aan: '', onderwerp: '', tekst: '' }}
        onWijzig={(c) => setMail((m) => (m ? { ...m, concept: c } : m))}
        melding={
          mail && mail.kanOndertekenen
            ? `Ondertekeningslink: ${ondertekenLink(APP_URL, mail.signToken)}. In de mail staat {{link}} als knop "Offerte bekijken & ondertekenen". De offerte gaat als PDF mee.`
            : mail
              ? 'De offerte gaat als PDF mee. Digitaal ondertekenen zit niet in je abonnement, dus er gaat geen ondertekenlink mee.'
              : null
        }
        saving={mailBezig}
        error={mailFout}
        onVerstuur={verstuurOfferte}
        onSluit={() => setMail(null)}
      />

      {/* Kopiëren */}
      <FormSheet
        visible={kopie !== null}
        title="Offerte kopiëren"
        subtitle={kopie?.offerte.nummer ?? undefined}
        error={kopieFout}
        saving={kopieBezig}
        submitLabel={kopieBezig ? 'Kopiëren…' : 'Kopiëren'}
        submitDisabled={!kopie || (kopie.modus === 'ander' && (!kopie.klantId || kopieAnderGeblokkeerd))}
        onSubmit={kopieren}
        onClose={() => setKopie(null)}
      >
        <Text style={styles.uitleg}>
          De kopie is een bewerkbare conceptofferte met dezelfde regels. Je kunt deze daarna
          aanpassen en versturen.
        </Text>
        <Keuze
          label="Voor welke klant?"
          opties={[
            {
              id: 'zelfde',
              label: `Zelfde klant — nieuwe versie (${kopie?.offerte.customer?.name ?? 'deze klant'})`,
            },
            { id: 'ander', label: 'Andere klant — nieuwe offerte' },
          ]}
          waarde={kopie?.modus ?? 'zelfde'}
          onKies={(id) => setKopie((k) => (k ? { ...k, modus: id as KopieStand['modus'] } : k))}
          hint={
            kopie?.modus === 'ander'
              ? 'Krijgt een nieuw offertenummer en telt mee voor je offertelimiet.'
              : 'Krijgt het volgende versienummer en telt niet opnieuw mee voor je limiet.'
          }
        />
        {kopie?.modus === 'ander' ? (
          <SelectField
            label="Klant"
            value={kopie.klantId}
            options={klanten}
            onChange={(id) => setKopie((k) => (k ? { ...k, klantId: id } : k))}
            placeholder="Selecteer klant"
          />
        ) : null}
        {kopieAnderGeblokkeerd ? (
          <NoticeBanner
            toon="waarschuwing"
            message="Je offertelimiet voor deze periode is bereikt. Een nieuwe versie voor dezelfde klant kan nog wel — die telt niet opnieuw mee."
          />
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
    getekend: { padding: spacing.md, borderRadius: radius.md, gap: 4 },
    getekendTekst: { fontSize: 13.5, fontWeight: '700' },
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
    slotBanner: {
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.statusDraftBg,
    },
    slotTekst: { fontSize: 13, lineHeight: 19, color: t.statusDraftFg, fontWeight: '600' },
    uitleg: { fontSize: 13.5, lineHeight: 19, color: t.muted },
  });
