import { useEffect, useMemo, useState } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AKKOORD_NIEUW, AKKOORD_VERSIES, OPNIEUW_AKKOORD, teAccepteren, type AkkoordDocument } from '@/lib/akkoord';
import { vandaagISO } from '@/lib/datum';
import { supabase } from '@/lib/supabase';
import { useAuth, useTheme } from '@/providers';
import { dsShadowPop, spacing, type ThemeColors } from '@/theme';
import { Button } from './Button';

/**
 * Nieuwe versie van de voorwaarden: hetzelfde venster als
 * `src/components/NieuweVoorwaarden.jsx` in het dashboard. Een beheerder die
 * nog op een oudere versie van de algemene voorwaarden of de
 * verwerkersovereenkomst zit, accepteert de nieuwe na het laden van zijn
 * profiel. Beheerders, omdat de overeenkomst met het bedrijf is; een
 * medewerker sluit niets af.
 *
 * Alleen documenten waarvan de ingangsdatum bereikt is (`lib/akkoord.ts`).
 * Accepteren gaat via de edge function `akkoord-vastleggen` (tijdstip en
 * IP-adres, bron 'nieuwe_versie'); die legt voor een bestaande beheerder ook
 * alleen ingegane documenten vast. Het venster sluit pas na accepteren;
 * uitloggen kan altijd.
 */
export function NieuweVoorwaarden() {
  const { status, user, role, signOut } = useAuth();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  // Per gebruiker, zodat een andere login nooit het venster van de vorige ziet.
  const [gevonden, setGevonden] = useState<{ userId: string; docs: AkkoordDocument[] } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const userId = user?.id ?? null;
  const isAdmin = role === 'admin';
  const actief = status === 'ready' && !!userId && isAdmin;
  const ontbreekt = actief && gevonden?.userId === userId ? gevonden.docs : [];

  useEffect(() => {
    if (!actief || !userId) return;
    let leeft = true;
    void supabase
      .from('juridisch_akkoord')
      .select('document, versie')
      .eq('user_id', userId)
      .in('document', OPNIEUW_AKKOORD)
      .then(({ data, error }) => {
        if (!leeft) return;
        if (error) {
          // Niet blokkeren als het lezen mislukt; bij de volgende start opnieuw.
          if (__DEV__) console.warn('[akkoord] controleren mislukt', error.message);
          return;
        }
        setGevonden({ userId, docs: teAccepteren({ isAdmin: true, rijen: data ?? [], vandaag: vandaagISO() }) });
      });
    return () => {
      leeft = false;
    };
  }, [actief, userId]);

  if (!ontbreekt.length) return null;

  const accepteer = async () => {
    setBezig(true);
    setFout(null);
    const { data, error } = await supabase.functions.invoke('akkoord-vastleggen');
    setBezig(false);
    if (error || data?.success === false) {
      setFout('Vastleggen lukte niet. Probeer het zo nog eens.');
      return;
    }
    setGevonden(null);
  };

  const uitloggen = () => {
    setGevonden(null);
    void signOut();
  };

  return (
    // Geen onRequestClose-actie: de terugknop van Android sluit dit venster niet.
    <Modal transparent visible animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.achtergrond}>
        <View
          style={styles.kaart}
          role="dialog"
          aria-modal
          aria-labelledby="nv-titel"
        >
          <ScrollView contentContainerStyle={styles.inhoud}>
            <Text nativeID="nv-titel" role="heading" aria-level={2} style={styles.titel}>
              We hebben onze voorwaarden aangepast
            </Text>
            <Text style={styles.sub}>
              {ontbreekt.map((d) => `${AKKOORD_NIEUW[d].naam} ${AKKOORD_VERSIES[d]}`).join(' · ')}
            </Text>
            <Text style={styles.tekst}>Wat er nieuw is:</Text>
            {ontbreekt.map((d) => (
              <Text key={d} style={styles.tekst}>
                <Text style={styles.vet}>{AKKOORD_NIEUW[d].naam}: </Text>
                {AKKOORD_NIEUW[d].wat}
              </Text>
            ))}
            <Text style={styles.tekst}>
              Lees de{' '}
              {ontbreekt.map((d, i) => (
                <Text key={d}>
                  {i > 0 ? (i === ontbreekt.length - 1 ? ' en de ' : ', de ') : ''}
                  <Text
                    accessibilityRole="link"
                    style={styles.link}
                    onPress={() => void Linking.openURL(AKKOORD_NIEUW[d].url).catch(() => undefined)}
                  >
                    {AKKOORD_NIEUW[d].naam.toLowerCase()}
                  </Text>
                </Text>
              ))}
              . Vragen? Mail info@bossbase.nl.
            </Text>
            {fout ? (
              <Text role="alert" style={styles.fout}>
                {fout}
              </Text>
            ) : null}
          </ScrollView>
          <View style={styles.knoppen}>
            <Button label="Uitloggen" variant="secondary" onPress={uitloggen} disabled={bezig} style={styles.knop} />
            <Button label="Akkoord" onPress={() => void accepteer()} loading={bezig} style={styles.knop} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    achtergrond: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      // Zelfde verduistering als de dialogen en vellen elders in de app.
      backgroundColor: 'rgba(4,18,12,0.5)',
    },
    kaart: {
      width: '100%',
      maxWidth: 440,
      maxHeight: '90%',
      backgroundColor: t.card,
      borderRadius: 22,
      padding: spacing.xl,
      ...dsShadowPop,
    },
    inhoud: { gap: spacing.sm },
    titel: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: t.ink },
    sub: { fontSize: 13.5, lineHeight: 19, color: t.muted, marginBottom: spacing.xs },
    tekst: { fontSize: 14.5, lineHeight: 21, color: t.muted },
    vet: { fontWeight: '700', color: t.ink },
    link: { color: t.green700, fontWeight: '600', textDecorationLine: 'underline' },
    fout: { fontSize: 14, lineHeight: 20, color: '#DC2626' },
    knoppen: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    knop: { flex: 1 },
  });
