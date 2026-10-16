import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { TimeField } from '@/components/DateField';
import { useTheme } from '@/providers';
import { vandaagIso } from '@/lib/nlTijd';
import {
  geplandeDatums,
  korteDatum,
  maandNaam,
  maandRaster,
  ploegInFormulier,
  tijdenVerschillen,
  tijdVanDag,
  tijdVoorAlleDagen,
  wisselPersoonOpDag,
  type Planning,
} from '@/lib/werkbonLogica';
import { ds, spacing, type ThemeColors } from '@/theme';

/**
 * De dagen van een werkbon (WerkbonDagenVelden van het dashboard), gedeeld
 * door het werkbonformulier en het inplannen op de planning:
 *
 * - `WerkbonKalender`: maandkalender, maandag eerst; tik = dag aan/uit.
 * - `DagKaarten`: per gekozen dag een begin- en eindtijd, "tijd voor alle
 *   dagen", en met meer dan één persoon de dagploeg (wie werkt die dag).
 */
export function WerkbonKalender({
  gekozen,
  onTik,
  uit,
}: {
  gekozen: string[];
  onTik: (iso: string) => void;
  uit: boolean;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const start = gekozen[0] ?? vandaagIso();
  const [maand, setMaand] = useState(() => ({ jaar: Number(start.slice(0, 4)), maand: Number(start.slice(5, 7)) - 1 }));
  const vandaag = vandaagIso();
  const vakjes = maandRaster(maand.jaar, maand.maand);
  const schuif = (n: number) =>
    setMaand((m) => {
      const d = new Date(m.jaar, m.maand + n, 1);
      return { jaar: d.getFullYear(), maand: d.getMonth() };
    });
  return (
    <View style={styles.kalender}>
      <View style={styles.kalKop}>
        <Pressable accessibilityRole="button" onPress={() => schuif(-1)} accessibilityLabel="Vorige maand" style={styles.kalNav}>
          <ChevronLeft size={20} color={t.ink2} />
        </Pressable>
        <Text style={styles.kalTitel}>{maandNaam(maand.jaar, maand.maand)}</Text>
        <Pressable accessibilityRole="button" onPress={() => schuif(1)} accessibilityLabel="Volgende maand" style={styles.kalNav}>
          <ChevronRight size={20} color={t.ink2} />
        </Pressable>
      </View>
      <View style={styles.kalRaster}>
        {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((d) => (
          <Text key={d} style={styles.kalDagnaam}>
            {d}
          </Text>
        ))}
        {vakjes.map((iso, i) =>
          iso ? (
            <Pressable
              key={iso}
              onPress={() => onTik(iso)}
              disabled={uit}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: gekozen.includes(iso), disabled: uit }}
              aria-checked={gekozen.includes(iso)}
              accessibilityLabel={korteDatum(iso)}
              style={styles.kalVak}
            >
              <View
                style={[
                  styles.kalCirkel,
                  iso === vandaag && styles.kalVandaag,
                  gekozen.includes(iso) && styles.kalGekozen,
                ]}
              >
                <Text style={[styles.kalCijfer, gekozen.includes(iso) && { color: ds.greenInk, fontWeight: '800' }]}>
                  {Number(iso.slice(8, 10))}
                </Text>
              </View>
            </Pressable>
          ) : (
            <View key={`leeg-${i}`} style={styles.kalVak} />
          ),
        )}
      </View>
    </View>
  );
}

export function DagKaarten({
  planning,
  onChange,
  uitvoerders,
  naam,
  bewerkbaar,
  leegTekst = 'Geen dagen gekozen: de werkbon staat nog niet ingepland.',
}: {
  planning: Planning;
  onChange: (p: (vorige: Planning) => Planning) => void;
  uitvoerders: string[];
  naam: (id: string) => string;
  bewerkbaar: boolean;
  leegTekst?: string;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const datums = geplandeDatums(planning);
  const standaard = datums.length ? tijdVanDag(planning, datums[0]!) : { starttijd: '', eindtijd: '' };

  const zetDagTijd = (iso: string, veld: 'starttijd' | 'eindtijd', waarde: string) =>
    onChange((p) => ({
      ...p,
      tijden: { ...p.tijden, [iso]: { ...tijdVanDag(p, iso, standaard), [veld]: waarde } },
    }));

  if (!datums.length) return <Text style={styles.hint}>{leegTekst}</Text>;

  return (
    <View style={{ gap: spacing.md }}>
      {tijdenVerschillen(planning) && bewerkbaar ? (
        <Pressable onPress={() => onChange((p) => tijdVoorAlleDagen(p))} accessibilityRole="button" style={styles.linkKnop}>
          <Text style={styles.linkTekst}>Tijd van {korteDatum(datums[0])} voor alle dagen</Text>
        </Pressable>
      ) : null}
      {datums.map((iso) => {
        const tijd = tijdVanDag(planning, iso);
        const dagploeg = ploegInFormulier(planning, iso, uitvoerders);
        return (
          <View key={iso} style={styles.dagKaart}>
            <Text style={styles.dagTitel}>{korteDatum(iso)}</Text>
            <View style={styles.tijdRij}>
              <View style={{ flex: 1 }}>
                <TimeField
                  label="Begin"
                  value={tijd.starttijd || null}
                  onChange={(v) => zetDagTijd(iso, 'starttijd', v)}
                  disabled={!bewerkbaar}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TimeField
                  label="Eind"
                  value={tijd.eindtijd || null}
                  onChange={(v) => zetDagTijd(iso, 'eindtijd', v)}
                  disabled={!bewerkbaar}
                />
              </View>
            </View>
            {uitvoerders.length > 1 ? (
              <View style={styles.chipRij}>
                {uitvoerders.map((pid) => {
                  const aan = dagploeg.includes(pid);
                  const eigen = planning.persoonTijden?.[iso]?.[pid];
                  return (
                    <Pressable
                      key={pid}
                      disabled={!bewerkbaar}
                      onPress={() => onChange((p) => wisselPersoonOpDag(p, iso, pid, uitvoerders))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: aan }}
                      aria-checked={aan}
                      accessibilityLabel={`${naam(pid)} op ${korteDatum(iso)}`}
                      style={[styles.chip, aan ? styles.chipAan : styles.chipUit]}
                    >
                      <Text style={[styles.chipTekst, aan && { color: t.green700 }, !aan && styles.doorgestreept]}>
                        {naam(pid)}
                        {aan && eigen?.starttijd ? ` · ${eigen.starttijd}–${eigen.eindtijd}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    hint: { fontSize: 12.5, lineHeight: 18, color: t.muted },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
    },
    chipAan: { backgroundColor: t.green50, borderColor: ds.green },
    chipUit: { opacity: 0.7 },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    doorgestreept: { textDecorationLine: 'line-through' },
    linkKnop: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    linkTekst: { fontSize: 13, fontWeight: '700', color: ds.green700 },
    dagKaart: {
      backgroundColor: t.card,
      borderRadius: t.rMd,
      borderWidth: 1,
      borderColor: t.line,
      padding: spacing.md,
      gap: spacing.sm,
    },
    dagTitel: { fontSize: 14, fontWeight: '700', color: t.ink },
    tijdRij: { flexDirection: 'row', gap: spacing.md },
    kalender: {
      backgroundColor: t.card,
      borderRadius: t.rMd,
      borderWidth: 1,
      borderColor: t.line,
      padding: spacing.sm,
    },
    kalKop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    kalNav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    kalTitel: { fontSize: 14.5, fontWeight: '700', color: t.ink, textTransform: 'capitalize' },
    kalRaster: { flexDirection: 'row', flexWrap: 'wrap' },
    kalDagnaam: {
      width: `${100 / 7}%`,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      color: t.muted2,
      paddingVertical: 4,
    },
    kalVak: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
    kalCirkel: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    kalVandaag: { borderWidth: 1.5, borderColor: ds.green },
    kalGekozen: { backgroundColor: ds.green },
    kalCijfer: { fontSize: 14, color: t.ink, fontVariant: ['tabular-nums'] },
  });
