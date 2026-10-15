import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Dialog } from '@/lib/dialog';
import { terugOfNaar } from '@/lib/navigatie';
import { Stack, useRouter } from 'expo-router';
import { AdresZoeker, AppTopBar, FormField, PermissionGate, FormFooter } from '@/components';
import { useAuth, useTheme } from '@/providers';
import { createCustomer } from '@/services/customerService';
import { spacing, type ThemeColors } from '@/theme';
import { leesbreedte } from '@/lib/schermklasseRegels';

/**
 * Quick-capture form for a new customer. Saves to the same Supabase `customers`
 * table as the desktop dashboard (two-way sync). Honest states: validation,
 * saving spinner, real error on failure — never a fake success.
 */
/**
 * Nieuwe klant. Afgeschermd op `klanten_bewerken`, gelijk aan het dashboard;
 * de gate blokkeert ook een deeplink naar dit scherm.
 */
export default function NewCustomerScreen() {
  return (
    <PermissionGate permission="klanten_bewerken" label="Nieuwe klant">
      <NewCustomerInhoud />
    </PermissionGate>
  );
}

function NewCustomerInhoud() {
  const router = useRouter();
  const { companyId } = useAuth();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [city, setCity] = useState('');
  const [kvk, setKvk] = useState('');
  const [btw, setBtw] = useState('');
  const [iban, setIban] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Naam is verplicht.');
      return;
    }
    // Zelfde e-mailcontrole als `NewCustomerModal` in het dashboard.
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Ongeldig e-mailadres.');
      return;
    }
    if (!companyId) {
      setError('Je sessie is nog niet geladen. Probeer het zo opnieuw.');
      return;
    }
    setSaving(true);
    const { error: saveError } = await createCustomer({
      company_id: companyId,
      name,
      email,
      phone,
      address,
      postcode,
      city,
      kvk_number: kvk,
      btw_number: btw,
      iban,
      notes,
    });
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    Dialog.alert('Klant opgeslagen', `${name.trim()} is toegevoegd.`);
    terugOfNaar(router, '/customers');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppTopBar variant="detail" title="Nieuwe klant" onBack={() => terugOfNaar(router, '/customers')} />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <FormField
              label="Naam *"
              value={name}
              onChangeText={setName}
              placeholder="Bedrijfs- of klantnaam"
              autoCapitalize="words"
              returnKeyType="next"
            />
            <FormField
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              placeholder="naam@bedrijf.nl"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FormField
              label="Telefoon"
              value={phone}
              onChangeText={setPhone}
              placeholder="06 12 34 56 78"
              keyboardType="phone-pad"
            />
            <AdresZoeker
              onSelect={(v) => {
                setAddress(v.address);
                setPostcode(v.postcode);
                setCity(v.city);
              }}
            />
            <FormField
              label="Adres"
              value={address}
              onChangeText={setAddress}
              placeholder="Straat en huisnummer"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Postcode"
                  value={postcode}
                  onChangeText={setPostcode}
                  placeholder="1234 AB"
                  autoCapitalize="characters"
                />
              </View>
              <View style={{ flex: 2 }}>
                <FormField label="Plaats" value={city} onChangeText={setCity} placeholder="Plaats" />
              </View>
            </View>
            <FormField
              label="KvK-nummer"
              value={kvk}
              onChangeText={setKvk}
              placeholder="Optioneel"
              keyboardType="number-pad"
            />
            <FormField
              label="Btw-nummer"
              value={btw}
              onChangeText={setBtw}
              placeholder="Optioneel, bijv. NL123456789B01"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <FormField
              label="IBAN"
              value={iban}
              onChangeText={setIban}
              placeholder="Optioneel"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <FormField
              label="Notities"
              value={notes}
              onChangeText={setNotes}
              placeholder="Optioneel"
              multiline
            />

          </ScrollView>
          <FormFooter
            label="Klant opslaan"
            onPress={onSubmit}
            loading={saving}
            error={error}
          />
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    content: {
      ...leesbreedte,
      padding: spacing.lg,
      paddingBottom: 48,
      gap: spacing.lg,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    error: {
      color: t.statusRejectFg,
      fontSize: 14,
      lineHeight: 20,
    },
  });
