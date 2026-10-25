/**
 * Gedeeld door scripts/mail-overnemen.mjs en tests/mailOpmaak.test.mjs: welke
 * mailbestanden de app uit het dashboard overneemt, en hoe.
 *
 * De mail die de app verstuurt, moet bij de ontvanger precies dezelfde zijn als
 * die uit het dashboard. Daarom geen eigen opmaak, maar een letterlijke kopie
 * van de gedeelde mailcode van het dashboard (supabase/functions/_shared). Die
 * bestanden gebruiken geen Deno- of browser-API's.
 *
 * Eén aanpassing: het dashboard importeert met extensie (`'./mailKleur.ts'`),
 * wat de TypeScript-instellingen van de app niet toestaan. normaliseer() haalt
 * die extensie weg, en de test past hetzelfde toe op de dashboardversie.
 */
import { kopVoor as pdfKop, zonderKop, commitUitKop, dashboardRepo } from './pdf-opbouw-bron.mjs';

export { zonderKop, commitUitKop, dashboardRepo };

export const MAIL_MAP_DASHBOARD = 'supabase/functions/_shared';
export const MAIL_BESTANDEN = ['mailKleur.ts', 'zakelijkeMail.ts', 'bossbaseMail.ts'];

export const normaliseer = (tekst) => tekst.replace(/(from\s+['"]\.\/[A-Za-z0-9_]+)\.ts(['"])/g, '$1$2');

// @ts-nocheck in de kop: de app typecheckt strenger dan het dashboard
// (noUncheckedIndexedAccess), en de kopie zelf mag niet veranderen. De code
// wordt in het dashboard gecontroleerd; de kop telt niet mee in de vergelijking.
export function kopVoor(bronpad, commit) {
  return '// @ts-nocheck\n' + pdfKop(bronpad, commit)
    .replace('node scripts/pdf-opbouw-overnemen.mjs', 'node scripts/mail-overnemen.mjs')
    .replace('tests/pdfOpbouw.test.mjs', 'tests/mailOpmaak.test.mjs');
}
