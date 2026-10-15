import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { ArrowRight, Sparkles, User, Users } from 'lucide-react-native';
import { useOnboarding } from '@/providers';
import { PAKKETTEN, PROEF_DAGEN, type Pakket } from '@/lib/registratie';
import { PrimaryButton, TopBar } from './_components';
import { onb } from './_tokens';

const ICONEN: Record<Pakket, typeof User> = { groei: User, team: Users };

/**
 * Stap 1 — welk pakket je wilt proberen. Gelijk aan de pakketstap van het
 * dashboard (RegisterFlow): Groei of Team, zonder voorkeuze; kies je niets, dan
 * start de proef op Groei (verify-code). Starter staat er bewust niet tussen.
 *
 * Hier stond eerst een rolkeuze (ondernemer / planner / monteur). Die werd
 * nergens opgeslagen en het dashboard kent hem niet: wie zich aanmeldt, maakt
 * altijd een eigen bedrijf aan en wordt daar admin. Medewerkers melden zich
 * niet aan maar worden uitgenodigd (Team > Teamlid uitnodigen).
 */
export default function PakketScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, update } = useOnboarding();
  const [selected, setSelected] = useState<Pakket | null>(data.pakket);

  const onContinue = () => {
    update({ pakket: selected });
    router.push('/(onboarding)/company');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <TopBar step={0} />

      <View style={styles.headerBlock}>
        <Text style={styles.title}>Welk pakket past{'\n'}bij je?</Text>
        <Text style={styles.sub}>Kies waar je nu staat. {PROEF_DAGEN} dagen gratis proberen, zonder creditcard.</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {PAKKETTEN.map((p) => {
          const on = selected === p.id;
          const Icon = ICONEN[p.id];
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              key={p.id}
              onPress={() => setSelected(p.id)}
              style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && { opacity: 0.95 }]}
            >
              <View style={[styles.cardIcon, on ? styles.cardIconOn : styles.cardIconOff]}>
                <Icon size={26} color={onb.ink} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle}>{p.titel}</Text>
                <Text style={styles.cardDesc}>{p.omschrijving}</Text>
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
            </Pressable>
          );
        })}

        <View style={styles.trialNote}>
          <View style={styles.trialTitleRow}>
            <Sparkles size={15} color={onb.greenDk} strokeWidth={2} />
            <Text style={styles.trialTitle}>{PROEF_DAGEN} dagen gratis proberen</Text>
          </View>
          <Text style={styles.trialText}>
            Je probeert je keuze {PROEF_DAGEN} dagen gratis, zonder creditcard. Daarna stopt het vanzelf, tenzij je een
            abonnement afsluit.
          </Text>
        </View>

        <Text style={styles.inviteHint}>
          Uitgenodigd door je werkgever? Dan maak je hier geen account aan, maar volg je de link in de uitnodigingsmail.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <PrimaryButton
          label="Doorgaan"
          onPress={onContinue}
          trailing={<ArrowRight size={16} color="#fff" strokeWidth={2} />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: onb.bg },
  headerBlock: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: onb.ink,
    letterSpacing: -1,
    lineHeight: 33,
  },
  sub: {
    marginTop: 10,
    fontSize: 15,
    color: onb.muted,
    letterSpacing: -0.1,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: onb.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: onb.hair,
  },
  cardOn: {
    borderColor: onb.ink,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconOff: { backgroundColor: onb.field },
  cardIconOn: { backgroundColor: onb.green },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: onb.ink,
    letterSpacing: -0.3,
  },
  cardDesc: {
    fontSize: 13.5,
    color: onb.muted,
    marginTop: 3,
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(10,10,10,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: onb.ink,
    backgroundColor: onb.ink,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: onb.green,
  },
  trialNote: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: onb.greenSoft,
    gap: 6,
  },
  trialTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trialTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: onb.ink,
    letterSpacing: -0.2,
  },
  trialText: {
    fontSize: 13.5,
    color: onb.muted,
    lineHeight: 19,
  },
  inviteHint: {
    fontSize: 13,
    color: onb.muted,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
});
