/**
 * Regels van de Team-pagina, letterlijk zoals `TeamPage.jsx` in het dashboard.
 *
 * Puur (geen React, geen Supabase), zodat ze in Node getest kunnen worden. De
 * database en de edge function `delete-team-member` dwingen hetzelfde af; dit
 * is de uitleg vooraf, niet de beveiliging.
 */

export type TeamLidBasis = {
  id: string;
  profile_id: string | null;
  role: string;
  /** actief | inactief | uitgenodigd */
  status: string;
  invite_email_failed_at?: string | null;
};

export const EIGENAAR_REDEN =
  'De eigenaar van het account kan alleen door de eigenaar zelf worden aangepast.';
export const LAATSTE_ADMIN_REDEN =
  'Dit is de laatste beheerder van het bedrijf. Wijs eerst een andere beheerder aan.';

export const ROL_LABEL: Record<string, string> = {
  admin: 'Admin',
  planner: 'Planner',
  medewerker: 'Medewerker',
};

export function rolLabel(rol: string | null | undefined): string {
  return ROL_LABEL[rol ?? ''] ?? 'Medewerker';
}

export type StatusWeergave = {
  label: string;
  toon: 'actief' | 'uitgenodigd' | 'mislukt' | 'inactief';
};

/** "Mail mislukt" gaat vóór "Uitgenodigd": dan is er niets aangekomen. */
export function statusWeergave(lid: TeamLidBasis): StatusWeergave {
  if (lid.status === 'actief') return { label: 'Actief', toon: 'actief' };
  if (lid.status === 'uitgenodigd' && lid.invite_email_failed_at) {
    return { label: 'Mail mislukt', toon: 'mislukt' };
  }
  if (lid.status === 'uitgenodigd') return { label: 'Uitgenodigd', toon: 'uitgenodigd' };
  return { label: 'Inactief', toon: 'inactief' };
}

export function teamTellingen(leden: readonly TeamLidBasis[]) {
  return {
    totaal: leden.length,
    actief: leden.filter((m) => m.status === 'actief').length,
    uitgenodigd: leden.filter((m) => m.status === 'uitgenodigd').length,
  };
}

export function isEigenaar(lid: TeamLidBasis, eigenaarId: string | null): boolean {
  return Boolean(eigenaarId) && lid.profile_id === eigenaarId;
}

export function isLaatsteAdmin(lid: TeamLidBasis, leden: readonly TeamLidBasis[]): boolean {
  const actieveAdmins = leden.filter((m) => m.role === 'admin' && m.status === 'actief');
  return lid.role === 'admin' && lid.status === 'actief' && actieveAdmins.length === 1;
}

/** Mag de rol van dit lid worden gewijzigd? (`rolInfo` in het dashboard.) */
export function rolInfo(
  lid: TeamLidBasis,
  leden: readonly TeamLidBasis[],
  eigenaarId: string | null,
  eigenId: string | null,
): { vergrendeld: boolean; reden: string } {
  const ikBenEigenaar = Boolean(eigenaarId) && eigenId === eigenaarId;
  if (isEigenaar(lid, eigenaarId) && !ikBenEigenaar) {
    return { vergrendeld: true, reden: EIGENAAR_REDEN };
  }
  if (isLaatsteAdmin(lid, leden)) return { vergrendeld: true, reden: LAATSTE_ADMIN_REDEN };
  return { vergrendeld: false, reden: '' };
}

/**
 * Wat staat er in de actiekolom? Zelfde volgorde als het dashboard: je eigen
 * rij toont "Jij", de eigenaar "Beschermd", anders (de)activeren/verwijderen —
 * uitgeschakeld voor de laatste actieve beheerder.
 */
export function beheerStand(
  lid: TeamLidBasis,
  leden: readonly TeamLidBasis[],
  eigenaarId: string | null,
  eigenId: string | null,
): { soort: 'jij' | 'beschermd' | 'acties'; geblokkeerd: string | null } {
  if (lid.profile_id && lid.profile_id === eigenId) return { soort: 'jij', geblokkeerd: null };
  if (isEigenaar(lid, eigenaarId)) return { soort: 'beschermd', geblokkeerd: EIGENAAR_REDEN };
  return {
    soort: 'acties',
    geblokkeerd: isLaatsteAdmin(lid, leden) ? LAATSTE_ADMIN_REDEN : null,
  };
}

/** Rolkeuze bij bewerken: planner alleen tonen als het de huidige waarde is. */
export function rolOpties(huidig: string | null | undefined): { id: string; label: string }[] {
  const basis = [
    { id: 'medewerker', label: 'Medewerker' },
    { id: 'admin', label: 'Admin' },
  ];
  return huidig === 'planner' ? [...basis, { id: 'planner', label: 'Planner' }] : basis;
}

/** HTML-escape voor tekst die in de uitnodigingsmail komt. */
export function escHtml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * De uitnodigingsmail, inhoudelijk gelijk aan `mailTemplate()` met
 * companyName 'BossBase' (systeemmail) in het dashboard: titel, wie je
 * uitnodigt, je rol, knop "Accepteer uitnodiging" en "48 uur geldig".
 */
export function uitnodigingsMail(input: {
  inviteUrl: string;
  bedrijfsnaam: string;
  uitnodiger: string;
  ontvanger: string;
  rol: string;
}): { onderwerp: string; html: string } {
  const rollen: Record<string, string> = {
    admin: 'Beheerder',
    medewerker: 'Medewerker',
    manager: 'Manager',
  };
  const rol = rollen[input.rol] ?? input.rol;
  const groen = '#1DDB62';
  const html =
    `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"></head>` +
    `<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">` +
    `<div style="display:none;max-height:0;overflow:hidden;">${escHtml(input.uitnodiger)} heeft je uitgenodigd voor ${escHtml(input.bedrijfsnaam)} op BossBase</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px;">` +
    `<tr><td style="padding-bottom:18px;"><img src="https://www.bossbase.nl/brand/icon-512.png" alt="BossBase" width="32" height="32" style="vertical-align:middle;border-radius:8px;"><span style="vertical-align:middle;margin-left:9px;font-size:20px;font-weight:700;color:#0a0a0a;">BossBase</span></td></tr>` +
    `<tr><td style="font-size:22px;font-weight:700;color:#0a0a0a;padding-bottom:12px;">Je bent uitgenodigd!</td></tr>` +
    `<tr><td style="font-size:15px;line-height:1.6;color:#374151;">` +
    `<p>Hallo ${escHtml(input.ontvanger)},</p>` +
    `<p><strong>${escHtml(input.uitnodiger)}</strong> heeft je uitgenodigd om deel uit te maken van <strong>${escHtml(input.bedrijfsnaam)}</strong> op BossBase.</p>` +
    `<p>Je krijgt de rol: <strong>${escHtml(rol)}</strong></p>` +
    `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:10px 0;"><tr><td style="border-radius:8px;background:${groen};">` +
    `<a href="${escHtml(input.inviteUrl)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#0a0a0a;text-decoration:none;border-radius:8px;">Accepteer uitnodiging</a>` +
    `</td></tr></table>` +
    `</td></tr>` +
    `<tr><td style="font-size:13px;color:#6b7280;padding-top:16px;">Deze uitnodiging is 48 uur geldig. Als je deze uitnodiging niet verwacht hebt, kun je deze mail negeren.</td></tr>` +
    `</table>` +
    `<div style="font-size:12px;color:#9ca3af;padding-top:14px;">BossBase, een handelsnaam van NG E-Commerce B.V. &middot; KvK 91856396 &middot; <a href="https://www.bossbase.nl" style="color:#9ca3af;">bossbase.nl</a></div>` +
    `</td></tr></table></body></html>`;
  return { onderwerp: `Je bent uitgenodigd voor ${input.bedrijfsnaam} op BossBase`, html };
}
