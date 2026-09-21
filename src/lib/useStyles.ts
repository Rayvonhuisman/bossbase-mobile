import { darkTheme, lightTheme, type ThemeColors } from '@/theme';
import { useTheme } from '@/providers';

/**
 * Themabewuste stijlen met één regel per component.
 *
 * Het probleem dat dit oplost: een aantal schermen had zijn stijlen op
 * moduleniveau staan (`const styles = StyleSheet.create({ … ds.bg … })`).
 * `ds` IS het lichte palet, dus die schermen bleven in dark mode gewoon wit —
 * hoeveel tokens we ook goed zetten. Ze omzetten naar `makeStyles(t)` betekende
 * normaal gesproken dat élke subcomponent het thema moest doorkrijgen, wat in
 * een bestand van negenhonderd regels veel te veel verplaatsing is.
 *
 * Daarom bouwen we beide stylesheets één keer, bij het laden van de module, en
 * kiest de hook er alleen tussen. Twee stylesheets kosten niets — ze worden
 * eenmalig aangemaakt — en elke component wordt hiermee themabewust met:
 *
 *     const styles = useStyles(makeStyles);
 *
 * Geen props doorgeven, geen useMemo per component, geen kans dat één
 * subcomponent het thema mist.
 */
export function maakThemaStijlen<T>(makeStyles: (t: ThemeColors) => T) {
  return { light: makeStyles(lightTheme), dark: makeStyles(darkTheme) };
}

export function useStyles<T>(paar: { light: T; dark: T }): T {
  const { colorMode } = useTheme();
  return colorMode === 'dark' ? paar.dark : paar.light;
}
