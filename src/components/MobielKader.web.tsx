import { useEffect, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/providers';
import { useZichtbareViewport } from '@/lib/zichtbareViewport';

/**
 * Houdt de app in de browser op telefoonbreedte.
 *
 * Het ontwerp is voor een telefoon gemaakt: een zwevende tabbalk, kaarten over
 * de volle breedte, een FAB rechtsonder. Uitgerekt over een laptopscherm wordt
 * dat een lege vlakte met een tabbalk van een meter breed. Daarom staat de app
 * op een groot scherm gecentreerd in een kolom van maximaal 480 pixels — breed
 * genoeg voor elke telefoon, inclusief de grootste iPhone (430) — met een
 * rustige rand eromheen. Op een telefoon vult de kolom gewoon het scherm.
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
const MAX_BREEDTE = 480;

export function MobielKader({ children }: { children: ReactNode }) {
  const { colors: t, colorMode } = useTheme();
  const { width } = useWindowDimensions();
  // De zijranden alleen als er naast de kolom ruimte is; op een telefoon zou
  // het een haarlijn langs de schermrand zijn.
  const metRand = width > MAX_BREEDTE;
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
        { backgroundColor: colorMode === 'dark' ? '#060A08' : '#E5E7EB' },
        viewport.hoogte !== null && {
          // Niet `flex: 0`: react-native-web maakt daar `flex-basis: 0%` van,
          // en dat wint het van `height` (de kolom wordt dan 0 hoog).
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: 'auto',
          height: viewport.hoogte,
          transform: [{ translateY: viewport.boven }],
        },
      ]}
    >
      <View
        style={[styles.kolom, { backgroundColor: t.bg, borderColor: t.lineStrong }, metRand && styles.rand]}
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
    maxWidth: MAX_BREEDTE,
    overflow: 'hidden',
  },
  rand: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
});
