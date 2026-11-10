import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { FormSheet } from '@/components/FormSheet';
import { useTheme } from '@/providers';
import { offerteLabel, type OfferteBron } from '@/lib/werkbonUitOfferte';
import { ds, radius, spacing, typography, type ThemeColors } from '@/theme';

/**
 * "Overnemen uit offerte" (`OfferteOvernemenVenster` in het dashboard): de
 * regels van een geaccepteerde offerte als taken op de werkbon. Welke regel
 * wat wordt staat in lib/werkbonUitOfferte; de database doet het echte werk
 * (`bb_werkbon_taken_uit_offerte`) en zet nooit een taak dubbel.
 *
 * Materiaal gaat hier niet mee: dat staat als keuzelijst bij Materialen en
 * komt pas op de werkbon als het gebruikt is.
 */
export function OfferteOvernemen({
  offertes,
  onSluit,
  onOvernemen,
}: {
  offertes: OfferteBron[];
  onSluit: () => void;
  /** Geeft een foutmelding terug, of null als het gelukt is. */
  onOvernemen: (offerte: OfferteBron, regelIds: string[]) => Promise<string | null>;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [offerteId, setOfferteId] = useState(offertes[0]?.id ?? '');
  const offerte = offertes.find((o) => o.id === offerteId) ?? null;
  const [gekozen, setGekozen] = useState<Set<string>>(
    () => new Set((offertes[0]?.taken ?? []).filter((x) => x.standaard).map((x) => x.id)),
  );
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const kiesOfferte = (id: string) => {
    setOfferteId(id);
    const o = offertes.find((x) => x.id === id);
    setGekozen(new Set((o?.taken ?? []).filter((x) => x.standaard).map((x) => x.id)));
  };
  const wissel = (id: string) =>
    setGekozen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const nieuw = (offerte?.taken ?? []).filter((x) => !x.alAanwezig && gekozen.has(x.id));

  const overnemen = async () => {
    if (!offerte || !nieuw.length) return;
    setBezig(true);
    setFout(null);
    const f = await onOvernemen(offerte, nieuw.map((x) => x.id));
    setBezig(false);
    if (f) setFout(f);
  };

  return (
    <FormSheet
      visible
      title="Overnemen uit offerte"
      subtitle="Kies welke offerteregels een taak op deze werkbon worden."
      error={fout}
      saving={bezig}
      submitLabel={nieuw.length ? `${nieuw.length === 1 ? '1 taak' : `${nieuw.length} taken`} overnemen` : 'Niets gekozen'}
      submitDisabled={bezig || !nieuw.length}
      onSubmit={overnemen}
      onClose={onSluit}
    >
      {offertes.length > 1 ? (
        <View style={styles.chipRij}>
          {offertes.map((o) => {
            const aan = o.id === offerteId;
            return (
              <Pressable
                key={o.id}
                onPress={() => kiesOfferte(o.id)}
                disabled={bezig}
                accessibilityRole="radio"
                accessibilityState={{ selected: aan }}
                aria-checked={aan}
                style={[styles.chip, aan && styles.chipAan]}
              >
                <Text style={[styles.chipTekst, aan && { color: t.greenInk }]} numberOfLines={1}>
                  {offerteLabel(o)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : offerte ? (
        <Text style={styles.label}>{offerteLabel(offerte)}</Text>
      ) : null}

      {offerte && offerte.taken.length === 0 ? (
        <Text style={styles.hint}>Deze offerte heeft geen regels die een taak kunnen worden.</Text>
      ) : null}

      {offerte && offerte.taken.length > 0 ? (
        <View style={{ gap: 2 }}>
          {offerte.taken.map((x) => {
            const aan = x.alAanwezig || gekozen.has(x.id);
            const uit = x.alAanwezig || bezig;
            return (
              <Pressable
                key={x.id}
                onPress={() => wissel(x.id)}
                disabled={uit}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: aan, disabled: uit }}
                aria-checked={aan}
                accessibilityLabel={x.omschrijving}
                style={({ pressed }) => [styles.rij, x.alAanwezig && { opacity: 0.55 }, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.vink, aan && styles.vinkAan]}>
                  {aan ? <Check size={14} color={ds.greenInk} strokeWidth={3} /> : null}
                </View>
                <Text style={styles.rijTekst}>
                  {x.omschrijving}
                  {x.alAanwezig ? <Text style={styles.hint}> · staat er al</Text> : null}
                  {!x.alAanwezig && x.soort === 'uren' ? <Text style={styles.hint}> · arbeid</Text> : null}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {offerte && offerte.materialen.length > 0 ? (
        <Text style={styles.hint}>
          {offerte.materialen.length === 1 ? '1 materiaal' : `${offerte.materialen.length} materialen`} uit deze
          offerte {offerte.materialen.length === 1 ? 'staat' : 'staan'} klaar bij Materialen. Voeg ze daar toe als ze
          gebruikt zijn: materiaal op de werkbon telt meteen als werkelijke kosten.
        </Text>
      ) : null}
    </FormSheet>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    label: { ...typography.label, color: t.muted2 },
    hint: { ...typography.small, color: t.muted },
    chipRij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      minHeight: 40,
      maxWidth: '100%',
      paddingHorizontal: 13,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.card,
      justifyContent: 'center',
    },
    chipAan: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13, fontWeight: '600', color: t.ink2 },
    rij: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 44, paddingVertical: 10 },
    vink: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: t.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    vinkAan: { backgroundColor: ds.green, borderColor: ds.green },
    rijTekst: { flex: 1, fontSize: 15, lineHeight: 21, color: t.ink },
  });
