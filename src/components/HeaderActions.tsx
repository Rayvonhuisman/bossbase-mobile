import { StyleSheet, View } from 'react-native';
import { ThemeToggleButton } from './ThemeToggleButton';
import { ProfileSettingsButton } from './ProfileSettingsButton';

/**
 * Canonical top-right header cluster: the theme toggle sits directly LEFT of
 * the profile/account avatar. Used by AppHeader and by the native-header detail
 * stacks so the pairing stays consistent on every page.
 */
export function HeaderActions({ iconSize = 38 }: { iconSize?: number }) {
  return (
    <View style={styles.row}>
      <ThemeToggleButton size={iconSize} />
      <ProfileSettingsButton size={iconSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
