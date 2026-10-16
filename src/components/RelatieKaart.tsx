import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { useSchermklasse } from '@/lib/schermklasse';
import { ds, dsShadow, type ThemeColors } from '@/theme';

/**
 * Bouwstenen voor de klantkaart en de leverancierskaart, zodat beide er
 * hetzelfde uitzien (in het dashboard zijn ze ook één opbouw). Alleen stijl uit
 * het thema; geen eigen kleuren.
 */

/**
 * Twee kolommen op een iPad of desktop (vanaf de tabletbreedte), één kolom op
 * een telefoon en in een smalle Split View. De app-kolom is daar al begrensd
 * (`KOLOM_MAX_TABLET`), dus niets wordt uitgerekt.
 */
export function KaartKolommen({ links, rechts }: { links: ReactNode; rechts: ReactNode }) {
  const { klasse } = useSchermklasse();
  if (klasse !== 'tablet') {
    return (
      <View>
        {links}
        {rechts}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <View style={{ flex: 1, minWidth: 0 }}>{links}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{rechts}</View>
    </View>
  );
}

/** Een blok op de kaart: kop met aantal en een optionele "+"-knop, dan de inhoud. */
export function KaartBlok({
  titel,
  aantal,
  onToevoegen,
  toevoegLabel,
  actie,
  onActie,
  children,
}: {
  titel: string;
  aantal?: number;
  onToevoegen?: () => void;
  toevoegLabel?: string;
  /** Tekstknop rechts in de kop, bijvoorbeeld "Alle notities". */
  actie?: string;
  onActie?: () => void;
  children: ReactNode;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.blok}>
      <View style={styles.kop}>
        <View style={styles.kopTitel}>
          <Text style={styles.titel} accessibilityRole="header">
            {titel}
          </Text>
          {typeof aantal === 'number' ? <Text style={styles.aantal}>{aantal}</Text> : null}
        </View>
        {actie && onActie ? (
          <Pressable
            onPress={onActie}
            accessibilityRole="button"
            style={({ pressed }) => [styles.tekstKnop, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.tekstKnopTekst}>{actie}</Text>
          </Pressable>
        ) : null}
        {onToevoegen ? (
          <Pressable
            onPress={onToevoegen}
            accessibilityRole="button"
            accessibilityLabel={toevoegLabel ?? `${titel} toevoegen`}
            style={({ pressed }) => [styles.plus, pressed && { opacity: 0.7 }]}
          >
            <Plus size={18} color={t.ink} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.kaart, dsShadow]}>{children}</View>
    </View>
  );
}

/** Een rij in een blok: titel, onderregel, iets rechts. Tikbaar als er een actie is. */
export function KaartRij({
  titel,
  sub,
  links,
  rechts,
  eerste,
  onPress,
  gedimd,
}: {
  titel: string;
  sub?: string | null;
  /** Iets vóór de tekst, bijvoorbeeld het icoon van een tijdlijnregel. */
  links?: ReactNode;
  rechts?: ReactNode;
  eerste?: boolean;
  onPress?: () => void;
  gedimd?: boolean;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const inhoud = (
    <View style={[styles.rij, !eerste && styles.rijRand, gedimd && { opacity: 0.6 }]}>
      {links}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rijTitel} numberOfLines={1}>
          {titel}
        </Text>
        {sub ? (
          <Text style={styles.rijSub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {rechts}
    </View>
  );
  if (!onPress) return inhoud;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && { opacity: 0.85 }}
    >
      {inhoud}
    </Pressable>
  );
}

/** Lege staat binnen een blok. */
export function KaartLeeg({ tekst }: { tekst: string }) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return <Text style={styles.leeg}>{tekst}</Text>;
}

/** Label/waarde-regel voor de gegevens. Tikbaar (bellen, mailen) als er een actie is. */
export function GegevensRij({
  label,
  waarde,
  onPress,
  eerste,
}: {
  label: string;
  waarde: string | null | undefined;
  onPress?: () => void;
  eerste?: boolean;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const tikbaar = !!onPress && !!waarde;
  const inhoud = (
    <View style={[styles.gegevensRij, !eerste && styles.rijRand]}>
      <Text style={styles.gegevensLabel}>{label}</Text>
      <Text style={[styles.gegevensWaarde, tikbaar && { color: t.green700 }]} numberOfLines={2}>
        {waarde || '—'}
      </Text>
    </View>
  );
  if (!tikbaar) return inhoud;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      {inhoud}
    </Pressable>
  );
}

/** Snelle cijfers bovenaan de kaart (alleen met het juiste recht tonen). */
export function KaartCijfers({
  cijfers,
}: {
  cijfers: { label: string; waarde: string; toon?: 'goed' | 'slecht' }[];
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.cijfers}>
      {cijfers.map((c) => (
        <View key={c.label} style={[styles.cijfer, dsShadow]}>
          <Text style={styles.cijferLabel} numberOfLines={1}>
            {c.label}
          </Text>
          <Text
            style={[
              styles.cijferWaarde,
              c.toon === 'goed' && { color: t.green700 },
              c.toon === 'slecht' && { color: t.statusRejectFg },
            ]}
            numberOfLines={1}
          >
            {c.waarde}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Kleine statuspil rechts in een rij. */
export function KaartPil({ tekst, toon = 'neutraal' }: { tekst: string; toon?: 'neutraal' | 'goed' | 'let-op' }) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View
      style={[
        styles.pil,
        toon === 'goed' && { backgroundColor: t.green50 },
        toon === 'let-op' && { backgroundColor: t.statusRejectBg ?? t.bg },
      ]}
    >
      <Text
        style={[
          styles.pilTekst,
          toon === 'goed' && { color: t.green700 },
          toon === 'let-op' && { color: t.statusRejectFg },
        ]}
        numberOfLines={1}
      >
        {tekst}
      </Text>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    blok: { paddingHorizontal: 16, paddingTop: 18 },
    kop: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 },
    kopTitel: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    titel: { fontSize: 16, fontWeight: '700', color: t.ink },
    aantal: { fontSize: 13, fontWeight: '700', color: t.muted2 },
    plus: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    tekstKnop: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
    tekstKnopTekst: { fontSize: 13, fontWeight: '700', color: t.green700 },
    kaart: { backgroundColor: t.card, borderRadius: ds.rMd, overflow: 'hidden' },
    rij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      minHeight: 52,
    },
    rijRand: { borderTopWidth: 1, borderTopColor: t.line },
    rijTitel: { fontSize: 14.5, fontWeight: '700', color: t.ink, letterSpacing: -0.2 },
    rijSub: { fontSize: 12.5, color: t.muted, marginTop: 2, lineHeight: 17 },
    leeg: { fontSize: 13, color: t.muted, textAlign: 'center', padding: 18 },
    gegevensRij: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 13,
      minHeight: 48,
      gap: 12,
    },
    gegevensLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: t.muted,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    gegevensWaarde: { flex: 1, fontSize: 14.5, fontWeight: '600', color: t.ink, textAlign: 'right' },
    cijfers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
    cijfer: {
      flexGrow: 1,
      flexBasis: 140,
      backgroundColor: t.card,
      borderRadius: ds.rMd,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    cijferLabel: { fontSize: 12, fontWeight: '700', color: t.muted },
    cijferWaarde: { fontSize: 18, fontWeight: '800', color: t.ink, marginTop: 4, letterSpacing: -0.4 },
    pil: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.bg },
    pilTekst: { fontSize: 11.5, fontWeight: '700', color: t.muted },
  });
