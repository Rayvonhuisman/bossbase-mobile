import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/providers';

/**
 * Zachte vervaging achter de iOS-statusbalk, zoals in het ontwerp.
 *
 * De paginakop scrolt mee met de inhoud en schuift dus onder de statusbalk
 * door. Deze laag houdt klok en batterij leesbaar: tot 45% de
 * paginaachtergrond, daarna loopt hij uit naar transparant. Hij vangt geen
 * aanrakingen en is precies zo hoog als de veilige zone bovenaan.
 */
export function StatusBarScrim({ background }: { background?: string }) {
  const insets = useSafeAreaInsets();
  const { colors: t } = useTheme();
  const bg = background ?? t.bg;
  if (insets.top <= 0) return null;

  return (
    <View pointerEvents="none" style={[styles.scrim, { height: insets.top }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="statusBarScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.45" stopColor={bg} stopOpacity={1} />
            <Stop offset="1" stopColor={bg} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#statusBarScrim)" />
      </Svg>
    </View>
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
