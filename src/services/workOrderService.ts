import { supabase } from '@/lib/supabase';
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
  ondertekend_op, ondertekend_door_naam, created_at, updated_at,
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
): Promise<{ data: WorkOrderWithRelations[]; error: string | null }> {
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
  const rijen = (data as unknown as WorkOrderWithRelations[]) ?? [];
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
): Promise<{ data: WorkOrderWithRelations | null; error: string | null }> {
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
  return { data: (data as unknown as WorkOrderWithRelations) ?? null, error: null };
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
): Promise<{ data: Record<string, { naam: string; kleur: string | null }>; error: string | null }> {
  const uniek = Array.from(new Set(ids.filter(Boolean)));
  if (uniek.length === 0) return { data: {}, error: null };

  const { data, error } = await metTijdslimiet((signal) =>
    supabase.from('voertuigen').select('id, naam, kleur').in('id', uniek).abortSignal(signal),
  );

  if (error) {
    return { data: {}, error: describeError('listVoertuigen', error) };
  }
  const map: Record<string, { naam: string; kleur: string | null }> = {};
  for (const row of (data as { id: string; naam: string | null; kleur: string | null }[]) ?? []) {
    map[row.id] = { naam: row.naam ?? 'Voertuig', kleur: row.kleur };
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

/**
 * Materials (benodigdheden) linked to a work order — table `werkbon_materialen`.
 * RLS lets the assigned worker read these, so a field worker sees what to bring.
 * Prices are deliberately not selected: they are not a field-worker concern.
 */
export async function listWorkOrderMaterials(
  workOrderId: string,
): Promise<{ data: WorkOrderMaterial[]; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_materialen')
    .select('id, naam, eenheid, aantal')
    .eq('werkbon_id', workOrderId)
    .order('naam', { ascending: true });

  if (error) {
    return { data: [], error: describeError('listWorkOrderMaterials', error) };
  }
  return { data: (data as unknown as WorkOrderMaterial[]) ?? [], error: null };
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
      error: 'Je mag deze taak niet afvinken. Alleen de verantwoordelijke, een admin of een planner kan dat.',
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

/** Een foto verwijderen: eerst het bestand, dan de rij. */
export async function deleteWorkOrderPhoto(
  id: string,
  bewaardeUrl: string,
): Promise<{ error: string | null }> {
  const pad = opslagpad(bewaardeUrl);
  if (pad) await supabase.storage.from(FOTO_BUCKET).remove([pad]);

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
 * Spiegelt `bb_mag_werkbon_uren_beheren()`: uitvoerder, verantwoordelijke, of
 * rol admin/planner. Let op het verschil met bewerken — hier telt de RÓL, niet
 * het recht `werkbonnen_bewerken`. Boeken mag dus een bredere groep (iedere
 * uitvoerder) én een smallere (geen los recht dat het opent).
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
  if (r.role === 'admin' || r.role === 'planner') return true;
  if (!r.userId) return false;
  return (
    (workOrder.assigned_to_ids ?? []).includes(r.userId) ||
    (workOrder.verantwoordelijke_ids ?? []).includes(r.userId) ||
    workOrder.assigned_to === r.userId
  );
}

/**
 * Mag deze gebruiker een werkbon aanmaken?
 *
 * Policy `werkbonnen_insert` eist de RÓL admin of planner — een medewerker met
 * `werkbonnen_bewerken` mag bestaande bonnen wijzigen maar géén nieuwe maken.
 * Daarnaast eist `readonly_werkbonnen` een geldig abonnement.
 */
export function canCreateWorkOrder(r: WerkbonRechten): boolean {
  if (r.readonly) return false;
  return r.role === 'admin' || r.role === 'planner';
}

/**
 * The next status a job can move to, in the live vocabulary.
 * gepland → in_uitvoering → afgerond, and admin/planner may also step back.
 */
export function getAllowedNextStatuses(
  current: WorkOrderStatus,
  role: Role | null,
): WorkOrderStatus[] {
  const canRewind = role === 'admin' || role === 'planner';
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
export async function updateWorkOrderStatus(
  workOrder: Pick<WorkOrderWithRelations, 'id' | 'gestart_op'>,
  status: WorkOrderStatus,
): Promise<{ data: WorkOrderWithRelations | null; error: string | null }> {
  const patch: Record<string, unknown> = { status };

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
  const row = (data as unknown as WorkOrderWithRelations[])?.[0];
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
  id, note, created_by, created_at, voor_klant,
  auteur:profiles!werkbon_notities_created_by_fkey ( id, full_name )
`;

export async function listWorkOrderNotes(
  workOrderId: string,
): Promise<{ data: WorkOrderNote[]; error: string | null }> {
  const { data, error } = await supabase
    .from('werkbon_notities')
    .select(NOTE_COLUMNS)
    .eq('werkbon_id', workOrderId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: describeError('listWorkOrderNotes', error) };
  }
  return { data: (data as unknown as WorkOrderNote[]) ?? [], error: null };
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

// ---------------------------------------------------------------------------
// Taken en meerwerk aanmaken/verwijderen — tabel `werkbon_taken`
// ---------------------------------------------------------------------------
//
// LET OP het verschil met afvinken. `werkbon_taken_update` staat toe wat de
// werkbon toestaat (verantwoordelijke, werkbonnen_bewerken, gedeelde
// werkruimte), maar `werkbon_taken_insert` en `_delete` eisen daarbovenop de
// RÓL admin of planner. Een uitvoerder mag dus wél afvinken en géén regel
// toevoegen of weggooien. Zie canAddTask hieronder.

/** Mag deze gebruiker taken/meerwerk toevoegen of verwijderen? */
export function canAddTask(
  workOrder: Pick<WorkOrderWithRelations, 'ondertekend_op'>,
  r: WerkbonRechten,
): boolean {
  if (workOrder.ondertekend_op) return false;
  if (r.readonly) return false;
  return r.role === 'admin' || r.role === 'planner';
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
      error: 'De regel is niet opgeslagen — alleen een admin of planner kan taken toevoegen.',
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
// Materialen — tabel `werkbon_materialen`
// ---------------------------------------------------------------------------
//
// Lezen mag iedere uitvoerder (dat is de boodschappenlijst). Toevoegen en
// wijzigen volgt de werkbon (`werkbon_materialen_insert` / `_update`), maar
// VERWIJDEREN eist net als bij taken de rol admin of planner.
//
// `prijs_per` en `subtotaal` schrijft de app bewust niet: dat is kantoorwerk,
// en de inkoopprijs is server-side afgeschermd op het recht `inkoopprijzen`.
// Een monteur die een materiaal bijzet, zet een aantal — geen bedrag.

export function canEditMaterials(
  workOrder: Pick<WorkOrderWithRelations, 'verantwoordelijke_ids' | 'ondertekend_op'>,
  r: WerkbonRechten,
): boolean {
  return canEditWorkOrder(workOrder, r);
}

export function canDeleteMaterial(
  workOrder: Pick<WorkOrderWithRelations, 'ondertekend_op'>,
  r: WerkbonRechten,
): boolean {
  if (workOrder.ondertekend_op) return false;
  if (r.readonly) return false;
  return r.role === 'admin' || r.role === 'planner';
}

export async function addWorkOrderMaterial(input: {
  werkbon_id: string;
  company_id: string;
  naam: string;
  eenheid?: string | null;
  aantal: number;
}): Promise<{ data: WorkOrderMaterial | null; error: string | null }> {
  const naam = input.naam.trim();
  if (!naam) return { data: null, error: 'Vul een naam in.' };
  if (!Number.isFinite(input.aantal) || input.aantal <= 0) {
    return { data: null, error: 'Vul een geldig aantal in.' };
  }

  const { data, error } = await supabase
    .from('werkbon_materialen')
    .insert({
      werkbon_id: input.werkbon_id,
      company_id: input.company_id,
      naam,
      eenheid: input.eenheid?.trim() ? input.eenheid.trim() : null,
      aantal: input.aantal,
      prijs_per: 0,
      subtotaal: 0,
    })
    .select('id, naam, eenheid, aantal');

  if (error) return { data: null, error: describeError('addWorkOrderMaterial', error) };
  const row = (data as unknown as WorkOrderMaterial[])?.[0];
  if (!row) {
    return { data: null, error: 'Het materiaal is niet opgeslagen — je hebt hier geen rechten voor.' };
  }
  return { data: row, error: null };
}

/** Alleen het aantal bijstellen — bedragen blijven kantoorwerk. */
export async function updateMaterialAmount(
  id: string,
  aantal: number,
): Promise<{ data: WorkOrderMaterial | null; error: string | null }> {
  if (!Number.isFinite(aantal) || aantal <= 0) {
    return { data: null, error: 'Vul een geldig aantal in.' };
  }
  const { data, error } = await supabase
    .from('werkbon_materialen')
    .update({ aantal })
    .eq('id', id)
    .select('id, naam, eenheid, aantal');

  if (error) return { data: null, error: describeError('updateMaterialAmount', error) };
  const row = (data as unknown as WorkOrderMaterial[])?.[0];
  if (!row) return { data: null, error: 'Het aantal is niet opgeslagen — je hebt hier geen rechten voor.' };
  return { data: row, error: null };
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
// Werkbon aanmaken
// ---------------------------------------------------------------------------

export type CreateWorkOrderInput = {
  company_id: string;
  titel: string;
  customer_id?: string | null;
  omschrijving?: string | null;
  gepland_op?: string | null;
  locatie?: string | null;
  assigned_to_ids?: string[];
  verantwoordelijke_ids?: string[];
};

/**
 * Een nieuwe werkbon aanmaken.
 *
 * `nummer` wordt niet meegestuurd: trigger `bb_werkbon_nummer` bepaalt het
 * eerstvolgende WB-nummer per bedrijf. Zelf nummeren zou twee bronnen geven die
 * bij gelijktijdig aanmaken uit elkaar lopen.
 *
 * De CHECK `werkbonnen_verantwoordelijke_subset` eist dat elke
 * verantwoordelijke óók uitvoerder is; dat dwingen we hier af zodat de
 * gebruiker geen databasefout te zien krijgt.
 */
export async function createWorkOrder(
  input: CreateWorkOrderInput,
): Promise<{ data: WorkOrderWithRelations | null; error: string | null }> {
  const titel = input.titel.trim();
  if (!titel) return { data: null, error: 'Een werkbon heeft een titel nodig.' };

  const uitvoerders = Array.from(new Set(input.assigned_to_ids ?? []));
  const verantwoordelijken = Array.from(new Set(input.verantwoordelijke_ids ?? [])).filter((id) =>
    uitvoerders.includes(id),
  );

  const { data, error } = await supabase
    .from('werkbonnen')
    .insert({
      company_id: input.company_id,
      titel,
      customer_id: input.customer_id ?? null,
      omschrijving: input.omschrijving?.trim() ? input.omschrijving.trim() : null,
      gepland_op: input.gepland_op ?? null,
      locatie: input.locatie?.trim() ? input.locatie.trim() : null,
      status: 'gepland',
      assigned_to_ids: uitvoerders,
      verantwoordelijke_ids: verantwoordelijken,
      // Legacy-kolom meevullen zodat oudere schermen de toewijzing ook zien.
      assigned_to: uitvoerders[0] ?? null,
    })
    .select(WORK_ORDER_COLUMNS);

  if (error) return { data: null, error: describeError('createWorkOrder', error) };
  const row = (data as unknown as WorkOrderWithRelations[])?.[0];
  if (!row) {
    return {
      data: null,
      error: 'De werkbon is niet aangemaakt — alleen een admin of planner kan dat.',
    };
  }
  return { data: row, error: null };
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
 * De SELECT-policy op `werkbon_fotos` is bedrijfsbreed (`company_id`), terwijl
 * die op `werkbonnen` smaller is (eigen werk, tenzij gedeelde werkruimte of een
 * inzage-recht). Een medewerker kan dus foto's zien waarvan hij de bijbehorende
 * werkbon niet mag openen. We embedden de werkbon daarom als optionele join en
 * tonen "Werkbon" zonder titel als hij niet meekomt — in plaats van de rij weg
 * te laten en de gebruiker een onverklaarbaar gat te laten zien.
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
