import { useEffect, useState, type ReactNode } from 'react';
import { useFonts } from 'expo-font';
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { ActivityIndicator, View } from 'react-native';
// Rechtstreeks uit de module, niet via de providers-index: die index exporteert
// deze provider óók, en dan ontstaat er een require cycle.
import { useTheme } from './ThemeProvider';

/**
 * Laadt Sora — het lettertype uit het goedgekeurde Claude Design-ontwerp — op
 * één plek, vóór de app iets tekent.
 *
 * Waarom gated en niet "gewoon vast renderen":
 *
 * - **Geen layoutverspringing.** Zou de app eerst in het systeemlettertype
 *   verschijnen en daarna omschakelen, dan springt élke regel tekst één keer.
 *   Op een lijst met twintig werkbonnen is dat een zichtbare schok.
 * - **Geen wit scherm.** We tonen de bestaande `LoadingScreen`, die de
 *   themakleuren gebruikt. Geen kale witte pagina dus, en geen splashscreen dat
 *   we zelf open moeten houden — dat is precies het soort scherm dat blijft
 *   hangen als er iets misgaat.
 * - **Altijd een uitweg.** Na `MAX_WACHT` gaat de app hoe dan ook door. Een
 *   lettertype dat niet laadt mag nooit een werkende app blokkeren; een monteur
 *   op een slechte verbinding moet zijn werkbon kunnen openen.
 *
 * Mislukt het laden, dan valt iOS terug op het systeemlettertype. Dat gebeurt
 * niet stilzwijgend: we loggen het expliciet, zodat het in de Metro-uitvoer
 * zichtbaar is in plaats van alleen "de letter ziet er anders uit".
 */

/** Na deze tijd gaat de app door, met of zonder Sora. */
const MAX_WACHT_MS = 3000;

export function FontProvider({ children }: { children: ReactNode }) {
  const { colors: t } = useTheme();
  const [geladen, fout] = useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
  });
  const [tijdOp, setTijdOp] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setTijdOp(true), MAX_WACHT_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (fout) {
      // Expliciet, niet stil: anders is het enige signaal dat de letter er
      // anders uitziet, en dat valt niemand op.
      console.warn(
        '[FontProvider] Sora kon niet worden geladen; de app gebruikt het ' +
          'systeemlettertype. Onderliggende fout:',
        fout,
      );
    }
  }, [fout]);

  useEffect(() => {
    if (!geladen && !fout && tijdOp) {
      console.warn(
        `[FontProvider] Sora was na ${MAX_WACHT_MS} ms nog niet geladen; de app ` +
          'gaat door met het systeemlettertype.',
      );
    }
  }, [geladen, fout, tijdOp]);

  if (!geladen && !fout && !tijdOp) {
    // Bewust het themavlak en niet wit: dit is het allereerste dat iemand ziet.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator color={t.green} />
      </View>
    );
  }

  return <>{children}</>;
}
