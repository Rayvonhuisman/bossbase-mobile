import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Camera, Check, FileUp } from 'lucide-react-native';
import { FormSheet } from '@/components/FormSheet';
import { SelectField } from '@/components/SelectField';
import { NoticeBanner } from '@/components/NoticeBanner';
import { usePermissions, useTheme } from '@/providers';
import { kiesBestanden } from '@/lib/kiesBestand';
import { kiesFotoBron, maakOfKiesFoto } from '@/lib/kiesFoto';
import { bereidFotoVoor } from '@/lib/fotoVoorbereiden';
import { bytesNaarBase64 } from '@/lib/base64';
import { formatEURCent } from '@/lib/format';
import {
  VELDEN,
  csvTekstUitBytes,
  koppelBestaand,
  leesCsv,
  metOpslag,
  regelsUitRijen,
  soortVanBestand,
  vindKop,
  wijzigtIets,
  type BestaandMateriaal,
  type ImportRegel,
  type ImportVeld,
  type KolomMap,
} from '@/lib/materiaalImport';
import { getalUit } from '@/lib/offerteCalculatie';
import {
  alleMaterialenVoorImport,
  importeerMaterialen,
  leesPrijslijstUit,
} from '@/services/materiaalService';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';

/**
 * Materialen importeren (`MaterialenImporteren` in het dashboard): een
 * prijslijst of leveranciersofferte in één keer inlezen. Op de telefoon:
 * bestand of foto kiezen → controleren met vinkjes → importeren.
 *
 * - CSV leest de app zelf (lib/materiaalImport): kolommen herkend aan de kop,
 *   aan te passen onder "Kolommen".
 * - PDF of foto gaat naar de edge function `materialen-uitlezen` (feature
 *   `prijslijst_uitlezen`, Groei en Team).
 * - Excel (.xlsx) niet: het dashboard gebruikt daarvoor exceljs, te zwaar voor
 *   de app. De melding zegt: sla op als CSV, of importeer op het dashboard.
 *
 * Dubbele materialen (zelfde artikelnummer, anders exact dezelfde naam)
 * worden bijgewerkt in plaats van dubbel aangemaakt (`bb_materialen_importeren`);
 * dubbele regels in het bestand staan standaard uit. Lukt het laden van de
 * bestaande materialen niet, dan kan importeren niet: dubbelen zijn dan niet
 * te herkennen. Niets wordt opgeslagen tot "Importeren".
 */

const MAX_TABEL = 25 * 1024 * 1024;
const MAX_PDF = 10 * 1024 * 1024;
const MAX_FOTO = 5 * 1024 * 1024;
const MAX_REGELS = 5000;
/** Zoveel regels tegelijk in beeld; de rest via "Meer tonen". */
const PER_KEER = 100;

type Stap = 'kies' | 'lezen' | 'controle' | 'opslaan' | 'klaar';
type Wijziging = Partial<Pick<ImportRegel, 'inkoopprijs' | 'verkoopprijs'>>;

export function MaterialenImporteren({
  leveranciers,
  onSluit,
  onKlaar,
}: {
  leveranciers: { id: string; naam: string; actief: boolean }[];
  onSluit: () => void;
  /** Na een (gedeeltelijk) geslaagde import: de lijst verversen. */
  onKlaar: () => void;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { hasFeature } = usePermissions();
  const magUitlezen = hasFeature('prijslijst_uitlezen');

  const [stap, setStap] = useState<Stap>('kies');
  const [fout, setFout] = useState<string | null>(null);
  const [bestandNaam, setBestandNaam] = useState('');
  const [bestaande, setBestaande] = useState<BestaandMateriaal[] | null>(null);
  const [bestaandFout, setBestaandFout] = useState<string | null>(null);

  // Bron: een CSV (rijen + kolomtoewijzing) of regels van de edge function.
  const [rijen, setRijen] = useState<string[][] | null>(null);
  const [kopIndex, setKopIndex] = useState(0);
  const [map, setMap] = useState<KolomMap>({});
  const [toonKolommen, setToonKolommen] = useState(false);
  const [aiRegels, setAiRegels] = useState<ImportRegel[] | null>(null);
  const [melding, setMelding] = useState('');

  const [vink, setVink] = useState<Record<number, boolean>>({});
  const [wijziging, setWijziging] = useState<Record<number, Wijziging>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [zichtbaar, setZichtbaar] = useState(PER_KEER);
  const [leverancierId, setLeverancierId] = useState<string | null>(null);
  const [opslagAan, setOpslagAan] = useState(false);
  const [opslagPct, setOpslagPct] = useState('30');
  const [btwStandaard, setBtwStandaard] = useState(21);
  const [voortgang, setVoortgang] = useState<{ klaar: number; totaal: number } | null>(null);
  const [uitkomst, setUitkomst] = useState<{ nieuw: number; bijgewerkt: number } | null>(null);

  useEffect(() => {
    let weg = false;
    void alleMaterialenVoorImport().then((r) => {
      if (weg) return;
      setBestaande(r.error ? [] : r.data.map((m) => ({ ...m, artikelnummer: m.artikelnummer || null })));
      setBestaandFout(r.error);
    });
    return () => {
      weg = true;
    };
  }, []);

  const resetControle = () => {
    setVink({});
    setWijziging({});
    setOpen(null);
    setZichtbaar(PER_KEER);
  };

  /** Een gekozen bestand (of foto) inlezen. */
  const lees = async (naam: string, mime: string | null, bytes: Uint8Array, alVoorbereid = false) => {
    setFout(null);
    const soort = soortVanBestand(bytes, naam, mime);
    if (!soort) return setFout('Dit soort bestand kan niet worden ingelezen. Gebruik CSV, PDF of een foto (JPG of PNG).');
    if (soort === 'xlsx' || soort === 'xls') {
      return setFout(
        'Een Excel-bestand kan de app niet inlezen. Sla het in Excel op als CSV en kies dat bestand, of importeer het op het dashboard.',
      );
    }
    if (soort === 'heic') {
      return setFout('Een HEIC-foto kan niet worden ingelezen. Maak een schermafbeelding of kies "Foto maken".');
    }
    if (soort === 'csv' && bytes.byteLength > MAX_TABEL) return setFout('Dit bestand is groter dan 25 MB.');
    if ((soort === 'pdf' || soort === 'foto') && !magUitlezen) {
      return setFout('Een PDF of foto laten uitlezen zit in Groei en Team. Een CSV importeren kan in elk pakket.');
    }
    if (soort === 'pdf' && bytes.byteLength > MAX_PDF) {
      return setFout('Deze PDF is groter dan 10 MB. Splits hem, of vraag de leverancier om de prijslijst als CSV.');
    }
    setBestandNaam(naam);
    setStap('lezen');
    try {
      if (soort === 'csv') {
        const r = leesCsv(csvTekstUitBytes(bytes));
        if (r.length < 2) throw new Error('Er staan geen regels in dit bestand.');
        const kop = vindKop(r);
        setRijen(r);
        setKopIndex(kop?.kopIndex ?? 0);
        const m = kop?.map ?? {};
        setMap(m);
        setToonKolommen(!(m.naam !== undefined && (m.inkoopprijs !== undefined || m.verkoopprijs !== undefined)));
        setAiRegels(null);
        setMelding('');
      } else {
        let data = bytes;
        // Een foto uit de bestandskiezer van de browser: verkleinen zoals de
        // werkbonfoto's (de API neemt hooguit 5 MB per afbeelding).
        if (soort === 'foto' && !alVoorbereid && Platform.OS === 'web' && typeof File !== 'undefined') {
          const kopie = new Uint8Array(bytes);
          const f = await bereidFotoVoor({ uri: '', file: new File([kopie], naam, { type: mime || 'image/jpeg' }) } as unknown as ImagePickerAsset);
          if (f.ok) data = new Uint8Array(f.bytes);
        }
        if (soort === 'foto' && data.byteLength > MAX_FOTO) throw new Error('Deze foto is te groot (maximaal 5 MB).');
        const res = await leesPrijslijstUit(bytesNaarBase64(data), naam);
        if (res.error) throw new Error(res.error);
        if (!res.regels.length) throw new Error(res.melding || 'Er zijn geen artikelen met prijzen gevonden in dit document.');
        setRijen(null);
        setAiRegels(
          res.regels.map((r) => ({
            naam: r.naam,
            artikelnummer: r.artikelnummer || '',
            eenheid: r.eenheid || '',
            inkoopprijs: r.inkoopprijs ?? null,
            verkoopprijs: r.verkoopprijs ?? null,
            btwPct: r.btwPct ?? null,
            twijfel: r.twijfel,
            twijfelReden: r.twijfelReden,
          })),
        );
        let m = res.melding;
        // Leverancier op het document die al bestaat: alvast kiezen.
        const lv = res.leverancier.toLowerCase();
        const gevonden = lv
          ? leveranciers.find((l) => {
              const a = l.naam.toLowerCase();
              return l.actief && (a === lv || a.includes(lv) || lv.includes(a));
            })
          : null;
        if (gevonden) setLeverancierId((huidig) => huidig ?? gevonden.id);
        else if (res.leverancier) m = [m, `Leverancier op het document: ${res.leverancier}.`].filter(Boolean).join(' ');
        setMelding(m);
      }
      resetControle();
      setStap('controle');
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Inlezen mislukt.');
      setStap('kies');
    }
  };

  const kiesBestand = async () => {
    const gekozen = await kiesBestanden();
    const b = gekozen?.[0];
    if (!b) return;
    try {
      const buf = await b.lees();
      await lees(b.naam, b.mime, new Uint8Array(buf));
    } catch {
      setFout('Het bestand kon niet worden gelezen.');
      setStap('kies');
    }
  };

  const kiesFoto = async () => {
    if (!magUitlezen) {
      setFout('Een foto laten uitlezen zit in Groei en Team. Een CSV importeren kan in elk pakket.');
      return;
    }
    const bron = await kiesFotoBron('Prijslijst fotograferen');
    if (!bron) return;
    const foto = await maakOfKiesFoto(bron);
    if (!foto) return;
    await lees(`prijslijst.${foto.extensie}`, foto.contentType, new Uint8Array(foto.bytes), true);
  };

  // De regels uit de bron, vóór de wijzigingen van de gebruiker.
  const basis = useMemo<ImportRegel[]>(() => {
    if (aiRegels) return aiRegels;
    if (!rijen) return [];
    return regelsUitRijen(rijen, kopIndex, map);
  }, [aiRegels, rijen, kopIndex, map]);

  const pct = getalUit(opslagPct);
  const regels = useMemo(() => {
    const samengevoegd = basis.slice(0, MAX_REGELS).map((r, i) => {
      const w = wijziging[i] || {};
      const m = { ...r, ...w, sleutel: i, berekend: false };
      if (!('verkoopprijs' in w) && m.verkoopprijs == null && opslagAan && pct != null) {
        m.verkoopprijs = metOpslag(m.inkoopprijs, pct);
        m.berekend = m.verkoopprijs != null;
      }
      if (m.btwPct == null) m.btwPct = btwStandaard;
      return m;
    });
    return koppelBestaand(samengevoegd, bestaande || []).map((r) => {
      const ongewijzigd = Boolean(r.bestaand) && !wijzigtIets(r);
      const standaard = !r.dubbel && !ongewijzigd && Boolean(r.naam);
      return { ...r, ongewijzigd, aan: vink[r.sleutel] ?? standaard };
    });
  }, [basis, wijziging, vink, opslagAan, pct, btwStandaard, bestaande]);

  const gekozen = regels.filter((r) => r.aan && r.naam);
  const aantalNieuw = gekozen.filter((r) => !r.bestaand).length;
  const aantalBij = gekozen.length - aantalNieuw;
  const zonderVerkoop = basis.some((r) => r.inkoopprijs != null && r.verkoopprijs == null);
  const kanAan = (r: (typeof regels)[number]) => Boolean(r.naam) && !r.dubbel;
  const alleAan = gekozen.length > 0 && gekozen.length === regels.filter(kanAan).length;
  const zetAlles = (aan: boolean) => setVink(Object.fromEntries(regels.map((r) => [r.sleutel, aan && kanAan(r)])));
  const pasAan = (i: number, veld: keyof Wijziging, waarde: number | null) =>
    setWijziging((w) => ({ ...w, [i]: { ...(w[i] || {}), [veld]: waarde } }));
  const zetMap = (veld: ImportVeld, waarde: string | null) => {
    setMap((m) => {
      const n: KolomMap = { ...m };
      const k = waarde == null ? null : Number(waarde);
      // Eén kolom hoort bij één veld.
      if (k != null) for (const key of Object.keys(n) as ImportVeld[]) if (n[key] === k) delete n[key];
      if (k == null) delete n[veld];
      else n[veld] = k;
      return n;
    });
    resetControle();
  };

  const levOpties = leveranciers.filter((l) => l.actief).map((l) => ({ id: l.id, label: l.naam }));
  const importBlok = bestaande === null || Boolean(bestaandFout);

  const opslaan = async () => {
    if (stap !== 'controle') return;
    if (!leverancierId) return setFout('Kies een leverancier voor deze regels.');
    if (!gekozen.length || importBlok) return;
    setFout(null);
    setStap('opslaan');
    setVoortgang({ klaar: 0, totaal: gekozen.length });
    const res = await importeerMaterialen(
      leverancierId,
      gekozen.map((r) => ({
        id: r.bestaand?.id || null,
        naam: r.naam,
        artikelnummer: r.artikelnummer || null,
        eenheid: r.eenheid || null,
        inkoopprijs: r.inkoopprijs,
        verkoopprijs: r.verkoopprijs,
        btwPct: r.btwPct,
      })),
      (klaar, totaal) => setVoortgang({ klaar, totaal }),
    );
    setVoortgang(null);
    if (res.error) {
      setFout(res.error);
      if (res.nieuw || res.bijgewerkt) {
        onKlaar();
        // Wat er al in staat, telt bij een tweede poging als bestaand.
        void alleMaterialenVoorImport().then((r) => {
          if (!r.error) setBestaande(r.data.map((m) => ({ ...m, artikelnummer: m.artikelnummer || null })));
        });
      }
      setStap('controle');
      return;
    }
    setUitkomst({ nieuw: res.nieuw, bijgewerkt: res.bijgewerkt });
    setStap('klaar');
    onKlaar();
  };

  const bezig = stap === 'lezen' || stap === 'opslaan';
  const kolomOpties = rijen
    ? [...Array(Math.max(0, ...rijen.slice(0, 50).map((r) => r.length))).keys()].map((i) => ({
        id: String(i),
        label: String(rijen[kopIndex]?.[i] ?? '').trim() || `Kolom ${i + 1}`,
      }))
    : [];

  return (
    <FormSheet
      visible
      title="Materialen importeren"
      subtitle={
        stap === 'kies'
          ? 'Lees een prijslijst of offerte van je leverancier in één keer in.'
          : stap === 'lezen'
            ? `${bestandNaam} lezen…`
            : stap === 'klaar'
              ? 'Klaar.'
              : `${bestandNaam}: controleer de regels. Er wordt pas iets opgeslagen als je op Importeren drukt.`
      }
      error={stap === 'kies' ? null : fout}
      saving={bezig}
      submitLabel={
        stap === 'klaar'
          ? 'Sluiten'
          : stap === 'opslaan'
            ? `Opslaan… ${voortgang ? `${voortgang.klaar} van ${voortgang.totaal}` : ''}`
            : stap === 'controle'
              ? `Importeren (${gekozen.length})`
              : 'Kies eerst een bestand'
      }
      submitDisabled={
        stap === 'klaar' ? false : stap !== 'controle' || !gekozen.length || importBlok || !leverancierId
      }
      onSubmit={stap === 'klaar' ? onSluit : () => void opslaan()}
      onClose={onSluit}
    >
      {stap === 'kies' ? (
        <View style={{ gap: spacing.md }}>
          <Pressable
            onPress={() => void kiesBestand()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.kies, pressed && { opacity: 0.7 }]}
          >
            <FileUp size={22} color={ds.green700} />
            <View style={{ flex: 1 }}>
              <Text style={styles.kiesTitel}>Bestand kiezen</Text>
              <Text style={styles.hint}>CSV, PDF of een foto (JPG of PNG)</Text>
            </View>
          </Pressable>
          {Platform.OS !== 'web' ? (
            <Pressable
              onPress={() => void kiesFoto()}
              accessibilityRole="button"
              style={({ pressed }) => [styles.kies, pressed && { opacity: 0.7 }]}
            >
              <Camera size={22} color={ds.green700} />
              <View style={{ flex: 1 }}>
                <Text style={styles.kiesTitel}>Foto maken of kiezen</Text>
                <Text style={styles.hint}>Van een prijslijst of leveranciersofferte</Text>
              </View>
            </Pressable>
          ) : null}
          {fout ? <NoticeBanner toon="fout" message={fout} /> : null}
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.tekst}>
              <Text style={styles.vet}>CSV</Text> lees je direct in. De kolommen (naam, artikelnummer, eenheid,
              prijzen, btw) worden herkend aan de kop; klopt het niet, dan pas je het aan. Een Excel-bestand sla je
              eerst op als CSV, of je importeert het op het dashboard.
            </Text>
            <Text style={styles.tekst}>
              <Text style={styles.vet}>PDF of foto</Text> van een prijslijst of offerte leest Boss uit (Groei en
              Team). Dat duurt meestal 10 tot 40 seconden. Van een PDF worden de eerste 5 pagina&apos;s gelezen.
            </Text>
            <Text style={styles.tekst}>
              Materialen die je al hebt (zelfde artikelnummer, anders dezelfde naam) krijgen de nieuwe prijzen. Er
              komen geen dubbele bij.
            </Text>
          </View>
        </View>
      ) : null}

      {stap === 'lezen' ? (
        <View style={styles.laden}>
          <ActivityIndicator color={ds.green700} />
          <Text style={styles.hint}>Bezig met lezen…</Text>
        </View>
      ) : null}

      {stap === 'controle' || stap === 'opslaan' ? (
        <View style={{ gap: spacing.md }}>
          {melding ? <NoticeBanner toon="info" message={melding} /> : null}
          {bestaandFout ? (
            <NoticeBanner
              toon="fout"
              message={`${bestaandFout} Zonder die lijst kan BossBase dubbele materialen niet herkennen, dus importeren kan nu niet. Sluit dit venster en probeer het opnieuw.`}
            />
          ) : null}

          <SelectField
            label="Leverancier voor alle regels *"
            value={leverancierId}
            options={levOpties}
            onChange={setLeverancierId}
            placeholder="Kies een leverancier"
            disabled={bezig}
            hint={levOpties.length === 0 ? 'Nog geen leveranciers. Voeg er eerst een toe bij Leveranciers.' : undefined}
          />

          <View style={{ gap: spacing.xs }}>
            <Text style={styles.label}>BTW als het bestand niets zegt</Text>
            <View style={styles.chipRij}>
              {[21, 9, 0].map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setBtwStandaard(p)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: btwStandaard === p }}
                  aria-checked={btwStandaard === p}
                  style={[styles.chip, btwStandaard === p && styles.chipAan]}
                >
                  <Text style={[styles.chipTekst, btwStandaard === p && { color: t.greenInk }]}>{p}%</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {zonderVerkoop ? (
            <View style={styles.opslag}>
              <View style={styles.opslagRij}>
                <Text style={[styles.tekst, { flex: 1 }]}>Verkoopprijs berekenen waar die ontbreekt</Text>
                <Switch
                  value={opslagAan}
                  onValueChange={setOpslagAan}
                  trackColor={{ true: ds.green, false: t.line }}
                  accessibilityLabel="Verkoopprijs berekenen waar die ontbreekt"
                />
              </View>
              <View style={styles.opslagRij}>
                <Text style={styles.hint}>inkoopprijs +</Text>
                <TextInput
                  value={opslagPct}
                  onChangeText={setOpslagPct}
                  editable={opslagAan}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Opslag in procenten"
                  style={[styles.veld, styles.pctVeld, !opslagAan && { opacity: 0.5 }]}
                />
                <Text style={styles.hint}>% opslag</Text>
              </View>
            </View>
          ) : null}

          {rijen ? (
            <View style={styles.kolommen}>
              <Pressable
                onPress={() => setToonKolommen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: toonKolommen }}
                aria-expanded={toonKolommen}
                style={styles.kolomKop}
              >
                <Text style={styles.kiesTitel}>Kolommen</Text>
                <Text style={styles.link}>{toonKolommen ? 'Verbergen' : 'Aanpassen'}</Text>
              </Pressable>
              {toonKolommen ? (
                <View style={{ gap: spacing.sm }}>
                  <SelectField
                    label="Kopregel"
                    value={String(kopIndex)}
                    options={rijen.slice(0, 15).map((r, i) => ({
                      id: String(i),
                      label: `Rij ${i + 1}: ${r.filter((c) => c !== '').slice(0, 3).join(' · ').slice(0, 40)}`,
                    }))}
                    onChange={(v) => {
                      setKopIndex(Number(v ?? 0));
                      resetControle();
                    }}
                  />
                  {VELDEN.map((v) => (
                    <SelectField
                      key={v.key}
                      label={`${v.label}${v.key === 'naam' ? ' *' : ''}`}
                      value={map[v.key] != null ? String(map[v.key]) : null}
                      options={kolomOpties}
                      onChange={(w) => zetMap(v.key, w)}
                      allowEmpty
                      emptyLabel="Niet in bestand"
                      placeholder="Niet in bestand"
                    />
                  ))}
                  {map.naam === undefined ? <Text style={styles.let}>Kies welke kolom de naam bevat.</Text> : null}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.samenvatting}>
            <Text style={styles.tekst}>
              <Text style={styles.vet}>{aantalNieuw}</Text> nieuw · <Text style={styles.vet}>{aantalBij}</Text>{' '}
              bijwerken
            </Text>
            <Text style={styles.hint}>
              {regels.length} {regels.length === 1 ? 'regel' : 'regels'} in het bestand
              {basis.length > MAX_REGELS ? ` (de eerste ${MAX_REGELS})` : ''}
              {bestaande === null ? ' · bestaande materialen laden…' : ''}
            </Text>
          </View>

          {regels.length ? (
            <Pressable
              onPress={() => zetAlles(!alleAan)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: alleAan }}
              aria-checked={alleAan}
              style={styles.regelRij}
            >
              <Vink aan={alleAan} styles={styles} />
              <Text style={styles.tekst}>Alles selecteren</Text>
            </Pressable>
          ) : (
            <Text style={styles.hint}>
              Geen regels gevonden.{rijen ? ' Kies onder Kolommen de kopregel en de kolom met de naam.' : ''}
            </Text>
          )}

          <View style={{ gap: spacing.sm }}>
            {regels.slice(0, zichtbaar).map((r) => {
              const bij = Boolean(r.bestaand);
              const status = r.dubbel ? 'Dubbel in bestand' : r.ongewijzigd ? 'Ongewijzigd' : bij ? 'Bijwerken' : 'Nieuw';
              const statusStijl = r.dubbel || r.ongewijzigd ? styles.statusGrijs : bij ? styles.statusBlauw : styles.statusGroen;
              return (
                <View key={r.sleutel} style={[styles.regel, !r.aan && { opacity: 0.6 }, r.twijfel && styles.regelTwijfel]}>
                  <View style={styles.regelRij}>
                    <Pressable
                      onPress={() => setVink((v) => ({ ...v, [r.sleutel]: !r.aan }))}
                      disabled={!r.naam || bezig}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: r.aan }}
                      aria-checked={r.aan}
                      accessibilityLabel={`${r.naam} importeren`}
                      hitSlop={8}
                    >
                      <Vink aan={r.aan} styles={styles} />
                    </Pressable>
                    <Pressable
                      onPress={() => setOpen((o) => (o === r.sleutel ? null : r.sleutel))}
                      accessibilityRole="button"
                      accessibilityLabel={`Prijzen van ${r.naam} aanpassen`}
                      style={{ flex: 1, minWidth: 0, gap: 2 }}
                    >
                      <Text style={styles.naam} numberOfLines={2}>
                        {bij ? r.bestaand!.naam : r.naam}
                      </Text>
                      <Text style={styles.hint} numberOfLines={1}>
                        {[r.artikelnummer || r.bestaand?.artikelnummer, r.eenheid, `${r.btwPct}%`].filter(Boolean).join(' · ')}
                      </Text>
                      <Text style={styles.tekst}>
                        Inkoop {r.inkoopprijs != null ? formatEURCent(r.inkoopprijs) : '—'}
                        {bij && r.bestaand!.inkoopprijs != null ? ` (was ${formatEURCent(r.bestaand!.inkoopprijs)})` : ''}
                        {' · '}Verkoop {r.verkoopprijs != null ? formatEURCent(r.verkoopprijs) : '—'}
                        {r.berekend ? ' (berekend)' : ''}
                        {bij && r.bestaand!.verkoopprijs != null ? ` (was ${formatEURCent(r.bestaand!.verkoopprijs)})` : ''}
                      </Text>
                      {r.twijfel && r.twijfelReden ? <Text style={styles.let}>{r.twijfelReden}</Text> : null}
                    </Pressable>
                    <View style={[styles.status, statusStijl]}>
                      <Text style={styles.statusTekst}>{status}</Text>
                    </View>
                  </View>
                  {open === r.sleutel ? (
                    <View style={styles.prijsVelden}>
                      <BedragVeld
                        label="Inkoop"
                        waarde={r.inkoopprijs}
                        onChange={(n) => pasAan(r.sleutel, 'inkoopprijs', n)}
                        styles={styles}
                        t={t}
                      />
                      <BedragVeld
                        label="Verkoop"
                        waarde={r.verkoopprijs}
                        onChange={(n) => pasAan(r.sleutel, 'verkoopprijs', n)}
                        styles={styles}
                        t={t}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
            {regels.length > zichtbaar ? (
              <Pressable onPress={() => setZichtbaar((z) => z + PER_KEER)} accessibilityRole="button" style={styles.meer}>
                <Text style={styles.link}>Meer tonen ({regels.length - zichtbaar})</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => {
              setStap('kies');
              setRijen(null);
              setAiRegels(null);
              setMelding('');
              setFout(null);
              resetControle();
            }}
            disabled={bezig}
            accessibilityRole="button"
            style={styles.meer}
          >
            <Text style={styles.link}>Ander bestand</Text>
          </Pressable>
        </View>
      ) : null}

      {stap === 'klaar' && uitkomst ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.tekst}>
            <Text style={styles.vet}>{uitkomst.nieuw}</Text>{' '}
            {uitkomst.nieuw === 1 ? 'materiaal toegevoegd' : 'materialen toegevoegd'}
          </Text>
          <Text style={styles.tekst}>
            <Text style={styles.vet}>{uitkomst.bijgewerkt}</Text>{' '}
            {uitkomst.bijgewerkt === 1 ? 'materiaal bijgewerkt' : 'materialen bijgewerkt'}
          </Text>
        </View>
      ) : null}
    </FormSheet>
  );
}

function Vink({ aan, styles }: { aan: boolean; styles: ReturnType<typeof makeStyles> }) {
  return <View style={[styles.vink, aan && styles.vinkAan]}>{aan ? <Check size={14} color={ds.greenInk} strokeWidth={3} /> : null}</View>;
}

/** Bedrag invoeren; leeg mag, komma mag. Pas bij verlaten verwerkt. */
function BedragVeld({
  label,
  waarde,
  onChange,
  styles,
  t,
}: {
  label: string;
  waarde: number | null;
  onChange: (n: number | null) => void;
  styles: ReturnType<typeof makeStyles>;
  t: ThemeColors;
}) {
  const alsTekst = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
  const [tekst, setTekst] = useState(alsTekst(waarde));
  const verwerk = () => {
    // Ongewijzigd: niets vastleggen (een berekende prijs blijft berekend).
    if (tekst.trim() === alsTekst(waarde)) return;
    const n = tekst.trim() === '' ? null : getalUit(tekst);
    onChange(n != null && n >= 0 ? n : null);
    setTekst(alsTekst(n != null && n >= 0 ? n : null));
  };
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={tekst}
        onChangeText={setTekst}
        onBlur={verwerk}
        onSubmitEditing={verwerk}
        keyboardType="decimal-pad"
        placeholder="0,00"
        placeholderTextColor={t.muted2}
        accessibilityLabel={`${label}prijs`}
        style={styles.veld}
      />
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    label: { ...typography.label, color: t.muted2 },
    hint: { ...typography.small, color: t.muted },
    tekst: { ...typography.small, color: t.ink2 },
    vet: { fontWeight: '700', color: t.ink },
    let: { ...typography.small, color: t.statusWarnFg },
    link: { fontSize: 13.5, fontWeight: '700', color: ds.green700 },
    kies: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      minHeight: 64,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: t.lineStrong,
      backgroundColor: t.card,
    },
    kiesTitel: { fontSize: 15, fontWeight: '700', color: t.ink },
    laden: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      minHeight: 40,
      minWidth: 56,
      paddingHorizontal: 13,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipAan: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    opslag: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: t.card, borderWidth: 1, borderColor: t.line },
    opslagRij: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    veld: {
      minHeight: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      fontSize: 15,
      color: t.ink,
      backgroundColor: t.card,
    },
    pctVeld: { width: 80 },
    kolommen: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: t.card, borderWidth: 1, borderColor: t.line },
    kolomKop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
    samenvatting: { gap: 2 },
    regel: { padding: spacing.md, borderRadius: radius.md, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, gap: spacing.sm },
    regelTwijfel: { borderColor: t.statusWarnStripe },
    regelRij: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 32 },
    naam: { fontSize: 14.5, fontWeight: '600', color: t.ink },
    status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
    statusGroen: { backgroundColor: t.statusApproveBg },
    statusBlauw: { backgroundColor: t.statusSubmitBg },
    statusGrijs: { backgroundColor: t.statusDraftBg },
    statusTekst: { fontSize: 11, fontWeight: '700', color: t.ink2 },
    prijsVelden: { flexDirection: 'row', gap: spacing.sm, paddingLeft: 34 },
    vink: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: t.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    vinkAan: { backgroundColor: ds.green, borderColor: ds.green },
    meer: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  });
