import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ds, spacing } from '@/theme';
import { useTheme } from '@/providers';

/**
 * Het laadscherm: het themavlak met een groene spinner. Bewust géén witte
 * pagina — dat is in donkere modus een flits in het gezicht — en bewust een
 * label, zodat duidelijk is wát er geladen wordt.
 */
export function LoadingScreen({ label }: { label?: string }) {
  const { colors: t } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <ActivityIndicator color={ds.green} size="large" />
      {label ? <Text style={[styles.label, { color: t.muted }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  label: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
  },
});
