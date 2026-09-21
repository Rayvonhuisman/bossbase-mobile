import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useOnboarding } from '@/providers';
import { Field, PrimaryButton, TopBar } from './_components';
import { onb } from './_tokens';

export default function CompanyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, update } = useOnboarding();

  const [companyName, setCompanyName] = useState(data.companyName);
  const [branche, setBranche] = useState(data.branche);
  const [teamSize, setTeamSize] = useState(data.teamSize);
  const [isSolo, setIsSolo] = useState(data.isSolo);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onContinue = () => {
    const trimmed = companyName.trim();
    if (!trimmed) {
      setErrorMsg('Vul je bedrijfsnaam in.');
      return;
    }
    update({
      companyName: trimmed,
      branche: branche.trim(),
      teamSize: teamSize.trim(),
      isSolo,
    });
    router.push('/(onboarding)/account');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <TopBar step={1} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Over je bedrijf</Text>
          <Text style={styles.sub}>Een paar gegevens om je werkruimte op te zetten.</Text>
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
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder="Van der Berg Installaties"
            autoCapitalize="words"
            error={errorMsg ?? undefined}
          />
          <Field
            label="Branche"
            value={branche}
            onChangeText={setBranche}
            placeholder="Loodgieter & installatie"
          />
          <Field
            label="Teamgrootte"
            value={teamSize}
            onChangeText={setTeamSize}
            placeholder="2 – 5 personen"
            keyboardType="default"
          />

          {/* Solo toggle */}
          <View style={styles.toggleCard}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.toggleTitle}>Ik werk alleen</Text>
              <Text style={styles.toggleSub}>Sla teaminstellingen nu over</Text>
            </View>
            <Switch
              value={isSolo}
              onValueChange={setIsSolo}
              trackColor={{ false: 'rgba(10,10,10,0.15)', true: onb.green }}
              thumbColor="#fff"
              ios_backgroundColor="rgba(10,10,10,0.15)"
            />
          </View>
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
  toggleCard: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: onb.surface,
    borderWidth: 1,
    borderColor: onb.hair,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: onb.ink,
    letterSpacing: -0.2,
  },
  toggleSub: {
    fontSize: 13,
    color: onb.muted,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
});
