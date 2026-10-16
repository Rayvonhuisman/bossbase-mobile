import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { translateAuthError } from '@/lib/authErrors';
import { registratieMetadata, vertaalAuthFout, type RegistratieInvoer } from '@/lib/registratie';
import { clearSessionStand, setSessionStand } from '@/lib/sessionContext';
import { useGebruikMelden } from '@/lib/gebruikMelden';
import { fetchProfileWithCompany, type ProfileFetchError } from '@/services/profileService';
import { legAkkoordVast, vraagVerificatiecodeAan } from '@/services/registratieService';
import type { Company, Profile, Role } from '@/types/domain';

type AuthStatus =
  | 'restoring'           // restoring session from secure storage on launch
  | 'loading-profile'     // session present, fetching profile
  | 'ready'               // session + profile loaded (or no session)
  | 'needs-verification'  // session + profiel zonder bedrijf, e-mail nog niet bevestigd (6-cijferige code)
  | 'profile-error';      // session present but profile failed to load

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  company: Company | null;
  role: Role | null;
  companyId: string | null;
  profileError: ProfileFetchError | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (invoer: RegistratieInvoer) => Promise<SignUpResultaat>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

/**
 * - `verificatie`: er is een sessie; de code is (best-effort) verstuurd en het
 *   codescherm is de volgende stap.
 * - `bevestigen`: geen sessie terug, Supabase "Confirm email" staat aan. In onze
 *   config staat die uit; dit is de terugval die het dashboard ook heeft.
 */
export type SignUpResultaat = { error: string } | { error: null; vervolg: 'verificatie' | 'bevestigen' };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [profileError, setProfileError] = useState<ProfileFetchError | null>(null);

  // Track the last user id we fetched profile for, so we don't refetch on
  // every TOKEN_REFRESHED event.
  const lastFetchedUserId = useRef<string | null>(null);

  // `stil`: verversen terwijl er al een profiel staat (na opslaan in
  // Instellingen of Profiel). Dan géén 'loading-profile': de schermlayouts
  // tonen bij die status een laadscherm, waardoor de navigatiestapel opnieuw
  // opbouwt en de gebruiker op een ander scherm uitkomt. Een mislukte stille
  // verversing laat het bestaande profiel staan.
  const loadProfile = useCallback(async (userId: string, stil = false) => {
    if (!stil) setStatus('loading-profile');
    setProfileError(null);
    const result = await fetchProfileWithCompany(userId);
    // Registratie wacht op de 6-cijferige code: geen foutscherm maar het
    // codescherm (zie de layouts). Geen bedrijf, dus ook geen sessiestand.
    if (!result.ok && result.error.kind === 'awaiting_verification') {
      setProfile(null);
      setCompany(null);
      clearSessionStand();
      setStatus('needs-verification');
      return;
    }
    if (!result.ok && stil) return;
    if (!result.ok) {
      if (__DEV__) {
        console.log('[AuthProvider] profile load failed', {
          userId,
          kind: result.error.kind,
          message: result.error.message,
          details: result.error.details,
        });
      }
      setProfile(null);
      setCompany(null);
      // Geen profiel = geen bedrijf en geen rol. De servicelaag mag daar niet
      // de vorige gebruiker blijven zien.
      clearSessionStand();
      setProfileError(result.error);
      setStatus('profile-error');
      return;
    }
    if (__DEV__) {
      console.log('[AuthProvider] profile load ok', {
        userId,
        role: result.profile.role,
        companyId: result.profile.company_id,
        companyName: result.company?.name ?? null,
      });
    }
    setProfile(result.profile);
    setCompany(result.company);
    // Bedrijf en rol beschikbaar maken voor de servicelaag (zie sessionContext).
    // De rechten en de abonnementsstand komen daarna uit PermissionsProvider.
    setSessionStand({
      userId,
      companyId: result.profile.company_id ?? null,
      role: result.profile.role ?? null,
    });
    setStatus('ready');
  }, []);

  const clearAuthState = useCallback(() => {
    setSession(null);
    setProfile(null);
    setCompany(null);
    setProfileError(null);
    lastFetchedUserId.current = null;
    // Bedrijf, rol, rechten en abonnementsstand horen bij de sessie die net
    // is geëindigd. Laten staan zou betekenen dat een volgende gebruiker op
    // dit toestel even met de rechten van de vorige werkt.
    clearSessionStand();
    setStatus('ready');
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const initialSession = data.session ?? null;
      setSession(initialSession);
      if (initialSession) {
        lastFetchedUserId.current = initialSession.user.id;
        loadProfile(initialSession.user.id);
      } else {
        setStatus('ready');
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);

      if (event === 'SIGNED_OUT' || !nextSession) {
        clearAuthState();
        return;
      }

      const userId = nextSession.user.id;
      if (userId !== lastFetchedUserId.current) {
        lastFetchedUserId.current = userId;
        loadProfile(userId);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile, clearAuthState]);

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: translateAuthError(error.message) };
    }
    return { error: null };
  };

  /**
   * Registreren zoals het dashboard (`registerWithEmail` in authService.js):
   *
   * 1. `auth.signUp` met alle gegevens in de metadata. Er wordt hier GEEN
   *    bedrijf aangemaakt; dat doet verify-code pas na de e-mailverificatie,
   *    met deze metadata (bedrijfsnaam, telefoon, KvK, branche, pakket).
   * 2. Het akkoord met de voorwaarden vastleggen (`akkoord-vastleggen`), met
   *    één herhaling. Mislukt het twee keer, dan legt verify-code het alsnog vast.
   * 3. De 6-cijferige code aanvragen (best-effort; het codescherm kan opnieuw
   *    versturen).
   *
   * De sessie uit stap 1 zet onAuthStateChange om in status
   * 'needs-verification'; de layouts sturen dan naar het codescherm.
   */
  const signUp: AuthContextValue['signUp'] = async (invoer) => {
    const { data, error } = await supabase.auth.signUp({
      email: invoer.email.trim(),
      password: invoer.password,
      options: { data: registratieMetadata(invoer) },
    });
    if (error) return { error: vertaalAuthFout(error.message) };
    if (!data.session) return { error: null, vervolg: 'bevestigen' };

    await legAkkoordVast()
      .catch(() => legAkkoordVast())
      .catch(() => {});
    await vraagVerificatiecodeAan().catch(() => {});
    return { error: null, vervolg: 'verificatie' };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange will fire SIGNED_OUT and clear state, but do it
    // eagerly so the UI flips immediately.
    clearAuthState();
  };

  const refreshProfile = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;
    await loadProfile(userId, true);
  }, [session, loadProfile]);

  // Openen en gebruiken van de app telt als activiteit (zie gebruikMelden).
  useGebruikMelden(status === 'ready' && Boolean(session && profile?.company_id));

  const value: AuthContextValue = {
    status,
    session,
    user: session?.user ?? null,
    profile,
    company,
    role: profile?.role ?? null,
    companyId: profile?.company_id ?? null,
    profileError,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
