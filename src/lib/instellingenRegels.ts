/**
 * Vaste gegevens en pure regels van Instellingen, overgenomen uit
 * `InstellingenPage.jsx`, `instellingenService.js`, `bb-shared.jsx`,
 * `tiers.js`, `features.js` en `AbonnementSectie.jsx` van het dashboard.
 *
 * Geen React en geen Supabase: dit draait ook in de Node-tests.
 */
import { tx, txm } from '@/i18n';
import { vertaald } from './vertaald';

// ── Tabs ───────────────────────────────────────────────────────────────────

export type InstellingenTab =
  | 'profiel'
  | 'bedrijf'
  | 'standaard'
  | 'eenheden'
  | 'templates'
  | 'pipeline'
  | 'agenda'
  | 'herinneringen'
  | 'voertuigen'
  | 'abonnement'
  | 'integraties';

export const INSTELLINGEN_TAB_IDS: readonly InstellingenTab[] = [
  'profiel',
  'bedrijf',
  'abonnement',
  'standaard',
  'eenheden',
  'templates',
  'pipeline',
  'agenda',
  'herinneringen',
  'voertuigen',
  'integraties',
];

/**
 * Welke tabs iemand ziet, met dezelfde namen en volgorde als `TAB_GROEPEN` in
 * het dashboard (Account · Bedrijf · Offertes en facturen · Klanten en
 * aanvragen · Planning en uren · Koppelingen). Het websiteformulier staat
 * alleen in het dashboard.
 */
export function zichtbareTabs(stand: {
  instellingen: boolean;
  isAdmin: boolean;
  voertuigen: boolean;
}): { id: InstellingenTab; label: string }[] {
  const tabs: { id: InstellingenTab; label: string }[] = [{ id: 'profiel', label: tx('Mijn profiel') }];
  if (!stand.instellingen) return tabs;
  tabs.push({ id: 'bedrijf', label: tx('Bedrijfsprofiel') });
  if (stand.isAdmin) tabs.push({ id: 'abonnement', label: tx('Abonnement') });
  tabs.push(
    { id: 'standaard', label: tx('Tarieven en termijnen') },
    { id: 'eenheden', label: tx('Eenheidsprijzen') },
    { id: 'templates', label: tx('E-mailtemplates') },
    { id: 'pipeline', label: tx('Pipeline') },
    { id: 'agenda', label: tx('Agenda') },
    { id: 'herinneringen', label: tx('Urenherinnering') },
  );
  if (stand.isAdmin && stand.voertuigen) tabs.push({ id: 'voertuigen', label: tx('Voertuigen') });
  tabs.push({ id: 'integraties', label: tx('Integraties') });
  return tabs;
}

/** Een `?tab=` uit de URL → geldige, zichtbare tab (anders 'profiel'). */
export function kiesTab(
  gevraagd: string | null | undefined,
  zichtbaar: readonly { id: InstellingenTab }[],
): InstellingenTab {
  const hit = zichtbaar.find((t) => t.id === gevraagd);
  return hit ? hit.id : 'profiel';
}

// ── Wachtwoord ─────────────────────────────────────────────────────────────

export const WACHTWOORD_REGELS: { key: string; label: string; test: (p: string) => boolean }[] = [
  { key: 'len', get label() { return tx('Minimaal 8 tekens'); }, test: (p) => p.length >= 8 },
  { key: 'upper', get label() { return tx('Minimaal 1 hoofdletter'); }, test: (p) => /[A-Z]/.test(p) },
  { key: 'digit', get label() { return tx('Minimaal 1 cijfer'); }, test: (p) => /[0-9]/.test(p) },
  { key: 'special', get label() { return tx('Minimaal 1 speciaal teken'); }, test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function wachtwoordGeldig(p: string): boolean {
  return WACHTWOORD_REGELS.every((r) => r.test(p));
}

// ── Standaardwaarden ───────────────────────────────────────────────────────

export const HERINNERING_INTERVALLEN = [
  { id: '15', get label() { return tx('Elke 15 minuten'); } },
  { id: '30', get label() { return tx('Elke 30 minuten'); } },
  { id: '60', get label() { return tx('Elk uur'); } },
  { id: '120', get label() { return tx('Elke 2 uur'); } },
  { id: '240', get label() { return tx('Elke 4 uur'); } },
];

export const HERINNERING_MOMENTEN = [
  { id: 'na_werkdag', get label() { return tx('Na afloop van de ingeplande werkdag'); } },
  { id: 'einde_dag', get label() { return tx('Aan het einde van de dag'); } },
  { id: 'volgende_ochtend', get label() { return tx('De volgende ochtend'); } },
];

export const WEEKDAGEN = vertaald([
  txm('Maandag'),
  txm('Dinsdag'),
  txm('Woensdag'),
  txm('Donderdag'),
  txm('Vrijdag'),
  txm('Zaterdag'),
  txm('Zondag'),
]);

/** Waarde aan- of uitvinken in een lijst (weekdagen, uitgesloten medewerkers). */
export function wisselInLijst<T>(lijst: readonly T[], waarde: T, erin: boolean): T[] {
  const zonder = lijst.filter((x) => x !== waarde);
  return erin ? [...zonder, waarde] : zonder;
}

export const uurLabel = (u: number) => `${String(u).padStart(2, '0')}:00`;
/** Eerste zichtbare uur: 0 t/m 23. */
export const AGENDA_START_UREN = Array.from({ length: 24 }, (_, u) => u);
/** Laatste zichtbare uur: 1 t/m 24, en altijd na het eerste. */
export function agendaEindUren(start: number): number[] {
  return Array.from({ length: 24 }, (_, i) => i + 1).filter((u) => u > start);
}

// ── E-mailtemplates ────────────────────────────────────────────────────────

export type TemplateConfig = {
  type: string;
  label: string;
  vars: string[];
  showAutoToggle: boolean;
  showAutoDagen: boolean;
  dagenLabel?: string;
  feature?: string;
};

export const TEMPLATE_CONFIGS: TemplateConfig[] = [
  { type: 'offerte', get label() { return tx('Offerte'); }, vars: ['klant_naam', 'bedrijfsnaam', 'offerte_nummer', 'totaal_bedrag', 'vervaldatum', 'link'], showAutoToggle: false, showAutoDagen: false },
  { type: 'offerte_geaccepteerd', get label() { return tx('Offerte geaccepteerd'); }, vars: ['klant_naam', 'bedrijfsnaam', 'offerte_nummer'], showAutoToggle: false, showAutoDagen: false },
  { type: 'factuur', get label() { return tx('Factuur'); }, vars: ['klant_naam', 'bedrijfsnaam', 'factuur_nummer', 'totaal_bedrag', 'vervaldatum', 'betaalinstructie', 'iban'], showAutoToggle: false, showAutoDagen: false },
  { type: 'herinnering_1', get label() { return tx('Herinnering 1'); }, vars: ['klant_naam', 'bedrijfsnaam', 'factuur_nummer', 'totaal_bedrag', 'vervaldatum'], showAutoToggle: true, showAutoDagen: true, get dagenLabel() { return tx('dagen na vervaldatum'); }, feature: 'betaalherinneringen' },
  { type: 'herinnering_2', get label() { return tx('Herinnering 2'); }, vars: ['klant_naam', 'bedrijfsnaam', 'factuur_nummer', 'totaal_bedrag', 'vervaldatum'], showAutoToggle: true, showAutoDagen: true, get dagenLabel() { return tx('dagen na vervaldatum'); }, feature: 'betaalherinneringen' },
  { type: 'aanvraag_ontvangen', get label() { return tx('Aanvraag ontvangen'); }, vars: ['klant_naam', 'bedrijfsnaam'], showAutoToggle: true, showAutoDagen: false },
  { type: 'afspraak_bevestiging', get label() { return tx('Afspraak bevestiging'); }, vars: ['klant_naam', 'bedrijfsnaam', 'afspraak_datum', 'afspraak_tijd'], showAutoToggle: true, showAutoDagen: false },
  { type: 'afspraak_herinnering', get label() { return tx('Afspraak herinnering'); }, vars: ['klant_naam', 'bedrijfsnaam', 'afspraak_datum', 'afspraak_tijd'], showAutoToggle: true, showAutoDagen: true, get dagenLabel() { return tx('dag(en) voor afspraak'); } },
];

export const STANDAARD_TEMPLATE_TYPES = new Set(TEMPLATE_CONFIGS.map((c) => c.type));

export const NIEUW_TEMPLATE_VARS = [
  'klant_naam',
  'bedrijfsnaam',
  'factuur_nummer',
  'offerte_nummer',
  'totaal_bedrag',
  'vervaldatum',
  'afspraak_datum',
  'afspraak_tijd',
  'link',
];

export const STANDAARD_BODY: Record<string, string> = {
  offerte: 'Beste {{klant_naam}},\n\nHierbij sturen wij u offerte {{offerte_nummer}} toe.\n\nTotaalbedrag: {{totaal_bedrag}}\nGeldig tot: {{vervaldatum}}\n\nVia onderstaande link kunt u de offerte bekijken en digitaal ondertekenen:\n{{link}}\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  offerte_geaccepteerd: 'Beste {{klant_naam}},\n\nHartelijk dank! Uw offerte {{offerte_nummer}} is succesvol ondertekend.\n\nWij gaan zo snel mogelijk voor u aan de slag. U ontvangt binnenkort meer informatie over de planning.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  factuur: 'Beste {{klant_naam}},\n\nHierbij ontvangt u factuur {{factuur_nummer}} van {{bedrijfsnaam}}.\n\nTotaalbedrag: {{totaal_bedrag}}\nBetaaltermijn: {{vervaldatum}}\n\n{{betaalinstructie}}\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  herinnering_1: 'Beste {{klant_naam}},\n\nWij willen u vriendelijk herinneren dat factuur {{factuur_nummer}} nog openstaat.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nMocht u dit bedrag reeds hebben overgemaakt, dan kunt u deze herinnering als niet verzonden beschouwen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  herinnering_2: 'Beste {{klant_naam}},\n\nDit is een tweede herinnering voor factuur {{factuur_nummer}}, welke reeds is vervallen.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nWij verzoeken u dringend dit bedrag zo spoedig mogelijk te voldoen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  aanvraag_ontvangen: 'Beste {{klant_naam}},\n\nBedankt voor uw aanvraag! Wij hebben uw bericht ontvangen en nemen zo spoedig mogelijk contact met u op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  afspraak_bevestiging: 'Beste {{klant_naam}},\n\nHierbij bevestigen wij uw afspraak.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nMocht u de afspraak willen verzetten, neem dan tijdig contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  afspraak_herinnering: 'Beste {{klant_naam}},\n\nGraag herinneren wij u aan uw afspraak met {{bedrijfsnaam}}.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nKomt het onverhoopt niet uit? Laat het ons dan zo snel mogelijk weten, dan zoeken we samen een ander moment.\n\nWij zien u graag tegemoet!\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
};

/** `slugify` uit het dashboard: naam → type/slug voor een eigen template. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Controle bij een nieuw eigen template (`handleCreateTemplate`).
 * Geeft de slug terug of een foutmelding.
 */
export function controleerNieuwTemplate(
  naam: string,
  type: string,
  bestaand: readonly string[],
): { ok: true; slug: string } | { ok: false; melding: string } {
  if (!naam.trim()) return { ok: false, melding: tx('Naam is verplicht') };
  const slug = type.trim() || slugify(naam);
  if (!slug) return { ok: false, melding: tx('Type/slug is verplicht') };
  if (STANDAARD_TEMPLATE_TYPES.has(slug)) return { ok: false, melding: tx('Dit type is al een standaard template') };
  if (bestaand.includes(slug)) return { ok: false, melding: tx('Een template met dit type bestaat al') };
  return { ok: true, slug };
}

/**
 * Platte tekst → editor-HTML zoals `plainToEditorHtml` in het dashboard: één
 * `<div>` per regel, lege regel = `<div><br></div>`, alles ge-escaped.
 */
export function tekstNaarEditorHtml(tekst: string): string {
  if (!tekst) return '';
  return tekst
    .split('\n')
    .map((regel) => {
      const veilig = regel.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<div>${veilig || '<br>'}</div>`;
    })
    .join('');
}

// ── Pipeline ───────────────────────────────────────────────────────────────

export const PIPELINE_MOMENTEN = [
  { key: 'offerte_verstuurd', get label() { return tx('Offerte verstuurd'); }, get uitleg() { return tx('Zodra een offerte voor deze aanvraag is verstuurd, vanuit het dashboard of de app.'); } },
  { key: 'akkoord', get label() { return tx('Akkoord'); }, get uitleg() { return tx('Vanaf deze fase telt de aanvraag in de cijfers als binnengehaald. Ook bereikt als de klant de offerte ondertekent. Sleep je hem terug naar een eerdere fase, dan staat hij weer open.'); } },
  { key: 'gepland', get label() { return tx('Werkbon gepland'); }, get uitleg() { return tx('Zodra een werkbon voor dit project is ingepland.'); } },
  { key: 'in_uitvoering', get label() { return tx('Klus gestart'); }, get uitleg() { return tx('Zodra iemand op "Start klus" drukt.'); } },
  { key: 'gefactureerd', get label() { return tx('Factuur verstuurd'); }, get uitleg() { return tx('Zodra een factuur voor dit project is verstuurd.'); } },
  { key: 'betaald', get label() { return tx('Factuur betaald'); }, get uitleg() { return tx('Zodra de factuur als betaald is gemarkeerd.'); } },
  { key: 'verloren', get label() { return tx('Verloren'); }, get uitleg() { return tx('Een aanvraag die in deze fase komt telt altijd als verloren, ook zonder reden erbij. En verloren blijft verloren.'); } },
];

export const FASE_KLEUREN = [
  { get label() { return tx('Blauw'); }, value: '#3b82f6' },
  { get label() { return tx('Groen'); }, value: '#1DDB62' },
  { get label() { return tx('Oranje'); }, value: '#f97316' },
  { get label() { return tx('Rood'); }, value: '#ef4444' },
  { get label() { return tx('Paars'); }, value: '#a855f7' },
  { get label() { return tx('Geel'); }, value: '#eab308' },
  { get label() { return tx('Roze'); }, value: '#ec4899' },
  { get label() { return tx('Grijs'); }, value: '#6b7280' },
];

/**
 * Het volledige palet voor pipelinefasen, op kleurvolgorde
 * (`STAGE_COLOR_OPTIONS` in het dashboard). Alles wat de pipeline kan tonen,
 * kun je kiezen.
 */
export const FASE_KLEUR_OPTIES = [
  { get label() { return tx('Rood'); }, value: '#ef4444' },
  { get label() { return tx('Roze-rood'); }, value: '#f43f5e' },
  { get label() { return tx('Roze'); }, value: '#ec4899' },
  { get label() { return tx('Paars'); }, value: '#a855f7' },
  { get label() { return tx('Violet'); }, value: '#8b5cf6' },
  { get label() { return tx('Indigo'); }, value: '#6366f1' },
  { get label() { return tx('Blauw'); }, value: '#3b82f6' },
  { get label() { return tx('Hemelsblauw'); }, value: '#0ea5e9' },
  { get label() { return tx('Cyaan'); }, value: '#06b6d4' },
  { get label() { return tx('Groenblauw'); }, value: '#14b8a6' },
  { get label() { return tx('Smaragd'); }, value: '#10b981' },
  { get label() { return tx('Groen'); }, value: '#1DDB62' },
  { get label() { return tx('Limoen'); }, value: '#84cc16' },
  { get label() { return tx('Geel'); }, value: '#eab308' },
  { get label() { return tx('Oker'); }, value: '#a16207' },
  { get label() { return tx('Oranje'); }, value: '#f97316' },
  { get label() { return tx('Grijs'); }, value: '#6b7280' },
];

/** Naam van een getoonde fasekleur (`kleurNaam` in Instellingen van het dashboard). */
export function faseKleurNaam(hex: string | null | undefined): string {
  const h = String(hex ?? '').toLowerCase();
  return FASE_KLEUR_OPTIES.find((k) => k.value.toLowerCase() === h)?.label ?? tx('Eigen kleur');
}

export const STANDAARD_FASE_KLEUR = '#6b7280';

const OUDE_FASE_KLASSEN: Record<string, string> = {
  'b-blue': '#3b82f6',
  'b-planned': '#3b82f6',
  'b-green': '#1DDB62',
  'b-new': '#1DDB62',
  'b-done': '#1DDB62',
  'b-accepted': '#1DDB62',
  'b-orange': '#f97316',
  'b-progress': '#f97316',
  'b-red': '#ef4444',
  'b-purple': '#a855f7',
  'b-yellow': '#eab308',
  'b-pink': '#ec4899',
  'b-gray': '#6b7280',
  'b-lost': '#6b7280',
};

/** `stageColToHex`: opgeslagen kleur (hex of oude klasse) → hex. */
export function faseKleurHex(kleur: string | null | undefined): string {
  if (!kleur || typeof kleur !== 'string') return STANDAARD_FASE_KLEUR;
  if (kleur.startsWith('#')) return kleur;
  return OUDE_FASE_KLASSEN[kleur] ?? STANDAARD_FASE_KLEUR;
}

export function faseKleurLabel(kleur: string | null | undefined): string {
  const hex = faseKleurHex(kleur).toLowerCase();
  return FASE_KLEUREN.find((k) => k.value.toLowerCase() === hex)?.label ?? tx('Grijs');
}

// ── Voertuigen ─────────────────────────────────────────────────────────────

/** Zitplaatsen: 1–99, leeg of ongeldig = geen limiet (null). */
export function naarZitplaatsen(waarde: string | number | null | undefined): number | null {
  const n = parseInt(String(waarde ?? ''), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 99) : null;
}

// ── Abonnement ─────────────────────────────────────────────────────────────

export const PAKKETTEN: Record<string, { label: string; prijs: number }> = {
  starter: { label: 'Starter', prijs: 29 },
  groei: { label: 'Groei', prijs: 39 },
  team: { label: 'Team', prijs: 59 },
};
export const EXTRA_GEBRUIKER_PRIJS = 10;

export const pakketLabel = (tier: string | null | undefined) =>
  PAKKETTEN[tier ?? '']?.label ?? tier ?? tx('Onbekend');

export function maandbedrag(tier: string | null | undefined, extraGebruikers: number): number {
  return (PAKKETTEN[tier ?? '']?.prijs ?? 0) + (extraGebruikers || 0) * EXTRA_GEBRUIKER_PRIJS;
}

export const MODULES: Record<string, { label: string; prijs: number }> = {
  stripe_betaallink: { get label() { return tx('Stripe betaallink'); }, prijs: 10 },
  planning: { get label() { return tx('Planningsmodule'); }, prijs: 10 },
  voertuigen: { get label() { return tx('Voertuigen'); }, prijs: 5 },
  hosting: { get label() { return tx('Website-hosting'); }, prijs: 5 },
};

export const LIMIET_LABELS: Record<string, string> = vertaald({
  gebruikers: txm('Gebruikers'),
  klanten: txm('Klanten'),
  offertes: txm('Offertes'),
  facturen: txm('Facturen'),
});

export const ABONNEMENT_STATUS: Record<string, string> = vertaald({
  trial: txm('Gratis uitproberen'),
  actief: txm('Actief'),
  betaalprobleem: txm('Betaling mislukt'),
  opgezegd: txm('Opgezegd'),
});

export const WELKOMSTACTIES: Record<string, { label: string; kort: string }> = {
  gratis_maanden: { get label() { return tx('Eerste 2 maanden gratis'); }, get kort() { return tx('Je betaalt 10 van de 12 maanden.'); } },
  gratis_website: {
    get label() { return tx('Gratis website'); },
    get kort() { return tx('Wij bouwen eenmalig een professionele website voor je bedrijf.'); },
  },
};

export const WEBSITE_STATUS: Record<string, string> = vertaald({
  open: txm('aangevraagd'),
  gegevens_gevraagd: txm('we hebben je gegevens opgevraagd per mail'),
  in_behandeling: txm('in aanbouw'),
  opgeleverd: txm('opgeleverd'),
  geannuleerd: txm('geannuleerd'),
});
