// Regels en teksten voor "Account verwijderen" (Instellingen › Mijn profiel,
// AccountVerwijderen.tsx).
// Bewust zonder react-native: getest in tests/accountVerwijderen.test.mjs.
//
// De server (Edge Function account-verwijderen) beslist wie wat mag; hier staat
// alleen wat de app toont en welke invoer hij doorlaat.

export type Overdracht = { id: string; verlooptOp: string; naarNaam?: string | null; vanNaam?: string | null };

export type VerwijderStatus = {
  rol: string | null;
  isEigenaar: boolean;
  bedrijfsnaam: string | null;
  verwijdering: { id: string; modus: 'gepland' | 'direct'; status: 'gepland' | 'bezig'; geplandOp: string } | null;
  overdrachtUit: Overdracht | null;
  overdrachtIn: Overdracht | null;
  kandidaten: { id: string; naam: string | null }[];
  teamleden: number;
  herauthenticatieGeldig?: boolean;
};

export const BEVESTIGWOORD = 'VERWIJDEREN';

export function bevestigingKlopt(invoer: string | null | undefined): boolean {
  return (invoer ?? '').trim().toUpperCase() === BEVESTIGWOORD;
}

/** De bedrijfsnaam moet exact overeenkomen (de server controleert hetzelfde). */
export function bedrijfsnaamKlopt(invoer: string | null | undefined, naam: string | null | undefined): boolean {
  return !!naam && invoer === naam;
}

export function datumNl(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });
}

/**
 * Uniek per poging: een dubbele tik of netwerkretry geeft hetzelfde resultaat.
 * Een UUID (v4); de server accepteert `[A-Za-z0-9-]{8,64}`.
 */
export function nieuweSleutel(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Wat de kaart toont, afgeleid van de status van de server. */
export function weergave(st: VerwijderStatus) {
  const loopt = !!st.verwijdering;
  const kanOverdragen = st.isEigenaar && !loopt && st.kandidaten.length > 0 && !st.overdrachtUit;
  return {
    loopt,
    kanAnnuleren: st.isEigenaar && st.verwijdering?.status === 'gepland',
    toonEigenaarKeuzes: st.isEigenaar && !loopt,
    toonLidVerwijderen: !st.isEigenaar,
    kanOverdragen,
    geenOpvolger: st.isEigenaar && st.kandidaten.length === 0,
  };
}

export function verwijderingMelding(st: VerwijderStatus): string | null {
  const v = st.verwijdering;
  if (!v) return null;
  const wanneer = v.status === 'bezig' || v.modus === 'direct' ? 'wordt nu verwijderd' : `wordt verwijderd op ${datumNl(v.geplandOp)}`;
  return `Dit bedrijf ${wanneer}. Tot die tijd kun je alles bekijken en exporteren, maar niets meer wijzigen.`;
}

// Teksten. Op iOS geen prijzen, geen oproep om iets te kopen en geen verwijzing
// naar betalen buiten de app (App Store 3.1.1): het abonnement wordt alleen
// neutraal genoemd. Dezelfde teksten werken op elk platform.
export const LID_GEVOLGEN = [
  'Weg: je login, naam, e-mailadres, telefoonnummer, profielfoto, meldingen en koppelingen (zoals Google Agenda). Je wordt op elk apparaat uitgelogd.',
  'Blijft bij het bedrijf: wat je voor het bedrijf hebt vastgelegd (uren, werkbonnen, notities). Daar staat voortaan „Verwijderde gebruiker”.',
  'Het bedrijf en de accounts van je collega’s blijven bestaan.',
  'Dit is definitief en kan niet ongedaan worden gemaakt.',
];

/**
 * Uitleg voor de eigenaar. Op web en Android, net als het dashboard, ook waar
 * je het abonnement opzegt; op iOS niet (App Store 3.1.1: geen verwijzing naar
 * betalen of abonnementsbeheer buiten de app).
 */
export function eigenaarUitleg(platform: string): string {
  const basis =
    'Je bent de eigenaar. Wil je alleen je eigen account verwijderen, draag dan eerst het eigendom over aan een ' +
    'andere beheerder. Of verwijder het hele bedrijf, met alle teamleden en gegevens.';
  if (platform === 'ios') return basis;
  return `${basis} Wil je alleen stoppen met betalen, zeg dan je abonnement op (dashboard › Instellingen › Abonnement).`;
}

export const OVERDRACHT_GEVOLGEN = [
  'De nieuwe eigenaar beheert het abonnement en kan het bedrijf verwijderen.',
  'Tot de acceptatie blijf jij eigenaar. Het verzoek verloopt na 7 dagen; je kunt het eerder intrekken.',
  'Daarna kun je je eigen account verwijderen.',
];

export function bedrijfGevolgen(teamleden: number): string[] {
  return [
    `Weg: alle klanten, projecten, werkbonnen, uren, planning, offertes, facturen, kosten, bestanden en foto’s, en de accounts van jou en ${teamleden > 0 ? `${teamleden} ${teamleden === 1 ? 'teamlid' : 'teamleden'}` : 'je team'}.`,
    'Abonnement: stopt op de verwijderdatum; daarna wordt er niets meer afgeschreven.',
    'BossBase bewaart alleen de facturen die BossBase jou stuurde en de bijbehorende betalingen, 7 jaar (wettelijke bewaarplicht), plus een kort technisch bewijs van dit verzoek.',
    'Exporteer eerst wat je zelf moet bewaren, zoals je facturen en btw-gegevens. Jouw eigen administratieplicht blijft gelden.',
  ];
}

export const MODUS_UITLEG = {
  gepland: 'Het bedrijf gaat direct op alleen-lezen. Exporteren kan nog 30 dagen en je kunt annuleren.',
  direct: 'Alles is direct weg en kan niet worden teruggezet.',
};

/** Melding bij een foutcode van de server; anders de melding van de server zelf. */
export function foutTekst(code: string | null | undefined, melding: string | null | undefined): string {
  switch (code) {
    case 'herauthenticatie':
      return 'Bevestig opnieuw met je wachtwoord.';
    case 'te_vaak':
      return 'Te veel pogingen. Probeer het over een kwartier opnieuw.';
    case 'sessie':
      return 'Je sessie is verlopen. Log opnieuw in.';
    default:
      return melding || 'Er ging iets mis. Probeer het later opnieuw.';
  }
}
