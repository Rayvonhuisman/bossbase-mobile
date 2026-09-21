import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

/**
 * BossBase logo mark — 5-tile negative-space "B" met groen accent rechtsboven.
 * Geometrie 1-op-1 uit het brand-asset (zie design package).
 *
 * `dark={true}` flipt voor gebruik op donkere oppervlakken (wit canvas, zwart tile).
 */
export function BBMark({ size = 40, dark = false }: { size?: number; dark?: boolean }) {
  const bg = dark ? '#FFFFFF' : '#0A0A0A';
  const tile = dark ? '#0A0A0A' : '#FFFFFF';
  const gray = dark ? 'rgba(10,10,10,0.42)' : 'rgba(255,255,255,0.55)';
  const green = '#1DDB62';
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Rect x={0} y={0} width={100} height={100} rx={24} ry={24} fill={bg} />
        {/* LEFT — tall spine tile */}
        <Rect x={22} y={22} width={14} height={56} rx={3.4} ry={3.4} fill={tile} />
        {/* MIDDLE column — twee gestapelde tiles, gap voor pill */}
        <Rect x={41} y={22} width={17} height={22} rx={3.4} ry={3.4} fill={tile} />
        <Rect x={41} y={56} width={17} height={22} rx={3.4} ry={3.4} fill={tile} />
        {/* RIGHT column — top tile is groen accent */}
        <Rect x={63} y={22} width={16} height={22} rx={3.4} ry={3.4} fill={green} />
        <Rect x={63} y={56} width={16} height={22} rx={3.4} ry={3.4} fill={tile} />
        {/* GRAY pill — middenbar van de B */}
        <Rect x={42} y={48.5} width={36} height={3} rx={1.5} ry={1.5} fill={gray} />
      </Svg>
    </View>
  );
}
