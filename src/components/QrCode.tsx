import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
// Alleen de rekenkern van qrcode (puur JavaScript, geen canvas of Node): zo werkt
// hij gelijk op iOS, Android en web. Tekenen doet react-native-svg.
import QRCodeKern from 'qrcode/lib/core/qrcode';

/**
 * QR-code als SVG, altijd zwart op wit (ook in donkere modus): anders scant een
 * telefoon hem slecht. Rand van 2 modules.
 */
export function QrCode({ waarde, grootte, label }: { waarde: string; grootte: number; label?: string }) {
  const { pad, n } = useMemo(() => {
    const qr = QRCodeKern.create(waarde, { errorCorrectionLevel: 'M' });
    const m = qr.modules;
    const rand = 2;
    let d = '';
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        if (m.get(x, y)) d += `M${x + rand} ${y + rand}h1v1h-1z`;
      }
    }
    return { pad: d, n: m.size + rand * 2 };
  }, [waarde]);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ?? 'QR-code'}
      style={{ width: grootte, height: grootte, backgroundColor: '#ffffff', borderRadius: 8, overflow: 'hidden' }}
    >
      <Svg width={grootte} height={grootte} viewBox={`0 0 ${n} ${n}`}>
        <Rect x={0} y={0} width={n} height={n} fill="#ffffff" />
        <Path d={pad} fill="#111827" />
      </Svg>
    </View>
  );
}
