import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getUserId, isReadonly } from '@/lib/sessionContext';
import { translateAuthError } from '@/lib/authErrors';
import { isNetwerkfout } from '@/lib/netwerkfout';
import { wachtOpVerificatie } from '@/lib/registratie';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import type { Company, Profile } from '@/types/domain';

export type ProfileFetchErrorKind =
  | 'profile_not_found'
  /** Wel een profiel, geen bedrijf, e-mail nog niet bevestigd: de registratie wacht op de code. */
  | 'awaiting_verification'
  | 'company_not_found'
  | 'rls_or_permission_error'
  | 'schema_error'
  | 'network_error'
  | 'unknown_error';

export type ProfileFetchError = {
  kind: ProfileFetchErrorKind;
  /** Raw upstream message — for developer diagnostics only, never shown verbatim to user. */
  message: string;
  details?: {
    code?: string;
    hint?: string;
    raw?: unknown;
  };
};

export type ProfileFetchResult =
  | { ok: true; profile: Profile; company: Company | null }
  | { ok: false; error: ProfileFetchError };

/**
 * Fetch the current user's profile + company.
 *
 * Two separate queries (not a nested join) so we can distinguish:
 *   - profile missing (orphan auth user)
 *   - company missing (deleted/dangling FK)
 *   - RLS / permission error on either table
 *   - network failure
 *
 * RLS is expected to enforce that only the user's own profile row is visible
 * (profiles.id = auth.uid()) and only the user's company is visible.
 */
export async function fetchProfileWithCompany(userId: string): Promise<ProfileFetchResult> {
  if (__DEV__) {
    console.log('[profileService] fetchProfileWithCompany start', { userId });
  }

  // ---- 1) Profile ---------------------------------------------------------
  // Note: `email` is NOT a column on `profiles` (it's on auth.users). Selecting
  // it returns Postgres 42703 (undefined_column).
  const profileResp = await supabase
    .from('profiles')
    .select('id, company_id, full_name, avatar_url, role, email_verified_at')
    .eq('id', userId)
    .maybeSingle();

  if (__DEV__) {
    console.log('[profileService] profile query', {
      hasData: !!profileResp.data,
      hasError: !!profileResp.error,
      errorCode: profileResp.error?.code,
      errorMessage: profileResp.error?.message,
      errorHint: profileResp.error?.hint,
      errorDetails: profileResp.error?.details,
      status: profileResp.status,
    });
  }

  if (profileResp.error) {
    return { ok: false, error: classifySupabaseError(profileResp.error, 'profile') };
  }
  if (!profileResp.data) {
    // maybeSingle returned null → either no row exists OR RLS hides every row.
    // We can't fully distinguish these from one response. Treat as
    // profile_not_found by default; a dev can verify by querying with the
    // service role from Supabase Studio.
    return {
      ok: false,
      error: {
        kind: 'profile_not_found',
        message: `No row in 'profiles' visible for auth.uid()=${userId}`,
        details: {
          hint: 'Check that a profiles row exists for this user, and that RLS allows id = auth.uid() to SELECT it.',
        },
      },
    };
  }

  const profile = profileResp.data as Profile;

  // Net geregistreerd (of eerder geregistreerd en nooit bevestigd): het profiel
  // bestaat zonder bedrijf tot verify-code het aanmaakt. Zelfde regel als de
  // verificatie-gate van het dashboard.
  if (wachtOpVerificatie(profile)) {
    return {
      ok: false,
      error: { kind: 'awaiting_verification', message: 'Profile has no company yet and email is not verified' },
    };
  }

  // ---- 2) Company ---------------------------------------------------------
  // Schema: profiles.company_id is NOT NULL. If it is empty here, the schema
  // expectation is violated — surface that as company_not_found.
  if (!profile.company_id) {
    return {
      ok: false,
      error: {
        kind: 'company_not_found',
        message: 'Profile has no company_id',
        details: { raw: { profileId: profile.id } },
      },
    };
  }

  const companyResp = await supabase
    .from('companies')
    .select('id, name, logo_url')
    .eq('id', profile.company_id)
    .maybeSingle();

  if (__DEV__) {
    console.log('[profileService] company query', {
      companyId: profile.company_id,
      hasData: !!companyResp.data,
      hasError: !!companyResp.error,
      errorCode: companyResp.error?.code,
      errorMessage: companyResp.error?.message,
      errorHint: companyResp.error?.hint,
      errorDetails: companyResp.error?.details,
      status: companyResp.status,
    });
  }

  if (companyResp.error) {
    return { ok: false, error: classifySupabaseError(companyResp.error, 'company') };
  }
  if (!companyResp.data) {
    return {
      ok: false,
      error: {
        kind: 'company_not_found',
        message: `No row in 'companies' visible for id=${profile.company_id}`,
        details: {
          hint: 'Profile.company_id refers to a row that does not exist or is hidden by RLS.',
        },
      },
    };
  }

  return { ok: true, profile, company: companyResp.data as Company };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifySupabaseError(
  error: PostgrestError,
  source: 'profile' | 'company',
): ProfileFetchError {
  const code = error.code ?? '';
  const lowerMsg = (error.message ?? '').toLowerCase();
  const lowerHint = (error.hint ?? '').toLowerCase();
  const lowerDetails = (error.details ?? '').toLowerCase();
  const combined = `${lowerMsg} ${lowerHint} ${lowerDetails}`;

  // PostgREST returns PGRST301 / Postgres 42501 when SELECT is denied at the
  // table level (no GRANT) — distinct from RLS-row filtering which returns
  // empty rows without an error.
  if (
    code === '42501' ||
    code === 'PGRST301' ||
    combined.includes('permission denied') ||
    combined.includes('not authorized') ||
    combined.includes('rls')
  ) {
    return {
      kind: 'rls_or_permission_error',
      message: error.message,
      details: { code, hint: error.hint, raw: { source, error } },
    };
  }

  // Postgres 42703 = undefined_column, 42P01 = undefined_table, PGRST204 =
  // column not in PostgREST schema cache. These indicate the client and the
  // DB disagree about the schema.
  if (code === '42703' || code === '42P01' || code === 'PGRST204') {
    return {
      kind: 'schema_error',
      message: error.message,
      details: { code, hint: error.hint, raw: { source, error } },
    };
  }

  // RN/fetch network failures surface here with messages like "Network request
  // failed", "Failed to fetch" or (Safari) "Load failed".
  if (isNetwerkfout(combined) || combined.includes('network')) {
    return {
      kind: 'network_error',
      message: error.message,
      details: { code, hint: error.hint, raw: { source, error } },
    };
  }

  return {
    kind: 'unknown_error',
    message: error.message,
    details: { code, hint: error.hint, raw: { source, error } },
  };
}

// ---------------------------------------------------------------------------
// Eigen profiel bijwerken
// ---------------------------------------------------------------------------
//
// De UPDATE-policy op `profiles` is `id = auth.uid()`: je kunt uitsluitend je
// eigen rij aanpassen. Dat is precies genoeg voor "mijn profiel", en meteen de
// reden dat een beheerder de rol van een collega hier niet kan wijzigen — die
// policy laat dat niet toe, in de app niet en op het dashboard niet.

export async function updateEigenProfiel(input: {
  full_name?: string;
}): Promise<WriteResult<{ id: string; full_name: string | null }>> {
  const userId = getUserId();
  if (!userId) return writeFout('geen-rechten', 'Je bent niet ingelogd.');

  const updates: Record<string, unknown> = {};
  if (input.full_name !== undefined) {
    const naam = input.full_name.trim();
    if (!naam) return writeFout('validatie', 'Vul je naam in.');
    updates.full_name = naam;
  }
  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

  return schrijf<{ id: string; full_name: string | null }>(
    () => supabase.from('profiles').update(updates).eq('id', userId).select('id, full_name'),
    { context: 'profileService.updateEigenProfiel', bedrijfReadonly: isReadonly() },
  );
}

/**
 * Wachtwoord wijzigen via Supabase Auth. Er komt geen mail aan te pas: de
 * gebruiker is al ingelogd, dus dit is een directe wijziging op zijn eigen
 * account.
 */
export async function wijzigWachtwoord(nieuw: string): Promise<WriteStatus> {
  if (nieuw.length < 8) {
    return writeFout('validatie', 'Kies een wachtwoord van minstens 8 tekens.');
  }
  const { error } = await supabase.auth.updateUser({ password: nieuw });
  if (error) {
    return writeFout('onbekend', translateAuthError(error.message));
  }
  return { ok: true, data: null };
}

/**
 * Wachtwoord wijzigen zoals `changePassword` in het dashboard: eerst het
 * huidige wachtwoord controleren, dan het nieuwe zetten. De controle is een
 * aanmelding met je eigen e-mailadres; de sessie blijft dezelfde gebruiker.
 */
export async function wijzigWachtwoordMetHuidig(
  huidig: string,
  nieuw: string,
): Promise<WriteStatus> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const email = session?.user?.email;
  if (!email) return writeFout('geen-rechten', 'Geen actieve sessie gevonden — log opnieuw in.');
  const { error: aanmeldFout } = await supabase.auth.signInWithPassword({ email, password: huidig });
  if (aanmeldFout) return writeFout('validatie', 'Huidig wachtwoord is onjuist');
  const { error } = await supabase.auth.updateUser({ password: nieuw });
  if (error) return writeFout('onbekend', translateAuthError(error.message));
  return { ok: true, data: null };
}

/**
 * Eigen profielfoto: bucket `avatars`, pad `{companyId}/{profileId}/avatar-{ts}.{ext}`
 * (zelfde conventie als `avatarService.js`), daarna `profiles.avatar_url`.
 * Max 5 MB, JPG/PNG/WebP. De vorige foto wordt best-effort opgeruimd.
 */
export async function uploadEigenAvatar(input: {
  companyId: string;
  bytes: ArrayBuffer;
  contentType: string;
  extensie: string;
  vorigeUrl: string | null;
}): Promise<WriteStatus> {
  const userId = getUserId();
  if (!userId) return writeFout('geen-rechten', 'Je bent niet ingelogd.');
  if (input.bytes.byteLength > 5 * 1024 * 1024) {
    return writeFout('validatie', 'Maximaal 5 MB per foto');
  }
  const pad = `${input.companyId}/${userId}/avatar-${Date.now()}.${input.extensie}`;
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(pad, input.bytes, { contentType: input.contentType, upsert: false, cacheControl: '3600' });
  if (upErr) return writeFout('onbekend', 'De foto kon niet worden geüpload.', upErr.message);
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(pad);
  const res = await schrijf<{ id: string }>(
    () => supabase.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', userId).select('id'),
    { context: 'profileService.uploadEigenAvatar', bedrijfReadonly: isReadonly() },
  );
  if (!res.ok) return res;
  await ruimAvatarOp(input.vorigeUrl);
  return { ok: true, data: null };
}

export async function verwijderEigenAvatar(vorigeUrl: string | null): Promise<WriteStatus> {
  const userId = getUserId();
  if (!userId) return writeFout('geen-rechten', 'Je bent niet ingelogd.');
  const res = await schrijf<{ id: string }>(
    () => supabase.from('profiles').update({ avatar_url: null }).eq('id', userId).select('id'),
    { context: 'profileService.verwijderEigenAvatar', bedrijfReadonly: isReadonly() },
  );
  if (!res.ok) return res;
  await ruimAvatarOp(vorigeUrl);
  return { ok: true, data: null };
}

async function ruimAvatarOp(url: string | null): Promise<void> {
  if (!url) return;
  const m = /\/storage\/v1\/object\/public\/avatars\/(.+)$/.exec(url.split('?')[0] ?? '');
  const pad = m?.[1] ? decodeURIComponent(m[1]) : null;
  if (!pad) return;
  try {
    await supabase.storage.from('avatars').remove([pad]);
  } catch {
    /* best-effort */
  }
}

/**
 * Eigen account deactiveren (RPC `delete_own_account`), zoals de Gevarenzone
 * van het dashboard voor iemand die niet de eigenaar is. Het bedrijf sluiten
 * (eigenaar) zegt ook het abonnement op en loopt daarom via het dashboard.
 */
export async function deactiveerEigenAccount(): Promise<WriteStatus> {
  const { error } = await supabase.rpc('delete_own_account');
  if (error) return writeFout('onbekend', error.message || 'Deactiveren mislukt');
  return { ok: true, data: null };
}
