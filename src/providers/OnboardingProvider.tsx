import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Pakket } from '@/lib/registratie';

/**
 * Onboarding state — gedeeld over de 5 schermen via context.
 *
 * - Persistent flag `bb_onboarding_seen` markeert of de gebruiker de flow al
 *   eens heeft afgerond, zodat we hem niet bij elke app-start opnieuw tonen.
 * - In-memory `data` state houdt de tussenvalues vast tijdens de flow.
 */

/**
 * Wat de registratie vraagt — dezelfde velden als het dashboard (RegisterFlow).
 * Het wachtwoord staat hier bewust niet in: dat blijft in het accountscherm.
 */
export type OnboardingData = {
  pakket: Pakket | null;
  companyName: string;
  branche: string;
  phone: string;
  kvk: string;
  fullName: string;
  email: string;
};

const EMPTY: OnboardingData = {
  pakket: null,
  companyName: '',
  branche: '',
  phone: '',
  kvk: '',
  fullName: '',
  email: '',
};

type Ctx = {
  status: 'restoring' | 'ready';
  seen: boolean;
  data: OnboardingData;
  update: (patch: Partial<OnboardingData>) => void;
  reset: () => void;
  markSeen: () => Promise<void>;
};

const OnboardingContext = createContext<Ctx | null>(null);

const STORAGE_KEY = 'bb_onboarding_seen';

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'restoring' | 'ready'>('restoring');
  const [seen, setSeen] = useState(false);
  const [data, setData] = useState<OnboardingData>(EMPTY);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!mounted) return;
        setSeen(v === '1');
        setStatus('ready');
      })
      .catch(() => {
        if (!mounted) return;
        // Lieve fallback: behandel als "niet gezien" — slechtste geval: gebruiker
        // ziet de flow nog een keer.
        setSeen(false);
        setStatus('ready');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const update = useCallback((patch: Partial<OnboardingData>) => {
    setData((d) => ({ ...d, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setData(EMPTY);
  }, []);

  const markSeen = useCallback(async () => {
    setSeen(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, '1');
    } catch (e) {
      console.warn('[OnboardingProvider] markSeen failed', e);
    }
  }, []);

  return (
    <OnboardingContext.Provider value={{ status, seen, data, update, reset, markSeen }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): Ctx {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
