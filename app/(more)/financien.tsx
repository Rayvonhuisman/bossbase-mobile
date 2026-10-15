import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AppFilterChips,
  AppScreen,
  AppTopBar,
  DateField,
  LoadingScreen,
  NoticeBanner,
  PermissionGate,
} from '@/components';
import { TegelRaster } from '@/components/DocumentOnderdelen';
import { KaartBlok, KaartLeeg } from '@/components/RelatieKaart';
import { FinancienGrafiek } from '@/components/FinancienGrafiek';
import { usePermissions, useTheme } from '@/providers';
import { listCustomers } from '@/services/customerService';
import {
  getFinancienKpi,
  getKostenPerKlant,
  listFinancienFacturen,
  listGeboekteKosten,
} from '@/services/financienService';
import {
  formatUrenAantal,
  GRAFIEK_MODI,
  GRAFIEK_PERIODE_LABEL,
  GRAFIEK_PERIODES,
  grafiekStaven,
  KPI_PERIODES,
  kpiBereik,
  kpiTegels,
  klantRijen,
  totaalRij,
  type FinancienKpi,
  type FinFactuur,
  type FinKost,
  type GrafiekModus,
  type GrafiekPeriode,
  type KlantKosten,
  type KlantRij,
  type KpiPeriode,
} from '@/lib/financienLogica';
import { formatEURCent } from '@/lib/format';
import { useLaden, type LaadBron } from '@/lib/useLaden';
import { useOnthouden } from '@/lib/useOnthouden';
import { terugOfNaar } from '@/lib/navigatie';
import { useSchermklasse } from '@/lib/schermklasse';
import { spacing, type ThemeColors } from '@/theme';

/**
 * Financiën — `RevenuePage` van het dashboard (menu Financieel, recht
 * `bedrijfsfinancien`; geen pakketfeature, net als daar).
 *
 *   tegels     periodekeuze (deze/vorige maand, dit/vorig jaar, aangepast) en
 *              zes tegels uit `bb_financien_kpi`
 *   grafiek    gefactureerd/ontvangen/kosten per week, maand, kwartaal of jaar
 *   per klant  alle periodes: gefactureerd, materiaal, inkopen, uren, betaald,
 *              openstaand, brutowinst vóór arbeid en marge, met een totaalregel
 *
 * Bewust niet: de Excel-export (blijft in het dashboard) en het btw-blok
 * (pakketfeature `btw_overzicht`, eigen berekening; ook in het dashboard).
 * De rekenregels staan in `lib/financienLogica.ts`.
 */
export default function FinancienScreen() {
  return (
    <PermissionGate permission="bedrijfsfinancien" label="Financiën">
      <FinancienInhoud />
    </PermissionGate>
  );
}

function FinancienInhoud() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { loaded: rechtenGeladen } = usePermissions();
  const { klasse } = useSchermklasse();
  const tablet = klasse === 'tablet';

  const [periode, setPeriode] = useOnthouden<KpiPeriode>(
    'financien.periode',
    'deze-maand',
    KPI_PERIODES.map((p) => p.id),
  );
  const [van, setVan] = useState<string | null>(null);
  const [tot, setTot] = useState<string | null>(null);
  const [grafiekPeriode, setGrafiekPeriode] = useOnthouden<GrafiekPeriode>(
    'financien.grafiekPeriode',
    'maand',
    GRAFIEK_PERIODES.map((p) => p.id),
  );
  const [modus, setModus] = useOnthouden<GrafiekModus>(
    'financien.grafiekModus',
    'gefactureerd',
    GRAFIEK_MODI.map((m) => m.id),
  );

  const [kpi, setKpi] = useState<FinancienKpi | null>(null);
  const [kpiFout, setKpiFout] = useState<string | null>(null);
  const [facturen, setFacturen] = useState<FinFactuur[]>([]);
  const [kosten, setKosten] = useState<FinKost[]>([]);
  const [klanten, setKlanten] = useState<{ id: string; name: string | null; city?: string | null }[]>([]);
  const [kostenPerKlant, setKostenPerKlant] = useState<Map<string, KlantKosten> | null>(null);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [kostenFout, setKostenFout] = useState<string | null>(null);
  const [ververs, setVervers] = useState(0);

  // ── Tegels: uit de database, per tijdvak ─────────────────────────────────
  const bereik = useMemo(() => kpiBereik(periode, new Date(), van, tot), [periode, van, tot]);
  const kpiVerzoek = useRef(0);
  useEffect(() => {
    if (!bereik) return;
    const nr = ++kpiVerzoek.current;
    // Bewust geen setKpi(null) vooraf: de vorige bedragen blijven staan tot de
    // nieuwe binnen zijn, zoals in het dashboard.
    void getFinancienKpi(bereik).then((r) => {
      if (nr !== kpiVerzoek.current) return;
      setKpi(r.data);
      setKpiFout(r.error);
    });
  }, [bereik, ververs]);

  // ── Grafiek en tabel: facturen, kosten en klanten ───────────────────────
  const klantenVerzoek = useRef(0);
  const load = useCallback(async (bron: LaadBron) => {
    // Verversen (focus, trekken, opnieuw) haalt ook de tegels opnieuw op; de
    // eerste keer doet het effect hierboven dat al.
    if (bron !== 'eerste') setVervers((n) => n + 1);
    const [fRes, kRes, cRes] = await Promise.all([listFinancienFacturen(), listGeboekteKosten(), listCustomers()]);
    const fout = fRes.error ?? kRes.error ?? cRes.error;
    setLaadFout(fout);
    if (fout) return;
    setFacturen(fRes.data);
    setKosten(kRes.data);
    const lijst = cRes.data.map((c) => ({ id: c.id, name: c.name ?? null, city: c.city ?? null }));
    setKlanten(lijst);
    // De kosten per klant zijn het zwaarst (zes tabellen); de tabel toont tot
    // die binnen zijn "…", net als het dashboard, en wacht er niet op.
    const nr = ++klantenVerzoek.current;
    void getKostenPerKlant(lijst.map((c) => c.id)).then((r) => {
      if (nr !== klantenVerzoek.current) return;
      setKostenFout(r.error);
      setKostenPerKlant(r.data ?? new Map());
    });
  }, []);
  const { loading, refreshing, onRefresh, opnieuw } = useLaden(load, {
    onFout: setLaadFout,
    klaarOmTeLaden: rechtenGeladen,
  });

  const staven = useMemo(
    () => grafiekStaven(grafiekPeriode, { facturen, kosten }, new Date()),
    [grafiekPeriode, facturen, kosten],
  );
  const rijen = useMemo(() => klantRijen(klanten, facturen, kostenPerKlant), [klanten, facturen, kostenPerKlant]);
  const totaal = useMemo(() => totaalRij(rijen), [rijen]);

  if (loading || !rechtenGeladen) return <LoadingScreen label="Financiën laden..." />;

  const tegels = kpiTegels(
    kpi ?? { gefactureerd: 0, ontvangen: 0, openstaand: 0, teVerwachten: 0, kosten: 0 },
    periode,
  ).map((tg) => ({
    id: tg.id,
    label: tg.label,
    // Zonder cijfers (fout, of nog onderweg) een streep, nooit € 0,00.
    waarde: kpi ? formatEURCent(tg.bedrag) : '—',
    uitleg: tg.uitleg,
    toon: kpi ? tg.toon : undefined,
  }));
  const modusLabel = GRAFIEK_MODI.find((m) => m.id === modus)?.label ?? '';
  const kostenKlaar = kostenPerKlant !== null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AppScreen
        header={
          <AppTopBar
            variant="detail"
            title="Financiën"
            subtitle="Financieel overzicht"
            onBack={() => terugOfNaar(router, '/menu')}
          />
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        {/* Tijdvak van de tegels */}
        <View style={{ paddingTop: 12 }}>
          <AppFilterChips<KpiPeriode>
            chips={KPI_PERIODES.map((p) => ({ id: p.id, label: p.label }))}
            active={periode}
            onChange={setPeriode}
          />
        </View>
        {periode === 'aangepast' ? (
          <View style={styles.datums}>
            <View style={{ flex: 1 }}>
              <DateField label="Van" value={van} onChange={setVan} maximum={tot} placeholder="Kies" />
            </View>
            <View style={{ flex: 1 }}>
              <DateField label="Tot en met" value={tot} onChange={setTot} minimum={van} placeholder="Kies" />
            </View>
          </View>
        ) : null}

        {kpiFout || laadFout ? (
          <View style={styles.meldingen}>
            <NoticeBanner
              toon="fout"
              title="Financiën laden is niet gelukt"
              message={`${kpiFout ?? laadFout} Tik om het opnieuw te proberen.`}
              onPress={() => void opnieuw()}
            />
          </View>
        ) : null}
        {periode === 'aangepast' && !bereik ? (
          <View style={styles.meldingen}>
            <NoticeBanner toon="info" message="Kies een begin- en einddatum om de cijfers van die periode te zien." />
          </View>
        ) : null}

        {tablet ? (
          <>
            <TegelRaster breed tegels={tegels.slice(0, 3)} />
            <TegelRaster breed tegels={tegels.slice(3)} />
          </>
        ) : (
          <TegelRaster breed={false} tegels={tegels} />
        )}

        {/* Omzetgrafiek */}
        <KaartBlok titel={`Omzetgrafiek — ${GRAFIEK_PERIODE_LABEL[grafiekPeriode]}`}>
          <View style={styles.grafiekKop}>
            <AppFilterChips<GrafiekPeriode>
              chips={GRAFIEK_PERIODES.map((p) => ({ id: p.id, label: p.label }))}
              active={grafiekPeriode}
              onChange={setGrafiekPeriode}
            />
            <AppFilterChips<GrafiekModus>
              chips={GRAFIEK_MODI.map((m) => ({ id: m.id, label: m.label }))}
              active={modus}
              onChange={setModus}
            />
          </View>
          <View style={styles.grafiek}>
            <FinancienGrafiek staven={staven} modus={modus} periode={grafiekPeriode} modusLabel={modusLabel} />
          </View>
        </KaartBlok>

        {/* Per klant / opdracht — cumulatief, alle periodes */}
        <KaartBlok titel="Per klant / opdracht · alle periodes" aantal={rijen.length}>
          {kostenFout ? (
            <View style={{ padding: 12 }}>
              <NoticeBanner toon="fout" message={kostenFout} onPress={() => void opnieuw()} />
            </View>
          ) : null}
          {rijen.length === 0 ? (
            <KaartLeeg tekst="Nog geen klantdata beschikbaar." />
          ) : tablet ? (
            <KlantTabel rijen={rijen} totaal={totaal} kostenKlaar={kostenKlaar} styles={styles} t={t} />
          ) : (
            <>
              {rijen.map((r, i) => (
                <KlantKaart key={r.id} r={r} eerste={i === 0} kostenKlaar={kostenKlaar} styles={styles} t={t} />
              ))}
              {kostenKlaar ? <TotaalKaart totaal={totaal} styles={styles} t={t} /> : null}
            </>
          )}
        </KaartBlok>
        <Text style={styles.voetnoot}>
          Brutowinst vóór arbeid is de omzet exclusief btw min materiaal (op inkoopprijs) en inkopen. Uren staan er als
          aantal bij: er is geen kostprijs per uur, dus ze tellen niet mee. De export naar Excel staat in het dashboard.
        </Text>
      </AppScreen>
    </View>
  );
}

type Stijlen = ReturnType<typeof makeStyles>;

const winstKleur = (t: ThemeColors, v: number) => (v >= 0 ? t.green700 : t.statusRejectFg);

/** Telefoon: één kaart per klant, met de kolommen van het dashboard als cijfers. */
function KlantKaart({
  r,
  eerste,
  kostenKlaar,
  styles,
  t,
}: {
  r: KlantRij;
  eerste: boolean;
  kostenKlaar: boolean;
  styles: Stijlen;
  t: ThemeColors;
}) {
  const k = (v: string) => (kostenKlaar ? v : '…');
  return (
    <View style={[styles.klant, !eerste && styles.rand]}>
      <View style={styles.klantKop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.klantNaam} numberOfLines={1}>
            {r.naam}
          </Text>
          {r.plaats ? (
            <Text style={styles.klantPlaats} numberOfLines={1}>
              {r.plaats}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.cijferLabel}>Gefactureerd</Text>
          <Text style={styles.klantBedrag}>{formatEURCent(r.total)}</Text>
        </View>
      </View>
      <View style={styles.cijfers}>
        <Cijfer label="Materiaal" waarde={k(formatEURCent(r.materiaal))} kleur={t.statusRejectFg} styles={styles} />
        <Cijfer label="Inkopen" waarde={k(formatEURCent(r.inkopen))} kleur={t.statusRejectFg} styles={styles} />
        <Cijfer label="Uren" waarde={k(formatUrenAantal(r.uren))} kleur={t.muted} styles={styles} />
        <Cijfer label="Betaald" waarde={formatEURCent(r.paid)} kleur={t.green700} styles={styles} />
        <Cijfer
          label="Openstaand"
          waarde={formatEURCent(r.openstaand)}
          kleur={r.openstaand > 0 ? t.statusWarnFg : t.muted}
          styles={styles}
        />
        <Cijfer label="Marge" waarde={k(`${r.margin}%`)} kleur={t.ink} styles={styles} />
      </View>
      <View style={styles.winstRij}>
        <Text style={styles.cijferLabel}>Brutowinst vóór arbeid</Text>
        <Text style={[styles.winst, { color: winstKleur(t, r.profit) }]}>{k(formatEURCent(r.profit))}</Text>
      </View>
    </View>
  );
}

function TotaalKaart({ totaal, styles, t }: { totaal: ReturnType<typeof totaalRij>; styles: Stijlen; t: ThemeColors }) {
  return (
    <View style={[styles.klant, styles.rand, { backgroundColor: t.bgAlt }]}>
      <View style={styles.klantKop}>
        <Text style={[styles.klantNaam, { flex: 1 }]}>Totaal</Text>
        <Text style={styles.klantBedrag}>{formatEURCent(totaal.total)}</Text>
      </View>
      <View style={styles.cijfers}>
        <Cijfer label="Materiaal" waarde={formatEURCent(totaal.materiaal)} kleur={t.statusRejectFg} styles={styles} />
        <Cijfer label="Inkopen" waarde={formatEURCent(totaal.inkopen)} kleur={t.statusRejectFg} styles={styles} />
        <Cijfer label="Uren" waarde={formatUrenAantal(totaal.uren)} kleur={t.muted} styles={styles} />
        <Cijfer label="Betaald" waarde={formatEURCent(totaal.paid)} kleur={t.green700} styles={styles} />
        <Cijfer label="Openstaand" waarde={formatEURCent(totaal.openstaand)} kleur={t.ink} styles={styles} />
      </View>
      <View style={styles.winstRij}>
        <Text style={styles.cijferLabel}>Brutowinst vóór arbeid</Text>
        <Text style={[styles.winst, { color: winstKleur(t, totaal.profit) }]}>{formatEURCent(totaal.profit)}</Text>
      </View>
    </View>
  );
}

function Cijfer({ label, waarde, kleur, styles }: { label: string; waarde: string; kleur: string; styles: Stijlen }) {
  return (
    <View style={styles.cijfer}>
      <Text style={styles.cijferLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.cijferWaarde, { color: kleur }]} numberOfLines={1}>
        {waarde}
      </Text>
    </View>
  );
}

// Samen 820: past in de app-kolom van een iPad (880 min de marges); smaller
// scrolt de tabel horizontaal, zoals in het dashboard.
const KLANT_BREEDTE = 152;
const KOLOMMEN: { id: string; label: string; breedte: number }[] = [
  { id: 'klant', label: 'Klant', breedte: KLANT_BREEDTE },
  { id: 'total', label: 'Gefactureerd', breedte: 104 },
  { id: 'materiaal', label: 'Materiaal', breedte: 88 },
  { id: 'inkopen', label: 'Inkopen', breedte: 80 },
  { id: 'uren', label: 'Uren', breedte: 64 },
  { id: 'paid', label: 'Betaald', breedte: 92 },
  { id: 'openstaand', label: 'Openstaand', breedte: 88 },
  { id: 'profit', label: 'Brutowinst vóór arbeid', breedte: 100 },
  { id: 'margin', label: 'Marge', breedte: 52 },
];

/** iPad: de tabel van het dashboard, horizontaal te scrollen als hij niet past. */
function KlantTabel({
  rijen,
  totaal,
  kostenKlaar,
  styles,
  t,
}: {
  rijen: KlantRij[];
  totaal: ReturnType<typeof totaalRij>;
  kostenKlaar: boolean;
  styles: Stijlen;
  t: ThemeColors;
}) {
  const k = (v: string) => (kostenKlaar ? v : '…');
  const cel = (i: number, inhoud: string, kleur: string, vet = false) => (
    <Text
      style={[styles.cel, { width: KOLOMMEN[i]?.breedte, color: kleur }, vet && { fontWeight: '800' }]}
      numberOfLines={1}
    >
      {inhoud}
    </Text>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View style={[styles.tabelRij, styles.tabelKop]}>
          {KOLOMMEN.map((c, i) => (
            <Text
              key={c.id}
              style={[styles.kopCel, { width: c.breedte }, i === 0 && { textAlign: 'left' }]}
              numberOfLines={2}
            >
              {c.label}
            </Text>
          ))}
        </View>
        {rijen.map((r) => (
          <View key={r.id} style={[styles.tabelRij, styles.rand]}>
            <View style={{ width: KLANT_BREEDTE, paddingRight: 8 }}>
              <Text style={styles.klantNaam} numberOfLines={1}>
                {r.naam}
              </Text>
              {r.plaats ? (
                <Text style={styles.klantPlaats} numberOfLines={1}>
                  {r.plaats}
                </Text>
              ) : null}
            </View>
            {cel(1, formatEURCent(r.total), t.ink)}
            {cel(2, k(formatEURCent(r.materiaal)), t.statusRejectFg)}
            {cel(3, k(formatEURCent(r.inkopen)), t.statusRejectFg)}
            {cel(4, k(formatUrenAantal(r.uren)), t.muted)}
            {cel(5, formatEURCent(r.paid), t.green700)}
            {cel(6, formatEURCent(r.openstaand), r.openstaand > 0 ? t.statusWarnFg : t.muted)}
            {cel(7, k(formatEURCent(r.profit)), winstKleur(t, r.profit), true)}
            {cel(8, k(`${r.margin}%`), t.ink)}
          </View>
        ))}
        {kostenKlaar ? (
          <View style={[styles.tabelRij, styles.rand, { backgroundColor: t.bgAlt }]}>
            <Text style={[styles.klantNaam, { width: KLANT_BREEDTE }]}>Totaal</Text>
            {cel(1, formatEURCent(totaal.total), t.ink, true)}
            {cel(2, formatEURCent(totaal.materiaal), t.statusRejectFg, true)}
            {cel(3, formatEURCent(totaal.inkopen), t.statusRejectFg, true)}
            {cel(4, formatUrenAantal(totaal.uren), t.muted)}
            {cel(5, formatEURCent(totaal.paid), t.green700, true)}
            {cel(6, formatEURCent(totaal.openstaand), t.ink, true)}
            {cel(7, formatEURCent(totaal.profit), winstKleur(t, totaal.profit), true)}
            {cel(8, '', t.ink)}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    datums: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: 16, paddingTop: 12 },
    meldingen: { gap: spacing.sm, paddingHorizontal: 16, paddingTop: 12 },
    grafiekKop: { gap: spacing.sm, paddingTop: 12 },
    grafiek: { padding: 14, paddingTop: 12 },
    klant: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    rand: { borderTopWidth: 1, borderTopColor: t.line },
    klantKop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    klantNaam: { fontSize: 14.5, fontWeight: '700', color: t.ink, letterSpacing: -0.2 },
    klantPlaats: { fontSize: 12.5, color: t.muted, marginTop: 2 },
    klantBedrag: { fontSize: 15, fontWeight: '800', color: t.ink, marginTop: 2 },
    cijfers: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
    cijfer: { width: '33.33%', paddingRight: 6 },
    cijferLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: t.muted2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    cijferWaarde: { fontSize: 13, fontWeight: '700', marginTop: 2 },
    winstRij: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    winst: { fontSize: 14, fontWeight: '800' },
    tabelRij: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, minHeight: 52 },
    tabelKop: { minHeight: 40, paddingVertical: 8 },
    kopCel: {
      fontSize: 10.5,
      fontWeight: '700',
      color: t.muted2,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      textAlign: 'right',
      paddingLeft: 6,
    },
    cel: { fontSize: 12.5, fontWeight: '600', textAlign: 'right', paddingLeft: 6 },
    voetnoot: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      fontSize: 12.5,
      lineHeight: 18,
      color: t.muted,
    },
  });
