import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar as CalendarIcon } from 'lucide-react-native';
import { BBMark } from '@/components';
import { useOnboarding } from '@/providers';
import { GhostLink, GreenButton } from './_components';
import { onb } from './_tokens';
import { toonAankoopInfo } from '@/lib/aankoopInfo';

/**
 * Screen 1/6 — Welcome.
 *
 * Hero met logo + gestapelde sample-cards (planning · werkbon · uren timer),
 * grote hero-tekst, CTA naar de pakketkeuze, ghost link naar bestaande login.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reset } = useOnboarding();

  const onStart = () => {
    reset();
    // iOS (App Store 3.1.1): geen keuze tussen betaalde pakketten in de app.
    // Zonder keuze start de proef op het standaardpakket (verify-code), net als
    // in het dashboard wanneer je niets kiest.
    router.push(toonAankoopInfo() ? '/(onboarding)/pakket' : '/(onboarding)/company');
  };
  const onAlreadyHaveAccount = () => {
    router.replace('/(auth)/login');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={styles.hero}>
        {/* Wordmark */}
        <View style={styles.wordmark}>
          <BBMark size={28} />
          <Text style={styles.wordmarkText}>
            <Text style={{ color: onb.ink }}>Boss</Text>
            <Text style={{ color: onb.green }}>Base</Text>
          </Text>
        </View>

        {/* Stacked sample cards */}
        <View style={styles.cardStack}>
          {/* Back card — Planning (rotated) */}
          <View style={[styles.cardPlanning]}>
            <View style={styles.cardPlanningIcon}>
              <CalendarIcon size={22} color={onb.greenDk} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardPlanningMeta}>Morgen · 09:00</Text>
              <Text style={styles.cardPlanningTitle} numberOfLines={1}>
                CV-ketel plaatsen · Jansen
              </Text>
            </View>
          </View>

          {/* Middle card — Work order */}
          <View style={styles.cardWO}>
            <View style={styles.cardWOTopRow}>
              <Text style={styles.cardWOMeta}>WERKBON · #4821</Text>
              <View style={styles.cardWOStatus}>
                <Text style={styles.cardWOStatusText}>BEZIG</Text>
              </View>
            </View>
            <Text style={styles.cardWOTitle}>Badkamer renovatie</Text>
            <Text style={styles.cardWOSub}>Hoofdstraat 24 · Utrecht</Text>
          </View>

          {/* Front card — Hours timer (rotated) */}
          <View style={styles.cardTimer}>
            <View style={styles.cardTimerRing}>
              <View style={styles.cardTimerDot} />
            </View>
            <View>
              <Text style={styles.cardTimerKicker}>TIMER LOOPT</Text>
              <Text style={styles.cardTimerValue}>02:14:38</Text>
            </View>
          </View>
        </View>

        {/* Hero title */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Run je bedrijf{'\n'}vanuit het veld</Text>
          <Text style={styles.subtitle}>
            Beheer klanten, planning, werkbonnen en uren in één mobiel CRM.
          </Text>
        </View>
      </View>

      {/* Footer CTAs */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <GreenButton label="Aan de slag" onPress={onStart} />
        <GhostLink label="Ik heb al een account" onPress={onAlreadyHaveAccount} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: onb.bg,
  },
  hero: {
    flex: 1,
    paddingTop: 32,
    alignItems: 'center',
    gap: 28,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wordmarkText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.6,
  },

  // Card stack hero
  cardStack: {
    width: 280,
    height: 230,
    marginTop: 8,
    position: 'relative',
  },
  cardPlanning: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 78,
    backgroundColor: onb.surface,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    transform: [{ rotate: '-3deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardPlanningIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: onb.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPlanningMeta: {
    fontSize: 13,
    color: onb.muted,
    fontWeight: '500',
  },
  cardPlanningTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: onb.ink,
    marginTop: 2,
  },

  cardWO: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    height: 86,
    backgroundColor: onb.surface,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardWOTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardWOMeta: {
    fontSize: 12,
    color: onb.muted,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  cardWOStatus: {
    backgroundColor: onb.green,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cardWOStatusText: {
    color: onb.ink,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cardWOTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: onb.ink,
    marginTop: 8,
  },
  cardWOSub: {
    fontSize: 13,
    color: onb.muted,
    marginTop: 4,
  },

  cardTimer: {
    position: 'absolute',
    bottom: 0,
    left: 22,
    right: 22,
    height: 76,
    backgroundColor: onb.ink,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    transform: [{ rotate: '2deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  cardTimerRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2.5,
    borderColor: onb.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTimerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: onb.green,
  },
  cardTimerKicker: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.3,
  },
  cardTimerValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginTop: 2,
  },

  // Title
  titleBlock: {
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 4,
  },
  title: {
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '700',
    color: onb.ink,
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 14,
    fontSize: 16,
    lineHeight: 22,
    color: onb.muted,
    textAlign: 'center',
    letterSpacing: -0.2,
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    gap: 4,
  },
});
