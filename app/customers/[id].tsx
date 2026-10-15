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
import {
  Calendar,
  Download,
  Euro,
  FileText,
  Folder,
  Mail,
  Navigation as NavigationIcon,
  PenLine,
  Pencil,
  Phone,
  RotateCcw,
  ShoppingCart,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import {
  ActivityFormSheet,
  AdresZoeker,
  AnimatedScreen,
  AppTopBar,
  Button,
  ErrorState,
  FormField,
  FormSheet,
  HeaderIconButton,
  LoadingScreen,
  SelectField,
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
  KLANT_TYPES,
  leesBetaaltermijn,
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
import { listKlantTijdlijn, logTijdlijn, type TijdlijnRegel } from '@/services/klantTijdlijnService';
import {
  getBedrijfVoorDocument,
  listKlantMailSjablonen,
  listVerstuurdeMails,
  logVerstuurdeMail,
  verstuurMail,
  type KlantMailSjabloon,
  type VerstuurdeMail,
} from '@/services/documentMailService';
import { pushNotificaties } from '@/services/collegaMeldingService';
import { DocumentMailSheet, type MailConcept } from '@/components/DocumentMailSheet';
import { MailVoorbeeld } from '@/components/werkbon/MailVoorbeeld';
import { klantMailConcept, klantMailHtml } from '@/lib/documentMail';
import {
  ingekort,
  klantMailFout,
  tijdlijnDatum,
  tijdlijnIcoon,
  tijdlijnKleur,
  verstuurdeMailSub,
  type TijdlijnIcoon,
} from '@/lib/klantkaart';
import { mentionMeldingen } from '@/lib/mentions';
import { MentionInvoer, naarHtml, type Getagd } from '@/components/NotitieLog';
import { writeFout, type WriteResult } from '@/lib/writeResult';
import type { PdfBedrijf } from '@/lib/pdf/pdfData';
import { formatDateNL, formatEUR } from '@/lib/format';
import { ds, type ThemeColors } from '@/theme';
import type { Customer, WorkOrderStatus } from '@/types/domain';
import { maakThemaStijlen, useStyles } from '@/lib/useStyles';
import { useLaden } from '@/lib/useLaden';
import { terugOfNaar } from '@/lib/navigatie';
import { alsTekst } from '@/lib/notitieTekst';
import { klantTotalen, klantType, komendePlanRegels, lokaleDatumTijd, planRegels } from '@/lib/relaties';

/**
 * Klantkaart — de blokken van `CustomerPage` in het dashboard: planning,
 * notities (met @-vermeldingen), e-mails, tijdlijn, activiteiten, offertes,
 * facturen, projecten en werkbonnen, met de snelle cijfers bovenaan. Het
 * dashboard heeft tabs; hier is het één pagina met blokken.
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
  type: string | null;
  source: string;
  /** Tekst in het formulier; leeg = de standaard uit Instellingen. */
  betaaltermijn: string;
};

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
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
  const { companyId, profile } = useAuth();
  const { colors: th, colorMode } = useTheme();
  const insets = useSafeAreaInsets();
  const { loaded: rechtenGeladen, mag, can, readonly } = usePermissions();

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
  // @-vermeldingen: de gekozen collega's (MentionInvoer).
  const [gekozen, setGekozen] = useState<Getagd[]>([]);
  const [tijdlijn, setTijdlijn] = useState<TijdlijnRegel[]>([]);
  const [alleTijdlijn, setAlleTijdlijn] = useState(false);
  const [mails, setMails] = useState<VerstuurdeMail[]>([]);
  const [alleMails, setAlleMails] = useState(false);
  const [bekeken, setBekeken] = useState<VerstuurdeMail | null>(null);
  // Het schrijfvak: null = dicht.
  const [mailConcept, setMailConcept] = useState<MailConcept | null>(null);
  const [sjabloonId, setSjabloonId] = useState<string | null>(null);
  const [sjablonen, setSjablonen] = useState<KlantMailSjabloon[]>([]);
  const [bedrijf, setBedrijf] = useState<PdfBedrijf | null>(null);
  const [mailLaden, setMailLaden] = useState(false);
  const { save: saveMail, saving: mailBezig, error: mailFout, setError: setMailFout } = useSave<null>();
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
      const [custResp, woResp, noteResp, actResp, offResp, facResp, projResp, teamResp, tijdResp, mailResp] =
        await Promise.all([
          getCustomer(id),
          listKlantWerkbonnen(id),
          listNotes({ customerId: id }),
          listKlantActiviteiten(id),
          magOffertes ? listKlantOffertes(id) : Promise.resolve(leeg),
          magFacturen ? listKlantFacturen(id) : Promise.resolve(leeg),
          magProjecten ? listKlantProjecten(id) : Promise.resolve(leeg),
          listCompanyProfiles(),
          listKlantTijdlijn(id),
          listVerstuurdeMails(id),
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
      if (!tijdResp.error) setTijdlijn(tijdResp.data);
      if (!mailResp.error) setMails(mailResp.data);
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
  // Opgeslagen klanttype (dashboard 1-10), anders afgeleid van het KvK-nummer.
  const tag = klantType(customer);
  const fullAddress = [customer.address, customer.postcode, customer.city]
    .filter(Boolean)
    .join(', ');
  const klantOptie: SelectOption[] = [{ id: customer.id, label: name, sub: customer.city ?? undefined }];

  // Inplannen: een werkbon vraagt planning of werkbonnen_bewerken (policy
  // `werkbonnen_insert`; admin inbegrepen, geen rol 'planner' meer) en een
  // account dat mag schrijven; een los item mag iedereen.
  const magWerkbonInplannen =
    rechtenGeladen && !readonly && (can('planning') || can('werkbonnen_bewerken'));
  const magActiviteitMaken = rechtenGeladen && mag('activiteiten', 'maken');
  const magOfferteMaken = magOffertes && mag('offertes', 'maken');
  const magFactuurMaken = magFacturen && mag('facturen', 'maken');
  const magProjectMaken = magProjecten && mag('projecten', 'maken');
  const magActiviteitBewerken =
    // Dashboard ActivityEditModal: canEdit = magBewerken('planning').
    mag('activiteiten', 'wijzigen') && can('planning');
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

  // ── Notitie met @-vermeldingen (addNotitieLog + createMentionNotifications) ──
  const notitieToevoegen = () => {
    if (!id) return;
    // Alleen met een tag HTML met mention-span, zoals het dashboard; anders
    // platte tekst zoals altijd.
    const notitie = naarHtml(nieuweNotitie, gekozen);
    const html = notitie.getagd ? notitie.html : undefined;
    saveNotitie(() => createNote({ body: nieuweNotitie, customer_id: id, html }), {
      onSuccess: async () => {
        setNieuweNotitie('');
        setGekozen([]);
        // De getagde collega krijgt een melding en mail; mislukt dat, dan
        // blijft de notitie gewoon staan.
        if (html) {
          void pushNotificaties(
            mentionMeldingen({
              text: html,
              relatedType: 'klant',
              relatedId: id,
              link: 'customers',
              creatorName: profile?.full_name ?? null,
              contextName: customer.name,
            }),
          );
        }
        const [n, t] = await Promise.all([listNotes({ customerId: id }), listKlantTijdlijn(id)]);
        if (!n.error) setNotities(n.data);
        if (!t.error) setTijdlijn(t.data);
      },
    });
  };

  // ── E-mail aan de klant (tab E-mails in het dashboard) ────────────────────
  const openMail = async () => {
    setMailFout(null);
    setSjabloonId(null);
    setMailConcept({ aan: customer.email ?? '', onderwerp: '', tekst: '' });
    setMailLaden(true);
    const [sj, bd] = await Promise.all([listKlantMailSjablonen(), getBedrijfVoorDocument()]);
    setSjablonen(sj.data);
    setBedrijf(bd);
    setMailLaden(false);
  };

  const kiesSjabloon = (sid: string | null) => {
    setSjabloonId(sid);
    const tpl = sjablonen.find((x) => x.id === sid) ?? null;
    const c = klantMailConcept({ sjabloon: tpl, klantNaam: customer.name, bedrijfsnaam: bedrijf?.name });
    setMailConcept((m) => (m ? { ...m, ...c } : m));
  };

  const verstuurKlantMail = () => {
    if (!mailConcept || !id) return;
    const aan = mailConcept.aan.trim();
    const onderwerp = mailConcept.onderwerp;
    const tpl = sjablonen.find((x) => x.id === sjabloonId) ?? null;
    saveMail(
      async (): Promise<WriteResult<null>> => {
        const fout = klantMailFout(mailConcept);
        if (fout) return writeFout('validatie', fout);
        const html = klantMailHtml({
          onderwerp,
          tekst: mailConcept.tekst,
          bedrijfsnaam: bedrijf?.name,
          logoUrl: bedrijf?.logoUrl,
        });
        const verstuurd = await verstuurMail({ to: aan, subject: onderwerp, html });
        if (!verstuurd.ok) return writeFout('onbekend', verstuurd.melding);
        await logVerstuurdeMail({
          toEmail: aan,
          subject: onderwerp,
          bodyHtml: html,
          relatedType: tpl?.type || null,
          customerId: id,
        });
        await logTijdlijn(id, 'email_verstuurd', `E-mail verstuurd: ${onderwerp}`, { to: aan, subject: onderwerp });
        return { ok: true, data: null };
      },
      {
        onSuccess: async () => {
          setMailConcept(null);
          const [m, t] = await Promise.all([listVerstuurdeMails(id), listKlantTijdlijn(id)]);
          if (!m.error) setMails(m.data);
          if (!t.error) setTijdlijn(t.data);
        },
        succesMelding: 'E-mail verstuurd',
      },
    );
  };

  const zichtbareMails = ingekort(mails, alleMails, 5);
  const zichtbareTijdlijn = ingekort(tijdlijn, alleTijdlijn, 8);

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
        {customer.type ? <GegevensRij label="Type" waarde={customer.type} /> : null}
        {customer.source ? <GegevensRij label="Bron" waarde={customer.source} /> : null}
        {customer.betaaltermijn_dagen != null ? (
          <GegevensRij label="Betaaltermijn" waarde={`${customer.betaaltermijn_dagen} dagen`} />
        ) : null}
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
            <MentionInvoer
              label="Nieuwe notitie"
              value={nieuweNotitie}
              onChangeText={setNieuweNotitie}
              gekozen={gekozen}
              onGekozen={setGekozen}
              leden={medewerkers.map((m) => ({ id: m.id, full_name: m.label }))}
              placeholder="Wat moet er bewaard blijven? Typ @ om iemand te taggen"
            />
            {notitieFout ? <Text style={styles.notitieFout}>{notitieFout}</Text> : null}
            <Button
              label={notitieBezig ? 'Opslaan…' : 'Toevoegen'}
              variant="secondary"
              loading={notitieBezig}
              disabled={!nieuweNotitie.trim() || notitieBezig}
              onPress={notitieToevoegen}
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

      {/* E-mails — `sent_emails` van deze klant; het schrijfvak achter de "+". */}
      <KaartBlok
        titel="E-mails"
        aantal={mails.length}
        onToevoegen={() => void openMail()}
        toevoegLabel="Nieuwe e-mail"
        actie={mails.length > 5 ? (alleMails ? 'Minder' : `Alles (${mails.length})`) : undefined}
        onActie={() => setAlleMails((v) => !v)}
      >
        {mails.length === 0 ? (
          <KaartLeeg tekst="Nog geen e-mails verstuurd aan deze klant." />
        ) : (
          zichtbareMails.map((m, i) => (
            <KaartRij
              key={m.id}
              eerste={i === 0}
              links={
                m.related_type ? (
                  <FileText size={16} color={th.green700} strokeWidth={2} />
                ) : (
                  <Mail size={16} color={th.muted} strokeWidth={2} />
                )
              }
              titel={m.subject || '(geen onderwerp)'}
              sub={verstuurdeMailSub(m)}
              onPress={() => setBekeken(m)}
            />
          ))
        )}
      </KaartBlok>

      {/* Tijdlijn — alle `klant_tijdlijn`-regels, nieuwste eerst. */}
      <KaartBlok
        titel="Tijdlijn"
        aantal={tijdlijn.length}
        actie={tijdlijn.length > 8 ? (alleTijdlijn ? 'Minder' : `Alles (${tijdlijn.length})`) : undefined}
        onActie={() => setAlleTijdlijn((v) => !v)}
      >
        {tijdlijn.length === 0 ? (
          <KaartLeeg tekst="Nog geen activiteit gelogd" />
        ) : (
          zichtbareTijdlijn.map((r, i) => (
            <KaartRij
              key={r.id}
              eerste={i === 0}
              links={<TijdlijnBol type={r.type} />}
              titel={alsTekst(r.omschrijving) || r.type}
              sub={tijdlijnDatum(r.aangemaakt_op)}
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
          toevoegLabel="Nieuwe offerte"
          onToevoegen={
            magOfferteMaken
              ? () => router.push({ pathname: '/offers', params: { nieuw: '1', klant: customer.id } })
              : undefined
          }
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
          toevoegLabel="Nieuwe factuur"
          onToevoegen={
            magFactuurMaken
              ? () => router.push({ pathname: '/invoices', params: { nieuw: '1', klant: customer.id } })
              : undefined
          }
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
          toevoegLabel="Nieuw project"
          onToevoegen={
            magProjectMaken
              ? () => router.push({ pathname: '/projects', params: { nieuw: '1', klant: customer.id } })
              : undefined
          }
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
                      type: customer.type ?? null,
                      source: customer.source ?? '',
                      betaaltermijn: customer.betaaltermijn_dagen != null ? String(customer.betaaltermijn_dagen) : '',
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
            const termijn = leesBetaaltermijn(concept.betaaltermijn);
            if (termijn.fout) {
              setSaveError(termijn.fout);
              return;
            }
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
                  type: concept.type,
                  source: concept.source,
                  betaaltermijn_dagen: termijn.waarde,
                  // Ongewijzigd? Niet meesturen: anders gaan opmaak en
                  // @-vermeldingen uit de dashboard-editor verloren.
                  notes:
                    concept.notes === alsTekst(customer.notes) ? undefined : concept.notes,
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
                      'Aanvragen, activiteiten, notities en de tijdlijn van deze klant worden mee ' +
                        'verwijderd. Werkbonnen, offertes, facturen en projecten blijven bestaan zonder klant.',
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
          <AdresZoeker
            onSelect={(v) => setConcept((c) => (c ? { ...c, ...v } : c))}
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
          <SelectField
            label="Type"
            value={concept?.type ?? null}
            options={KLANT_TYPES.map((k) => ({ id: k, label: k }))}
            onChange={(v) => setConcept((c) => (c ? { ...c, type: v } : c))}
            allowEmpty
            emptyLabel="Geen type"
          />
          <FormField
            label="Bron"
            value={concept?.source ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, source: v } : c))}
            placeholder="Website, aanbeveling, …"
          />
          <FormField
            label="Betaaltermijn (dagen)"
            value={concept?.betaaltermijn ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, betaaltermijn: v } : c))}
            keyboardType="number-pad"
            placeholder="Standaard uit Instellingen"
            hint="Leeg = de standaard betaaltermijn uit Instellingen."
          />
          <FormField
            label="Notities"
            value={concept?.notes ?? ''}
            onChangeText={(v) => setConcept((c) => (c ? { ...c, notes: v } : c))}
            placeholder="Optioneel"
            multiline
          />
        </FormSheet>

        <DocumentMailSheet
          visible={mailConcept !== null}
          titel="Nieuw bericht"
          nummer={name}
          laden={mailLaden}
          concept={mailConcept ?? { aan: '', onderwerp: '', tekst: '' }}
          onWijzig={setMailConcept}
          kop={
            sjablonen.length ? (
              <SelectField
                label="Sjabloon"
                value={sjabloonId}
                options={sjablonen.map((x) => ({ id: x.id, label: x.naam }))}
                onChange={kiesSjabloon}
                placeholder="Schrijf zelf een bericht"
                allowEmpty
                emptyLabel="Schrijf zelf een bericht"
              />
            ) : null
          }
          vereistOnderwerp
          saving={mailBezig}
          error={mailFout}
          onVerstuur={verstuurKlantMail}
          onSluit={() => setMailConcept(null)}
        />

        <FormSheet
          visible={bekeken !== null}
          title={bekeken?.subject || 'E-mail'}
          subtitle={bekeken ? verstuurdeMailSub(bekeken) : undefined}
          submitLabel="Sluiten"
          onSubmit={() => setBekeken(null)}
          onClose={() => setBekeken(null)}
        >
          {bekeken?.body_html ? (
            <MailVoorbeeld html={bekeken.body_html} hoogte={460} />
          ) : (
            <Text style={styles.mailLeeg}>Inhoud niet beschikbaar voor oudere e-mails</Text>
          )}
          {bekeken?.to_email ? <Text style={styles.mailAan}>Aan: {bekeken.to_email}</Text> : null}
        </FormSheet>
      </View>
    </>
  );
}

const TIJDLIJN_ICOON: Record<TijdlijnIcoon, LucideIcon> = {
  klant: User,
  document: FileText,
  euro: Euro,
  credit: RotateCcw,
  map: Folder,
  pen: PenLine,
  mail: Mail,
  agenda: Calendar,
  deal: ShoppingCart,
  export: Download,
};

/** Het ronde icoon van een tijdlijnregel, in de kleur van het type (TIJDLIJN_KLEUR). */
function TijdlijnBol({ type }: { type: string }) {
  const styles = useStyles(themaStijlen);
  const { colors: th } = useTheme();
  const kleur = tijdlijnKleur(type) ?? th.muted;
  const Icoon = TIJDLIJN_ICOON[tijdlijnIcoon(type)];
  // Alleen bij een hexkleur de doorzichtige tint; de themakleur krijgt de lijnkleur.
  const hex = kleur.startsWith('#');
  return (
    <View
      style={[
        styles.tijdlijnBol,
        { backgroundColor: hex ? `${kleur}18` : th.bg, borderColor: hex ? `${kleur}40` : th.line },
      ]}
    >
      <Icoon size={14} color={kleur} strokeWidth={2.2} />
    </View>
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
    tijdlijnBol: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mailLeeg: { fontSize: 13, fontStyle: 'italic', color: t.muted },
    mailAan: { fontSize: 12.5, color: t.muted, paddingTop: 4 },
  });

/**
 * Licht en donker worden één keer opgebouwd; elke component in dit bestand
 * kiest er met `useStyles(themaStijlen)` tussen. Twee stylesheets kosten niets
 * — ze worden eenmalig aangemaakt — en zo mist geen enkele subcomponent het
 * thema.
 */
const themaStijlen = maakThemaStijlen(makeStyles);
