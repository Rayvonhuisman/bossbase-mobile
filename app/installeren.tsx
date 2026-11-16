import { useMemo, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Monitor, Smartphone, TabletSmartphone } from 'lucide-react-native';
import { BBMark, Button } from '@/components';
import { useInstallatie } from '@/lib/pwa';
import { useTheme } from '@/providers';
import { fonts, radius, spacing, typography, type ThemeColors } from '@/theme';
import { tx } from '@/i18n';

/**
 * /installeren — openbare uitleg om BossBase als app te installeren.
 *
 * Bereikbaar zonder in te loggen, en bevat daarom niets van een account of
 * bedrijf. Draait de app al geïnstalleerd, dan tonen we geen browserstappen.
 */
export default function InstallerenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { soort, apparaat, safari, installeer } = useInstallatie();
  const naarInloggen = () => router.replace('/(auth)/login');
  const ios = apparaat === 'iphone' || apparaat === 'ipad';
  // Eerst (en standaard alleen) de uitleg voor dit apparaat: op een iPad geen
  // Android-stappen. De rest staat achter "andere apparaten".
  const eigen: BlokSoort = ios ? 'ios' : apparaat === 'android' ? 'android' : 'computer';
  const [alles, setAlles] = useState(false);

  // Zinnen met een vetgedrukt woord erin: de hele zin in één tx() met
  // {plaatshouders}, de vette woorden apart vertaald.
  const vet = (tekst: string, woorden: Record<string, string>) => metVet(tekst, woorden, styles.vet);
  const blok: Record<BlokSoort, ReactNode> = {
    ios: (
      <Blok styles={styles} icoon={<Smartphone size={20} color={t.green700} />} titel={tx('iPhone en iPad')}>
        <Stap styles={styles} n={1}>{tx('Open deze pagina in Safari.')}</Stap>
        <Stap styles={styles} n={2}>
          {vet(tx('Tik op {delen} (het vierkantje met de pijl omhoog). Op een iPad staat die rechtsboven, naast het adres.'), {
            delen: tx('Delen'),
          })}
        </Stap>
        <Stap styles={styles} n={3}>
          {vet(tx('Kies {beginscherm}. Staat het er niet bij, scrol dan in het menu omlaag.'), {
            beginscherm: tx('Zet op beginscherm'),
          })}
        </Stap>
        <Stap styles={styles} n={4}>
          {vet(tx('Tik op {toevoegen}.'), { toevoegen: tx('Voeg toe') })}
        </Stap>
      </Blok>
    ),
    android: (
      <Blok styles={styles} icoon={<TabletSmartphone size={20} color={t.green700} />} titel="Android">
        <Stap styles={styles} n={1}>{tx('Open deze pagina in Chrome.')}</Stap>
        <Stap styles={styles} n={2}>
          {vet(
            tx('Open het menu (⋮) en kies {installeren} of {startscherm}. Staat hierboven een knop {knop}, dan kan het ook daarmee.'),
            {
              installeren: tx('App installeren'),
              startscherm: tx('Toevoegen aan startscherm'),
              knop: tx('Installeer BossBase'),
            },
          )}
        </Stap>
        <Stap styles={styles} n={3}>{tx('Bevestig met Installeren.')}</Stap>
      </Blok>
    ),
    computer: (
      <Blok styles={styles} icoon={<Monitor size={20} color={t.green700} />} titel={tx('Computer')}>
        <Stap styles={styles} n={1}>
          {vet(
            tx('{browser} klik op het installatie-icoon rechts in de adresbalk, of kies in het menu {menu}.'),
            { browser: tx('Chrome of Edge:'), menu: tx('BossBase installeren') },
          )}
        </Stap>
        <Stap styles={styles} n={2}>
          {vet(tx('{browser} kies in de menubalk {menu}.'), {
            browser: tx('Safari op een Mac:'),
            menu: tx('Archief → Voeg toe aan Dock'),
          })}
        </Stap>
      </Blok>
    ),
  };
  const blokken: BlokSoort[] = [eigen, ...(['ios', 'android', 'computer'] as const).filter((b) => b !== eigen)];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.inhoud,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={styles.merk}>
        <BBMark size={28} />
        <Text style={styles.merkTekst}>
          <Text style={{ color: t.ink }}>Boss</Text>
          <Text style={{ color: t.green }}>Base</Text>
        </Text>
      </View>

      {Platform.OS === 'web' ? (
        <Image
          source={{ uri: '/icons/icon-192.png' }}
          style={styles.icoon}
          accessibilityLabel={tx('Appicoon van BossBase')}
        />
      ) : null}

      <Text style={styles.titel}>{tx('BossBase installeren')}</Text>

      {soort === 'geinstalleerd' ? (
        <>
          <Text style={styles.intro}>{tx('BossBase is op dit apparaat al geïnstalleerd.')}</Text>
          <Button label={tx('Naar inloggen')} onPress={naarInloggen} />
        </>
      ) : (
        <>
          <Text style={styles.intro}>
            {tx('Als app opent BossBase vanaf je beginscherm of Dock, in een eigen venster zonder browserbalken. Installeren is niet verplicht: BossBase werkt ook gewoon in je browser.')}
          </Text>

          {soort === 'prompt' ? (
            <Button label={tx('Installeer BossBase')} onPress={() => void installeer()} />
          ) : null}

          {ios && !safari ? (
            <View style={styles.let}>
              <Text style={styles.letTekst}>
                {metVet(
                  apparaat === 'ipad'
                    ? tx('Je opent deze pagina niet in Safari. Installeren op een iPad gaat het betrouwbaarst vanuit Safari: kopieer het adres {adres} en open het in Safari.')
                    : tx('Je opent deze pagina niet in Safari. Installeren op een iPhone gaat het betrouwbaarst vanuit Safari: kopieer het adres {adres} en open het in Safari.'),
                  { adres: 'app.bossbase.nl/installeren' },
                  styles.vet,
                )}
              </Text>
            </View>
          ) : null}

          {blokken.filter((b) => b === eigen || alles).map((b) => (
            <View key={b}>{blok[b]}</View>
          ))}

          {!alles ? (
            <Pressable onPress={() => setAlles(true)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.meer}>{tx('Instructies voor andere apparaten')}</Text>
            </Pressable>
          ) : null}

          <Button label={tx('Naar inloggen')} variant="secondary" onPress={naarInloggen} />
        </>
      )}
    </ScrollView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

/** Zet de {plaatshouders} in een vertaalde zin om in vetgedrukte woorden. */
function metVet(tekst: string, woorden: Record<string, string>, stijl: Styles['vet']): ReactNode[] {
  return tekst.split(/(\{\w+\})/).map((deel, i) => {
    const woord = /^\{\w+\}$/.test(deel) ? woorden[deel.slice(1, -1)] : undefined;
    return woord != null ? (
      <Text key={i} style={stijl}>
        {woord}
      </Text>
    ) : (
      deel
    );
  });
}
type BlokSoort = 'ios' | 'android' | 'computer';

function Blok({ styles, icoon, titel, children }: { styles: Styles; icoon: ReactNode; titel: string; children: ReactNode }) {
  return (
    <View style={styles.blok}>
      <View style={styles.blokKop}>
        {icoon}
        <Text style={styles.blokTitel}>{titel}</Text>
      </View>
      <View style={styles.stappen}>{children}</View>
    </View>
  );
}

function Stap({ styles, n, children }: { styles: Styles; n: number; children: ReactNode }) {
  return (
    <View style={styles.stap}>
      <Text style={styles.stapNummer}>{n}</Text>
      <Text style={styles.stapTekst}>{children}</Text>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    // Op een iPad of desktop een leesbare kolom in het midden.
    inhoud: {
      paddingHorizontal: spacing.xl,
      gap: spacing.lg,
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    let: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: t.statusWarnBg },
    letTekst: { ...typography.body, color: t.statusWarnFg },
    meer: { ...typography.small, color: t.muted, textDecorationLine: 'underline', textAlign: 'center' },
    merk: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    merkTekst: { fontSize: 22, fontWeight: '800', fontFamily: fonts.bold, letterSpacing: -0.4 },
    icoon: { width: 72, height: 72, borderRadius: 16, marginTop: spacing.sm },
    titel: { ...typography.title, color: t.ink },
    intro: { ...typography.body, color: t.ink2 },
    blok: {
      padding: spacing.lg,
      borderRadius: radius.xl,
      backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      gap: spacing.md,
    },
    blokKop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    blokTitel: { ...typography.rowTitle, color: t.ink },
    stappen: { gap: spacing.sm },
    stap: { flexDirection: 'row', gap: spacing.md },
    stapNummer: {
      width: 22,
      height: 22,
      borderRadius: 11,
      textAlign: 'center',
      lineHeight: 22,
      fontSize: 12,
      fontWeight: '700', fontFamily: fonts.bold,
      overflow: 'hidden',
      color: t.green700,
      backgroundColor: t.green50,
    },
    stapTekst: { ...typography.body, flex: 1, color: t.ink },
    vet: { fontWeight: '700', fontFamily: fonts.bold },
  });
