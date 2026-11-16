/**
 * Vertalen in de app.
 *
 * De Nederlandse tekst is zelf de sleutel (zoals gettext):
 *
 *   tx('Werkbon opslaan')
 *   tx('{naam} is ingepland', { naam })
 *   txn('{n} werkbon', '{n} werkbonnen', aantal)      // meervoud, {n} = aantal
 *   tx('Open', undefined, 'status')                   // zelfde woord, andere betekenis
 *   const LABELS = { open: txm('Open') }; … tx(LABELS.open)   // vaste lijsten
 *
 * `tx` is een gewone functie (bewust niet `t`: die naam wordt in de app al
 * veel gebruikt voor de themakleuren), geen hook: hij werkt ook in services en lib. Bij
 * een taalwissel hangt TaalProvider de hele boom opnieuw op, zodat alles
 * opnieuw rendert. Tekst die buiten een component op moduleniveau wordt
 * uitgerekend, wisselt dus níet mee: markeer die met txm() en vertaal hem op
 * het moment van tonen met tx(...).
 *
 * De vertalingen staan in src/i18n/talen/<taal>.json; `npm run talen:check`
 * zoekt alle tx/txn/txm-aanroepen en meldt wat ontbreekt.
 */
import { TALEN, type Taal } from './talen';

export { TALEN, isTaal, type Taal } from './talen';

type Meervoud = Partial<Record<Intl.LDMLPluralRule, string>>;
export type Woordenboek = Record<string, string | Meervoud>;

let huidig: Taal = 'nl';
let boek: Woordenboek = {};
let regels = new Intl.PluralRules('nl-NL');

/** Alleen voor TaalProvider. */
export function zetTaalIntern(taal: Taal, woordenboek: Woordenboek) {
  huidig = taal;
  boek = woordenboek;
  regels = new Intl.PluralRules(locale());
}

export const taal = (): Taal => huidig;
/** BCP-47-locale voor Intl (datums, getallen, bedragen). */
export const locale = (): string => TALEN.find(l => l.code === huidig)?.locale ?? 'nl-NL';

const sleutel = (bron: string, context?: string) => (context ? `${context}::${bron}` : bron);

function vul(tekst: string, vars?: Record<string, string | number | null | undefined>) {
  if (!vars) return tekst;
  return tekst.replace(/\{(\w+)\}/g, (heel, naam) => (vars[naam] == null ? heel : String(vars[naam])));
}

export function tx(bron: string, vars?: Record<string, string | number | null | undefined>, context?: string): string {
  if (huidig === 'nl') return vul(bron, vars);
  const v = boek[sleutel(bron, context)];
  return vul(typeof v === 'string' && v ? v : bron, vars);
}

/** Meervoud. In het Nederlands: `een` bij n === 1, anders `meer`. */
export function txn(een: string, meer: string, n: number, vars?: Record<string, string | number | null | undefined>, context?: string): string {
  const alle = { n, ...vars };
  if (huidig !== 'nl') {
    const v = boek[sleutel(`${een}|${meer}`, context)];
    if (v && typeof v === 'object') {
      const vorm = v[regels.select(n)] ?? v.other;
      if (vorm) return vul(vorm, alle);
    }
  }
  return vul(n === 1 ? een : meer, alle);
}

/** Markeert tekst voor vertaling zonder te vertalen (voor vaste lijsten). */
export const txm = (bron: string): string => bron;

/** Woordenboek van een taal laden (los bestand, alleen de gekozen taal). */
export async function laadWoordenboek(code: Taal): Promise<Woordenboek> {
  switch (code) {
    case 'en': return (await import('./talen/en.json')).default as Woordenboek;
    case 'de': return (await import('./talen/de.json')).default as Woordenboek;
    case 'fr': return (await import('./talen/fr.json')).default as Woordenboek;
    case 'es': return (await import('./talen/es.json')).default as Woordenboek;
    case 'pt': return (await import('./talen/pt.json')).default as Woordenboek;
    case 'pl': return (await import('./talen/pl.json')).default as Woordenboek;
    case 'ro': return (await import('./talen/ro.json')).default as Woordenboek;
    case 'bg': return (await import('./talen/bg.json')).default as Woordenboek;
    case 'uk': return (await import('./talen/uk.json')).default as Woordenboek;
    case 'tr': return (await import('./talen/tr.json')).default as Woordenboek;
    default: return {};
  }
}
