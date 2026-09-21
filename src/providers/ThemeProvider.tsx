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
import { darkTheme, lightTheme, type ThemeColors } from '@/theme';

export type ColorMode = 'light' | 'dark';

const STORAGE_KEY = 'bb.colorMode';

type ThemeContextValue = {
  colorMode: ColorMode;
  /** Themed token palette — drop-in replacement for the static `ds` object. */
  colors: ThemeColors;
  toggleColorMode: () => void;
  setColorMode: (mode: ColorMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * App-wide light/dark theme. Defaults to light; the saved preference is loaded
 * from AsyncStorage on launch and persisted on every change. Non-sensitive, so
 * AsyncStorage (already a dependency) is used rather than SecureStore.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>('light');

  // Load saved preference once on mount. A brief light→dark correction on cold
  // start is acceptable and avoids blocking the first render.
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (mounted && (saved === 'light' || saved === 'dark')) {
          setColorModeState(saved);
        }
      })
      .catch(() => {
        // Ignore read failures — fall back to the light default.
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {
      // Persistence is best-effort; the in-memory state still updates.
    });
  }, []);

  const toggleColorMode = useCallback(() => {
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

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
