import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuth } from './AuthProvider';
import { BossChat } from '@/components/BossChat';
import { Meldpunt } from '@/components/Meldpunt';
import { Meldingen } from '@/components/Meldingen';
import { aantalOngelezen } from '@/services/meldingService';

/**
 * Boss, "Bug of idee" en de meldingenbel — overal bereikbaar, zoals in de
 * topbalk van het dashboard. De panelen staan één keer in de root; elk scherm
 * opent ze via `useHulp()`.
 */
type Hulp = {
  openBoss: () => void;
  openMelden: () => void;
  openMeldingen: () => void;
  ongelezen: number;
};

const HulpContext = createContext<Hulp>({
  openBoss: () => {},
  openMelden: () => {},
  openMeldingen: () => {},
  ongelezen: 0,
});

export const useHulp = () => useContext(HulpContext);

/** Elke minuut het aantal ongelezen meldingen bijwerken (alleen een telling). */
const VERVERS_MS = 60_000;

export function HulpProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth();
  const pad = usePathname();
  const [paneel, setPaneel] = useState<'boss' | 'melden' | 'meldingen' | null>(null);
  const [ongelezen, setOngelezen] = useState(0);

  // Alleen een telling; de state verandert pas als het antwoord er is.
  const userId = user?.id ?? null;
  const tel = useCallback(() => {
    if (userId) void aantalOngelezen(userId).then(setOngelezen);
  }, [userId]);

  useEffect(() => {
    if (!session || !userId) return;
    tel();
    const id = setInterval(tel, VERVERS_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tel();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [session, userId, tel]);

  const waarde: Hulp = {
    openBoss: () => setPaneel('boss'),
    openMelden: () => setPaneel('melden'),
    openMeldingen: () => setPaneel('meldingen'),
    // Zonder sessie geen teller, ook niet die van de vorige gebruiker.
    ongelezen: session ? ongelezen : 0,
  };

  return (
    <HulpContext.Provider value={waarde}>
      {children}
      {session ? (
        // Per gebruiker een eigen Boss-gesprek: uitloggen begint opnieuw.
        <BossChat key={user?.id ?? 'x'} open={paneel === 'boss'} onSluit={() => setPaneel(null)} onMelden={() => setPaneel('melden')} />
      ) : null}
      {session ? <Meldpunt open={paneel === 'melden'} pagina={pad || 'app'} onSluit={() => setPaneel(null)} /> : null}
      {session ? (
        <Meldingen open={paneel === 'meldingen'} onSluit={() => setPaneel(null)} onGewijzigd={tel} />
      ) : null}
    </HulpContext.Provider>
  );
}
