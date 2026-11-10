import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AKKOORD_NIEUW, OPNIEUW_AKKOORD, teAccepteren, type AkkoordDocument } from '@/lib/akkoord';
import { vandaagISO } from '@/lib/datum';
import { supabase } from '@/lib/supabase';
import { useAuth, useTheme } from '@/providers';
import { fonts, radius, spacing, type ThemeColors } from '@/theme';

/**
 * Nieuwe versie van de voorwaarden: dezelfde kleine melding als
 * `src/components/NieuweVoorwaarden.jsx` in het dashboard (sinds 10-11-2026,
 * wens Niels: geen venster met de hele uitleg meer). Een beheerder die
 * nog op een oudere versie van de algemene voorwaarden of de
 * verwerkersovereenkomst zit, accepteert de nieuwe na het laden van zijn
 * profiel. Beheerders, omdat de overeenkomst met het bedrijf is; een
 * medewerker sluit niets af.
 *
 * Alleen documenten waarvan de ingangsdatum bereikt is (`lib/akkoord.ts`).
 * Accepteren gaat via de edge function `akkoord-vastleggen` (tijdstip en
 * IP-adres, bron 'nieuwe_versie'); die legt voor een bestaande beheerder ook
 * alleen ingegane documenten vast. De melding blokkeert niets en blijft
 * staan tot de beheerder op Akkoord tikt; tot dan geldt de vorige versie.
 */
export function NieuweVoorwaarden() {
  const { status, user, role } = useAuth();
  const { colors: t } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(t), [t]);
  // Per gebruiker, zodat een andere login nooit de melding van de vorige ziet.
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

  const namen = ontbreekt.map((d) => AKKOORD_NIEUW[d].naam.toLowerCase());
  const wat = namen.length > 1 ? `${namen.slice(0, -1).join(', ')} en de ${namen[namen.length - 1]}` : namen[0];

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 92 }]} pointerEvents="box-none">
      <View style={styles.kaart} accessibilityRole="alert">
        <View style={styles.tekstvak}>
          <Text style={styles.tekst}>We hebben de {wat} aangepast.</Text>
          <View style={styles.links}>
            {ontbreekt.map((d) => (
              <Text
                key={d}
                accessibilityRole="link"
                style={styles.link}
                onPress={() => void Linking.openURL(AKKOORD_NIEUW[d].url).catch(() => undefined)}
              >
                {ontbreekt.length > 1 ? AKKOORD_NIEUW[d].naam : 'Lees ze'}
              </Text>
            ))}
          </View>
          {fout ? (
            <Text role="alert" style={styles.fout}>
              {fout}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => void accepteer()}
          disabled={bezig}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.knop, (pressed || bezig) && { opacity: 0.7 }]}
        >
          <Text style={styles.knopTekst}>{bezig ? 'Bezig…' : 'Akkoord'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: spacing.md,
      right: spacing.md,
      alignItems: 'center',
      zIndex: 999,
    },
    kaart: {
      width: '100%',
      maxWidth: 440,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      paddingLeft: spacing.lg,
      paddingRight: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      shadowColor: '#0D0D0D',
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
    },
    tekstvak: { flex: 1, gap: 2 },
    tekst: { fontSize: 14, lineHeight: 19, fontWeight: '600', fontFamily: fonts.semibold, color: t.ink },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    link: { fontSize: 13.5, lineHeight: 19, color: t.green700, fontWeight: '600', textDecorationLine: 'underline' },
    fout: { fontSize: 13, lineHeight: 18, color: '#DC2626' },
    knop: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.green },
    knopTekst: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: t.greenInk },
  });
