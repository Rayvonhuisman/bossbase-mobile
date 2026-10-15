import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { Appearance, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { darkTheme, lightTheme, type ThemeColors } from '@/theme';
import { bepaalThema, leesOpgeslagenThemaDirect, THEMA_SLEUTEL } from '@/lib/themaKeuze';

export type ColorMode = 'light' | 'dark';

const STORAGE_KEY = THEMA_SLEUTEL;

/**
 * Native (iOS/Android): de opgeslagen keuze is pas asynchroon bekend. Het
 * opstartscherm (#0D0D0D) blijft staan tot die gelezen is, zodat het eerste
 * frame van de app meteen in het goede thema staat — geen licht→donker-flits.
 * Op web regelt `public/thema-start.js` dit vóór de bundel.
 */
const NATIVE = Platform.OS !== 'web';
/** Na deze tijd gaat de app hoe dan ook door (opslag die niet antwoordt). */
const THEMA_WACHT_MS = 1500;
if (NATIVE) SplashScreen.preventAutoHideAsync().catch(() => {});

type ThemeContextValue = {
  colorMode: ColorMode;
  /** Themed token palette — drop-in replacement for the static `ds` object. */
  colors: ThemeColors;
  toggleColorMode: () => void;
  setColorMode: (mode: ColorMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * App-wide light/dark theme. The saved choice wins; without one the system
 * preference is followed. Persisted on every change. Non-sensitive, so
 * AsyncStorage (already a dependency) is used rather than SecureStore.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Eerste weergave meteen goed: op web is de opgeslagen keuze synchroon te
  // lezen (geen licht→donker-flits); zonder keuze volgt de app het systeem.
  const [colorMode, setColorModeState] = useState<ColorMode>(() =>
    bepaalThema(leesOpgeslagenThemaDirect(), Appearance.getColorScheme()),
  );
  /**
   * Of er een eigen keuze (zon/maan-knop) is. Zolang dat niet zo is, volgt de
   * app het systeem — ook als dat wisselt terwijl de app open staat.
   */
  const [eersteKeuze] = useState(leesOpgeslagenThemaDirect);
  const eigenKeuze = useRef(eersteKeuze === 'light' || eersteKeuze === 'dark');

  // Native: de opgeslagen keuze komt asynchroon binnen en wint van het systeem.
  // Tot dan tekent de app niets (het opstartscherm staat nog).
  const [klaar, setKlaar] = useState(!NATIVE);
  useEffect(() => {
    let mounted = true;
    const nood = setTimeout(() => {
      if (mounted) setKlaar(true);
    }, THEMA_WACHT_MS);
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (mounted && (saved === 'light' || saved === 'dark')) {
          eigenKeuze.current = true;
          setColorModeState(saved);
        }
      })
      .catch(() => {
        // Lezen mislukt: systeemvoorkeur (al ingesteld) blijft staan.
      })
      .finally(() => {
        if (mounted) setKlaar(true);
      });
    return () => {
      mounted = false;
      clearTimeout(nood);
    };
  }, []);

  useEffect(() => {
    if (klaar && NATIVE) SplashScreen.hideAsync().catch(() => {});
  }, [klaar]);

  // Systeem wisselt (bijv. automatisch donker 's avonds): volgen zolang er
  // geen eigen keuze is opgeslagen.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      if (!eigenKeuze.current) setColorModeState(bepaalThema(null, colorScheme));
    });
    return () => sub.remove();
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    eigenKeuze.current = true;
    setColorModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {
      // Persistence is best-effort; the in-memory state still updates.
    });
  }, []);

  const toggleColorMode = useCallback(() => {
    eigenKeuze.current = true;
    setColorModeState((prev) => {
      const next: ColorMode = prev === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colorMode,
      colors: colorMode === 'dark' ? darkTheme : lightTheme,
      toggleColorMode,
      setColorMode,
    }),
    [colorMode, toggleColorMode, setColorMode],
  );

  return <ThemeContext.Provider value={value}>{klaar ? children : null}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
