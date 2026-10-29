// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase supabase/functions/_shared/notitieTekst.js
// Dashboardcommit: 4f36bec
// Bijwerken: node scripts/pdf-opbouw-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie; tests/pdfOpbouw.test.mjs
// vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
// Platte tekst uit notitie-HTML, voor PDF's. Gedeeld tussen de app
// (src/lib/noteFormat.js) en de server (het ondertekende exemplaar), zodat een
// klantnotitie in beide PDF's hetzelfde uitkomt. Geen DOM nodig.

// Detecteert of een string al HTML-opmaak bevat.
export function looksLikeHtml(value) {
  return /<[a-zA-Z]/.test(value);
}

// HTML → tekst voor een PDF of e-mail: leesbaar, zonder tags.
//
// Bewust iets anders dan htmlToPlain hieronder. Die plet álle witruimte tot één
// spatie, want hij bestaat voor leeg-detectie en korte previews. In een PDF is
// de indeling juist de leesbaarheid: alinea's, regeleinden en opsommingen
// moeten blijven staan. Zonder deze functie belandde de opgemaakte HTML
// letterlijk — met tags en al — in de werkbon-PDF.
//
// Een mention wordt de naam zelf: een klant leest "Jan", geen "@Jan" en al
// helemaal geen span met een data-id.
export function htmlToPdfText(value) {
  if (!value) return '';
  let s = String(value);

  // Legacy markup @[Naam](id) → Naam (oude notities zonder HTML).
  s = s.replace(/@\[([^\]]+)\]\([^)]*\)/g, '$1');

  if (!looksLikeHtml(s)) return netteRegels(s);

  // Mention-spans → de naam. data-name is leidend; anders de inhoud zonder @.
  s = s.replace(/<span[^>]*class="[^"]*bb-mention[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    (tag, inhoud) => {
      const naam = /data-name="([^"]*)"/i.exec(tag);
      return naam ? naam[1] : inhoud.replace(/^@/, '');
    });

  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')   // opsomming houdt zijn bolletje
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');           // als laatste, anders ontstaat &lt; opnieuw

  return netteRegels(s);
}

// Regeleinden opschonen zonder de indeling te verliezen: spaties samenvouwen,
// maar \n laten staan en hooguit één lege regel tussen alinea's.
function netteRegels(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
