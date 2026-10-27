import { supabase } from '@/lib/supabase';
import { getUserId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { haalInStukken } from '@/lib/inStukken';
import { lokaleDatum } from '@/lib/nlTijd';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import type { VervolgActiviteit } from '@/lib/pipelineLogica';

/**
 * Pipeline: `deals` + `pipeline_stages` — dezelfde tabellen als het dashboard.
 *
 * - `deals` heeft twee foreign keys naar `customers`; de embed moet daarom
 *   expliciet `customers!deals_customer_id_fkey` noemen.
 * - De status (`open | won | lost`) zet de database zelf uit de fase, via de
 *   trigger `bb_deal_status_uit_fase`. De app schrijft alleen de fase, behalve
 *   bij verliezen (status 'lost') en bij heropenen van een verloren deal
 *   (status 'open', anders houdt de trigger hem op 'lost') — precies zoals het
 *   dashboard (`markDealLost`, `heropenVerlorenDeal`).
 * - "Project voltooien" is `afgerond_op`, geen fase.
 *
 * RLS: SELECT/INSERT/UPDATE vragen het recht `verkoop`; DELETE vraagt rol
 * admin. Op INSERT staat de read-onlygate.
 */

const DEAL_COLUMNS = `
  id, company_id, customer_id, stage_id, title, description,
  expected_revenue, final_revenue, status, priority, lost_reason,
  assigned_to, assigned_to_ids, afgerond_op, created_at,
  customer:customers!deals_customer_id_fkey ( id, name, city, email, phone, kleur )
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
  assigned_to_ids: string[] | null;
  afgerond_op: string | null;
  created_at: string;
  customer: {
    id: string;
    name: string | null;
    city: string | null;
    email: string | null;
    phone: string | null;
    kleur?: string | null;
  } | null;
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
  { id: 'high', label: 'Hoog' },
  { id: 'med', label: 'Normaal' },
  { id: 'low', label: 'Laag' },
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

/** Alle deals (in stukken van 1000), nieuwste eerst — zoals `listDeals` in het dashboard. */
export async function listDeals(): Promise<{ data: DealRow[]; error: string | null }> {
  const { data, error } = await haalInStukken((van, tot) =>
    supabase
      .from('deals')
      .select(DEAL_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(van, tot),
  );

  if (error) {
    console.warn('[dealService.listDeals]', error.message);
    return { data: [], error: 'Aanvragen konden niet worden geladen.' };
  }
  return { data: (data as unknown as DealRow[]) ?? [], error: null };
}

export async function getDeal(id: string): Promise<{ data: DealRow | null; error: string | null }> {
  const { data, error } = await supabase.from('deals').select(DEAL_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    console.warn('[dealService.getDeal]', error.message);
    return { data: null, error: 'Aanvraag kon niet worden geladen.' };
  }
  return { data: (data as unknown as DealRow | null) ?? null, error: null };
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
  assigned_to_ids?: string[];
};

function valideerDeal(input: Partial<DealInput>, nieuw: boolean): string | null {
  if ((nieuw || input.title !== undefined) && !input.title?.trim()) {
    return 'Titel is verplicht.';
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

/**
 * Tijdlijnregel bij de klant, net als `logTijdlijnSafe` in het dashboard. Een
 * mislukte regel blokkeert de eigenlijke actie nooit.
 */
async function logTijdlijn(
  customerId: string | null | undefined,
  type: string,
  omschrijving: string,
  meta: Record<string, unknown> | null = null,
): Promise<void> {
  if (!customerId) return;
  try {
    const eigen = getUserId();
    const payload = withCompanyId({
      customer_id: customerId,
      type,
      omschrijving,
      aangemaakt_op: new Date().toISOString(),
      ...(meta ? { meta } : {}),
      ...(eigen ? { created_by: eigen } : {}),
    });
    if (!payload) return;
    await supabase.from('klant_tijdlijn').insert(payload);
  } catch {
    /* bewust stil */
  }
}

export async function createDeal(input: DealInput): Promise<WriteResult<DealRow>> {
  const fout = valideerDeal(input, true);
  if (fout) return writeFout('validatie', fout);

  const bedrag = Number(input.expected_revenue ?? 0);
  const eigenaren = (input.assigned_to_ids ?? []).filter(Boolean);
  const basis: Record<string, unknown> = {
    title: input.title.trim(),
    customer_id: input.customer_id || null,
    // stage_id is een uuid; een slug zou de insert laten falen in plaats van
    // de kolomdefault te gebruiken. Zelfde controle als het dashboard.
    stage_id: isUuid(input.stage_id) ? input.stage_id : null,
    expected_revenue: Number.isFinite(bedrag) ? bedrag : 0,
    description: input.description?.trim() || null,
    priority: input.priority || 'med',
    assigned_to_ids: eigenaren,
    assigned_to: eigenaren[0] ?? null,
  };
  // null eruit zodat de kolomdefaults gelden voor optionele velden.
  Object.keys(basis).forEach((k) => basis[k] === null && delete basis[k]);

  const payload = withCompanyId(basis);
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  const res = await schrijf<DealRow>(() => supabase.from('deals').insert(payload).select(DEAL_COLUMNS), {
    context: 'dealService.createDeal',
    bedrijfReadonly: isReadonly(),
    leegMelding:
      'De aanvraag is niet opgeslagen. Je hebt het recht Verkooppijplijn nodig om aanvragen aan te maken.',
  });
  if (res.ok) {
    void logTijdlijn(res.data.customer_id, 'deal_aangemaakt', `Aanvraag aangemaakt: ${res.data.title ?? ''}`, {
      dealId: res.data.id,
    });
  }
  return res;
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
  if (input.assigned_to_ids !== undefined) {
    const ids = input.assigned_to_ids.filter(Boolean);
    updates.assigned_to_ids = ids;
    updates.assigned_to = ids[0] ?? null;
  }

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
  const res = await schrijf<DealRow>(
    () => supabase.from('deals').update({ stage_id: stageId }).eq('id', id).select(DEAL_COLUMNS),
    { context: 'dealService.updateDealStage', bedrijfReadonly: isReadonly() },
  );
  if (res.ok) {
    void logTijdlijn(res.data.customer_id, 'deal_fase_gewijzigd', `Fase gewijzigd: ${res.data.title ?? ''}`, {
      dealId: res.data.id,
      // De database zet een heropende deal terug in de fase van vóór het
      // verlies (trigger bb_deal_fase_voor_verlies, migratie 20261002182736);
      // de meegestuurde fase is alleen het vangnet.
      stageId: res.data.stage_id ?? stageId,
    });
  }
  return res;
}

/** "Project voltooien" / "Heropenen": alleen `afgerond_op`, fase blijft staan. */
export async function zetDealAfgerond(id: string, afgerond: boolean): Promise<WriteResult<DealRow>> {
  return schrijf<DealRow>(
    () =>
      supabase
        .from('deals')
        .update({ afgerond_op: afgerond ? new Date().toISOString() : null })
        .eq('id', id)
        .select(DEAL_COLUMNS),
    { context: 'dealService.zetDealAfgerond', bedrijfReadonly: isReadonly() },
  );
}

/**
 * Verloren markeren: naar de verloren-fase, reden vastleggen en status 'lost'
 * (zoals `markDealLost`). Alleen het schone label in `lost_reason`; de
 * toelichting gaat naar de klant-tijdlijn.
 */
export async function markDealLost(
  id: string,
  stageId: string | null | undefined,
  reden: string | null,
  toelichting?: string | null,
): Promise<WriteResult<DealRow>> {
  if (!isUuid(stageId)) return writeFout('validatie', 'Geen "Verloren"-fase gevonden in de pipeline.');
  const lost_reason = reden?.trim() || null;
  if (!lost_reason) return writeFout('validatie', 'Kies een reden.');
  const res = await schrijf<DealRow>(
    () =>
      supabase
        .from('deals')
        .update({ stage_id: stageId, lost_reason, status: 'lost' })
        .eq('id', id)
        .select(DEAL_COLUMNS),
    { context: 'dealService.markDealLost', bedrijfReadonly: isReadonly() },
  );
  if (res.ok) {
    const noot = toelichting?.trim() || '';
    const label = [lost_reason, noot].filter(Boolean).join(' — ');
    void logTijdlijn(
      res.data.customer_id,
      'deal_verloren',
      `Aanvraag verloren: ${res.data.title ?? ''}${label ? ` (${label})` : ''}`,
      { dealId: res.data.id, stageId, reason: lost_reason, note: noot || null },
    );
  }
  return res;
}

/** Verloren deal terughalen: status expliciet 'open', anders blijft de trigger op 'lost'. */
export async function heropenVerlorenDeal(id: string, stageId: string): Promise<WriteResult<DealRow>> {
  if (!isUuid(stageId)) return writeFout('validatie', 'Onbekende fase.');
  const res = await schrijf<DealRow>(
    () =>
      supabase
        .from('deals')
        .update({ stage_id: stageId, status: 'open', lost_reason: null })
        .eq('id', id)
        .select(DEAL_COLUMNS),
    { context: 'dealService.heropenVerlorenDeal', bedrijfReadonly: isReadonly() },
  );
  if (res.ok) {
    void logTijdlijn(res.data.customer_id, 'deal_fase_gewijzigd', `Aanvraag heropend: ${res.data.title ?? ''}`, {
      dealId: res.data.id,
      // De database zet een heropende deal terug in de fase van vóór het
      // verlies (trigger bb_deal_fase_voor_verlies, migratie 20261002182736);
      // de meegestuurde fase is alleen het vangnet.
      stageId: res.data.stage_id ?? stageId,
    });
  }
  return res;
}

export async function deleteDeal(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('deals').delete().eq('id', id).select('id'),
    {
      context: 'dealService.deleteDeal',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'Alleen een beheerder kan een aanvraag verwijderen.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

/** De verliesredenen (tabel `lost_reasons`), met de vaste terugval van het dashboard. */
export const STANDAARD_VERLIESREDENEN = [
  'Te duur',
  'Gekozen voor concurrent',
  'Geen reactie',
  'Timing niet goed',
  'Anders',
];

export async function listLostReasons(): Promise<{ data: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('lost_reasons')
    .select('label')
    .order('position', { ascending: true });
  if (error) {
    if (__DEV__) console.log('[dealService.listLostReasons]', error.message);
    return { data: STANDAARD_VERLIESREDENEN, error: null };
  }
  const labels = ((data as { label: string }[]) ?? []).map((r) => r.label).filter(Boolean);
  return { data: labels.length ? labels : STANDAARD_VERLIESREDENEN, error: null };
}

// ── Activiteiten rond deals ────────────────────────────────────────────────

/**
 * Niet-afgeronde activiteiten met een deal of klant, voor de oranje stip
 * "geen vervolgactiviteit" op het bord. RLS bepaalt wat zichtbaar is, net als
 * `listActivities` in het dashboard.
 */
export async function listVervolgActiviteiten(): Promise<VervolgActiviteit[]> {
  const { data, error } = await haalInStukken((van, tot) =>
    supabase
      .from('activities')
      .select('id, deal_id, customer_id, completed, due_at')
      .eq('completed', false)
      .order('id', { ascending: true })
      .range(van, tot),
  );
  if (error) {
    if (__DEV__) console.log('[dealService.listVervolgActiviteiten]', error.message);
    return [];
  }
  type Rij = { deal_id: string | null; customer_id: string | null; completed: boolean; due_at: string | null };
  return ((data as Rij[]) ?? []).map((a) => ({
    deal_id: a.deal_id,
    customer_id: a.customer_id,
    completed: a.completed,
    dag: a.due_at ? lokaleDatum(a.due_at) : null,
  }));
}

export type DealActiviteit = {
  id: string;
  title: string | null;
  type: string | null;
  due_at: string | null;
  completed: boolean;
  deal_id: string | null;
  customer_id: string | null;
};

/** Activiteiten bij deze deal (en bij de klant ervan), nieuwste datum eerst. */
export async function listDealActiviteiten(
  dealId: string,
  customerId: string | null,
): Promise<{ data: DealActiviteit[]; error: string | null }> {
  const isId = (v: string | null): v is string => !!v && UUID_RE.test(v);
  if (!isId(dealId)) return { data: [], error: null };
  const filter = isId(customerId)
    ? `deal_id.eq.${dealId},customer_id.eq.${customerId}`
    : `deal_id.eq.${dealId}`;
  const { data, error } = await supabase
    .from('activities')
    .select('id, title, type, due_at, completed, deal_id, customer_id')
    .or(filter)
    .order('due_at', { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) {
    console.warn('[dealService.listDealActiviteiten]', error.message);
    return { data: [], error: 'Activiteiten konden niet worden geladen.' };
  }
  return { data: (data as unknown as DealActiviteit[]) ?? [], error: null };
}
