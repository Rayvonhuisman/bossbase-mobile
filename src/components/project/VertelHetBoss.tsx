import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Mic, Pencil, Square, Trash2 } from 'lucide-react-native';
import { Paneel } from '@/components/Paneel';
import { Dialog } from '@/lib/dialog';
import { DICTEER_HINT, useSpraak } from '@/lib/spraak';
import { useToetsenbordOpen } from '@/lib/zichtbareViewport';
import { useTheme } from '@/providers';
import { ds, radius, spacing, type ThemeColors } from '@/theme';
import {
  alsMaten,
  alVerwerkt,
  bestaandeVoor,
  haalStukWeg,
  nieuweSleutel,
  stukVerwerkt,
  toonSom,
  waaromNietOpslaan,
  type BrancheVeld,
  type Meting,
  type MetingForm,
  type Regel,
  type Stuk,
} from '@/lib/metingen';
import { createMeting, vertelMetingen } from '@/services/metingService';
import { MetingVelden } from './MetingVelden';

/**
 * "Vertel het Boss" in de app: een schilder loopt door een huis en vertelt wat
 * hij meet, in één verhaal of per ruimte. Zelfde stroom als het dashboard
 * (MetingenBlok.jsx, VertelBoss + ControleVenster):
 *
 *   1. inspreken of typen in het tekstvak (de tekst is daar te verbeteren);
 *   2. Verwerken: de edge function metingen-uitlezen maakt er regels van;
 *   3. elk stuk komt erbij (Stuk 1, 2, 3 …), met voegStukToe: niets dubbel,
 *      "de keuken was toch 3,10" verbetert de eerdere regel, en een stuk
 *      opnieuw verwerken vervangt zijn eigen regels;
 *   4. de regels staan in een controlelijst; twijfel = eerst nakijken;
 *   5. pas Opslaan zet ze in de database.
 *
 * Met één hand: alles wat je steeds nodig hebt (tekstvak, microfoon, de grote
 * knop) staat onderin, binnen bereik van de duim. De grote knop is Verwerken
 * zolang er tekst staat, en Opslaan als alles verwerkt is.
 *
 * Inspreken: in de webapp (app.bossbase.nl) de spraakherkenning van de browser
 * (lib/spraak.web: Chrome op Android, Safari op iOS via webkitSpeechRecognition);
 * de microfoonknop staat er alleen als de browser dat kan. Anders, en in de
 * iOS- en Android-app, het dicteren van het toetsenbord: het tekstvak is een
 * gewoon veld, dus de microfoon op het toetsenbord werkt.
 */
export function VertelHetBoss({
  open,
  projectId,
  velden,
  volgordeVanaf,
  onSluit,
  onOpgeslagen,
}: {
  open: boolean;
  projectId: string;
  velden: BrancheVeld[];
  /** Volgorde van de eerste nieuwe meting (achter de bestaande). */
  volgordeVanaf: number;
  onSluit: () => void;
  onOpgeslagen: (nieuw: Meting[]) => void;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [invoer, setInvoer] = useState('');
  const [stukken, setStukken] = useState<Stuk[]>([]);
  const [regels, setRegels] = useState<Regel[]>([]);
  const [bewerk, setBewerk] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [bericht, setBericht] = useState<{ tekst: string; fout: boolean } | null>(null);
  const [uitgeklapt, setUitgeklapt] = useState<string | null>(null);
  const [opslaanBezig, setOpslaanBezig] = useState(false);
  const [opslaanFout, setOpslaanFout] = useState<string | null>(null);
  const veld = useRef<TextInput>(null);
  const lijst = useRef<ScrollView>(null);
  // De regels zoals ze NU staan, ook na het wachten op Boss: wat de gebruiker
  // intussen aanpaste blijft staan (zoals het dashboard).
  // (Het blok zet dit paneel pas neer bij openen, dus elke keer begint het leeg.)
  const nu = useRef(regels);
  useEffect(() => {
    nu.current = regels;
  }, [regels]);
  const spraak = useSpraak({ setTekst: setInvoer });
  const luistert = spraak.stand !== 'uit';
  const toetsenbordOpen = useToetsenbordOpen();

  const tekst = invoer.trim();
  const nogNakijken = regels.filter((r) => !r.nagekeken).length;
  const blokkade = waaromNietOpslaan(regels);
  // De grote knop: verwerken zolang er tekst staat (of een stuk wordt aangepast).
  const knopVerwerkt = Boolean(tekst) || Boolean(bewerk) || regels.length === 0;

  const verwerk = async () => {
    if (!tekst || bezig || luistert) return;
    const dubbel = alVerwerkt(stukken, tekst, bewerk);
    if (dubbel) {
      setBericht({ tekst: `Dit stuk is al verwerkt (stuk ${dubbel}).`, fout: true });
      return;
    }
    const id = bewerk ?? nieuweSleutel();
    setBezig(true);
    setBericht(null);
    const antwoord = await vertelMetingen(projectId, tekst, bestaandeVoor(nu.current, id));
    setBezig(false);
    if (!antwoord.ok) {
      setBericht({ tekst: `${antwoord.melding} Je tekst staat er nog.`, fout: true });
      return;
    }
    const uit = stukVerwerkt({
      regels: nu.current,
      stukken,
      stukId: id,
      opnieuw: Boolean(bewerk),
      tekst,
      metingen: antwoord.metingen,
      melding: antwoord.melding,
    });
    setRegels(uit.regels);
    setStukken(uit.stukken);
    setBericht(uit.bericht);
    setInvoer('');
    setBewerk(null);
    setTimeout(() => lijst.current?.scrollToEnd({ animated: true }), 80);
  };

  const pasStukAan = (stuk: Stuk) => {
    if (luistert) spraak.stop();
    setBewerk(stuk.id);
    setInvoer(stuk.tekst);
    setBericht(null);
    veld.current?.focus();
  };

  const haalWeg = (stuk: Stuk) => {
    const uit = haalStukWeg(regels, stukken, stuk.id);
    setRegels(uit.regels);
    setStukken(uit.stukken);
    if (bewerk === stuk.id) {
      setBewerk(null);
      setInvoer('');
    }
  };

  const zet = (sleutel: string, wijzig: Partial<Regel>) =>
    setRegels((rs) => rs.map((r) => (r.sleutel === sleutel ? { ...r, ...wijzig } : r)));

  const opslaan = async () => {
    if (blokkade || opslaanBezig) return;
    setOpslaanBezig(true);
    setOpslaanFout(null);
    const nieuw: Meting[] = [];
    // Eén voor één: wat lukt, verdwijnt uit de lijst. Mislukt er halverwege
    // iets, dan blijft alleen de rest staan en wordt niets dubbel opgeslagen.
    let rest = [...regels];
    for (const [i, r] of regels.entries()) {
      const res = await createMeting(projectId, r, { volgorde: volgordeVanaf + i });
      if (!res.ok) {
        setOpslaanFout(`${res.melding}${nieuw.length ? ` (${nieuw.length} wel opgeslagen)` : ''}`);
        break;
      }
      nieuw.push(res.data);
      rest = rest.filter((x) => x.sleutel !== r.sleutel);
    }
    setRegels(rest);
    setOpslaanBezig(false);
    if (nieuw.length) onOpgeslagen(nieuw);
    if (!rest.length) onSluit();
  };

  const sluit = () => {
    if (opslaanBezig || bezig) return;
    if (luistert) spraak.stop();
    if (!regels.length && !tekst) return onSluit();
    Dialog.alert(
      regels.length ? `${regels.length === 1 ? '1 meting' : `${regels.length} metingen`} niet opslaan?` : 'Tekst niet verwerken?',
      'Wat je hebt verteld is dan weg.',
      [
        { text: 'Terug', style: 'cancel' },
        { text: regels.length ? 'Niet opslaan' : 'Weggooien', style: 'destructive', onPress: onSluit },
      ],
    );
  };

  const mic = () => {
    if (luistert) return spraak.stop();
    spraak.start();
  };

  const voet = (
    <View style={s.voet}>
      {luistert ? (
        <View style={s.luister} accessibilityLiveRegion="polite">
          <View style={s.stip} />
          <Text style={s.luisterTekst}>
            {spraak.stand === 'start' ? 'Microfoon starten…' : 'Boss luistert… tik op stop als je klaar bent'}
          </Text>
        </View>
      ) : null}
      {spraak.fout ? (
        <Pressable onPress={spraak.wisFout} accessibilityRole="alert" style={s.melding}>
          <AlertTriangle size={14} color={t.statusRejectFg} />
          <Text style={[s.meldingTekst, { color: t.statusRejectFg }]}>{spraak.fout}</Text>
        </Pressable>
      ) : null}
      {bericht && !luistert ? (
        <Text
          style={[s.meldingTekst, { color: bericht.fout ? t.statusWarnFg : t.statusApproveFg }]}
          accessibilityLiveRegion="polite"
        >
          {bericht.tekst}
        </Text>
      ) : null}
      {opslaanFout ? (
        <Text style={[s.meldingTekst, { color: t.statusRejectFg }]} accessibilityRole="alert">
          {opslaanFout}
        </Text>
      ) : null}
      {bewerk ? (
        <View style={s.bewerkRij}>
          <Text style={[s.meldingTekst, { flex: 1 }]}>
            Stuk {stukken.findIndex((x) => x.id === bewerk) + 1} aanpassen
          </Text>
          <Pressable
            onPress={() => {
              setBewerk(null);
              setInvoer('');
            }}
            hitSlop={10}
            accessibilityRole="button"
          >
            <Text style={s.link}>Annuleren</Text>
          </Pressable>
        </View>
      ) : null}
      <TextInput
        ref={veld}
        value={invoer}
        onChangeText={setInvoer}
        multiline
        editable={!bezig}
        placeholder={
          spraak.ondersteund
            ? 'Tik op de microfoon en vertel wat je meet, of typ'
            : 'Typ wat je meet, of spreek in met de microfoon van je toetsenbord'
        }
        placeholderTextColor={t.muted2}
        accessibilityLabel="Wat je gemeten hebt"
        style={[s.invoer, toetsenbordOpen && s.invoerKlein]}
        testID="meting-boss-tekst"
      />
      <View style={s.knoppen}>
        {spraak.ondersteund ? (
          <Pressable
            onPress={mic}
            disabled={bezig}
            accessibilityRole="button"
            accessibilityLabel={luistert ? 'Inspreken stoppen' : 'Inspreken'}
            accessibilityState={{ disabled: bezig, selected: luistert }}
            testID="meting-boss-mic"
            style={({ pressed }) => [s.mic, luistert && s.micAan, bezig && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}
          >
            {luistert ? <Square size={22} color="#FFFFFF" fill="#FFFFFF" /> : <Mic size={28} color={ds.greenInk} />}
          </Pressable>
        ) : null}
        {knopVerwerkt ? (
          <Pressable
            onPress={verwerk}
            disabled={!tekst || bezig || luistert}
            accessibilityRole="button"
            accessibilityState={{ disabled: !tekst || bezig || luistert, busy: bezig }}
            testID="meting-boss-verwerken"
            style={({ pressed }) => [s.groot, (!tekst || bezig || luistert) && s.uit, pressed && { opacity: 0.85 }]}
          >
            {bezig ? <ActivityIndicator color={ds.greenInk} /> : null}
            <Text style={s.grootTekst}>
              {bezig ? 'Boss verwerkt…' : bewerk ? 'Opnieuw verwerken' : stukken.length ? 'Ook verwerken' : 'Verwerken'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={opslaan}
            disabled={Boolean(blokkade) || opslaanBezig}
            accessibilityRole="button"
            accessibilityState={{ disabled: Boolean(blokkade) || opslaanBezig, busy: opslaanBezig }}
            testID="meting-boss-opslaan"
            style={({ pressed }) => [s.groot, (blokkade || opslaanBezig) && s.uit, pressed && { opacity: 0.85 }]}
          >
            {opslaanBezig ? <ActivityIndicator color={ds.greenInk} /> : null}
            <Text style={s.grootTekst}>
              {opslaanBezig ? 'Opslaan…' : regels.length === 1 ? '1 meting opslaan' : `${regels.length} metingen opslaan`}
            </Text>
          </Pressable>
        )}
      </View>
      {!knopVerwerkt && blokkade ? <Text style={s.klein}>{blokkade}</Text> : null}
    </View>
  );

  return (
    <Paneel
      open={open}
      titel="Vertel het Boss"
      subtitel={regels.length ? `${regels.length === 1 ? '1 meting' : `${regels.length} metingen`} · nog niets opgeslagen` : 'Inspreken of typen, in één keer of per ruimte'}
      onSluit={sluit}
      voet={voet}
    >
      <ScrollView ref={lijst} contentContainerStyle={s.inhoud} keyboardShouldPersistTaps="handled">
        {stukken.length === 0 ? (
          <View style={s.uitleg}>
            <Text style={s.uitlegTekst}>
              Vertel wat je meet, bijvoorbeeld: “woonkamer 5 meter 20 bij 4 meter 10, plafond 2,60 hoog, twee ramen van 1,20 bij
              1,40”. Dat mag in één verhaal of per ruimte: elk stuk komt erbij.
            </Text>
            <Text style={s.uitlegTekst}>
              Boss zet het in een lijst. Je kijkt alles na, en pas als je op opslaan tikt komen de metingen bij het project.
            </Text>
            {!spraak.ondersteund ? (
              <View style={s.hint}>
                <Mic size={14} color={t.green700} />
                <Text style={[s.meldingTekst, { color: t.ink2, flex: 1 }]}>
                  {DICTEER_HINT}
                  {Platform.OS === 'web' ? ' Inspreken in de app zelf werkt in Chrome en Safari.' : ''}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={s.stukken}>
            {stukken.map((st, i) => (
              <View key={st.id} style={[s.stuk, bewerk === st.id && s.stukBewerk]}>
                <Text style={s.stukNr}>Stuk {i + 1}</Text>
                <Text style={s.stukTekst} numberOfLines={2}>
                  {st.tekst}
                </Text>
                <Text style={s.stukAantal}>{st.aantal}</Text>
                <Pressable
                  onPress={() => pasStukAan(st)}
                  disabled={bezig}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Stuk ${i + 1} aanpassen en opnieuw verwerken`}
                  style={s.rondKlein}
                >
                  <Pencil size={16} color={t.ink2} />
                </Pressable>
                <Pressable
                  onPress={() => haalWeg(st)}
                  disabled={bezig}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Stuk ${i + 1} en zijn metingen weghalen`}
                  style={s.rondKlein}
                >
                  <Trash2 size={16} color={t.statusRejectFg} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {regels.length > 0 ? (
          <View style={s.controle}>
            <Text style={s.kop}>Nakijken</Text>
            {nogNakijken > 0 ? (
              <View style={s.waarschuwing}>
                <AlertTriangle size={15} color={t.statusWarnFg} />
                <Text style={[s.meldingTekst, { color: t.statusWarnFg, flex: 1 }]}>
                  {nogNakijken === 1 ? '1 meting moet je nakijken' : `${nogNakijken} metingen moet je nakijken`} voordat je kunt
                  opslaan. Tik op Klopt, of pas hem aan.
                </Text>
              </View>
            ) : null}
            {regels.map((r, i) => {
              const som = toonSom(alsMaten(r));
              const open = uitgeklapt === r.sleutel;
              return (
                <View key={r.sleutel} style={[s.regel, !r.nagekeken && s.regelTwijfel]}>
                  <View style={s.regelKop}>
                    <Pressable
                      onPress={() => setUitgeklapt(open ? null : r.sleutel)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={`${r.naam || `Meting ${i + 1}`}, ${som || 'maat ontbreekt'}. ${open ? 'Inklappen' : 'Aanpassen'}`}
                      style={s.regelTik}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.regelNaam} numberOfLines={2}>
                          {r.naam || 'Zonder naam'}
                        </Text>
                        <Text style={[s.regelSom, !som && { color: t.statusWarnFg }]}>{som || 'Maat ontbreekt'}</Text>
                        {!r.nagekeken && r.twijfelReden ? <Text style={s.twijfelTekst}>{r.twijfelReden}</Text> : null}
                        {r.nagekeken && r.twijfel ? <Text style={[s.klein, { color: t.statusApproveFg }]}>Nagekeken</Text> : null}
                      </View>
                      {open ? <ChevronUp size={18} color={t.muted} /> : <ChevronDown size={18} color={t.muted} />}
                    </Pressable>
                    <Pressable
                      onPress={() => setRegels((rs) => rs.filter((x) => x.sleutel !== r.sleutel))}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.naam || 'Meting'} weglaten`}
                      hitSlop={6}
                      style={s.rondKlein}
                    >
                      <Trash2 size={16} color={t.statusRejectFg} />
                    </Pressable>
                  </View>
                  {!r.nagekeken ? (
                    <Pressable
                      onPress={() => zet(r.sleutel, { nagekeken: true })}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.naam || 'Meting'} klopt`}
                      style={({ pressed }) => [s.klopt, pressed && { opacity: 0.8 }]}
                    >
                      <Check size={16} color={ds.greenInk} />
                      <Text style={s.kloptTekst}>Klopt</Text>
                    </Pressable>
                  ) : null}
                  {open ? (
                    <View style={s.regelVelden}>
                      <MetingVelden
                        m={r}
                        // Aanpassen telt als nakijken, zoals in het dashboard.
                        set={(k, v) => zet(r.sleutel, { [k]: v, nagekeken: true } as Partial<MetingForm & Regel>)}
                        velden={velden}
                        twijfelVelden={r.nagekeken ? [] : (r.twijfelVelden ?? [])}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </Paneel>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    inhoud: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
    uitleg: { gap: spacing.sm },
    uitlegTekst: { fontSize: 14, lineHeight: 20, color: t.ink2 },
    hint: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: radius.md, backgroundColor: t.bgAlt },
    stukken: { gap: 6 },
    stuk: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingLeft: 10,
      paddingRight: 4,
      borderRadius: radius.md,
      backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
    },
    stukBewerk: { borderColor: t.statusWarnStripe, borderWidth: 1.5 },
    stukNr: { fontSize: 12, fontWeight: '700', color: t.muted },
    stukTekst: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, color: t.ink2 },
    stukAantal: { fontSize: 12, fontWeight: '700', color: t.muted, minWidth: 14, textAlign: 'right' },
    rondKlein: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    controle: { gap: spacing.sm },
    kop: { fontSize: 15, fontWeight: '700', color: t.ink },
    waarschuwing: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: t.statusWarnBg },
    regel: {
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      backgroundColor: t.card,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    regelTwijfel: { borderColor: t.statusWarnStripe, borderWidth: 1.5 },
    regelKop: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
    regelTik: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 },
    regelNaam: { fontSize: 15, fontWeight: '700', color: t.ink },
    regelSom: { fontSize: 14, color: t.ink2, marginTop: 2 },
    twijfelTekst: { fontSize: 13, lineHeight: 18, color: t.statusWarnFg, marginTop: 4 },
    regelVelden: { paddingTop: spacing.sm, paddingBottom: spacing.sm },
    klopt: {
      alignSelf: 'flex-start',
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: ds.green,
    },
    kloptTekst: { fontSize: 14, fontWeight: '700', color: ds.greenInk },
    klein: { fontSize: 12.5, lineHeight: 17, color: t.muted },
    voet: { gap: 8 },
    luister: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stip: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#DC2626' },
    luisterTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    melding: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
    meldingTekst: { fontSize: 13, lineHeight: 18, color: t.muted },
    bewerkRij: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    link: { fontSize: 13, fontWeight: '700', color: t.green700 },
    invoer: {
      minHeight: 88,
      maxHeight: 160,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 10,
      fontSize: 16,
      lineHeight: 22,
      color: t.ink,
      backgroundColor: t.bg,
      textAlignVertical: 'top',
    },
    invoerKlein: { minHeight: 64, maxHeight: 110 },
    knoppen: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    mic: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: ds.green,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micAan: { backgroundColor: '#DC2626' },
    groot: {
      flex: 1,
      minHeight: 56,
      borderRadius: radius.lg,
      backgroundColor: ds.green,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: spacing.md,
    },
    uit: { opacity: 0.45 },
    grootTekst: { fontSize: 16, fontWeight: '700', color: ds.greenInk },
  });
