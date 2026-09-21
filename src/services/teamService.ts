import { supabase } from '@/lib/supabase';
import { getCompanyId, getUserId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';

/**
 * Team — dezelfde twee bronnen als `teamService.js` in het dashboard.
 *
 * Echte teamleden leven in `profiles`; `company_members` bevat bij de meeste
 * bedrijven alleen nog openstaande uitnodigingen. Dat verschil is niet
 * cosmetisch: de SELECT-policy op `company_members` laat alleen je eigen rij of
 * die van een admin door, terwijl `profiles` bedrijfsbreed leesbaar is. Een
 * medewerker die de teamlijst opent ziet dus zijn collega's via `profiles` en
 * geen openstaande uitnodigingen — precies zoals op het dashboard.
 *
 * Beheer (uitnodigen, (de)activeren, verwijderen) is admin-only via RLS, en
 * (de)activeren/verwijderen loopt via de edge function `delete-team-member`,
 * omdat daar óók het auth-account bij hoort. Alleen de `company_members`-rij
 * aanpassen zou een gedeactiveerd teamlid met zijn bestaande sessie gewoon
 * laten doorwerken. Géén service-role in de app: de edge function doet dat
 * server-side, met de JWT van de aanroeper als bewijs.
 */

export type TeamMemberRow = {
  /** profiles.id voor een echt teamlid, company_members.id voor een uitnodiging. */
  id: string;
  company_id: string | null;
  profile_id: string | null;
  email: string;
  full_name: string;
  phone: string;
  avatar_url: string;
  role: string;
  /** actief | inactief | uitgenodigd */
  status: string;
  hours_per_week: number;
  created_at: string | null;
  invite_email_failed_at: string | null;
  /** Openstaande uitnodiging (nog niet geaccepteerd)? */
  isUitnodiging: boolean;
};

const PROFILE_COLUMNS = 'id, company_id, full_name, role, actief, avatar_url, created_at';
const MEMBER_COLUMNS = `
  id, company_id, profile_id, email, full_name, phone, avatar_url,
  role, status, hours_per_week, created_at, invite_email_failed_at
`;

type ProfileDb = {
  id: string;
  company_id: string | null;
  full_name: string | null;
  role: string | null;
  actief: boolean | null;
  avatar_url: string | null;
  created_at: string | null;
};

type MemberDb = {
  id: string;
  company_id: string;
  profile_id: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  status: string | null;
  hours_per_week: number | null;
  created_at: string | null;
  invite_email_failed_at: string | null;
};

const profileToMember = (p: ProfileDb): TeamMemberRow => ({
  id: p.id,
  company_id: p.company_id,
  profile_id: p.id,
  // E-mail en uren staan niet op profiles en zijn client-side niet uit
  // auth.users te lezen — het dashboard laat ze om dezelfde reden leeg.
  email: '',
  full_name: p.full_name ?? '',
  phone: '',
  avatar_url: p.avatar_url ?? '',
  role: p.role ?? 'medewerker',
  status: p.actief === false ? 'inactief' : 'actief',
  hours_per_week: 0,
  created_at: p.created_at,
  invite_email_failed_at: null,
  isUitnodiging: false,
});

const inviteToMember = (r: MemberDb): TeamMemberRow => ({
  id: r.id,
  company_id: r.company_id,
  profile_id: r.profile_id,
  email: r.email ?? '',
  full_name: r.full_name ?? '',
  phone: r.phone ?? '',
  avatar_url: r.avatar_url ?? '',
  role: r.role ?? 'medewerker',
  status: r.status ?? 'uitgenodigd',
  hours_per_week: Number(r.hours_per_week ?? 0),
  created_at: r.created_at,
  invite_email_failed_at: r.invite_email_failed_at,
  isUitnodiging: true,
});

/**
 * Alle profielen van het bedrijf — voor toewijzingsvelden (activiteit,
 * werkbon, project). Leest `profiles`, want dat is bedrijfsbreed leesbaar;
 * `company_members` zou voor een medewerker leeg terugkomen.
 */
export async function listCompanyProfiles(): Promise<{
  data: { id: string; full_name: string; role: string; actief: boolean }[];
  error: string | null;
}> {
  const companyId = getCompanyId();
  if (!companyId) return { data: [], error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('company_id', companyId)
    .order('full_name', { ascending: true, nullsFirst: false });

  if (error) {
    console.warn('[teamService.listCompanyProfiles]', error.message);
    return { data: [], error: 'Collega’s konden niet worden geladen.' };
  }
  return {
    data: ((data as ProfileDb[]) ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name ?? 'Naamloos',
      role: p.role ?? 'medewerker',
      actief: p.actief !== false,
    })),
    error: null,
  };
}

export async function listTeamMembers(): Promise<{
  data: TeamMemberRow[];
  error: string | null;
}> {
  const companyId = getCompanyId();
  if (!companyId) return { data: [], error: null };

  const [profRes, inviteRes] = await Promise.all([
    supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: true }),
    // Alleen openstaande uitnodigingen: geaccepteerde leden komen via profiles
    // binnen en zouden anders dubbel in de lijst staan.
    supabase
      .from('company_members')
      .select(MEMBER_COLUMNS)
      .eq('company_id', companyId)
      .is('profile_id', null)
      .order('created_at', { ascending: true }),
  ]);

  if (profRes.error) {
    console.warn('[teamService.listTeamMembers] profiles', profRes.error.message);
    return { data: [], error: 'Teamleden konden niet worden geladen.' };
  }

  const leden = ((profRes.data as ProfileDb[]) ?? []).map(profileToMember);

  // Geen admin? Dan geeft de policy op company_members niets terug. Dat is geen
  // fout maar het verwachte antwoord: uitnodigingen zijn beheerderswerk.
  const uitnodigingen = inviteRes.error
    ? []
    : ((inviteRes.data as MemberDb[]) ?? []).map(inviteToMember);

  return { data: [...leden, ...uitnodigingen], error: null };
}

// ── Uitnodigen ─────────────────────────────────────────────────────────────

export type InviteInput = {
  email: string;
  full_name?: string | null;
  phone?: string | null;
  role: string;
  hours_per_week?: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Nodigt een teamlid uit. Zelfde rij, zelfde token en dezelfde geldigheidsduur
 * van 48 uur als het dashboard, en dezelfde uitnodigingslink op bossbase.nl.
 *
 * De uitnodigingsmail gaat via de edge function `send-email`. Mislukt die, dan
 * leggen we dat vast op de rij (`invite_email_failed_at`) net als het dashboard
 * en melden we het eerlijk: de uitnodiging staat er, de mail is niet weg.
 */
export async function inviteTeamMember(
  input: InviteInput,
): Promise<WriteResult<TeamMemberRow & { mailVerstuurd: boolean; mailFout: string | null }>> {
  const email = input.email.trim().toLowerCase();
  if (!email) return writeFout('validatie', 'Vul een e-mailadres in.');
  if (!EMAIL_RE.test(email)) return writeFout('validatie', 'Dit e-mailadres klopt niet.');
  if (!input.role) return writeFout('validatie', 'Kies een rol.');

  const companyId = getCompanyId();
  if (!companyId) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  const token = globalThis.crypto?.randomUUID?.();
  if (!token) {
    return writeFout('onbekend', 'Uitnodigen lukt niet op dit toestel. Gebruik het dashboard.');
  }

  const { data: co } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  const bedrijfsnaam = (co as { name?: string } | null)?.name || 'BossBase';

  const payload = withCompanyId({
    email,
    full_name: input.full_name?.trim() || null,
    phone: input.phone?.trim() || null,
    role: input.role,
    status: 'uitgenodigd',
    hours_per_week: Number(input.hours_per_week ?? 0),
    profile_id: null,
    invite_token: token,
    invite_expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    invite_company_name: bedrijfsnaam,
  });
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  }

  const res = await schrijf<MemberDb>(
    () => supabase.from('company_members').insert(payload).select(MEMBER_COLUMNS),
    {
      context: 'teamService.inviteTeamMember',
      bedrijfReadonly: isReadonly(),
      leegMelding:
        'De uitnodiging is niet aangemaakt. Alleen een beheerder kan teamleden uitnodigen, ' +
        'en je abonnement moet ruimte hebben voor een extra gebruiker.',
    },
  );
  if (!res.ok) return res;

  const lid = inviteToMember(res.data);

  // De mail is best-effort: de uitnodiging is al geldig. Mislukt hij, dan
  // vertellen we dat in plaats van "uitgenodigd" te tonen terwijl er niets is
  // verstuurd.
  const inviteUrl = `https://www.bossbase.nl/uitnodiging/${token}`;
  let mailFout: string | null = null;
  try {
    const { error } = await supabase.functions.invoke('send-email', {
      body: {
        to: email,
        subject: `Je bent uitgenodigd voor ${bedrijfsnaam} op BossBase`,
        fromName: 'BossBase',
        html:
          `<p>Hallo ${lid.full_name || email},</p>` +
          `<p>Je bent uitgenodigd om deel uit te maken van <strong>${bedrijfsnaam}</strong> op BossBase.</p>` +
          `<p><a href="${inviteUrl}">Accepteer de uitnodiging</a></p>` +
          `<p>Deze uitnodiging is 48 uur geldig.</p>`,
      },
    });
    if (error) mailFout = error.message;
  } catch (e) {
    mailFout = e instanceof Error ? e.message : 'onbekende fout';
  }

  if (mailFout) {
    await supabase
      .from('company_members')
      .update({ invite_email_failed_at: new Date().toISOString(), invite_email_error: mailFout })
      .eq('id', lid.id);
  }

  return { ok: true, data: { ...lid, mailVerstuurd: !mailFout, mailFout } };
}

/** Een openstaande uitnodiging bijwerken (naam, rol, uren, telefoon). */
export async function updateInvite(
  id: string,
  input: Partial<Omit<InviteInput, 'email'>>,
): Promise<WriteResult<TeamMemberRow>> {
  const updates: Record<string, unknown> = {};
  if (input.full_name !== undefined) updates.full_name = input.full_name?.trim() || null;
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
  if (input.role !== undefined) updates.role = input.role;
  if (input.hours_per_week !== undefined) updates.hours_per_week = Number(input.hours_per_week);
  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

  const res = await schrijf<MemberDb>(
    () => supabase.from('company_members').update(updates).eq('id', id).select(MEMBER_COLUMNS),
    { context: 'teamService.updateInvite', bedrijfReadonly: isReadonly() },
  );
  return res.ok ? { ok: true, data: inviteToMember(res.data) } : res;
}

/** Een openstaande uitnodiging intrekken. */
export async function deleteInvite(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('company_members').delete().eq('id', id).select('id'),
    {
      context: 'teamService.deleteInvite',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'niet-gevonden',
      leegMelding: 'Deze uitnodiging bestaat niet meer, of je bent geen beheerder.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ── (De)activeren en verwijderen ───────────────────────────────────────────

type TeamActie = 'activate' | 'deactivate' | 'delete';

/**
 * Roept de edge function aan die óók het auth-account raakt.
 *
 * De laatste-beheerder- en jezelf-check zit hier bewust vóór de aanroep: het
 * dashboard verbergt die knoppen op je eigen rij, en die bescherming hoort in
 * de app net zo hard te zijn. De functie zelf is de uiteindelijke autoriteit;
 * dit voorkomt alleen dat iemand zichzelf per ongeluk buitensluit.
 */
async function teamActie(memberId: string, actie: TeamActie): Promise<WriteStatus> {
  const eigen = getUserId();
  if (eigen && memberId === eigen) {
    return writeFout(
      'validatie',
      actie === 'delete'
        ? 'Je kunt je eigen account niet verwijderen.'
        : 'Je kunt jezelf niet deactiveren.',
    );
  }

  try {
    const { data, error } = await supabase.functions.invoke('delete-team-member', {
      body: { memberId, action: actie },
    });
    if (error) {
      let melding = error.message;
      try {
        const body = await (error as { context?: { json?: () => Promise<{ error?: string }> } })
          .context?.json?.();
        if (body?.error) melding = body.error;
      } catch {
        /* de rauwe melding is dan het beste wat we hebben */
      }
      return writeFout('onbekend', melding);
    }
    const res = data as { success?: boolean; error?: string } | null;
    if (!res?.success) {
      return writeFout('onbekend', res?.error || 'De actie is niet uitgevoerd.');
    }
    return { ok: true, data: null };
  } catch (e) {
    return writeFout('netwerk', e instanceof Error ? e.message : undefined);
  }
}

export const activateTeamMember = (id: string) => teamActie(id, 'activate');
export const deactivateTeamMember = (id: string) => teamActie(id, 'deactivate');
export const deleteTeamMember = (id: string) => teamActie(id, 'delete');

// ── Rechten per teamlid ────────────────────────────────────────────────────

export async function getUserPermissions(
  userId: string,
): Promise<{ data: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_permissions')
    .select('permission')
    .eq('user_id', userId)
    .eq('granted', true);
  if (error) {
    console.warn('[teamService.getUserPermissions]', error.message);
    return { data: [], error: 'Rechten konden niet worden geladen.' };
  }
  return { data: ((data as { permission: string }[]) ?? []).map((r) => r.permission), error: null };
}

/**
 * Vervangt alle rechten van een teamlid — zelfde aanpak als
 * `setUserPermissions` in het dashboard: eerst alles weg, dan opnieuw zetten.
 *
 * De delete is de kritieke stap: die mag niet stil mislukken, want dan zou het
 * intrekken van een recht als "opgeslagen" op het scherm komen terwijl het
 * recht gewoon blijft staan. Daarom lezen we de rijen terug in plaats van
 * alleen op `error` te vertrouwen.
 */
export async function setUserPermissions(
  userId: string,
  granted: readonly string[],
): Promise<WriteStatus> {
  const companyId = getCompanyId();
  if (!companyId) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  if (!userId) return writeFout('validatie', 'Dit teamlid heeft de uitnodiging nog niet geaccepteerd.');

  const huidig = await getUserPermissions(userId);
  const teVerwijderen = huidig.data.filter((p) => !granted.includes(p));
  const toeTeVoegen = granted.filter((p) => !huidig.data.includes(p));

  if (teVerwijderen.length === 0 && toeTeVoegen.length === 0) {
    return { ok: true, data: null };
  }

  if (teVerwijderen.length > 0) {
    const res = await schrijf<{ id: string }>(
      () =>
        supabase
          .from('user_permissions')
          .delete()
          .eq('user_id', userId)
          .in('permission', teVerwijderen)
          .select('id'),
      {
        context: 'teamService.setUserPermissions.delete',
        bedrijfReadonly: isReadonly(),
        leegMelding:
          'De rechten zijn niet aangepast. Rechten beheren is beheerderswerk en vraagt de ' +
          'feature Rollen & rechten in je abonnement.',
      },
    );
    if (!res.ok) return res;
  }

  if (toeTeVoegen.length > 0) {
    const rijen = toeTeVoegen.map((permission) => ({
      user_id: userId,
      company_id: companyId,
      permission,
      granted: true,
    }));
    const res = await schrijf<{ id: string }>(
      () => supabase.from('user_permissions').insert(rijen).select('id'),
      {
        context: 'teamService.setUserPermissions.insert',
        bedrijfReadonly: isReadonly(),
        leegMelding:
          'De rechten zijn niet aangepast. Rechten beheren is beheerderswerk en vraagt de ' +
          'feature Rollen & rechten in je abonnement.',
      },
    );
    if (!res.ok) return res;
  }

  return { ok: true, data: null };
}

/** Hoeveel actieve beheerders heeft dit bedrijf? Voor de laatste-admin-check. */
export async function telActieveAdmins(): Promise<number> {
  const companyId = getCompanyId();
  if (!companyId) return 0;
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('role', 'admin')
    .neq('actief', false);
  if (error) return 0;
  return count ?? 0;
}
