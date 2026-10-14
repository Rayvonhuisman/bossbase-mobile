import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { ArrowRight, Briefcase, Route as RouteIcon, Wrench } from 'lucide-react-native';
import { useOnboarding, type RoleChoice } from '@/providers';
import { PrimaryButton, TopBar } from './_components';
import { onb } from './_tokens';

type RoleDef = {
  id: RoleChoice;
  title: string;
  desc: string;
  Icon: typeof Briefcase;
};

const ROLES: RoleDef[] = [
  {
    id: 'owner',
    title: 'Ondernemer',
    desc: 'Zicht op het geheel — klanten, opdrachten, team en omzet.',
    Icon: Briefcase,
  },
  {
    id: 'planner',
    title: 'Planner',
    desc: 'Plan opdrachten in, stuur je team aan en houd het werk lopen.',
    Icon: RouteIcon,
  },
  {
    id: 'field',
    title: 'Monteur',
    desc: 'Bekijk de planning, schrijf uren en werk bonnen bij op locatie.',
    Icon: Wrench,
  },
];

export default function RoleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, update } = useOnboarding();
  const [selected, setSelected] = useState<RoleChoice | null>(data.role ?? 'owner');

  const onContinue = () => {
    if (!selected) return;
    update({ role: selected });
    router.push('/(onboarding)/company');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <TopBar step={0} />

      <View style={styles.headerBlock}>
        <Text style={styles.title}>Hoe ga je BossBase{'\n'}gebruiken?</Text>
        <Text style={styles.sub}>We stemmen je werkruimte en startschermen hierop af.</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {ROLES.map((r) => {
          const on = selected === r.id;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              key={r.id}
              onPress={() => setSelected(r.id)}
              style={({ pressed }) => [
                styles.card,
                on && styles.cardOn,
                pressed && { opacity: 0.95 },
              ]}
            >
              <View style={[styles.cardIcon, on ? styles.cardIconOn : styles.cardIconOff]}>
                <r.Icon size={26} color={onb.ink} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle}>{r.title}</Text>
                <Text style={styles.cardDesc}>{r.desc}</Text>
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>
                {on ? (
                  <View style={styles.radioDot} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <PrimaryButton
          label="Doorgaan"
          onPress={onContinue}
          disabled={!selected}
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
  footer: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
});
