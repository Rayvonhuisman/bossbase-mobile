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

// ── @-vermeldingen ─────────────────────────────────────────────────────────

export type Vermelding = { id: string; naam: string };

/**
 * Wordt er net iemand getagd? De tekst ná de laatste '@' aan het eind van de
 * invoer — zoals `detectMention` van het dashboard, maar op het einde van de
 * tekst (een tekstveld in de app geeft de cursor niet betrouwbaar door). Null
 * als er geen open vermelding is, of als die al een gekozen naam is.
 */
export function actieveVermelding(tekst: string, gekozen: readonly Vermelding[] = []): string | null {
  const at = tekst.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(tekst[at - 1] ?? '')) return null; // e-mailadres, geen tag
  const na = tekst.slice(at + 1);
  if (na.includes('\n') || na.length > 40) return null;
  if (gekozen.some((v) => na.startsWith(v.naam))) return null;
  return na;
}

/** De teamleden die bij het begin van de vermelding passen (hoogstens `max`). */
export function vermeldingKeuzes<L extends { id: string; full_name: string | null }>(
  leden: readonly L[],
  zoek: string,
  max = 6,
): L[] {
  const q = zoek.trim().toLowerCase();
  return leden
    .filter((l) => l.full_name && (!q || l.full_name.toLowerCase().includes(q)))
    .slice(0, max);
}

/** Vervangt de open '@zoek' aan het eind door '@Naam '. */
export function voegVermeldingIn(tekst: string, naam: string): string {
  const at = tekst.lastIndexOf('@');
  if (at === -1) return `${tekst}@${naam} `;
  return `${tekst.slice(0, at)}@${naam} `;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Wat er wordt opgeslagen. Zonder vermelding de platte tekst (zoals de app tot
 * nu toe deed); mét vermelding HTML in het formaat van het dashboard
 * (`noteFormat.js` `markupToHtml`): `<span class="bb-mention" data-id data-name>`
 * per naam en `<br>` per regel. Alleen namen die nog in de tekst staan tellen.
 */
export function notitieMetVermeldingen(
  tekst: string,
  gekozen: readonly Vermelding[],
): { opslag: string; vermeld: Vermelding[] } {
  const schoon = tekst.trim();
  const uniek = [...new Map(gekozen.map((v) => [v.id, v])).values()];
  const vermeld = uniek.filter((v) => v.naam && schoon.includes(`@${v.naam}`));
  if (!vermeld.length) return { opslag: schoon, vermeld: [] };

  // Langste naam eerst, en via plaatshouders: anders vervangt "@Jan" ook een
  // stuk van "@Jan Jansen", of iets binnen een span die er al staat.
  const opVolgorde = [...vermeld].sort((a, b) => b.naam.length - a.naam.length);
  let s = schoon;
  opVolgorde.forEach((v, i) => {
    s = s.split(`@${v.naam}`).join(`\u0000${i}\u0000`);
  });
  s = esc(s).replace(/\n/g, '<br>');
  opVolgorde.forEach((v, i) => {
    const span = `<span class="bb-mention" data-id="${esc(v.id)}" data-name="${esc(v.naam)}" contenteditable="false">@${esc(v.naam)}</span>`;
    s = s.split(`\u0000${i}\u0000`).join(span);
  });
  return { opslag: s, vermeld };
}

/**
 * `createMentionNotifications`: één melding per getagde collega, ook als je
 * jezelf tagt (het dashboard slaat zichzelf bewust níet over), met mail.
 */
export function vermeldingMeldingen(opts: {
  vermeld: readonly Vermelding[];
  tekst: string;
  maker: string | null | undefined;
  context: string | null | undefined;
  link: string;
  relatedType: string;
  relatedId: string;
}): NotificatieRij[] {
  const plat = opts.tekst.replace(/\s+/g, ' ').trim().slice(0, 120);
  const link = diepeLinkVoor(opts.link, opts.relatedType, opts.relatedId);
  return opts.vermeld.map((v) => ({
    user_id: v.id,
    type: 'mention',
    title: `${opts.maker || 'Iemand'} heeft je getagd${opts.context ? ` bij ${opts.context}` : ''}`,
    body: plat || null,
    link,
    related_type: opts.relatedType,
    related_id: opts.relatedId,
    email: true,
  }));
}
