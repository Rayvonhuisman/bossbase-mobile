import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/providers';

/**
 * Effen vlak achter de iOS-statusbalk.
 *
 * De paginakop scrolt mee met de inhoud en schuift dus onder de statusbalk
 * door. Dit vlak houdt klok en batterij leesbaar. Eerder liep het met een
 * verloop uit naar transparant; dat gaf een witte waas over de inhoud. Nu is
 * het gewoon de paginakleur, net zo hoog als de veilige zone bovenaan, zoals
 * een gewone iOS-statusbalk. Het vangt geen aanrakingen.
 */
export function StatusBarScrim({ background }: { background?: string }) {
  const insets = useSafeAreaInsets();
  const { colors: t } = useTheme();
  if (insets.top <= 0) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.scrim, { height: insets.top, backgroundColor: background ?? t.bg }]}
    />
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 8,
  },
});
