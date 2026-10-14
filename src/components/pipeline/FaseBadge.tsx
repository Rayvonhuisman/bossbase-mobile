import { StyleSheet, Text, View } from 'react-native';
import { faseBadge } from '@/lib/pipelineLogica';

/**
 * Fasebadge zoals het dashboard (`stageBadgeStyle`): de kleur komt uit
 * `pipeline_stages.color_class` (hex of legacy klasse), achtergrond = die hex
 * op 10%, tekst = de hex zelf.
 */
export function FaseBadge({
  label,
  colorClass,
  positie,
  groot = false,
}: {
  label: string;
  colorClass: string | null | undefined;
  positie?: number | null;
  groot?: boolean;
}) {
  const k = faseBadge(colorClass, positie);
  return (
    <View style={[styles.badge, groot && styles.groot, { backgroundColor: k.bg }]}>
      <Text style={[styles.tekst, groot && styles.tekstGroot, { color: k.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  groot: { height: 28, borderRadius: 14, paddingHorizontal: 12 },
  tekst: { fontSize: 12, fontWeight: '700' },
  tekstGroot: { fontSize: 13.5 },
});
