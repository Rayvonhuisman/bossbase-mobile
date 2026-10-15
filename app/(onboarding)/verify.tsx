import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useAuth, useOnboarding } from '@/providers';
import { OPNIEUW_NA_SECONDEN, schoneCode, verificatieUitkomst } from '@/lib/registratie';
import { verifieerCode, vraagVerificatiecodeAan } from '@/services/registratieService';
import { Field, GhostLink, PrimaryButton, TopBar } from './_components';
import { onb } from './_tokens';

/**
 * Stap 4 — de 6-cijferige code uit de mail. Gelijk aan EmailVerificationScreen
 * van het dashboard:
 *
 * - "Opnieuw versturen" pas na 60 seconden (de code is net verstuurd); de server
 *   throttlet ook zelf en zegt dan stil "gelukt".
 * - De melding van verify-code wordt letterlijk getoond (met het aantal
 *   resterende pogingen). Bij een verlopen code, te veel pogingen of geen code
 *   wordt het veld leeggemaakt.
 * - Bij succes heeft verify-code het bedrijf aangemaakt. Daarna het profiel
 *   herladen, zodat de app het bedrijf kent, en door naar het successcherm.
 * - "Terug naar inloggen" logt uit, zoals de gate van het dashboard.
 *
 * Hier kom je via de layouts: elke sessie met een profiel zonder bedrijf en
 * zonder bevestiging (status 'needs-verification') landt op dit scherm, ook
 * wie zich eerder aanmeldde en nu gewoon inlogt.
 */
export default function VerifyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refreshProfile, signOut } = useAuth();
  const { data } = useOnboarding();
  const email = user?.email ?? data.email;

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(OPNIEUW_NA_SECONDEN);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const submit = async () => {
    if (code.length !== 6) {
      setError('Vul de 6-cijferige code in.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const uitkomst = verificatieUitkomst(await verifieerCode(code));
      if (uitkomst.ok) {
        await refreshProfile();
        router.replace('/(onboarding)/success');
        return;
      }
      setError(uitkomst.melding);
      if (uitkomst.codeLeegmaken) setCode('');
    } catch {
      setError('Er ging iets mis. Probeer het opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResendLoading(true);
    setError('');
    try {
      await vraagVerificatiecodeAan();
      setCountdown(OPNIEUW_NA_SECONDEN);
      setCode('');
    } catch {
      // stil, zoals het dashboard: bij throttling geeft de server toch succes
    } finally {
      setResendLoading(false);
    }
  };

  const terugNaarInloggen = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <TopBar step={3} showBack={false} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconCircle}>
            <MailCheck size={30} color={onb.greenDk} strokeWidth={2} />
          </View>
          <Text style={styles.title}>Bevestig je e-mailadres</Text>
          <Text style={styles.sub}>
            We hebben een 6-cijferige code gestuurd naar{' '}
            {email ? <Text style={styles.email}>{email}</Text> : 'je e-mailadres'}.
          </Text>

          <View style={styles.form}>
            <Field
              label="Code"
              value={code}
              onChangeText={(v) => {
                setCode(schoneCode(v));
                setError('');
              }}
              onSubmitEditing={() => {
                if (code.length === 6) submit();
              }}
              placeholder="••••••"
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
              autoFocus
              editable={!loading}
              error={error || undefined}
            />
          </View>

          <View style={styles.resendRow}>
            {countdown > 0 ? (
              <Text style={styles.resendText}>Geen code ontvangen? Opnieuw versturen kan over {countdown}s</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={resend}
                disabled={resendLoading}
                hitSlop={8}
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.resendLink}>{resendLoading ? 'Versturen…' : 'Code opnieuw versturen'}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <PrimaryButton label="Verifiëren" onPress={submit} loading={loading} disabled={code.length !== 6} />
          <GhostLink label="Terug naar inloggen" onPress={terugNaarInloggen} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: onb.bg },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: onb.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  title: {
    marginTop: 22,
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
  email: {
    color: onb.ink,
    fontWeight: '600',
  },
  form: {
    alignSelf: 'stretch',
    marginTop: 28,
  },
  resendRow: {
    marginTop: 18,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 13.5,
    color: onb.muted,
    textAlign: 'center',
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '600',
    color: onb.greenDk,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 4,
  },
});
