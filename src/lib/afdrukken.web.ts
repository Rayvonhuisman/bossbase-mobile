/**
 * Web/PWA: het document in een nieuw venster openen en het printvenster tonen,
 * zodat de gebruiker het kan bekijken, afdrukken of als PDF bewaren.
 *
 * Moet synchroon vanuit de klik worden aangeroepen, anders houdt de
 * pop-upblokkering van Safari het venster tegen. Lukt een nieuw venster niet
 * (blokkering, standalone-PWA), dan drukken we af via een verborgen iframe.
 */
export function kanAfdrukken(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function drukHtmlAf(html: string): boolean {
  if (!kanAfdrukken()) return false;
  try {
    const venster = window.open('', '_blank');
    if (venster) {
      venster.document.open();
      venster.document.write(html);
      venster.document.close();
      venster.focus();
      // Even wachten tot het logo geladen is; anders ontbreekt het op papier.
      setTimeout(() => {
        try {
          venster.print();
        } catch {
          /* bekijken kan nog steeds */
        }
      }, 400);
      return true;
    }
  } catch {
    /* val terug op het iframe */
  }
  try {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.srcdoc = html;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        setTimeout(() => frame.remove(), 60000);
      }
    };
    document.body.appendChild(frame);
    return true;
  } catch {
    return false;
  }
}
