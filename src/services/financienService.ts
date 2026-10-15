import { supabase } from '@/lib/supabase';
import { haalInStukken } from '@/lib/inStukken';
import type { FinancienKpi, FinFactuur, FinKost, KlantKosten, KostRoute } from '@/lib/financienLogica';
import { verdeelPerKlant } from '@/lib/financienLogica';
import { bouwKostenOverzicht, naarProjectKost, type ProjectJobCost } from '@/lib/projectKostenLogica';

/**
 * De bronnen van Financiën — dezelfde als `RevenuePage` in het dashboard:
 *
 *   tegels      `bb_financien_kpi(p_van, p_tot)` (security invoker, dus RLS
 *               blijft gelden; er gaat bewust geen company_id mee)
 *   grafiek     facturen + geboekte kosten (`job_costs` zonder
 *               werkbon_materiaal_id; `alleenGeboekt` in het dashboard)
 *   per klant   facturen + `getKostenOverzichtPerKlant`: projecten, werkbonnen,
 *               deals, project_kosten, werkbon_uren en de spiegelregels van
 *               werkbonmateriaal (met inkoopprijs)
 *
 * Elke bedrijfsbrede lijst die wordt opgeteld gaat in stukken van 1000
 * (`haalInStukken`): PostgREST kapt anders stil af en de som komt te laag uit.
 * Alleen lezen.
 */

type Res<T> = { data: T; error: string | null };

async function lees<T>(
  tabel: string,
  kolommen: string,
  context: string,
  /** Alleen de spiegelregels van werkbonmateriaal, of juist zonder (de boekingen). */
  werkbonMateriaal?: 'alleen' | 'zonder',
): Promise<{ data: T[]; error: { message: string } | null }> {
  const res = await haalInStukken<T, { message: string }>((van, tot) => {
    const basis = supabase.from(tabel).select(kolommen);
    const q =
      werkbonMateriaal === 'alleen'
        ? basis.not('werkbon_materiaal_id', 'is', null)
        : werkbonMateriaal === 'zonder'
          ? basis.is('werkbon_materiaal_id', null)
          : basis;
    return q
      .order('id', { ascending: true })
      .range(van, tot)
      .then((r) => ({ data: (r.data as unknown as T[] | null) ?? null, error: r.error }));
  });
  if (res.error) console.warn(`[financienService.${context}]`, res.error.message);
  return res;
}

const getal = (v: unknown) => Number(v ?? 0) || 0;

/** De zes tegels uit de database, voor een tijdvak (ISO-datums, inclusief). */
export async function getFinancienKpi(bereik: { van: string; tot: string }): Promise<Res<FinancienKpi | null>> {
  const { data, error } = await supabase.rpc('bb_financien_kpi', { p_van: bereik.van, p_tot: bereik.tot });
  if (error) {
    console.warn('[financienService.getFinancienKpi]', error.message);
    return { data: null, error: 'De cijfers konden niet worden geladen.' };
  }
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    data: {
      gefactureerd: getal(d.gefactureerd),
      ontvangen: getal(d.ontvangen),
      openstaand: getal(d.openstaand),
      teVerwachten: getal(d.te_verwachten),
      kosten: getal(d.kosten),
    },
    error: null,
  };
}

/** Alle facturen van het bedrijf, alleen de kolommen die Financiën optelt. */
export async function listFinancienFacturen(): Promise<Res<FinFactuur[]>> {
  const { data, error } = await lees<FinFactuur>(
    'facturen',
    'id, customer_id, status, totaal_incl, totaal_excl, factuurdatum, betaald_op, is_credit, gecrediteerd, credit_van_factuur_id',
    'listFinancienFacturen',
  );
  return error ? { data: [], error: 'Facturen konden niet worden geladen.' } : { data, error: null };
}

/** De geboekte kosten (de boekhouding), zonder de spiegelregels van werkbonmateriaal. */
export async function listGeboekteKosten(): Promise<Res<FinKost[]>> {
  const { data, error } = await lees<{ amount: number | null; cost_date: string | null; created_at: string | null }>(
    'job_costs',
    'id, amount, cost_date, created_at',
    'listGeboekteKosten',
    'zonder',
  );
  if (error) return { data: [], error: 'Kosten konden niet worden geladen.' };
  return {
    data: data.map((r) => ({
      amount: Number(r.amount) || 0,
      datum: r.cost_date || r.created_at?.slice(0, 10) || null,
    })),
    error: null,
  };
}

type RuweMateriaalKost = KostRoute & {
  id: string;
  description: string | null;
  amount: number | null;
  cost_date: string | null;
  werkbon_materiaal_id: string | null;
  werkbon_materialen?: MateriaalRel | MateriaalRel[] | null;
};
type MateriaalRel = {
  aantal: number | null;
  werkbon_materiaal_inkoop?: { inkoopprijs_per: number | null } | { inkoopprijs_per: number | null }[] | null;
};

const eerste = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

function naarJobCost(r: RuweMateriaalKost): ProjectJobCost {
  const m = eerste(r.werkbon_materialen);
  const inkoop = eerste(m?.werkbon_materiaal_inkoop);
  return {
    id: r.id,
    description: r.description,
    amount: Number(r.amount) || 0,
    cost_date: r.cost_date,
    werkbon_materiaal_id: r.werkbon_materiaal_id,
    materiaalAantal: m?.aantal != null ? Number(m.aantal) : null,
    inkoopprijsPer: inkoop?.inkoopprijs_per != null ? Number(inkoop.inkoopprijs_per) : null,
  };
}

/**
 * Materiaal, inkopen en uren per klant — `getKostenOverzichtPerKlant` van het
 * dashboard. Boekingen tellen daar niet mee in het totaal (dezelfde inkoop zit
 * al in het werkbonmateriaal), dus hier worden alleen de spiegelregels van
 * werkbonmateriaal opgehaald. Die zijn, net als in het dashboard, alleen
 * zichtbaar met het recht `inkoopprijzen` (RLS).
 */
export async function getKostenPerKlant(customerIds: string[]): Promise<Res<Map<string, KlantKosten> | null>> {
  const BASIS =
    'id, description, amount, cost_date, werkbon_materiaal_id, customer_id, project_id, werkbon_id, deal_id';
  const [projecten, werkbonnen, deals, pk, uren] = await Promise.all([
    lees<{ id: string; customer_id: string | null }>('projects', 'id, customer_id', 'projecten'),
    lees<{ id: string; project_id: string | null; customer_id: string | null }>(
      'werkbonnen',
      'id, project_id, customer_id',
      'werkbonnen',
    ),
    lees<{ id: string; customer_id: string | null }>('deals', 'id, customer_id', 'deals'),
    lees<Record<string, unknown>>('project_kosten', '*', 'projectKosten'),
    lees<{ id: string; uren: number | null; reis_km: number | null; werkbon_id: string | null }>(
      'werkbon_uren',
      'id, uren, reis_km, werkbon_id',
      'werkbonUren',
    ),
  ]);
  let jc = await lees<RuweMateriaalKost>(
    'job_costs',
    `${BASIS}, werkbon_materialen!werkbon_materiaal_id ( aantal, werkbon_materiaal_inkoop ( inkoopprijs_per ) )`,
    'materiaal',
    'alleen',
  );
  // Kent de API de materiaalrelatie niet, dan weigert hij de hele select:
  // liever materiaal zonder inkoopprijs dan geen overzicht (zoals het dashboard).
  if (jc.error) jc = await lees<RuweMateriaalKost>('job_costs', BASIS, 'materiaal', 'alleen');

  const fout = projecten.error ?? werkbonnen.error ?? deals.error ?? pk.error ?? uren.error ?? jc.error;
  if (fout) return { data: null, error: 'De kosten per klant konden niet worden geladen.' };

  const projectKosten = pk.data.map((r) => naarProjectKost(r));
  const per = verdeelPerKlant(customerIds, {
    projecten: projecten.data,
    werkbonnen: werkbonnen.data,
    deals: deals.data,
    jobCosts: jc.data,
    projectKosten,
    uren: uren.data,
  });
  const uit = new Map<string, KlantKosten>();
  for (const [cid, bron] of per) {
    const o = bouwKostenOverzicht({
      jobCosts: bron.jobCosts.map(naarJobCost),
      projectKosten: bron.projectKosten,
      urenRegels: bron.uren,
    });
    uit.set(cid, { materiaal: o.materiaal.bedrag, inkopen: o.inkopen.bedrag, uren: o.uren.uren, totaal: o.totaal });
  }
  return { data: uit, error: null };
}
