import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock, Plus, Receipt, Trash2 } from 'lucide-react-native';
import {
  AppListGroup,
  AppListItem,
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
  factuurStatusLabel,
  getFactuurRegels,
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

/**
 * Facturen — dezelfde `facturen` + `factuur_regels` als het dashboard.
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

function subtitleFor(f: FactuurRow): string {
  const delen: string[] = [factuurStatusLabel(f.status)];
  if (f.customer?.name) delen.push(f.customer.name);
  if (f.betaald_op) delen.push(`Betaald ${formatDateNL(f.betaald_op)}`);
  else if (f.vervaldatum) delen.push(`Vervalt ${formatDateNL(f.vervaldatum)}`);
  return delen.join(' · ');
}

function InvoicesScreenInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen, mag, waaromNiet } = usePermissions();

  const [items, setItems] = useState<FactuurRow[]>([]);
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

    const [factRes, klantRes, projRes, instRes, eenheidRes] = await Promise.all([
      listFacturen(),
      listCustomers(),
      listProjects(),
      getCompanySettings(),
      listEigenEenheden(),
    ]);

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



  const openNieuw = () => {
    setSaveError(null);
    // Vervaldatum = factuurdatum + de betaaltermijn uit de bedrijfsinstellingen,
    // net als de factuurmodal van het dashboard hem voorinvult.
    const verval = new Date();
    verval.setDate(verval.getDate() + instellingen.geldigDagen);
    setNieuweRegels([legeRegel({ uurtarief: instellingen.uurtarief, btwPct: instellingen.btwPct })]);
    setConcept({
      id: null,
      customerId: null,
      projectId: null,
      factuurdatum: vandaagIso(),
      betaaltermijn: String(instellingen.geldigDagen),
      vervaldatum: isoVanDatum(verval),
      notities: '',
      status: 'concept',
      opSlot: false,
      geimporteerd: false,
    });
  };

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
    Alert.alert(
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
                  Alert.alert('Geen wijziging', 'Deze factuur stond al op betaald.');
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
            if (typeof extra?.waarschuwing === 'string') Alert.alert('Let op', extra.waarschuwing);
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
          header={<AppTopBar variant="detail" title="Facturen" onBack={() => router.back()} />}
        >
          <ErrorState title="Niet geladen" message={error} onRetry={opnieuw} />
        </AppScreen>
      </View>
    );
  }

  const openstaand = items
    .filter((f) => f.status !== 'betaald' && !f.is_credit)
    .reduce((s, f) => s + Number(f.totaal_incl ?? 0), 0);

  const regelsOpSlot = regelsVoor ? inhoudLigtVast(regelsVoor) : false;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Facturen"
            subtitle={`${items.length} ${items.length === 1 ? 'factuur' : 'facturen'}`}
            meta={openstaand > 0 ? `${formatEUR(openstaand)} open` : undefined}
            onBack={() => router.back()}
            rightAction={
              magMaken ? (
                <HeaderIconButton icon={Plus} label="Nieuwe factuur" onPress={openNieuw} />
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
        ) : (
          <>
            <AppSection title="Alle facturen" count={items.length} variant="eyebrow" />
            <AppListGroup>
              {items.map((f, i) => (
                <AppListItem
                  key={f.id}
                  first={i === 0}
                  icon={isGeimporteerd(f) ? Lock : Receipt}
                  title={f.nummer}
                  subtitle={subtitleFor(f)}
                  onPress={magWijzigen ? () => openBewerk(f) : undefined}
                  trailing={
                    <View style={styles.trailing}>
                      <Text style={styles.bedrag}>{formatEUR(Number(f.totaal_incl ?? 0))}</Text>
                      <Pressable
                        onPress={() => openRegels(f)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Regels van ${f.nummer}`}
                        style={styles.regelKnop}
                      >
                        <Receipt size={15} color={t.muted} />
                      </Pressable>
                    </View>
                  }
                />
              ))}
            </AppListGroup>

            {magBetaald ? (
              <Text style={styles.voetnoot}>
                Open een factuur om hem op betaald te zetten. Dat blijft ook werken als je
                account op alleen-lezen staat.
              </Text>
            ) : null}
          </>
        )}
      </AppScreen>

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
        onClose={() => setConcept(null)}
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
