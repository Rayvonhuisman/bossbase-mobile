import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/sessionContext';

/**
 * Integraties: alleen de STATUS van de koppelingen, uit veilige bronnen.
 *
 *   accounting_connections — `authenticated` heeft geen SELECT-recht (de
 *                            tokens staan erin). De status komt uit de
 *                            SECURITY DEFINER-RPC `get_accounting_status()`,
 *                            die alleen een connected-vlag teruggeeft.
 *   stripe_connections     — bedrijfsbreed leesbaar (alleen statusvelden).
 *
 * Koppelen, ontkoppelen en synchroniseren zijn webflows (API-tokens, Stripe-
 * onboarding, SnelStart-activatie) en lopen via het dashboard. De app leest
 * dus niets geheims en schrijft hier niets.
 */

export type KoppelStatus = {
  provider: string;
  /**
   * Alleen waar als de server een koppeling bevestigt én er genoeg gegevens
   * zijn om er daadwerkelijk mee te werken. Zie `isEchtGekoppeld`.
   */
  connected: boolean;
  administrationId: string;
  /** AFAS-omgeving; zonder deze waarde valt er niets aan te roepen. */
  environmentId: string;
  lastSyncedAt: string | null;
  /** Waarom de app deze status toont — voor een eerlijke uitleg op het scherm. */
  reden: string;
};

export type IntegratieStand = {
  boekhouding: KoppelStatus[];
  stripe: {
    connected: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    onboardingStatus: string;
  } | null;
  /** Per bron een melding als díé bron niet gelezen kon worden. */
  fouten: string[];
};

type AccountingStatusRow = {
  provider: string;
  connected: boolean;
  administration_id: string | null;
  afas_environment_id: string | null;
  last_synced_at: string | null;
};

/**
 * Wanneer mag de app "Gekoppeld" zeggen?
 *
 * De RPC geeft per provider een `connected`-vlag, maar die vlag is niet voor
 * elke provider hetzelfde waard:
 *
 * - **Moneybird / SnelStart** — de vlag ís de aanwezigheid van een sleutel op de
 *   server. Dat is het bewijs; die nemen we over.
 * - **AFAS** — `connected` komt uit `is_connected`, dat het dashboard pas op
 *   waar zet ná een geslaagde testaanroep. Maar een AFAS-aanroep gaat naar
 *   `https://…/<omgeving>/profitrestservices/…`: zónder omgeving-id is er niets
 *   om mee te verbinden. Een vlag zonder omgeving is dus geen werkende
 *   koppeling, en dan zegt de app "Niet gekoppeld".
 *
 * Deze regel maakt de status strenger, nooit soepeler: de app claimt niets wat
 * de server niet bevestigt.
 */
function isEchtGekoppeld(provider: string, rij: AccountingStatusRow | undefined): boolean {
  if (!rij?.connected) return false;
  if (provider === 'afas') return Boolean(rij.afas_environment_id?.trim());
  return true;
}

export const BOEKHOUD_PROVIDERS = [
  { id: 'moneybird', label: 'Moneybird' },
  { id: 'snelstart', label: 'SnelStart' },
  { id: 'afas', label: 'AFAS' },
] as const;

export function providerLabel(id: string): string {
  return BOEKHOUD_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

/**
 * De stand van de koppelingen op de Integraties-tab: boekhouding (RPC
 * `get_accounting_status`) en Stripe (`stripe_connections`). Elke bron faalt
 * apart. Google Agenda staat er niet bij: dat is in het dashboard geen
 * integratie op deze tab (daar verborgen) maar een koppeling in de Agenda.
 */
export async function getIntegratieStand(): Promise<IntegratieStand> {
  const companyId = getCompanyId();
  const fouten: string[] = [];

  const [accRes, stripeRes] = await Promise.all([
    supabase.rpc('get_accounting_status'),
    companyId
      ? supabase
          .from('stripe_connections')
          .select('stripe_account_id, charges_enabled, payouts_enabled, onboarding_status')
          .eq('company_id', companyId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  let boekhouding: KoppelStatus[] = [];
  if (accRes.error) {
    if (__DEV__) console.log('[integrationService] get_accounting_status', accRes.error.message);
    fouten.push('De boekhoudkoppeling kon niet worden opgehaald.');
  } else {
    const rijen = Array.isArray(accRes.data) ? (accRes.data as AccountingStatusRow[]) : [];
    boekhouding = BOEKHOUD_PROVIDERS.map((p) => {
      const rij = rijen.find((r) => r.provider === p.id);
      const connected = isEchtGekoppeld(p.id, rij);
      return {
        provider: p.id,
        connected,
        administrationId: rij?.administration_id ?? '',
        environmentId: rij?.afas_environment_id ?? '',
        lastSyncedAt: rij?.last_synced_at ?? null,
        reden: connected
          ? 'De server bevestigt deze koppeling.'
          : p.id === 'afas' && rij?.connected
            ? 'Geen AFAS-omgeving bekend, dus er valt niets aan te roepen.'
            : 'Er is geen koppeling voor dit bedrijf.',
      };
    });
  }

  let stripe: IntegratieStand['stripe'] = null;
  if (stripeRes.error) {
    if (__DEV__) console.log('[integrationService] stripe_connections', stripeRes.error.message);
    fouten.push('De Stripe-koppeling kon niet worden opgehaald.');
  } else {
    const rij = stripeRes.data as {
      stripe_account_id: string | null;
      charges_enabled: boolean;
      payouts_enabled: boolean;
      onboarding_status: string;
    } | null;
    stripe = rij
      ? {
          connected: Boolean(rij.stripe_account_id),
          chargesEnabled: rij.charges_enabled,
          payoutsEnabled: rij.payouts_enabled,
          onboardingStatus: rij.onboarding_status,
        }
      : { connected: false, chargesEnabled: false, payoutsEnabled: false, onboardingStatus: 'geen' };
  }

  return { boekhouding, stripe, fouten };
}

/**
 * Het label van de Stripe-kaart, zoals het dashboard: "Actief" als er
 * betaald kan worden, "In verificatie" bij een account zonder charges, anders
 * "Niet gekoppeld".
 */
export function stripeLabel(stripe: IntegratieStand['stripe']): 'Actief' | 'In verificatie' | 'Niet gekoppeld' {
  if (!stripe?.connected) return 'Niet gekoppeld';
  return stripe.chargesEnabled ? 'Actief' : 'In verificatie';
}
