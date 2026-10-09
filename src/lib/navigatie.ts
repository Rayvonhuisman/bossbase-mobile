import type { Href } from 'expo-router';

type TerugRouter = { canGoBack(): boolean; back(): void; replace(href: Href): void };

/**
 * Eén stap terug — of, als er geen stap terug is, naar een vaste ouderpagina.
 *
 * In de app is er altijd een vorige pagina: je komt op een werkbon via de
 * lijst. In de browser niet altijd. Wie een link naar een werkbon opent, of de
 * pagina herlaadt, heeft geen geschiedenis binnen de app; `router.back()` doet
 * dan niets ("GO_BACK was not handled") en de terugknop lijkt kapot, net als de
 * terugsprong na het opslaan van een formulier. Dan gaan we naar de pagina
 * waar dit scherm logisch onder hangt.
 *
 * `replace` en niet `push`: de ouderpagina komt in de plaats van deze, zodat
 * nog eens "terug" niet weer hier uitkomt.
 */
export function terugOfNaar(router: TerugRouter, ouder: Href = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(ouder);
}
