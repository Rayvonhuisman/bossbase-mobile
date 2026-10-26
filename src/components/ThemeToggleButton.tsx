import { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';
import { useTheme } from '@/providers';
import { themaKnopLabel, volgendThema } from '@/lib/themaKeuze';

/**
 * De themaknop in de kop van elke ingelogde pagina: klein en rustig, naast
 * meldingen, Boss en profiel. Het pictogram toont wat een tik doet (maan =
 * donker maken, zon = licht maken), en de toegankelijke naam zegt het ook —
 * kleur is nooit de enige aanduiding.
 *
 * Eén themastatus: de knop zet dezelfde `voorkeur` als Instellingen › Mijn
 * profiel › Weergave (ThemeProvider), dus een tik wordt een eigen keuze
 * (licht of donker) en blijft bewaard. "Zoals het apparaat" kies je daar.
 *
 * Het raakvlak is 44×44, het zichtbare rondje kleiner, zodat de knop niet
 * concurreert met de echte acties. Op web krijgt hij een tooltip (`title`) voor
 * muis en trackpad; de focusring komt uit de algemene :focus-visible-regel
 * (public/index.html).
 */
export function ThemeToggleButton({ size = 32 }: { size?: number }) {
  const { colorMode, colors: t, setVoorkeur } = useTheme();
  const isDark = colorMode === 'dark';
  const label = themaKnopLabel(colorMode);
  const ref = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (ref.current as unknown as HTMLElement | null)?.setAttribute?.('title', label);
  }, [label]);

  return (
    <Pressable
      ref={ref}
      onPress={() => setVoorkeur(volgendThema(colorMode))}
      // Bewust een knop met een actienaam en geen schakelaar met aan/uit: de
      // naam zegt al wat een tik doet; "aan" naast "Lichte modus inschakelen"
      // zou VoiceOver tegenstrijdig laten voorlezen.
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="themaknop"
      style={({ pressed }) => [styles.raak, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.rond, { width: size, height: size, borderRadius: size / 2, borderColor: t.line }]}>
        {isDark ? <Sun size={16} color={t.ink2} strokeWidth={2} /> : <Moon size={15} color={t.ink2} strokeWidth={2} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 44×44 raakvlak, maar in de opmaak ~36 breed: de kop op een telefoon blijft rustig.
  raak: { width: 44, height: 44, marginHorizontal: -4, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  rond: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
