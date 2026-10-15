import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Star } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { ds, type ThemeColors } from '@/theme';

export type PloegLid = { id: string; full_name: string | null; role?: string | null };

/**
 * Wie staat er op de klus: aanvinken = uitvoerder, de ster = verantwoordelijk
 * (die mag de bon bewerken en is het aanspreekpunt). Verantwoordelijk zonder
 * uitvoerder bestaat niet: de ster vinkt iemand ook aan, en uitvinken haalt de
 * ster weg — zoals `verantwoordelijke_ids ⊆ assigned_to_ids` in de database.
 *
 * Gebruikt door het werkbonformulier en het inplannen op de planning.
 */
export function PloegKeuze({
  team,
  uitvoerders,
  verantwoordelijken,
  onChange,
  eigenId,
}: {
  team: PloegLid[];
  uitvoerders: string[];
  verantwoordelijken: string[];
  onChange: (v: { uitvoerders: string[]; verantwoordelijken: string[] }) => void;
  eigenId?: string | null;
}) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);

  const wisselUitvoerder = (id: string) => {
    if (uitvoerders.includes(id)) {
      onChange({ uitvoerders: uitvoerders.filter((x) => x !== id), verantwoordelijken: verantwoordelijken.filter((x) => x !== id) });
    } else {
      onChange({ uitvoerders: [...uitvoerders, id], verantwoordelijken });
    }
  };
  const wisselVerantwoordelijke = (id: string) => {
    if (!uitvoerders.includes(id)) {
      onChange({ uitvoerders: [...uitvoerders, id], verantwoordelijken: [...verantwoordelijken, id] });
      return;
    }
    onChange({
      uitvoerders,
      verantwoordelijken: verantwoordelijken.includes(id)
        ? verantwoordelijken.filter((x) => x !== id)
        : [...verantwoordelijken, id],
    });
  };

  return (
    <View style={styles.picker}>
      {team.map((c, i) => {
        const aan = uitvoerders.includes(c.id);
        const verantw = verantwoordelijken.includes(c.id);
        return (
          <View key={c.id} style={[styles.rij, i > 0 && styles.rijRand, aan && styles.rijAan]}>
            <Pressable
              onPress={() => wisselUitvoerder(c.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: aan }}
              aria-checked={aan}
              accessibilityLabel={c.full_name ?? 'Medewerker'}
              style={styles.rijHoofd}
            >
              <View style={[styles.vink, aan && styles.vinkAan]}>
                {aan ? <Check size={14} color={ds.greenInk} strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rijTitel} numberOfLines={1}>
                  {c.full_name ?? 'Naamloos'}
                  {c.id === eigenId ? ' (ikzelf)' : ''}
                </Text>
                <Text style={styles.rijSub} numberOfLines={1}>
                  {verantw ? 'Verantwoordelijk' : aan ? 'Uitvoerder' : (c.role ?? '')}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => wisselVerantwoordelijke(c.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: verantw }}
              aria-checked={verantw}
              accessibilityLabel={`${c.full_name ?? 'Medewerker'} verantwoordelijk`}
              hitSlop={6}
              style={styles.sterKnop}
            >
              <Star size={20} color={verantw ? '#e8a23a' : t.muted2} fill={verantw ? '#e8a23a' : 'transparent'} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    picker: {
      backgroundColor: t.card,
      borderRadius: t.rMd,
      borderWidth: 1,
      borderColor: t.line,
      overflow: 'hidden',
    },
    rij: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
    rijHoofd: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, minHeight: 48 },
    rijRand: { borderTopWidth: 1, borderTopColor: t.line },
    rijAan: { backgroundColor: t.green50 },
    rijTitel: { fontSize: 14.5, fontWeight: '600', color: t.ink },
    rijSub: { fontSize: 12, color: t.muted, marginTop: 1 },
    vink: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: t.muted2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vinkAan: { backgroundColor: ds.green, borderColor: ds.green },
    sterKnop: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  });
