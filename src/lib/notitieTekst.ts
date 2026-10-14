/**
 * Tekst uit het dashboard leesbaar tonen.
 *
 * Het dashboard bewaart notities en omschrijvingen als HTML uit zijn
 * notitie-editor: `<b>`, `<i>`, `<u>`, `<br>`, `<div>`/`<p>` per regel, lijsten,
 * en @-vermeldingen als `<span class="bb-mention" data-name="…">@Naam</span>`.
 * Oudere notities zijn platte tekst met `@[Naam](id)`. De app toonde die HTML
 * op een aantal plekken letterlijk, als code.
 *
 * Bewust géén HTML renderen: we zetten het om naar platte tekst met de
 * regeleinden, opsommingstekens en @-namen erin. Zo kan er nooit script of
 * opmaak van buiten in de app terechtkomen (geen XSS), en blijft de inhoud
 * hetzelfde als in het dashboard.
 */

const ENTITEITEN: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
};

function decodeer(tekst: string): string {
  return tekst.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (geheel, code: string) => {
    const laag = code.toLowerCase();
    if (laag.startsWith('#x')) {
      const n = parseInt(laag.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : geheel;
    }
    if (laag.startsWith('#')) {
      const n = parseInt(laag.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : geheel;
    }
    return ENTITEITEN[laag] ?? geheel;
  });
}

/** HTML of (legacy) platte tekst uit het dashboard → nette platte tekst. */
export function alsTekst(waarde: string | null | undefined): string {
  if (!waarde) return '';
  let s = String(waarde);
  // Legacy-vermelding `@[Naam](id)` → `@Naam`.
  s = s.replace(/@\[([^\]]+)\]\([^)]*\)/g, '@$1');
  // Geen HTML-tags? Dan is het al platte tekst (alleen entiteiten decoderen).
  if (!/<[a-z!/][^>]*>/i.test(s)) return decodeer(s).trim();
  s = s
    // Scripts en stijlen nooit als tekst laten zien.
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    // Vermelding: de zichtbare tekst is al "@Naam"; zonder tekst de data-name.
    .replace(
      /<span[^>]*class="[^"]*bb-mention[^"]*"[^>]*data-name="([^"]*)"[^>]*>\s*<\/span>/gi,
      '@$1',
    )
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|ul|ol|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeer(s)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Platte tekst uit de app → veilige HTML voor het dashboard (`<br>` per regel). */
export function alsHtml(tekst: string): string {
  return tekst
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
