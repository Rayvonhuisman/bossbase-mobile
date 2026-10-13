/**
 * Een HTML-document tonen en afdrukken (offerte/factuur zonder bewaarde PDF).
 *
 * Native heeft de app geen printmodule (en we voegen er geen toe); daar staat
 * de inhoud al in de detailweergave en meldt het scherm dat afdrukken via de
 * webversie gaat. De webversie staat in `afdrukken.web.ts`.
 */
export function kanAfdrukken(): boolean {
  return false;
}

export function drukHtmlAf(_html: string): boolean {
  return false;
}
