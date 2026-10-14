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
import { clearSessionStand, setSessionStand } from '@/lib/sessionContext';
import { fetchProfileWithCompany, type ProfileFetchError } from '@/services/profileService';
import type { Company, Profile, Role } from '@/types/domain';

type AuthStatus =
  | 'restoring'           // restoring session from secure storage on launch
  | 'loading-profile'     // session present, fetching profile
  | 'ready'               // session + profile loaded (or no session)
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
  signUp: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

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
   * Maakt een nieuwe auth-user aan via Supabase Auth.
   *
   * Belangrijk: dit creëert ALLEEN een rij in `auth.users`. Voor een werkende
   * werkruimte moeten daarna ook `companies` + `profiles` worden aangemaakt
   * (zie MOBILE_BACKEND_GAPS.md #11 — vereist edge function `bootstrap-company`
   * met service-role omdat RLS client-side inserts blokkeert).
   *
   * In MVP toont de Success-stap van de onboarding een uitleg dat de gebruiker
   * eerst de welkomstmail moet bevestigen voordat de werkruimte klaarstaat.
   */
  const signUp: AuthContextValue['signUp'] = async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: fullName ? { data: { full_name: fullName } } : undefined,
    });
    if (error) {
      return { error: translateAuthError(error.message) };
    }
    return { error: null };
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
