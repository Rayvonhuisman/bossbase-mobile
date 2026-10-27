import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/sessionContext';
import { haalInStukken } from '@/lib/inStukken';
import type {
  DatabaseData,
  DbActiviteit,
  DbDeal,
  DbFactuur,
  DbKlant,
  DbMail,
  DbOfferte,
  DbProject,
  DbUur,
} from '@/lib/databaseFilters';

/**
 * Database & Export — dezelfde bronnen als `DatabasePage.jsx`:
 * klanten, projecten, facturen, offertes, deals, activiteiten, verstuurde
 * mails (`sent_emails`), werkbonuren (factureerbare uren), profielen
 * (medewerkerfilter), pipelinefasen, verloren-redenen, mailtypes en
 * `get_accounting_status` (welke boekhoudkoppelingen actief zijn).
 *
 * Alles in stukken van 1000 (`haalInStukken`). Een bron die de gebruiker niet
 * mag lezen (bijvoorbeeld facturen zonder dat recht) komt via RLS leeg terug;
 * dat is geen fout. Een echte fout per bron wordt gemeld in `fouten`, zodat
 * de rest van de pagina gewoon werkt.
 */

export type DatabaseExtra = {
  medewerkers: { id: string; naam: string }[];
  fasen: { id: string; naam: string }[];
  verlorenRedenen: string[];
  mailTypes: { id: string; label: string }[];
  boekhouding: Set<string>;
};

type Res<T> = { data: T[]; error: { message: string } | null };

async function stukken<T>(
  maak: (van: number, tot: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<Res<T>> {
  const r = await haalInStukken(maak as (van: number, tot: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>);
  return { data: r.data, error: r.error };
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

export async function laadDatabase(): Promise<{
  data: DatabaseData;
  extra: DatabaseExtra;
  fouten: string[];
  error: string | null;
}> {
  const companyId = getCompanyId();
  const leeg: DatabaseData = {
    klanten: [],
    projecten: [],
    facturen: [],
    offertes: [],
    deals: [],
    activiteiten: [],
    mails: [],
    uren: [],
  };
  const extraLeeg: DatabaseExtra = {
    medewerkers: [],
    fasen: [],
    verlorenRedenen: [],
    mailTypes: [],
    boekhouding: new Set(),
  };
  if (!companyId) return { data: leeg, extra: extraLeeg, fouten: [], error: null };

  const [
    klantRes,
    projRes,
    factRes,
    offRes,
    dealRes,
    actRes,
    mailRes,
    urenRes,
    profRes,
    faseRes,
    redenRes,
    tplRes,
    accRes,
  ] = await Promise.all([
    stukken<Record<string, unknown>>((van, tot) =>
      supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(van, tot),
    ),
    stukken<Record<string, unknown>>((van, tot) =>
      supabase
        .from('projects')
        .select('id, customer_id, name, status, start_date, deadline, quoted_hours, owner_id, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(van, tot),
    ),
    stukken<Record<string, unknown>>((van, tot) =>
      supabase
        .from('facturen')
        .select(
          'id, customer_id, status, factuurdatum, vervaldatum, totaal_incl, betaald_op, herinnering_1_verstuurd_at, herinnering_2_verstuurd_at, is_credit, gecrediteerd',
        )
        .order('id', { ascending: true })
        .range(van, tot),
    ),
    stukken<Record<string, unknown>>((van, tot) =>
      supabase
        .from('offertes')
        .select('id, customer_id, status, geldig_tot, totaal_incl, signed_at, created_at')
        .order('id', { ascending: true })
        .range(van, tot),
    ),
    stukken<Record<string, unknown>>((van, tot) =>
      supabase
        .from('deals')
        .select('id, customer_id, stage_id, expected_revenue, final_revenue, lost_reason')
        .order('id', { ascending: true })
        .range(van, tot),
    ),
    stukken<Record<string, unknown>>((van, tot) =>
      supabase
        .from('activities')
        .select('id, customer_id, type, due_at, completed')
        .not('customer_id', 'is', null)
        .order('id', { ascending: true })
        .range(van, tot),
    ),
    stukken<Record<string, unknown>>((van, tot) =>
      supabase
        .from('sent_emails')
        .select('id, customer_id, subject, sent_at, related_type')
        .eq('company_id', companyId)
        .order('id', { ascending: true })
        .range(van, tot),
    ),
    stukken<Record<string, unknown>>((van, tot) =>
      supabase
        .from('werkbon_uren')
        .select('id, uren, werkbonnen(customer_id, project_id)')
        .eq('company_id', companyId)
        .order('id', { ascending: true })
        .range(van, tot),
    ),
    supabase.from('profiles').select('id, full_name').eq('company_id', companyId),
    supabase.from('pipeline_stages').select('id, name, position').order('position', { ascending: true }),
    supabase.from('lost_reasons').select('label, position').order('position', { ascending: true }),
    supabase.from('email_templates').select('type, name').order('type', { ascending: true }),
    supabase.rpc('get_accounting_status'),
  ]);

  if (klantRes.error) {
    console.warn('[databaseService] klanten', klantRes.error.message);
    return { data: leeg, extra: extraLeeg, fouten: [], error: 'Laden mislukt' };
  }

  const fouten: string[] = [];
  const meld = (r: { error: { message: string } | null }, wat: string) => {
    if (r.error) {
      if (__DEV__) console.log(`[databaseService] ${wat}`, r.error.message);
      fouten.push(`${wat} konden niet worden geladen; de filters daarop werken niet.`);
    }
  };
  meld(projRes, 'Projecten');
  meld(factRes, 'Facturen');
  meld(offRes, 'Offertes');
  meld(dealRes, 'Aanvragen');
  meld(actRes, 'Activiteiten');
  meld(mailRes, 'Verstuurde mails');
  meld(urenRes, 'Werkbonuren');

  const klanten: DbKlant[] = klantRes.data.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    address: (r.address as string) ?? null,
    postcode: (r.postcode as string) ?? null,
    city: (r.city as string) ?? null,
    kvk_number: (r.kvk_number as string) ?? null,
    btw_number: (r.btw_number as string) ?? null,
    iban: (r.iban as string) ?? null,
    type: (r.type as string) ?? 'Klant',
    source: (r.source as string) ?? null,
    moneybird_id: (r.moneybird_id as string) ?? null,
    created_at: (r.created_at as string) ?? null,
  }));

  const uren: (DbUur & { uren: number })[] = urenRes.data.map((r) => {
    const wb = (Array.isArray(r.werkbonnen) ? r.werkbonnen[0] : r.werkbonnen) as
      | { customer_id?: string | null; project_id?: string | null }
      | null;
    return { customer_id: wb?.customer_id ?? null, project_id: wb?.project_id ?? null, uren: num(r.uren) };
  });
  const urenPerProject = new Map<string, number>();
  for (const u of uren) {
    if (u.project_id) urenPerProject.set(u.project_id, (urenPerProject.get(u.project_id) ?? 0) + u.uren);
  }

  const projecten: DbProject[] = projRes.data.map((r) => ({
    id: String(r.id),
    customer_id: (r.customer_id as string) ?? null,
    name: String(r.name ?? ''),
    status: String(r.status ?? 'gepland'),
    start_date: (r.start_date as string) ?? null,
    deadline: (r.deadline as string) ?? null,
    quoted_hours: num(r.quoted_hours),
    used_hours: urenPerProject.get(String(r.id)) ?? 0,
    owner_id: (r.owner_id as string) ?? null,
    created_at: (r.created_at as string) ?? null,
  }));

  const facturen: DbFactuur[] = factRes.data.map((r) => ({
    id: String(r.id),
    customer_id: (r.customer_id as string) ?? null,
    status: String(r.status ?? 'concept'),
    factuurdatum: (r.factuurdatum as string) ?? null,
    vervaldatum: (r.vervaldatum as string) ?? null,
    totaal_incl: num(r.totaal_incl),
    betaald_op: (r.betaald_op as string) ?? null,
    herinnering_1_verstuurd_at: (r.herinnering_1_verstuurd_at as string) ?? null,
    herinnering_2_verstuurd_at: (r.herinnering_2_verstuurd_at as string) ?? null,
    is_credit: r.is_credit === true,
    gecrediteerd: r.gecrediteerd === true,
  }));

  const offertes: DbOfferte[] = offRes.data.map((r) => ({
    id: String(r.id),
    customer_id: (r.customer_id as string) ?? null,
    status: String(r.status ?? 'concept'),
    geldig_tot: (r.geldig_tot as string) ?? null,
    totaal_incl: num(r.totaal_incl),
    signed_at: (r.signed_at as string) ?? null,
    created_at: (r.created_at as string) ?? null,
  }));

  const deals: DbDeal[] = dealRes.data.map((r) => ({
    id: String(r.id),
    customer_id: (r.customer_id as string) ?? null,
    stage_id: (r.stage_id as string) ?? null,
    value: num(r.expected_revenue ?? r.final_revenue),
    lost_reason: (r.lost_reason as string) || null,
  }));

  const activiteiten: DbActiviteit[] = actRes.data.map((r) => ({
    id: String(r.id),
    customer_id: (r.customer_id as string) ?? null,
    type: String(r.type ?? 'task'),
    due_at: (r.due_at as string) ?? null,
    completed: r.completed === true,
  }));

  const mails: DbMail[] = mailRes.data.map((r) => ({
    id: String(r.id),
    customer_id: (r.customer_id as string) ?? null,
    subject: (r.subject as string) ?? null,
    sent_at: (r.sent_at as string) ?? null,
    related_type: (r.related_type as string) ?? null,
  }));

  // Verloren-redenen: de instelbare lijst plus historische teksten op deals.
  const redenen = new Set<string>();
  for (const r of ((redenRes.data as { label: string | null }[]) ?? [])) if (r.label) redenen.add(r.label);
  for (const d of deals) if (d.lost_reason) redenen.add(d.lost_reason);

  const boekhouding = new Set<string>();
  for (const r of (Array.isArray(accRes.data) ? (accRes.data as { provider: string; connected: boolean }[]) : [])) {
    if (r.connected) boekhouding.add(r.provider);
  }

  const tplTypes = new Map<string, string>();
  for (const t of ((tplRes.data as { type: string; name: string | null }[]) ?? [])) {
    if (t.type && !tplTypes.has(t.type)) tplTypes.set(t.type, t.name || t.type);
  }

  return {
    data: {
      klanten,
      projecten,
      facturen,
      offertes,
      deals,
      activiteiten,
      mails,
      uren: uren.map(({ customer_id, project_id }) => ({ customer_id, project_id })),
    },
    extra: {
      medewerkers: ((profRes.data as { id: string; full_name: string | null }[]) ?? [])
        .filter((p) => p.full_name)
        .map((p) => ({ id: p.id, naam: p.full_name as string })),
      fasen: ((faseRes.data as { id: string; name: string | null }[]) ?? []).map((f) => ({
        id: f.id,
        naam: f.name ?? '',
      })),
      verlorenRedenen: [...redenen],
      mailTypes: [...tplTypes.entries()].map(([id, label]) => ({ id, label })),
      boekhouding,
    },
    fouten,
    error: null,
  };
}

/**
 * Na een export per klant een tijdlijnregel `export_uitgevoerd`, zoals het
 * dashboard (`logTijdlijnSafe`). Best-effort in één insert: mislukt het, dan
 * is de export zelf wel gelukt.
 */
export async function logExport(klantIds: readonly string[], wat: string): Promise<void> {
  const companyId = getCompanyId();
  if (!companyId || klantIds.length === 0) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const nu = new Date().toISOString();
  const rijen = klantIds.map((id) => ({
    company_id: companyId,
    customer_id: id,
    type: 'export_uitgevoerd',
    omschrijving: `Klantgegevens geëxporteerd als ${wat}`,
    aangemaakt_op: nu,
    ...(session?.user?.id ? { created_by: session.user.id } : {}),
  }));
  try {
    const { error } = await supabase.from('klant_tijdlijn').insert(rijen);
    if (error && __DEV__) console.log('[databaseService.logExport]', error.message);
  } catch {
    /* best-effort */
  }
}
