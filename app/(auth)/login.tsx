import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedScreen, Button } from '@/components';
import { useAuth, useOnboarding, useTheme } from '@/providers';
import { radius, spacing, typography, type ThemeColors } from '@/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { data } = useOnboarding();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [email, setEmail] = useState(data.email ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = async () => {
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMessage('Vul je e-mail en wachtwoord in.');
      return;
    }

    setLoading(true);
    const { error } = await signIn(trimmedEmail, password);
    setLoading(false);

    if (error) {
      setErrorMessage(error);
    }
    // Op success doet AuthProvider de redirect via state-change.
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <AnimatedScreen style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>BossBase</Text>
            <Text style={styles.subtitle}>Log in om verder te gaan</Text>
          </View>

          <View style={styles.form}>
            <View>
              <Text style={styles.label}>E-mail</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (errorMessage) setErrorMessage(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                placeholder="jij@bedrijf.nl"
                placeholderTextColor={t.muted2}
                editable={!loading}
                returnKeyType="next"
              />
            </View>

            <View>
              <Text style={styles.label}>Wachtwoord</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  if (errorMessage) setErrorMessage(null);
                }}
                secureTextEntry
                autoComplete="password"
                placeholder="••••••••"
                placeholderTextColor={t.muted2}
                editable={!loading}
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
            </View>

            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <Button label="Inloggen" onPress={onSubmit} loading={loading} />
          </View>
        </AnimatedScreen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    flex: { flex: 1 },
    container: {
      flex: 1,
      padding: spacing.xl,
      justifyContent: 'center',
    },
    header: {
      marginBottom: spacing.xxl,
    },
    title: {
      ...typography.title,
      color: t.ink,
      marginBottom: spacing.xs,
    },
    subtitle: {
      ...typography.body,
      color: t.muted,
    },
    form: {
      gap: spacing.lg,
    },
    label: {
      ...typography.label,
      color: t.ink2,
      marginBottom: spacing.xs,
    },
    input: {
      height: 50,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      fontSize: 16,
      color: t.ink,
      backgroundColor: t.card,
    },
    errorBox: {
      // Uit de thematokens, zodat de melding ook in donkere modus leesbaar is.
      backgroundColor: t.statusRejectBg,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: t.statusRejectBg,
    },
    errorText: {
      color: t.statusRejectFg,
      fontSize: 14,
      lineHeight: 20,
    },
  });
