import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers';
import { ds } from '@/theme';

/**
 * The canonical top-right profile/account shortcut.
 *
 * Shown on every page (baked into `AppHeader`, and as `headerRight` on the
 * native-header detail stacks). Renders an avatar-initials circle in the
 * BossBase green and opens the **profile/account settings** screen at
 * `/profile`. It is NOT the navigation menu — the menu is its own bottom tab.
 *
 * Initials come from `profile.full_name`, falling back to the auth email.
 */
export function ProfileSettingsButton({ size = 40 }: { size?: number }) {
  const router = useRouter();
  const { profile, user } = useAuth();

  const initials = computeInitials(profile?.full_name ?? user?.email ?? '?');

  return (
    <Pressable
      onPress={() => router.push('/profile')}
      accessibilityRole="button"
      accessibilityLabel="Profiel en accountinstellingen openen"
      hitSlop={8}
      style={({ pressed }) => [
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={styles.avatarText}>{initials}</Text>
    </Pressable>
  );
}

function computeInitials(source: string | null | undefined): string {
  if (!source) return '?';
  const cleaned = source.trim();
  if (!cleaned) return '?';
  // Email → single first letter (e.g. "info@bossbase.nl" → "I").
  if (cleaned.includes('@')) return cleaned.charAt(0).toUpperCase();
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

const styles = StyleSheet.create({
  avatar: {
    backgroundColor: ds.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: ds.greenInk,
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: -0.3,
  },
});
