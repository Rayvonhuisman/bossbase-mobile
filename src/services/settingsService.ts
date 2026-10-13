import { supabase } from '@/lib/supabase';
import { getCompanyId, getSessionStand, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { classificeerFout, schrijf, writeFout, type WriteResult } from '@/lib/writeResult';

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
  uren_herinnering_interval_min, uren_herinnering_moment, uren_herinnering_dagen,
  uren_herinnering_mail, uren_herinnering_uitgesloten, agenda_start_uur, agenda_eind_uur
`;

/** Wanneer de urenherinnering komt (`uren_herinnering_moment`). */
export type HerinneringMoment = 'na_werkdag' | 'einde_dag' | 'volgende_ochtend';
const MOMENTEN: readonly HerinneringMoment[] = ['na_werkdag', 'einde_dag', 'volgende_ochtend'];

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
  uren_herinnering_moment: HerinneringMoment;
  /** ISO-weekdagen (1 = maandag … 7 = zondag). */
  uren_herinnering_dagen: number[];
  /** true = melding in de app én per mail. */
  uren_herinnering_mail: boolean;
  /** Profiel-id's die GEEN herinnering krijgen; leeg = iedereen. */
  uren_herinnering_uitgesloten: string[];
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
  // Zelfde terugval als `toBedrijfsinstellingen` in het dashboard: zonder rij
  // staat de herinnering elk uur aan, de volgende ochtend, alle dagen.
  uren_herinnering_interval_min: 60,
  uren_herinnering_moment: 'volgende_ochtend',
  uren_herinnering_dagen: [1, 2, 3, 4, 5, 6, 7],
  uren_herinnering_mail: false,
  uren_herinnering_uitgesloten: [],
  agenda_start_uur: 7,
  agenda_eind_uur: 20,
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
    uren_herinnering_moment: MOMENTEN.includes(row.uren_herinnering_moment as HerinneringMoment)
      ? (row.uren_herinnering_moment as HerinneringMoment)
      : STANDAARD.uren_herinnering_moment,
    uren_herinnering_dagen: Array.isArray(row.uren_herinnering_dagen)
      ? (row.uren_herinnering_dagen as unknown[]).map(Number)
      : [...STANDAARD.uren_herinnering_dagen],
    uren_herinnering_mail: row.uren_herinnering_mail === true,
    uren_herinnering_uitgesloten: Array.isArray(row.uren_herinnering_uitgesloten)
      ? (row.uren_herinnering_uitgesloten as unknown[]).map(String)
      : [],
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
    | 'uren_herinnering_interval_min'
    | 'uren_herinnering_moment'
    | 'uren_herinnering_dagen'
    | 'uren_herinnering_mail'
    | 'uren_herinnering_uitgesloten'
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
    bereik(input.uren_herinnering_interval_min, 0, 1440, 'herhaalinterval') ??
    (input.uren_herinnering_moment && !MOMENTEN.includes(input.uren_herinnering_moment)
      ? 'Kies wanneer de herinnering komt.'
      : null) ??
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
  zetGetal('uren_herinnering_interval_min');
  if (input.uren_herinnering_moment != null) {
    updates.uren_herinnering_moment = input.uren_herinnering_moment;
  }
  if (Array.isArray(input.uren_herinnering_dagen)) {
    updates.uren_herinnering_dagen = [...new Set(input.uren_herinnering_dagen.map(Number))].sort(
      (a, b) => a - b,
    );
  }
  if (typeof input.uren_herinnering_mail === 'boolean') {
    updates.uren_herinnering_mail = input.uren_herinnering_mail;
  }
  if (Array.isArray(input.uren_herinnering_uitgesloten)) {
    updates.uren_herinnering_uitgesloten = input.uren_herinnering_uitgesloten;
  }
  if (input.btw_stelsel != null) updates.btw_stelsel = input.btw_stelsel;
  if (input.auto_sync_google_calendar != null) {
    updates.auto_sync_google_calendar = input.auto_sync_google_calendar;
  }

  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');
  updates.updated_at = new Date().toISOString();

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
    | 'branding_color'
  >
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateCompany(input: CompanyInput): Promise<WriteResult<CompanyRow>> {
  const companyId = getCompanyId();
  if (!companyId) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');

  if (input.name !== undefined && !input.name.trim()) {
    return writeFout('validatie', 'De bedrijfsnaam mag niet leeg zijn.');
  }
  if (input.email && !EMAIL_RE.test(input.email.trim())) {
    return writeFout('validatie', 'E-mailadres heeft geen geldig formaat');
  }
  if (input.reply_to_email && !EMAIL_RE.test(input.reply_to_email.trim())) {
    return writeFout('validatie', 'Antwoord e-mailadres heeft geen geldig formaat');
  }
  if (input.kvk && !/^\d{8}$/.test(input.kvk.trim())) {
    return writeFout('validatie', 'KvK-nummer moet 8 cijfers bevatten');
  }
  if (input.branding_color && !/^#[0-9a-fA-F]{6}$/.test(input.branding_color.trim())) {
    return writeFout('validatie', 'Kies een merkkleur als hexcode, bijvoorbeeld #1DDB62.');
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
    'branding_color',
  ] as const) {
    const v = input[veld];
    if (v !== undefined) updates[veld] = v?.trim() || null;
  }
  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

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

// ── Logo ───────────────────────────────────────────────────────────────────

/**
 * Logo uploaden zoals het dashboard: bucket `bedrijf-logos`, pad
 * `{companyId}/logo.{ext}` (upsert), oude `logo.*` met een andere extensie
 * opruimen, daarna `companies.logo_url` zetten. Alleen JPG en PNG: het logo
 * komt in e-mails en PDF's terecht, en die tonen WebP niet betrouwbaar.
 */
export async function uploadBedrijfslogo(input: {
  bytes: ArrayBuffer;
  contentType: string;
  extensie: string;
}): Promise<WriteResult<CompanyRow>> {
  const companyId = getCompanyId();
  if (!companyId) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  if (input.contentType !== 'image/jpeg' && input.contentType !== 'image/png') {
    return writeFout(
      'validatie',
      "Dit bestandstype wordt niet ondersteund. Het logo komt ook in e-mails en PDF's terecht — gebruik JPG of PNG.",
    );
  }
  // Bucket `bedrijf-logos` heeft file_size_limit 5 MB; groter weigert de server.
  if (input.bytes.byteLength > 5 * 1024 * 1024) {
    return writeFout('validatie', 'Het logo is groter dan 5 MB.');
  }
  // De storage-policy op `bedrijf-logos` toetst alleen de bedrijfsmap, niet de
  // rol. Zonder deze check zou een niet-beheerder `logo.*` kunnen overschrijven
  // (zelfde URL, dus direct zichtbaar in mails/PDF's) terwijl de update van
  // `companies.logo_url` daarna door RLS wordt geweigerd.
  if (getSessionStand().role !== 'admin') {
    return writeFout('geen-rechten', 'Het logo is niet opgeslagen. Alleen een beheerder kan het wijzigen.');
  }
  const ext = input.extensie === 'png' ? 'png' : 'jpg';
  const pad = `${companyId}/logo.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('bedrijf-logos')
    .upload(pad, input.bytes, { upsert: true, contentType: input.contentType });
  if (upErr) {
    return classificeerFout({ message: upErr.message }, 'settingsService.uploadBedrijfslogo', isReadonly());
  }
  const { data: pub } = supabase.storage.from('bedrijf-logos').getPublicUrl(pad);

  try {
    const { data: bestaand } = await supabase.storage.from('bedrijf-logos').list(companyId);
    const wezen = (bestaand ?? [])
      .filter((f) => /^logo\./i.test(f.name) && `${companyId}/${f.name}` !== pad)
      .map((f) => `${companyId}/${f.name}`);
    if (wezen.length) await supabase.storage.from('bedrijf-logos').remove(wezen);
  } catch {
    /* opruimen mag het uploaden niet laten falen */
  }

  // Zelfde publieke URL als het dashboard opslaat (zonder query), zodat PDF's
  // en mails hem op dezelfde manier ophalen.
  const url = pub.publicUrl;
  return schrijf<CompanyRow>(
    () => supabase.from('companies').update({ logo_url: url }).eq('id', companyId).select(COMPANY_COLUMNS),
    {
      context: 'settingsService.uploadBedrijfslogo',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'Het logo is niet opgeslagen. Alleen een beheerder kan het wijzigen.',
    },
  );
}
