/**
 * Meldingen aan collega's en @-vermeldingen in notities — de pure helft van
 * `notificatieService.js` en `NoteEditor.jsx`/`noteFormat.js` uit het dashboard.
 *
 * De rijen gaan naar de Edge Function `create-notification` (zie
 * `services/collegaMeldingService.ts`): de RLS op `notifications` staat alleen
 * self-insert toe. Met `email: true` bouwt de functie zelf de mail en zoekt hij
 * het adres op; de inhoud van de client telt daar niet.
 *
 * Geen imports: draait rechtstreeks in de Node-tests.
 */

export type NotificatieRij = {
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  related_type?: string | null;
  related_id?: string | null;
  /** Ook mailen; de Edge Function bouwt de mail en zoekt het adres zelf op. */
  email?: boolean;
};

/** Welke soorten items één item kunnen openen (`DETAILPAGINA` van het dashboard). */
const DETAILPAGINA: Record<string, string> = {
  klant: 'klant',
  leverancier: 'leverancier',
  werkbon: 'werkbonnen',
  activiteit: 'activities',
  project: 'projecten',
  offerte: 'offertes',
  factuur: 'facturen',
};

/** `diepeLinkVoor`: 'projecten' + project-id → 'projecten/<id>'. */
export function diepeLinkVoor(
  link: string | null | undefined,
  relatedType: string | null | undefined,
  relatedId: string | null | undefined,
): string | null {
  if (!relatedId) return link ?? null;
  const pagina = relatedType ? DETAILPAGINA[relatedType] : undefined;
  if (!pagina) return link ?? null;
  return `${pagina}/${relatedId}`;
}

/**
 * `notifyNewAssignees`: alleen wie er nieuw bij komt, jezelf overgeslagen. Het
 * dashboard stuurt standaard ook een mail mee (`sendMail = true`).
 */
export function toewijzingMeldingen(opts: {
  userIds: readonly string[];
  vorigeIds?: readonly string[];
  maker: string | null;
  type: string;
  titel: string;
  body?: string | null;
  link: string;
  relatedType: string | null;
  relatedId: string | null;
  mail?: boolean;
}): NotificatieRij[] {
  const vorig = new Set((opts.vorigeIds ?? []).filter(Boolean));
  const nieuw = [...new Set(opts.userIds.filter(Boolean))].filter((id) => !vorig.has(id) && id !== opts.maker);
  const link = diepeLinkVoor(opts.link, opts.relatedType, opts.relatedId);
  return nieuw.map((uid) => ({
    user_id: uid,
    type: opts.type,
    title: opts.titel,
    body: opts.body || null,
    link,
    related_type: opts.relatedType,
    related_id: opts.relatedId,
    ...(opts.mail === false ? {} : { email: true }),
  }));
}
