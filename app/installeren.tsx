import { useMemo, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Monitor, Smartphone, TabletSmartphone } from 'lucide-react-native';
import { BBMark, Button } from '@/components';
import { useInstallatie } from '@/lib/pwa';
import { useTheme } from '@/providers';
import { fonts, radius, spacing, typography, type ThemeColors } from '@/theme';

/**
 * /installeren — openbare uitleg om BossBase als app te installeren.
 *
 * Bereikbaar zonder in te loggen, en bevat daarom niets van een account of
 * bedrijf. Draait de app al geïnstalleerd, dan tonen we geen browserstappen.
 */
export default function InstallerenScreen() {
  // In de iOS- en Android-app is er niets te installeren: een (universele) link
  // naar /installeren gaat gewoon naar het begin van de app.
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return <InstallerenWeb />;
}

function InstallerenWeb() {
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

  const blok: Record<BlokSoort, ReactNode> = {
    ios: (
      <Blok styles={styles} icoon={<Smartphone size={20} color={t.green700} />} titel="iPhone en iPad">
        <Stap styles={styles} n={1}>Open deze pagina in Safari.</Stap>
        <Stap styles={styles} n={2}>
          Tik op <Text style={styles.vet}>Delen</Text> (het vierkantje met de pijl omhoog). Op een
          iPad staat die rechtsboven, naast het adres.
        </Stap>
        <Stap styles={styles} n={3}>
          Kies <Text style={styles.vet}>Zet op beginscherm</Text>. Staat het er niet bij, scrol dan
          in het menu omlaag.
        </Stap>
        <Stap styles={styles} n={4}>
          Tik op <Text style={styles.vet}>Voeg toe</Text>.
        </Stap>
      </Blok>
    ),
    android: (
      <Blok styles={styles} icoon={<TabletSmartphone size={20} color={t.green700} />} titel="Android">
        <Stap styles={styles} n={1}>Open deze pagina in Chrome.</Stap>
        <Stap styles={styles} n={2}>
          Open het menu (⋮) en kies <Text style={styles.vet}>App installeren</Text> of{' '}
          <Text style={styles.vet}>Toevoegen aan startscherm</Text>. Staat hierboven een knop{' '}
          <Text style={styles.vet}>Installeer BossBase</Text>, dan kan het ook daarmee.
        </Stap>
        <Stap styles={styles} n={3}>Bevestig met Installeren.</Stap>
      </Blok>
    ),
    computer: (
      <Blok styles={styles} icoon={<Monitor size={20} color={t.green700} />} titel="Computer">
        <Stap styles={styles} n={1}>
          <Text style={styles.vet}>Chrome of Edge:</Text> klik op het installatie-icoon rechts in de
          adresbalk, of kies in het menu <Text style={styles.vet}>BossBase installeren</Text>.
        </Stap>
        <Stap styles={styles} n={2}>
          <Text style={styles.vet}>Safari op een Mac:</Text> kies in de menubalk{' '}
          <Text style={styles.vet}>Archief → Voeg toe aan Dock</Text>.
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
          accessibilityLabel="Appicoon van BossBase"
        />
      ) : null}

      <Text style={styles.titel}>BossBase installeren</Text>

      {soort === 'geinstalleerd' ? (
        <>
          <Text style={styles.intro}>BossBase is op dit apparaat al geïnstalleerd.</Text>
          <Button label="Naar inloggen" onPress={naarInloggen} />
        </>
      ) : (
        <>
          <Text style={styles.intro}>
            Als app opent BossBase vanaf je beginscherm of Dock, in een eigen venster zonder
            browserbalken. Installeren is niet verplicht: BossBase werkt ook gewoon in je browser.
          </Text>

          {soort === 'prompt' ? (
            <Button label="Installeer BossBase" onPress={() => void installeer()} />
          ) : null}

          {ios && !safari ? (
            <View style={styles.let}>
              <Text style={styles.letTekst}>
                Je opent deze pagina niet in Safari. Installeren op{' '}
                {apparaat === 'ipad' ? 'een iPad' : 'een iPhone'} gaat het betrouwbaarst vanuit
                Safari: kopieer het adres <Text style={styles.vet}>app.bossbase.nl/installeren</Text>{' '}
                en open het in Safari.
              </Text>
            </View>
          ) : null}

          {blokken.filter((b) => b === eigen || alles).map((b) => (
            <View key={b}>{blok[b]}</View>
          ))}

          {!alles ? (
            <Pressable onPress={() => setAlles(true)} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.meer}>Instructies voor andere apparaten</Text>
            </Pressable>
          ) : null}

          <Button label="Naar inloggen" variant="secondary" onPress={naarInloggen} />
        </>
      )}
    </ScrollView>
  );
}

type Styles = ReturnType<typeof makeStyles>;
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
