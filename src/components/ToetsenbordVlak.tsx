import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  View,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { toetsenbordRuimte } from '@/lib/toestelRegels';

/**
 * Houdt de onderkant van een formuliervel boven het iOS-toetsenbord.
 *
 * Bedoeld voor een `Modal` met `presentationStyle="pageSheet"`/`"formSheet"`.
 * `KeyboardAvoidingView` meet zijn positie ten opzichte van de ouder; in zo'n
 * vel begint de ouder niet bovenaan het scherm (iPhone: onder de statusbalk,
 * iPad: een gecentreerd vel), dus rekent hij te weinig ruimte en blijven de
 * onderste velden en de opslaanknop onder het toetsenbord. Dit vlak meet
 * zichzelf in het venster en zet de juiste ondermarge, met de animatie van
 * het toetsenbord.
 *
 * Web en Android: gewoon een View (web volgt de zichtbare viewport, Android
 * past het venster zelf aan).
 */
export function ToetsenbordVlak({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const ref = useRef<View>(null);
  const [ruimte, setRuimte] = useState(0);
  const laatste = useRef<KeyboardEvent | null>(null);

  const huidig = useRef(0);

  const zet = useCallback((waarde: number, e: KeyboardEvent | null) => {
    if (huidig.current === waarde) return;
    huidig.current = waarde;
    if (e?.duration) {
      LayoutAnimation.configureNext({
        duration: Math.max(e.duration, 10),
        update: { duration: Math.max(e.duration, 10), type: LayoutAnimation.Types.keyboard },
      });
    }
    setRuimte(waarde);
  }, []);

  const bereken = useCallback(
    (e: KeyboardEvent, animeer: boolean) => {
      ref.current?.measureInWindow((_x, y, _w, h) => {
        zet(toetsenbordRuimte(y, h, e.endCoordinates.screenY), animeer ? e : null);
      });
    },
    [zet],
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subs = [
      Keyboard.addListener('keyboardWillShow', (e) => {
        laatste.current = e;
        bereken(e, true);
      }),
      Keyboard.addListener('keyboardWillHide', (e) => {
        laatste.current = null;
        zet(0, e);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [bereken, zet]);

  // Draaien of een ander formaat (Split View): opnieuw meten met het
  // toetsenbord dat er al stond. De eigen ondermarge verandert de buitenmaat
  // van dit vlak niet, dus dit loopt niet in een kringetje.
  const onLayout = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    if (laatste.current) bereken(laatste.current, false);
  }, [bereken]);

  return (
    <View ref={ref} style={[style, ruimte > 0 ? { paddingBottom: ruimte } : null]} onLayout={onLayout} collapsable={false}>
      {children}
    </View>
  );
}
