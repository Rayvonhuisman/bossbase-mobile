import { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { Button } from '@/components/Button';
import { useAuth, useTheme } from '@/providers';
import { markeerMeldingenGevraagd, moetMeldingenVragen, zetPushAan } from '@/lib/push';
import { fonts, radius, spacing, type ThemeColors } from '@/theme';
import { tx } from '@/i18n';

/**
 * "Meldingen toestaan?" — bij het eerste openen van de geïnstalleerde app (op
 * het beginscherm), net als een app uit de App Store. Toestaan vraagt meteen de
 * toestemming van de telefoon (dat moet vanuit een tik) en meldt het toestel
 * aan. Eén keer per toestel; daarna via Instellingen → Profiel.
 * In de browser en in de native app tekent dit niets.
 */
export function MeldingenVraag() {
  const { session } = useAuth();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [open, setOpen] = useState(() => moetMeldingenVragen());
  const [bezig, setBezig] = useState(false);
  const userId = session?.user?.id;
  if (!open || !userId) return null;

  const klaar = () => {
    markeerMeldingenGevraagd();
    setOpen(false);
  };
  const toestaan = async () => {
    setBezig(true);
    try {
      await zetPushAan(userId);
    } catch {
      /* geweigerd of mislukt: later via Instellingen → Profiel */
    } finally {
      setBezig(false);
      klaar();
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={klaar}>
      <View style={styles.achtergrond}>
        <View style={styles.kaart} accessibilityRole="alert">
          <View style={styles.icoon}>
            <Bell size={22} color={t.greenInk} strokeWidth={2.2} />
          </View>
          <Text style={styles.titel}>{tx('Meldingen toestaan?')}</Text>
          <Text style={styles.tekst}>
            {tx('Krijg een melding als er een werkbon voor je klaarstaat, je wordt getagd of een klant een offerte tekent. Ook als de app dicht is.')}
          </Text>
          <View style={styles.knoppen}>
            <Button label={tx('Toestaan')} loading={bezig} disabled={bezig} onPress={toestaan} />
            <Button label={tx('Niet nu')} variant="ghost" disabled={bezig} onPress={klaar} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    achtergrond: { flex: 1, backgroundColor: 'rgba(13,13,13,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    kaart: { width: '100%', maxWidth: 380, backgroundColor: t.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
    icoon: { width: 48, height: 48, borderRadius: 24, backgroundColor: t.green, alignItems: 'center', justifyContent: 'center' },
    titel: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, color: t.ink, textAlign: 'center' },
    tekst: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, color: t.muted, textAlign: 'center' },
    knoppen: { alignSelf: 'stretch', gap: spacing.sm },
  });
