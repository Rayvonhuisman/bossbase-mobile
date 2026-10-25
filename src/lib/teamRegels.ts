/**
 * Regels van de Team-pagina, letterlijk zoals `TeamPage.jsx` in het dashboard.
 *
 * Puur (geen React, geen Supabase), zodat ze in Node getest kunnen worden. De
 * database en de edge function `delete-team-member` dwingen hetzelfde af; dit
 * is de uitleg vooraf, niet de beveiliging.
 */

import { mailTemplate } from './mail/mailTemplate';
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

/**
 * Rolkeuze bij bewerken: alleen admin en medewerker. De rol 'planner' bestaat
 * niet meer (migratie 20261002135952: `profiles_role_check` en
 * `bb_teamlid_bijwerken` weigeren hem; het dashboard toont hem niet meer).
 * Plannen is het RECHT `planning`.
 */
export function rolOpties(_huidig?: string | null): { id: string; label: string }[] {
  return [
    { id: 'medewerker', label: 'Medewerker' },
    { id: 'admin', label: 'Admin' },
  ];
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
 * De uitnodigingsmail, gelijk aan die van het dashboard
 * (src/services/teamService.js → inviteTeamMember): mailTemplate() met
 * companyName 'BossBase', dus de BossBase-opmaak. Titel, preheader, body,
 * knop en voettekst letterlijk zoals daar. Tot oktober 2026 bouwde de app hier
 * een eigen opmaak; tests/mailOpmaak.test.mjs vergelijkt nu met het dashboard.
 */
// escapeHtml uit src/services/emailService.js van het dashboard: zonder de
// apostrof, zodat de uitnodiging letterlijk dezelfde HTML geeft.
const escapeHtmlDashboard = (s: string | null | undefined): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  const html = mailTemplate({
    title: 'Je bent uitgenodigd!',
    preheader: `${input.uitnodiger} heeft je uitgenodigd voor ${input.bedrijfsnaam} op BossBase`,
    // Namen zijn invoer van gebruikers: escapen vóór ze in de mail-HTML gaan.
    body: `<p>Hallo ${escapeHtmlDashboard(input.ontvanger)},</p>
           <p><strong>${escapeHtmlDashboard(input.uitnodiger)}</strong> heeft je uitgenodigd om deel uit te maken van
           <strong>${escapeHtmlDashboard(input.bedrijfsnaam)}</strong> op BossBase.</p>
           <p>Je krijgt de rol: <strong>${escapeHtmlDashboard(rol)}</strong></p>`,
    buttonText: 'Accepteer uitnodiging',
    buttonUrl: input.inviteUrl,
    footerText: 'Deze uitnodiging is 48 uur geldig. Als je deze uitnodiging niet verwacht hebt, kun je deze mail negeren.',
    companyName: 'BossBase',
  });
  return { onderwerp: `Je bent uitgenodigd voor ${input.bedrijfsnaam} op BossBase`, html };
}
