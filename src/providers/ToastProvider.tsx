import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';
import type { WriteResult } from '@/lib/writeResult';

/**
 * Eén toast voor de hele app, in de vorm uit het goedgekeurde ontwerp: een
 * donkere pil die vanaf onderen opkomt, boven de tabbalk blijft hangen en na
 * ruim twee seconden weer verdwijnt.
 *
 * Twee regels die hier bewust in de code staan en niet in de aanroepende
 * schermen, omdat ze anders per scherm vergeten worden:
 *
 * 1. **Een toast toont nooit succes zonder serverantwoord.** `toonResultaat()`
 *    neemt een `WriteResult` — precies wat `schrijf()` teruggeeft — en leidt de
 *    toon daaruit af. Een geweigerde RLS-rij komt binnen als `ok: false` en
 *    wordt dus een foutmelding, nooit een groen vinkje.
 * 2. **Een toast vervangt geen foutmelding.** Bij een mislukking blijft de
 *    melding in het formulier staan (zie `FormSheet`); de toast is er alleen
 *    bij, voor het geval het formulier al gesloten is. Hij verdwijnt vanzelf,
 *    en informatie die vanzelf verdwijnt mag nooit de enige plek zijn waar een
 *    fout te lezen is.
 */

export type ToastToon = 'succes' | 'waarschuwing' | 'fout' | 'info';

type ToastContextValue = {
  /** Toon een vrije melding. */
  toon: (bericht: string, toon?: ToastToon) => void;
  /**
   * Toon de uitkomst van een schrijfactie. Leidt de toon af uit het resultaat:
   * `ok` → succes, en anders de foutsoort uit de bestaande classificatie.
   */
  toonResultaat: <T>(resultaat: WriteResult<T>, succesBericht: string) => void;
  verberg: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ZICHTBAAR_MS = 2600;

/**
 * Welke foutsoorten lezen als "let op" en welke als "er ging iets mis".
 * Een ontbrekend recht of een verlopen proefperiode is geen storing — dat is
 * een grens die de gebruiker moet kennen, en die toon past daarbij.
 */
const WAARSCHUWING = new Set(['geen-rechten', 'readonly', 'plan-limiet', 'op-slot', 'validatie']);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors: t } = useTheme();
  const insets = useSafeAreaInsets();
  const [stand, setStand] = useState<{ bericht: string; toon: ToastToon } | null>(null);
  // Via useState en niet useRef: een ref uitlezen tijdens render is niet
  // toegestaan, en deze waarde wordt in de stijl van de render gebruikt.
  const [vervaag] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verberg = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(vervaag, { toValue: 0, duration: 160, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setStand(null);
      },
    );
  }, [vervaag]);

  const toon = useCallback(
    (bericht: string, soort: ToastToon = 'info') => {
      if (!bericht.trim()) return;
      if (timer.current) clearTimeout(timer.current);
      setStand({ bericht, toon: soort });
      Animated.timing(vervaag, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(vervaag, { toValue: 0, duration: 200, useNativeDriver: true }).start(
          ({ finished }) => {
            if (finished) setStand(null);
          },
        );
      }, ZICHTBAAR_MS);
    },
    [vervaag],
  );

  const toonResultaat = useCallback(
    <T,>(resultaat: WriteResult<T>, succesBericht: string) => {
      if (resultaat.ok) {
        // Alleen hier: de server heeft een rij teruggegeven.
        toon(succesBericht, 'succes');
        return;
      }
      toon(resultaat.melding, WAARSCHUWING.has(resultaat.soort) ? 'waarschuwing' : 'fout');
    },
    [toon],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const waarde = useMemo<ToastContextValue>(
    () => ({ toon, toonResultaat, verberg }),
    [toon, toonResultaat, verberg],
  );

  // De toon bepaalt alleen het stipje links; de pil zelf blijft donker, zoals
  // in het ontwerp. Kleur is nooit het enige signaal — de tekst zegt het ook.
  const stipKleur =
    stand?.toon === 'succes'
      ? t.green
      : stand?.toon === 'fout'
        ? t.statusRejectFg
        : stand?.toon === 'waarschuwing'
          ? t.statusWarnStripe
          : t.statusSubmitFg;

  return (
    <ToastContext.Provider value={waarde}>
      {children}
      {stand ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[
            styles.wrap,
            {
              // Boven de zwevende tabbalk (die op inset+12 staat en 64 hoog is).
              bottom: insets.bottom + 88,
              backgroundColor: t.ink,
              opacity: vervaag,
              transform: [
                {
                  translateY: vervaag.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.stip, { backgroundColor: stipKleur }]} />
          <Text style={[styles.tekst, { color: t.bg }]} numberOfLines={3}>
            {stand.bericht}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 28,
    right: 28,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  stip: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  tekst: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
