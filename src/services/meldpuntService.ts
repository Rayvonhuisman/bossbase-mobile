import { Dimensions, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

/**
 * "Bug of idee" — hetzelfde meldpunt als het dashboard: Edge Function
 * `meldpunt` (tabel `meldingen`, bucket `meldingen`, mail naar BossBase en een
 * bevestiging naar de melder). De server valideert soort, lengte (5–5000) en
 * de schermafbeelding, en houdt 10 meldingen per uur aan.
 *
 * De prijsactie (winactie voor melders) staat in `platform_instellingen`,
 * sleutel `meldactie` = `{ actief, prijzen[] }`, net als in het dashboard.
 */

export type MeldSoort = 'bug' | 'idee';

export type Meldactie = { prijzen: string[] } | null;

export async function getMeldactie(): Promise<Meldactie> {
  const { data, error } = await supabase
    .from('platform_instellingen')
    .select('waarde')
    .eq('sleutel', 'meldactie')
    .maybeSingle();
  if (error || !data) return null;
  const waarde = (data as { waarde: { actief?: boolean; prijzen?: unknown } }).waarde ?? {};
  const prijzen = Array.isArray(waarde.prijzen) ? waarde.prijzen.filter((p): p is string => typeof p === 'string') : [];
  return waarde.actief === true && prijzen.length ? { prijzen } : null;
}

export const MIN_LENGTE = 5;
export const MAX_LENGTE = 5000;
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

/** Wat we automatisch meesturen, zoals het dashboard: pagina, browser, scherm. */
function context(pagina: string) {
  const { width, height } = Dimensions.get('window');
  const scherm = Dimensions.get('screen');
  const web = Platform.OS === 'web' && typeof navigator !== 'undefined';
  return {
    pagina,
    pagina_url: web && typeof location !== 'undefined' ? location.href : `app://${pagina}`,
    browser: web ? 'BossBase-webapp' : `BossBase-app (${Platform.OS} ${String(Platform.Version)})`,
    user_agent: web ? navigator.userAgent : `BossBase/${Platform.OS}`,
    scherm: `${Math.round(width)}x${Math.round(height)} venster, ${Math.round(scherm.width)}x${Math.round(scherm.height)} scherm`,
  };
}

export async function verstuurMelding(input: {
  soort: MeldSoort;
  omschrijving: string;
  pagina: string;
  screenshot?: { type: string; data: string } | null;
}): Promise<
  | { ok: true; nummer: number | null; bevestigd: boolean; actie: boolean }
  | { ok: false; melding: string }
> {
  const omschrijving = input.omschrijving.trim();
  if (omschrijving.length < MIN_LENGTE) {
    return { ok: false, melding: `Schrijf minstens ${MIN_LENGTE} tekens.` };
  }
  const { data, error } = await supabase.functions.invoke('meldpunt', {
    body: {
      soort: input.soort,
      omschrijving: omschrijving.slice(0, MAX_LENGTE),
      ...context(input.pagina),
      ...(input.screenshot ? { screenshot: input.screenshot } : {}),
    },
  });
  if (error || !data?.ok) {
    let melding: string | null = null;
    try {
      const ctx = (error as { context?: Response } | null)?.context;
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
      melding = (body as { error?: string } | null)?.error ?? null;
    } catch {
      // geen leesbare foutbody
    }
    return {
      ok: false,
      melding:
        melding ??
        'Versturen lukte niet. Probeer het zo nog eens, of mail je melding naar info@bossbase.nl.',
    };
  }
  return {
    ok: true,
    nummer: typeof data.nummer === 'number' ? data.nummer : null,
    bevestigd: data.bevestigd === true,
    actie: data.actie === true,
  };
}
