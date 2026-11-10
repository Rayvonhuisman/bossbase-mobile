import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Mic, Send, Square } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/providers';
import { vraagBoss, type BossBericht } from '@/services/bossService';
import { useSpraak } from '@/lib/spraak';
import { zetBossMeting, type BossKaart } from '@/lib/boss/vastleggen';
import { BossKaartje } from './boss/BossKaart';
import { fonts, radius, spacing, type ThemeColors } from '@/theme';
import { Paneel } from './Paneel';

const BOSS_HOOFD = require('../../assets/boss-hoofd.png');

// Boss zegt meteen dat hij een AI-assistent is: in de begroeting en in de kop
// (AI-verordening art. 50, audit 2026-10-25, J-14). Gelijk aan het dashboard.
const BEGROETING = 'Hoi! Ik ben Boss, de AI-assistent van BossBase. Waar kan ik je mee helpen?';

/**
 * Boss-avatar: zijn hoofd, net als de gids in de rondleiding van het dashboard
 * (`boss-gids.png`, `.rl-boss`): lichtgroen rondje met groene rand, het plaatje
 * (doorzichtige achtergrond) vult het rondje vanaf de bovenkant.
 */
export function BossAvatar({ size = 36 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#d1fae5',
        borderWidth: size >= 48 ? 2 : 1.5,
        borderColor: '#1DDB62',
        overflow: 'hidden',
      }}
    >
      <Image source={BOSS_HOOFD} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
    </View>
  );
}

/**
 * Dezelfde mini-opmaak als het dashboard (`BossChat.jsx`): `**vet**` en regels
 * die met `-` of `*` beginnen als opsomming. Geen HTML: alleen Text-onderdelen.
 */
function Opgemaakt({ tekst, stijl, vet }: { tekst: string; stijl: object; vet: object }) {
  const regels = tekst.split('\n').map((r) => r.replace(/^\s*[-*]\s+/, '· '));
  return (
    <Text style={stijl}>
      {regels.map((regel, i) => (
        <Text key={i}>
          {regel.split(/(\*\*[^*]+\*\*)/g).map((deel, j) =>
            deel.startsWith('**') && deel.endsWith('**') ? (
              <Text key={j} style={vet}>
                {deel.slice(2, -2)}
              </Text>
            ) : (
              <Text key={j}>{deel.replace(/`([^`]+)`/g, '$1')}</Text>
            ),
          )}
          {i < regels.length - 1 ? '\n' : ''}
        </Text>
      ))}
    </Text>
  );
}

/**
 * Boss — de helpagent van BossBase, dezelfde als in het dashboard (Edge
 * Function `boss-chat`). Het gesprek blijft bewaard zolang de app open is,
 * net als in het dashboard (tot uitloggen of herladen).
 */
export function BossChat({
  open,
  onSluit,
  onMelden,
  context,
}: {
  open: boolean;
  onSluit: () => void;
  /** Klant- of projectscherm waar de gebruiker staat ("deze klant" voor Boss). */
  context?: { klant_id?: string; project_id?: string } | null;
  /** Naar "Bug of idee" — voor wie liever iets meldt dan vraagt. */
  onMelden?: () => void;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [berichten, setBerichten] = useState<BossBericht[]>([]);
  const [gesprekId, setGesprekId] = useState<string | null>(null);
  const [invoer, setInvoer] = useState('');
  const [bezig, setBezig] = useState(false);
  const [doorzetten, setDoorzetten] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const lijst = useRef<ScrollView>(null);
  const afbreken = useRef<AbortController | null>(null);
  const router = useRouter();
  // Inspreken (webapp: spraakherkenning van de browser). De tekst komt eerst in
  // het invoerveld; versturen doe je zelf. In de iOS/Android-app: het dicteren
  // van het toetsenbord.
  const spraak = useSpraak({ setTekst: setInvoer });
  const luistert = spraak.stand !== 'uit';
  useEffect(() => {
    if (!open && luistert) spraak.stop();
  }, [open, luistert, spraak]);

  const wijzigKaart = (i: number, k: BossKaart) =>
    setBerichten((lijst) =>
      lijst.map((b, j) => (j === i && b.kaarten ? { ...b, kaarten: b.kaarten.map((x) => (x.id === k.id ? k : x)) } : b)),
    );
  // Metingen: naar het project, met de tekst in Vertel het Boss.
  const naarMetingen = (projectId: string, tekst: string) => {
    zetBossMeting(projectId, tekst);
    onSluit();
    router.push(`/project/${projectId}`);
  };

  useEffect(() => () => afbreken.current?.abort(), []);
  useEffect(() => {
    const id = setTimeout(() => lijst.current?.scrollToEnd({ animated: true }), 30);
    return () => clearTimeout(id);
  }, [berichten, bezig]);

  const sluit = () => {
    if (bezig) return;
    onSluit();
  };

  const stuur = async () => {
    const tekst = invoer.trim();
    if (!tekst || bezig) return;
    if (luistert) spraak.stop();
    setFout(null);
    setInvoer('');
    const geschiedenis: BossBericht[] = [...berichten, { rol: 'gebruiker', tekst }];
    setBerichten([...geschiedenis, { rol: 'boss', tekst: '' }]);
    setBezig(true);
    setDoorzetten(false);
    const ctrl = new AbortController();
    afbreken.current = ctrl;
    const uitkomst = await vraagBoss({
      berichten: geschiedenis,
      gesprekId,
      signal: ctrl.signal,
      context,
      onActies: (kaarten, vast) =>
        setBerichten((huidig) => {
          const kopie = [...huidig];
          const laatste = kopie[kopie.length - 1];
          if (laatste?.rol === 'boss') kopie[kopie.length - 1] = { ...laatste, tekst: vast || laatste.tekst, kaarten };
          return kopie;
        }),
      onTekst: (stukje) =>
        setBerichten((huidig) => {
          const kopie = [...huidig];
          const laatste = kopie[kopie.length - 1];
          if (laatste?.rol === 'boss') kopie[kopie.length - 1] = { ...laatste, tekst: laatste.tekst + stukje };
          return kopie;
        }),
      onBezig: () => setDoorzetten(true),
    });
    setBezig(false);
    setDoorzetten(false);
    if (uitkomst.ok) {
      setGesprekId(uitkomst.gesprekId);
    } else {
      setFout(uitkomst.melding);
      // Lege Boss-bubbel weghalen; de vraag blijft staan.
      setBerichten((huidig) => (huidig[huidig.length - 1]?.tekst === '' ? huidig.slice(0, -1) : huidig));
    }
  };

  return (
    <Paneel
      open={open}
      titel="Boss"
      subtitel="AI-assistent · beta · helpt je met BossBase"
      kop={<BossAvatar />}
      onSluit={sluit}
      voet={
        <View style={{ gap: spacing.sm }}>
          <View style={styles.invoerRij}>
            <TextInput
              value={invoer}
              onChangeText={setInvoer}
              placeholder={luistert ? 'Boss luistert…' : 'Vraag iets, of zeg wat Boss moet noteren…'}
              placeholderTextColor={t.muted2}
              multiline
              editable={!bezig}
              style={styles.invoer}
              accessibilityLabel="Bericht aan Boss"
              // Web en extern toetsenbord: Enter verstuurt, Shift+Enter is een
              // nieuwe regel — zoals in het dashboard.
              onKeyPress={(e) => {
                const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                  (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                  void stuur();
                }
              }}
            />
            {spraak.ondersteund ? (
              <Pressable
                onPress={() => (luistert ? spraak.stop() : spraak.start())}
                disabled={bezig}
                accessibilityRole="button"
                accessibilityLabel={luistert ? 'Stoppen met inspreken' : 'Inspreken'}
                accessibilityState={{ selected: luistert }}
                testID="boss-chat-mic"
                style={({ pressed }) => [styles.mic, luistert && styles.micAan, pressed && { opacity: 0.8 }]}
              >
                {luistert ? <Square size={16} color="#0D0D0D" /> : <Mic size={18} color={t.ink} />}
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => void stuur()}
              disabled={bezig || !invoer.trim()}
              accessibilityRole="button"
              accessibilityLabel="Stuur"
              style={({ pressed }) => [
                styles.stuur,
                (bezig || !invoer.trim()) && { opacity: 0.45 },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Send size={18} color="#0D0D0D" strokeWidth={2.4} />
            </Pressable>
          </View>
          {luistert && spraak.tussen ? <Text style={styles.status}>{spraak.tussen}</Text> : null}
          {spraak.fout ? (
            <Pressable onPress={spraak.wisFout} accessibilityRole="alert">
              <Text style={[styles.status, { color: t.statusRejectFg }]}>{spraak.fout}</Text>
            </Pressable>
          ) : null}
          {onMelden ? (
            <Pressable onPress={onMelden} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.melden}>Bug gevonden of een idee? Meld het hier</Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <ScrollView ref={lijst} contentContainerStyle={styles.lijst} keyboardShouldPersistTaps="handled">
        <View style={[styles.bubbel, styles.boss]}>
          <Text style={styles.bossTekst}>{BEGROETING}</Text>
        </View>
        {berichten.map((b, i) =>
          b.rol === 'gebruiker' ? (
            <View key={i} style={[styles.bubbel, styles.jij]}>
              <Text style={styles.jijTekst}>{b.tekst}</Text>
            </View>
          ) : b.tekst || b.kaarten?.length ? (
            <View key={i} style={{ gap: spacing.sm }}>
              {b.tekst ? (
                <View style={[styles.bubbel, styles.boss]}>
                  <Opgemaakt tekst={b.tekst} stijl={styles.bossTekst} vet={styles.vet} />
                </View>
              ) : null}
              {b.kaarten?.map((k) => (
                <BossKaartje key={k.id} kaart={k} onWijzig={(nieuw) => wijzigKaart(i, nieuw)} onMetingen={naarMetingen} />
              ))}
            </View>
          ) : null,
        )}
        {bezig ? (
          <Text style={styles.status}>{doorzetten ? 'Boss zet je vraag door…' : 'Boss denkt na…'}</Text>
        ) : null}
        {fout ? (
          <View style={styles.fout} accessibilityRole="alert">
            <Text style={styles.foutTekst}>{fout}</Text>
          </View>
        ) : null}
      </ScrollView>
    </Paneel>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    lijst: { padding: spacing.lg, gap: spacing.sm },
    bubbel: { maxWidth: '86%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18 },
    boss: { alignSelf: 'flex-start', backgroundColor: t.card, borderTopLeftRadius: 6 },
    jij: { alignSelf: 'flex-end', backgroundColor: '#1DDB62', borderTopRightRadius: 6 },
    bossTekst: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: t.ink },
    jijTekst: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: '#0D0D0D' },
    vet: { fontWeight: '700', fontFamily: fonts.bold },
    status: { fontSize: 13, fontFamily: fonts.regular, color: t.muted, paddingHorizontal: 4 },
    fout: { padding: spacing.md, borderRadius: radius.md, backgroundColor: t.statusRejectBg },
    foutTekst: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.semibold, color: t.statusRejectFg },
    invoerRij: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
    invoer: {
      flex: 1,
      minHeight: 44,
      maxHeight: 140,
      paddingHorizontal: 14,
      paddingTop: 11,
      paddingBottom: 11,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      backgroundColor: t.bg,
      color: t.ink,
      fontSize: 15,
      fontFamily: fonts.regular,
    },
    stuur: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#1DDB62',
      alignItems: 'center',
      justifyContent: 'center',
    },
    mic: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: t.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micAan: { backgroundColor: '#1DDB62' },
    melden: { fontSize: 12.5, fontFamily: fonts.regular, color: t.muted, textAlign: 'center', textDecorationLine: 'underline' },
  });
