import { supabase } from '@/lib/supabase';
import { pushNotificaties } from './collegaMeldingService';
import { metTijdslimiet } from '@/lib/queryTijdslimiet';
import type {
  Role,
  WorkOrderMaterial,
  WorkOrderNote,
  WorkOrderPhoto,
  WorkOrderStatus,
  WorkOrderTask,
  WorkOrderWithRelations,
} from '@/types/domain';
import { haalInStukken } from '@/lib/inStukken';
import { lokaalNaarUtc, splitsLokaal } from '@/lib/nlTijd';
import { hhmm, type DagPayload, type WerkbonDag } from '@/lib/werkbonLogica';
import { idBatches, MATERIAAL_BEDRAG_VELDEN, vulBedragen } from '@/lib/bedragen';
import { magWerkbonRegelsBeheren } from '@/lib/werkbonRechten';
import { mentionMeldingen } from '@/lib/mentions';

/**
 * Een werkbonrij zoals WORK_ORDER_COLUMNS hem levert: de basisvorm uit
 * `types/domain` plus de dagen (werkbon_dagen) en de ondertekenvelden.
 */
export type Werkbon = WorkOrderWithRelations & {
  werkbon_dagen?: WerkbonDag[] | null;
  ondertekende_pdf_url?: string | null;
  verstuurd_naar_email?: string | null;
  verstuurd_op?: string | null;
  /** Publieke ondertekenlink (/werkbon/<token>); ook ter plekke tekenen loopt hierlangs. */
  sign_token?: string | null;
  handtekening_url?: string | null;
  ondertekend_door_email?: string | null;
};

/**
 * Columns selected from `werkbonnen`, verified against the live schema.
 *
 * The embedded relations use the real foreign keys:
 *   customers      ← werkbonnen_customer_id_fkey
 *   projects       ← werkbonnen_project_id_fkey
 *   profiles       ← werkbonnen_assigned_to_fkey (disambiguated explicitly,
 *                    because werkbonnen has several uuid columns and PostgREST
 *                    otherwise cannot pick the join)
 *
 * `assigned_to_ids` is a uuid[] and has no FK, so the names behind it are
 * resolved separately by `listTeamProfiles`.
 */
/**
 * Let op de voertuigen: die zitten NIET meer als embed in deze select.
 *
 * Het dashboard heeft `werkbonnen.voertuig_id` (één voertuig, met foreign key)
 * op 2026-09-16 vervangen door `werkbonnen.voertuig_ids` — een uuid[] zonder
 * FK, omdat er meerdere bussen per klus en per dag kunnen meerijden (migratie
 * `20260916120000_voertuigen_per_dag`). Een array heeft geen relatie, dus
 * PostgREST kan er niet op joinen:
 *
 *   PGRST200 — "Could not find a relationship between 'werkbonnen' and
 *   'voertuigen' in the schema cache"
 *
 * En omdat PostgREST een select als geheel afkeurt, faalde daarmee ÉLKE
 * werkbonquery in de app — de lijst, het detail, de agenda en de urenkiezer.
 * De namen achter `voertuig_ids` worden nu los opgehaald met `listVoertuigen`,
 * net als de namen achter `assigned_to_ids`.
 */
const WORK_ORDER_COLUMNS = `
  id, company_id, customer_id, deal_id, offerte_id, project_id, voertuig_ids,
  activity_id, nummer, assigned_to, assigned_to_ids, verantwoordelijke_ids,
  titel, omschrijving, status, gepland_op, starttijd, eindtijd, locatie,
  notes, werkbon_notities, gestart_op, afgerond_op,
  ondertekend_op, ondertekend_door_naam, ondertekend_door_email, ondertekende_pdf_url,
  handtekening_url, sign_token, verstuurd_naar_email, verstuurd_op, created_at, updated_at,
  werkbon_dagen ( id, datum, starttijd, eindtijd, medewerker_ids, medewerker_tijden,
    voertuig_ids, voertuig_tijden, medewerker_voertuig ),
  customer:customers (
    id, name, email, phone, address, postcode, city
  ),
  project:projects ( id, name ),
  toegewezen:profiles!werkbonnen_assigned_to_fkey ( id, full_name )
`;

/**
 * Turns a Supabase error into a message a field worker can act on, and keeps
 * the technical detail in the dev console.
 */
function describeError(where: string, error: { code?: string; message?: string; hint?: string | null; details?: string | null }): string {
  if (__DEV__) {
    console.log(`[workOrderService.${where}]`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
  const msg = error.message ?? '';
  // Geen antwoord binnen de tijdslimiet (zie lib/queryTijdslimiet): een echte
  // fout, géén lege lijst — anders blijft het scherm eindeloos laden.
  if (error.code === 'timeout') return msg;
  // PGRST200/PGRST204: de select vraagt een relatie of kolom die niet (meer)
  // bestaat. Dat is geen gebruikersfout maar een verouderde query, en die
  // verdient een melding die dat zegt in plaats van "probeer het opnieuw".
  if (error.code === 'PGRST200' || error.code === 'PGRST204' || error.code === '42703') {
    return 'De app vroeg gegevens op die niet meer bestaan. Werk de app bij.';
  }
  if (error.code === '42501' || error.code === 'PGRST301' || /row-level security|permission denied/i.test(msg)) {
    return 'Je hebt geen rechten voor deze actie.';
  }
  // Raised by trigger bb_werkbon_op_slot on a signed work order.
  if (/op slot/i.test(msg)) return msg;
  if (/JWT|token/i.test(msg)) return 'Je sessie is verlopen. Log opnieuw in.';
  return 'Er ging iets mis bij het ophalen. Probeer het opnieuw.';
}

/** Privébucket met de werkbonfoto's. Weergave loopt via signed URLs. */
const FOTO_BUCKET = 'werkbon-fotos';
/** Levensduur van een signed URL, gelijk aan het dashboard (1 uur). */
const SIGNED_URL_SECONDEN = 3600;

export type ListWorkOrdersOptions = {
  /**
   * Restrict to jobs this user works on. Matches BOTH the legacy `assigned_to`
   * column and the `assigned_to_ids` array — the live data uses the array and
   * leaves `assigned_to` NULL on most rows, so filtering on the column alone
   * returns an empty list for exactly the people who need the app most.
   */
  assignedToUserId?: string | null;
  /** Alleen de werkbonnen van één klant; de server filtert, niet de app. */
  customerId?: string;
};

/** PostgREST `or` filter that matches either assignment model. */
function assignedFilter(userId: string): string {
  return `assigned_to.eq.${userId},assigned_to_ids.cs.{${userId}}`;
}

export async function listWorkOrders(
  opts: ListWorkOrdersOptions = {},
): Promise<{ data: Werkbon[]; error: string | null }> {
  // In stukken van 1000 (zie lib/inStukken), elk met de tijdslimiet. `id` als
  // laatste sortering, zodat geen rij tussen twee stukken verschuift.
  const { data, error } = await haalInStukken((van, tot) => {
    let query = supabase
      .from('werkbonnen')
      .select(WORK_ORDER_COLUMNS)
      .order('gepland_op', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true });
    if (opts.assignedToUserId) {
      query = query.or(assignedFilter(opts.assignedToUserId));
    }
    if (opts.customerId) query = query.eq('customer_id', opts.customerId);
    return metTijdslimiet((signal) => query.range(van, tot).abortSignal(signal));
  });
  if (error) {
    return { data: [], error: describeError('listWorkOrders', error) };
  }
  const rijen = (data as unknown as Werkbon[]) ?? [];
  if (__DEV__) console.log('[workOrderService.listWorkOrders] rijen:', rijen.length);
  return { data: rijen, error: null };
}

/**
 * Work orders planned within a date range, for the Planning page.
 *
 * `werkbonnen.gepland_op` is a Postgres `date` (not timestamptz), so the bounds
 * must be local calendar dates (`YYYY-MM-DD`), NOT ISO instants. Rows with a
 * null `gepland_op` are excluded (they aren't planned yet). RLS scopes to the
 * caller's company.
 */
export async function listWorkOrdersForPlanningRange(
  fromDate: string,
  toDate: string,
  opts: ListWorkOrdersOptions = {},
): Promise<{ data: WorkOrderWithRelations[]; error: string | null }> {
  let query = supabase
    .from('werkbonnen')
    .select(WORK_ORDER_COLUMNS)
    .gte('gepland_op', fromDate)
    .lte('gepland_op', toDate)
    .order('gepland_op', { ascending: true })
    .order('starttijd', { ascending: true, nullsFirst: true });

  if (opts.assignedToUserId) {
    query = query.or(assignedFilter(opts.assignedToUserId));
  }

  const { data, error } = await metTijdslimiet((signal) => query.abortSignal(signal));
  if (error) {
    return { data: [], error: describeError('listWorkOrdersForPlanningRange', error) };
  }
  return { data: (data as unknown as WorkOrderWithRelations[]) ?? [], error: null };
}

export async function getWorkOrder(
  id: string,
): Promise<{ data: Werkbon | null; error: string | null }> {
  const { data, error } = await metTijdslimiet((signal) =>
    supabase
      .from('werkbonnen')
      .select(WORK_ORDER_COLUMNS)
      .eq('id', id)
      .abortSignal(signal)
      .maybeSingle(),
  );

  if (error) {
    return { data: null, error: describeError('getWorkOrder', error) };
  }
  // No error and no row means RLS filtered it out, or it does not exist.
  return { data: (data as unknown as Werkbon) ?? null, error: null };
}

/**
 * Namen en kleuren achter `werkbonnen.voertuig_ids`.
 *
 * Sinds het dashboard voertuigen per dag inplant is dat een uuid[] zonder
 * foreign key; embedden kan dus niet meer. Eén losse query met `.in('id', …)`
 * levert hetzelfde op, en mislukt hij, dan blijft de werkbon gewoon staan —
 * zonder busnaam, maar zichtbaar.
 */
export async function listVoertuigen(
  ids: string[],
): Promise<{
  data: Record<string, { naam: string; kleur: string | null; zitplaatsen: number | null }>;
  error: string | null;
}> {
  const uniek = Array.from(new Set(ids.filter(Boolean)));
  if (uniek.length === 0) return { data: {}, error: null };

  // `*`: `zitplaatsen` kwam later (dashboard voertuigService); zonder die kolom
  // blijft de bezetting gewoon weg.
  const { data, error } = await metTijdslimiet((signal) =>
    supabase.from('voertuigen').select('*').in('id', uniek).abortSignal(signal),
  );

  if (error) {
    return { data: {}, error: describeError('listVoertuigen', error) };
  }
  const map: Record<string, { naam: string; kleur: string | null; zitplaatsen: number | null }> = {};
  for (const row of (data as { id: string; naam: string | null; kleur: string | null; zitplaatsen?: number | null }[]) ?? []) {
    map[row.id] = { naam: row.naam ?? 'Voertuig', kleur: row.kleur, zitplaatsen: row.zitplaatsen ?? null };
  }
  return { data: map, error: null };
}

/**
 * Names for the people in `assigned_to_ids` / `verantwoordelijke_ids`.
 * RLS on `profiles` scopes this to the caller's own company.
 */
export async function listTeamProfiles(
  ids: string[],
): Promise<{ data: Record<string, string>; error: string | null }> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return { data: {}, error: null };

  const { data, error } = await metTijdslimiet((signal) =>
    supabase.from('profiles').select('id, full_name').in('id', unique).abortSignal(signal),
  );

  if (error) {
    return { data: {}, error: describeError('listTeamProfiles', error) };
  }
  const map: Record<string, string> = {};
  for (const row of (data as { id: string; full_name: string | null }[]) ?? []) {
    if (row.full_name) map[row.id] = row.full_name;
  }
  return { data: map, error: null };
}

/** Checklist items and meerwerk — table `werkbon_taken`. */
export async function listWorkOrderTasks(
  workOrderId: string,
): Promise<{ data: WorkOrderTask[]; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_taken')
    .select('id, omschrijving, afgerond, volgorde, is_meerwerk')
    .eq('werkbon_id', workOrderId)
    .order('volgorde', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    return { data: [], error: describeError('listWorkOrderTasks', error) };
  }
  return { data: (data as unknown as WorkOrderTask[]) ?? [], error: null };
}

/**
 * Tick a checklist item off (or back on).
 *
 * The update is read back with `.select()` on purpose: when RLS rejects a row
 * PostgREST returns success with zero rows, so without this the app would
 * report a save that never happened.
 */
export async function setTaskDone(
  taskId: string,
  afgerond: boolean,
): Promise<{ data: WorkOrderTask | null; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_taken')
    .update({ afgerond })
    .eq('id', taskId)
    .select('id, omschrijving, afgerond, volgorde, is_meerwerk');

  if (error) {
    return { data: null, error: describeError('setTaskDone', error) };
  }
  const row = (data as unknown as WorkOrderTask[])?.[0];
  if (!row) {
    return {
      data: null,
      error:
        'Je mag deze taak niet afvinken. Alleen de verantwoordelijke, een beheerder of wie werkbonnen mag bewerken kan dat.',
    };
  }
  return { data: row, error: null };
}

/**
 * Het opslagpad uit de bewaarde waarde halen.
 *
 * De kolom `werkbon_fotos.url` bevat bij nieuwe uploads een kaal pad en bij
 * oudere rijen nog een volledige URL uit de tijd dat de bucket publiek was.
 * Zelfde afhandeling als `storagePathFromStored` in het dashboard, inclusief het
 * strippen van een query string (het token van een eerdere signed URL).
 */
function opslagpad(waarde: string): string {
  const zonderToken = String(waarde || '').split('?')[0] ?? '';
  const marker = `/${FOTO_BUCKET}/`;
  const i = zonderToken.indexOf(marker);
  return i !== -1 ? zonderToken.slice(i + marker.length) : zonderToken;
}

/** Categorieën zoals de CHECK-constraint op werkbon_fotos ze toestaat. */
export const FOTO_CATEGORIEEN = ['voor', 'tijdens', 'na'] as const;
export type FotoCategorie = (typeof FOTO_CATEGORIEEN)[number];

/**
 * Foto's bij de klus — tabel `werkbon_fotos`.
 *
 * De bucket `werkbon-fotos` is PRIVÉ. De opgeslagen waarde is dus niet direct
 * te tonen; er moet een kortlopende signed URL omheen. Zonder dat blijft elke
 * thumbnail leeg, ook al staat de rij er gewoon.
 */
export async function listWorkOrderPhotos(
  workOrderId: string,
): Promise<{ data: WorkOrderPhoto[]; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_fotos')
    .select('id, url, categorie, created_at')
    .eq('werkbon_id', workOrderId)
    .order('created_at', { ascending: true });

  if (error) {
    return { data: [], error: describeError('listWorkOrderPhotos', error) };
  }
  const rows = (data as unknown as WorkOrderPhoto[]) ?? [];
  if (rows.length === 0) return { data: [], error: null };

  const paden = rows.map((r) => opslagpad(r.url));
  const { data: signed, error: signError } = await supabase.storage
    .from(FOTO_BUCKET)
    .createSignedUrls(paden, SIGNED_URL_SECONDEN);

  if (signError) {
    // De rijen bestaan wel, alleen de links niet. Dat is een fout, geen lege lijst.
    return { data: [], error: describeError('listWorkOrderPhotos.signed', signError) };
  }
  return {
    data: rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? r.url })),
    error: null,
  };
}

/**
 * Een foto toevoegen aan de werkbon.
 *
 * Het pad is `<company_id>/<werkbon_id>/<uuid>.<ext>` — precies de vorm die de
 * storage-policies controleren: map 1 moet het eigen bedrijf zijn en map 2 een
 * werkbon van dat bedrijf waarop deze gebruiker mag schrijven.
 */
export async function uploadWorkOrderPhoto(input: {
  werkbon_id: string;
  company_id: string;
  categorie: FotoCategorie;
  /** Binaire inhoud van de afbeelding. */
  bytes: ArrayBuffer;
  contentType: string;
  extensie: string;
}): Promise<{ data: WorkOrderPhoto | null; error: string | null }> {
  const naam = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const pad = `${input.company_id}/${input.werkbon_id}/${naam}.${input.extensie}`;

  const { error: uploadError } = await supabase.storage
    .from(FOTO_BUCKET)
    .upload(pad, input.bytes, { contentType: input.contentType, upsert: false });

  if (uploadError) {
    return { data: null, error: describeError('uploadWorkOrderPhoto.storage', uploadError) };
  }

  // Het PAD opslaan, niet een URL: de bucket is privé en een link verloopt.
  const { data, error } = await supabase
    .from('werkbon_fotos')
    .insert({
      werkbon_id: input.werkbon_id,
      company_id: input.company_id,
      url: pad,
      categorie: input.categorie,
    })
    .select('id, url, categorie, created_at');

  if (error) {
    // De rij is er niet gekomen; laat het bestand dan ook niet rondslingeren.
    await supabase.storage.from(FOTO_BUCKET).remove([pad]);
    return { data: null, error: describeError('uploadWorkOrderPhoto.insert', error) };
  }
  const row = (data as unknown as WorkOrderPhoto[])?.[0];
  if (!row) {
    await supabase.storage.from(FOTO_BUCKET).remove([pad]);
    return { data: null, error: 'De foto is niet opgeslagen — je hebt hier geen rechten voor.' };
  }

  const { data: signed } = await supabase.storage
    .from(FOTO_BUCKET)
    .createSignedUrl(pad, SIGNED_URL_SECONDEN);
  return { data: { ...row, url: signed?.signedUrl ?? row.url }, error: null };
}

/**
 * Een foto verwijderen: eerst het bestand, dan de rij — de volgorde van het
 * dashboard (deleteWerkbonFoto). Mislukt het opruimen van het bestand, dan
 * gaat het verwijderen van de rij gewoon door (het dashboard negeert die fout
 * ook).
 *
 * Let op: de storage-policy van `werkbon-fotos` kent het slot van een
 * ondertekende bon niet (de rij wel, trigger `bb_werkbon_kind_op_slot`). Het
 * scherm biedt verwijderen daarom alleen aan zolang de bon open is.
 */
export async function deleteWorkOrderPhoto(
  id: string,
  bewaardeUrl: string,
): Promise<{ error: string | null }> {
  const pad = opslagpad(bewaardeUrl);
  if (pad) {
    const { error: opslagFout } = await supabase.storage.from(FOTO_BUCKET).remove([pad]);
    if (opslagFout && __DEV__) {
      console.log('[workOrderService.deleteWorkOrderPhoto] bestand niet verwijderd', opslagFout.message);
    }
  }
  const { data, error } = await supabase.from('werkbon_fotos').delete().eq('id', id).select('id');
  if (error) return { error: describeError('deleteWorkOrderPhoto', error) };
  if (!((data as { id: string }[]) ?? []).length) {
    return { error: 'De foto is niet verwijderd — je hebt hier geen rechten voor.' };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * De rechtenstand van de ingelogde gebruiker, zoals de schermen hem doorgeven.
 * Bewust een los objectje: de servicelaag kent geen React-context, en zo blijft
 * elke regel hieronder één op één te vergelijken met de policy in de database.
 */
export type WerkbonRechten = {
  userId: string | null;
  role: Role | null;
  /** `can()` uit usePermissions — rol + user_permissions. */
  can: (permission: string) => boolean;
  /** planStatus.features bevat 'gedeelde_werkruimte' (== bb_gedeelde_werkruimte). */
  gedeeldeWerkruimte: boolean;
  /** Account zonder geldig abonnement: bb_mag_schrijven() is dan false. */
  readonly: boolean;
};

/**
 * Mag deze gebruiker deze werkbon bewerken?
 *
 * Spiegelt policy `werkbonnen_update` letterlijk:
 *
 *   bb_gedeelde_werkruimte()
 *   OR bb_has_permission('planning')
 *   OR bb_has_permission('werkbonnen_bewerken')
 *   OR auth.uid() = ANY (verantwoordelijke_ids)
 *
 * Plus twee dingen die de policy niet zelf zegt maar die er wel omheen staan:
 * een ondertekende bon zit op slot via trigger `bb_werkbon_op_slot`, en een
 * read-only account faalt op `bb_mag_schrijven()` in de INSERT-policies.
 *
 * Dit blijft een UI-slot: elke schrijfactie leest de rij terug en meldt het
 * wanneer de database alsnog weigert.
 */
export function canEditWorkOrder(
  workOrder: Pick<WorkOrderWithRelations, 'verantwoordelijke_ids' | 'ondertekend_op'>,
  r: WerkbonRechten,
): boolean {
  if (workOrder.ondertekend_op) return false;
  if (r.readonly) return false;
  if (r.gedeeldeWerkruimte) return true;
  if (r.can('werkbonnen_bewerken') || r.can('planning')) return true;
  return !!r.userId && (workOrder.verantwoordelijke_ids ?? []).includes(r.userId);
}

/**
 * Mag deze gebruiker uren boeken op deze werkbon?
 *
 * Spiegelt `bb_mag_werkbon_uren_beheren()` (migratie 20261002135952):
 * uitvoerder, verantwoordelijke, admin of het recht `planning` — zoals
 * `magWerkbonUrenBeheren(werkbon, profile, magBewerken('planning'))` in het
 * dashboard. `werkbonnen_bewerken` opent het niet.
 */
export function canBookHours(
  workOrder: Pick<
    WorkOrderWithRelations,
    'assigned_to' | 'assigned_to_ids' | 'verantwoordelijke_ids' | 'ondertekend_op'
  >,
  r: WerkbonRechten,
): boolean {
  if (workOrder.ondertekend_op) return false;
  if (r.readonly) return false;
  if (r.role === 'admin' || r.can('planning')) return true;
  if (!r.userId) return false;
  return (
    (workOrder.assigned_to_ids ?? []).includes(r.userId) ||
    // Zelfde als bb_mag_werkbon_uren_beheren: alleen de lijsten tellen.
    (workOrder.verantwoordelijke_ids ?? []).includes(r.userId)
  );
}

/**
 * "Beheert werkbonnen" — `canManage` van het dashboard (origin/main):
 * rol admin, of het recht `werkbonnen_bewerken`. De rol 'planner' bestaat niet
 * meer (`profiles_role_check`: admin | medewerker).
 * Dit opent: nieuwe werkbon, het volledige bewerkformulier en de status.
 */
export function canManageWerkbonnen(r: WerkbonRechten): boolean {
  return r.role === 'admin' || r.can('werkbonnen_bewerken');
}

/**
 * Mag deze gebruiker een werkbon aanmaken?
 *
 * Policy `werkbonnen_insert` (live geverifieerd 13-10-2026) eist
 * `bb_has_permission('planning') OR bb_has_permission('werkbonnen_bewerken')`
 * — admin valt daar via de helper onder. De knop volgt het
 * dashboard (`canManage`) plus een expliciet planningrecht, dat de database
 * ook toestaat. `readonly_werkbonnen` eist een geldig abonnement.
 */
export function canCreateWorkOrder(r: WerkbonRechten): boolean {
  if (r.readonly) return false;
  return canManageWerkbonnen(r) || r.can('planning');
}

/**
 * `canEditDetail` van het dashboard: beheerder of verantwoordelijke van deze
 * bon. Wie alleen gekoppeld is ziet de bon met "Alleen inzage".
 */
export function canEditDetail(
  workOrder: Pick<WorkOrderWithRelations, 'verantwoordelijke_ids'>,
  r: WerkbonRechten,
): boolean {
  if (canManageWerkbonnen(r)) return true;
  return !!r.userId && (workOrder.verantwoordelijke_ids ?? []).includes(r.userId);
}

/**
 * Mag deze gebruiker datum/tijd van een werkbon wijzigen? Trigger
 * `bb_werkbon_tijden_planning_recht` eist `bb_planning_recht_vereist()`:
 * gedeelde werkruimte of het planningrecht (admin inbegrepen).
 */
export function magPlanningWijzigen(r: WerkbonRechten): boolean {
  return r.gedeeldeWerkruimte || r.role === 'admin' || r.can('planning');
}

/**
 * The next status a job can move to, in the live vocabulary.
 * gepland → in_uitvoering → afgerond, and an admin may also step back.
 */
export function getAllowedNextStatuses(
  current: WorkOrderStatus,
  role: Role | null,
): WorkOrderStatus[] {
  const canRewind = role === 'admin';
  switch (String(current)) {
    case 'gepland':
      return ['in_uitvoering', 'afgerond'];
    case 'in_uitvoering':
      return canRewind ? ['afgerond', 'gepland'] : ['afgerond'];
    case 'afgerond':
      return canRewind ? ['in_uitvoering'] : [];
    default:
      // Unknown legacy value — offer the normal path forward.
      return ['in_uitvoering', 'afgerond'];
  }
}

/**
 * Move a work order to another status.
 *
 * Side columns follow the dashboard's rules exactly:
 *   - `gestart_op` is stamped once, on the first move to in_uitvoering, and is
 *     never overwritten (so a re-open keeps the original start).
 *   - `afgerond_op` is stamped on afgerond and cleared when the job re-opens,
 *     so it never claims a completion that was undone.
 *
 * Only these fields are sent, so a concurrent dashboard edit to the title,
 * planning or assignment is not overwritten.
 */
/**
 * Annuleren of terugzetten (besluit 26-10): alleen de status, zoals het
 * dashboard. De database bewaakt wie het mag (admin of recht planning), dat er
 * geen uren of handtekening op staan, en stuurt de medewerkers een melding
 * (bb_werkbon_annulering_melden).
 */
export async function zetWerkbonGeannuleerd(
  werkbonId: string,
  geannuleerd: boolean,
): Promise<{ data: Werkbon | null; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbonnen')
    .update({ status: geannuleerd ? 'geannuleerd' : 'gepland' })
    .eq('id', werkbonId)
    .select(WORK_ORDER_COLUMNS);
  if (error) {
    if (error.hint === 'werkbon_heeft_uren' || error.hint === 'werkbon_ondertekend' || error.code === '42501') {
      return { data: null, error: error.message };
    }
    return { data: null, error: describeError('zetWerkbonGeannuleerd', error) };
  }
  const row = (data as unknown as Werkbon[])?.[0];
  if (!row) return { data: null, error: 'Je kunt deze werkbon niet annuleren.' };
  return { data: row, error: null };
}

export async function updateWorkOrderStatus(
  workOrder: Pick<WorkOrderWithRelations, 'id' | 'gestart_op'>,
  status: WorkOrderStatus,
  /** Afronden zonder startmoment: "Wanneer is de klus gestart?" (ISO). */
  gestartOp?: string | null,
): Promise<{ data: Werkbon | null; error: string | null }> {
  const patch: Record<string, unknown> = { status };

  if (gestartOp && !workOrder.gestart_op) patch.gestart_op = gestartOp;
  if (status === 'in_uitvoering' && !workOrder.gestart_op) {
    patch.gestart_op = new Date().toISOString();
  }
  if (status === 'afgerond') {
    patch.afgerond_op = new Date().toISOString();
  } else {
    patch.afgerond_op = null;
  }

  const { data, error } = await supabase
    .from('werkbonnen')
    .update(patch)
    .eq('id', workOrder.id)
    .select(WORK_ORDER_COLUMNS);

  if (error) {
    return { data: null, error: describeError('updateWorkOrderStatus', error) };
  }
  const row = (data as unknown as Werkbon[])?.[0];
  if (!row) {
    // Update matched no row: RLS refused it. Never report this as success.
    return {
      data: null,
      error:
        'De status is niet opgeslagen — je hebt geen rechten op deze werkbon, of hij is al ondertekend.',
    };
  }
  return { data: row, error: null };
}

// ---------------------------------------------------------------------------
// Notes — table `werkbon_notities` (a real log, one row per note)
// ---------------------------------------------------------------------------

const NOTE_COLUMNS = `
  id, note, created_by, created_at, voor_klant, gevolg,
  waarschuwing_verzonden_op, waarschuwing_verzonden_naar,
  auteur:profiles!werkbon_notities_created_by_fkey ( id, full_name )
`;

/** Een notitie met de velden van de Wkb-waarschuwing (alleen lezen). */
export type WerkbonNotitie = WorkOrderNote & {
  gevolg?: string | null;
  waarschuwing_verzonden_op?: string | null;
  waarschuwing_verzonden_naar?: string | null;
};

/**
 * Een notitie naar de klant of terug naar intern zetten
 * (updateWerkbonNotitieZichtbaarheid). RLS: eigen notitie, of admin/`werkbonnen_bewerken`
 * (migratie 20261002135952).
 */
export async function setNoteVoorKlant(
  id: string,
  voorKlant: boolean,
): Promise<{ data: WerkbonNotitie | null; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_notities')
    .update({ voor_klant: voorKlant })
    .eq('id', id)
    .select(NOTE_COLUMNS);
  if (error) return { data: null, error: describeError('setNoteVoorKlant', error) };
  const row = (data as unknown as WerkbonNotitie[])?.[0];
  if (!row) {
    return { data: null, error: 'Niet gewijzigd — alleen de schrijver, een beheerder of wie werkbonnen mag bewerken kan dat.' };
  }
  return { data: row, error: null };
}

export async function listWorkOrderNotes(
  workOrderId: string,
): Promise<{ data: WerkbonNotitie[]; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_notities')
    .select(NOTE_COLUMNS)
    .eq('werkbon_id', workOrderId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: describeError('listWorkOrderNotes', error) };
  }
  return { data: (data as unknown as WerkbonNotitie[]) ?? [], error: null };
}

/**
 * Add one note to the log.
 *
 * `company_id` is taken from the caller's own profile and must equal the work
 * order's company — the insert policy checks the same thing server-side, so a
 * mismatch is refused rather than silently written to the wrong tenant.
 */
export async function addWorkOrderNote(input: {
  werkbon_id: string;
  company_id: string;
  created_by: string;
  note: string;
  voor_klant?: boolean;
}): Promise<{ data: WorkOrderNote | null; error: string | null }> {
  const note = input.note.trim();
  if (!note) return { data: null, error: 'Een lege notitie kan niet worden opgeslagen.' };

  const { data, error } = await supabase
    .from('werkbon_notities')
    .insert({
      werkbon_id: input.werkbon_id,
      company_id: input.company_id,
      created_by: input.created_by,
      note,
      voor_klant: input.voor_klant ?? false,
    })
    .select(NOTE_COLUMNS);

  if (error) {
    return { data: null, error: describeError('addWorkOrderNote', error) };
  }
  const row = (data as unknown as WorkOrderNote[])?.[0];
  if (!row) {
    return { data: null, error: 'De notitie is niet opgeslagen — je hebt hier geen rechten voor.' };
  }
  return { data: row, error: null };
}

/**
 * De tekst van een notitie wijzigen (besluit 26-10, G-07). RLS
 * `werkbon_notities_update`: de schrijver, een admin, het recht planning of
 * werkbonnen_bewerken; niet bij een verstuurde Wkb-waarschuwing. Na
 * ondertekenen weigert bb_werkbon_kind_op_slot.
 */
export async function updateWorkOrderNote(
  id: string,
  note: string,
): Promise<{ data: WerkbonNotitie | null; error: string | null }> {
  const tekst = note.trim();
  if (!tekst) return { data: null, error: 'Een lege notitie kan niet worden opgeslagen.' };
  const { data, error } = await supabase
    .from('werkbon_notities')
    .update({ note: tekst, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(NOTE_COLUMNS);
  if (error) return { data: null, error: describeError('updateWorkOrderNote', error) };
  const row = (data as unknown as WerkbonNotitie[])?.[0];
  if (!row) return { data: null, error: 'Niet gewijzigd — je mag deze notitie niet wijzigen.' };
  return { data: row, error: null };
}

/** Een notitie verwijderen; zelfde rechten als wijzigen. */
export async function deleteWorkOrderNote(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('werkbon_notities').delete().eq('id', id).select('id');
  if (error) return { error: describeError('deleteWorkOrderNote', error) };
  if (!data?.length) return { error: 'Niet verwijderd — je mag deze notitie niet verwijderen.' };
  return { error: null };
}

/**
 * Mag deze gebruiker deze notitie wijzigen of verwijderen? Spiegelt de RLS; het
 * slot na ondertekenen en alleen-lezen vraagt het scherm zelf na.
 */
export function magNotitieWijzigen(
  n: Pick<WerkbonNotitie, 'created_by' | 'waarschuwing_verzonden_op'>,
  r: { userId: string | null; role: string | null; can: (p: string) => boolean },
): boolean {
  if (n.waarschuwing_verzonden_op) return false;
  if (r.userId && n.created_by === r.userId) return true;
  return r.role === 'admin' || r.can('planning') || r.can('werkbonnen_bewerken');
}

// ---------------------------------------------------------------------------
// Taken en meerwerk aanmaken/verwijderen — tabel `werkbon_taken`
// ---------------------------------------------------------------------------
//
// Sinds migratie 20261002135952 (dashboard origin/main) volgen
// `werkbon_taken_insert`/`_delete` en `werkbon_materialen_delete` dezelfde
// regel als hun update-policy: gedeelde werkruimte, het recht
// `werkbonnen_bewerken` (admin inbegrepen) of verantwoordelijke van de bon.
// Voorheen eisten ze de rol admin/planner. Het recht `planning` opent de
// werkbon zelf wel (werkbonnen_update), maar deze regels niet.

// De regel zelf staat in lib/werkbonRechten (puur, getest).
export { magWerkbonRegelsBeheren };

/** Mag deze gebruiker taken/meerwerk toevoegen of verwijderen? */
export function canAddTask(
  workOrder: Pick<WorkOrderWithRelations, 'verantwoordelijke_ids' | 'ondertekend_op'>,
  r: WerkbonRechten,
): boolean {
  return magWerkbonRegelsBeheren(workOrder, r);
}

export async function addWorkOrderTask(input: {
  werkbon_id: string;
  company_id: string;
  omschrijving: string;
  is_meerwerk?: boolean;
  volgorde?: number;
}): Promise<{ data: WorkOrderTask | null; error: string | null }> {
  const omschrijving = input.omschrijving.trim();
  if (!omschrijving) return { data: null, error: 'Vul een omschrijving in.' };

  const { data, error } = await supabase
    .from('werkbon_taken')
    .insert({
      werkbon_id: input.werkbon_id,
      company_id: input.company_id,
      omschrijving,
      afgerond: false,
      is_meerwerk: input.is_meerwerk ?? false,
      volgorde: input.volgorde ?? 0,
    })
    .select('id, omschrijving, afgerond, volgorde, is_meerwerk');

  if (error) return { data: null, error: describeError('addWorkOrderTask', error) };
  const row = (data as unknown as WorkOrderTask[])?.[0];
  if (!row) {
    return {
      data: null,
      error: 'De regel is niet opgeslagen — je hebt hier geen rechten voor.',
    };
  }
  return { data: row, error: null };
}

export async function deleteWorkOrderTask(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('werkbon_taken').delete().eq('id', id).select('id');
  if (error) return { error: describeError('deleteWorkOrderTask', error) };
  if (!((data as { id: string }[]) ?? []).length) {
    return { error: 'De regel is niet verwijderd — je hebt hier geen rechten voor.' };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Materialen — tabel `werkbon_materialen` (+ `werkbon_materiaal_inkoop`)
// ---------------------------------------------------------------------------
//
// Zoals het dashboard (MaterialenSection): een regel kopieert naam, eenheid,
// verkoopprijs, btw, leverancier en (met recht) inkoopprijs uit de
// bibliotheek, of is "vrij materiaal". Toevoegen en wijzigen volgt de werkbon
// (`werkbon_materialen_insert` / `_update`); VERWIJDEREN volgt sinds migratie
// 20261002135952 dezelfde regel (gedeelde werkruimte, `werkbonnen_bewerken`
// of verantwoordelijke) in plaats van de rol admin/planner. De inkoopprijs
// staat in `werkbon_materiaal_inkoop` met eigen RLS: zonder het recht
// `inkoopprijzen` komt er niets binnen en weigert de update stil. De
// kostregel in `job_costs` maakt de database zelf (trigger).
//
// Verkoopprijs en subtotaal (dashboard 3-10-2026, migraties 20261003093758 en
// 093845): `prijs_per` en `subtotaal` zijn voor `authenticated` niet meer
// leesbaar; een select die ze noemt faalt voor iedereen. Ze komen via
// `bb_werkbonmateriaal_bedragen(p_ids)`, alleen met het recht
// `projectbedragen`. Het subtotaal rekent de database zelf uit (trigger
// `a1_wm_subtotaal`); de app stuurt het niet meer mee.

export type WerkbonMateriaalRegel = WorkOrderMaterial & {
  prijs_per: number;
  subtotaal: number;
  materiaal_id: string | null;
  leverancier_id: string | null;
  btw_percentage: number;
  /** null = niet ingevuld óf geen recht om te zien. */
  inkoopprijs_per: number | null;
};

const MATERIAAL_KOLOMMEN = `
  id, naam, eenheid, aantal, materiaal_id, leverancier_id,
  btw_percentage, created_at, werkbon_materiaal_inkoop ( inkoopprijs_per )
`;

type MateriaalRij = Omit<WerkbonMateriaalRegel, 'inkoopprijs_per' | 'prijs_per' | 'subtotaal'> & {
  prijs_per?: number | null;
  subtotaal?: number | null;
  werkbon_materiaal_inkoop?: { inkoopprijs_per: number | null } | { inkoopprijs_per: number | null }[] | null;
};

/** Verkoopprijs en subtotaal erbij via de RPC; zonder recht blijven ze leeg (0). */
async function metMateriaalBedragen(rijen: MateriaalRij[]): Promise<MateriaalRij[]> {
  const bedragen: { id: string }[] = [];
  for (const ids of idBatches(rijen.map((r) => r.id))) {
    const { data, error } = await supabase.rpc('bb_werkbonmateriaal_bedragen', { p_ids: ids });
    if (error) {
      describeError('metMateriaalBedragen', error);
      break;
    }
    bedragen.push(...((data as { id: string }[] | null) ?? []));
  }
  return vulBedragen(rijen, bedragen, MATERIAAL_BEDRAG_VELDEN);
}

function naarRegel(r: MateriaalRij): WerkbonMateriaalRegel {
  const k = Array.isArray(r.werkbon_materiaal_inkoop) ? r.werkbon_materiaal_inkoop[0] : r.werkbon_materiaal_inkoop;
  return {
    id: r.id,
    naam: r.naam,
    eenheid: r.eenheid,
    aantal: Number(r.aantal ?? 0),
    prijs_per: Number(r.prijs_per ?? 0),
    subtotaal: Number(r.subtotaal ?? 0),
    materiaal_id: r.materiaal_id ?? null,
    leverancier_id: r.leverancier_id ?? null,
    btw_percentage: r.btw_percentage != null ? Number(r.btw_percentage) : 21,
    inkoopprijs_per: k?.inkoopprijs_per != null ? Number(k.inkoopprijs_per) : null,
  };
}

const rond2 = (n: number) => Math.round(n * 100) / 100;

export async function listWorkOrderMaterials(
  workOrderId: string,
): Promise<{ data: WerkbonMateriaalRegel[]; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_materialen')
    .select(MATERIAAL_KOLOMMEN)
    .eq('werkbon_id', workOrderId)
    .order('created_at', { ascending: true });

  if (error) {
    return { data: [], error: describeError('listWorkOrderMaterials', error) };
  }
  const rijen = await metMateriaalBedragen((data as unknown as MateriaalRij[]) ?? []);
  return { data: rijen.map(naarRegel), error: null };
}

export function canEditMaterials(
  workOrder: Pick<WorkOrderWithRelations, 'verantwoordelijke_ids' | 'ondertekend_op'>,
  r: WerkbonRechten,
): boolean {
  return canEditWorkOrder(workOrder, r);
}

/**
 * `werkbon_materialen_delete` (migratie 20261002135952): zelfde regel als
 * wijzigen — gedeelde werkruimte, `werkbonnen_bewerken` of verantwoordelijke.
 */
export function canDeleteMaterial(
  workOrder: Pick<WorkOrderWithRelations, 'verantwoordelijke_ids' | 'ondertekend_op'>,
  r: WerkbonRechten,
): boolean {
  return magWerkbonRegelsBeheren(workOrder, r);
}

async function leesRegel(id: string): Promise<WerkbonMateriaalRegel | null> {
  const { data } = await supabase.from('werkbon_materialen').select(MATERIAAL_KOLOMMEN).eq('id', id).maybeSingle();
  if (!data) return null;
  const [rij] = await metMateriaalBedragen([data as unknown as MateriaalRij]);
  return rij ? naarRegel(rij) : null;
}

export async function addWorkOrderMaterial(input: {
  werkbon_id: string;
  company_id: string;
  naam: string;
  eenheid?: string | null;
  aantal: number;
  prijs_per?: number | null;
  btw_percentage?: number | null;
  materiaal_id?: string | null;
  leverancier_id?: string | null;
  /** Alleen meesturen met het recht `inkoopprijzen`. */
  inkoopprijs_per?: number | null;
}): Promise<{ data: WerkbonMateriaalRegel | null; error: string | null }> {
  const naam = input.naam.trim();
  if (!naam) return { data: null, error: 'Vul een naam in.' };
  if (!Number.isFinite(input.aantal) || input.aantal <= 0) {
    return { data: null, error: 'Vul een geldig aantal in.' };
  }
  const prijs = Number(input.prijs_per ?? 0) || 0;

  const { data, error } = await supabase
    .from('werkbon_materialen')
    .insert({
      werkbon_id: input.werkbon_id,
      company_id: input.company_id,
      naam,
      eenheid: input.eenheid?.trim() ? input.eenheid.trim() : null,
      aantal: input.aantal,
      prijs_per: prijs,
      materiaal_id: input.materiaal_id ?? null,
      leverancier_id: input.leverancier_id ?? null,
      btw_percentage: input.btw_percentage ?? 21,
    })
    .select(MATERIAAL_KOLOMMEN);

  if (error) return { data: null, error: describeError('addWorkOrderMaterial', error) };
  const row = (data as unknown as MateriaalRij[])?.[0];
  if (!row) {
    return { data: null, error: 'Het materiaal is niet opgeslagen — je hebt hier geen rechten voor.' };
  }
  // De inkooprij maakt een trigger aan (met de bibliotheekprijs). Alleen een
  // ingevulde waarde overschrijven; zonder recht weigert RLS dat stil.
  if (input.inkoopprijs_per != null && Number.isFinite(input.inkoopprijs_per)) {
    await supabase
      .from('werkbon_materiaal_inkoop')
      .update({ inkoopprijs_per: input.inkoopprijs_per, updated_at: new Date().toISOString() })
      .eq('werkbon_materiaal_id', row.id);
  }
  // Wat we net zelf opsloegen mogen we tonen (zoals het dashboard); bij het
  // volgende laden komt de prijs alleen terug voor wie hem mag zien.
  const opgeslagen = input.inkoopprijs_per != null ? await leesRegel(row.id) : null;
  return {
    data: {
      ...(opgeslagen ?? naarRegel(row)),
      prijs_per: prijs,
      subtotaal: rond2(input.aantal * prijs),
    },
    error: null,
  };
}

/** Aantal bijstellen; het subtotaal rekent de database mee (trigger a1_wm_subtotaal). */
export async function updateMaterialAmount(
  regel: Pick<WerkbonMateriaalRegel, 'id' | 'prijs_per'>,
  aantal: number,
): Promise<{ data: WerkbonMateriaalRegel | null; error: string | null }> {
  if (!Number.isFinite(aantal) || aantal <= 0) {
    return { data: null, error: 'Vul een geldig aantal in.' };
  }
  const { data, error } = await supabase
    .from('werkbon_materialen')
    .update({ aantal })
    .eq('id', regel.id)
    .select(MATERIAAL_KOLOMMEN);

  if (error) return { data: null, error: describeError('updateMaterialAmount', error) };
  const row = (data as unknown as MateriaalRij[])?.[0];
  if (!row) return { data: null, error: 'Het aantal is niet opgeslagen — je hebt hier geen rechten voor.' };
  const [metPrijs] = await metMateriaalBedragen([row]);
  return { data: naarRegel(metPrijs ?? row), error: null };
}

/** De velden van een materiaalregel die je op de werkbon kunt wijzigen. */
export type MateriaalWijziging = Partial<{
  naam: string;
  eenheid: string | null;
  aantal: number;
  prijs_per: number;
  leverancier_id: string | null;
  /** Alleen met het recht `inkoopprijzen`; zonder weigert RLS het stil. */
  inkoopprijs_per: number | null;
}>;

/**
 * Eén of meer velden van een materiaalregel bijwerken (updateWerkbonMateriaal
 * in het dashboard). De inkoopprijs staat in `werkbon_materiaal_inkoop` met
 * eigen RLS en gaat apart; het subtotaal rekent de database (a1_wm_subtotaal).
 */
export async function updateWorkOrderMaterial(
  id: string,
  patch: MateriaalWijziging,
): Promise<{ data: WerkbonMateriaalRegel | null; error: string | null }> {
  const { inkoopprijs_per, ...velden } = patch;
  const heeftInkoop = 'inkoopprijs_per' in patch;
  if ('naam' in velden && !String(velden.naam ?? '').trim()) return { data: null, error: 'Vul een naam in.' };
  if ('aantal' in velden && (!Number.isFinite(velden.aantal) || (velden.aantal ?? 0) < 0)) {
    return { data: null, error: 'Vul een geldig aantal in.' };
  }
  if (Object.keys(velden).length) {
    const { data, error } = await supabase.from('werkbon_materialen').update(velden).eq('id', id).select('id');
    if (error) return { data: null, error: describeError('updateWorkOrderMaterial', error) };
    if (!((data as { id: string }[]) ?? []).length) {
      return { data: null, error: 'Niet opgeslagen — je hebt hier geen rechten voor.' };
    }
  }
  if (heeftInkoop) {
    await supabase
      .from('werkbon_materiaal_inkoop')
      .update({ inkoopprijs_per: inkoopprijs_per ?? null, updated_at: new Date().toISOString() })
      .eq('werkbon_materiaal_id', id);
  }
  const regel = await leesRegel(id);
  if (!regel) return { data: null, error: 'De regel kon niet opnieuw worden geladen.' };
  return { data: regel, error: null };
}

export async function deleteWorkOrderMaterial(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_materialen')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) return { error: describeError('deleteWorkOrderMaterial', error) };
  if (!((data as { id: string }[]) ?? []).length) {
    return { error: 'Het materiaal is niet verwijderd — je hebt hier geen rechten voor.' };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Takenvoortgang voor de lijst (getAllWerkbonTakenCounts)
// ---------------------------------------------------------------------------

/** werkbon_id → { done, total }, meerwerk telt niet mee. */
export async function listTakenTellingen(): Promise<{
  data: Record<string, { done: number; total: number }>;
  error: string | null;
}> {
  const { data, error } = await haalInStukken((van, tot) =>
    metTijdslimiet((signal) =>
      supabase
        .from('werkbon_taken')
        .select('id, werkbon_id, afgerond')
        .eq('is_meerwerk', false)
        .order('id', { ascending: true })
        .range(van, tot)
        .abortSignal(signal),
    ),
  );
  if (error) return { data: {}, error: describeError('listTakenTellingen', error) };
  const tel: Record<string, { done: number; total: number }> = {};
  for (const r of (data as unknown as { werkbon_id: string; afgerond: boolean }[]) ?? []) {
    const t = (tel[r.werkbon_id] ??= { done: 0, total: 0 });
    t.total++;
    if (r.afgerond) t.done++;
  }
  return { data: tel, error: null };
}

// ---------------------------------------------------------------------------
// Werkbon aanmaken en bewerken
// ---------------------------------------------------------------------------

export type CreateWorkOrderInput = {
  company_id: string;
  titel: string;
  customer_id?: string | null;
  /** Aanvraag/project (`deals`), zoals createWerkbon van het dashboard. */
  deal_id?: string | null;
  project_id?: string | null;
  omschrijving?: string | null;
  gepland_op?: string | null;
  starttijd?: string | null;
  eindtijd?: string | null;
  locatie?: string | null;
  assigned_to_ids?: string[];
  verantwoordelijke_ids?: string[];
  /** Alleen meesturen als het formulier de voertuigen kent. */
  voertuig_ids?: string[];
};

/**
 * Verantwoordelijken als deel van de ploeg; leeg terwijl er een ploeg is →
 * de eerste medewerker (normalizeVerantwoordelijken van het dashboard). De
 * CHECK `werkbonnen_verantwoordelijke_subset` eist dat elke
 * verantwoordelijke ook uitvoerder is.
 */
function normaliseerPloeg(assigned?: string[], verantw?: string[]) {
  const uitvoerders = Array.from(new Set((assigned ?? []).filter(Boolean)));
  let verantwoordelijken = Array.from(new Set((verantw ?? []).filter(Boolean))).filter((id) =>
    uitvoerders.includes(id),
  );
  if (!verantwoordelijken.length && uitvoerders.length) verantwoordelijken = [uitvoerders[0]!];
  return { uitvoerders, verantwoordelijken };
}

const leegNaarNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * Een nieuwe werkbon aanmaken (createWerkbon van het dashboard).
 *
 * `nummer` wordt niet meegestuurd: trigger `bb_werkbon_nummer` bepaalt het
 * eerstvolgende WB-nummer per bedrijf.
 */
export async function createWorkOrder(
  input: CreateWorkOrderInput,
): Promise<{ data: Werkbon | null; error: string | null }> {
  const titel = input.titel.trim();
  if (!titel) return { data: null, error: 'Titel is verplicht.' };
  const { uitvoerders, verantwoordelijken } = normaliseerPloeg(input.assigned_to_ids, input.verantwoordelijke_ids);

  const payload: Record<string, unknown> = {
    company_id: input.company_id,
    titel,
    customer_id: input.customer_id ?? null,
    deal_id: input.deal_id ?? null,
    project_id: input.project_id ?? null,
    omschrijving: leegNaarNull(input.omschrijving),
    gepland_op: input.gepland_op || null,
    starttijd: input.starttijd || null,
    eindtijd: input.eindtijd || null,
    locatie: leegNaarNull(input.locatie),
    status: 'gepland',
    assigned_to_ids: uitvoerders,
    verantwoordelijke_ids: verantwoordelijken,
    assigned_to: uitvoerders[0] ?? null,
  };
  if (Array.isArray(input.voertuig_ids)) payload.voertuig_ids = input.voertuig_ids;
  // Null-velden weglaten, zoals het dashboard: dan gelden de kolomstandaarden.
  Object.keys(payload).forEach((k) => payload[k] === null && delete payload[k]);

  const { data, error } = await supabase.from('werkbonnen').insert(payload).select(WORK_ORDER_COLUMNS);

  if (error) return { data: null, error: describeError('createWorkOrder', error) };
  const row = (data as unknown as Werkbon[])?.[0];
  if (!row) {
    return {
      data: null,
      error: 'De werkbon is niet aangemaakt — daarvoor heb je het recht werkbonnen bewerken of planning nodig.',
    };
  }
  return { data: row, error: null };
}

export type UpdateWorkOrderInput = Partial<Omit<CreateWorkOrderInput, 'company_id'>> & {
  status?: string;
  notes?: string | null;
};

/**
 * Een werkbon bijwerken (updateWerkbon van het dashboard): toewijzing blijft
 * consistent (assigned_to = eerste), en de eerste stap naar in_uitvoering zet
 * eenmalig `gestart_op`.
 */
export async function updateWorkOrder(
  huidig: Pick<Werkbon, 'id' | 'gestart_op' | 'status'>,
  input: UpdateWorkOrderInput,
): Promise<{ data: Werkbon | null; error: string | null }> {
  const patch: Record<string, unknown> = {};
  if (input.titel !== undefined) {
    const titel = input.titel.trim();
    if (!titel) return { data: null, error: 'Titel is verplicht.' };
    patch.titel = titel;
  }
  if (input.customer_id !== undefined) patch.customer_id = input.customer_id || null;
  if (input.project_id !== undefined) patch.project_id = input.project_id || null;
  if (input.omschrijving !== undefined) patch.omschrijving = leegNaarNull(input.omschrijving);
  if (input.locatie !== undefined) patch.locatie = leegNaarNull(input.locatie);
  if (input.notes !== undefined) patch.notes = leegNaarNull(input.notes);
  if (input.gepland_op !== undefined) patch.gepland_op = input.gepland_op || null;
  if (input.starttijd !== undefined) patch.starttijd = input.starttijd || null;
  if (input.eindtijd !== undefined) patch.eindtijd = input.eindtijd || null;
  if (Array.isArray(input.voertuig_ids)) patch.voertuig_ids = input.voertuig_ids;
  if (input.assigned_to_ids !== undefined) {
    const { uitvoerders, verantwoordelijken } = normaliseerPloeg(input.assigned_to_ids, input.verantwoordelijke_ids);
    patch.assigned_to_ids = uitvoerders;
    patch.verantwoordelijke_ids = verantwoordelijken;
    patch.assigned_to = uitvoerders[0] ?? null;
  }
  if (input.status !== undefined && input.status !== huidig.status) {
    patch.status = input.status;
    if (input.status === 'in_uitvoering' && !huidig.gestart_op) patch.gestart_op = new Date().toISOString();
    if (input.status === 'afgerond') patch.afgerond_op = new Date().toISOString();
  }
  if (!Object.keys(patch).length) return getWorkOrder(huidig.id) as Promise<{ data: Werkbon | null; error: string | null }>;

  const { data, error } = await supabase
    .from('werkbonnen')
    .update(patch)
    .eq('id', huidig.id)
    .select(WORK_ORDER_COLUMNS);
  if (error) return { data: null, error: describeError('updateWorkOrder', error) };
  const row = (data as unknown as Werkbon[])?.[0];
  if (!row) {
    return { data: null, error: 'De werkbon is niet bijgewerkt — je hebt geen rechten op deze werkbon.' };
  }
  return { data: row, error: null };
}

/**
 * De geplande dagen zetten via RPC `bb_werkbon_dagen_zetten` (SECURITY
 * INVOKER, RLS geldt). Dagen die niet in de lijst staan verdwijnen; bestaande
 * dagen houden hun id; ontbrekende voertuigsleutels laten de bestaande
 * waarde staan. Lege lijst = niet ingepland.
 */
export async function zetWerkbonDagen(
  werkbonId: string,
  dagen: DagPayload[],
): Promise<{ data: Werkbon | null; error: string | null }> {
  const { error } = await supabase.rpc('bb_werkbon_dagen_zetten', {
    p_werkbon_id: werkbonId,
    p_dagen: dagen,
  });
  if (error) {
    if (__DEV__) console.log('[workOrderService.zetWerkbonDagen]', error.code, error.message);
    const msg = error.message ?? '';
    // Triggermeldingen (planningrecht, slot, voertuigen, max. 60 dagen) zijn
    // zelf al leesbaar Nederlands.
    if (error.code === 'P0001' || error.code === '42501' || /werkbon|dag|voertuig|planning/i.test(msg)) {
      return { data: null, error: msg || describeError('zetWerkbonDagen', error) };
    }
    return { data: null, error: describeError('zetWerkbonDagen', error) };
  }
  return getWorkOrder(werkbonId) as Promise<{ data: Werkbon | null; error: string | null }>;
}

// ---------------------------------------------------------------------------
// Agenda-items van een werkbon (syncWerkbonEvents van het dashboard)
// ---------------------------------------------------------------------------

function eventTijden(datum: string, start: string, eind: string) {
  const s = lokaalNaarUtc(datum, start || '09:00');
  if (!s) return { start_at: null, end_at: null };
  const e = eind ? lokaalNaarUtc(datum, eind) : null;
  return {
    start_at: s.toISOString(),
    end_at: (e ?? new Date(s.getTime() + 60 * 60 * 1000)).toISOString(),
  };
}

/**
 * Brengt `calendar_events` in lijn met de werkbon: één item per dag per
 * persoon in de dagploeg (met diens tijd), vervallen planning-items weg,
 * handmatige items blijven staan. Fire-and-forget na opslaan, net als het
 * dashboard; een fout blokkeert de werkbon niet.
 */
export async function syncWerkbonEvents(werkbonId: string, companyId: string): Promise<{ error: string | null }> {
  const { data: wb, error } = await supabase
    .from('werkbonnen')
    .select(
      'id, titel, customer_id, omschrijving, status, assigned_to, assigned_to_ids, starttijd, eindtijd, werkbon_dagen ( id, datum, starttijd, eindtijd, medewerker_ids, medewerker_tijden )',
    )
    .eq('id', werkbonId)
    .maybeSingle();
  if (error) return { error: describeError('syncWerkbonEvents', error) };
  if (!wb) return { error: null };
  const w = wb as unknown as {
    titel: string | null;
    customer_id: string | null;
    omschrijving: string | null;
    status: string | null;
    assigned_to: string | null;
    assigned_to_ids: string[] | null;
    starttijd: string | null;
    eindtijd: string | null;
    werkbon_dagen: WerkbonDag[] | null;
  };
  const team = w.assigned_to_ids?.length ? w.assigned_to_ids : w.assigned_to ? [w.assigned_to] : [];

  type Gewenst = { dag: WerkbonDag; persoon: string | null; start: string; eind: string; item?: Bestaand | null };
  type Bestaand = { id: string; werkbon_dag_id: string | null; assigned_to: string | null; herkomst: string | null; start_at: string | null };

  const gewenst: Gewenst[] = [];
  // Een geannuleerde werkbon gaat niet door: geen agenda-items. De rest van de
  // functie ruimt dan zijn planningsitems op; bij terugzetten komen ze terug.
  for (const dag of w.status === 'geannuleerd' ? [] : (w.werkbon_dagen ?? [])) {
    const dagStart = hhmm(dag.starttijd) || hhmm(w.starttijd);
    const dagEind = hhmm(dag.eindtijd) || hhmm(w.eindtijd);
    const ploeg = Array.isArray(dag.medewerker_ids) ? dag.medewerker_ids : team;
    for (const persoon of ploeg.length ? ploeg : [null]) {
      const eigen = persoon ? dag.medewerker_tijden?.[persoon] : null;
      const start = hhmm(eigen?.starttijd) || dagStart;
      const eind = hhmm(eigen?.eindtijd) || dagEind;
      if (start) gewenst.push({ dag, persoon, start, eind });
    }
  }

  const { data: bestaandData, error: leesFout } = await supabase
    .from('calendar_events')
    .select('id, werkbon_dag_id, assigned_to, herkomst, start_at')
    .eq('werkbon_id', werkbonId);
  if (leesFout) return { error: describeError('syncWerkbonEvents.lees', leesFout) };
  const over = [...((bestaandData as Bestaand[]) ?? [])];
  const pak = (pred: (e: Bestaand) => boolean) => {
    const i = over.findIndex(pred);
    return i < 0 ? null : (over.splice(i, 1)[0] ?? null);
  };
  for (const g of gewenst) {
    g.item = pak((e) => e.werkbon_dag_id === g.dag.id && e.assigned_to === g.persoon);
  }
  for (const g of gewenst) {
    if (g.item) continue;
    g.item =
      pak((e) => e.werkbon_dag_id === g.dag.id && !gewenst.some((x) => x.item?.id === e.id)) ??
      pak((e) => !e.werkbon_dag_id && splitsLokaal(e.start_at).date === g.dag.datum);
  }

  const weg = over.filter((e) => e.werkbon_dag_id || e.herkomst === 'planning').map((e) => e.id);
  if (weg.length) {
    const { error: e } = await supabase.from('calendar_events').delete().in('id', weg);
    if (e) return { error: describeError('syncWerkbonEvents.weg', e) };
  }

  const base = { title: w.titel || 'Werkbon', customer_id: w.customer_id || null, notes: w.omschrijving || null };
  for (const g of gewenst) {
    const velden = {
      ...base,
      assigned_to: g.persoon,
      ...eventTijden(g.dag.datum, g.start, g.eind),
      werkbon_dag_id: g.dag.id ?? null,
    };
    const { error: e } = g.item
      ? await supabase.from('calendar_events').update(velden).eq('id', g.item.id)
      : await supabase
          .from('calendar_events')
          .insert({ ...velden, company_id: companyId, werkbon_id: werkbonId, herkomst: 'planning' });
    if (e) return { error: describeError('syncWerkbonEvents.schrijf', e) };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Meldingen aan collega's (notificatieService van het dashboard)
// ---------------------------------------------------------------------------
//
// Collega-meldingen lopen via de bestaande Edge Function `create-notification`
// (de RLS op `notifications` staat alleen self-insert toe). Alleen in-app: de
// HTML-mail die het dashboard optioneel meestuurt bouwt de app (nog) niet.

/**
 * @-vermeldingen in een nieuwe notitie (createMentionNotifications): elke
 * getagde collega krijgt een melding in de app en een mail. Ook wie zichzelf
 * tagt, zoals in het dashboard.
 */
export async function meldVermeldingen(opts: {
  html: string;
  werkbonId: string;
  maakerNaam: string | null;
  context: string;
}): Promise<void> {
  await pushNotificaties(
    mentionMeldingen({
      text: opts.html,
      relatedType: 'werkbon',
      relatedId: opts.werkbonId,
      link: 'werkbonnen',
      creatorName: opts.maakerNaam,
      contextName: opts.context,
    }),
  );
}

/**
 * Na opslaan: wie nieuw gekoppeld is krijgt "Je bent toegewezen aan …", wie
 * nieuw verantwoordelijk is "Je bent verantwoordelijk voor …" (en dan niet
 * óók de toewijzing). Jezelf wordt overgeslagen.
 */
export async function meldToewijzingen(opts: {
  werkbonId: string;
  titel: string;
  uitvoerders: string[];
  verantwoordelijken: string[];
  vorigeUitvoerders?: string[];
  vorigeVerantwoordelijken?: string[];
  maker: string | null;
  /** "Stuur e-mail" van het dashboard: naast de melding in de app ook een mail. */
  stuurMail?: boolean;
}): Promise<void> {
  const link = `werkbonnen/${opts.werkbonId}`;
  const mail = opts.stuurMail ? { email: true } : {};
  const prevV = new Set(opts.vorigeVerantwoordelijken ?? []);
  const nieuweV = [...new Set(opts.verantwoordelijken)].filter((id) => !prevV.has(id) && id !== opts.maker);
  const prevU = new Set(opts.vorigeUitvoerders ?? []);
  const nieuweU = [...new Set(opts.uitvoerders)].filter(
    (id) => !prevU.has(id) && id !== opts.maker && !nieuweV.includes(id),
  );
  await pushNotificaties([
    ...nieuweU.map((uid) => ({
      user_id: uid,
      type: 'toewijzing_werkbon',
      title: `Je bent toegewezen aan ${opts.titel}`,
      body: null,
      link,
      related_type: 'werkbon',
      related_id: opts.werkbonId,
      ...mail,
    })),
    ...nieuweV.map((uid) => ({
      user_id: uid,
      type: 'verantwoordelijke_werkbon',
      title: `Je bent verantwoordelijk voor ${opts.titel}`,
      body: 'Jij bent het aanspreekpunt voor deze werkbon.',
      link,
      related_type: 'werkbon',
      related_id: opts.werkbonId,
      ...mail,
    })),
  ]);
}

/**
 * Verzet/ingepland/afgehaald (meldPlanningWijziging): een in-app melding plus
 * een rij in `planning_wijzigingen` voor de dagelijkse samenvatting.
 */
export async function meldPlanningWijziging(opts: {
  companyId: string;
  userIds: string[];
  soort: 'verzet' | 'ingepland' | 'afgehaald';
  werkbon: { id: string; nummer: string | null; titel: string; klant: string | null };
  /** Leeg bij een dag die er nieuw bij komt. */
  oud?: { datum: string | null; start: string; eind: string };
  nieuw?: { datum: string | null; start: string; eind: string };
  maker: string | null;
}): Promise<void> {
  const ontvangers = [...new Set(opts.userIds.filter(Boolean))].filter((id) => id !== opts.maker);
  if (!ontvangers.length) return;
  const nieuw = opts.nieuw ?? { datum: null, start: '', eind: '' };
  const oud = opts.oud ?? { datum: null, start: '', eind: '' };
  const omschrijf = (d: string | null, s: string) => (d ? `${d}${s ? ` om ${s}` : ''}` : 'niet ingepland');
  const titel =
    opts.soort === 'afgehaald'
      ? `Je staat niet meer op ${opts.werkbon.titel || 'een klus'}`
      : opts.soort === 'ingepland'
        ? `Ingepland: ${opts.werkbon.titel || 'een klus'}`
        : `Planning gewijzigd: ${opts.werkbon.titel || 'een klus'}`;
  const body =
    opts.soort === 'afgehaald'
      ? `Was: ${omschrijf(oud.datum, oud.start)}`
      : `Was ${omschrijf(oud.datum, oud.start)}, wordt ${omschrijf(nieuw.datum, nieuw.start)}`;
  await pushNotificaties(
    ontvangers.map((uid) => ({
      user_id: uid,
      type: 'planning_wijziging',
      title: titel,
      body,
      link: 'planning',
      related_type: 'werkbon',
      related_id: opts.werkbon.id,
    })),
  );
  const { error } = await supabase.from('planning_wijzigingen').insert(
    ontvangers.map((uid) => ({
      company_id: opts.companyId,
      user_id: uid,
      werkbon_id: opts.werkbon.id,
      werkbon_nummer: opts.werkbon.nummer,
      titel: opts.werkbon.titel,
      klant: opts.werkbon.klant,
      soort: opts.soort,
      oude_datum: oud.datum || null,
      oude_start: oud.start || null,
      oude_eind: oud.eind || null,
      nieuwe_datum: nieuw.datum || null,
      nieuwe_start: nieuw.start || null,
      nieuwe_eind: nieuw.eind || null,
    })),
  );
  if (error && __DEV__) console.log('[werkbon] planning_wijzigingen niet vastgelegd', error.message);
}

// ---------------------------------------------------------------------------
// Keuzelijsten voor het formulier
// ---------------------------------------------------------------------------

export type VoertuigKeuze = {
  id: string;
  naam: string;
  kenteken: string | null;
  kleur: string | null;
  actief: boolean;
  zitplaatsen: number | null;
};

/** Alle voertuigen (ook inactief: al gekozen blijft zichtbaar). */
export async function listAlleVoertuigen(): Promise<{ data: VoertuigKeuze[]; error: string | null }> {
  const { data, error } = await supabase
    .from('voertuigen')
    .select('id, naam, kenteken, kleur, actief, zitplaatsen')
    .order('naam', { ascending: true });
  if (error) return { data: [], error: describeError('listAlleVoertuigen', error) };
  return { data: (data as VoertuigKeuze[]) ?? [], error: null };
}

/** Projecten voor de keuzelijst (gefilterd op klant in het formulier). */
export async function listProjectKeuzes(): Promise<{
  data: { id: string; name: string | null; customer_id: string | null }[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, customer_id')
    .order('name', { ascending: true })
    .limit(1000);
  if (error) return { data: [], error: describeError('listProjectKeuzes', error) };
  return { data: (data as never) ?? [], error: null };
}

/** Leveranciers (ook inactief, voor de naam achter een regel). */
export async function listLeveranciersNamen(): Promise<Record<string, string>> {
  const { data } = await supabase.from('leveranciers').select('id, naam');
  const map: Record<string, string> = {};
  for (const r of (data as { id: string; naam: string | null }[]) ?? []) map[r.id] = r.naam ?? '';
  return map;
}

/** Collega's van het eigen bedrijf, om een werkbon aan toe te wijzen. */
export async function listCompanyProfiles(): Promise<{
  data: { id: string; full_name: string | null; role: string | null }[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('actief', true)
    .order('full_name', { ascending: true });

  if (error) return { data: [], error: describeError('listCompanyProfiles', error) };
  return { data: (data as never) ?? [], error: null };
}

/**
 * Alle werkbonfoto's van het bedrijf, nieuwste eerst — voor het overzicht
 * "Foto's & bestanden".
 *
 * Werkbonfoto's volgen de rechten van hun werkbon (migratie 20261023161512 in
 * ~/BossBase): wie de werkbon niet mag zien, krijgt de foto ook niet. De werkbon
 * staat er als optionele join bij; komt hij toch niet mee, dan staat er
 * "Werkbon" zonder titel in plaats van een leeg gat.
 */
export async function listCompanyPhotos(
  limit = 120,
): Promise<{ data: CompanyPhoto[]; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_fotos')
    .select(
      `id, url, categorie, created_at, werkbon_id,
       werkbon:werkbonnen ( id, nummer, titel, status,
         customer:customers ( id, name ) )`,
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], error: describeError('listCompanyPhotos', error) };
  }
  const rows = (data as unknown as CompanyPhoto[]) ?? [];
  if (rows.length === 0) return { data: [], error: null };

  const paden = rows.map((r) => opslagpad(r.url));
  const { data: signed, error: signError } = await supabase.storage
    .from(FOTO_BUCKET)
    .createSignedUrls(paden, SIGNED_URL_SECONDEN);

  if (signError) {
    return { data: [], error: describeError('listCompanyPhotos.signed', signError) };
  }
  return {
    data: rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? r.url })),
    error: null,
  };
}

export type CompanyPhoto = {
  id: string;
  url: string;
  categorie: string | null;
  created_at: string;
  werkbon_id: string;
  werkbon: {
    id: string;
    nummer: string | null;
    titel: string | null;
    status: string | null;
    customer: { id: string; name: string | null } | null;
  } | null;
};
