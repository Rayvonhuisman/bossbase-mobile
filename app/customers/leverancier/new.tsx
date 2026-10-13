import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { AppTopBar, FormFooter } from '@/components';
import {
  LeverancierVelden,
  leegLeverancierConcept,
  leverancierConceptGeldig,
  type LeverancierConcept,
} from '@/components/LeverancierVelden';
import { useTheme } from '@/providers';
import { createLeverancier } from '@/services/leverancierService';
import { useSave } from '@/lib/useSave';
import { terugOfNaar } from '@/lib/navigatie';
import { leesbreedte } from '@/lib/schermklasseRegels';
import { spacing } from '@/theme';

/**
 * Nieuwe leverancier — `NewLeverancierModal` van het dashboard. De database
 * eist het eigen bedrijf, het recht `klanten_bewerken` of `kosten` en een
 * lopend abonnement (read-only blokkeert); de lijst toont de knop alleen dan,
 * en een weigering via een directe link komt hier eerlijk terug.
 * Na het opslaan opent de kaart van de nieuwe leverancier.
 */
export default function NieuweLeverancierScherm() {
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(), []);
  const [concept, setConcept] = useState<LeverancierConcept>(leegLeverancierConcept);
  const { save, saving, error } = useSave<{ id: string }>();
  const terug = () => terugOfNaar(router, '/customers?soort=leveranciers');

  const opslaan = () => {
    save(() => createLeverancier(concept), {
      succesMelding: 'Leverancier opgeslagen',
      onSuccess: (l) => {
        router.replace(`/customers/leverancier/${l.id}`);
      },
    });
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <AppTopBar variant="detail" title="Nieuwe leverancier" onBack={terug} />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LeverancierVelden waarde={concept} onChange={setConcept} />
          </ScrollView>
          <FormFooter
            label="Leverancier opslaan"
            onPress={opslaan}
            loading={saving}
            disabled={!leverancierConceptGeldig(concept)}
            error={error}
            hint={concept.naam.trim() ? null : 'Naam is verplicht.'}
          />
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    content: {
      ...leesbreedte,
      padding: spacing.lg,
      paddingBottom: 48,
    },
  });
