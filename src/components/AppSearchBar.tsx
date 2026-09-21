import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

type Props = {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  /** Render as a tappable button instead of an actual input. */
  asButton?: boolean;
  onPress?: () => void;
};

/**
 * Canonical search bar — white, height 44, inset 1px border line, 12px radius.
 */
export function AppSearchBar({ value = '', onChange, placeholder, asButton, onPress }: Props) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  if (asButton) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.bar, pressed && { opacity: 0.85 }]}
      >
        <Search size={18} color={t.muted} strokeWidth={2} />
        <Text style={styles.placeholder}>{placeholder ?? 'Zoek…'}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.bar}>
      <Search size={18} color={t.muted} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? 'Zoek…'}
        placeholderTextColor={t.muted}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
      />
      {value.length > 0 && onChange ? (
        <Pressable hitSlop={6} onPress={() => onChange('')}>
          <X size={16} color={t.muted2} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: t.card,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.line,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: t.ink,
    padding: 0,
  },
  placeholder: {
    fontSize: 15,
    color: t.muted2,
    flex: 1,
  },
});
