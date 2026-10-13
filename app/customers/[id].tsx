import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Dialog } from '@/lib/dialog';
import { StatusBar } from 'expo-status-bar';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mail, Navigation as NavigationIcon, Pencil, Phone } from 'lucide-react-native';
import {
  ActivityFormSheet,
  AnimatedScreen,
  AppTopBar,
  Button,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  StatusBadge,
  StatusBarScrim,
  conceptVanActiviteit,
  leegConcept,
  type ActivityConcept,
  type SelectOption,
} from '@/components';
import {
  GegevensRij,
  KaartBlok,
  KaartCijfers,
  KaartKolommen,
  KaartLeeg,
  KaartPil,
  KaartRij,
} from '@/components/RelatieKaart';
import { useAuth, usePermissions, useTheme } from '@/providers';
import {
  deleteCustomer,
  getCustomer,
  listKlantActiviteiten,
  listKlantFacturen,
  listKlantOffertes,
  listKlantProjecten,
  listKlantWerkbonnen,
  updateCustomer,
  type KlantFactuur,
  type KlantOfferte,
  type KlantProject,
  type KlantWerkbon,
} from '@/services/customerService';
import { activiteitTypeLabel, type ActivityRow } from '@/services/activityService';
import { listCompanyProfiles } from '@/services/teamService';
import { OFFERTE_STATUS } from '@/services/offerteService';
import { factuurStatusLabel } from '@/services/factuurService';
import { projectStatusLabel } from '@/services/projectService';
import { callPhone, openMaps, sendMail } from '@/lib/linking';
import { bevestigVerwijderen, useSave } from '@/lib/useSave';
import { createNote, listNotes, type NoteRow } from '@/services/noteService';
import { formatDateNL, formatEUR } from '@/lib/format';
import { ds, type ThemeColors } from '@/theme';
import type { Customer, WorkOrderStatus } from '@/types/domain';
import { maakThemaStijlen, useStyles } from '@/lib/useStyles';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { alsTekst } from '@/lib/notitieTekst';
import { klantTotalen, komendePlanRegels, lokaleDatumTijd, planRegels } from '@/lib/relaties';

/**
 * Klantkaart — de blokken van `CustomerPage` in het dashboard: planning,
 * notities, activiteiten, offertes, facturen, projecten en werkbonnen, met de
 * snelle cijfers bovenaan.
 *
 * Rechten (zoals het dashboard, en strakker waar het dashboard RLS laat
 * filteren): offertes alleen met `offertes`, facturen met `facturen`,
 * projecten met `projecten`, bedragen met `projectbedragen`. Bewerken vraagt
 * `klanten_bewerken`, verwijderen `klanten_verwijderen`.
 *
 * Op een iPad of desktop staat de kaart in twee kolommen (gegevens, planning
 * en notities links; activiteiten en documenten rechts); op een telefoon en in
 * een smalle Split View onder elkaar.
 */

/** De bewerkbare velden van een klant. */
type KlantConcept = {
  name: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  kvk: string;
  btw: string;
  iban: string;
  notes: string;
};

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

function isZakelijk(c: Customer): boolean {
  return !!(c.kvk_number && c.kvk_number.trim());
}

function vandaagIso(): string {
  return lokaleDatumTijd(new Date().toISOString())?.datum ?? new Date().toISOString().slice(0, 10);
}

/** Status van een activiteit zoals het dashboard hem toont (berekend, niet opgeslagen). */
function activiteitStatus(
  a: ActivityRow,
  vandaag: string,
): { tekst: string; toon: 'neutraal' | 'goed' | 'let-op' } {
  if (a.completed) return { tekst: 'Gereed', toon: 'goed' };
  const d = lokaleDatumTijd(a.due_at)?.datum;
  if (d && d < vandaag) return { tekst: 'Te laat', toon: 'let-op' };
  if (d && d === vandaag) return { tekst: 'Vandaag', toon: 'neutraal' };
  return { tekst: 'Open', toon: 'neutraal' };
}

const bedragTekst = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : formatEUR(Number(v));

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CustomerDetailScreen() {
  const styles = useStyles(themaStijlen);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { companyId, role } = useAuth();
  const { colors: th, colorMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { loaded: rechtenGeladen, mag, can } = usePermissions();

  const magOffertes = rechtenGeladen && can('offertes');
  const magFacturen = rechtenGeladen && can('facturen');
  const magProjecten = rechtenGeladen && can('projecten');
  const magBedragen = rechtenGeladen && can('projectbedragen');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [concept, setConcept] = useState<KlantConcept | null>(null);
  const [notities, setNotities] = useState<NoteRow[]>([]);
  const [alleNotities, setAlleNotities] = useState(false);
  const [allePlanning, setAllePlanning] = useState(false);
  const [nieuweNotitie, setNieuweNotitie] = useState('');
  const { save, saving, error: saveError, setError: setSaveError } = useSave<unknown>();
  const { save: saveNotitie, saving: notitieBezig, error: notitieFout } = useSave<unknown>();
  const [werkbonnen, setWerkbonnen] = useState<KlantWerkbon[]>([]);
  const [activiteiten, setActiviteiten] = useState<ActivityRow[]>([]);
  const [offertes, setOffertes] = useState<KlantOfferte[]>([]);
  const [facturen, setFacturen] = useState<KlantFactuur[]>([]);
  const [projecten, setProjecten] = useState<KlantProject[]>([]);
  const [medewerkers, setMedewerkers] = useState<SelectOption[]>([]);
  const [activiteitConcept, setActiviteitConcept] = useState<ActivityConcept | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async () => {
      if (!id) return;
      setError(null);

      const leeg = { data: [], error: null };
      const [custResp, woResp, noteResp, actResp, offResp, facResp, projResp, teamResp] =
        await Promise.all([
          getCustomer(id),
          listKlantWerkbonnen(id),
          listNotes({ customerId: id }),
          listKlantActiviteiten(id),
          magOffertes ? listKlantOffertes(id) : Promise.resolve(leeg),
          magFacturen ? listKlantFacturen(id) : Promise.resolve(leeg),
          magProjecten ? listKlantProjecten(id) : Promise.resolve(leeg),
          listCompanyProfiles(),
        ]);

      if (custResp.error || !custResp.data) {
        setError(custResp.error ?? 'Klant niet gevonden.');
        setCustomer(null);
        return;
      }
      // RLS filtert op company_id — extra defensive check:
      if (companyId && custResp.data.company_id !== companyId) {
        setError('Deze klant hoort niet bij jouw bedrijf.');
        setCustomer(null);
        return;
      }
      setCustomer(custResp.data);

      // De blokken zijn bijzaak: mislukt er één, dan blijft de kaart staan en
      // houdt dat blok zijn vorige stand.
      if (!woResp.error) setWerkbonnen(woResp.data);
      if (!noteResp.error) setNotities(noteResp.data);
      if (!actResp.error) setActiviteiten(actResp.data);
      if (!offResp.error) setOffertes(offResp.data as KlantOfferte[]);
      if (!facResp.error) setFacturen(facResp.data as KlantFactuur[]);
      if (!projResp.error) setProjecten(projResp.data as KlantProject[]);
      if (!teamResp.error) {
        setMedewerkers(
          teamResp.data
            .filter((p) => p.actief)
            .map((p) => ({ id: p.id, label: p.full_name, sub: p.role })),
        );
      }
    },
    [id, companyId, magOffertes, magFacturen, magProjecten],
  );

  /**
   * Stille verversing bij terugkeer op dit scherm; `refreshing` blijft
   * voorbehouden aan een echte pull-to-refresh. Wacht op de rechten, zodat de
   * offertes/facturen/projecten meteen met het juiste recht geladen worden.
   */
  const { loading, refreshing, onRefresh, herlaad, opnieuw } = useLaden(load, {
    onFout: setError,
    klaarOmTeLaden: rechtenGeladen,
  });

  const vandaag = vandaagIso();
  const regels = useMemo(() => planRegels(werkbonnen, activiteiten), [werkbonnen, activiteiten]);
  const totalen = useMemo(() => klantTotalen(facturen), [facturen]);
  const werkbonnenOpDatum = useMemo(
    () => [...werkbonnen].sort((a, b) => (b.gepland_op ?? '').localeCompare(a.gepland_op ?? '')),
    [werkbonnen],
  );

  const onCall = () => {
    if (!callPhone(customer?.phone)) {
      Dialog.alert('Geen telefoonnummer', 'Voor deze klant is geen nummer bekend.');
    }
  };
  const onMail = () => {
    if (!sendMail(customer?.email)) {
      Dialog.alert('Geen e-mailadres', 'Voor deze klant is geen e-mail bekend.');
    }
  };
  const onNavigate = () => {
    const addr = [customer?.address, customer?.postcode, customer?.city]
      .filter(Boolean)
      .join(', ');
    if (!openMaps(addr)) {
      Dialog.alert('Geen adres', 'Voor deze klant is geen adres bekend.');
    }
  };

  if (loading && !customer) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          <AppTopBar variant="detail" title="Klant" onBack={() => terugOfNaar(router, '/customers')} />
          <LoadingScreen label="Klant laden..." />
        </View>
      </>
    );
  }
  if (error || !customer) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.bg }}>
          <AppTopBar variant="detail" title="Klant" onBack={() => terugOfNaar(router, '/customers')} />
          <ErrorState
            title="Klant niet gevonden"
            message={error ?? 'Deze klant bestaat niet of je hebt geen toegang.'}
            onRetry={opnieuw}
          />
        </View>
      </>
    );
  }

  const name = customer.name ?? '—';
  const tag = isZakelijk(customer) ? 'Zakelijk' : 'Particulier';
  const fullAddress = [customer.address, customer.postcode, customer.city]
    .filter(Boolean)
    .join(', ');
  const klantOptie: SelectOption[] = [{ id: customer.id, label: name, sub: customer.city ?? undefined }];

  // Inplannen: een werkbon vraagt planning of werkbonnen_bewerken (en de rol
  // die werkbonnen mag aanmaken); een los item mag iedereen.
  const magWerkbonInplannen =
    rechtenGeladen && (can('planning') || can('werkbonnen_bewerken')) && mag('werkbonnen', 'maken');
  const magActiviteitMaken = rechtenGeladen && mag('activiteiten', 'maken');
  const magActiviteitBewerken =
    mag('activiteiten', 'wijzigen') && (role === 'admin' || role === 'planner');
  const magNotitie = rechtenGeladen && mag('notities', 'maken');

  const nieuweActiviteit = () => setActiviteitConcept({ ...leegConcept(), customerId: customer.id });
  const nieuweWerkbon = () =>
    router.push({ pathname: '/work-orders/new', params: { customerId: customer.id } });

  const planningToevoegen = () => {
    if (magWerkbonInplannen && magActiviteitMaken) {
      Dialog.alert('Inplannen', 'Wat wil je inplannen voor deze klant?', [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Werkbon inplannen', onPress: nieuweWerkbon },
        { text: 'Los item inplannen', onPress: nieuweActiviteit },
      ]);
    } else if (magActiviteitMaken) {
      nieuweActiviteit();
    } else if (magWerkbonInplannen) {
      nieuweWerkbon();
    }
  };

  const openPlanRegel = (soort: 'werkbon' | 'los', regelId: string) => {
    if (soort === 'werkbon') {
      router.push(`/work-orders/${regelId}`);
      return;
    }
    const a = activiteiten.find((x) => x.id === regelId);
    if (a) setActiviteitConcept(conceptVanActiviteit(a));
  };

  const zichtbarePlanning = allePlanning ? regels : komendePlanRegels(regels, vandaag, 4);
  const zichtbareNotities = alleNotities ? notities : notities.slice(0, 2);

  // ── Linkerkolom: gegevens, planning, notities ─────────────────────────────
  const linkerKolom = (
    <>
      <KaartBlok titel="Gegevens">
        <GegevensRij eerste label="Telefoon" waarde={customer.phone} onPress={onCall} />
        <GegevensRij label="E-mail" waarde={customer.email} onPress={onMail} />
        <GegevensRij label="Adres" waarde={fullAddress} onPress={onNavigate} />
        {customer.kvk_number ? <GegevensRij label="KvK" waarde={customer.kvk_number} /> : null}
        {customer.btw_number ? <GegevensRij label="Btw" waarde={customer.btw_number} /> : null}
        {customer.iban ? <GegevensRij label="IBAN" waarde={customer.iban} /> : null}
      </KaartBlok>

      <KaartBlok
        titel="Planning"
        aantal={regels.length}
        onToevoegen={magWerkbonInplannen || magActiviteitMaken ? planningToevoegen : undefined}
        toevoegLabel="Inplannen voor deze klant"
        actie={regels.length > 4 ? (allePlanning ? 'Minder' : `Alles (${regels.length})`) : undefined}
        onActie={() => setAllePlanning((v) => !v)}
      >
        {zichtbarePlanning.length === 0 ? (
          <KaartLeeg tekst="Nog niets ingepland voor deze klant." />
        ) : (
          zichtbarePlanning.map((r, i) => (
            <KaartRij
              key={r.sleutel}
              eerste={i === 0}
              gedimd={r.datum < vandaag}
              titel={r.titel}
              sub={[
                r.datum === vandaag ? 'Vandaag' : formatDateNL(r.datum),
                r.starttijd ? `${r.starttijd}${r.eindtijd ? `–${r.eindtijd}` : ''}` : null,
                r.soort === 'werkbon' ? 'Werkbon' : 'Los item',
              ]
                .filter(Boolean)
                .join(' · ')}
              rechts={r.soort === 'werkbon' && r.status ? <StatusBadge status={r.status as WorkOrderStatus} /> : undefined}
              onPress={() => openPlanRegel(r.soort, r.id)}
            />
          ))
        )}
      </KaartBlok>

      {/* Notities — `klant_tijdlijn` met type 'notitie_toegevoegd', zoals het
          dashboard. Dashboard-HTML (met @-vermeldingen) wordt als tekst
          getoond; nieuwe notities gaan als veilige HTML terug. */}
      <KaartBlok
        titel="Notities"
        aantal={notities.length}
        actie={
          notities.length > 2 ? (alleNotities ? 'Minder' : `Alle notities (${notities.length})`) : undefined
        }
        onActie={() => setAlleNotities((v) => !v)}
      >
        {magNotitie ? (
          <View style={styles.notitieInvoer}>
            <FormField
              label="Nieuwe notitie"
              value={nieuweNotitie}
              onChangeText={setNieuweNotitie}
              placeholder="Wat moet er bewaard blijven?"
              multiline
            />
            {notitieFout ? <Text style={styles.notitieFout}>{notitieFout}</Text> : null}
            <Button
              label={notitieBezig ? 'Opslaan…' : 'Toevoegen'}
              variant="secondary"
              loading={notitieBezig}
              disabled={!nieuweNotitie.trim() || notitieBezig}
              onPress={() => {
                if (!id) return;
                saveNotitie(() => createNote({ body: nieuweNotitie, customer_id: id }), {
                  onSuccess: async () => {
                    setNieuweNotitie('');
                    const { data } = await listNotes({ customerId: id });
                    setNotities(data);
                  },
                });
              }}
            />
          </View>
        ) : null}
        {notities.length === 0 ? (
          <KaartLeeg tekst="Nog geen notities bij deze klant." />
        ) : (
          zichtbareNotities.map((n, i) => (
            <KaartRij
              key={n.id}
              eerste={i === 0 && !magNotitie}
              titel={[formatDateNL(n.created_at), n.auteurNaam].filter(Boolean).join(' · ')}
              sub={n.body}
            />
          ))
        )}
      </KaartBlok>
    </>
  );

  // ── Rechterkolom: activiteiten, offertes, facturen, projecten, werkbonnen ──
  const rechterKolom = (
    <>
      <KaartBlok
        titel="Activiteiten"
        aantal={activiteiten.length}
        onToevoegen={magActiviteitMaken ? nieuweActiviteit : undefined}
        toevoegLabel="Nieuwe activiteit"
      >
        {activiteiten.length === 0 ? (
          <KaartLeeg tekst="Geen activiteiten" />
        ) : (
          activiteiten.slice(0, 8).map((a, i) => {
            const st = activiteitStatus(a, vandaag);
            const tijd = lokaleDatumTijd(a.due_at)?.tijd;
            return (
              <KaartRij
                key={a.id}
                eerste={i === 0}
                titel={a.title || 'Activiteit'}
                sub={[activiteitTypeLabel(a.type), a.due_at ? formatDateNL(a.due_at) : null, tijd]
                  .filter(Boolean)
                  .join(' · ')}
                rechts={<KaartPil tekst={st.tekst} toon={st.toon} />}
                onPress={() => setActiviteitConcept(conceptVanActiviteit(a))}
              />
            );
          })
        )}
      </KaartBlok>

      {magOffertes ? (
        <KaartBlok
          titel="Offertes"
          aantal={offertes.length}
          actie={offertes.length ? 'Alle offertes' : undefined}
          onActie={() => router.push('/offers')}
        >
          {offertes.length === 0 ? (
            <KaartLeeg tekst="Nog geen offertes voor deze klant." />
          ) : (
            offertes.map((o, i) => (
              <KaartRij
                key={o.id}
                eerste={i === 0}
                titel={o.nummer || 'Offerte'}
                sub={alsTekst(o.omschrijving) || formatDateNL(o.created_at)}
                rechts={
                  <View style={styles.rechtsKolom}>
                    {magBedragen ? <Text style={styles.bedrag}>{bedragTekst(o.totaal_incl)}</Text> : null}
                    <KaartPil
                      tekst={OFFERTE_STATUS[o.status ?? 'concept'] ?? o.status ?? 'Concept'}
                      toon={
                        o.status === 'geaccepteerd' ? 'goed' : o.status === 'afgewezen' ? 'let-op' : 'neutraal'
                      }
                    />
                  </View>
                }
                onPress={() => router.push({ pathname: '/offers', params: { id: o.id } })}
              />
            ))
          )}
        </KaartBlok>
      ) : null}

      {magFacturen ? (
        <KaartBlok
          titel="Facturen"
          aantal={facturen.length}
          actie={facturen.length ? 'Alle facturen' : undefined}
          onActie={() => router.push('/invoices')}
        >
          {facturen.length === 0 ? (
            <KaartLeeg tekst="Nog geen facturen voor deze klant." />
          ) : (
            facturen.map((f, i) => (
              <KaartRij
                key={f.id}
                eerste={i === 0}
                titel={f.nummer || 'Factuur'}
                sub={alsTekst(f.notities) || formatDateNL(f.factuurdatum ?? f.created_at)}
                rechts={
                  <View style={styles.rechtsKolom}>
                    <Text style={styles.bedrag}>{bedragTekst(f.totaal_incl)}</Text>
                    <KaartPil
                      tekst={f.is_credit ? 'Credit' : factuurStatusLabel(f.status)}
                      toon={f.status === 'betaald' ? 'goed' : 'neutraal'}
                    />
                  </View>
                }
                onPress={() => router.push({ pathname: '/invoices', params: { id: f.id } })}
              />
            ))
          )}
        </KaartBlok>
      ) : null}

      {magProjecten ? (
        <KaartBlok
          titel="Projecten"
          aantal={projecten.length}
          actie={projecten.length ? 'Alle projecten' : undefined}
          onActie={() => router.push('/projects')}
        >
          {projecten.length === 0 ? (
            <KaartLeeg tekst="Nog geen projecten voor deze klant." />
          ) : (
            projecten.map((p, i) => (
              <KaartRij
                key={p.id}
                eerste={i === 0}
                titel={p.name || 'Project'}
                sub={
                  magBedragen && p.project_value != null
                    ? `Projectwaarde ${formatEUR(Number(p.project_value))}`
                    : null
                }
                rechts={<KaartPil tekst={projectStatusLabel(p.status)} />}
                onPress={() => router.push({ pathname: '/projects', params: { id: p.id } })}
              />
            ))
          )}
        </KaartBlok>
      ) : null}

      <KaartBlok
        titel="Werkbonnen"
        aantal={werkbonnen.length}
        onToevoegen={magWerkbonInplannen ? nieuweWerkbon : undefined}
        toevoegLabel="Nieuwe werkbon"
      >
        {werkbonnenOpDatum.length === 0 ? (
          <KaartLeeg tekst="Nog geen werkbonnen voor deze klant." />
        ) : (
          werkbonnenOpDatum.map((w, i) => (
            <KaartRij
              key={w.id}
              eerste={i === 0}
              titel={[w.nummer, w.titel].filter(Boolean).join(' · ') || 'Werkbon'}
              sub={[w.gepland_op ? formatDateNL(w.gepland_op) : 'Niet gepland', alsTekst(w.omschrijving)]
                .filter(Boolean)
                .join(' · ')}
              rechts={w.status ? <StatusBadge status={w.status as WorkOrderStatus} /> : undefined}
              onPress={() => router.push(`/work-orders/${w.id}`)}
            />
          ))
        )}
      </KaartBlok>
    </>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, backgroundColor: th.bg }}>
        <StatusBar style={colorMode === 'dark' ? 'light' : 'dark'} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
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
            onBack={() => terugOfNaar(router, '/customers')}
            eyebrow="Klant"
            title={name}
            subtitle={[customer.city, tag].filter(Boolean).join(' · ') || undefined}
            rightAction={
              rechtenGeladen && mag('klanten', 'wijzigen') ? (
                <HeaderIconButton
                  icon={Pencil}
                  label="Klant bewerken"
                  variant="plain"
                  onPress={() => {
                    setSaveError(null);
                    setConcept({
                      name: customer.name ?? '',
                      email: customer.email ?? '',
                      phone: customer.phone ?? '',
                      address: customer.address ?? '',
                      postcode: customer.postcode ?? '',
                      city: customer.city ?? '',
                      kvk: customer.kvk_number ?? '',
                      btw: customer.btw_number ?? '',
                      iban: customer.iban ?? '',
                      notes: alsTekst(customer.notes),
                    });
                  }}
                />
              ) : undefined
            }
          />
          <AnimatedScreen>
            {/* Hero */}
            <View style={styles.hero}>
              <View style={styles.heroAvatar}>
                <Text style={styles.heroAvatarText}>{initials(name)}</Text>
              </View>
              <Text style={[styles.heroName, { color: th.ink }]} numberOfLines={2}>
                {name}
              </Text>
              <View style={styles.heroBadgeRow}>
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>{tag}</Text>
                </View>
                {customer.kvk_number ? (
                  <Text style={styles.heroKvk}>KvK {customer.kvk_number}</Text>
                ) : null}
              </View>
            </View>

            {/* Quick actions */}
            <View style={styles.actionsRow}>
              <ActionBtn
                icon={<Phone size={18} color={ds.greenInk} strokeWidth={2.4} />}
                label="Bellen"
                primary
                disabled={!customer.phone}
                onPress={onCall}
              />
              <ActionBtn
                icon={<NavigationIcon size={18} color={th.ink} strokeWidth={2} />}
                label="Route"
                disabled={!customer.address && !customer.city}
                onPress={onNavigate}
              />
              <ActionBtn
                icon={<Mail size={18} color={th.ink} strokeWidth={2} />}
                label="Mail"
                disabled={!customer.email}
                onPress={onMail}
              />
            </View>

            {/* Snelle cijfers: alleen met projectbedragen, en de factuurbedragen
                alleen met het factuurrecht. */}
            {magBedragen && magFacturen ? (
              <KaartCijfers
                cijfers={[
                  { label: 'Gefactureerd', waarde: formatEUR(totalen.gefactureerd) },
                  {
                    label: 'Betaald',
                    waarde: formatEUR(totalen.betaald),
                    toon: totalen.betaald > 0 ? 'goed' : undefined,
                  },
                  { label: 'Openstaand', waarde: formatEUR(totalen.openstaand) },
                ]}
              />
            ) : null}

            <KaartKolommen links={linkerKolom} rechts={rechterKolom} />
          </AnimatedScreen>
        </ScrollView>
        <StatusBarScrim />

        <ActivityFormSheet
          concept={activiteitConcept}
          klanten={klantOptie}
          medewerkers={medewerkers}
          magBewerken={magActiviteitBewerken}
          onClose={() => setActiviteitConcept(null)}
          onSaved={() => herlaad()}
        />

        <FormSheet
          visible={concept !== null}
          title="Klant bewerken"
          subtitle={customer.name ?? undefined}
          error={saveError}
          saving={saving}
          submitDisabled={!concept?.name.trim()}
          onSubmit={() => {
            if (!concept || !id) return;
            save(
              () =>
                updateCustomer(id, {
                  name: concept.name,
                  email: concept.email,
                  phone: concept.phone,
                  address: concept.address,
                  postcode: concept.postcode,
                  city: concept.city,
                  kvk_number: concept.kvk,
                  btw_number: concept.btw,
                  iban: concept.iban,
                  notes: concept.notes,
                }),
              {
                onSuccess: async () => {
                  setConcept(null);
                  await herlaad();
                },
              },
            );
          }}
          onClose={() => setConcept(null)}
          destructive={
            mag('klanten', 'verwijderen')
              ? {
                  label: 'Klant verwijderen',
                  onPress: () =>
                    bevestigVerwijderen(
                      'Klant',
                      () => {
                        if (!id) return;
                        save(() => deleteCustomer(id), {
                          onSuccess: (_data, extra) => {
                            setConcept(null);
                            if (typeof extra?.waarschuwing === 'string') {
                              Dialog.alert('Let op', extra.waarschuwing);
                            }
                            terugOfNaar(router, '/customers');
                          },
                        });
                      },
                      'Werkbonnen, offertes en facturen van deze klant blijven bestaan en blokkeren het verwijderen.',
                    ),
                }
              : undefined
          }
        >
          <FormField
            label="Naam"
            value={concept?.name ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, name: v } : c))}
            placeholder="Bedrijfs- of klantnaam"
          />
          <FormField
            label="E-mail"
            value={concept?.email ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, email: v } : c))}
            placeholder="naam@bedrijf.nl"
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
          <FormField
            label="Telefoon"
            value={concept?.phone ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, phone: v } : c))}
            placeholder="06 12 34 56 78"
            keyboardType="phone-pad"
          />
          <FormField
            label="Adres"
            value={concept?.address ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, address: v } : c))}
            placeholder="Straat en huisnummer"
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <FormField
                label="Postcode"
                value={concept?.postcode ?? ''}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, postcode: v } : c))}
                placeholder="1234 AB"
                autoCapitalize="characters"
              />
            </View>
            <View style={{ flex: 1.4 }}>
              <FormField
                label="Plaats"
                value={concept?.city ?? ''}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, city: v } : c))}
                placeholder="Plaats"
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <FormField
                label="KvK"
                value={concept?.kvk ?? ''}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, kvk: v } : c))}
                placeholder="12345678"
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1.3 }}>
              <FormField
                label="Btw-nummer"
                value={concept?.btw ?? ''}
                onChangeText={(v) => setConcept((c) => (c ? { ...c, btw: v } : c))}
                placeholder="NL123456789B01"
                autoCapitalize="characters"
              />
            </View>
          </View>
          <FormField
            label="IBAN"
            value={concept?.iban ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, iban: v } : c))}
            placeholder="NL00 BANK 0123 4567 89"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <FormField
            label="Notities"
            value={concept?.notes ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, notes: v } : c))}
            placeholder="Optioneel"
            multiline
          />
        </FormSheet>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActionBtn({
  icon,
  label,
  onPress,
  primary,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  const styles = useStyles(themaStijlen);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.actionBtn,
        primary ? styles.actionBtnPrimary : styles.actionBtnGhost,
        disabled && { opacity: 0.4 },
        pressed && !disabled && { opacity: 0.92 },
      ]}
    >
      {icon}
      <Text style={[styles.actionLabel, primary && { color: ds.greenInk }]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    hero: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 18,
      alignItems: 'center',
      gap: 12,
    },
    heroAvatar: {
      width: 72,
      height: 72,
      borderRadius: 22,
      backgroundColor: ds.green,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroAvatarText: {
      fontSize: 26,
      fontWeight: '800',
      color: ds.greenInk,
      letterSpacing: -0.6,
    },
    heroName: {
      fontSize: 22,
      fontWeight: '800',
      color: t.ink,
      letterSpacing: -0.5,
      textAlign: 'center',
    },
    heroBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    heroBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: t.green50,
    },
    heroBadgeText: {
      fontSize: 11.5,
      fontWeight: '800',
      color: t.green700,
    },
    heroKvk: {
      fontSize: 12,
      color: t.muted,
      fontWeight: '600',
    },

    // Actions
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    actionBtn: {
      flex: 1,
      height: 52,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    actionBtnPrimary: {
      backgroundColor: ds.green,
    },
    actionBtnGhost: {
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    actionLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: t.ink,
      letterSpacing: -0.2,
    },

    // Blokken
    rechtsKolom: { alignItems: 'flex-end', gap: 4 },
    bedrag: { fontSize: 14, fontWeight: '700', color: t.ink },
    notitieInvoer: { padding: 14, gap: 10 },
    notitieFout: { fontSize: 12.5, fontWeight: '600', color: t.statusRejectFg },
  });

/**
 * Licht en donker worden één keer opgebouwd; elke component in dit bestand
 * kiest er met `useStyles(themaStijlen)` tussen. Twee stylesheets kosten niets
 * — ze worden eenmalig aangemaakt — en zo mist geen enkele subcomponent het
 * thema.
 */
const themaStijlen = maakThemaStijlen(makeStyles);
