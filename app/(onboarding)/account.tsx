import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useAuth, useOnboarding } from '@/providers';
import { Field, GreenButton, TopBar } from './_components';
import { onb } from './_tokens';

export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, update } = useOnboarding();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState(data.fullName);
  const [email, setEmail] = useState(data.email);
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});

  const onSubmit = async () => {
    setErrorMsg(null);
    setFieldErrors({});

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    const errors: typeof fieldErrors = {};
    if (!trimmedName) errors.name = 'Vul je volledige naam in.';
    if (!trimmedEmail) errors.email = 'Vul je e-mailadres in.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
      errors.email = 'Geen geldig e-mailadres.';
    if (!password) errors.password = 'Kies een wachtwoord.';
    else if (password.length < 8)
      errors.password = 'Minimaal 8 tekens.';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (!agree) {
      setErrorMsg('Accepteer de voorwaarden om door te gaan.');
      return;
    }

    setSubmitting(true);
    const { error } = await signUp(trimmedEmail, password, trimmedName);
    setSubmitting(false);

    if (error) {
      setErrorMsg(error);
      return;
    }

    update({ fullName: trimmedName, email: trimmedEmail });
    router.push('/(onboarding)/success');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <TopBar step={2} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Maak je account aan</Text>
          <Text style={styles.sub}>Hiermee log je in op al je apparaten.</Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.form}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Field
            label="Volledige naam"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Mark van der Berg"
            autoCapitalize="words"
            autoComplete="name"
            error={fieldErrors.name}
            editable={!submitting}
          />
          <Field
            label="E-mailadres"
            value={email}
            onChangeText={setEmail}
            placeholder="jij@bedrijf.nl"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            error={fieldErrors.email}
            editable={!submitting}
          />
          <Field
            label="Wachtwoord"
            value={password}
            onChangeText={setPassword}
            placeholder="Minimaal 8 tekens"
            isPassword
            autoComplete="password-new"
            error={fieldErrors.password}
            editable={!submitting}
          />

          {/* Terms checkbox */}
          <Pressable
            onPress={() => setAgree((v) => !v)}
            style={styles.termsRow}
            hitSlop={4}
          >
            <View style={[styles.checkBox, agree && styles.checkBoxOn]}>
              {agree ? <Check size={12} color={onb.green} strokeWidth={3} /> : null}
            </View>
            <Text style={styles.termsText}>
              Ik ga akkoord met de <Text style={styles.termsLink}>Algemene voorwaarden</Text>{' '}
              en het <Text style={styles.termsLink}>Privacybeleid</Text>.
            </Text>
          </Pressable>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <GreenButton label="Account aanmaken" onPress={onSubmit} loading={submitting} />
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(10,10,10,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    backgroundColor: '#fff',
  },
  checkBoxOn: {
    backgroundColor: onb.ink,
    borderColor: onb.ink,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: onb.muted,
    lineHeight: 19,
  },
  termsLink: {
    color: onb.ink,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#FDECEC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#F4D6D2',
    marginTop: 4,
  },
  errorText: {
    color: '#C81E1E',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
});
