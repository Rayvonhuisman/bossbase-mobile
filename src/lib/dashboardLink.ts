import { Linking } from 'react-native';
import { Dialog } from './dialog';

/**
 * Verwijzing naar het dashboard voor wat de app bewust niet zelf doet
 * (koppelingen opzetten, abonnement wijzigen, bedrijf sluiten). De paden volgen
 * `src/lib/route.js` van het dashboard: `/<pagina>?tab=…` op dashboard.bossbase.nl
 * (sinds de domeinsplitsing van 26-10-2026 zonder voorvoegsel /dashboard).
 */
export const DASHBOARD_BASIS = 'https://dashboard.bossbase.nl';

export function dashboardUrl(pagina: string, tab?: string): string {
  return `${DASHBOARD_BASIS}/${pagina}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`;
}

export async function openDashboard(pagina: string, tab?: string): Promise<void> {
  const url = dashboardUrl(pagina, tab);
  try {
    await Linking.openURL(url);
  } catch {
    Dialog.alert('Kon niet openen', `Ga in je browser naar ${url.replace('https://', '')}.`);
  }
}
