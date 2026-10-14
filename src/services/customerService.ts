import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getUserId, isReadonly } from '@/lib/sessionContext';
import {
  classificeerFout,
  schrijf,
  writeFout,
  type WriteResult,
  type WriteStatus,
} from '@/lib/writeResult';
import type { Customer } from '@/types/domain';
import { haalInStukken } from '@/lib/inStukken';
import { alsHtml } from '@/lib/notitieTekst';
import { negeerRelatieBijImport } from './leverancierService';
import type { FactuurVoorTotaal, PlanWerkbon } from '@/lib/relaties';
import type { ActivityRow } from './activityService';
import { metProjectBedragen } from './projectService';

/**
 * Columns we actually need. We intentionally do NOT select `updated_at`:
 * SPEC lists only `created_at` on `customers`, and the production DB confirms
 * `updated_at` does not exist (Postgres 42703 in dev logs).
 *
 * Note: `safeColumns` includes only fields we know exist per SPEC §6.2.
 * Using `select('*')` would also work but pulls every extension column.
 */
const SAFE_COLUMNS = `
  id, company_id, name, email, phone, address, postcode, city,
  kvk_number, btw_number, iban, notes, logo_url, moneybird_id, created_at, type
`;

/** Sortable, known-to-exist columns in preference order. */
const SORT_FALLBACKS: readonly string[] = ['created_at', 'name'];

function isMissingColumnError(err: PostgrestError | null | undefined): boolean {
  if (!err) return false;
  // 42703 = undefined_column. PGRST204 = column not in PostgREST cache.
  // The message variant catches translated client-side fallbacks too.
  return (
    err.code === '42703' ||
    err.code === 'PGRST204' ||
    /does not exist|undefined.*column/i.test(err.message ?? '')
  );
}

export async function listCustomers(): Promise<{
  data: Customer[];
  error: string | null;
}> {
  // Try each sort fallback until one succeeds. Other errors bubble up.
  for (const orderCol of SORT_FALLBACKS) {
    // In stukken van 1000 (zie lib/inStukken); `id` als tweede sortering
    // zodat geen rij tussen twee stukken verschuift.
    const { data, error } = await haalInStukken((van, tot) =>
      supabase
        .from('customers')
        .select(SAFE_COLUMNS)
        .order(orderCol, { ascending: false })
        .order('id', { ascending: true })
        .range(van, tot),
    );

    if (!error) {
      return { data: (data as unknown as Customer[]) ?? [], error: null };
    }

    if (isMissingColumnError(error)) {
      if (__DEV__) {
        console.log(
          `[customerService.listCustomers] order(${orderCol}) missing — trying next fallback`,
        );
      }
      continue; // try next sort column
    }

    // Real failure (RLS, network, etc.) — stop and report.
    console.warn('[customerService.listCustomers]', error.message);
    return { data: [], error: 'Klanten konden niet worden geladen.' };
  }

  // Final fallback: no sort at all.
  const { data, error } = await haalInStukken((van, tot) =>
    supabase.from('customers').select(SAFE_COLUMNS).order('id', { ascending: true }).range(van, tot),
  );
  if (error) {
    console.warn('[customerService.listCustomers] unsorted fallback', error.message);
    return { data: [], error: 'Klanten konden niet worden geladen.' };
  }
  return { data: (data as unknown as Customer[]) ?? [], error: null };
}

export type CreateCustomerInput = {
  company_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postcode?: string | null;
  city?: string | null;
  kvk_number?: string | null;
  btw_number?: string | null;
  iban?: string | null;
  notes?: string | null;
};

/**
 * Insert a new customer. Writes to the SAME `customers` table as the desktop
 * dashboard (so it appears there after refresh). `company_id` is required and
 * comes from the AuthProvider — RLS scopes the row to the caller's company.
 * No service-role; the anon client + the company's RLS insert policy apply.
 */
export async function createCustomer(
  input: CreateCustomerInput,
): Promise<{ data: Customer | null; error: string | null }> {
  const clean = (v?: string | null) => {
    const trimmed = v?.trim();
    return trimmed ? trimmed : null;
  };
  const payload = {
    company_id: input.company_id,
    name: input.name.trim(),
    email: clean(input.email),
    phone: clean(input.phone),
    address: clean(input.address),
    postcode: clean(input.postcode),
    city: clean(input.city),
    kvk_number: clean(input.kvk_number),
    btw_number: clean(input.btw_number),
    iban: clean(input.iban),
    // Het dashboard bewaart notities als HTML uit zijn editor.
    notes: clean(input.notes) ? alsHtml(input.notes as string) : null,
  };

  const { data, error } = await supabase
    .from('customers')
    .insert(payload)
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    // Eerlijke melding. Een RLS-weigering (42501) kan drie oorzaken hebben:
    // read-only abonnement (`readonly_customers`), de klantenlimiet van het
    // pakket (`plan_limiet_klanten`) of het ontbrekende recht (customers_insert
    // vraagt klanten_bewerken, verkoop, offertes, werkbonnen_bewerken of
    // planning). De database zegt niet welke; noem dus beide mogelijkheden.
    const fout = classificeerFout(error, 'customerService.createCustomer', isReadonly());
    const msg =
      fout.soort === 'geen-rechten'
        ? 'Klant niet opgeslagen: je hebt geen recht om klanten aan te maken, of de ' +
          'klantenlimiet van je abonnement is bereikt (Instellingen → Abonnement).'
        : fout.soort === 'onbekend'
          ? 'Klant kon niet worden opgeslagen. Probeer het opnieuw.'
          : fout.melding;
    return { data: null, error: msg };
  }
  const klant = (data as unknown as Customer) ?? null;
  // Zelfde tijdlijnregel als `createCustomer` in het dashboard. Mislukt die,
  // dan blijft de klant gewoon bestaan.
  if (klant?.id) {
    const eigen = getUserId();
    void Promise.resolve(
      supabase.from('klant_tijdlijn').insert({
        company_id: payload.company_id,
        customer_id: klant.id,
        type: 'klant_aangemaakt',
        omschrijving: 'Klant toegevoegd aan het systeem',
        aangemaakt_op: new Date().toISOString(),
        ...(eigen ? { created_by: eigen } : {}),
      }),
    ).catch(() => {});
  }
  return { data: klant, error: null };
}

export async function getCustomer(
  id: string,
): Promise<{ data: Customer | null; error: string | null }> {
  const { data, error } = await supabase
    .from('customers')
    .select(SAFE_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.warn('[customerService.getCustomer]', error.message);
    return { data: null, error: 'Klant kon niet worden geladen.' };
  }
  return { data: (data as unknown as Customer | null) ?? null, error: null };
}

// ---------------------------------------------------------------------------
// Wijzigen en verwijderen
// ---------------------------------------------------------------------------
//
// Let op de asymmetrie in de RLS op `customers` (geverifieerd op de live
// database, 13-10-2026): INSERT vraagt het eigen bedrijf plus één van
// klanten_bewerken/verkoop/offertes/werkbonnen_bewerken/planning (en de
// read-onlygate en de klantenlimiet), UPDATE vraagt `klanten_bewerken` en
// DELETE `klanten_verwijderen` (of admin). Aanmaken mag dus meer mensen dan
// bewerken, en daarom hebben die twee hier aparte gates.

export type UpdateCustomerInput = Partial<Omit<CreateCustomerInput, 'company_id'>>;

const schoon = (v?: string | null) => {
  const t = v?.trim();
  return t ? t : null;
};

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
): Promise<WriteResult<Customer>> {
  if (input.name !== undefined && !input.name.trim()) {
    return writeFout('validatie', 'De klantnaam mag niet leeg zijn.');
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email.trim())) {
    return writeFout('validatie', 'Dit e-mailadres klopt niet.');
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  for (const veld of [
    'email',
    'phone',
    'address',
    'postcode',
    'city',
    'kvk_number',
    'btw_number',
    'iban',
    'notes',
  ] as const) {
    if (input[veld] !== undefined) updates[veld] = schoon(input[veld]);
  }
  if (typeof updates.notes === 'string') updates.notes = alsHtml(updates.notes);

  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

  return schrijf<Customer>(
    () => supabase.from('customers').update(updates).eq('id', id).select(SAFE_COLUMNS),
    {
      context: 'customerService.updateCustomer',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding:
        'De klant is niet gewijzigd. Je hebt het recht Klanten bewerken nodig, of de klant ' +
        'bestaat niet meer.',
    },
  );
}

export async function deleteCustomer(id: string): Promise<WriteStatus & { waarschuwing?: string }> {
  // SnelStart-relatie? Dan na het verwijderen op de negeerlijst, anders haalt
  // de volgende import hem terug (zoals `deleteCustomer` in het dashboard).
  // Bestaat de kolom niet, dan is er ook geen koppeling.
  const { data: bestaand } = await supabase
    .from('customers')
    .select('id, snelstart_id')
    .eq('id', id)
    .maybeSingle();

  const res = await schrijf<{ id: string }>(
    () => supabase.from('customers').delete().eq('id', id).select('id'),
    {
      context: 'customerService.deleteCustomer',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De klant is niet verwijderd. Je hebt het recht Klanten verwijderen nodig.',
    },
  );
  // FK's op de live database: aanvragen (deals), activiteiten, klanttijdlijn en
  // verzonden e-mails gaan mee (CASCADE); werkbonnen, offertes, facturen,
  // projecten en kosten blijven en verliezen alleen hun klant (SET NULL). Wat
  // blokkeert is `calendar_events` (customer_id en deal_id zonder ON DELETE):
  // een agenda-afspraak bij de klant of bij een van zijn aanvragen.
  if (!res.ok && res.soort === 'conflict') {
    return writeFout(
      'conflict',
      'Deze klant heeft nog agenda-afspraken (direct of via een aanvraag). Verwijder die eerst in de agenda.',
    );
  }
  if (!res.ok) return res;
  const snelstartId = (bestaand as { snelstart_id?: string | null } | null)?.snelstart_id ?? null;
  const waarschuwing = await negeerRelatieBijImport('klant', snelstartId);
  return waarschuwing ? { ok: true, data: null, waarschuwing } : { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Bedragen per klant (lijst en klantkaart)
// ---------------------------------------------------------------------------

/**
 * De factuurvelden die de bedragen per klant nodig hebben. Zonder het recht
 * `facturen` geeft RLS niets terug; dan blijven de bedragen gewoon weg.
 */
export async function listFactuurTotaalRijen(): Promise<{
  data: FactuurVoorTotaal[];
  error: string | null;
}> {
  const { data, error } = await haalInStukken((van, tot) =>
    supabase
      .from('facturen')
      .select('id, customer_id, status, totaal_incl, totaal_excl, is_credit, gecrediteerd')
      .not('customer_id', 'is', null)
      .order('id', { ascending: true })
      .range(van, tot),
  );
  if (error) {
    console.warn('[customerService.listFactuurTotaalRijen]', error.message);
    return { data: [], error: 'Bedragen konden niet worden geladen.' };
  }
  return { data: (data as unknown as FactuurVoorTotaal[]) ?? [], error: null };
}

// ---------------------------------------------------------------------------
// Klantkaart: alles wat bij één klant hoort
// ---------------------------------------------------------------------------
//
// Eigen, smalle queries per klant (gefilterd op customer_id) in plaats van de
// algemene lijsten van de modules: die halen de laatste 100 van het hele
// bedrijf op, en dan valt een oudere offerte van deze klant er stilletjes af.

export type KlantOfferte = {
  id: string;
  nummer: string | null;
  omschrijving: string | null;
  status: string | null;
  totaal_incl: number | null;
  created_at: string;
};

export type KlantFactuur = FactuurVoorTotaal & {
  id: string;
  nummer: string | null;
  notities: string | null;
  factuurdatum: string | null;
  created_at: string;
};

export type KlantProject = {
  id: string;
  name: string | null;
  status: string | null;
  project_value: number | null;
  created_at: string;
};

export type KlantWerkbon = PlanWerkbon & {
  nummer: string | null;
  omschrijving: string | null;
  status: string | null;
};

type Lijst<T> = Promise<{ data: T[]; error: string | null }>;

async function perKlant<T>(
  tabel: string,
  kolommen: string,
  customerId: string,
  sorteer: string,
  context: string,
  foutTekst: string,
): Lijst<T> {
  const { data, error } = await supabase
    .from(tabel)
    .select(kolommen)
    .eq('customer_id', customerId)
    .order(sorteer, { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) {
    console.warn(`[customerService.${context}]`, error.message);
    return { data: [], error: foutTekst };
  }
  return { data: (data as unknown as T[]) ?? [], error: null };
}

export const listKlantOffertes = (customerId: string): Lijst<KlantOfferte> =>
  perKlant<KlantOfferte>(
    'offertes',
    'id, nummer, omschrijving, status, totaal_incl, created_at',
    customerId,
    'created_at',
    'listKlantOffertes',
    'Offertes konden niet worden geladen.',
  );

export const listKlantFacturen = (customerId: string): Lijst<KlantFactuur> =>
  perKlant<KlantFactuur>(
    'facturen',
    'id, customer_id, nummer, notities, status, factuurdatum, totaal_incl, totaal_excl, ' +
      'is_credit, gecrediteerd, created_at',
    customerId,
    'created_at',
    'listKlantFacturen',
    'Facturen konden niet worden geladen.',
  );

/**
 * `project_value` is niet direct leesbaar (kolomrecht, dashboard 3-10-2026):
 * de waarde komt via `bb_projectbedragen`, alleen voor wie het recht
 * `projectbedragen` heeft. Zonder recht blijft hij `null`.
 */
export const listKlantProjecten = async (customerId: string): Lijst<KlantProject> => {
  const res = await perKlant<Omit<KlantProject, 'project_value'>>(
    'projects',
    'id, name, status, created_at',
    customerId,
    'created_at',
    'listKlantProjecten',
    'Projecten konden niet worden geladen.',
  );
  if (res.error || !res.data.length) return { data: [], error: res.error };
  const metBedrag = await metProjectBedragen(res.data);
  return { data: metBedrag.data, error: null };
};

/** Zelfde kolommen als `activityService`, zodat het activiteitformulier past. */
export const listKlantActiviteiten = (customerId: string): Lijst<ActivityRow> =>
  perKlant<ActivityRow>(
    'activities',
    `id, company_id, customer_id, deal_id, assigned_to, title, type, notes,
     due_at, completed, created_at,
     customer:customers ( id, name, phone, address, postcode, city )`,
    customerId,
    'due_at',
    'listKlantActiviteiten',
    'Activiteiten konden niet worden geladen.',
  );

const WERKBON_KOLOMMEN =
  'id, nummer, titel, omschrijving, status, gepland_op, starttijd, eindtijd, activity_id';

/**
 * Werkbonnen van de klant, met hun geplande dagen (`werkbon_dagen`) voor het
 * planningsblok. Kent de database die tabel (nog) niet, dan zonder dagen: dan
 * telt `gepland_op` als de ene dag, net als in het dashboard.
 */
export async function listKlantWerkbonnen(customerId: string): Lijst<KlantWerkbon> {
  const met = await perKlant<KlantWerkbon & { werkbon_dagen?: KlantWerkbon['dagen'] }>(
    'werkbonnen',
    `${WERKBON_KOLOMMEN}, werkbon_dagen ( datum, starttijd, eindtijd )`,
    customerId,
    'gepland_op',
    'listKlantWerkbonnen',
    'Werkbonnen konden niet worden geladen.',
  );
  if (!met.error) {
    return { data: met.data.map(({ werkbon_dagen, ...w }) => ({ ...w, dagen: werkbon_dagen ?? [] })), error: null };
  }
  return perKlant<KlantWerkbon>(
    'werkbonnen',
    WERKBON_KOLOMMEN,
    customerId,
    'gepland_op',
    'listKlantWerkbonnen',
    'Werkbonnen konden niet worden geladen.',
  );
}
