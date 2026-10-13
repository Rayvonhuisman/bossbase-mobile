import { StyleSheet, Text, View } from 'react-native';
import { normaliseerStatus, WERKBON_STATUS_STIJL } from '@/lib/werkbonLogica';

/**
 * Statuspil van een werkbon met de kleuren van het dashboard
 * (gepland blauw, in uitvoering oranje, afgerond groen), met stip.
 * Vaste kleuren: in licht en donker dezelfde pil, net als op kantoor.
 */
export function WerkbonStatusBadge({ status, klein = false }: { status: string | null | undefined; klein?: boolean }) {
  const s = WERKBON_STATUS_STIJL[normaliseerStatus(status)];
  return (
    <View
      style={[styles.pil, { backgroundColor: s.bg }, klein && styles.klein]}
      accessibilityLabel={`Status: ${s.label}`}
    >
      <View style={[styles.dot, { backgroundColor: s.dot }]} />
      <Text style={[styles.tekst, { color: s.kleur }, klein && styles.tekstKlein]} numberOfLines={1}>
        {s.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  klein: { paddingHorizontal: 8, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  tekst: { fontSize: 12.5, fontWeight: '700' },
  tekstKlein: { fontSize: 11.5 },
});
