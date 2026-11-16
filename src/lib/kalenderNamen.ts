import { locale } from '@/i18n';

/**
 * Namen van maanden en weekdagen in de taal van de app.
 *
 * In het Nederlands precies de vaste lijsten die de schermen altijd al
 * gebruikten (ook "mrt", gelijk aan het dashboard); in een andere taal komen
 * ze uit Intl met locale(). Kleine letters zoals Intl ze geeft; wie een
 * hoofdletter wil, zet die er zelf op.
 */

const NL_MAAND_LANG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const NL_MAAND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const NL_DAG_LANG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const NL_DAG_KORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

type Lengte = 'lang' | 'kort';

const cache = new Map<string, string[]>();

function lijst(soort: 'maand' | 'dag', lengte: Lengte): string[] {
  const loc = locale();
  if (loc === 'nl-NL') {
    if (soort === 'maand') return lengte === 'lang' ? NL_MAAND_LANG : NL_MAAND_KORT;
    return lengte === 'lang' ? NL_DAG_LANG : NL_DAG_KORT;
  }
  const sleutel = `${loc}|${soort}|${lengte}`;
  const bekend = cache.get(sleutel);
  if (bekend) return bekend;
  const stijl = lengte === 'lang' ? 'long' : 'short';
  const namen =
    soort === 'maand'
      ? Array.from({ length: 12 }, (_, i) =>
          new Intl.DateTimeFormat(loc, { month: stijl, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, i, 15))),
        )
      : // 4 januari 2026 is een zondag: index 0 = zondag, zoals Date.getDay().
        Array.from({ length: 7 }, (_, i) =>
          new Intl.DateTimeFormat(loc, { weekday: stijl, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + i))),
        );
  cache.set(sleutel, namen);
  return namen;
}

/** Maandnaam; `maand` is 0 (januari) t/m 11. */
export function maandNaam(maand: number, lengte: Lengte = 'lang'): string {
  return lijst('maand', lengte)[maand] ?? '';
}

/** Naam van de weekdag; `dag` zoals Date.getDay(): 0 = zondag. */
export function dagNaam(dag: number, lengte: Lengte = 'lang'): string {
  return lijst('dag', lengte)[dag] ?? '';
}

/** Eerste letter een hoofdletter. */
export const hoofdletter = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
