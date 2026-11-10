import { supabase } from '@/lib/supabase';

/**
 * Verhuisflow op de werkbon. Kopie van src/services/verhuisService.js in het
 * dashboard: dezelfde RPC's (migratie 20261109120000_verhuisflow.sql) en
 * dezelfde edge function verhuis-factuur. De server controleert alles (functie
 * 'verhuisflow' aan, werkbon van het bedrijf, recht per stap, fase); de app
 * volgt alleen wat hij terugkrijgt.
 */

export type VerhuisFase = 'voorbereiding' | 'akkoord_start' | 'gestart' | 'beeindigd' | 'akkoord_eind' | 'gefactureerd';
export type RegelSoort = 'uur' | 'km' | 'vast';

export type InhoudRegel = {
  soort: RegelSoort;
  omschrijving: string;
  eenheidsprijs: number;
  btw_pct: number;
  aantal: number;
  bedrag: number;
  extra?: boolean;
};

export type Inhoud = {
  soort: 'start' | 'eind';
  bedrijf?: string;
  werkbon?: { nummer?: string; titel?: string };
  klant?: { naam?: string; telefoon?: string; email?: string };
  vertrek_adres?: string;
  bestemming_adres?: string;
  afspraken?: string;
  geschatte_uren?: number;
  minimum_uren?: number;
  gestart_op?: string;
  beeindigd_op?: string;
  werkelijke_uren?: number;
  regels: InhoudRegel[];
  totaal_excl: number;
  btw: number;
  totaal_incl: number;
};

export type VerhuisRegel = {
  id: string;
  soort: RegelSoort;
  omschrijving: string;
  eenheidsprijs: number;
  btw_pct: number;
  geschat_aantal: number;
  werkelijk_aantal: number | null;
  extra: boolean;
};

export type Verhuis = {
  actief: boolean;
  bestaat?: boolean;
  fase: VerhuisFase;
  werkbon_status?: string;
  voorstel?: { klant_naam?: string; telefoon?: string; email?: string; vertrek_adres?: string };
  gegevens?: {
    klant_naam: string | null;
    telefoon: string | null;
    email: string | null;
    vertrek_adres: string | null;
    bestemming_adres: string | null;
    geschatte_uren: number | null;
    minimum_uren: number | null;
    afspraken: string | null;
    gestart_op: string | null;
    beeindigd_op: string | null;
    werkelijke_uren: number | null;
    factuurmail_status: 'wacht' | 'bezig' | 'verstuurd' | 'mislukt' | 'geen_adres' | null;
    factuurmail_verstuurd_op: string | null;
    factuurmail_fout: string | null;
  };
  regels?: VerhuisRegel[];
  handtekeningen?: { soort: 'start' | 'eind'; naam: string; getekend_op: string; inhoud: Inhoud; inhoud_sha256: string; png_base64: string }[];
  te_tekenen?: { soort: 'start' | 'eind'; inhoud: Inhoud; sha256: string } | null;
  factuur?: { id: string; nummer: string; status: string; totaal_incl: number; betaald_op: string | null; stripe_payment_status: string | null } | null;
  google_review_url?: string | null;
  mag?: { afspraken: boolean; uitvoeren: boolean; factureren: boolean; instellingen: boolean };
};

export const FASE_LABEL: Record<VerhuisFase, string> = {
  voorbereiding: 'Afspraken invullen',
  akkoord_start: 'Klaar om te starten',
  gestart: 'Bezig',
  beeindigd: 'Afrekening controleren',
  akkoord_eind: 'Klaar om te factureren',
  gefactureerd: 'Gefactureerd',
};

export const SOORT_LABEL: Record<RegelSoort, string> = { uur: 'per uur', km: 'per km', vast: 'vast bedrag' };

export const BETAALLINK_REDEN: Record<string, string> = {
  stripe_niet_gekoppeld: 'Stripe is nog niet gekoppeld. Een beheerder koppelt het in het dashboard via Instellingen › Integraties › Stripe; daarna verschijnt hier de betaal-QR.',
  stripe_niet_actief: 'De Stripe-koppeling is nog niet actief (Stripe controleert de gegevens nog). Rond de aanmelding af in het dashboard.',
  feature_niet_in_abonnement: 'Betalen via iDEAL zit niet in het abonnement van dit bedrijf.',
  niet_betaalbaar: 'Deze factuur kan niet (meer) online worden betaald.',
  geen_bedrag: 'Er staat niets meer open op deze factuur.',
  betaald: 'Deze factuur is betaald.',
};

export class VerhuisFout extends Error {
  code: string | null;
  constructor(bericht: string, code: string | null = null) {
    super(bericht);
    this.code = code;
  }
}

function fout(err: { message?: string; hint?: string; code?: string } | null): VerhuisFout {
  const msg = String(err?.message ?? '');
  if (/Failed to fetch|Network request failed|NetworkError|Load failed/i.test(msg)) {
    return new VerhuisFout('Geen verbinding. Er is niets opgeslagen; probeer het opnieuw zodra je weer bereik hebt.', 'netwerk');
  }
  return new VerhuisFout(msg || 'Er ging iets mis.', err?.hint ?? err?.code ?? null);
}

async function rpc<T>(naam: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(naam, args);
  if (error) throw fout(error);
  return data as T;
}

export async function getVerhuis(werkbonId: string): Promise<Verhuis> {
  const { data, error } = await supabase.rpc('bb_verhuis_ophalen', { p_werkbon: werkbonId });
  // Functie (nog) niet in de database (app vóór de migratie, of een oude
  // schema-cache): geen verhuisflow, dus niets tonen in plaats van een fout.
  if (error && (error.code === 'PGRST202' || error.code === '42883')) return { actief: false } as Verhuis;
  if (error) throw fout(error);
  return data as Verhuis;
}
export const teken = (werkbonId: string, soort: 'start' | 'eind', naam: string, sha256: string, png: string) =>
  rpc<{ ok: boolean; herhaald: boolean; verhuis: Verhuis }>('bb_verhuis_tekenen', {
    p_werkbon: werkbonId, p_soort: soort, p_naam: naam, p_sha256: sha256, p_png_base64: png,
  });
export const start = (werkbonId: string) => rpc<Verhuis>('bb_verhuis_starten', { p_werkbon: werkbonId });
export const beeindig = (werkbonId: string) => rpc<Verhuis>('bb_verhuis_beeindigen', { p_werkbon: werkbonId });
export const slaAfrekeningOp = (werkbonId: string, uren: number, regels: Record<string, unknown>[]) =>
  rpc<Verhuis>('bb_verhuis_afrekening_opslaan', { p_werkbon: werkbonId, p_werkelijke_uren: uren, p_regels: regels });
export const maakFactuur = (werkbonId: string) =>
  rpc<{ factuur_id: string; nieuw: boolean }>('bb_verhuis_factuur_maken', { p_werkbon: werkbonId });

async function functie<T>(werkbonId: string, actie: 'betaallink' | 'pdf' | 'mail'): Promise<T> {
  const { data, error } = await supabase.functions.invoke('verhuis-factuur', { body: { werkbon_id: werkbonId, actie } });
  if (error) {
    let msg = error.message;
    try {
      const b = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
      if (b?.error) msg = b.error;
    } catch {
      /* geen JSON */
    }
    throw fout({ message: msg });
  }
  return data as T;
}

export const getBetaallink = (werkbonId: string) =>
  functie<{ url: string | null; reden?: string }>(werkbonId, 'betaallink');
export const getFactuurPdf = (werkbonId: string) =>
  functie<{ bestandsnaam: string; pdf_base64: string }>(werkbonId, 'pdf');
export const verstuurFactuurmailOpnieuw = (werkbonId: string) =>
  functie<{ uitkomst: string; fout?: string | null }>(werkbonId, 'mail');

export const euro = (n: number | null | undefined) =>
  `€ ${Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const uren = (n: number | null | undefined) =>
  `${Number(n || 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} u`;
export const nl = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
export const getal = (v: string) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && String(v).trim() !== '' ? n : NaN;
};
