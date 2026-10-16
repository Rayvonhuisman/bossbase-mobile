import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { ArrowRight, Calendar as CalendarIcon, ClipboardList, Clock, MailCheck, Users } from 'lucide-react-native';
import { useAuth, useOnboarding } from '@/providers';
import { PAKKETTEN, PROEF_DAGEN } from '@/lib/registratie';
import { stuurBevestigingsmailOpnieuw } from '@/services/registratieService';
import { GhostLink, GreenButton, TopBar } from './_components';
import { onb } from './_tokens';

type PreviewCard = {
  title: string;
  sub: string;
  Icon: typeof CalendarIcon;
  tint: string;
  accent: string;
};

const CARDS: PreviewCard[] = [
  { title: 'Klanten', sub: '0 contacten', Icon: Users, tint: '#FFF3E0', accent: '#E68A00' },
  { title: 'Agenda', sub: 'Deze week', Icon: CalendarIcon, tint: onb.greenSoft, accent: onb.greenDk },
  { title: 'Werkbonnen', sub: 'Klaar om te starten', Icon: ClipboardList, tint: '#EEF2FF', accent: '#3955D7' },
  { title: 'Uren', sub: 'Schrijf op locatie', Icon: Clock, tint: '#F4ECFF', accent: '#7847C6' },
];

/**
 * Stap 5 — klaar. Twee standen:
 *
 * - Normaal (na de code): verify-code heeft het bedrijf aangemaakt en de proef
 *   op het gekozen pakket gestart; de gebruiker is ingelogd en gaat zo de app in.
 * - `modus=bevestigen`: signUp gaf geen sessie terug omdat Supabase "Confirm
 *   email" aan staat. Dan eerst de link in de mail, daarna inloggen. In onze
 *   config staat die instelling uit; dit is dezelfde terugval als het dashboard.
 */
export default function SuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { markSeen, data } = useOnboarding();
  const { user, company, status, refreshProfile } = useAuth();
  const { modus } = useLocalSearchParams<{ modus?: string }>();
  const bevestigen = modus === 'bevestigen';
  const [opnieuwBezig, setOpnieuwBezig] = useState(false);
  const [opnieuwVerstuurd, setOpnieuwVerstuurd] = useState(false);

  // verify-code zet de proef op Team als de metadata dat zegt, anders Groei.
  const pakketId = user?.user_metadata?.gekozen_pakket === 'team' ? 'team' : 'groei';
  const pakketNaam = PAKKETTEN.find((p) => p.id === pakketId)?.titel.split(',')[0] ?? 'Groei';

  const onOpenApp = async () => {
    await markSeen();
    // Lukte het stille herladen na de code niet, probeer het nu nog eens;
    // anders stuurt de tabs-layout terug naar het codescherm.
    if (status !== 'ready') await refreshProfile();
    router.replace('/(tabs)/today');
  };

  const onNaarInloggen = async () => {
    await markSeen();
    router.replace('/(auth)/login');
  };

  const onOpnieuw = async () => {
    setOpnieuwBezig(true);
    try {
      await stuurBevestigingsmailOpnieuw(data.email);
      setOpnieuwVerstuurd(true);
    } catch {
      // stil, zoals het dashboard
    } finally {
      setOpnieuwBezig(false);
    }
  };

  const firstName =
    data.fullName?.trim().split(/\s+/)[0] || user?.user_metadata?.full_name?.trim().split(/\s+/)[0] || '';

  if (bevestigen) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <TopBar step={4} showBack={false} />
        <View style={styles.content}>
          <View style={[styles.checkCircle, styles.mailCircle]}>
            <MailCheck size={40} color={onb.ink} strokeWidth={2} />
          </View>
          <Text style={styles.title}>Bevestig je e-mailadres</Text>
          <Text style={styles.sub}>
            We hebben een verificatiemail gestuurd naar <Text style={styles.strong}>{data.email}</Text>. Klik op de link
            in de mail om je account te activeren.
          </Text>
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>Geen mail ontvangen? Check ook je spammap. De mail kan soms even duren.</Text>
          </View>
        </View>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <GreenButton label="Naar inloggen" onPress={onNaarInloggen} />
          <GhostLink
            label={
              opnieuwBezig ? 'Versturen…' : opnieuwVerstuurd ? 'Opnieuw verstuurd' : 'Verificatiemail opnieuw sturen'
            }
            onPress={opnieuwBezig ? () => {} : onOpnieuw}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <TopBar step={4} showBack={false} />

      <View style={styles.content}>
        {/* Big check */}
        <View style={styles.checkCircle}>
          <Svg width={44} height={44} viewBox="0 0 44 44">
            <Path
              d="M10 23l8 8 16-18"
              stroke={onb.ink}
              strokeWidth={4.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>

        <Text style={styles.title}>
          {firstName ? `Welkom, ${firstName}` : 'Je werkruimte'}
          {'\n'}staat klaar
        </Text>
        <Text style={styles.sub}>
          Je e-mailadres is bevestigd{company?.name ? ` en ${company.name} is aangemaakt` : ''}. Je probeert{' '}
          {pakketNaam} {PROEF_DAGEN} dagen gratis, zonder creditcard.
        </Text>

        {/* 2×2 preview grid */}
        <View style={styles.grid}>
          {CARDS.map((c) => (
            <View key={c.title} style={styles.cell}>
              <View style={[styles.cellIcon, { backgroundColor: c.tint }]}>
                <c.Icon size={20} color={c.accent} strokeWidth={1.8} />
              </View>
              <Text style={styles.cellTitle}>{c.title}</Text>
              <Text style={styles.cellSub}>{c.sub}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <GreenButton
          label="Open BossBase"
          onPress={onOpenApp}
          trailing={<ArrowRight size={16} color={onb.ink} strokeWidth={2} />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: onb.bg },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    alignItems: 'center',
  },
  checkCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: onb.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    shadowColor: onb.green,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  title: {
    marginTop: 28,
    fontSize: 28,
    fontWeight: '700',
    color: onb.ink,
    letterSpacing: -0.9,
    lineHeight: 31,
    textAlign: 'center',
  },
  sub: {
    marginTop: 10,
    fontSize: 15,
    color: onb.muted,
    letterSpacing: -0.1,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 21,
  },
  strong: {
    color: onb.ink,
    fontWeight: '600',
  },
  mailCircle: {
    backgroundColor: onb.greenSoft,
    shadowOpacity: 0,
    elevation: 0,
  },
  noteBox: {
    marginTop: 22,
    alignSelf: 'stretch',
    backgroundColor: onb.greenSoft,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  noteText: {
    fontSize: 13.5,
    color: onb.ink,
    lineHeight: 19,
    textAlign: 'center',
  },
  grid: {
    marginTop: 26,
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cell: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: onb.surface,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: onb.hair,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cellIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cellTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: onb.ink,
    letterSpacing: -0.3,
  },
  cellSub: {
    fontSize: 12.5,
    color: onb.muted,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
});
