import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import {
  actieGate,
  canWithRole,
  canZien,
  gateFor,
  readonlyTekst,
  type ActionGate,
  type Feature,
  type NavGate,
  type Permission,
} from '@/lib/permissions';
import { setSessionStand } from '@/lib/sessionContext';
import { useAuth } from './AuthProvider';

/**
 * Rechten en abonnementsstand, uit dezelfde twee bronnen als het dashboard:
 *
 *   user_permissions      — de losse rechten per gebruiker
 *   get_plan_status()     — de RPC die tier, modules, features, limieten en de
 *                           read-onlystand teruggeeft. SECURITY DEFINER, en hij
 *                           draait op dezelfde helpers als de RLS-policies.
 *
 * Die RPC is ook het antwoord op `bb_gedeelde_werkruimte()`: die functie is
 * niets anders dan `bb_has_feature('gedeelde_werkruimte')`, en die feature staat
 * in `planStatus.features`. De app hoeft er dus niets voor bij te bouwen en kan
 * de RLS-regel exact naspelen in plaats van hem strenger te benaderen.
 */

export type PlanStatus = {
  tier: string;
  trial: boolean;
  status: string | null;
  modules: string[];
  features: string[];
  readonly: boolean;
  readonlyReden: string | null;
  magBeheren: boolean;
  limits: Record<string, { max: number | null; gebruikt: number; telwijze: string }>;
};

type PermissionsContextValue = {
  /**
   * False zolang rechten of abonnementsstand nog onderweg zijn. Schermen MOETEN
   * hierop wachten: een beschermde knop die eerst even zichtbaar is en daarna
   * verdwijnt, is precies de lek die het rechtensysteem hoort te dichten.
   */
  loaded: boolean;
  error: string | null;
  granted: string[];
  planStatus: PlanStatus | null;
  /** Mag deze gebruiker dit recht? Zelfde regel als het dashboard. */
  can: (permission: Permission | string) => boolean;
  /** Zit deze feature in het abonnement? */
  hasFeature: (feature: Feature) => boolean;
  /** Account zonder geldig abonnement: alles alleen-lezen. Server is leidend. */
  readonly: boolean;
  readonlyReden: string | null;
  /** Voldoet de gebruiker aan de gate van deze route? */
  allowsRoute: (route: string) => boolean;
  /** Voldoet de gebruiker aan een losse gate (recht + feature)? */
  allows: (gate: NavGate | null) => boolean;
  /**
   * Mag deze gebruiker deze actie uitvoeren? Toetst recht × feature × rol ×
   * read-onlystand tegen de actiematrix (die de RLS-policies spiegelt).
   *
   * Geeft `false` zolang de rechten nog laden. Een knop die eerst verschijnt en
   * daarna verdwijnt heeft zijn bestaan al verraden.
   *
   *   mag('facturen', 'maken')          → nieuwe factuur
   *   mag('facturen', 'betaaldZetten')  → blijft open op een read-only account
   */
  mag: (module: string, actie: string) => boolean;
  /** Waarom mag het niet? Voor een eerlijke uitleg in plaats van een dode knop. */
  waaromNiet: (module: string, actie: string) => string | null;
  refresh: () => Promise<void>;
};

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, role, status: authStatus } = useAuth();
  const userId = user?.id ?? null;

  /**
   * De hele stand in één object, met de gebruiker waarvoor hij geldt erbij.
   *
   * Dat laatste is de kern: `loaded` wordt afgeleid uit `stand.voorUser ===
   * userId` in plaats van apart bijgehouden. Zo is de stand van de vórige
   * gebruiker per definitie niet "geladen" voor de volgende, zonder dat er een
   * tussenrender bestaat waarin de oude rechten nog even gelden.
   */
  const [stand, setStand] = useState<{
    voorUser: string | null;
    granted: string[];
    planStatus: PlanStatus | null;
    error: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    // Zonder sessie valt er niets te laden. Geen stand zetten: `loaded` leidt
    // dit geval hieronder gewoon af, en dan blijft dit effect vrij van een
    // synchrone state-wijziging.
    if (!userId) return;

    const [permRes, planRes] = await Promise.all([
      supabase
        .from('user_permissions')
        .select('permission')
        .eq('user_id', userId)
        .eq('granted', true),
      supabase.rpc('get_plan_status'),
    ]);

    let error: string | null = null;
    // Bij twijfel niets toestaan: een lege rechtenlijst is de veilige stand.
    let granted: string[] = [];
    let planStatus: PlanStatus | null = null;

    if (permRes.error) {
      if (__DEV__) console.log('[PermissionsProvider] rechten laden mislukt', permRes.error);
      error = 'Je rechten konden niet worden geladen.';
    } else {
      granted = ((permRes.data as { permission: string }[]) ?? []).map((r) => r.permission);
    }

    if (planRes.error) {
      if (__DEV__) console.log('[PermissionsProvider] plan laden mislukt', planRes.error);
      error = error ?? 'De abonnementsgegevens konden niet worden geladen.';
    } else {
      planStatus = (planRes.data as PlanStatus) ?? null;
    }

    // Dezelfde stand beschikbaar maken voor de servicelaag. Die kan geen hook
    // gebruiken en moet toch weten of een 42501 "geen rechten" of "alleen-lezen"
    // betekent.
    setSessionStand({
      userId,
      granted,
      features: planStatus?.features ?? [],
      readonly: planStatus?.readonly === true,
      readonlyReden: planStatus?.readonly === true ? (planStatus?.readonlyReden ?? null) : null,
      planGeladen: planStatus !== null,
    });

    setStand({ voorUser: userId, granted, planStatus, error });
  }, [userId]);

  useEffect(() => {
    // Wacht tot de auth-laag klaar is: eerder heeft de RPC nog geen sessie en
    // krijgen we een lege stand die daarna alsnog moet worden overschreven.
    if (authStatus === 'restoring' || authStatus === 'loading-profile') return;
    // Data laden bij mount is het patroon van dit hele project (19 andere
    // schermen doen het net zo). De regel vlagt elke functie die uiteindelijk
    // state zet; dat is hier niet te vermijden zonder de laadaanpak van de hele
    // app om te bouwen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [authStatus, load]);

  const value = useMemo<PermissionsContextValue>(() => {
    // De stand telt alleen als hij bij déze gebruiker hoort; anders staat alles
    // nog op "bezig" en geldt er niets. Zonder sessie is er niets te laden en
    // is de lege stand meteen de eindstand.
    const loaded = userId === null || (stand !== null && stand.voorUser === userId);
    const bruikbaar = loaded && stand?.voorUser === userId ? stand : null;
    const granted = bruikbaar?.granted ?? [];
    const planStatus = bruikbaar?.planStatus ?? null;
    const error = bruikbaar?.error ?? null;

    // Zien, zoals het dashboard: in een gedeelde werkruimte (Groei) gelden de
    // inzagerechten voor iedereen. Schrijfacties lopen via `mag()`/services en
    // blijven strikt (canWithRole) en server-side afgedwongen.
    const can = (permission: Permission | string) =>
      canZien(permission, role, granted, planStatus?.features ?? null);

    const hasFeature = (feature: Feature) => {
      // Geen serverantwoord = niet blokkeren op abonnement. Dezelfde keuze als
      // het dashboard (usePlan): de policies vangen het echte geval af, en een
      // hapering in de RPC mag geen functies laten verdwijnen.
      if (!planStatus?.features) return true;
      return planStatus.features.includes(feature);
    };

    const allows = (gate: NavGate | null) => {
      if (!gate) return true;
      if (gate.permission && !can(gate.permission)) return false;
      if (gate.feature && !hasFeature(gate.feature)) return false;
      return true;
    };

    const readonly = planStatus?.readonly === true;

    /**
     * De vier lagen achter elkaar, in de volgorde waarin ze de duidelijkste
     * uitleg geven: rol, recht, abonnement, read-onlystand. Geeft `null` als
     * alles klopt.
     */
    const gateWeigering = (gate: ActionGate): string | null => {
      if (gate.roles && !gate.roles.includes(role ?? '')) {
        return gate.roles.length === 1 && gate.roles[0] === 'admin'
          ? 'Alleen een beheerder kan dit.'
          : 'Je rol geeft hier geen toegang toe.';
      }
      // Acties zijn schrijven: strikt, zoals `magBewerken` in het dashboard
      // (de gedeelde werkruimte geeft alleen inzage).
      if (gate.permission && !canWithRole(gate.permission, role, granted)) {
        return 'Je hebt hier geen rechten voor.';
      }
      if (gate.feature && !hasFeature(gate.feature)) {
        return 'Dit zit niet in je huidige abonnement.';
      }
      if (gate.readonlyBlokkeert && readonly) {
        return readonlyTekst(planStatus?.readonlyReden ?? null).titel;
      }
      return null;
    };

    const waaromNiet = (module: string, actie: string): string | null => {
      if (!loaded) return 'Rechten worden nog geladen.';
      const gate = actieGate(module, actie);
      // Geen regel in de matrix = geen mobiele actie. Niet stilzwijgend toestaan.
      if (!gate) return 'Deze actie bestaat niet in de app.';
      return gateWeigering(gate);
    };

    const mag = (module: string, actie: string) => waaromNiet(module, actie) === null;

    return {
      loaded,
      error,
      granted,
      planStatus,
      can,
      hasFeature,
      readonly,
      readonlyReden: readonly ? (planStatus?.readonlyReden ?? null) : null,
      allowsRoute: (route: string) => allows(gateFor(route)),
      allows,
      mag,
      waaromNiet,
      refresh: load,
    };
  }, [stand, userId, role, load]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider');
  return ctx;
}
