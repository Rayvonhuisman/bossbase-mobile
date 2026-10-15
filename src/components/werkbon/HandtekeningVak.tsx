import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { handtekeningHtml } from '@/lib/handtekeningHtml';
import { useTheme } from '@/providers';
import { maakStijl, type HandtekeningProps } from './handtekeningStijl';


/**
 * Handtekeningvak (HandtekeningCanvas in het dashboard). Telefoon: een canvas
 * in een WebView, zodat de handtekening een echte PNG wordt — dat is wat de
 * Edge Function sign-werkbon aanneemt. Web: HandtekeningVak.web.tsx.
 */
export function HandtekeningVak({
  onChange,
  disabled,
  onTekenen,
  titel = 'Handtekening klant',
  plaatshouder = 'Laat de klant hier tekenen',
}: HandtekeningProps) {
  const { colors: t } = useTheme();
  const styles = useMemo(() => maakStijl(t), [t]);
  const ref = useRef<WebView>(null);
  const html = useMemo(() => handtekeningHtml(160), []);
  const [heeft, setHeeft] = useState(false);

  const ontvang = (e: WebViewMessageEvent) => {
    try {
      const b = JSON.parse(e.nativeEvent.data) as { type: string; dataUrl: string | null };
      if (b.type !== 'streek') return;
      setHeeft(!!b.dataUrl);
      onChange(b.dataUrl);
    } catch {
      /* geen bericht van de tekenpagina */
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.kop}>
        <Text style={styles.titel}>{titel}</Text>
        {heeft && !disabled ? (
          <Pressable onPress={() => ref.current?.injectJavaScript('window.wis();true;')} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.wis}>Wissen</Text>
          </Pressable>
        ) : null}
      </View>
      <View
        style={[styles.vak, disabled && { opacity: 0.6 }]}
        pointerEvents={disabled ? 'none' : 'auto'}
        onTouchStart={() => onTekenen?.(true)}
        onTouchEnd={() => onTekenen?.(false)}
        onTouchCancel={() => onTekenen?.(false)}
      >
        <WebView
          ref={ref}
          originWhitelist={['*']}
          source={{ html }}
          onMessage={ontvang}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          style={styles.web}
        />
        {!heeft ? (
          <View style={styles.leeg} pointerEvents="none">
            <Text style={styles.leegTekst}>{plaatshouder}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
