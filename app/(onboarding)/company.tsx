import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import {
  AppWindow,
  ArrowRight,
  Hammer,
  HardHat,
  Home,
  Paintbrush,
  Plug,
  ShowerHead,
  Sparkles,
  Trees,
  Zap,
} from 'lucide-react-native';
import { useOnboarding } from '@/providers';
import { BRANCHES, bedrijfFouten, heeftFouten, type BedrijfFouten } from '@/lib/registratie';
import { Field, PrimaryButton, TopBar } from './_components';
import { onb } from './_tokens';

/** Iconen zoals TRADES in het dashboard (BbAuth.jsx). */
const BRANCHE_ICOON: Record<(typeof BRANCHES)[number], typeof Hammer> = {
  Schilder: Paintbrush,
  Hovenier: Trees,
  Aannemer: Hammer,
  Kozijnen: AppWindow,
  Installateur: Plug,
  Dakdekker: Home,
  Loodgieter: ShowerHead,
  Elektricien: Zap,
  Schoonmaak: Sparkles,
  Anders: HardHat,
};

/**
 * Stap 2 — het bedrijf. Dezelfde velden als het dashboard: bedrijfsnaam en
 * telefoon verplicht, branche (vaste lijst, dezelfde als in Instellingen) en
 * KvK optioneel. verify-code zet ze na de verificatie op het nieuwe bedrijf.
 */
export default function CompanyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, update } = useOnboarding();

  const [companyName, setCompanyName] = useState(data.companyName);
  const [branche, setBranche] = useState(data.branche);
  const [phone, setPhone] = useState(data.phone);
  const [kvk, setKvk] = useState(data.kvk);
  const [fouten, setFouten] = useState<BedrijfFouten>({});

  const onContinue = () => {
    const f = bedrijfFouten({ companyName, phone, kvk, branche });
    setFouten(f);
    if (heeftFouten(f)) return;
    update({ companyName: companyName.trim(), branche, phone: phone.trim(), kvk: kvk.trim() });
    router.push('/(onboarding)/account');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <TopBar step={1} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Over je bedrijf</Text>
          <Text style={styles.sub}>We passen BossBase aan op jouw branche.</Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.form}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Field
            label="Bedrijfsnaam"
            value={companyName}
            onChangeText={(v) => {
              setCompanyName(v);
              if (fouten.companyName) setFouten((f) => ({ ...f, companyName: undefined }));
            }}
            placeholder="Veldhuis Schilderwerken"
            autoCapitalize="words"
            autoComplete="organization"
            error={fouten.companyName}
          />

          <View>
            <Text style={styles.groupLabel}>Branche</Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {BRANCHES.map((b) => {
                const on = branche === b;
                const Icon = BRANCHE_ICOON[b];
                return (
                  <Pressable
                    key={b}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    onPress={() => setBranche(b)}
                    style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.9 }]}
                  >
                    <Icon size={16} color={onb.ink} strokeWidth={2} />
                    <Text style={styles.chipText} numberOfLines={1}>
                      {b}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Field
            label="Telefoon"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              if (fouten.phone) setFouten((f) => ({ ...f, phone: undefined }));
            }}
            placeholder="06-12345678"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            error={fouten.phone}
          />
          <Field
            label="KvK-nummer"
            value={kvk}
            onChangeText={setKvk}
            placeholder="12345678"
            keyboardType="number-pad"
            hint="Optioneel"
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <PrimaryButton
            label="Doorgaan"
            onPress={onContinue}
            trailing={<ArrowRight size={16} color="#fff" strokeWidth={2} />}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: onb.bg },
  headerBlock: { paddingHorizontal: 24, paddingTop: 12 },
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
  form: {
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 18,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: onb.muted,
    marginBottom: 8,
    paddingLeft: 4,
    letterSpacing: -0.1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexBasis: '47%',
    flexGrow: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: onb.surface,
    borderWidth: 1.5,
    borderColor: onb.hair,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  chipOn: {
    borderColor: onb.ink,
    backgroundColor: onb.greenSoft,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    color: onb.ink,
    letterSpacing: -0.2,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
});
