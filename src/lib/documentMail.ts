/**
 * Offerte- en factuurmail: de pure kant van `SendOfferteMailModal` en
 * `SendFactuurMailModal` in het dashboard (OffertesPage.jsx, FacturenPage.jsx),
 * met `mailTemplate`/`mailButton` (utils/mailTemplate.js) en de variabelen uit
 * `emailService.js`.
 *
 * Eén bewust verschil: het dashboard heeft een opmaak-editor en werkt met
 * HTML; de app laat de mail als platte tekst bewerken. Dat levert dezelfde
 * mail op. Het dashboard maakt van een sjabloon zonder opmaak één `<div>` per
 * regel met de waarden ge-escaped (`substituteVarsHtml(plainToEditorHtml(…))`);
 * de app vult eerst de waarden in en zet bij het versturen elke regel, ge-escaped,
 * in een `<div>` (`tekstNaarHtml`). Escapen per waarde of per regel geeft
 * dezelfde tekens, dus dezelfde HTML.
 *
 * Bewust zonder imports: de tests draaien dit bestand rechtstreeks in Node.
 */

// ── Tekst en HTML ──────────────────────────────────────────────────────────

/** `escapeHtml` uit emailService.js. */
import { mailButton, mailTemplate, readableTextColor } from './mail/mailTemplate';
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `substituteVars`: `{{naam}}` → waarde; onbekende variabelen blijven staan. */
export function substituteVars(template: string, vars: Record<string, string | null | undefined>): string {
  return String(template ?? '').replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

/** `tekstNaarEditorHtml` uit noteFormat.js: één ge-escapete `<div>` per regel. */
export function tekstNaarHtml(tekst: string): string {
  if (!tekst) return '';
  return String(tekst)
    .split('\n')
    .map((regel) => `<div>${escapeHtml(regel) || '<br>'}</div>`)
    .join('');
}

const LINK_RE = /\{\{\s*(?:link|knop)\s*\}\}/i;
const LINK_RE_G = /\{\{\s*(?:link|knop)\s*\}\}/gi;

/**
 * `zonderOndertekenTekst` uit OffertesPage.jsx, op HTML: zonder digitale
 * handtekening gaat elk blok weg dat over ondertekenen gaat of de link bevat,
 * en daarna een losse `{{link}}`.
 */
export function zonderOndertekenHtml(html: string): string {
  const zonderBlokken = String(html || '').replace(/<(p|div)\b[^>]*>[\s\S]*?<\/\1>/gi, (blok) =>
    LINK_RE.test(blok) || /onderteken/i.test(blok) ? '' : blok,
  );
  return zonderBlokken.replace(LINK_RE_G, '');
}

/**
 * Hetzelfde voor de tekst in het bewerkveld: het dashboard haalt de belofte er
 * al bij het openen uit ("wat je ziet is wat de klant krijgt"). Een regel is
 * hier wat in het dashboard één `<div>` is.
 */
export function zonderOndertekenTekst(tekst: string): string {
  return String(tekst || '')
    .split('\n')
    .filter((r) => !(LINK_RE.test(r) || /onderteken/i.test(r)))
    .join('\n')
    .replace(LINK_RE_G, '');
}

/**
 * `insertPayButtonBeforeClosing` uit FacturenPage.jsx: de knop direct vóór
 * het blok met "Met vriendelijke groet", anders achteraan — nooit ná de groet.
 */
export function voegInVoorAfsluiting(bodyHtml: string, invoeg: string): string {
  if (!invoeg) return bodyHtml;
  const idx = bodyHtml.search(/met vriendelijke groet/i);
  if (idx === -1) return bodyHtml + invoeg;
  const voor = bodyHtml.slice(0, idx);
  const tagStart = Math.max(voor.lastIndexOf('<div'), voor.lastIndexOf('<p'));
  const op = tagStart === -1 ? idx : tagStart;
  return bodyHtml.slice(0, op) + invoeg + bodyHtml.slice(op);
}

/** Zelfde plek, maar in de tekst van het bewerkveld: een regel vóór de groet. */
export function voegRegelInVoorAfsluiting(tekst: string, regel: string): string {
  const regels = String(tekst || '').split('\n');
  const i = regels.findIndex((r) => /met vriendelijke groet/i.test(r));
  if (i === -1) return [...regels, regel].join('\n');
  // Direct boven de groet, zoals het dashboard het blok vóór de `<div>` met de
  // groet zet (dus ná een eventuele witregel).
  return [...regels.slice(0, i), regel, ...regels.slice(i)].join('\n');
}

// ── Mailopmaak (utils/mailTemplate.js) ─────────────────────────────────────
// Sinds oktober 2026 via ./mail/mailTemplate, dat de gedeelde mailcode van het
// dashboard letterlijk overneemt (src/lib/mail/vendored). De eigen kopie die
// hier stond, miste de Gmail-fix voor de knop in de bedrijfskleur.

/** `readableTextColor`: donkere tekst op lichte kleuren, witte op donkere. */
export function leesbareTekstkleur(hex: string | null | undefined): string {
  return readableTextColor(hex);
}

/** `mailButton`: knop in de bedrijfskleur, met BossBase-groen als terugval. */
export function mailKnop(tekst: string, url: string, merkkleur?: string | null): string {
  return mailButton(tekst, url, merkkleur);
}

/**
 * `mailTemplate` uit het dashboard, de zakelijke variant (bedrijf → klant):
 * bedrijfslogo of -naam, de titel, de body en "Verstuurd met BossBase". Zonder
 * knop en voettekst: de knop staat in de body, zoals in het dashboard. (De
 * systeemvariant voor bedrijfsnaam 'BossBase' komt hier niet voor: de
 * aanroepers geven altijd de bedrijfsnaam of 'Ons bedrijf' mee.)
 */
export function zakelijkeMail({
  titel,
  body,
  bedrijfsnaam,
  logoUrl,
  merkkleur,
}: {
  titel: string;
  body: string;
  bedrijfsnaam: string;
  logoUrl?: string | null;
  merkkleur?: string | null;
}): string {
  return mailTemplate({ title: titel, body, companyName: bedrijfsnaam, logoUrl, brandColor: merkkleur });
}

// ── Bedragen en datums zoals de mailvariabelen ze tonen ────────────────────

const EUR = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

/** `fmt2` in de mailvensters: € met centen. */
export function mailBedrag(n: number | string | null | undefined): string {
  return EUR.format(Number(n) || 0);
}

/**
 * `new Date(d).toLocaleDateString('nl-NL')` voor een datum `JJJJ-MM-DD`:
 * "5-11-2026", zonder voorloopnullen. Rechtstreeks uit de tekst, zodat de
 * tijdzone van het toestel er niets aan kan veranderen.
 */
export function mailDatum(d: string | null | undefined): string {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return '';
  return `${Number(m[3])}-${Number(m[2])}-${m[1]}`;
}

/** `formatIban` uit pdfOpbouw.js: groepjes van vier, hoofdletters. */
export function formatIban(iban: string | null | undefined): string {
  return String(iban || '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

// ── Offertemail ────────────────────────────────────────────────────────────

export type MailSjabloon = { onderwerp: string | null; body: string | null } | null;

/** De ondertekenlink van de publieke pagina in het dashboard. */
export function ondertekenLink(appUrl: string, signToken: string | null | undefined): string {
  return `${appUrl}/offerte/${signToken || ''}`;
}

/**
 * Onderwerp en tekst van de offertemail bij het openen van het venster
 * (`SendOfferteMailModal`, eerste effect). `{{link}}` blijft als zichtbare
 * plaatshouder staan; pas bij versturen wordt het een knop.
 */
export function offerteMailConcept(input: {
  sjabloon: MailSjabloon;
  kanOndertekenen: boolean;
  klantNaam: string | null | undefined;
  bedrijfsnaam: string | null | undefined;
  nummer: string;
  omschrijving: string | null | undefined;
  totaalIncl: number | null | undefined;
  geldigTot: string | null | undefined;
}): { onderwerp: string; tekst: string } {
  const vars = {
    klant_naam: input.klantNaam || 'klant',
    bedrijfsnaam: input.bedrijfsnaam || 'ons bedrijf',
    offerte_nummer: input.nummer,
    omschrijving: input.omschrijving || '',
    totaal_bedrag: mailBedrag(input.totaalIncl),
    vervaldatum: mailDatum(input.geldigTot),
  };
  const naam = input.bedrijfsnaam || '';
  const onderwerp = input.sjabloon
    ? substituteVars(input.sjabloon.onderwerp || '', vars)
    : `Offerte ${input.nummer} van ${naam}`;
  const tekst = input.sjabloon
    ? substituteVars(input.sjabloon.body || '', vars)
    : input.kanOndertekenen
      ? `Beste ${vars.klant_naam},\n\nHierbij sturen wij u offerte ${input.nummer} toe.\n\nVia onderstaande knop kunt u de offerte bekijken en digitaal ondertekenen:\n{{link}}\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n${naam}`
      : `Beste ${vars.klant_naam},\n\nHierbij sturen wij u offerte ${input.nummer} toe als bijlage.\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n${naam}`;
  return { onderwerp, tekst: input.kanOndertekenen ? tekst : zonderOndertekenTekst(tekst) };
}

/**
 * De HTML die verstuurd wordt (`handleSend` van de offertemail): tekst naar
 * HTML, `{{link}}` wordt de knop "Offerte bekijken & ondertekenen" (of de
 * kale link zonder token), zonder handtekening gaat de ondertekenbelofte eruit,
 * en alles in de zakelijke mail.
 */
export function offerteMailHtml(input: {
  onderwerp: string;
  tekst: string;
  kanOndertekenen: boolean;
  signToken: string | null | undefined;
  appUrl: string;
  bedrijfsnaam: string | null | undefined;
  logoUrl?: string | null;
  merkkleur?: string | null;
}): string {
  const body = tekstNaarHtml(input.tekst);
  const link = ondertekenLink(input.appUrl, input.signToken);
  const knop = !input.kanOndertekenen
    ? ''
    : input.signToken
      ? mailKnop('Offerte bekijken & ondertekenen', link, input.merkkleur)
      : link;
  const bodyVoorVerzending = input.kanOndertekenen ? body.replace(LINK_RE_G, knop) : zonderOndertekenHtml(body);
  return zakelijkeMail({
    titel: input.onderwerp,
    body: bodyVoorVerzending,
    bedrijfsnaam: input.bedrijfsnaam || 'Ons bedrijf',
    logoUrl: input.logoUrl,
  });
}

// ── Factuurmail ────────────────────────────────────────────────────────────

export type FactuurMailSoort = 'factuur' | 'herinnering_1' | 'herinnering_2';

export const FACTUUR_MAIL_TITEL: Record<FactuurMailSoort, string> = {
  factuur: 'Factuur versturen per e-mail',
  herinnering_1: 'Betaalherinnering 1 versturen',
  herinnering_2: 'Betaalherinnering 2 versturen',
};

/** "NL00 BANK 0123 4567 89 t.n.v. Bedrijf", of leeg zonder IBAN. */
export function ibanTekst(iban: string | null | undefined, tnv: string | null | undefined, naam: string | null | undefined): string {
  if (!iban) return '';
  const wie = tnv || naam;
  return `${formatIban(iban)}${wie ? ` t.n.v. ${wie}` : ''}`;
}

/**
 * Onderwerp en tekst van de factuur- of herinneringsmail bij het openen
 * (`SendFactuurMailModal`). Met Stripe actief noemt `{{betaalinstructie}}`
 * online betalen als hoofdroute; overmaken staat er altijd bij. Staat het
 * rekeningnummer nog nergens in de tekst, dan komt er een regel met de
 * betaalgegevens vóór de groet (niet bij een creditnota).
 */
export function factuurMailConcept(input: {
  sjabloon: MailSjabloon;
  klantNaam: string | null | undefined;
  bedrijfsnaam: string | null | undefined;
  nummer: string;
  totaalIncl: number | null | undefined;
  vervaldatum: string | null | undefined;
  betalingskenmerk: string | null | undefined;
  isCredit: boolean;
  /** IBAN van het document: de bevroren waarde, anders die van het bedrijf nu. */
  iban: string | null | undefined;
  ibanTnv: string | null | undefined;
  /** De naam op het document (bevroren of live), voor "t.n.v." zonder eigen tnv. */
  documentBedrijfsnaam: string | null | undefined;
  stripeActief: boolean;
}): { onderwerp: string; tekst: string } {
  const iban = ibanTekst(input.iban, input.ibanTnv, input.documentBedrijfsnaam);
  const vars = {
    klant_naam: input.klantNaam || 'klant',
    bedrijfsnaam: input.bedrijfsnaam || 'ons bedrijf',
    factuur_nummer: input.nummer,
    totaal_bedrag: mailBedrag(input.totaalIncl),
    vervaldatum: mailDatum(input.vervaldatum),
    iban,
    betaalinstructie: input.stripeActief
      ? `U kunt de factuur eenvoudig online betalen via de knop hieronder, of het bedrag overmaken${iban ? ` op ${iban}` : ''} onder vermelding van ${input.nummer}.`
      : `Gelieve het totaalbedrag voor de betaaltermijn over te maken${iban ? ` op ${iban}` : ''} onder vermelding van ${input.nummer}.`,
  };
  const onderwerp = input.sjabloon
    ? substituteVars(input.sjabloon.onderwerp || '', vars)
    : `Factuur ${input.nummer} van ${input.bedrijfsnaam || ''}`;
  let tekst = input.sjabloon
    ? substituteVars(input.sjabloon.body || '', vars)
    : `Beste ${vars.klant_naam},\n\nHierbij uw factuur ${input.nummer}.\n\n${vars.betaalinstructie}\n\nMet vriendelijke groet,\n${input.bedrijfsnaam || ''}`;

  const kaleIban = String(input.iban || '').replace(/\s/g, '').toUpperCase();
  if (iban && !input.isCredit && !tekst.replace(/\s/g, '').includes(kaleIban)) {
    const kenmerkAlGenoemd = /onder\s+vermelding\s+van/i.test(tekst);
    const kenmerk = kenmerkAlGenoemd ? '' : `, onder vermelding van ${input.betalingskenmerk || input.nummer}`;
    tekst = voegRegelInVoorAfsluiting(tekst, `Betaalgegevens: ${iban}${kenmerk}.`);
  }
  return { onderwerp, tekst };
}

/** De HTML die verstuurd wordt: tekst naar HTML, betaalknop vóór de groet. */
export function factuurMailHtml(input: {
  onderwerp: string;
  tekst: string;
  betaalUrl: string | null | undefined;
  bedrijfsnaam: string | null | undefined;
  logoUrl?: string | null;
  merkkleur?: string | null;
}): string {
  const knop = input.betaalUrl ? mailKnop('Factuur betalen', input.betaalUrl, input.merkkleur) : '';
  return zakelijkeMail({
    titel: input.onderwerp,
    body: voegInVoorAfsluiting(tekstNaarHtml(input.tekst), knop),
    bedrijfsnaam: input.bedrijfsnaam || 'Ons bedrijf',
    logoUrl: input.logoUrl,
  });
}

// ── Losse mail aan een klant (E-mails op de klantkaart) ───────────────────

/**
 * Onderwerp en tekst na het kiezen van een sjabloon (`handleTemplateSelect` in
 * CustomerPage): alleen `{{klant_naam}}` en `{{bedrijfsnaam}}` worden ingevuld,
 * met "klant" en "BossBase" als terugval. Zonder sjabloon: leeg.
 */
export function klantMailConcept(input: {
  sjabloon: MailSjabloon;
  klantNaam: string | null | undefined;
  bedrijfsnaam: string | null | undefined;
}): { onderwerp: string; tekst: string } {
  if (!input.sjabloon) return { onderwerp: '', tekst: '' };
  const vars = { klant_naam: input.klantNaam || 'klant', bedrijfsnaam: input.bedrijfsnaam || 'BossBase' };
  return {
    onderwerp: substituteVars(input.sjabloon.onderwerp || '', vars),
    tekst: substituteVars(input.sjabloon.body || '', vars),
  };
}

/**
 * De HTML die verstuurd wordt (`handleSendEmail`): de tekst, of zonder tekst
 * het onderwerp als alinea, in de zakelijke mail met het bedrijfslogo. Het
 * dashboard zet dat onderwerp er onge-escaped in; hier ge-escaped.
 */
export function klantMailHtml(input: {
  onderwerp: string;
  tekst: string;
  bedrijfsnaam: string | null | undefined;
  logoUrl?: string | null;
}): string {
  const body = input.tekst.trim() ? tekstNaarHtml(input.tekst) : `<p>${escapeHtml(input.onderwerp)}</p>`;
  return zakelijkeMail({
    titel: input.onderwerp,
    body,
    bedrijfsnaam: input.bedrijfsnaam || 'Ons bedrijf',
    logoUrl: input.logoUrl,
  });
}

/** Geldig genoeg om te versturen: het dashboard eist alleen een adres. */
export function heeftOntvanger(aan: string): boolean {
  return aan.trim().length > 0;
}

// ── Bevroren bedrijfsgegevens (utils/documentSnapshot.js) ──────────────────

/**
 * `buildCompanySnapshot`: de bedrijfsgegevens die bij de eerste verzending op
 * het document worden vastgezet, zodat een later ander logo of adres een
 * verstuurd document niet meer verandert. Alleen facturen hebben IBAN-kolommen.
 */
export function bedrijfSnapshot(
  company: {
    logoUrl?: string | null;
    brandingColor?: string | null;
    name?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    email?: string | null;
    kvk?: string | null;
    btwNumber?: string | null;
    iban?: string | null;
    ibanTnv?: string | null;
  } | null,
  { metIban = false }: { metIban?: boolean } = {},
): Record<string, string | null> {
  if (!company) return {};
  const snap: Record<string, string | null> = {
    snapshot_logo_url: company.logoUrl || null,
    snapshot_branding_color: company.brandingColor || null,
    snapshot_bedrijfsnaam: company.name || null,
    snapshot_adres: company.address || null,
    snapshot_postcode: company.postalCode || null,
    snapshot_plaats: company.city || null,
    snapshot_email: company.email || null,
    snapshot_kvk: company.kvk || null,
    snapshot_btw: company.btwNumber || null,
  };
  if (metIban) {
    snap.snapshot_iban = company.iban || null;
    snap.snapshot_iban_tnv = company.ibanTnv || null;
  }
  return snap;
}
