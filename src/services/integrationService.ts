import { Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getCompanyId, isReadonly } from '@/lib/sessionContext';
import { classificeerFout, schrijf, writeFout, type WriteStatus } from '@/lib/writeResult';

/**
 * Integraties: boekhouding, Google Calendar en Stripe.
 *
 * De app las hier eerder niets en toonde bij elke koppeling "Beheren op
 * desktop", met als onderbouwing dat de tabellen geen policies voor
 * `authenticated` zouden hebben. Dat klopt maar half, en het verkeerde half
 * kostte de gebruiker zijn statusoverzicht. Wat er werkelijk staat op de live
 * database:
 *
 *   accounting_connections       — `authenticated` heeft GEEN SELECT-recht op de
 *                                  tabel (de tokens staan erin). De status komt
 *                                  daarom uit de SECURITY DEFINER-RPC
 *                                  `get_accounting_status()`, die alleen een
 *                                  connected-vlag teruggeeft en verder niets.
 *   google_calendar_connections  — RLS aan, NUL policies: rechtstreeks lezen kan
 *                                  écht niet. Wel zijn er twee veilige RPC's:
 *                                  `google_calendar_status()` en
 *                                  `google_calendar_disconnect()`.
 *   stripe_connections           — bedrijfsbreed leesbaar; verwijderen is admin.
 *
 * Er staat dus nergens een token in de app, en er is ook geen service-role
 * nodig. Koppelen aan Google loopt via de bestaande edge function
 * `google-calendar-auth-url`; de app opent alleen de door de server
 * ondertekende URL in de systeembrowser en raakt de tokens nooit aan.
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
  google: { connected: boolean; email: string; calendarId: string } | null;
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
 * De hele stand in één keer. Elke bron faalt apart: een boekhoudkoppeling die
 * niet in het abonnement zit mag het agendablok niet meeslepen.
 */
export async function getIntegratieStand(): Promise<IntegratieStand> {
  const companyId = getCompanyId();
  const fouten: string[] = [];

  const [accRes, gcRes, stripeRes] = await Promise.all([
    supabase.rpc('get_accounting_status'),
    supabase.rpc('google_calendar_status'),
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
    const rijen = (accRes.data as AccountingStatusRow[] | null) ?? [];
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

  let google: IntegratieStand['google'] = null;
  if (gcRes.error) {
    if (__DEV__) console.log('[integrationService] google_calendar_status', gcRes.error.message);
    fouten.push('De agenda-koppeling kon niet worden opgehaald.');
  } else {
    const rij = (Array.isArray(gcRes.data) ? gcRes.data[0] : gcRes.data) as
      | { connected?: boolean; google_email?: string; google_calendar_id?: string }
      | null;
    /**
     * Google Agenda is per gebruiker gekoppeld (de RPC kijkt naar `auth.uid()`).
     * De vlag komt uit de rij die de OAuth-callback zelf heeft geschreven, dus
     * hij is server-side bewijs — maar alleen samen met het account waaraan
     * gekoppeld is. Een vlag zonder e-mailadres laat zich niet controleren en
     * telt daarom als niet gekoppeld.
     */
    const email = (rij?.google_email ?? '').trim();
    google = {
      connected: Boolean(rij?.connected) && email.length > 0,
      email,
      calendarId: rij?.google_calendar_id || 'primary',
    };
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

  return { boekhouding, google, stripe, fouten };
}

/**
 * Start de Google-koppeling. De edge function bouwt de consent-URL met het
 * server-side client secret; wij openen alleen die URL.
 *
 * `invoke` valt zonder expliciete header terug op de anon key, en dan ziet de
 * functie geen gebruiker en antwoordt hij 401 — vandaar het meesturen van het
 * sessietoken, net als in het dashboard.
 */
export async function startGoogleKoppeling(): Promise<WriteStatus> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return writeFout('geen-rechten', 'Je sessie is verlopen. Log opnieuw in.');
  }

  const { data, error } = await supabase.functions.invoke('google-calendar-auth-url', {
    body: {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) return classificeerFout(error, 'integrationService.startGoogleKoppeling');

  const url = (data as { url?: string } | null)?.url;
  if (!url) return writeFout('onbekend', 'Google gaf geen autorisatielink terug.');

  // Systeembrowser, geen in-app webview: Google weigert OAuth in een embedded
  // browser (disallowed_useragent), en de callback moet bovendien op het
  // webdomein landen waar de edge function hem afhandelt.
  try {
    const kan = await Linking.canOpenURL(url);
    if (!kan) return writeFout('onbekend', 'Er kan geen browser worden geopend op dit toestel.');
    await Linking.openURL(url);
    return { ok: true, data: null };
  } catch (e) {
    return writeFout('onbekend', e instanceof Error ? e.message : 'De browser kon niet worden geopend.');
  }
}

export async function ontkoppelGoogle(): Promise<WriteStatus> {
  const { error } = await supabase.rpc('google_calendar_disconnect');
  if (error) return classificeerFout(error, 'integrationService.ontkoppelGoogle', isReadonly());
  return { ok: true, data: null };
}

/**
 * Stripe ontkoppelen: de rij weg, zoals `disconnectStripe` in het dashboard.
 * Het account bij Stripe zelf blijft bestaan.
 */
export async function ontkoppelStripe(): Promise<WriteStatus> {
  const companyId = getCompanyId();
  if (!companyId) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');

  const res = await schrijf<{ id: string }>(
    () => supabase.from('stripe_connections').delete().eq('company_id', companyId).select('id'),
    {
      context: 'integrationService.ontkoppelStripe',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding:
        'De koppeling is niet losgekoppeld. Alleen een beheerder kan dat, en er moet een ' +
        'koppeling zijn om los te maken.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}
