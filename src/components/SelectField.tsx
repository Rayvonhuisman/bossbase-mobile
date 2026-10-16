import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import { radius, spacing, typography, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';
import { MobielKader } from './MobielKader';
import { ToetsenbordVlak } from './ToetsenbordVlak';
import { VelStatusbalk } from './VelStatusbalk';
import { useFocusTerug } from '@/lib/focusTerug';

export type SelectOption = {
  id: string;
  label: string;
  sub?: string;
};

type Props = {
  label: string;
  value: string | null;
  options: SelectOption[];
  onChange: (id: string | null) => void;
  placeholder?: string;
  /** Laat "Geen" toe als expliciete keuze. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  hint?: string;
  disabled?: boolean;
  /** Toont een zoekveld boven de lijst. Standaard aan vanaf 8 opties. */
  searchable?: boolean;
};

/**
 * Relatieveld: klant, project, deal, medewerker of werkbon kiezen.
 *
 * Bewust geen native picker. Die toont op iOS een wiel waarin je bij honderd
 * klanten eindeloos scrollt; dit is een lijst met een zoekveld, wat op een
 * telefoon in de bus het verschil is tussen wel en niet invullen.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Kies…',
  allowEmpty = false,
  emptyLabel = 'Geen',
  hint,
  disabled = false,
  searchable,
}: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [open, setOpen] = useState(false);
  useFocusTerug(open);
  const [zoek, setZoek] = useState('');

  const gekozen = options.find((o) => o.id === value) ?? null;
  const toonZoek = searchable ?? options.length >= 8;

  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sub ?? '').toLowerCase().includes(q),
    );
  }, [options, zoek]);

  const kies = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setZoek('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${gekozen?.label ?? placeholder}`}
        style={[styles.veld, disabled && styles.veldUit]}
      >
        <Text
          numberOfLines={1}
          style={[styles.veldTekst, !gekozen && { color: t.muted2 }]}
        >
          {gekozen?.label ?? placeholder}
        </Text>
        <ChevronDown size={18} color={t.muted} />
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <VelStatusbalk />
        {/* Op web staat de kiezer op telefoonbreedte, net als de app eronder. */}
        <MobielKader soort="formulier">
        {/* iOS: de onderste opties blijven boven het toetsenbord (zoekveld). */}
        <ToetsenbordVlak style={{ flex: 1, backgroundColor: t.bg }}>
          <View style={styles.kopBalk}>
            <Text style={styles.kopTitel}>{label}</Text>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Sluiten"
              style={styles.sluit}
            >
              <X size={20} color={t.ink2} />
            </Pressable>
          </View>

          {toonZoek ? (
            <View style={styles.zoekWrap}>
              <Search size={16} color={t.muted} />
              <TextInput
                value={zoek}
                onChangeText={setZoek}
                placeholder="Zoeken…"
                placeholderTextColor={t.muted2}
                style={styles.zoekInput}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
          ) : null}

          <FlatList
            data={zichtbaar}
            keyExtractor={(o) => o.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              allowEmpty ? (
                <Rij
                  label={emptyLabel}
                  gekozen={value === null}
                  onPress={() => kies(null)}
                  styles={styles}
                  t={t}
                />
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.leeg}>
                {zoek ? 'Niets gevonden.' : 'Er is nog niets om te kiezen.'}
              </Text>
            }
            renderItem={({ item }) => (
              <Rij
                label={item.label}
                sub={item.sub}
                gekozen={item.id === value}
                onPress={() => kies(item.id)}
                styles={styles}
                t={t}
              />
            )}
          />
        </ToetsenbordVlak>
        </MobielKader>
      </Modal>
    </View>
  );
}

function Rij({
  label,
  sub,
  gekozen,
  onPress,
  styles,
  t,
}: {
  label: string;
  sub?: string;
  gekozen: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  t: ThemeColors;
}) {
  return (
    <Pressable onPress={onPress} style={styles.rij} accessibilityRole="button">
      <View style={{ flex: 1 }}>
        <Text style={styles.rijTitel} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={styles.rijSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {gekozen ? <Check size={18} color={t.green600} /> : null}
    </Pressable>
  );
}

const makeStyles = (t: ThemeColors) =>
  StyleSheet.create({
    container: { gap: spacing.xs },
    label: { ...typography.label, color: t.muted2 },
    veld: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.lineStrong,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      backgroundColor: t.card,
    },
    veldUit: { opacity: 0.5 },
    veldTekst: { flex: 1, fontSize: 15, color: t.ink },
    hint: { ...typography.small, color: t.muted },
    kopBalk: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.line,
    },
    kopTitel: { ...typography.heading, color: t.ink, flex: 1 },
    sluit: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.card,
      borderWidth: 1,
      borderColor: t.line,
    },
    zoekWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      margin: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      height: 46,
      borderRadius: radius.md,
      backgroundColor: t.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
    },
    zoekInput: { flex: 1, fontSize: 15, color: t.ink },
    rij: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.line,
    },
    rijTitel: { fontSize: 15, fontWeight: '600', color: t.ink },
    rijSub: { fontSize: 12.5, color: t.muted, marginTop: 2 },
    leeg: {
      padding: spacing.xl,
      textAlign: 'center',
      color: t.muted,
      fontSize: 14,
    },
  });
