/**
 * Kleine regels van het Boss-gesprek, gedeeld door offerte en factuur. Puur;
 * dezelfde als in het dashboard (`BossOfferte.jsx`, `BossAssistent.jsx`).
 */

let teller = 0;
/** Id van een kaart in het gesprek. */
export const nid = () => `bg${++teller}`;

/** Een samenvatting van het model eindigt niet altijd op een punt. */
export const zin = (t?: string | null) => {
  const s = String(t || '').trim();
  return s && !/[.!?]$/.test(s) ? `${s}.` : s;
};

/** Hoeveel kaarten op de gebruiker wachten (vraag, voorstel, keuze). */
export const wachtOpJou = (items: { t: string; status?: string; antwoord?: unknown; bevestigd?: unknown; gekozen?: unknown }[]) =>
  items.filter((i) =>
    (i.t === 'voorstel' && i.status === 'open') || (i.t === 'vragen' && !i.antwoord) || (i.t === 'vraag' && !i.antwoord)
    || (i.t === 'maten' && !i.bevestigd) || (i.t === 'kies' && !i.gekozen),
  ).length;

export const getalNl = (n: number | null | undefined) =>
  n == null ? '?' : Number(n).toLocaleString('nl-NL', { maximumFractionDigits: 3 });

// Een klant die in de opdracht bij naam genoemd wordt ("offerte voor Jeroen
// Bakker"). Eerst de volledige naam, anders een achternaam die maar bij één
// klant past. Bij twijfel geen klant: dan kiest de gebruiker zelf.
const kaal = (s: unknown) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const alsWoord = (tekst: string, woord: string) =>
  new RegExp(`(^|[^a-z0-9])${woord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(tekst);
export function klantUitOpdracht<K extends { id: string; name: string | null }>(opdracht: string, klanten: K[] = []): K | null {
  const t = kaal(opdracht);
  const naam = (c: K) => c.name || '';
  const heel = klanten
    .filter((c) => kaal(naam(c)).trim().length >= 3 && alsWoord(t, kaal(naam(c)).trim()))
    .sort((a, b) => naam(b).length - naam(a).length);
  if (heel.length) return heel.length === 1 || naam(heel[0]!).length > naam(heel[1]!).length ? heel[0]! : null;
  const achternaam = (c: K) => kaal(naam(c)).trim().split(/\s+/).pop() || '';
  const deels = klanten.filter((c) => kaal(naam(c)).trim().includes(' ') && achternaam(c).length >= 4 && alsWoord(t, achternaam(c)));
  return deels.length === 1 ? deels[0]! : null;
}

/**
 * Een mail van Boss bij een offerte: zorgt dat `{{link}}` (de knop "Offerte
 * bekijken & ondertekenen") erin staat, na de zin die naar de knop verwijst en
 * vóór de groet. Zelfde regel als `metOndertekenplek` in het dashboard.
 */
export function metOndertekenplek(tekst: string, kanOndertekenen: boolean): string {
  if (!kanOndertekenen || /\{\{\s*(?:link|knop)\s*\}\}/i.test(tekst)) return tekst;
  const alineas = String(tekst).split(/\n{2,}/);
  if (alineas.length < 2) return `${tekst}\n\n{{link}}`;
  const naKnop = alineas.findIndex((a) => /\bknop\b/i.test(a));
  const afsluiting = alineas.findIndex((a, i) => i > 0 && /^(heeft u|heb je|mocht u|met vriendelijke|vriendelijke groet|groet|hartelijke)/i.test(a.trim()));
  const plek = naKnop >= 0 ? naKnop + 1 : afsluiting > 0 ? afsluiting : alineas.length - 1;
  alineas.splice(plek, 0, '{{link}}');
  return alineas.join('\n\n');
}
