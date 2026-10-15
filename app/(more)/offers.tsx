import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FileText, Lock, Plus, Trash2 } from 'lucide-react-native';
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
import { usePermissions, useTheme } from '@/providers';
import {
  createOfferte,
  createOfferteItem,
  createOfferteMetRegels,
  deleteOfferte,
  deleteOfferteItem,
  getOfferteDetail,
  getOfferteItems,
  herberekenOfferteTotalen,
  inhoudLigtVast,
  listOffertes,
  OFFERTE_STATUS_OPTIES,
  updateOfferte,
  type OfferteDetail,
  type OfferteInput,
  type OfferteItem,
  type OfferteRow,
} from '@/services/offerteService';
import { listCustomers } from '@/services/customerService';
import { getCompanySettings } from '@/services/settingsService';
import { listEigenEenheden } from '@/services/eigenEenheidService';
import { listDeals } from '@/services/dealService';
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
import { formatDateNL, formatEUR } from '@/lib/format';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { alsTekst } from '@/lib/notitieTekst';
import { useSchermklasse } from '@/lib/schermklasse';
import {
  documentTotalen,
  filterOffertes,
  OFFERTE_FILTERS,
  offerteKpis,
  offerteStatusInfo,
  telOfferteFilters,
  type OfferteFilter,
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
 * Offertes — dezelfde `offertes` + `offerte_items` als het dashboard.
 *
 * Gelijk aan de offertepagina van het dashboard: vier KPI-tegels, filtertabs
 * (Alle/Concept/Verzonden/Geaccepteerd/Afgewezen), zoeken op nummer,
 * omschrijving en klant, statusbadges in de dashboardkleuren, en een
 * detailweergave met regels, totalen per btw-tarief, notities en de
 * ondertekening. De PDF maakt het dashboard met jsPDF in de browser; de app
 * toont dezelfde inhoud als afdrukbare weergave (web/PWA: printvenster, ook
 * "Bewaar als PDF"). Een getekende offerte-PDF komt via `offerte-pdf-url`.
 * Versturen per mail gebeurt (nog) in het dashboard.
 *
 * Twee gates die uit elkaar lopen en die je hier apart terugziet:
 * offerte en regels hangen sinds migratie 20261002135952 allebei op het recht
 * `offertes` (voorheen de regels op de rol admin/planner). Verder ligt de
 * inhoud van een verstuurde of ondertekende offerte vast — status wijzigen mag
 * dan nog wel.
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
  customerId: string | null;
  dealId: string | null;
  omschrijving: string;
  geldigTot: string;
  btwPct: string;
  notes: string;
  status: string;
  opSlot: boolean;
};

type RegelConcept = { omschrijving: string; aantal: string; prijs: string; eenheid: string };

const LEGE_REGEL: RegelConcept = { omschrijving: '', aantal: '1', prijs: '', eenheid: '' };

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
  return `${aantal}${r.eenheid ? ` ${r.eenheid}` : ''} × ${formatEUR(r.prijs_per)} · ${btw}`;
}

function OffersScreenInhoud() {
  const router = useRouter();
  const { id: openId } = useLocalSearchParams<{ id?: string }>();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();
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
  /** De regels van een NIEUWE offerte; bestaande offertes bewerken hun regels apart. */
  const [nieuweRegels, setNieuweRegels] = useState<Regel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [concept, setConcept] = useState<Concept | null>(null);
  const [regelsVoor, setRegelsVoor] = useState<OfferteRow | null>(null);
  const [regels, setRegels] = useState<OfferteItem[]>([]);
  const [nieuweRegel, setNieuweRegel] = useState<RegelConcept>(LEGE_REGEL);

  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveRegel, saving: regelBezig, error: regelFout } = useSave<unknown>();

  const magMaken = mag('offertes', 'maken');
  const magWijzigen = mag('offertes', 'wijzigen');
  const magVerwijderen = mag('offertes', 'verwijderen');
  const magRegels = mag('offerteRegels', 'maken');

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
      setKlanten(klantRes.data.map((k) => ({ id: k.id, label: k.name ?? 'Klant' })));
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
   * bedrijfsgegevens worden bij het openen geladen, zodat "Afdrukken" daarna
   * synchroon vanuit de klik kan — anders houdt Safari het venster tegen. Om
   * dezelfde reden halen we de link naar de getekende PDF meteen op.
   */
  const openDetail = useCallback(async (o: OfferteRow) => {
    setDetail(o);
    setDetailData(null);
    setDetailRegels([]);
    setDetailFout(null);
    setDetailLaden(true);
    const [d, r] = await Promise.all([getOfferteDetail(o.id), getOfferteItems(o.id)]);
    setDetailData(d.data);
    setDetailRegels(r.data);
    setDetailFout(d.error ?? r.error);
    setDetailLaden(false);
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
   * PDF bekijken: precies de PDF van het dashboard, schermvullend
   * (`PdfWeergave`). "PDF bekijken" bouwt hem opnieuw op, zoals de
   * voorbeeldknop van het dashboard; "Getekende offerte" toont het
   * ondertekende exemplaar.
   */
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const bekijkPdf = (o: OfferteRow, getekend: boolean) =>
    setPdfDoc({
      soort: 'offerte',
      id: o.id,
      titel: `${getekend ? 'Getekende offerte' : 'Offerte'} ${o.nummer ?? ''}`.trim(),
      opgeslagenEerst: getekend,
    });

  const openNieuw = () => {
    setSaveError(null);
    // Geldig tot = vandaag + het aantal dagen uit de bedrijfsinstellingen,
    // precies zoals de offertemodal van het dashboard hem voorinvult.
    const geldig = new Date();
    geldig.setDate(geldig.getDate() + instellingen.geldigDagen);
    setNieuweRegels([legeRegel({ uurtarief: instellingen.uurtarief, btwPct: instellingen.btwPct })]);
    setConcept({
      id: null,
      customerId: null,
      dealId: null,
      omschrijving: '',
      geldigTot: isoVanDatum(geldig),
      btwPct: standaardBtw,
      notes: '',
      status: 'concept',
      opSlot: false,
    });
  };

  const openBewerk = (o: OfferteRow) => {
    if (!magWijzigen) return;
    setSaveError(null);
    setConcept({
      id: o.id,
      customerId: o.customer_id,
      dealId: o.deal_id,
      omschrijving: o.omschrijving ?? '',
      geldigTot: o.geldig_tot ?? '',
      btwPct: o.btw_pct != null ? String(o.btw_pct) : standaardBtw,
      notes: alsTekst(o.notes),
      status: o.status ?? 'concept',
      opSlot: inhoudLigtVast(o),
    });
  };

  const opslaan = () => {
    if (!concept) return;
    // Ligt de inhoud vast, dan sturen we uitsluitend de status mee. Anders zou
    // de server de hele opslag weigeren om een veld dat we niet wilden wijzigen.
    const invoer: Partial<OfferteInput> & { status?: string } = concept.opSlot
      ? { status: concept.status }
      : {
          customer_id: concept.customerId,
          deal_id: concept.dealId,
          omschrijving: concept.omschrijving,
          geldig_tot: concept.geldigTot || null,
          btw_pct: Number(concept.btwPct.replace(',', '.') || 21),
          notes: concept.notes,
          ...(concept.id ? { status: concept.status } : {}),
        };

    save(
      () => {
        if (concept.id) return updateOfferte(concept.id, invoer);
        // Nieuwe offerte: kop én regels in één handeling, met de totalen uit
        // de regels — zelfde volgorde en zelfde bedragen als de offertemodal
        // van het dashboard.
        if (!magRegels) {
          // Geen regelrecht: alleen de kop, met de oude veldenberekening. Een
          // regel meesturen die de server toch weigert helpt niemand.
          return createOfferte(invoer as OfferteInput);
        }
        const totalen = berekenTotalen(nieuweRegels);
        return createOfferteMetRegels(
          {
            ...(invoer as OfferteInput),
            totaal_excl: totalen.excl,
            totaal_incl: totalen.incl,
          },
          nieuweRegels.map((r) => ({
            omschrijving: omschrijvingVoorOpslag(r, eenheden),
            type: r.type,
            aantal: veldNaarNummer(r.aantal),
            prijs_per: veldNaarNummer(r.prijs),
            btw_pct: r.btwPct,
            btw_regime: r.btwRegime,
          })),
        );
      },
      {
        onSuccess: async () => {
          setConcept(null);
          setNieuweRegels([]);
          await herlaad();
        },
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
      });
    });
  };

  const openRegels = async (o: OfferteRow) => {
    setRegelsVoor(o);
    setNieuweRegel(LEGE_REGEL);
    setRegels([]);
    const { data } = await getOfferteItems(o.id);
    setRegels(data);
  };

  const herlaadRegels = async (offerteId: string) => {
    const { data } = await getOfferteItems(offerteId);
    setRegels(data);
    // De kop volgt de regels; anders toont de lijst een ander bedrag dan de
    // offerte zelf.
    await herberekenOfferteTotalen(offerteId);
    await herlaad();
  };

  const regelToevoegen = () => {
    if (!regelsVoor) return;
    const offerteId = regelsVoor.id;
    saveRegel(
      () =>
        createOfferteItem({
          offerte_id: offerteId,
          omschrijving: nieuweRegel.omschrijving,
          eenheid: nieuweRegel.eenheid || null,
          aantal: Number(nieuweRegel.aantal.replace(',', '.') || 0),
          prijs_per: Number(nieuweRegel.prijs.replace(',', '.') || 0),
          btw_pct: Number(regelsVoor.btw_pct ?? 21),
          volgorde: regels.length,
        }),
      {
        onSuccess: async () => {
          setNieuweRegel(LEGE_REGEL);
          await herlaadRegels(offerteId);
        },
      },
    );
  };

  const regelVerwijderen = (r: OfferteItem) => {
    bevestigVerwijderen('Regel', () => {
      saveRegel(() => deleteOfferteItem(r.id), {
        onSuccess: async () => herlaadRegels(r.offerte_id),
      });
    });
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

  const regelsOpSlot = regelsVoor ? inhoudLigtVast(regelsVoor) : false;

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
                <HeaderIconButton icon={Plus} label="Nieuwe offerte" onPress={openNieuw} />
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
                        <Text style={styles.bedrag}>{formatEUR(Number(o.totaal_incl ?? 0))}</Text>
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
              <Button label="PDF bekijken" onPress={() => bekijkPdf(detail, false)} style={styles.knop} />
              {detail.signed_at ? (
                <Button
                  label="Getekende offerte"
                  variant="secondary"
                  onPress={() => bekijkPdf(detail, true)}
                  style={styles.knop}
                />
              ) : null}
              {magWijzigen ? (
                <Button
                  label="Bewerken"
                  variant="secondary"
                  onPress={() => {
                    const o = detail;
                    setDetail(null);
                    openBewerk(o);
                  }}
                  style={styles.knop}
                />
              ) : null}
              <Button
                label="Regels"
                variant="ghost"
                onPress={() => {
                  const o = detail;
                  setDetail(null);
                  void openRegels(o);
                }}
                style={styles.knop}
              />
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
              {detail.geaccepteerd_op ? (
                <DetailRij label="Geaccepteerd" waarde={formatDateNL(detail.geaccepteerd_op)} />
              ) : null}
            </View>

            {detailData?.vervangen_op ? (
              <NoticeBanner
                toon="info"
                message={`Deze offerte is vervangen door een nieuwere versie${
                  detailData.vervangen_door_nummer ? ` (${detailData.vervangen_door_nummer})` : ''
                }.`}
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
                <Text style={styles.label}>Notities</Text>
                <Text style={styles.uitleg}>{alsTekst(detail.notes)}</Text>
              </View>
            ) : null}

            {detail.signed_at ? (
              <View style={[styles.getekend, { backgroundColor: t.statusApproveBg }]}>
                <Text style={[styles.getekendTekst, { color: t.statusApproveFg }]}>
                  Ondertekend{detailData?.signed_by_name ? ` door ${detailData.signed_by_name}` : ''} op{' '}
                  {formatDateNL(detail.signed_at)}
                </Text>
              </View>
            ) : null}

            <Text style={styles.uitleg}>
              Versturen per mail en een nieuwe versie maken doe je in het dashboard.
            </Text>
          </ScrollView>
        ) : null}
        {/* In het paneel, zodat hij op iOS bovenop het paneel opent. */}
        <PdfWeergave document={pdfDoc} onSluit={() => setPdfDoc(null)} />
      </Paneel>

      {/* Offerte aanmaken / bewerken */}
      <FormSheet
        visible={concept !== null}
        title={concept?.id ? 'Offerte bewerken' : 'Nieuwe offerte'}
        subtitle={concept?.id ? undefined : 'Het nummer wordt automatisch toegekend'}
        error={saveError}
        saving={saving}
        submitDisabled={
          !concept?.id && (!concept?.customerId || (magRegels && nieuweRegels.length === 0))
        }
        onSubmit={opslaan}
        onClose={() => setConcept(null)}
        destructive={
          concept?.id && magVerwijderen
            ? { label: 'Offerte verwijderen', onPress: verwijderen }
            : undefined
        }
      >
        {concept?.opSlot ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              Deze offerte is verstuurd of ondertekend. De inhoud ligt vast; alleen de status kun
              je nog aanpassen.
            </Text>
          </View>
        ) : null}

        {concept?.id ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRij}>
              {OFFERTE_STATUS_OPTIES.map((s) => {
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
          disabled={concept?.opSlot}
        />
        {deals.length > 0 ? (
          <SelectField
            label="Deal"
            value={concept?.dealId ?? null}
            options={deals}
            onChange={(id) => setConcept((c) => (c ? { ...c, dealId: id } : c))}
            allowEmpty
            emptyLabel="Geen deal"
            placeholder="Geen deal"
            disabled={concept?.opSlot}
          />
        ) : null}
        <FormField
          label="Omschrijving"
          value={concept?.omschrijving ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, omschrijving: v } : c))}
          placeholder="Waar gaat de offerte over?"
          editable={!concept?.opSlot}
        />
        <View style={styles.rij}>
          <View style={{ flex: 1.4 }}>
            <DateField
              label="Geldig tot"
              value={concept?.geldigTot || null}
              onChange={(v) => setConcept((c) => (c ? { ...c, geldigTot: v } : c))}
              placeholder="Kies"
              disabled={concept?.opSlot}
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Btw %"
              value={concept?.btwPct ?? ''}
              onChangeText={(v) => setConcept((c) => (c ? { ...c, btwPct: v } : c))}
              placeholder="21"
              keyboardType="decimal-pad"
              editable={!concept?.opSlot}
            />
          </View>
        </View>
        <FormField
          label="Notities"
          value={concept?.notes ?? ''}
          onChangeText={(v) => setConcept((c) => (c ? { ...c, notes: v } : c))}
          placeholder="Optioneel"
          multiline
          editable={!concept?.opSlot}
        />

        {/* Regels horen bij het aanmaken, net als in het dashboard: één
            handeling, één set totalen. Bij een bestaande offerte blijven de
            regels in hun eigen blad staan — daar kun je ze los toevoegen en
            verwijderen zonder de kop te raken. */}
        {concept && !concept.id && !magRegels ? (
          <NoticeBanner
            toon="waarschuwing"
            message={
              waaromNiet('offerteRegels', 'maken') ??
              'Je mag geen offerteregels toevoegen. Vraag een beheerder om het recht Offertes.'
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
      </FormSheet>

      {/* Offerteregels */}
      <FormSheet
        visible={regelsVoor !== null}
        title="Offerteregels"
        subtitle={regelsVoor?.nummer ?? undefined}
        error={regelFout}
        saving={regelBezig}
        submitLabel="Regel toevoegen"
        submitDisabled={
          !magRegels || regelsOpSlot || !nieuweRegel.omschrijving.trim() || !nieuweRegel.prijs.trim()
        }
        onSubmit={regelToevoegen}
        onClose={() => setRegelsVoor(null)}
      >
        {regelsOpSlot ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              Deze offerte is verstuurd of ondertekend; de regels liggen vast.
            </Text>
          </View>
        ) : !magRegels ? (
          <View style={styles.slotBanner}>
            <Text style={styles.slotTekst}>
              {waaromNiet('offerteRegels', 'maken') ??
                'Offerteregels wijzigen vraagt het recht Offertes.'}
            </Text>
          </View>
        ) : (
          <>
            <FormField
              label="Omschrijving"
              value={nieuweRegel.omschrijving}
              onChangeText={(v) => setNieuweRegel((r) => ({ ...r, omschrijving: v }))}
              placeholder="Bijv. Dakpannen vervangen"
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
              <View style={{ flex: 1 }}>
                <FormField
                  label="Eenheid"
                  value={nieuweRegel.eenheid}
                  onChangeText={(v) => setNieuweRegel((r) => ({ ...r, eenheid: v }))}
                  placeholder="stuk, m²"
                />
              </View>
              <View style={{ flex: 1.2 }}>
                <FormField
                  label="Prijs per"
                  value={nieuweRegel.prijs}
                  onChangeText={(v) => setNieuweRegel((r) => ({ ...r, prijs: v }))}
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </>
        )}

        {regels.length === 0 ? (
          <Text style={styles.uitleg}>Deze offerte heeft nog geen regels.</Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {regels.map((r) => (
              <View key={r.id} style={styles.regel}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.regelTitel}>{r.omschrijving}</Text>
                  <Text style={styles.regelMeta}>
                    {r.aantal} {r.eenheid ?? ''} × {formatEUR(r.prijs_per)}
                  </Text>
                </View>
                <Text style={styles.bedrag}>{formatEUR(r.subtotaal)}</Text>
                {magRegels && !regelsOpSlot ? (
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
    getekend: { padding: spacing.md, borderRadius: radius.md, gap: 4 },
    getekendTekst: { fontSize: 13.5, fontWeight: '700' },
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
  });
