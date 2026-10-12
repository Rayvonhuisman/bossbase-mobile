import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FileText, Lock, Plus, Trash2 } from 'lucide-react-native';
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
  getOfferteItems,
  herberekenOfferteTotalen,
  inhoudLigtVast,
  listOffertes,
  OFFERTE_STATUS_OPTIES,
  updateOfferte,
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

/**
 * Offertes — dezelfde `offertes` + `offerte_items` als het dashboard.
 *
 * Twee gates die uit elkaar lopen en die je hier apart terugziet:
 * de offerte zelf hangt op het recht `offertes`, de REGELS hangen op de ROL
 * (admin of planner). Een medewerker met offerterecht kan dus wel een offerte
 * openen en de status bijwerken, en geen regels toevoegen. Verder ligt de
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
  if (o.omschrijving) delen.push(o.omschrijving);
  if (o.geldig_tot) delen.push(`Geldig t/m ${formatDateNL(o.geldig_tot)}`);
  return delen.join(' · ') || 'Offerte';
}

function OffersScreenInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();

  const [items, setItems] = useState<OfferteRow[]>([]);
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
      notes: o.notes ?? '',
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
        ) : (
          <>
            <AppSection title="Alle offertes" count={items.length} variant="eyebrow" />
            <AppListGroup>
              {items.map((o, i) => (
                <AppListItem
                  key={o.id}
                  first={i === 0}
                  icon={inhoudLigtVast(o) ? Lock : FileText}
                  title={`${o.nummer ?? 'Offerte'}`}
                  subtitle={subtitleFor(o)}
                  onPress={magWijzigen ? () => openBewerk(o) : undefined}
                  trailing={
                    <View style={styles.trailing}>
                      <Text style={styles.bedrag}>{formatEUR(Number(o.totaal_incl ?? 0))}</Text>
                      <Pressable
                        onPress={() => openRegels(o)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Regels van ${o.nummer ?? 'offerte'}`}
                        style={styles.regelKnop}
                      >
                        <FileText size={15} color={t.muted} />
                      </Pressable>
                    </View>
                  }
                />
              ))}
            </AppListGroup>
          </>
        )}
      </AppScreen>

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
              'Je mag wel een offerte aanmaken, maar geen regels toevoegen. Vraag een beheerder of planner om de regels te zetten.'
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
                'Offerteregels wijzigen kan alleen als beheerder of planner.'}
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
    trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
