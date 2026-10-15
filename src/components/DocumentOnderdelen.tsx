import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/providers';
import { formatEURCent } from '@/lib/format';
import { radius, spacing, type ThemeColors } from '@/theme';
import type { StatusToon } from '@/lib/documentLogica';

/**
 * Bouwstenen voor de detailweergave van offertes en facturen (en de tegels
 * van Kosten): statusbadge in de zes tonen van het dashboard, een rij
 * label/waarde, de regellijst, het totalenblok en een KPI-raster.
 * Kleuren komen uit het thema, zodat alles in dark mode meekleurt.
 */

export function toonKleuren(t: ThemeColors, toon: StatusToon): { bg: string; fg: string } {
  switch (toon) {
    case 'blue':
      return { bg: t.statusSubmitBg, fg: t.statusSubmitFg };
    case 'green':
      return { bg: t.statusApproveBg, fg: t.statusApproveFg };
    case 'red':
      return { bg: t.statusRejectBg, fg: t.statusRejectFg };
    case 'orange':
      return { bg: t.statusWarnBg, fg: t.statusWarnFg };
    case 'purple':
      return { bg: t.statusInfoBg, fg: t.statusInfoFg };
    default:
      return { bg: t.statusDraftBg, fg: t.statusDraftFg };
  }
}

export function DocumentStatusBadge({ toon, label }: { toon: StatusToon; label: string }) {
  const { colors: t } = useTheme();
  const k = toonKleuren(t, toon);
  return (
    <View style={[badge.base, { backgroundColor: k.bg }]}>
      <View style={[badge.dot, { backgroundColor: k.fg }]} />
      <Text style={[badge.text, { color: k.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const badge = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-end',
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11.5, fontWeight: '600' },
});

export function DetailRij({
  label,
  waarde,
  toon,
}: {
  label: string;
  waarde: ReactNode;
  /** 'rood' voor een verstreken datum. */
  toon?: 'rood';
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.rij}>
      <Text style={styles.rijLabel}>{label}</Text>
      {typeof waarde === 'string' || typeof waarde === 'number' ? (
        <Text style={[styles.rijWaarde, toon === 'rood' && { color: t.statusRejectFg }]}>
          {waarde}
        </Text>
      ) : (
        waarde
      )}
    </View>
  );
}

export type WeergaveRegel = {
  id: string;
  omschrijving: string;
  meta: string;
  bedrag: number;
};

export function RegelLijst({
  regels,
  laden,
  leegTekst,
}: {
  regels: WeergaveRegel[];
  laden: boolean;
  leegTekst: string;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  if (laden) return <Text style={styles.zacht}>Regels laden…</Text>;
  if (regels.length === 0) return <Text style={styles.zacht}>{leegTekst}</Text>;
  return (
    <View style={styles.regels}>
      {regels.map((r, i) => (
        <View key={r.id} style={[styles.regel, i > 0 && styles.regelLijn]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.regelTitel}>{r.omschrijving}</Text>
            <Text style={styles.zacht}>{r.meta}</Text>
          </View>
          <Text style={styles.bedrag}>{formatEURCent(r.bedrag)}</Text>
        </View>
      ))}
    </View>
  );
}

export function TotalenBlok({
  excl,
  btwPerTarief,
  incl,
}: {
  excl: number;
  btwPerTarief: { pct: number; bedrag: number }[];
  incl: number;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.totalen}>
      <View style={styles.totaalRij}>
        <Text style={styles.zacht}>Subtotaal excl. BTW</Text>
        <Text style={styles.totaalBedrag}>{formatEURCent(excl)}</Text>
      </View>
      {btwPerTarief.map((b) => (
        <View key={b.pct} style={styles.totaalRij}>
          <Text style={styles.zacht}>BTW {b.pct}%</Text>
          <Text style={styles.totaalBedrag}>{formatEURCent(b.bedrag)}</Text>
        </View>
      ))}
      <View style={[styles.totaalRij, styles.totaalEind]}>
        <Text style={styles.eindLabel}>Totaal incl. BTW</Text>
        <Text style={styles.eindBedrag}>{formatEURCent(incl)}</Text>
      </View>
    </View>
  );
}

/** Een tegel van het KPI-raster: label, waarde en een optionele toelichting. */
/** `toon: 'goed'` = groen getal, voor wat positief is (geaccepteerd, betaald); `'slecht'` = rood (een negatief saldo). */
export type Tegel = { id: string; label: string; waarde: string; uitleg?: string; toon?: 'goed' | 'slecht' };

/**
 * KPI-raster: twee kolommen op een telefoon, alles op één rij vanaf tabletbreedte
 * (zoals de `stats-row` van het dashboard).
 */
export function TegelRaster({ tegels, breed }: { tegels: Tegel[]; breed: boolean }) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={styles.raster}>
      {tegels.map((tg) => (
        <View
          key={tg.id}
          style={[styles.tegel, breed ? { flexBasis: 0, flexGrow: 1 } : { width: '48%', flexGrow: 1 }]}
          accessible
          accessibilityLabel={`${tg.label}: ${tg.waarde}${tg.uitleg ? `. ${tg.uitleg}` : ''}`}
        >
          <Text style={styles.tegelLabel} numberOfLines={2}>
            {tg.label}
          </Text>
          <Text
            style={[
              styles.tegelWaarde,
              tg.toon === 'goed' && { color: t.green700 },
              tg.toon === 'slecht' && { color: t.statusRejectFg },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {tg.waarde}
          </Text>
          {tg.uitleg ? (
            <Text style={[styles.tegelUitleg, tg.toon === 'goed' && { color: t.green700 }]} numberOfLines={2}>
              {tg.uitleg}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    rij: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: 7,
    },
    rijLabel: { fontSize: 13.5, color: t.muted },
    rijWaarde: { fontSize: 14, fontWeight: '600', color: t.ink, textAlign: 'right', flexShrink: 1 },
    zacht: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    regels: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
      paddingHorizontal: spacing.md,
    },
    regel: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
    regelLijn: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    regelTitel: { fontSize: 14, fontWeight: '600', color: t.ink },
    bedrag: { fontSize: 14, fontWeight: '700', color: t.ink2 },
    totalen: { gap: 4, paddingTop: spacing.sm },
    totaalRij: { flexDirection: 'row', justifyContent: 'space-between' },
    totaalBedrag: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    totaalEind: {
      marginTop: 4,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: t.line,
    },
    eindLabel: { fontSize: 15, fontWeight: '800', color: t.ink },
    eindBedrag: { fontSize: 15, fontWeight: '800', color: t.ink },
    raster: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    tegel: {
      minWidth: 140,
      backgroundColor: t.card,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    tegelLabel: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      color: t.muted2,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    tegelWaarde: { marginTop: 4, fontSize: 20, fontWeight: '800', color: t.ink },
    tegelUitleg: { marginTop: 2, fontSize: 11.5, lineHeight: 15, color: t.muted },
  });
