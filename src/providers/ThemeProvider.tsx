import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { darkTheme, lightTheme, type ThemeColors } from '@/theme';
import {
  bepaalThema,
  leesOpgeslagenThemaDirect,
  leesVoorkeur,
  OUDE_THEMA_SLEUTEL,
  THEMA_SLEUTEL,
  type ThemaVoorkeur,
} from '@/lib/themaKeuze';

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
  /** Wat er in Instellingen › Mijn profiel › Weergave gekozen is. */
  voorkeur: ThemaVoorkeur;
  setVoorkeur: (voorkeur: ThemaVoorkeur) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * App-wide light/dark theme. The saved choice wins; without one ("Zoals het
 * apparaat") the system preference is followed, ook als die verandert terwijl
 * de app open staat. Gekozen in Instellingen › Mijn profiel; er is geen
 * themaknop in de kop meer. Non-sensitive, so AsyncStorage (already a
 * dependency) is used rather than SecureStore.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Eerste weergave meteen goed: op web is de opgeslagen keuze synchroon te
  // lezen (geen licht→donker-flits); zonder keuze volgt de app het systeem.
  const [voorkeur, setVoorkeurState] = useState<ThemaVoorkeur>(() =>
    leesVoorkeur(leesOpgeslagenThemaDirect()),
  );
  const [systeem, setSysteem] = useState(() => Appearance.getColorScheme());

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
          setVoorkeurState(saved);
        }
      })
      .catch(() => {
        // Ignore read failures — fall back to the system preference.
      })
      .finally(() => {
        if (mounted) setKlaar(true);
      });
    AsyncStorage.removeItem(OUDE_THEMA_SLEUTEL).catch(() => {});
    return () => {
      mounted = false;
      clearTimeout(nood);
    };
  }, []);

  useEffect(() => {
    if (klaar && NATIVE) SplashScreen.hideAsync().catch(() => {});
  }, [klaar]);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSysteem(colorScheme));
    return () => sub.remove();
  }, []);

  const setVoorkeur = useCallback((nieuw: ThemaVoorkeur) => {
    setVoorkeurState(nieuw);
    // Persistence is best-effort; the in-memory state still updates.
    const opslag =
      nieuw === 'systeem' ? AsyncStorage.removeItem(STORAGE_KEY) : AsyncStorage.setItem(STORAGE_KEY, nieuw);
    opslag.catch(() => {});
  }, []);

  const colorMode: ColorMode = bepaalThema(voorkeur === 'systeem' ? null : voorkeur, systeem);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colorMode,
      colors: colorMode === 'dark' ? darkTheme : lightTheme,
      voorkeur,
      setVoorkeur,
    }),
    [colorMode, voorkeur, setVoorkeur],
  );

  return <ThemeContext.Provider value={value}>{klaar ? children : null}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
