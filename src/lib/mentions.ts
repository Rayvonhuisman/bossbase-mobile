/**
 * @-vermeldingen in notities, zoals het dashboard ze opslaat en leest
 * (NoteEditor.jsx en notificatieService.js).
 *
 * Opslag: `<span class="bb-mention" data-id="<profiel>" data-name="<naam>"
 * contenteditable="false">@Naam</span>` in de HTML van de notitie. Oudere
 * notities hebben `@[Naam](id)`. Beide worden herkend.
 *
 * Bewust zonder imports, zodat de tests dit rechtstreeks in Node draaien.
 */

export type Vermelding = { name: string; userId: string };

const escAttr = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** De span die NoteEditor.insertMention() maakt. */
export function mentionSpan(id: string, naam: string): string {
  return `<span class="bb-mention" data-id="${escAttr(id)}" data-name="${escAttr(naam)}" contenteditable="false">@${escAttr(naam)}</span>`;
}

/** extractMentions(): beide notaties, ontdubbeld op gebruiker. */
export function extractMentions(text: string | null | undefined): Vermelding[] {
  if (!text) return [];
  const results: Vermelding[] = [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) results.push({ name: m[1]!, userId: m[2]! });
  const reSpan = /<span\b[^>]*\bclass="[^"]*\bbb-mention\b[^"]*"[^>]*>/gi;
  let s: RegExpExecArray | null;
  while ((s = reSpan.exec(text)) !== null) {
    const tag = s[0];
    const id = (tag.match(/\bdata-id="([^"]*)"/) || [])[1];
    const name = (tag.match(/\bdata-name="([^"]*)"/) || [])[1];
    if (id) results.push({ name: name || '', userId: id });
  }
  const seen = new Set<string>();
  return results.filter((r) => r.userId && !seen.has(r.userId) && (seen.add(r.userId), true));
}

/** stripMentions(): leesbare platte tekst voor de meldingstekst. */
export function stripMentions(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Platte tekst uit het invoerveld van de app → HTML voor de database, met de
 * gekozen collega's als mention-span. Een `@Naam` in de tekst wordt alleen een
 * vermelding als die naam uit de keuzelijst is gekozen (zoals in het
 * dashboard, waar je een naam uit de lijst aantikt); de rest blijft tekst.
 *
 * Escapet als `alsHtml` (lib/notitieTekst) en zet regeleinden om in `<br>`.
 */
export function tekstMetVermeldingen(tekst: string, gekozen: { id: string; naam: string }[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const schoon = tekst.trim();
  // Langste naam eerst, zodat "Jan de Vries" niet als "Jan" wordt herkend.
  const namen = [...new Map(gekozen.map((g) => [g.naam, g])).values()].sort((a, b) => b.naam.length - a.naam.length);
  let uit = '';
  let i = 0;
  while (i < schoon.length) {
    if (schoon[i] === '@') {
      const hit = namen.find((n) => schoon.startsWith(`@${n.naam}`, i));
      if (hit) {
        uit += mentionSpan(hit.id, hit.naam);
        i += hit.naam.length + 1;
        continue;
      }
    }
    uit += esc(schoon[i]!);
    i += 1;
  }
  return uit.replace(/\n/g, '<br>');
}

/** Het woord na de laatste `@` vóór de cursor, of null (detectMention). */
export function mentionZoekterm(tekst: string, cursor: number): { start: number; term: string } | null {
  const voor = tekst.slice(0, cursor);
  const at = voor.lastIndexOf('@');
  if (at === -1) return null;
  // Alleen aan het begin of na witruimte, en niet over een regeleinde heen.
  if (at > 0 && !/\s/.test(voor[at - 1]!)) return null;
  const term = voor.slice(at + 1);
  if (term.includes('\n') || term.length > 40) return null;
  return { start: at, term };
}

const DETAILPAGINA: Record<string, string> = {
  klant: 'klant',
  leverancier: 'leverancier',
  werkbon: 'werkbonnen',
  activiteit: 'activities',
  project: 'projecten',
  offerte: 'offertes',
  factuur: 'facturen',
};

/**
 * De meldingen voor createMentionNotifications(): één per getagde collega,
 * ook als je jezelf tagt. De mail bouwt de Edge Function `create-notification`
 * zelf uit titel, tekst en link (een meegestuurde HTML negeert hij); `email:
 * true` vraagt erom, net als het `{ subject, html }`-object van het dashboard.
 */
export function mentionMeldingen(opts: {
  text: string;
  relatedType: string;
  relatedId: string;
  link: string;
  creatorName: string | null | undefined;
  contextName: string | null | undefined;
}): {
  user_id: string;
  type: 'mention';
  title: string;
  body: string | null;
  link: string | null;
  related_type: string | null;
  related_id: string | null;
  email: true;
}[] {
  const mentions = extractMentions(opts.text);
  if (!mentions.length) return [];
  const plain = stripMentions(opts.text).slice(0, 120);
  const pagina = DETAILPAGINA[opts.relatedType];
  const diepeLink = opts.relatedId && pagina ? `${pagina}/${opts.relatedId}` : opts.link;
  return mentions.map(({ userId }) => ({
    user_id: userId,
    type: 'mention' as const,
    title: `${opts.creatorName || 'Iemand'} heeft je getagd${opts.contextName ? ` bij ${opts.contextName}` : ''}`,
    body: plain || null,
    link: diepeLink || null,
    related_type: opts.relatedType || null,
    related_id: opts.relatedId || null,
    email: true as const,
  }));
}
