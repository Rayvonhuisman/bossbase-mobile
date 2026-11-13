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
  algemene_voorwaarden: '2026-12b',
  verwerkersovereenkomst: '2026-12',
  privacyverklaring: '2026-11b',
} as const;

export type AkkoordDocument = 'algemene_voorwaarden' | 'verwerkersovereenkomst';

export const AKKOORD_INGANG: Record<AkkoordDocument, string | null> = {
  // 2026-12: besluit Niels 27 oktober 2026, ingang dezelfde dag, zonder mail of
  // aankondiging; beheerders accepteren bij hun volgende inlog. Voorwaarden
  // 2026-12a (7.8, sjablonen en Boss zijn geen juridisch advies): op dezelfde
  // manier, op verzoek van Niels 10 november 2026. 2026-12b (eindejaarsactie,
  // artikel 15 herschreven: de website is van ons tot je hem koopt): zelfde
  // route, besluit Niels 13 november 2026.
  algemene_voorwaarden: '2026-11-13',
  verwerkersovereenkomst: '2026-10-27',
};

/** Wat er nieuw is, voor het venster. Teksten letterlijk uit het dashboard. */
export const AKKOORD_NIEUW: Record<AkkoordDocument, { naam: string; url: string; wat: string }> = {
  algemene_voorwaarden: {
    naam: 'Algemene voorwaarden',
    url: 'https://www.bossbase.nl/voorwaarden',
    wat: 'De eindejaarsactie: tot en met 31 december 2 maanden gratis proberen met een gratis website (3.2). Artikel 15 is herschreven: de website is van ons tot je hem koopt. Met een jaarabonnement Groei of Team houd je hem gratis (hosting € 5 per maand); anders koop je hem voor € 500, met hosting van € 5 per maand bij een ander abonnement of € 10 zonder abonnement, of gaat hij offline (15.8 tot en met 15.10). Wat je voor een upgrade of extra betaalt, krijg je niet terug (15.3). Eerder kwamen erbij: sjablonen en teksten van Boss zijn geen juridisch advies (7.8), Alles exporteren (8.3) en het melden van illegale inhoud op je website (7.7 en artikel 1).',
  },
  verwerkersovereenkomst: {
    naam: 'Verwerkersovereenkomst',
    url: 'https://www.bossbase.nl/verwerkersovereenkomst',
    wat: 'Boss en het uitlezen van metingen bij Anthropic (§2, §3 en §5), bestanden bij klanten en projecten (§2 en §3), vier nieuwe subverwerkers als je een website bij ons hebt: Vercel, Mijndomein, Google Workspace en OpenAI (§5 en §6), de volledige export (§7), zelf je account verwijderen (§8), de kosten van een audit (§4) en de back-ups (bijlage).',
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
