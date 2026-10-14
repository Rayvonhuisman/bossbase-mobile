import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '@/providers';
import { dsShadow, radius, spacing, typography, type ThemeColors } from '@/theme';

/**
 * Kleine bouwstenen voor de tabs van Instellingen: een kaart zoals de
 * `card card-p` van het dashboard, een keuzerij (chips) in plaats van een
 * `<select>`, en een schakelregel. Kleuren komen uit het thema; een gekozen
 * chip is massief merkgroen met zwarte tekst, leesbaar in licht én donker.
 */

export function Kaart({
  titel,
  sub,
  children,
  rechts,
}: {
  titel?: string;
  sub?: string;
  children: ReactNode;
  rechts?: ReactNode;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => maakStijl(t), [t]);
  return (
    <View style={[s.kaart, dsShadow]}>
      {titel ? (
        <View style={s.kop}>
          <View style={{ flex: 1 }}>
            <Text style={s.titel}>{titel}</Text>
            {sub ? <Text style={s.sub}>{sub}</Text> : null}
          </View>
          {rechts}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Keuze({
  label,
  opties,
  waarde,
  onKies,
  uitgeschakeld,
  hint,
}: {
  label?: string;
  opties: { id: string; label: string }[];
  waarde: string | null;
  onKies: (id: string) => void;
  uitgeschakeld?: boolean;
  hint?: string;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => maakStijl(t), [t]);
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.chipRij}>
        {opties.map((o) => {
          const actief = waarde === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => onKies(o.id)}
              disabled={uitgeschakeld}
              accessibilityRole="button"
              accessibilityState={{ selected: actief, disabled: uitgeschakeld }}
              aria-pressed={actief}
              style={({ pressed }) => [
                s.chip,
                actief && s.chipActief,
                uitgeschakeld && s.uit,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[s.chipTekst, actief && s.chipTekstActief]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Schakel({
  titel,
  uitleg,
  waarde,
  onWissel,
  uitgeschakeld,
}: {
  titel: string;
  uitleg?: string;
  waarde: boolean;
  onWissel: (v: boolean) => void;
  uitgeschakeld?: boolean;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => maakStijl(t), [t]);
  return (
    <View style={s.schakel}>
      <View style={{ flex: 1 }}>
        <Text style={s.schakelTitel}>{titel}</Text>
        {uitleg ? <Text style={s.hint}>{uitleg}</Text> : null}
      </View>
      <Switch
        value={waarde}
        onValueChange={onWissel}
        disabled={uitgeschakeld}
        accessibilityLabel={titel}
      />
    </View>
  );
}

/** Label + waarde onder elkaar, voor alleen-lezen velden. */
export function Gegeven({ label, waarde }: { label: string; waarde: string }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => maakStijl(t), [t]);
  return (
    <View style={{ gap: 2 }}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.waarde}>{waarde || '—'}</Text>
    </View>
  );
}

export function Uitleg({ children, toon = 'neutraal' }: { children: ReactNode; toon?: 'neutraal' | 'waarschuwing' | 'fout' | 'goed' }) {
  const { colors: t } = useTheme();
  const s = useMemo(() => maakStijl(t), [t]);
  const kleur =
    toon === 'waarschuwing'
      ? { bg: t.statusWarnBg, fg: t.statusWarnFg }
      : toon === 'fout'
        ? { bg: t.statusRejectBg, fg: t.statusRejectFg }
        : toon === 'goed'
          ? { bg: t.statusApproveBg, fg: t.statusApproveFg }
          : { bg: t.bgAlt, fg: t.ink2 };
  return (
    <View style={[s.uitleg, { backgroundColor: kleur.bg }]}>
      <Text style={[s.uitlegTekst, { color: kleur.fg }]}>{children}</Text>
    </View>
  );
}

export const stijlVoorInstellingen = (t: ThemeColors) => maakStijl(t);

const maakStijl = (t: ThemeColors) =>
  StyleSheet.create({
    kaart: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      padding: spacing.lg,
      gap: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
    },
    kop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    titel: { fontSize: 16, fontWeight: '700', color: t.ink },
    sub: { fontSize: 12.5, lineHeight: 18, color: t.muted, marginTop: 2 },
    label: { ...typography.label, color: t.muted2 },
    waarde: { fontSize: 15, color: t.ink },
    hint: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.lineStrong,
    },
    chipActief: { backgroundColor: t.green, borderColor: t.green },
    chipTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    chipTekstActief: { color: t.greenInk },
    uit: { opacity: 0.55 },
    schakel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 44,
    },
    schakelTitel: { fontSize: 14.5, fontWeight: '600', color: t.ink },
    uitleg: { padding: spacing.md, borderRadius: radius.md },
    uitlegTekst: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
    rij: { flexDirection: 'row', gap: spacing.md },
    knoppen: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    lijstRij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      paddingVertical: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.line,
    },
    lijstTitel: { fontSize: 14.5, fontWeight: '600', color: t.ink },
    lijstSub: { fontSize: 12.5, color: t.muted, marginTop: 1 },
    stip: { width: 14, height: 14, borderRadius: 4 },
    iconKnop: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 22,
    },
  });
