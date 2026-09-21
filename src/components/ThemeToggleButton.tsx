import { Pressable, StyleSheet } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';
import { useTheme } from '@/providers';

/**
 * Light/dark theme toggle, styled to match the header icon buttons. Sits to the
 * LEFT of the ProfileSettingsButton (see HeaderActions).
 *
 * Icon reflects the action, not the current state:
 *  - Light mode  → Moon  (press to go dark)
 *  - Dark mode   → Sun   (press to go light)
 */
export function ThemeToggleButton({ size = 38 }: { size?: number }) {
  const { colorMode, colors: t, toggleColorMode } = useTheme();
  const isDark = colorMode === 'dark';

  return (
    <Pressable
      onPress={toggleColorMode}
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'Schakel naar lichte modus' : 'Schakel naar donkere modus'}
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: t.card,
          borderColor: t.line,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      {isDark ? (
        <Sun size={19} color={t.ink} strokeWidth={2.2} />
      ) : (
        <Moon size={18} color={t.ink} strokeWidth={2.2} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
