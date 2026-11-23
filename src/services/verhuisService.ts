import { supabase } from '@/lib/supabase';
import { locale, tx } from '@/i18n';

/**
 * Verhuisflow op de werkbon. Kopie van src/services/verhuisService.js in het
 * dashboard: dezelfde RPC's (migraties 20261110120000_verhuisflow.sql en
 * 20261123120000_verhuis_tarieven_en_factuur_versturen.sql) en
 * dezelfde edge function verhuis-factuur. De server controleert alles (functie
 * 'verhuisflow' aan, werkbon van het bedrijf, recht per stap, fase); de app
 * volgt alleen wat hij terugkrijgt.
 */

export type VerhuisFase = 'voorbereiding' | 'akkoord_start' | 'gestart' | 'beeindigd' | 'akkoord_eind' | 'gefactureerd';
export type RegelSoort = 'uur' | 'km' | 'vast' | 'reis';

export type InhoudRegel = {
  soort: RegelSoort;
  omschrijving: string;
  eenheidsprijs: number;
  btw_pct: number;
  aantal: number;
  bedrag: number;
  /** Alleen bij prijzen incl. btw: het deel excl. btw zoals het op de factuur komt. */
  bedrag_excl?: number;
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
  /** 'incl_btw': eenheidsprijzen en regelbedragen zijn incl. btw. */
  prijzen?: 'incl_btw';
  /** Incl. btw: wat de tarieven optellen, en het verschil door btw-afronding (≤ 0). */
  totaal_tarief?: number;
  afronding?: number;
};

export type Tarieven = {
  prijzen_incl_btw: boolean; btw_pct: number; uurtarief: number; uur_omschrijving: string;
  reis_heen_uren: number; reis_terug_uren: number; km_tarief: number; km_omschrijving: string; minimum_uren: number | null;
};

export type Controle = {
  tariefmodel: boolean;
  afwijkende_tarieven: { omschrijving: string; soort: RegelSoort; afgesproken: number; aantal: number; standaard: number | null; standaard_aantal?: number | null }[];
  extra_regels: number;
  offerte?: { id: string; nummer: string | null; status: string; totaal_excl: number; totaal_incl: number; geaccepteerd_op: string | null };
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
    prijzen_incl_btw?: boolean;
    verzending_status?: 'bezig' | 'verstuurd' | 'mislukt' | null;
    verzending_naar?: string | null;
    verzending_verstuurd_op?: string | null;
    verzending_fout?: string | null;
    verzending_met_betaallink?: boolean | null;
  };
  regels?: VerhuisRegel[];
  handtekeningen?: { soort: 'start' | 'eind'; naam: string; getekend_op: string; inhoud: Inhoud; inhoud_sha256: string; png_base64: string }[];
  te_tekenen?: { soort: 'start' | 'eind'; inhoud: Inhoud; sha256: string } | null;
  factuur?: { id: string; nummer: string; status: string; totaal_incl: number; betaald_op: string | null; stripe_payment_status: string | null; email_naar?: string | null } | null;
  tarieven?: Tarieven | null;
  controle?: Controle | null;
  google_review_url?: string | null;
  mag?: { afspraken: boolean; uitvoeren: boolean; factureren: boolean; instellingen: boolean };
};

export const FASE_LABEL: Record<VerhuisFase, string> = {
  get voorbereiding() { return tx('Afspraken invullen'); },
  get akkoord_start() { return tx('Klaar om te starten'); },
  get gestart() { return tx('Bezig'); },
  get beeindigd() { return tx('Afrekening controleren'); },
  get akkoord_eind() { return tx('Klaar om te factureren'); },
  get gefactureerd() { return tx('Gefactureerd'); },
};

export const SOORT_LABEL: Record<RegelSoort, string> = { get uur() { return tx('per uur'); }, get km() { return tx('per km'); }, get vast() { return tx('vast bedrag'); }, get reis() { return tx('per uur'); } };

/** Waarom 'Factuur versturen' niets deed (uitkomst 'niet_verstuurd'). */
export const VERZEND_REDEN: Record<string, string> = {
  get al_verstuurd() { return tx('Deze factuur is al naar de klant gemaild.'); },
  get bezig() { return tx('De factuur wordt op dit moment al verstuurd. Even geduld.'); },
  get geen_adres() { return tx('Er is geen e-mailadres van de klant bekend. Vul het in bij de klant en probeer het opnieuw.'); },
  get betaald() { return tx('Deze factuur is al betaald.'); },
  get niet_verstuurbaar() { return tx('Deze factuur kan niet (meer) worden verstuurd.'); },
};

export const BETAALLINK_REDEN: Record<string, string> = {
  get stripe_niet_gekoppeld() { return tx('Stripe is nog niet gekoppeld. Een beheerder koppelt het in het dashboard via Instellingen › Integraties › Stripe; daarna verschijnt hier de betaal-QR.'); },
  get stripe_niet_actief() { return tx('De Stripe-koppeling is nog niet actief (Stripe controleert de gegevens nog). Rond de aanmelding af in het dashboard.'); },
  get feature_niet_in_abonnement() { return tx('Betalen via iDEAL zit niet in het abonnement van dit bedrijf.'); },
  get niet_betaalbaar() { return tx('Deze factuur kan niet (meer) online worden betaald.'); },
  get geen_bedrag() { return tx('Er staat niets meer open op deze factuur.'); },
  get betaald() { return tx('Deze factuur is betaald.'); },
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
    return new VerhuisFout(tx('Geen verbinding. Er is niets opgeslagen; probeer het opnieuw zodra je weer bereik hebt.'), 'netwerk');
  }
  return new VerhuisFout(msg || tx('Er ging iets mis.'), err?.hint ?? err?.code ?? null);
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

async function functie<T>(werkbonId: string, actie: 'betaallink' | 'pdf' | 'mail' | 'versturen'): Promise<T> {
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
/**
 * De factuur nu naar de klant mailen (PDF met betaal-QR en een klikbare
 * betaallink). Eén verzending per factuur; na 'mislukt' kan het opnieuw.
 */
export const verstuurFactuur = (werkbonId: string) =>
  functie<{ uitkomst: 'verstuurd' | 'mislukt' | 'niet_verstuurd'; reden?: string | null; naar?: string | null; met_betaallink?: boolean; fout?: string | null }>(werkbonId, 'versturen');

// ── Rekenregel, gelijk aan bb_verhuis_bedragen in de database ──────────────
// Kopie van src/services/verhuisRekenregel.js in het dashboard (daar vergeleken
// met de database in supabase/tests/verhuisflow/rekenregel.mjs). Alleen voor de
// directe herberekening op het scherm; wat telt rekent de server na opslaan.
function exclUitIncl(inclCent: number, pct: number) {
  if (inclCent <= 0) return 0;
  if (!pct) return inclCent;
  const totaal = (e: number) => e + Math.round((e * pct) / 100 + 1e-9);
  let e = Math.round((inclCent * 100) / (100 + pct));
  while (e > 0 && totaal(e) > inclCent) e -= 1;
  while (totaal(e + 1) <= inclCent) e += 1;
  return e;
}

export function berekenAfrekening<R extends { aantal: number; eenheidsprijs: number; btw_pct: number }>(regels: R[], incl: boolean) {
  const rs = regels.map((r, i) => ({ r, i, pct: Number(r.btw_pct ?? 21), bedrag: Math.round((Number(r.aantal) || 0) * (Number(r.eenheidsprijs) || 0) * 100 + 1e-9) }));
  const groepen = new Map<number, number>();
  for (const x of rs) groepen.set(x.pct, (groepen.get(x.pct) || 0) + x.bedrag);
  const exclPer = new Map([...groepen].map(([pct, som]) => [pct, incl ? exclUitIncl(som, pct) : som] as const));
  const bedragExcl = new Map<number, number>();
  if (incl) {
    for (const [pct, excl] of exclPer) {
      const noemer = 100 + pct;
      const leden = rs.filter((x) => x.pct === pct).map((x) => ({ ...x, onder: Math.floor((x.bedrag * 100) / noemer), rest: (x.bedrag * 100) % noemer }));
      let extra = excl - leden.reduce((t, x) => t + x.onder, 0);
      leden.sort((a, b) => Number(b.bedrag > 0) - Number(a.bedrag > 0) || b.rest - a.rest || a.i - b.i);
      for (const x of leden) {
        const plus = extra > 0 && x.bedrag > 0 ? 1 : 0;
        bedragExcl.set(x.i, x.onder + plus);
        extra -= plus;
      }
    }
  }
  let excl = 0, btw = 0, som = 0;
  for (const [pct, e] of exclPer) { excl += e; btw += Math.round((e * pct) / 100 + 1e-9); som += groepen.get(pct) ?? 0; }
  return {
    regels: rs.map((x) => ({ ...x.r, bedrag: x.bedrag / 100, bedrag_excl: (incl ? bedragExcl.get(x.i) ?? 0 : x.bedrag) / 100 })),
    totaal_excl: excl / 100, btw: btw / 100, totaal_incl: (excl + btw) / 100,
    ...(incl ? { prijzen: 'incl_btw' as const, totaal_tarief: som / 100, afronding: (excl + btw - som) / 100 } : {}),
  };
}

export const euro = (n: number | null | undefined) =>
  `€ ${Number(n || 0).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const uren = (n: number | null | undefined) =>
  tx('{n} u', { n: Number(n || 0).toLocaleString(locale(), { maximumFractionDigits: 2 }) });
export const nl = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
export const getal = (v: string) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && String(v).trim() !== '' ? n : NaN;
};
