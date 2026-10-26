import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Check, Circle, X } from 'lucide-react-native';
import { useAuth, useOnboarding } from '@/providers';
import {
  JURIDISCH,
  WACHTWOORD_EISEN,
  accountFouten,
  bedrijfFouten,
  heeftFouten,
  type AccountFouten,
} from '@/lib/registratie';
import { openExtern } from '@/lib/linking';
import { Field, GreenButton, TopBar } from './_components';
import { onb } from './_tokens';

const GOED = '#15A34A';
const FOUT = '#C81E1E';

function openLink(url: string) {
  openExtern(url, 'De pagina kon niet worden geopend.');
}

/**
 * Stap 3 — het account, en hier wordt ook verzonden. Dezelfde eisen als het
 * dashboard: naam, geldig e-mailadres, een wachtwoord dat aan alle vier de
 * eisen voldoet en dat twee keer hetzelfde is.
 *
 * Geen vinkje voor de voorwaarden: het dashboard heeft er ook geen. Door op de
 * knop te drukken ga je akkoord, en dat akkoord legt `signUp` vast via de Edge
 * Function akkoord-vastleggen (versie, tijdstip, IP).
 *
 * Na `signUp` is er een sessie zonder bedrijf; de onboardinglayout stuurt dan
 * door naar het codescherm (status 'needs-verification').
 */
export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, update } = useOnboarding();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState(data.fullName);
  const [email, setEmail] = useState(data.email);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fouten, setFouten] = useState<AccountFouten>({});

  // De layout kan dit scherm al vervangen door het codescherm terwijl signUp
  // nog het akkoord en de code afhandelt. Dan hier niets meer zetten.
  const gemount = useRef(true);
  useEffect(() => {
    gemount.current = true;
    return () => {
      gemount.current = false;
    };
  }, []);

  const wis = (veld: keyof AccountFouten) => {
    if (fouten[veld]) setFouten((f) => ({ ...f, [veld]: undefined }));
  };

  const onSubmit = async () => {
    setErrorMsg(null);
    const f = accountFouten({ fullName, email, password, password2 });
    setFouten(f);
    if (heeftFouten(f)) return;

    // De bedrijfsgegevens zijn in de vorige stap al gecontroleerd; ontbreken
    // ze toch (bijv. na een herlaad op web), dan terug naar die stap.
    if (heeftFouten(bedrijfFouten(data))) {
      router.replace('/(onboarding)/company');
      return;
    }

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    update({ fullName: trimmedName, email: trimmedEmail });

    setSubmitting(true);
    const res = await signUp({
      email: trimmedEmail,
      password,
      fullName: trimmedName,
      companyName: data.companyName,
      phone: data.phone,
      kvk: data.kvk,
      branche: data.branche,
      pakket: data.pakket,
    });
    if (!gemount.current) return;
    setSubmitting(false);

    if (res.error !== null) {
      setErrorMsg(res.error);
      return;
    }
    if (res.vervolg === 'bevestigen') {
      router.replace({ pathname: '/(onboarding)/success', params: { modus: 'bevestigen' } });
    }
    // 'verificatie': de layout stuurt door naar het codescherm.
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <TopBar step={2} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            onChangeText={(v) => {
              setFullName(v);
              wis('fullName');
            }}
            placeholder="Marco Veldhuis"
            autoCapitalize="words"
            autoComplete="name"
            error={fouten.fullName}
            editable={!submitting}
          />
          <Field
            label="E-mailadres"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              wis('email');
            }}
            placeholder="marco@veldhuis.nl"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            error={fouten.email}
            editable={!submitting}
          />
          <View>
            <Field
              label="Wachtwoord"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                wis('password');
              }}
              placeholder="Min. 8 tekens"
              isPassword
              autoComplete="password-new"
              textContentType="newPassword"
              error={fouten.password}
              editable={!submitting}
            />
            {password ? (
              <View style={styles.eisen}>
                {WACHTWOORD_EISEN.map((r) => {
                  const ok = r.test(password);
                  return (
                    <View key={r.key} style={styles.eis}>
                      {ok ? (
                        <Check size={12} color={GOED} strokeWidth={3} />
                      ) : (
                        <Circle size={9} color={onb.faint} strokeWidth={2.4} />
                      )}
                      <Text style={[styles.eisText, { color: ok ? GOED : onb.faint }]}>{r.label}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
          <View>
            <Field
              label="Herhaal wachtwoord"
              value={password2}
              onChangeText={(v) => {
                setPassword2(v);
                wis('password2');
              }}
              placeholder="Nogmaals je wachtwoord"
              isPassword
              autoComplete="password-new"
              textContentType="newPassword"
              error={fouten.password2}
              editable={!submitting}
            />
            {password2 && !fouten.password2 ? (
              <View style={[styles.eis, { marginTop: 6, paddingLeft: 4 }]}>
                {password === password2 ? (
                  <Check size={12} color={GOED} strokeWidth={3} />
                ) : (
                  <X size={12} color={FOUT} strokeWidth={3} />
                )}
                <Text style={[styles.eisText, { color: password === password2 ? GOED : FOUT }]}>
                  {password === password2 ? 'Wachtwoorden komen overeen' : 'Wachtwoorden komen niet overeen'}
                </Text>
              </View>
            ) : null}
          </View>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
          <GreenButton label="Account aanmaken" onPress={onSubmit} loading={submitting} />
          {/* Zelfde tekst en links als het dashboard, onder de verzendknop. */}
          <Text style={styles.termsText}>
            Door een account aan te maken ga je akkoord met de{' '}
            <Text accessibilityRole="link" style={styles.termsLink} onPress={() => openLink(JURIDISCH.voorwaarden)}>
              algemene voorwaarden
            </Text>{' '}
            en de{' '}
            <Text
              accessibilityRole="link"
              style={styles.termsLink}
              onPress={() => openLink(JURIDISCH.verwerkersovereenkomst)}
            >
              verwerkersovereenkomst
            </Text>
            . In de{' '}
            <Text accessibilityRole="link" style={styles.termsLink} onPress={() => openLink(JURIDISCH.privacy)}>
              privacyverklaring
            </Text>{' '}
            lees je hoe we met je gegevens omgaan.
          </Text>
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
  eisen: {
    marginTop: 8,
    paddingLeft: 4,
    gap: 4,
  },
  eis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eisText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  termsText: {
    marginTop: 12,
    fontSize: 12.5,
    color: onb.muted,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  termsLink: {
    color: onb.ink,
    fontWeight: '600',
    textDecorationLine: 'underline',
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
