import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Clock } from 'lucide-react-native';
import { useAuth, useTheme } from '@/providers';
import { laadUrenHerinnering } from '@/services/urenHerinneringService';
import type { OpenWerkdag } from '@/lib/urenHerinnering';
import { dsShadow, type ThemeColors } from '@/theme';

const DAG = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** "Do 1 okt" — alleen de eerste letter groot. */
const dagLabel = (iso: string) => {
  const t = DAG.format(new Date(`${iso}T12:00:00Z`)).replace('.', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const TOON_MAX = 3;

/**
 * "Vul je werkdag in": de dagen waarop je ingepland stond maar nog geen
 * werkdaguren schreef — de herinnering van het dashboard, als kaart in plaats
 * van pop-up. Alleen voor wie het bedrijf herinnert (zie `lib/urenHerinnering`);
 * wie geen uren bijhoudt, ziet hem nooit.
 *
 * "Later" verbergt hem voor het herinneringsinterval uit Instellingen, net als
 * wegklikken in het dashboard.
 */
export function UrenHerinneringKaart({ marge = 16 }: { marge?: number }) {
  const router = useRouter();
  const { user, role } = useAuth();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const uid = user?.id ?? null;
  const [dagen, setDagen] = useState<OpenWerkdag[]>([]);
  const [intervalMin, setIntervalMin] = useState(0);
  // null = nog niet gelezen; true = "Later" loopt nog.
  const [verborgen, setVerborgen] = useState<boolean | null>(null);
  const sluimerSleutel = uid ? `bb.urenHerinnering.later.${uid}` : null;

  const laad = useCallback(() => {
    if (!uid) return;
    let actief = true;
    laadUrenHerinnering(uid, role).then((r) => {
      if (!actief) return;
      setDagen(r.dagen);
      setIntervalMin(r.intervalMin);
    });
    return () => {
      actief = false;
    };
  }, [uid, role]);

  // Bij elke terugkeer naar het scherm: na het invullen valt de dag weg.
  useFocusEffect(laad);

  useEffect(() => {
    if (!sluimerSleutel) return;
    AsyncStorage.getItem(sluimerSleutel)
      .then((v) => setVerborgen((Number(v) || 0) > Date.now()))
      .catch(() => setVerborgen(false));
  }, [sluimerSleutel]);

  const later = () => {
    const tot = Date.now() + Math.max(1, intervalMin) * 60 * 1000;
    setVerborgen(true);
    if (sluimerSleutel) AsyncStorage.setItem(sluimerSleutel, String(tot)).catch(() => {});
  };

  if (!dagen.length || verborgen !== false) return null;

  const invullen = (d: OpenWerkdag) =>
    router.push({ pathname: '/hours/new', params: { soort: 'overig', datum: d.datum } });

  return (
    <View style={{ paddingHorizontal: marge, paddingTop: 12 }}>
      <View style={[styles.kaart, dsShadow]}>
        <View style={styles.kop}>
          <View style={styles.icoon}>
            <Clock size={18} color={t.statusWarnFg} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.titel}>Vul je werkdag in</Text>
            <Text style={styles.sub}>
              {dagen.length === 1
                ? 'Je stond ingepland, maar hebt nog geen werkdaguren geschreven.'
                : `Je stond op ${dagen.length} dagen ingepland zonder werkdaguren.`}
            </Text>
          </View>
        </View>

        {dagen.slice(0, TOON_MAX).map((d) => (
          <Pressable
            key={d.datum}
            onPress={() => invullen(d)}
            accessibilityRole="button"
            accessibilityLabel={`Werkdag invullen voor ${dagLabel(d.datum)}`}
            style={({ pressed }) => [styles.dag, pressed && { opacity: 0.8 }]}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.dagDatum}>{dagLabel(d.datum)}</Text>
              <Text style={styles.dagLabel} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
            <Text style={styles.invullen}>Invullen ›</Text>
          </Pressable>
        ))}
        {dagen.length > TOON_MAX ? (
          <Pressable onPress={() => router.push('/(tabs)/hours')} accessibilityRole="link" style={styles.meer}>
            <Text style={styles.invullen}>en nog {dagen.length - TOON_MAX} › naar Uren</Text>
          </Pressable>
        ) : null}

        <Text style={styles.uitleg}>
          Werkdaguren zijn je hele werkdag (voor loon en verlof). Werkbonuren zijn de tijd op een klus (voor
          nacalculatie en factuur) en tellen hier niet mee.
        </Text>
        <Pressable onPress={later} accessibilityRole="button" hitSlop={8} style={styles.laterKnop}>
          <Text style={styles.laterTekst}>Later</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    kaart: {
      backgroundColor: t.card,
      borderRadius: t.rLg,
      borderWidth: 1,
      borderColor: t.statusWarnBg,
      padding: 14,
      gap: 10,
    },
    kop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    icoon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: t.statusWarnBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titel: { fontSize: 15, fontWeight: '700', color: t.ink },
    sub: { fontSize: 13, lineHeight: 18, color: t.muted, marginTop: 2 },
    dag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 12,
      borderRadius: t.rMd,
      backgroundColor: t.bgAlt,
    },
    dagDatum: { fontSize: 14, fontWeight: '700', color: t.ink },
    dagLabel: { fontSize: 12.5, color: t.muted },
    invullen: { fontSize: 13, fontWeight: '700', color: t.green700 },
    meer: { minHeight: 36, justifyContent: 'center' },
    uitleg: { fontSize: 12, lineHeight: 17, color: t.muted },
    laterKnop: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 },
    laterTekst: { fontSize: 13, fontWeight: '600', color: t.muted },
  });
