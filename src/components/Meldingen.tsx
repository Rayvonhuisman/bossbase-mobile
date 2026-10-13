import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useTheme } from '@/providers';
import {
  listMeldingen,
  markeerAllesGelezen,
  markeerGelezen,
  relatieveTijd,
  routeVoorLink,
  type Melding,
} from '@/services/meldingService';
import { alsTekst } from '@/lib/notitieTekst';
import { fonts, radius, spacing, type ThemeColors } from '@/theme';
import { Paneel } from './Paneel';

/**
 * De meldingenbel, zoals in het dashboard: getagd, toegewezen, verantwoordelijk,
 * ingepland of verzet, en websiteaanvragen. Ongelezen staan licht gemarkeerd;
 * een tik markeert als gelezen en opent het onderdeel.
 */
export function Meldingen({
  open,
  onSluit,
  onGewijzigd,
}: {
  open: boolean;
  onSluit: () => void;
  /** Aantal ongelezen is veranderd (badge bijwerken). */
  onGewijzigd: () => void;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<Melding[]>([]);
  const [opgehaald, setOpgehaald] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const laden = open && !opgehaald;

  const haalOp = useCallback(() => {
    if (!userId) return;
    void listMeldingen(userId).then((r) => {
      setFout(r.error);
      setItems(r.data);
      setOpgehaald(true);
    });
  }, [userId]);

  // Bij elk openen vers ophalen (de state wordt pas gezet als het antwoord er is).
  useEffect(() => {
    if (open) haalOp();
  }, [open, haalOp]);

  const laad = () => {
    setOpgehaald(false);
    haalOp();
  };
  const sluit = () => {
    setOpgehaald(false);
    onSluit();
  };

  const ongelezen = items.filter((m) => !m.read_at).length;

  const openMelding = async (m: Melding) => {
    if (!m.read_at) {
      setItems((huidig) => huidig.map((x) => (x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await markeerGelezen(m.id);
      onGewijzigd();
    }
    const route = routeVoorLink(m.link);
    if (route) {
      sluit();
      router.push(route as never);
    }
  };

  const allesGelezen = async () => {
    const nu = new Date().toISOString();
    setItems((huidig) => huidig.map((x) => (x.read_at ? x : { ...x, read_at: nu })));
    if (userId) await markeerAllesGelezen(userId);
    onGewijzigd();
  };

  return (
    <Paneel
      open={open}
      titel="Notificaties"
      subtitel={ongelezen ? `${ongelezen} ongelezen` : 'Alles gelezen'}
      onSluit={sluit}
      voet={
        ongelezen ? (
          <Pressable onPress={() => void allesGelezen()} accessibilityRole="button" style={styles.allesKnop}>
            <Text style={styles.allesTekst}>Alles gelezen</Text>
          </Pressable>
        ) : undefined
      }
    >
      <ScrollView contentContainerStyle={styles.lijst}>
        {laden && !items.length ? (
          <ActivityIndicator color={t.green} style={{ marginTop: spacing.xl }} />
        ) : fout ? (
          <View style={styles.leeg}>
            <Text style={styles.leegTekst}>{fout}</Text>
            <Pressable onPress={() => void laad()} accessibilityRole="button">
              <Text style={styles.link}>Opnieuw proberen</Text>
            </Pressable>
          </View>
        ) : !items.length ? (
          <View style={styles.leeg}>
            <Text style={styles.leegTekst}>Geen nieuwe notificaties</Text>
          </View>
        ) : (
          items.map((m) => {
            const icoon = m.type === 'mention' ? '@' : m.type.startsWith('toewijzing') ? '→' : '●';
            return (
              <Pressable
                key={m.id}
                onPress={() => void openMelding(m)}
                accessibilityRole="button"
                accessibilityLabel={`${m.read_at ? '' : 'Ongelezen: '}${m.title}`}
                style={({ pressed }) => [styles.rij, !m.read_at && styles.rijOngelezen, pressed && { opacity: 0.85 }]}
              >
                <View style={[styles.icoon, m.type === 'mention' && styles.icoonMention]}>
                  <Text style={[styles.icoonTekst, m.type === 'mention' && { color: '#FFFFFF' }]}>{icoon}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.titel} numberOfLines={2}>
                    {m.title}
                  </Text>
                  {m.body ? (
                    <Text style={styles.body} numberOfLines={1}>
                      {alsTekst(m.body)}
                    </Text>
                  ) : null}
                  <Text style={styles.tijd}>{relatieveTijd(m.created_at)}</Text>
                </View>
                {!m.read_at ? <View style={styles.stip} /> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Paneel>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    lijst: { padding: spacing.md, gap: 4 },
    rij: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, minHeight: 56 },
    rijOngelezen: { backgroundColor: t.green50 },
    icoon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bgAlt },
    icoonMention: { backgroundColor: '#1DDB62' },
    icoonTekst: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: t.ink2 },
    titel: { fontSize: 14.5, lineHeight: 20, fontWeight: '600', fontFamily: fonts.semibold, color: t.ink },
    body: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, color: t.muted },
    tijd: { fontSize: 12, fontFamily: fonts.regular, color: t.muted2, marginTop: 2 },
    stip: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1DDB62', marginTop: 6 },
    leeg: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
    leegTekst: { fontSize: 14, fontFamily: fonts.regular, color: t.muted },
    link: { fontSize: 14, fontFamily: fonts.semibold, color: t.green700 },
    allesKnop: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
    allesTekst: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: t.green700 },
  });
