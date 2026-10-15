import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { FormField } from './FormField';
import { FormSheet } from './FormSheet';
import { NoticeBanner } from './NoticeBanner';
import { useTheme } from '@/providers';
import { spacing } from '@/theme';

export type MailConcept = { aan: string; onderwerp: string; tekst: string };

/**
 * Het mailvenster van offertes en facturen (`SendOfferteMailModal` /
 * `SendFactuurMailModal` in het dashboard): Aan, Onderwerp en Bericht,
 * vooringevuld uit het sjabloon. De logica (sjabloon, bijlage, betaallink,
 * status) zit in het scherm; dit is alleen het formulier.
 */
export function DocumentMailSheet({
  visible,
  titel,
  nummer,
  laden,
  concept,
  onWijzig,
  melding,
  kop,
  vereistOnderwerp,
  saving,
  error,
  onVerstuur,
  onSluit,
}: {
  visible: boolean;
  titel: string;
  nummer: string | null | undefined;
  laden: boolean;
  concept: MailConcept;
  onWijzig: (c: MailConcept) => void;
  /** Bijvoorbeeld de ondertekenlink; staat boven de velden. */
  melding?: string | null;
  /** Extra veld boven Aan, bijvoorbeeld de sjabloonkeuze op de klantkaart. */
  kop?: ReactNode;
  /** Versturen pas met een onderwerp (de losse klantmail; documenten hebben er altijd een). */
  vereistOnderwerp?: boolean;
  saving: boolean;
  error: string | null;
  onVerstuur: () => void;
  onSluit: () => void;
}) {
  const { colors: t } = useTheme();
  return (
    <FormSheet
      visible={visible}
      title={titel}
      subtitle={nummer ?? undefined}
      error={error}
      saving={saving}
      submitLabel={saving ? 'Versturen...' : 'Versturen'}
      submitDisabled={laden || !concept.aan.trim() || (vereistOnderwerp && !concept.onderwerp.trim())}
      onSubmit={onVerstuur}
      onClose={onSluit}
    >
      {laden ? (
        <View style={{ paddingVertical: spacing.xl }}>
          <ActivityIndicator color={t.green600} accessibilityLabel="Sjabloon laden" />
        </View>
      ) : (
        <>
          {melding ? <NoticeBanner toon="info" message={melding} /> : null}
          {kop}
          <FormField
            label="Aan"
            value={concept.aan}
            onChangeText={(aan) => onWijzig({ ...concept, aan })}
            placeholder="emailadres@klant.nl"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FormField
            label="Onderwerp"
            value={concept.onderwerp}
            onChangeText={(onderwerp) => onWijzig({ ...concept, onderwerp })}
          />
          <FormField
            label="Bericht"
            value={concept.tekst}
            onChangeText={(tekst) => onWijzig({ ...concept, tekst })}
            placeholder="Schrijf uw bericht hier..."
            multiline
            style={{ minHeight: 220 }}
          />
        </>
      )}
    </FormSheet>
  );
}
