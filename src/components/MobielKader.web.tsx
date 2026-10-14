import { useEffect, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/providers';
import { useZichtbareViewport } from '@/lib/zichtbareViewport';
import { bepaalSchermklasse, kolomMax } from '@/lib/schermklasseRegels';

/**
 * Houdt de app in de browser op een passende breedte.
 *
 * Het ontwerp is voor een telefoon gemaakt: een zwevende tabbalk, kaarten over
 * de volle breedte, een FAB rechtsonder. Uitgerekt over een laptopscherm wordt
 * dat een lege vlakte. Daarom (zie `lib/schermklasseRegels`):
 *
 * - Telefoonvenster (ook iPad in Split View, tot 700 breed): de kolom vult het
 *   venster.
 * - Tablet en groter (iPad staand en liggend, desktop): een gecentreerde kolom
 *   van maximaal 880 pixels met een rustige rand eromheen — genoeg ruimte voor
 *   een iPad, zonder telefoonstrook in het midden en zonder regels over de
 *   volle breedte van een groot scherm.
 * - `soort="formulier"` (vellen, kiezers): maximaal 600, een prettige
 *   leesbreedte voor invoervelden.
 *
 * Wordt ook binnen schermvullende modals gebruikt (formulieren, kiezers):
 * die tekent react-native-web buiten de app om, over de hele pagina.
 *
 * `overflow: hidden` houdt alles wat breder uitvalt binnen de kolom, zodat de
 * pagina nooit horizontaal gaat scrollen.
 *
 * Met een open toetsenbord neemt het kader de hoogte en positie van het
 * zichtbare deel van het scherm over (zie `lib/zichtbareViewport`): de app en
 * een open formulier passen dan precies boven het toetsenbord, in plaats van
 * dat iOS het hele beeld omhoog schuift en de bovenkant uit beeld valt.
 */
export function MobielKader({
  children,
  soort = 'app',
}: {
  children: ReactNode;
  soort?: 'app' | 'formulier';
}) {
  const { colors: t, colorMode } = useTheme();
  const { width } = useWindowDimensions();
  const maxBreedte = kolomMax(bepaalSchermklasse(width, 'web'), soort);
  // De zijranden alleen als er naast de kolom ruimte is; op een telefoon zou
  // het een haarlijn langs de schermrand zijn.
  const metRand = width > maxBreedte;
  const viewport = useZichtbareViewport();

  // De browserbalk (en in een geïnstalleerde app de statusbalk) volgt het thema
  // van de app, niet dat van het systeem.
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bg);
  }, [t.bg]);
  return (
    <View
      style={[
        styles.buiten,
        { backgroundColor: colorMode === 'dark' ? '#000000' : '#E5E7EB' },
        viewport.hoogte !== null && {
          // Niet `flex: 0`: react-native-web maakt daar `flex-basis: 0%` van,
          // en dat wint het van `height` (de kolom wordt dan 0 hoog).
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: 'auto',
          height: viewport.hoogte,
        },
        // Alleen een transform als er echt iets te verschuiven is.
        viewport.hoogte !== null && viewport.boven !== 0 && { transform: [{ translateY: viewport.boven }] },
      ]}
    >
      <View
        style={[
          styles.kolom,
          { maxWidth: maxBreedte, backgroundColor: t.bg, borderColor: t.lineStrong },
          metRand && styles.rand,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  buiten: {
    flex: 1,
    alignItems: 'center',
  },
  kolom: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  rand: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
});
