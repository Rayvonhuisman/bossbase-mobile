import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/providers';
import { SLA_STATUS_LABEL, type SlaStatus } from '@/lib/sla';

/**
 * Pil met de SLA-status (op tijd / bijna / te laat / gehaald), in de
 * statuskleuren van het thema: groen, oranje, rood, grijs.
 */
export function SlaBadge({ status, klein = false, prefix }: { status: SlaStatus; klein?: boolean; prefix?: string }) {
  const { colors: t } = useTheme();
  const kleur =
    status === 'te_laat'
      ? { bg: t.statusRejectBg, fg: t.statusRejectFg }
      : status === 'bijna'
        ? { bg: t.statusWarnBg, fg: t.statusWarnFg }
        : status === 'op_tijd'
          ? { bg: t.statusApproveBg, fg: t.statusApproveFg }
          : { bg: t.statusDraftBg, fg: t.statusDraftFg };
  const label = `${prefix ? `${prefix} ` : ''}${SLA_STATUS_LABEL[status]}`;
  return (
    <View style={[styles.pil, { backgroundColor: kleur.bg }, klein && styles.klein]} accessibilityLabel={`SLA: ${label}`}>
      <Text style={[styles.tekst, { color: kleur.fg }, klein && styles.tekstKlein]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pil: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  klein: { paddingHorizontal: 8, paddingVertical: 3 },
  tekst: { fontSize: 12.5, fontWeight: '700' },
  tekstKlein: { fontSize: 11.5 },
});
