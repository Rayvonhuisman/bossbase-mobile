/**
 * Vaste gegevens en pure regels van Instellingen, overgenomen uit
 * `InstellingenPage.jsx`, `instellingenService.js`, `bb-shared.jsx`,
 * `tiers.js`, `features.js` en `AbonnementSectie.jsx` van het dashboard.
 *
 * Geen React en geen Supabase: dit draait ook in de Node-tests.
 */

// ── Tabs ───────────────────────────────────────────────────────────────────

export type InstellingenTab =
  | 'profiel'
  | 'bedrijf'
  | 'standaard'
  | 'templates'
  | 'pipeline'
  | 'voertuigen'
  | 'abonnement'
  | 'integraties';

export const INSTELLINGEN_TAB_IDS: readonly InstellingenTab[] = [
  'profiel',
  'bedrijf',
  'standaard',
  'templates',
  'pipeline',
  'voertuigen',
  'abonnement',
  'integraties',
];

/** Welke tabs iemand ziet — `TABS` in het dashboard. */
export function zichtbareTabs(stand: {
  instellingen: boolean;
  isAdmin: boolean;
  voertuigen: boolean;
}): { id: InstellingenTab; label: string }[] {
  const tabs: { id: InstellingenTab; label: string }[] = [{ id: 'profiel', label: 'Mijn profiel' }];
  if (!stand.instellingen) return tabs;
  tabs.push(
    { id: 'bedrijf', label: 'Bedrijfsprofiel' },
    { id: 'standaard', label: 'Standaardwaarden' },
    { id: 'templates', label: 'E-mailtemplates' },
    { id: 'pipeline', label: 'Pipeline' },
  );
  if (stand.isAdmin && stand.voertuigen) tabs.push({ id: 'voertuigen', label: 'Voertuigen' });
  if (stand.isAdmin) tabs.push({ id: 'abonnement', label: 'Abonnement' });
  tabs.push({ id: 'integraties', label: 'Integraties' });
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
  { key: 'len', label: 'Minimaal 8 tekens', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'Minimaal 1 hoofdletter', test: (p) => /[A-Z]/.test(p) },
  { key: 'digit', label: 'Minimaal 1 cijfer', test: (p) => /[0-9]/.test(p) },
  { key: 'special', label: 'Minimaal 1 speciaal teken', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function wachtwoordGeldig(p: string): boolean {
  return WACHTWOORD_REGELS.every((r) => r.test(p));
}

// ── Standaardwaarden ───────────────────────────────────────────────────────

export const HERINNERING_INTERVALLEN = [
  { id: '15', label: 'Elke 15 minuten' },
  { id: '30', label: 'Elke 30 minuten' },
  { id: '60', label: 'Elk uur' },
  { id: '120', label: 'Elke 2 uur' },
  { id: '240', label: 'Elke 4 uur' },
];

export const HERINNERING_MOMENTEN = [
  { id: 'na_werkdag', label: 'Na afloop van de ingeplande werkdag' },
  { id: 'einde_dag', label: 'Aan het einde van de dag' },
  { id: 'volgende_ochtend', label: 'De volgende ochtend' },
];

export const WEEKDAGEN = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

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
  { type: 'offerte', label: 'Offerte', vars: ['klant_naam', 'bedrijfsnaam', 'offerte_nummer', 'totaal_bedrag', 'vervaldatum', 'link'], showAutoToggle: false, showAutoDagen: false },
  { type: 'offerte_geaccepteerd', label: 'Offerte geaccepteerd', vars: ['klant_naam', 'bedrijfsnaam', 'offerte_nummer'], showAutoToggle: false, showAutoDagen: false },
  { type: 'factuur', label: 'Factuur', vars: ['klant_naam', 'bedrijfsnaam', 'factuur_nummer', 'totaal_bedrag', 'vervaldatum', 'betaalinstructie', 'iban'], showAutoToggle: false, showAutoDagen: false },
  { type: 'herinnering_1', label: 'Herinnering 1', vars: ['klant_naam', 'bedrijfsnaam', 'factuur_nummer', 'totaal_bedrag', 'vervaldatum'], showAutoToggle: true, showAutoDagen: true, dagenLabel: 'dagen na vervaldatum', feature: 'betaalherinneringen' },
  { type: 'herinnering_2', label: 'Herinnering 2', vars: ['klant_naam', 'bedrijfsnaam', 'factuur_nummer', 'totaal_bedrag', 'vervaldatum'], showAutoToggle: true, showAutoDagen: true, dagenLabel: 'dagen na vervaldatum', feature: 'betaalherinneringen' },
  { type: 'aanvraag_ontvangen', label: 'Aanvraag ontvangen', vars: ['klant_naam', 'bedrijfsnaam'], showAutoToggle: true, showAutoDagen: false },
  { type: 'afspraak_bevestiging', label: 'Afspraak bevestiging', vars: ['klant_naam', 'bedrijfsnaam', 'afspraak_datum', 'afspraak_tijd'], showAutoToggle: true, showAutoDagen: false },
  { type: 'afspraak_herinnering', label: 'Afspraak herinnering', vars: ['klant_naam', 'bedrijfsnaam', 'afspraak_datum', 'afspraak_tijd'], showAutoToggle: true, showAutoDagen: true, dagenLabel: 'dag(en) voor afspraak' },
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
  if (!naam.trim()) return { ok: false, melding: 'Naam is verplicht' };
  const slug = type.trim() || slugify(naam);
  if (!slug) return { ok: false, melding: 'Type/slug is verplicht' };
  if (STANDAARD_TEMPLATE_TYPES.has(slug)) return { ok: false, melding: 'Dit type is al een standaard template' };
  if (bestaand.includes(slug)) return { ok: false, melding: 'Een template met dit type bestaat al' };
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
  { key: 'offerte_verstuurd', label: 'Offerte verstuurd', uitleg: 'Zodra een offerte voor deze aanvraag is verstuurd, vanuit het dashboard of de app.' },
  { key: 'akkoord', label: 'Akkoord', uitleg: 'Vanaf deze fase telt de aanvraag in de cijfers als binnengehaald. Ook bereikt als de klant de offerte ondertekent. Sleep je hem terug naar een eerdere fase, dan staat hij weer open.' },
  { key: 'gepland', label: 'Werkbon gepland', uitleg: 'Zodra een werkbon voor dit project is ingepland.' },
  { key: 'in_uitvoering', label: 'Klus gestart', uitleg: 'Zodra iemand op "Start klus" drukt.' },
  { key: 'gefactureerd', label: 'Factuur verstuurd', uitleg: 'Zodra een factuur voor dit project is verstuurd.' },
  { key: 'betaald', label: 'Factuur betaald', uitleg: 'Zodra de factuur als betaald is gemarkeerd.' },
  { key: 'verloren', label: 'Verloren', uitleg: 'Een deal die in deze fase komt telt altijd als verloren, ook zonder reden erbij. En verloren blijft verloren.' },
];

export const FASE_KLEUREN = [
  { label: 'Blauw', value: '#3b82f6' },
  { label: 'Groen', value: '#1DDB62' },
  { label: 'Oranje', value: '#f97316' },
  { label: 'Rood', value: '#ef4444' },
  { label: 'Paars', value: '#a855f7' },
  { label: 'Geel', value: '#eab308' },
  { label: 'Roze', value: '#ec4899' },
  { label: 'Grijs', value: '#6b7280' },
];

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
  return FASE_KLEUREN.find((k) => k.value.toLowerCase() === hex)?.label ?? 'Grijs';
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
  PAKKETTEN[tier ?? '']?.label ?? tier ?? 'Onbekend';

export function maandbedrag(tier: string | null | undefined, extraGebruikers: number): number {
  return (PAKKETTEN[tier ?? '']?.prijs ?? 0) + (extraGebruikers || 0) * EXTRA_GEBRUIKER_PRIJS;
}

export const MODULES: Record<string, { label: string; prijs: number }> = {
  stripe_betaallink: { label: 'Stripe betaallink', prijs: 10 },
  planning: { label: 'Planningsmodule', prijs: 10 },
  voertuigen: { label: 'Voertuigen', prijs: 5 },
  hosting: { label: 'Website-hosting', prijs: 5 },
};

export const LIMIET_LABELS: Record<string, string> = {
  gebruikers: 'Gebruikers',
  klanten: 'Klanten',
  offertes: 'Offertes',
  facturen: 'Facturen',
};

export const ABONNEMENT_STATUS: Record<string, string> = {
  trial: 'Gratis uitproberen',
  actief: 'Actief',
  betaalprobleem: 'Betaling mislukt',
  opgezegd: 'Opgezegd',
};

export const WELKOMSTACTIES: Record<string, { label: string; kort: string }> = {
  gratis_maanden: { label: 'Eerste 2 maanden gratis', kort: 'Je betaalt 10 van de 12 maanden.' },
  gratis_website: {
    label: 'Gratis website',
    kort: 'Wij bouwen eenmalig een professionele website voor je bedrijf.',
  },
};

export const WEBSITE_STATUS: Record<string, string> = {
  open: 'aangevraagd',
  gegevens_gevraagd: 'we hebben je gegevens opgevraagd per mail',
  in_behandeling: 'in aanbouw',
  opgeleverd: 'opgeleverd',
  geannuleerd: 'geannuleerd',
};
