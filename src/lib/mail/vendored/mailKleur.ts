// @ts-nocheck
// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase supabase/functions/_shared/mailKleur.ts
// Dashboardcommit: 4f36bec
// Bijwerken: node scripts/mail-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie; tests/mailOpmaak.test.mjs
// vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
// De eigen mails van BossBase (bossbaseMail.ts) zijn altijd licht. Eén plek
// voor de meta-tags, de CSS en de hulpjes. Geen Deno- of browser-API's: de
// frontend importeert dit ook.
//
// De mails die een ondernemer aan zijn klanten stuurt (zakelijkeMail.ts) zijn
// NIET geforceerd licht en hebben geen color-scheme. Alleen hun knop in de
// bedrijfskleur gebruikt donkerVlak en gmailWitInline van hier, zodat hij in
// Gmail hetzelfde blijft (besluit 23 oktober 2026, zie de kop van dat bestand).
//
// Waarom geen donkere versie: die is in oktober 2026 gebouwd (eigen donkere
// kleuren via @media (prefers-color-scheme: dark) en [data-ogsc]-regels) en
// werkte in Gmail en Apple Mail niet goed. Nu forceren we licht, zo goed als
// het gaat:
//  - color-scheme "light only": Apple Mail en Outlook draaien dan niets om.
//  - Gmail (vooral de apps) negeert dat en draait zelf om: lichte vlakken
//    donker, donkere tekst licht. Dat blijft leesbaar en laten we gebeuren.
//  - Wat er altijd hetzelfde uit moet zien, is een plaatje: de kop van de
//    BossBase-mails (logo op zwart, met het label en de balk erin).
//  - Een zwart vlak dat geen plaatje kan zijn, krijgt een linear-gradient van
//    dezelfde kleur (donkerVlak): een background-image draait Gmail niet om.
//    De witte tekst erop zou Gmail wél omdraaien naar donker; daartegen helpt
//    gmailWit (mix-blend-mode, zie hieronder).
//  - Een licht vlak met donkere tekst krijgt bewust géén gradient: dan draait
//    Gmail de tekst om en het vlak niet, en staat er lichte tekst op wit.

export const MAIL_KLEURSCHEMA_META = `<meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">`

export const MAIL_KLEURSCHEMA_CSS = ':root { color-scheme: light only; supported-color-schemes: light only; }'

// Een donker vlak dat Gmail niet omdraait. Gebruik: style="${donkerVlak(x)}..."
// samen met bgcolor="${x}".
export const donkerVlak = (kleur: string) =>
  `background-color:${kleur};background-image:linear-gradient(${kleur},${kleur});`

// Witte tekst die in de Gmail-app wit blijft. Gmail zet <u></u> vóór de body
// (die de class "body" moet hebben), dus "u + .body" geldt alleen in Gmail.
// Gmail draait witte tekst om naar zwart; screen en daarna difference op een
// zwarte achtergrond draaien dat terug. Buiten Gmail doet de CSS niets, en de
// zwarte achtergrond valt in Gmail weg door de blend-modes. Werkt alleen voor
// wit (en bijna-wit), niet voor gekleurde tekst. In een eigen <style>-blok:
// Gmail gooit een heel blok weg als het iets niet snapt.
export const GMAIL_WIT_CSS = `
    u + .body .gmail-blend-screen { background: #000; mix-blend-mode: screen; }
    u + .body .gmail-blend-difference { background: #000; mix-blend-mode: difference; }`

export const gmailWit = (inhoud: string) =>
  `<div class="gmail-blend-screen"><div class="gmail-blend-difference">${inhoud}</div></div>`

// Hetzelfde voor inline tekst, zoals de tekst van een knop.
export const gmailWitInline = (inhoud: string) =>
  `<span class="gmail-blend-screen"><span class="gmail-blend-difference">${inhoud}</span></span>`

// ── De kop van de BossBase-mails, als plaatje ───────────────────────────────
// Elke kop die een mail gebruikt, staat hier en is vooraf getekend door
// scripts/gen-mail-koppen.mjs naar public/brand/mail-kop/v<versie>/<bestand>.png,
// 2× zo groot als getoond (1200 breed), zodat hij op retina scherp is.
// bossbaseMail kiest de kop op label, kleur en voortgang (afgerond). Staat een
// combinatie hier niet, dan wordt het de kop met alleen het logo en komt het
// label als bovenkop in de mail. Een nieuw label: voeg het hier toe, draai het
// script en commit de plaatjes.
//
// Verander je het ontwerp, verhoog dan KOP_VERSIE: Gmail bewaart plaatjes, en
// verstuurde mails moeten hun oude kop houden.
export const KOP_VERSIE = 1
export const KOP_BREED = 600
export const KOP_HOOG = { zonderBalk: 80, metBalk: 104 }

export type KopVariant = { bestand: string; tekst?: string; kleur?: string; voortgang?: number }

export const KOP_VARIANTEN: KopVariant[] = [
  { bestand: 'logo' },
  { bestand: 'aankondiging', tekst: 'Aankondiging' },
  { bestand: 'abonnement-actief', tekst: 'Abonnement actief' },
  // Proefmails (trialMails.ts): voortgang = (14 − dagen over) / 14.
  { bestand: 'nog-11-dagen', tekst: 'Nog 11 dagen gratis', voortgang: 21 },
  { bestand: 'nog-7-dagen', tekst: 'Nog 7 dagen gratis', voortgang: 50 },
  { bestand: 'nog-3-dagen', tekst: 'Nog 3 dagen gratis', voortgang: 79 },
  { bestand: 'morgen-laatste-dag', tekst: 'Morgen laatste dag', voortgang: 93 },
  { bestand: 'account-op-pauze', tekst: 'Account op pauze', kleur: '#fbbf24', voortgang: 100 },
]

export const KOP_GROEN = '#1DDB62'

export function kopPlaatje(label?: { tekst: string; kleur?: string }, voortgang?: number | null) {
  const pct = voortgang == null ? undefined : Math.max(4, Math.min(100, Math.round(voortgang)))
  const kleur = (label?.kleur ?? KOP_GROEN).toLowerCase()
  const v = KOP_VARIANTEN.find(k =>
    (k.tekst ?? '') === (label?.tekst ?? '') &&
    (k.kleur ?? KOP_GROEN).toLowerCase() === kleur &&
    k.voortgang === pct)
  const gekozen = v ?? KOP_VARIANTEN[0]
  return {
    url: `https://www.bossbase.nl/brand/mail-kop/v${KOP_VERSIE}/${gekozen.bestand}.png`,
    hoog: gekozen.voortgang == null ? KOP_HOOG.zonderBalk : KOP_HOOG.metBalk,
    alt: gekozen.tekst ? `BossBase · ${gekozen.tekst}` : 'BossBase',
    // Niet gevonden: het label moet dan in de mail zelf.
    labelLos: !v && label ? label.tekst : null,
  }
}
