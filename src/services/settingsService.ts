import { supabase } from '@/lib/supabase';
import { getCompanyId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { schrijf, writeFout, type WriteResult } from '@/lib/writeResult';

/**
 * Bedrijfsinstellingen (`bedrijfsinstellingen`) en bedrijfsgegevens
 * (`companies`) — dezelfde twee tabellen als `instellingenService.js`.
 *
 * RLS: lezen mag iedereen binnen het bedrijf; UPDATE en INSERT vragen op allebei
 * de tabellen rol `admin`. Dat is een ROL-vergelijking in de policy, geen recht:
 * een medewerker met het recht `instellingen` mag de pagina wél openen en niets
 * opslaan. De actiematrix zet daarom `roles: ['admin']` op wijzigen, zodat de
 * app geen knop toont die gegarandeerd op 42501 uitkomt.
 *
 * Er hoeft niet altijd een instellingenrij te bestaan: het dashboard valt terug
 * op standaardwaarden (uurtarief 55, btw 21, reiskosten 0,23, 14 dagen geldig)
 * en maakt de rij pas bij de eerste keer opslaan aan. Wij doen hetzelfde.
 */

const SETTINGS_COLUMNS = `
  id, company_id, uurtarief, reiskosten_per_km, standaard_marge,
  btw_pct, offerte_geldig_dagen, btw_stelsel, auto_sync_google_calendar,
  uren_herinnering_interval_min, agenda_start_uur, agenda_eind_uur
`;

export type CompanySettings = {
  id: string | null;
  company_id: string | null;
  uurtarief: number;
  reiskosten_per_km: number;
  standaard_marge: number;
  btw_pct: number;
  offerte_geldig_dagen: number;
  btw_stelsel: string;
  auto_sync_google_calendar: boolean;
  uren_herinnering_interval_min: number;
  agenda_start_uur: number;
  agenda_eind_uur: number;
};

/** Dezelfde standaardwaarden als `toBedrijfsinstellingen` in het dashboard. */
const STANDAARD: CompanySettings = {
  id: null,
  company_id: null,
  uurtarief: 55,
  reiskosten_per_km: 0.23,
  standaard_marge: 25,
  btw_pct: 21,
  offerte_geldig_dagen: 14,
  btw_stelsel: 'factuur',
  auto_sync_google_calendar: false,
  uren_herinnering_interval_min: 0,
  agenda_start_uur: 7,
  agenda_eind_uur: 19,
};

type SettingsDb = Partial<Record<keyof CompanySettings, unknown>>;

function toSettings(row: SettingsDb | null): CompanySettings {
  if (!row) return { ...STANDAARD };
  const num = (v: unknown, d: number) => (v == null ? d : Number(v));
  return {
    id: (row.id as string) ?? null,
    company_id: (row.company_id as string) ?? null,
    uurtarief: num(row.uurtarief, STANDAARD.uurtarief),
    reiskosten_per_km: num(row.reiskosten_per_km, STANDAARD.reiskosten_per_km),
    standaard_marge: num(row.standaard_marge, STANDAARD.standaard_marge),
    btw_pct: num(row.btw_pct, STANDAARD.btw_pct),
    offerte_geldig_dagen: num(row.offerte_geldig_dagen, STANDAARD.offerte_geldig_dagen),
    btw_stelsel: (row.btw_stelsel as string) ?? STANDAARD.btw_stelsel,
    auto_sync_google_calendar: row.auto_sync_google_calendar === true,
    uren_herinnering_interval_min: num(
      row.uren_herinnering_interval_min,
      STANDAARD.uren_herinnering_interval_min,
    ),
    agenda_start_uur: num(row.agenda_start_uur, STANDAARD.agenda_start_uur),
    agenda_eind_uur: num(row.agenda_eind_uur, STANDAARD.agenda_eind_uur),
  };
}

export async function getCompanySettings(): Promise<{
  data: CompanySettings;
  /** Bestaat er al een rij? Zo niet, dan slaat opslaan er een aan. */
  bestaat: boolean;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('bedrijfsinstellingen')
    .select(SETTINGS_COLUMNS)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[settingsService.getCompanySettings]', error.message);
    return { data: { ...STANDAARD }, bestaat: false, error: 'Bedrijfsinstellingen konden niet worden geladen.' };
  }
  return { data: toSettings(data as SettingsDb | null), bestaat: Boolean(data), error: null };
}

export type SettingsInput = Partial<
  Pick<
    CompanySettings,
    | 'uurtarief'
    | 'reiskosten_per_km'
    | 'standaard_marge'
    | 'btw_pct'
    | 'offerte_geldig_dagen'
    | 'btw_stelsel'
    | 'auto_sync_google_calendar'
    | 'agenda_start_uur'
    | 'agenda_eind_uur'
  >
>;

function valideerSettings(input: SettingsInput): string | null {
  const bereik = (v: number | undefined, min: number, max: number, label: string) => {
    if (v === undefined) return null;
    if (!Number.isFinite(v) || v < min || v > max) return `Vul een ${label} tussen ${min} en ${max} in.`;
    return null;
  };
  return (
    bereik(input.uurtarief, 0, 10000, 'uurtarief') ??
    bereik(input.reiskosten_per_km, 0, 100, 'kilometervergoeding') ??
    bereik(input.standaard_marge, 0, 100, 'marge') ??
    bereik(input.btw_pct, 0, 100, 'btw-percentage') ??
    bereik(input.offerte_geldig_dagen, 1, 365, 'geldigheidsduur in dagen') ??
    bereik(input.agenda_start_uur, 0, 23, 'startuur') ??
    bereik(input.agenda_eind_uur, 1, 24, 'einduur') ??
    (input.btw_stelsel && !['kas', 'factuur'].includes(input.btw_stelsel)
      ? 'Kies kas- of factuurstelsel.'
      : null) ??
    (input.agenda_start_uur !== undefined &&
    input.agenda_eind_uur !== undefined &&
    input.agenda_eind_uur <= input.agenda_start_uur
      ? 'Het einduur van de agenda moet ná het startuur liggen.'
      : null)
  );
}

/**
 * Werkt de instellingen bij, of maakt de rij aan als die er nog niet is.
 *
 * `!= null` in plaats van truthy: 0 is een geldige waarde (btw 0%, reiskosten
 * 0). Precies de valkuil die in het dashboard met een comment gemarkeerd staat,
 * en waar een waarde van 0 stilzwijgend niet werd opgeslagen.
 */
export async function upsertCompanySettings(
  input: SettingsInput,
): Promise<WriteResult<CompanySettings>> {
  const fout = valideerSettings(input);
  if (fout) return writeFout('validatie', fout);

  const updates: Record<string, unknown> = {};
  const zetGetal = (sleutel: keyof SettingsInput) => {
    const v = input[sleutel];
    if (v != null) updates[sleutel] = Number(v);
  };
  zetGetal('uurtarief');
  zetGetal('reiskosten_per_km');
  zetGetal('standaard_marge');
  zetGetal('btw_pct');
  zetGetal('offerte_geldig_dagen');
  zetGetal('agenda_start_uur');
  zetGetal('agenda_eind_uur');
  if (input.btw_stelsel != null) updates.btw_stelsel = input.btw_stelsel;
  if (input.auto_sync_google_calendar != null) {
    updates.auto_sync_google_calendar = input.auto_sync_google_calendar;
  }

  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

  const { data: bestaand } = await supabase
    .from('bedrijfsinstellingen')
    .select('id')
    .limit(1)
    .maybeSingle();
  const rij = bestaand as { id: string } | null;

  const geenRechten =
    'De instellingen zijn niet opgeslagen. Alleen een beheerder kan de bedrijfsinstellingen ' +
    'wijzigen.';

  if (rij?.id) {
    const res = await schrijf<SettingsDb>(
      () =>
        supabase
          .from('bedrijfsinstellingen')
          .update(updates)
          .eq('id', rij.id)
          .select(SETTINGS_COLUMNS),
      {
        context: 'settingsService.upsertCompanySettings.update',
        bedrijfReadonly: isReadonly(),
        leegSoort: 'geen-rechten',
        leegMelding: geenRechten,
      },
    );
    return res.ok ? { ok: true, data: toSettings(res.data) } : res;
  }

  const payload = withCompanyId(updates);
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');

  const res = await schrijf<SettingsDb>(
    () => supabase.from('bedrijfsinstellingen').insert(payload).select(SETTINGS_COLUMNS),
    {
      context: 'settingsService.upsertCompanySettings.insert',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: geenRechten,
    },
  );
  return res.ok ? { ok: true, data: toSettings(res.data) } : res;
}

// ── Bedrijfsgegevens ───────────────────────────────────────────────────────

const COMPANY_COLUMNS = `
  id, name, kvk, btw_number, email, phone, address, city, postal_code,
  website, logo_url, branding_color, reply_to_email
`;

export type CompanyRow = {
  id: string;
  name: string;
  kvk: string | null;
  btw_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  website: string | null;
  logo_url: string | null;
  branding_color: string | null;
  reply_to_email: string | null;
};

export async function getCompany(): Promise<{ data: CompanyRow | null; error: string | null }> {
  const companyId = getCompanyId();
  if (!companyId) return { data: null, error: null };
  const { data, error } = await supabase
    .from('companies')
    .select(COMPANY_COLUMNS)
    .eq('id', companyId)
    .maybeSingle();
  if (error) {
    console.warn('[settingsService.getCompany]', error.message);
    return { data: null, error: 'Bedrijfsgegevens konden niet worden geladen.' };
  }
  return { data: (data as unknown as CompanyRow | null) ?? null, error: null };
}

export type CompanyInput = Partial<
  Pick<
    CompanyRow,
    | 'name'
    | 'kvk'
    | 'btw_number'
    | 'email'
    | 'phone'
    | 'address'
    | 'city'
    | 'postal_code'
    | 'website'
    | 'reply_to_email'
  >
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function updateCompany(input: CompanyInput): Promise<WriteResult<CompanyRow>> {
  const companyId = getCompanyId();
  if (!companyId) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');

  if (input.name !== undefined && !input.name.trim()) {
    return writeFout('validatie', 'De bedrijfsnaam mag niet leeg zijn.');
  }
  for (const veld of ['email', 'reply_to_email'] as const) {
    const v = input[veld];
    if (v && !EMAIL_RE.test(v.trim())) return writeFout('validatie', 'Dit e-mailadres klopt niet.');
  }

  const updates: Record<string, unknown> = {};
  for (const veld of [
    'name',
    'kvk',
    'btw_number',
    'email',
    'phone',
    'address',
    'city',
    'postal_code',
    'website',
    'reply_to_email',
  ] as const) {
    const v = input[veld];
    if (v !== undefined) updates[veld] = v?.trim() || null;
  }
  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');
  updates.updated_at = new Date().toISOString();

  return schrijf<CompanyRow>(
    () => supabase.from('companies').update(updates).eq('id', companyId).select(COMPANY_COLUMNS),
    {
      context: 'settingsService.updateCompany',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding:
        'De bedrijfsgegevens zijn niet opgeslagen. Alleen een beheerder kan ze wijzigen.',
    },
  );
}
