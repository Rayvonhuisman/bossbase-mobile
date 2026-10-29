/**
 * De ingang naar de Boss-werkruimte bovenaan een offerte- of factuurformulier:
 * één groene knop "Maak met Boss", en als er nog een concept van een eerder
 * gesloten werkruimte klaarstaat de keuze Verder gaan of Opnieuw beginnen.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/providers';
import { spacing, type ThemeColors } from '@/theme';
import { tijdVan, type BewaardConcept } from '@/lib/boss/werkruimteConcept';
import { BossAvatar } from '../BossChat';
import { Button } from '../Button';

export function BossIngang({
  soort, vorig, gebruikt, sub, onOpen, onVerder, onOpnieuw,
}: {
  soort: 'offerte' | 'factuur';
  vorig: BewaardConcept | null;
  gebruikt: boolean;
  sub: string;
  onOpen: () => void;
  onVerder: () => void;
  onOpnieuw: () => void;
}) {
  const { colors: t } = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <View style={{ gap: spacing.md }}>
      {vorig ? (
        <View style={s.herstel} accessibilityRole="alert">
          <Text style={s.herstelTekst}>
            Je was om {tijdVan(vorig.bewaardOp)} met Boss aan deze {soort} bezig. Het gesprek en het concept staan nog klaar.
          </Text>
          <View style={s.rij}>
            <Button label="Verder gaan" onPress={onVerder} style={{ flex: 1 }} />
            <Button label="Opnieuw beginnen" variant="secondary" onPress={onOpnieuw} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
      <Pressable
        onPress={vorig ? onVerder : onOpen}
        accessibilityRole="button"
        accessibilityHint="Opent de werkruimte met het document en het gesprek met Boss"
        style={({ pressed }) => [s.knop, pressed && { opacity: 0.85 }]}
      >
        <BossAvatar size={36} />
        <View style={{ flex: 1 }}>
          <Text style={s.titel}>Maak met Boss</Text>
          <Text style={s.sub}>{gebruikt || vorig ? 'Je gesprek is bewaard' : sub}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    herstel: { backgroundColor: t.statusSubmitBg, borderRadius: t.rMd, padding: spacing.md, gap: spacing.md },
    herstelTekst: { fontSize: 14, lineHeight: 20, color: t.statusSubmitFg },
    rij: { flexDirection: 'row', gap: spacing.sm },
    knop: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.green50, borderRadius: t.rMd, padding: 12 },
    titel: { fontSize: 15, fontWeight: '600', color: t.ink },
    sub: { fontSize: 12.5, color: t.green700, marginTop: 1 },
  });
