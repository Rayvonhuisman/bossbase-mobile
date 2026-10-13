import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isReadonly } from '@/lib/sessionContext';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import type { Customer } from '@/types/domain';
import { haalInStukken } from '@/lib/inStukken';

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
  kvk_number, btw_number, iban, notes, logo_url, moneybird_id, created_at
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
    notes: clean(input.notes),
  };

  const { data, error } = await supabase
    .from('customers')
    .insert(payload)
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    console.warn('[customerService.createCustomer]', error.code, error.message);
    // Honest, Dutch user-facing message — never a fake success.
    const msg =
      error.code === '42501' || error.code === 'PGRST301'
        ? 'Je hebt geen rechten om een klant aan te maken.'
        : 'Klant kon niet worden opgeslagen. Probeer het opnieuw.';
    return { data: null, error: msg };
  }
  return { data: (data as unknown as Customer) ?? null, error: null };
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
// database): INSERT vraagt alleen het eigen bedrijf (plus de read-onlygate en de
// klantenlimiet), UPDATE vraagt `klanten_bewerken` en DELETE vraagt
// `klanten_verwijderen`. Aanmaken mag dus meer mensen dan bewerken — precies
// andersom dan je zou verwachten, en de reden dat die twee hier aparte gates
// hebben in plaats van één "mag klanten beheren".

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
    'notes',
  ] as const) {
    if (input[veld] !== undefined) updates[veld] = schoon(input[veld]);
  }

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

export async function deleteCustomer(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('customers').delete().eq('id', id).select('id'),
    {
      context: 'customerService.deleteCustomer',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De klant is niet verwijderd. Je hebt het recht Klanten verwijderen nodig.',
    },
  );
  if (!res.ok && res.soort === 'conflict') {
    return writeFout(
      'conflict',
      'Deze klant heeft nog werkbonnen, offertes of facturen. Verwijder of ontkoppel die eerst.',
    );
  }
  return res.ok ? { ok: true, data: null } : res;
}
