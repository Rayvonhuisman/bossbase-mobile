import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/providers';
import type { ThemeColors } from '@/theme';

export type NoticeToon = 'waarschuwing' | 'fout' | 'info';

type Props = {
  /** Korte kop. Laat weg voor een melding van één regel. */
  title?: string;
  message: string;
  toon?: NoticeToon;
  /** Maakt de balk aantikbaar (bijvoorbeeld "tik om opnieuw te proberen"). */
  onPress?: () => void;
};

/**
 * Eén balk voor alles wat de gebruiker moet wéten voordat hij iets probeert:
 * een alleen-lezen account, een mislukte verversing, een onvolledig totaal.
 *
 * De toon is geen decoratie maar betekenis, met dezelfde kleurregel als de rest
 * van de app: amber = een grens (je mag dit niet, je proefperiode is voorbij),
 * rood = er ging iets mis, blauw = context. Een ontbrekend recht is geen
 * storing, en hoort dus niet rood te zijn.
 */
export function NoticeBanner({ title, message, toon = 'waarschuwing', onPress }: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const kleur =
    toon === 'fout'
      ? { bg: t.statusRejectBg, fg: t.statusRejectFg }
      : toon === 'info'
        ? { bg: t.statusSubmitBg, fg: t.statusSubmitFg }
        : { bg: t.statusWarnBg, fg: t.statusWarnFg };

  const inhoud = (
    <View style={[styles.balk, { backgroundColor: kleur.bg }]}>
      {title ? <Text style={[styles.titel, { color: kleur.fg }]}>{title}</Text> : null}
      <Text style={[styles.tekst, { color: kleur.fg }]}>{message}</Text>
    </View>
  );

  if (!onPress) return inhoud;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.9 }]}>
      {inhoud}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    balk: {
      padding: 12,
      borderRadius: t.rMd,
      gap: 3,
    },
    titel: {
      fontSize: 13.5,
      fontWeight: '700',
    },
    tekst: {
      fontSize: 12.5,
      lineHeight: 18,
      fontWeight: '500',
    },
  });
