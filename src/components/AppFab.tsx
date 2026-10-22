import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { ds } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  /** Override absolute bottom offset. Defaults to clearing the floating tab bar. */
  bottom?: number;
};

/**
 * Canonical green floating action pill, bottom-right. By default it sits just
 * above the floating bottom tab bar (safe-area inset + bar height + gap).
 */
export function AppFab({ label, onPress, icon, bottom }: Props) {
  const insets = useSafeAreaInsets();
  // Floating bar occupies ~[inset+12, inset+74]; place the FAB above it.
  const bottomOffset = bottom ?? insets.bottom + 88;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        { bottom: bottomOffset },
        pressed && { opacity: 0.92 },
      ]}
    >
      {icon ?? <Plus size={20} color={ds.greenInk} strokeWidth={2.6} />}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    backgroundColor: ds.green,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: ds.greenInk,
    letterSpacing: -0.2,
  },
});
