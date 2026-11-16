import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Globe } from 'lucide-react-native';
import { TALEN, tx } from '@/i18n';
import { useTaal, useTheme } from '@/providers';
import type { ThemeColors } from '@/theme';
import { FormSheet } from './FormSheet';

/**
 * Keuzelijst van de talen, in hun eigen taal geschreven. Ingelogd geldt de
 * keuze voor jou (profiles.taal, ook in het dashboard); op het inlogscherm
 * alleen voor dit toestel tot je inlogt.
 */
export function TaalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => maakStijlen(t), [t]);
  const { taal, kiesTaal } = useTaal();
  return (
    <FormSheet
      visible={visible}
      title={tx('Taal')}
      subtitle={tx('Alleen voor jou. Je collega\'s houden hun eigen taal.')}
      hideSubmit
      onSubmit={onClose}
      onClose={onClose}
    >
      <View style={styles.groep}>
        {TALEN.map((l, i) => {
          const aan = l.code === taal;
          return (
            <Pressable
              key={l.code}
              accessibilityRole="radio"
              accessibilityState={{ checked: aan }}
              aria-checked={aan}
              onPress={async () => {
                onClose();
                if (!aan) await kiesTaal(l.code);
              }}
              style={({ pressed }) => [styles.rij, i > 0 && styles.rand, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.naam}>{l.naam}</Text>
              {aan ? <Check size={18} color={t.green700} strokeWidth={2.5} /> : null}
            </Pressable>
          );
        })}
      </View>
    </FormSheet>
  );
}

/** Kleine knop met de huidige taal, voor het inlogscherm. */
export function TaalKnop() {
  const { colors: t } = useTheme();
  const styles = useMemo(() => maakStijlen(t), [t]);
  const { taal } = useTaal();
  const [open, setOpen] = useState(false);
  const naam = TALEN.find((l) => l.code === taal)?.naam ?? 'Nederlands';
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tx('Taal: {taal}', { taal: naam })}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.knop, pressed && { opacity: 0.7 }]}
        hitSlop={8}
      >
        <Globe size={16} color={t.muted} strokeWidth={2} />
        <Text style={styles.knopTekst}>{naam}</Text>
      </Pressable>
      <TaalSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const maakStijlen = (t: ThemeColors) =>
  StyleSheet.create({
    groep: { backgroundColor: t.card, borderRadius: 16, borderWidth: 1, borderColor: t.line, overflow: 'hidden' },
    rij: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 16, gap: 12 },
    rand: { borderTopWidth: 1, borderTopColor: t.line },
    naam: { flex: 1, fontSize: 15.5, fontWeight: '600', color: t.ink },
    knop: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12 },
    knopTekst: { fontSize: 14, fontWeight: '600', color: t.muted },
  });
