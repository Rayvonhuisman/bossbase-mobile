/**
 * Nieuwe versies van de juridische documenten: kopie van `src/lib/akkoord.js`
 * in het dashboard (~/BossBase). Daar staan ook de regels; de server legt het
 * akkoord vast met dezelfde versies in `supabase/functions/_shared/akkoord.ts`.
 * Houd ze gelijk: `tests/akkoord.test.mjs` legt deze kopie naast het dashboard.
 * Geen imports, zodat dit in de Node-tests draait.
 *
 * Alleen de algemene voorwaarden en de verwerkersovereenkomst vragen een
 * bestaande beheerder opnieuw om akkoord; een nieuwe privacyverklaring niet
 * (informatie, geen overeenkomst). Een document vraagt pas vanaf zijn
 * ingangsdatum (`AKKOORD_INGANG`); zonder datum vraagt het niets.
 */
export const AKKOORD_VERSIES = {
  algemene_voorwaarden: '2026-12',
  verwerkersovereenkomst: '2026-12b',
  privacyverklaring: '2026-11c',
} as const;

export type AkkoordDocument = 'algemene_voorwaarden' | 'verwerkersovereenkomst';

export const AKKOORD_INGANG: Record<AkkoordDocument, string | null> = {
  // 2026-12: besluit Niels 27 oktober 2026, ingang dezelfde dag, zonder mail of
  // aankondiging; beheerders accepteren bij hun volgende inlog.
  algemene_voorwaarden: '2026-10-27',
  // 2026-12b: voorstel, ingang 7 december 2026 na een aankondiging van minstens
  // 30 dagen.
  verwerkersovereenkomst: '2026-12-07',
};

/** Wat er nieuw is, voor het venster. Teksten letterlijk uit het dashboard. */
export const AKKOORD_NIEUW: Record<AkkoordDocument, { naam: string; url: string; wat: string }> = {
  algemene_voorwaarden: {
    naam: 'Algemene voorwaarden',
    url: 'https://www.bossbase.nl/voorwaarden',
    wat: 'Alles exporteren: al je gegevens en bestanden kosteloos in één ZIP (8.3). Artikel 15: de website bij een jaarabonnement, met in 15.9 de afspraken over teksten en sfeerbeelden die we met AI maken. En wat we doen bij een melding van illegale inhoud op je website, met het adres om dat te melden (7.7 en artikel 1).',
  },
  verwerkersovereenkomst: {
    naam: 'Verwerkersovereenkomst',
    url: 'https://www.bossbase.nl/verwerkersovereenkomst',
    wat: 'Boss per onderdeel: welke gegevens naar Anthropic gaan bij de helpchat, de hulp bij offertes en facturen, de schrijfhulp voor de mail en het uitlezen van metingen, en wanneer Boss een vraag naar ons team doorzet (§2). Bij Anthropic: waar de verwerking plaatsvindt, geen training en hoe lang Anthropic kan bewaren (§5). Inspreken via je browser (§2). Ten opzichte van versie 2026-10 ook: bestanden bij klanten en projecten, vier subverwerkers als je een website bij ons hebt (Vercel, Mijndomein, Google Workspace en OpenAI), de volledige export, zelf je account verwijderen, de kosten van een audit en de back-ups.',
  },
};

export const OPNIEUW_AKKOORD = Object.keys(AKKOORD_NIEUW) as AkkoordDocument[];

/**
 * Welke documenten deze gebruiker nu moet accepteren: alleen voor een beheerder,
 * alleen documenten waarvan de huidige versie ontbreekt en waarvan de
 * ingangsdatum (`YYYY-MM-DD`) bereikt is. Zelfde regel als
 * `NieuweVoorwaarden.jsx` in het dashboard.
 */
export function teAccepteren(invoer: {
  isAdmin: boolean;
  rijen: readonly { document: string; versie: string }[];
  vandaag: string;
  versies?: Record<string, string>;
  ingang?: Record<string, string | null>;
}): AkkoordDocument[] {
  if (!invoer.isAdmin) return [];
  const versies: Record<string, string> = invoer.versies ?? AKKOORD_VERSIES;
  const ingang: Record<string, string | null> = invoer.ingang ?? AKKOORD_INGANG;
  const heeft = new Set(invoer.rijen.map((r) => `${r.document}@${r.versie}`));
  return OPNIEUW_AKKOORD.filter((d) => {
    if (heeft.has(`${d}@${versies[d]}`)) return false;
    const datum = ingang[d];
    return !!datum && datum <= invoer.vandaag;
  });
}
