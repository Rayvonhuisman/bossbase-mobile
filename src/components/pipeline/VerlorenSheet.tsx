import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField } from '@/components/FormField';
import { FormSheet } from '@/components/FormSheet';
import { useTheme } from '@/providers';
import { useSave } from '@/lib/useSave';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import { listLostReasons, markDealLost, type DealRow } from '@/services/dealService';

/**
 * "Markeer als verloren" — de `VerlorenModal` van het dashboard: verplichte
 * reden (uit `lost_reasons`), optionele toelichting. Zonder Verloren-fase
 * kan het niet en zegt het formulier dat eerlijk.
 */
export function VerlorenSheet({
  deal,
  verlorenFaseId,
  onClose,
  onSaved,
}: {
  deal: Pick<DealRow, 'id' | 'title'> | null;
  verlorenFaseId: string | null;
  onClose: () => void;
  onSaved: (bij: DealRow) => void;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { save, saving, error, setError } = useSave<DealRow>();
  const [redenen, setRedenen] = useState<string[]>([]);
  const [reden, setReden] = useState<string | null>(null);
  const [toelichting, setToelichting] = useState('');

  useEffect(() => {
    if (!deal) return;
    let leeft = true;
    listLostReasons().then((r) => leeft && setRedenen(r.data));
    return () => {
      leeft = false;
    };
  }, [deal]);

  useEffect(() => {
    // Elke keer dat het venster voor een andere deal opent: schoon beginnen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReden(null);
    setToelichting('');
    setError(null);
  }, [deal, setError]);

  const opslaan = () => {
    if (!deal) return;
    save(() => markDealLost(deal.id, verlorenFaseId, reden, toelichting), {
      onSuccess: (bij) => {
        onSaved(bij);
        onClose();
      },
      succesMelding: 'Gemarkeerd als verloren',
    });
  };

  return (
    <FormSheet
      visible={deal !== null}
      title="Markeer als verloren"
      subtitle={deal?.title ?? undefined}
      error={error ?? (verlorenFaseId ? null : 'Geen "Verloren"-fase gevonden in de pipeline')}
      saving={saving}
      submitLabel="Markeer als verloren"
      submitDisabled={!reden || !verlorenFaseId}
      onSubmit={opslaan}
      onClose={onClose}
    >
      <View style={{ gap: spacing.xs }}>
        <Text style={styles.label}>Reden</Text>
        <View style={styles.rij}>
          {redenen.map((r) => {
            const aan = reden === r;
            return (
              <Pressable
                key={r}
                onPress={() => setReden(r)}
                accessibilityRole="radio"
                accessibilityState={{ selected: aan }}
                aria-checked={aan}
                style={[styles.chip, aan && styles.chipAan]}
              >
                <Text style={[styles.chipTekst, aan && styles.chipTekstAan]}>{r}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <FormField
        label="Toelichting"
        value={toelichting}
        onChangeText={setToelichting}
        placeholder="Optioneel"
        multiline
      />
    </FormSheet>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    label: { ...typography.label, color: t.ink2 },
    rij: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    chipAan: { backgroundColor: t.green50, borderColor: t.green600 },
    chipTekst: { fontSize: 13.5, fontWeight: '600', color: t.ink2 },
    chipTekstAan: { color: t.green700 },
  });
