import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  File as FileIcon,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Images,
  Pencil,
  Trash2,
} from 'lucide-react-native';
import { useTheme, useToast } from '@/providers';
import { AppFilterChips } from '@/components/AppFilterChips';
import { AppSearchBar } from '@/components/AppSearchBar';
import { FormSheet } from '@/components/FormSheet';
import { FormField } from '@/components/FormField';
import { SelectField } from '@/components/SelectField';
import { Paneel } from '@/components/Paneel';
import { BestandWeergave } from '@/components/BestandWeergave';
import { KaartBlok, KaartLeeg, KaartRij } from '@/components/RelatieKaart';
import { Blok, KleineKnop } from '@/components/project/bouwstenen';
import { Dialog } from '@/lib/dialog';
import { bevestigVerwijderen } from '@/lib/useSave';
import { bereidFotoVoor, FOTO_ALS_BASE64 } from '@/lib/fotoVoorbereiden';
import { kiesBestanden, type KandidaatBestand } from '@/lib/kiesBestand';
import {
  BESTAND_MAX_PER_KEER,
  BESTAND_SOORTEN,
  BESTAND_TYPES_UITLEG,
  bestandFout,
  fmtOpslag,
  getBestanden,
  getOpslagStand,
  isOpslagVol,
  magBestandenToevoegen,
  naamZonderExtensie,
  OPSLAG_VOL_TEKST,
  OPSLAG_WAARSCHUWING,
  SOORT_LABEL,
  updateBestand,
  uploadBestand,
  verwijderBestand,
  type Bestand,
  type BestandSoort,
  type OpslagStand,
} from '@/services/bestandenService';
import { type ThemeColors } from '@/theme';

/**
 * Bestanden: het blok op de klantkaart en de projectkaart, zoals in het
 * dashboard (BestandenBlok.jsx). Alles wat bij de klant of het project bewaard
 * is (offertes, facturen, ondertekende werkbonnen, foto's, bonnen, metingen)
 * plus eigen uploads. Op de klantkaart komen de bestanden van al zijn projecten
 * mee, met de projectnaam erbij. Wie wat ziet, bepaalt de database per bron.
 *
 * Eigen bestanden: toevoegen uit de camera, de fotobibliotheek of de bestanden
 * van het toestel; naam en omschrijving aanpasbaar; verwijderen. Documenten van
 * BossBase zelf blijven bij hun offerte, factuur of werkbon en zijn hier alleen
 * te bekijken, te delen en te bewaren.
 */

const ZICHTBAAR = 8;

type Doel = { sleutel: string; label: string; klantId?: string; projectId?: string };
type Regel = { sleutel: string; bestand: KandidaatBestand; naam: string; omschrijving: string };

const fmtDatum = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtGrootte = (n: number | null) => {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} kB`;
  return `${(n / 1024 / 1024).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} MB`;
};
let teller = 0;
const nieuweSleutel = () => `r${Date.now()}-${teller++}`;

export function BestandenBlok({
  klantId = null,
  projectId = null,
  projecten = [],
}: {
  /** Klantkaart: de klant, met zijn projecten voor de keuze bij uploaden. */
  klantId?: string | null;
  projecten?: { id: string; name: string | null }[];
  /** Projectkaart. */
  projectId?: string | null;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { toon } = useToast();
  const [bestanden, setBestanden] = useState<Bestand[]>([]);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [zoek, setZoek] = useState('');
  const [soort, setSoort] = useState<BestandSoort | 'alle'>('alle');
  const [allesTonen, setAllesTonen] = useState(false);
  const [doelen, setDoelen] = useState<Doel[]>([]);
  const [opslag, setOpslag] = useState<OpslagStand | null>(null);
  const [bronKiezen, setBronKiezen] = useState(false);
  const [regels, setRegels] = useState<Regel[] | null>(null);
  const [doel, setDoel] = useState<string | null>(null);
  const [bezig, setBezig] = useState<{ klaar: number; totaal: number } | null>(null);
  const [uploadFout, setUploadFout] = useState<string | null>(null);
  const [bewerk, setBewerk] = useState<{ bestand: Bestand; naam: string; omschrijving: string } | null>(null);
  const [bewerkBezig, setBewerkBezig] = useState(false);
  const [bewerkFout, setBewerkFout] = useState<string | null>(null);
  const [bekijk, setBekijk] = useState<Bestand | null>(null);

  const laad = useCallback(async () => {
    try {
      setBestanden(await getBestanden({ klantId, projectId }));
      setFout(null);
    } catch (e) {
      if (__DEV__) console.warn('[bestanden] laden mislukt', e);
      setFout('De bestanden konden niet worden geladen.');
    } finally {
      setLaden(false);
    }
  }, [klantId, projectId]);
  const laadOpslag = useCallback(async () => {
    const stand = await getOpslagStand().catch(() => null);
    setOpslag(stand);
    return stand;
  }, []);

  // Elke klant- of projectkaart is een eigen scherm, dus het blok begint per
  // klant of project opnieuw; laden gebeurt hier alleen bij openen.
  useEffect(() => {
    let actief = true;
    getBestanden({ klantId, projectId })
      .then((l) => actief && (setBestanden(l), setFout(null)))
      .catch((e) => {
        if (__DEV__) console.warn('[bestanden] laden mislukt', e);
        if (actief) setFout('De bestanden konden niet worden geladen.');
      })
      .finally(() => actief && setLaden(false));
    getOpslagStand()
      .then((st) => actief && setOpslag(st))
      .catch(() => {});
    return () => {
      actief = false;
    };
  }, [klantId, projectId]);

  // Waar mag deze gebruiker eigen bestanden aan koppelen? Dezelfde regel als de
  // database: de klant (klanten_bewerken) of een project waar hij aan werkt.
  const projectSleutel = projecten.map((p) => p.id).join(',');
  useEffect(() => {
    let actief = true;
    const kandidaten: Doel[] = projectId
      ? [{ sleutel: `p:${projectId}`, label: 'Dit project', projectId }]
      : klantId
        ? [
            { sleutel: `k:${klantId}`, label: 'De klant zelf', klantId },
            ...projecten.map((p) => ({ sleutel: `p:${p.id}`, label: `Project: ${p.name || 'Project'}`, projectId: p.id })),
          ]
        : [];
    Promise.all(kandidaten.map((d) => magBestandenToevoegen(d))).then((mag) => {
      if (actief) setDoelen(kandidaten.filter((_, i) => mag[i]));
    });
    return () => {
      actief = false;
    };
    // projecten zit in projectSleutel; een nieuwe lijst met dezelfde ids hoeft niet opnieuw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klantId, projectId, projectSleutel]);

  const magToevoegen = doelen.length > 0;

  // ── Kiezen ────────────────────────────────────────────────────────────────
  const klaarzetten = (gekozen: KandidaatBestand[]) => {
    const goed: KandidaatBestand[] = [];
    for (const b of gekozen) {
      const reden = bestandFout({ naam: b.naam, mime: b.mime, grootte: b.grootte });
      if (reden) toon(reden, 'fout');
      else goed.push(b);
    }
    if (goed.length > BESTAND_MAX_PER_KEER) {
      toon(`Maximaal ${BESTAND_MAX_PER_KEER} bestanden tegelijk. De eerste ${BESTAND_MAX_PER_KEER} staan klaar.`, 'waarschuwing');
    }
    if (!goed.length) return;
    setUploadFout(null);
    setDoel(doelen[0]?.sleutel ?? null);
    setRegels(
      goed.slice(0, BESTAND_MAX_PER_KEER).map((b) => ({
        sleutel: nieuweSleutel(),
        bestand: b,
        naam: naamZonderExtensie(b.naam),
        omschrijving: '',
      })),
    );
  };

  const fotoKiezen = async (bron: 'camera' | 'bibliotheek') => {
    try {
      // Op web geen toestemming vragen: elke await vóór de kiezer kan in
      // Safari de gebruikersactie laten verlopen.
      if (Platform.OS !== 'web') {
        const vraag =
          bron === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!vraag.granted) {
          Dialog.alert(
            'Geen toestemming',
            bron === 'camera'
              ? 'Geef BossBase toegang tot de camera om een foto te maken.'
              : "Geef BossBase toegang tot je foto's om er een te kiezen.",
          );
          return;
        }
      }
      const opties: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.7,
        base64: FOTO_ALS_BASE64,
        allowsMultipleSelection: bron === 'bibliotheek',
        selectionLimit: BESTAND_MAX_PER_KEER,
      };
      const r =
        bron === 'camera' ? await ImagePicker.launchCameraAsync(opties) : await ImagePicker.launchImageLibraryAsync(opties);
      if (r.canceled || !r.assets?.length) return;
      const gekozen: KandidaatBestand[] = [];
      const datum = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
      for (const [i, asset] of r.assets.entries()) {
        // Zelfde voorbereiding als werkbonfoto's: verkleind, type uit de bytes.
        const foto = await bereidFotoVoor(asset);
        if (!foto.ok) {
          toon(foto.tekst, 'fout');
          continue;
        }
        const nr = r.assets.length > 1 ? ` ${i + 1}` : '';
        gekozen.push({
          naam: `Foto ${datum}${nr}.${foto.extensie}`,
          mime: foto.contentType,
          grootte: foto.bytes.byteLength,
          lees: async () => foto.bytes,
        });
      }
      klaarzetten(gekozen);
    } catch {
      Dialog.alert('Foto niet gelezen', 'Er ging iets mis bij het kiezen van de foto.');
    }
  };

  const bestandKiezen = async () => {
    const gekozen = await kiesBestanden();
    if (gekozen) klaarzetten(gekozen);
  };

  const kies = (bron: 'camera' | 'bibliotheek' | 'bestanden') => {
    setBronKiezen(false);
    const start = () => (bron === 'bestanden' ? bestandKiezen() : fotoKiezen(bron));
    // Web: de kiezer moet binnen dezelfde tik open. iOS/Android: eerst het
    // paneel laten sluiten, anders kan de kiezer niet over een modal heen.
    if (Platform.OS === 'web') start();
    else setTimeout(start, 450);
  };

  const toevoegen = async () => {
    // Vol? Dan meteen zeggen, voordat iemand iets kiest of namen invult.
    const stand = await laadOpslag();
    if (stand?.vol) {
      Dialog.alert('Opslag vol', OPSLAG_VOL_TEKST);
      return;
    }
    setBronKiezen(true);
  };

  // ── Uploaden ──────────────────────────────────────────────────────────────
  const zetRegel = (sleutel: string, veld: 'naam' | 'omschrijving', waarde: string) =>
    setRegels((rs) => rs?.map((r) => (r.sleutel === sleutel ? { ...r, [veld]: waarde } : r)) ?? null);

  const uploaden = async () => {
    const gekozen = doelen.find((d) => d.sleutel === doel);
    if (!regels?.length || !gekozen) return;
    setUploadFout(null);
    setBezig({ klaar: 0, totaal: regels.length });
    let gelukt = 0;
    const mislukt: Regel[] = [];
    let melding: string | null = null;
    let vol = false;
    for (const r of regels) {
      // Raakt de opslag halverwege vol, dan heeft de rest geen zin.
      if (vol) {
        mislukt.push(r);
        continue;
      }
      let res;
      try {
        res = await uploadBestand({
          bestand: { naam: r.bestand.naam, mime: r.bestand.mime, bytes: await r.bestand.lees() },
          doel: { klantId: gekozen.klantId ?? null, projectId: gekozen.projectId ?? null },
          naam: r.naam,
          omschrijving: r.omschrijving,
        });
      } catch {
        res = { ok: false as const, soort: 'onbekend' as const, melding: `${r.bestand.naam}: het bestand kon niet worden gelezen.` };
      }
      if (res.ok) gelukt++;
      else {
        mislukt.push(r);
        if (isOpslagVol(res)) vol = true;
        melding = res.melding;
      }
      setBezig((b) => (b ? { ...b, klaar: b.klaar + 1 } : b));
    }
    setBezig(null);
    if (gelukt) {
      toon(gelukt === 1 ? 'Bestand toegevoegd' : `${gelukt} bestanden toegevoegd`, 'succes');
      laad();
      laadOpslag();
    }
    // Wat mislukte blijft staan, zodat je het opnieuw kunt proberen.
    if (mislukt.length) {
      setRegels(mislukt);
      setUploadFout(vol ? OPSLAG_VOL_TEKST : melding);
    } else setRegels(null);
  };

  // ── Wijzigen en verwijderen ───────────────────────────────────────────────
  const opslaan = async () => {
    if (!bewerk) return;
    setBewerkBezig(true);
    setBewerkFout(null);
    const res = await updateBestand(bewerk.bestand.bronId, { naam: bewerk.naam, omschrijving: bewerk.omschrijving });
    setBewerkBezig(false);
    if (!res.ok) {
      setBewerkFout(res.melding);
      return;
    }
    toon('Opgeslagen', 'succes');
    setBewerk(null);
    laad();
  };

  const verwijder = (b: Bestand) => {
    bevestigVerwijderen(`"${b.naam}"`, async () => {
      const res = await verwijderBestand(b);
      if (!res.ok) {
        toon(res.melding, 'fout');
        return;
      }
      setBestanden((l) => l.filter((x) => x.sleutel !== b.sleutel));
      setBewerk(null);
      toon('Bestand verwijderd', 'succes');
      laadOpslag();
    });
  };

  // ── Lijst ─────────────────────────────────────────────────────────────────
  const aantalPerSoort = useMemo(() => {
    const per: Partial<Record<BestandSoort, number>> = {};
    for (const b of bestanden) per[b.soort] = (per[b.soort] ?? 0) + 1;
    return per;
  }, [bestanden]);
  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return bestanden.filter(
      (b) =>
        (soort === 'alle' || b.soort === soort) &&
        (!q ||
          [b.naam, b.omschrijving, b.projectNaam, SOORT_LABEL[b.soort]].some((v) =>
            String(v || '').toLowerCase().includes(q),
          )),
    );
  }, [bestanden, zoek, soort]);
  const getoond = allesTonen ? gefilterd : gefilterd.slice(0, ZICHTBAAR);
  const chips = useMemo(
    () => [
      { id: 'alle' as const, label: 'Alles' },
      ...BESTAND_SOORTEN.filter((s) => aantalPerSoort[s.id]).map((s) => ({ ...s, count: aantalPerSoort[s.id] })),
    ],
    [aantalPerSoort],
  );

  const icoon = (b: Bestand) => {
    const p = { size: 18, color: t.muted, strokeWidth: 1.8 };
    if (/^image\//.test(b.mime) && !/dwg|dxf/.test(b.mime)) return <ImageIcon {...p} />;
    if (b.mime === 'application/pdf') return <FileText {...p} />;
    return <FileIcon {...p} />;
  };

  const inhoud = (
    <View style={styles.inhoud}>
      {magToevoegen && opslag && (opslag.vol || (opslag.max && opslag.deel >= OPSLAG_WAARSCHUWING)) ? (
        <Text style={[styles.opslag, { color: opslag.vol ? t.statusRejectFg : t.statusWarnFg }]}>
          {opslag.vol
            ? `Je opslag is vol (${fmtOpslag(opslag.gebruikt)} van ${fmtOpslag(opslag.max ?? 0)}). Nieuwe bestanden toevoegen lukt pas weer met meer ruimte: verwijder bestanden of kies een groter pakket.`
            : `Je gebruikt ${Math.round(opslag.deel * 100)}% van je opslag (${fmtOpslag(opslag.gebruikt)} van ${fmtOpslag(opslag.max ?? 0)}).`}
        </Text>
      ) : null}

      {bestanden.length > 0 ? (
        <View style={styles.filters}>
          <AppSearchBar
            value={zoek}
            onChange={(v) => {
              setZoek(v);
              setAllesTonen(false);
            }}
            placeholder="Zoek op naam, omschrijving of project"
          />
          {chips.length > 2 ? (
            <View style={styles.chips}>
              <AppFilterChips
                chips={chips}
                active={soort}
                onChange={(id) => {
                  setSoort(id);
                  setAllesTonen(false);
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {laden ? (
        <Text style={styles.klein}>Laden…</Text>
      ) : fout ? (
        <View style={styles.foutRij}>
          <Text style={styles.klein}>{fout}</Text>
          <KleineKnop
            label="Opnieuw proberen"
            onPress={() => {
              setLaden(true);
              laad();
            }}
          />
        </View>
      ) : bestanden.length === 0 ? (
        <KaartLeeg
          tekst={
            magToevoegen
              ? 'Nog geen bestanden. Voeg een foto, tekening, contract of garantiebewijs toe met de plus.'
              : 'Nog geen bestanden.'
          }
        />
      ) : gefilterd.length === 0 ? (
        <Text style={styles.klein}>Geen bestanden gevonden.</Text>
      ) : (
        <View>
          {getoond.map((b, i) => (
            <KaartRij
              key={b.sleutel}
              eerste={i === 0}
              links={<View style={styles.icoon}>{icoon(b)}</View>}
              titel={b.naam}
              sub={[
                [SOORT_LABEL[b.soort], klantId ? b.projectNaam : '', fmtDatum(b.datum), fmtGrootte(b.grootte)]
                  .filter(Boolean)
                  .join(' · '),
                b.omschrijving,
              ]
                .filter(Boolean)
                .join('\n')}
              onPress={() => setBekijk(b)}
              rechts={
                b.eigen && b.magBeheren ? (
                  <Pressable
                    onPress={() => {
                      setBewerkFout(null);
                      setBewerk({ bestand: b, naam: b.naam, omschrijving: b.omschrijving });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.naam} wijzigen`}
                    hitSlop={8}
                    style={({ pressed }) => [styles.rijKnop, pressed && { opacity: 0.6 }]}
                  >
                    <Pencil size={16} color={t.muted} />
                  </Pressable>
                ) : undefined
              }
            />
          ))}
          {gefilterd.length > ZICHTBAAR ? (
            <Pressable onPress={() => setAllesTonen((v) => !v)} accessibilityRole="button" hitSlop={6} style={styles.meer}>
              <Text style={styles.meerTekst}>{allesTonen ? 'Minder tonen' : `Alle ${gefilterd.length} tonen`}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <>
      {klantId && !projectId ? (
        <KaartBlok
          titel="Bestanden"
          aantal={bestanden.length}
          onToevoegen={magToevoegen ? toevoegen : undefined}
          toevoegLabel="Bestand toevoegen"
        >
          {inhoud}
        </KaartBlok>
      ) : (
        <Blok titel="Bestanden" actie={magToevoegen ? <KleineKnop label="Bestand" icon="plus" onPress={toevoegen} /> : undefined}>
          {inhoud}
        </Blok>
      )}

      {/* Waar komt het bestand vandaan? Drie bronnen, ook op Android (een
          systeemdialoog daar heeft maximaal drie knoppen, inclusief Annuleren). */}
      <Paneel open={bronKiezen} titel="Bestand toevoegen" subtitel={BESTAND_TYPES_UITLEG} onSluit={() => setBronKiezen(false)}>
        <View style={styles.bronnen}>
          {(
            [
              { id: 'camera', label: 'Camera', sub: 'Maak een foto', Icoon: Camera },
              { id: 'bibliotheek', label: 'Fotobibliotheek', sub: "Kies een of meer foto's", Icoon: Images },
              { id: 'bestanden', label: 'Bestanden', sub: 'PDF, Word, Excel, tekening …', Icoon: FolderOpen },
            ] as const
          ).map(({ id, label, sub, Icoon }) => (
            <Pressable
              key={id}
              onPress={() => kies(id)}
              accessibilityRole="button"
              accessibilityLabel={label}
              style={({ pressed }) => [styles.bron, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.bronIcoon}>
                <Icoon size={20} color={t.ink} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bronLabel}>{label}</Text>
                <Text style={styles.klein}>{sub}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Paneel>

      <FormSheet
        visible={regels !== null}
        title={regels && regels.length > 1 ? `${regels.length} bestanden toevoegen` : 'Bestand toevoegen'}
        subtitle={BESTAND_TYPES_UITLEG}
        error={uploadFout}
        saving={!!bezig}
        submitLabel={bezig ? `Uploaden… ${bezig.klaar} van ${bezig.totaal}` : 'Toevoegen'}
        submitDisabled={!regels?.length || !doel || regels.some((r) => !r.naam.trim())}
        onSubmit={uploaden}
        onClose={() => setRegels(null)}
      >
        {doelen.length > 1 ? (
          <SelectField
            label="Hoort bij"
            value={doel}
            options={doelen.map((d) => ({ id: d.sleutel, label: d.label }))}
            onChange={(id) => setDoel(id)}
            disabled={!!bezig}
          />
        ) : doelen.length === 1 && !projectId && doelen[0]?.projectId ? (
          // Op de klantkaart mag niet iedereen bij de klant zelf uploaden; staat
          // er maar één keuze over, zeg dan waar het bestand terechtkomt.
          <Text style={styles.klein}>Hoort bij {doelen[0]?.label.replace(/^Project: /, 'het project ')}</Text>
        ) : null}
        {regels?.map((r) => (
          <View key={r.sleutel} style={styles.regel}>
            <View style={styles.regelKop}>
              <Text style={[styles.klein, { flex: 1 }]} numberOfLines={1}>
                {r.bestand.naam} · {fmtGrootte(r.bestand.grootte)}
              </Text>
              {regels.length > 1 && !bezig ? (
                <Pressable
                  onPress={() => setRegels((rs) => rs?.filter((x) => x.sleutel !== r.sleutel) ?? null)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.bestand.naam} niet toevoegen`}
                  hitSlop={8}
                >
                  <Trash2 size={16} color={t.statusRejectFg} />
                </Pressable>
              ) : null}
            </View>
            <FormField
              label="Naam"
              value={r.naam}
              maxLength={200}
              onChangeText={(v) => zetRegel(r.sleutel, 'naam', v)}
              editable={!bezig}
            />
            <FormField
              label="Omschrijving"
              value={r.omschrijving}
              maxLength={2000}
              placeholder="bijv. garantie tot 2031, getekend contract"
              onChangeText={(v) => zetRegel(r.sleutel, 'omschrijving', v)}
              editable={!bezig}
            />
          </View>
        ))}
        {bezig ? <ActivityIndicator color={t.green700} /> : null}
      </FormSheet>

      <FormSheet
        visible={bewerk !== null}
        title="Bestand wijzigen"
        subtitle={bewerk?.bestand.naam}
        error={bewerkFout}
        saving={bewerkBezig}
        submitDisabled={!bewerk?.naam.trim()}
        onSubmit={opslaan}
        onClose={() => setBewerk(null)}
        destructive={bewerk ? { label: 'Verwijderen', onPress: () => verwijder(bewerk.bestand) } : undefined}
      >
        {bewerk ? (
          <>
            <FormField
              label="Naam"
              value={bewerk.naam}
              maxLength={200}
              onChangeText={(v) => setBewerk({ ...bewerk, naam: v })}
            />
            <FormField
              label="Omschrijving"
              value={bewerk.omschrijving}
              maxLength={2000}
              multiline
              onChangeText={(v) => setBewerk({ ...bewerk, omschrijving: v })}
            />
          </>
        ) : null}
      </FormSheet>

      <BestandWeergave
        bestand={bekijk}
        onSluit={() => setBekijk(null)}
        onVerwijder={(b) => {
          // Eerst de weergave dicht, dan de vraag: een dialoog boven een
          // schermvullende modal valt op web anders achter die modal.
          setBekijk(null);
          setTimeout(() => verwijder(b), Platform.OS === 'web' ? 0 : 400);
        }}
      />
    </>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    inhoud: { gap: 10 },
    filters: { gap: 8 },
    chips: { marginHorizontal: -16 },
    klein: { fontSize: 13, color: t.muted, lineHeight: 18 },
    opslag: { fontSize: 13, lineHeight: 18 },
    foutRij: { gap: 8, alignItems: 'flex-start' },
    icoon: { width: 32, height: 32, borderRadius: 8, backgroundColor: t.bgAlt, alignItems: 'center', justifyContent: 'center' },
    rijKnop: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    meer: { paddingTop: 10, alignSelf: 'flex-start' },
    meerTekst: { fontSize: 13, fontWeight: '700', color: t.green700 },
    bronnen: { gap: 8, paddingBottom: 8 },
    bron: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      backgroundColor: t.card,
    },
    bronIcoon: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.bgAlt, alignItems: 'center', justifyContent: 'center' },
    bronLabel: { fontSize: 15, fontWeight: '700', color: t.ink },
    regel: {
      gap: 8,
      padding: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
    },
    regelKop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  });
