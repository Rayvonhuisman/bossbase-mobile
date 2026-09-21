import { supabase } from '@/lib/supabase';
import { isReadonly, withCompanyId } from '@/lib/sessionContext';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';

/**
 * Pipeline: `deals` + `pipeline_stages` — dezelfde tabellen als het dashboard.
 *
 * Twee dingen die de vorige versie stuk maakten, allebei geverifieerd tegen de
 * live database:
 *
 * 1. `next_activity` en `next_date` bestaan niet op `deals`. Elke aanroep gaf
 *    42703 en het scherm meldde "Deals konden niet worden geladen".
 * 2. `deals` heeft TWEE foreign keys naar `customers` (`deals_customer_id_fkey`
 *    en `fk_deals_customer`, allebei op `customer_id`). Een embed zonder
 *    expliciete FK-naam laat PostgREST afketsen op "more than one
 *    relationship". Het dashboard schrijft daarom overal
 *    `customers!deals_customer_id_fkey`, en dat doen wij nu ook.
 *
 * RLS: SELECT/INSERT/UPDATE vragen het recht `verkoop`; DELETE vraagt rol
 * admin. Op INSERT staat de read-onlygate.
 */

const DEAL_COLUMNS = `
  id, company_id, customer_id, stage_id, title, description,
  expected_revenue, final_revenue, status, priority, lost_reason,
  assigned_to, created_at,
  customer:customers!deals_customer_id_fkey ( id, name, city )
`;

const STAGE_COLUMNS = 'id, company_id, name, position, color_class';

export type DealPriority = 'low' | 'med' | 'high' | (string & {});

export type DealRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  stage_id: string | null;
  title: string | null;
  description: string | null;
  expected_revenue: number | null;
  final_revenue: number | null;
  status: string | null;
  priority: DealPriority | null;
  lost_reason: string | null;
  assigned_to: string | null;
  created_at: string;
  customer: { id: string; name: string | null; city: string | null } | null;
};

export type PipelineStage = {
  id: string;
  company_id: string;
  name: string | null;
  position: number | null;
  color_class: string | null;
};

/** De prioriteiten zoals het dashboard ze kent. 'med' is de standaard. */
export const DEAL_PRIORITEITEN: { id: DealPriority; label: string }[] = [
  { id: 'low', label: 'Laag' },
  { id: 'med', label: 'Normaal' },
  { id: 'high', label: 'Hoog' },
];

export function prioriteitLabel(p: string | null | undefined): string {
  return DEAL_PRIORITEITEN.find((x) => x.id === p)?.label ?? 'Normaal';
}

export async function listPipelineStages(): Promise<{
  data: PipelineStage[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select(STAGE_COLUMNS)
    .order('position', { ascending: true });

  if (error) {
    console.warn('[dealService.listPipelineStages]', error.message);
    return { data: [], error: 'Pipeline-fasen konden niet worden geladen.' };
  }
  return { data: (data as unknown as PipelineStage[]) ?? [], error: null };
}

export async function listDeals(
  limit = 200,
): Promise<{ data: DealRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('deals')
    .select(DEAL_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[dealService.listDeals]', error.message);
    return { data: [], error: 'Deals konden niet worden geladen.' };
  }
  return { data: (data as unknown as DealRow[]) ?? [], error: null };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export type DealInput = {
  title: string;
  customer_id?: string | null;
  stage_id?: string | null;
  expected_revenue?: number | null;
  description?: string | null;
  priority?: DealPriority;
};

function valideerDeal(input: Partial<DealInput>, nieuw: boolean): string | null {
  if ((nieuw || input.title !== undefined) && !input.title?.trim()) {
    return 'Geef de deal een titel.';
  }
  if (
    input.expected_revenue !== undefined &&
    input.expected_revenue !== null &&
    (!Number.isFinite(input.expected_revenue) || input.expected_revenue < 0)
  ) {
    return 'Vul een geldig bedrag in.';
  }
  return null;
}

export async function createDeal(input: DealInput): Promise<WriteResult<DealRow>> {
  const fout = valideerDeal(input, true);
  if (fout) return writeFout('validatie', fout);

  const bedrag = Number(input.expected_revenue ?? 0);
  const basis: Record<string, unknown> = {
    title: input.title.trim(),
    customer_id: input.customer_id || null,
    // stage_id is een uuid; een slug zou de insert laten falen in plaats van
    // de kolomdefault te gebruiken. Zelfde controle als het dashboard.
    stage_id: isUuid(input.stage_id) ? input.stage_id : null,
    expected_revenue: Number.isFinite(bedrag) ? bedrag : 0,
    description: input.description?.trim() || null,
    priority: input.priority || 'med',
  };
  // null eruit zodat de kolomdefaults gelden voor optionele velden.
  Object.keys(basis).forEach((k) => basis[k] === null && delete basis[k]);

  const payload = withCompanyId(basis);
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  return schrijf<DealRow>(() => supabase.from('deals').insert(payload).select(DEAL_COLUMNS), {
    context: 'dealService.createDeal',
    bedrijfReadonly: isReadonly(),
    leegMelding:
      'De deal is niet opgeslagen. Je hebt het recht Verkooppijplijn nodig om deals aan te maken.',
  });
}

export async function updateDeal(
  id: string,
  input: Partial<DealInput>,
): Promise<WriteResult<DealRow>> {
  const fout = valideerDeal(input, false);
  if (fout) return writeFout('validatie', fout);

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.customer_id !== undefined) updates.customer_id = input.customer_id || null;
  if (input.stage_id !== undefined) updates.stage_id = isUuid(input.stage_id) ? input.stage_id : null;
  if (input.expected_revenue !== undefined) {
    updates.expected_revenue = Number(input.expected_revenue ?? 0);
  }
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.priority !== undefined) updates.priority = input.priority;

  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

  return schrijf<DealRow>(
    () => supabase.from('deals').update(updates).eq('id', id).select(DEAL_COLUMNS),
    { context: 'dealService.updateDeal', bedrijfReadonly: isReadonly() },
  );
}

/** Deal naar een andere fase — `updateDealStage` uit het dashboard. */
export async function updateDealStage(
  id: string,
  stageId: string,
): Promise<WriteResult<DealRow>> {
  if (!isUuid(stageId)) return writeFout('validatie', 'Onbekende fase.');
  return schrijf<DealRow>(
    () => supabase.from('deals').update({ stage_id: stageId }).eq('id', id).select(DEAL_COLUMNS),
    { context: 'dealService.updateDealStage', bedrijfReadonly: isReadonly() },
  );
}

/**
 * Deal als verloren markeren: naar de verloren-fase én de reden vastleggen.
 * Zelfde regel als `markDealLost`: alleen het schone label in `lost_reason`,
 * zodat het databasefilter op de instelbare lijst blijft matchen.
 */
export async function markDealLost(
  id: string,
  stageId: string,
  reden: string | null,
): Promise<WriteResult<DealRow>> {
  if (!isUuid(stageId)) return writeFout('validatie', 'Er is geen verloren-fase ingesteld.');
  const lost_reason = reden?.trim() || null;
  return schrijf<DealRow>(
    () =>
      supabase
        .from('deals')
        .update({ stage_id: stageId, lost_reason })
        .eq('id', id)
        .select(DEAL_COLUMNS),
    { context: 'dealService.markDealLost', bedrijfReadonly: isReadonly() },
  );
}

export async function deleteDeal(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('deals').delete().eq('id', id).select('id'),
    {
      context: 'dealService.deleteDeal',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'Alleen een beheerder kan een deal verwijderen.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

/** De instelbare verliesredenen van dit bedrijf (tabel `lost_reasons`). */
export async function listLostReasons(): Promise<{ data: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('lost_reasons')
    .select('label')
    .order('position', { ascending: true });
  if (error) {
    // Geen redenenlijst is geen blokkade: verliezen kan ook zonder reden.
    if (__DEV__) console.log('[dealService.listLostReasons]', error.message);
    return { data: [], error: null };
  }
  return { data: ((data as { label: string }[]) ?? []).map((r) => r.label), error: null };
}
