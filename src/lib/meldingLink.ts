/**
 * Een link uit een melding (`notifications.link`) → het scherm in de app.
 *
 * Het dashboard bouwt de link uit het SOORT item (`notificatieService.js`,
 * `diepeLinkVoor`): `werkbonnen/<id>`, `activities/<id>`, `projecten/<id>`,
 * `offertes/<id>`, `facturen/<id>`, en sinds 4-10-2026 ook `klant/<id>` en
 * `leverancier/<id>` (die openen in het dashboard een kaart over de lijst).
 * Daarnaast losse pagina's: `planning`, `deal/<id>`, `customers`, `uren` …
 * Onbekend → null (de melding is dan alleen tekst).
 *
 * Geen runtime-imports: draait ook rechtstreeks in de Node-tests.
 */
export function routeVoorLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const [pagina, ruwId] = link.replace(/^\/+/, '').split(/[/?]/);
  const id = ruwId ? encodeURIComponent(decodeURIComponentVeilig(ruwId)) : '';
  switch (pagina) {
    case 'werkbonnen':
      return id ? `/work-orders/${id}` : '/work-orders';
    case 'activities':
      return id ? `/activities?id=${id}` : '/activities';
    case 'projecten':
      return id ? `/project/${id}` : '/projects';
    case 'offertes':
      return id ? `/offers?id=${id}` : '/offers';
    case 'facturen':
      return id ? `/invoices?id=${id}` : '/invoices';
    case 'planning':
    case 'calendar':
      return '/planning';
    case 'deal':
      return id ? `/deal/${id}` : '/pipeline';
    case 'pipeline':
    case 'aanvragen':
      return '/pipeline';
    case 'klant':
    case 'customers':
      return id ? `/customers/${id}` : '/customers';
    case 'leverancier':
      return id ? `/customers/leverancier/${id}` : '/customers';
    case 'leveranciers':
      return '/customers';
    case 'uren':
      return '/hours';
    // 'instellingen/profiel': een tabblad (o.a. eigendomsoverdracht en
    // bedrijfsverwijdering, migratie 20261017120000 in het dashboard).
    case 'instellingen':
      return id ? `/settings?tab=${id}` : '/settings';
    default:
      return null;
  }
}

function decodeURIComponentVeilig(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
