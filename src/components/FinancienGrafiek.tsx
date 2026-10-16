import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/providers';
import { formatDateNL, formatEURCent } from '@/lib/format';
import { asLabel, grafiekSchaal, type GrafiekModus, type GrafiekPeriode, type Staaf } from '@/lib/financienLogica';
import type { ThemeColors } from '@/theme';

const HOOGTE = 180;
const AS_BREEDTE = 44;

/**
 * De staafgrafiek van Financiën, zoals `FinancienGrafiek.jsx` van het dashboard
 * (recharts): één reeks, groen voor gefactureerd en ontvangen, rood voor
 * kosten, as in duizenden. Gebouwd met Views — de app heeft geen
 * grafiekbibliotheek. Een tik op een staaf toont het bedrag (de tooltip van
 * het dashboard). Een negatieve staaf (een creditnota die zwaarder weegt dan
 * de facturen van die dag) loopt onder de nullijn.
 */
export function FinancienGrafiek({
  staven,
  modus,
  periode,
  modusLabel,
}: {
  staven: Staaf[];
  modus: GrafiekModus;
  periode: GrafiekPeriode;
  modusLabel: string;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [gekozen, setGekozen] = useState<number | null>(null);

  const waarden = staven.map((s) => s[modus]);
  const { max, min } = grafiekSchaal(waarden);
  const bereik = max - min || 1;
  const nulVanaf = (max / bereik) * HOOGTE;
  const kleur = modus === 'kosten' ? t.statusRejectFg : t.green;
  // Zoals `interval` van het dashboard: bij 30 dagen elk vijfde label. Bij 13
  // weken past op een telefoon niet elk label; om de week.
  const stap = periode === 'maand' ? 5 : periode === 'kwartaal' ? 2 : 1;

  const sel = gekozen != null ? staven[gekozen] : null;
  const totaal = waarden.reduce((s, v) => s + v, 0);
  const selLabel = sel
    ? sel.van === sel.tot
      ? formatDateNL(sel.van)
      : `${formatDateNL(sel.van)} – ${formatDateNL(sel.tot)}`
    : '';

  return (
    <View>
      <View style={styles.uitleesRij} accessibilityLiveRegion="polite">
        <Text style={styles.uitleesLabel} numberOfLines={1}>
          {sel ? selLabel : `Totaal · ${modusLabel}`}
        </Text>
        <Text style={[styles.uitleesWaarde, { color: modus === 'kosten' ? t.statusRejectFg : t.ink }]}>
          {formatEURCent(sel ? sel[modus] : totaal)}
        </Text>
      </View>

      <View style={styles.vlak}>
        <View style={styles.as}>
          <Text style={[styles.asTekst, { top: 0 }]}>{asLabel(max)}</Text>
          {min < 0 ? (
            <>
              <Text style={[styles.asTekst, { top: nulVanaf - 6 }]}>€0</Text>
              <Text style={[styles.asTekst, { top: HOOGTE - 12 }]}>{asLabel(min)}</Text>
            </>
          ) : (
            <Text style={[styles.asTekst, { top: HOOGTE - 12 }]}>€0</Text>
          )}
        </View>
        <View style={styles.staven}>
          <View style={[styles.lijn, { top: 0 }]} />
          <View style={[styles.lijn, { top: HOOGTE / 2 }]} />
          <View style={[styles.lijn, styles.nulLijn, { top: nulVanaf }]} />
          {staven.map((s, i) => {
            const v = s[modus];
            const h = (Math.abs(v) / bereik) * HOOGTE;
            const actief = gekozen === i;
            return (
              <Pressable
                key={`${s.van}-${i}`}
                onPress={() => setGekozen(actief ? null : i)}
                accessibilityRole="button"
                accessibilityLabel={`${s.label}: ${formatEURCent(v)}`}
                style={[styles.kolom, actief && { backgroundColor: t.bgAlt }]}
              >
                <View
                  style={[
                    styles.staaf,
                    {
                      height: Math.max(v !== 0 ? 2 : 0, h),
                      backgroundColor: kleur,
                      opacity: gekozen == null || actief ? 1 : 0.45,
                    },
                    v >= 0
                      ? { top: nulVanaf - h, borderTopLeftRadius: 4, borderTopRightRadius: 4 }
                      : { top: nulVanaf, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
      {/* Labels los gepositioneerd onder het midden van hun staaf: bij 30
          smalle staven past een label niet in de staafbreedte zelf. */}
      <View style={styles.labels}>
        <View style={styles.labelVlak}>
          {staven.map((s, i) =>
            i % stap === 0 ? (
              <Text
                key={`${s.van}-l`}
                style={[styles.label, { left: `${((i + 0.5) / staven.length) * 100}%` }]}
                numberOfLines={1}
              >
                {s.label}
              </Text>
            ) : null,
          )}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    uitleesRij: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
      paddingBottom: 10,
    },
    uitleesLabel: { flex: 1, fontSize: 12.5, color: t.muted },
    uitleesWaarde: { fontSize: 15, fontWeight: '800' },
    vlak: { flexDirection: 'row', height: HOOGTE },
    as: { width: AS_BREEDTE, height: HOOGTE },
    asTekst: { position: 'absolute', left: 0, fontSize: 10.5, color: t.muted2 },
    staven: { flex: 1, flexDirection: 'row', height: HOOGTE, gap: 2 },
    lijn: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.line },
    nulLijn: { backgroundColor: t.lineStrong },
    kolom: { flex: 1, height: HOOGTE, alignItems: 'center', borderRadius: 4 },
    staaf: { position: 'absolute', width: '80%', maxWidth: 32 },
    labels: { paddingLeft: AS_BREEDTE, marginTop: 6, height: 14 },
    labelVlak: { flex: 1 },
    label: { position: 'absolute', width: 44, marginLeft: -22, fontSize: 10, color: t.muted2, textAlign: 'center' },
  });
