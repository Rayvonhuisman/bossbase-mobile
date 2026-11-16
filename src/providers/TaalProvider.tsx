/**
 * Houdt de gekozen taal bij en hangt de app opnieuw op bij een wissel.
 *
 * Volgorde: de taal uit het profiel (profiles.taal) wint; zonder profiel de
 * laatst gekozen taal op dit toestel (AsyncStorage); anders Nederlands. We
 * kiezen bewust níet automatisch de taal van de telefoon: veel Nederlandse
 * gebruikers hebben hun telefoon in het Engels staan.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isTaal, laadWoordenboek, zetTaalIntern, type Taal } from '@/i18n';
import { zetEigenTaal } from '@/services/profileService';
import { useAuth } from './AuthProvider';

const SLEUTEL = 'bb_taal';

type TaalCtx = { taal: Taal; kiesTaal: (t: Taal) => Promise<void> };
const Ctx = createContext<TaalCtx>({ taal: 'nl', kiesTaal: async () => {} });
export const useTaal = () => useContext(Ctx);

export function TaalProvider({ children }: { children: ReactNode }) {
  const { profile, user } = useAuth();
  const [taal, setTaal] = useState<Taal>('nl');
  const [klaar, setKlaar] = useState(false);

  const pasToe = useCallback(async (nieuw: Taal) => {
    const boek = await laadWoordenboek(nieuw).catch(() => ({}));
    zetTaalIntern(nieuw, boek);
    setTaal(nieuw);
    if (typeof document !== 'undefined') document.documentElement.lang = nieuw;
  }, []);

  // Bij opstarten: de taal van dit toestel.
  useEffect(() => {
    AsyncStorage.getItem(SLEUTEL)
      .then(v => (isTaal(v) && v !== 'nl' ? pasToe(v) : undefined))
      .catch(() => {})
      .finally(() => setKlaar(true));
  }, [pasToe]);

  // Na inloggen: de taal uit het profiel.
  const profielTaal = profile?.taal;
  useEffect(() => {
    if (!profile) return;
    const doel: Taal = isTaal(profielTaal) ? profielTaal : 'nl';
    if (doel !== taal) {
      pasToe(doel);
      AsyncStorage.setItem(SLEUTEL, doel).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profielTaal]);

  const kiesTaal = useCallback(async (nieuw: Taal) => {
    await pasToe(nieuw);
    AsyncStorage.setItem(SLEUTEL, nieuw).catch(() => {});
    if (user?.id) await zetEigenTaal(user.id, nieuw);
    if (profile) profile.taal = nieuw === 'nl' ? null : nieuw;
  }, [pasToe, user?.id, profile]);

  const waarde = useMemo(() => ({ taal, kiesTaal }), [taal, kiesTaal]);
  if (!klaar) return null;
  return (
    <Ctx.Provider value={waarde}>
      <Fragment key={taal}>{children}</Fragment>
    </Ctx.Provider>
  );
}
