import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Download, Share } from 'lucide-react-native';
import { useInstallatie } from '@/lib/pwa';
import { useTheme } from '@/providers';
import { fonts, radius, spacing, type ThemeColors } from '@/theme';

/**
 * "Installeer BossBase" onder het inlogformulier van de webapp.
 *
 * - Chrome, Edge, Android: de installatieprompt van de browser zelf.
 * - iPhone en iPad: daar bestaat zo'n prompt niet; we tonen de twee tikken.
 * - Andere browsers: naar de uitleg op /installeren.
 * - Al geïnstalleerd, of de iOS- of Android-app: niets.
 *
 * Installeren is nooit verplicht: inloggen werkt ook gewoon in de browser.
 */
export function InstalleerBossBase() {
  const { soort, apparaat, safari, installeer } = useInstallatie();
  const router = useRouter();
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [iosUitleg, setIosUitleg] = useState(false);

  if (soort === 'native' || soort === 'geinstalleerd') return null;

  const onPress = () => {
    if (soort === 'prompt') void installeer();
    else if (soort === 'ios') setIosUitleg((v) => !v);
    else router.push('/installeren');
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={soort === 'ios' ? { expanded: iosUitleg } : undefined}
        aria-expanded={soort === 'ios' ? iosUitleg : undefined}
        style={({ pressed }) => [styles.knop, pressed && { opacity: 0.7 }]}
      >
        <Download size={17} color={t.green700} strokeWidth={2.2} />
        <Text style={styles.knopTekst}>Installeer BossBase</Text>
      </Pressable>

      {soort === 'ios' && iosUitleg ? (
        <View style={styles.uitleg}>
          {safari ? (
            <Text style={styles.uitlegTekst}>
              Tik {apparaat === 'ipad' ? 'rechtsboven ' : ''}op{' '}
              <Share size={14} color={t.ink} strokeWidth={2.2} />{' '}
              <Text style={styles.vet}>Delen</Text> en kies{' '}
              <Text style={styles.vet}>Zet op beginscherm</Text>.
            </Text>
          ) : (
            // Chrome, Firefox of een ingebouwde browser op iPhone/iPad: daar
            // ontbreekt "Zet op beginscherm" vaak.
            <Text style={styles.uitlegTekst}>
              Open <Text style={styles.vet}>app.bossbase.nl</Text> in{' '}
              <Text style={styles.vet}>Safari</Text> om BossBase te installeren.
            </Text>
          )}
        </View>
      ) : null}

      <Pressable onPress={() => router.push('/installeren')} accessibilityRole="link" hitSlop={8}>
        <Text style={styles.meer}>Hoe werkt installeren?</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
    knop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.lineStrong,
      backgroundColor: t.card,
    },
    knopTekst: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, color: t.ink },
    uitleg: {
      alignSelf: 'stretch',
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: t.bgAlt,
    },
    uitlegTekst: { fontSize: 14, lineHeight: 21, fontFamily: fonts.regular, color: t.ink, textAlign: 'center' },
    vet: { fontWeight: '700', fontFamily: fonts.bold },
    meer: { fontSize: 13, fontFamily: fonts.regular, color: t.muted, textDecorationLine: 'underline' },
  });
