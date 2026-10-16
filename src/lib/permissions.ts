/**
 * Het rechtenmodel van BossBase — één op één overgenomen uit het dashboard
 * (`src/config/permissions.js` en `src/lib/features.js` op origin/main).
 *
 * Er zijn TWEE onafhankelijke lagen; een functie is pas beschikbaar als ze
 * allebei ja zeggen:
 *
 *   1. RECHT    — mag deze gebruiker dit?      → `user_permissions` + rol
 *   2. FEATURE  — zit dit in het abonnement?   → `get_plan_status().features`
 *
 * De app mag hier niets aan toevoegen of vereenvoudigen. Wijkt deze lijst af
 * van het dashboard, dan verbergt of toont de app iets anders dan het kantoor
 * ziet — en dat is precies het soort verschil dat niemand opmerkt tot het
 * misgaat.
 */

/** Subrechten zoals ze in `user_permissions.permission` staan. */
export const PERMISSIONS = [
  // Klanten & Verkoop
  'klanten_bewerken',
  'klanten_verwijderen',
  'verkoop',
  // Uitvoering
  'projecten',
  'projecten_bewerken',
  'werkbonnen_bewerken',
  'planning',
  'alles_inzien',
  'agenda_inzien',
  // Financieel
  'projectbedragen',
  'bedrijfsfinancien',
  'offertes',
  'facturen',
  'inkoopprijzen',
  'kosten',
  // Beheer
  'team',
  'instellingen',
  'database',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Featuresleutels uit de abonnementsmatrix die de app gebruikt. */
export type Feature =
  | 'werkbonnen'
  | 'uren'
  | 'agenda'
  | 'klanten'
  | 'crm_pipeline'
  | 'offertes'
  | 'facturen'
  | 'planning'
  | 'voertuigen'
  | 'kosten_nacalculatie'
  | 'digitale_handtekening'
  | 'gedeelde_werkruimte'
  | (string & {});

/**
 * De rechtencheck van het dashboard (`magBewerken` in `usePermissions.js`,
 * origin/main) en van `bb_has_permission()` in de database:
 *
 *   admin    → alles
 *   anders   → staat het recht in user_permissions?
 *
 * De rol 'planner' bestaat niet meer (migratie 20261002135952:
 * `profiles_role_check` = admin | medewerker) en geeft dus niets extra.
 */
export function canWithRole(
  permission: Permission | string,
  role: string | null | undefined,
  granted: readonly string[],
): boolean {
  if (!role) return false;
  if (role === 'admin') return true;
  return granted.includes(permission);
}

/**
 * Inzagerechten die in een gedeelde werkruimte (pakket Groei, feature
 * `gedeelde_werkruimte`) automatisch gelden — letterlijk `INZAGE_RECHTEN` uit
 * `usePermissions.js` van het dashboard (origin/main, besluit 4-10-2026,
 * migratie 20261004200000). Financiële inzage (verkoop, offertes, facturen,
 * kosten, bedrijfsfinancien, projectbedragen) vraagt óók in een gedeelde
 * werkruimte een expliciet recht; Groei heeft daarvoor rechtenbeheer.
 * Bewerkrechten horen er evenmin bij.
 */
export const INZAGE_RECHTEN: readonly string[] = ['alles_inzien', 'agenda_inzien', 'projecten', 'database', 'team'];

/**
 * "Zien" zoals het dashboard (`can()` in `usePermissions.js`): in een gedeelde
 * werkruimte is elk inzagerecht toegestaan, anders de gewone rechtencheck.
 */
export function canZien(
  permission: Permission | string,
  role: string | null | undefined,
  granted: readonly string[],
  features: readonly string[] | null | undefined,
): boolean {
  if (features?.includes('gedeelde_werkruimte') && INZAGE_RECHTEN.includes(permission)) return true;
  return canWithRole(permission, role, granted);
}

/**
 * Wat een menu-item nodig heeft. Gespiegeld aan `NAV` in het dashboard:
 * items zonder recht zijn voor iedereen zichtbaar en worden door RLS begrensd
 * (eigen werk versus dat van het hele team).
 */
export type NavGate = {
  permission?: Permission;
  feature?: Feature;
};

/**
 * Per mobiele route wat er nodig is. De sleutel is het pad zoals de app het
 * gebruikt, zodat één tabel zowel het menu als de routebewaking voedt en die
 * twee niet uit elkaar kunnen lopen.
 *
 * Afgeleid van het dashboard:
 *   pipeline → verkoop · offertes → offertes · facturen → facturen
 *   kosten   → kosten + feature kosten_nacalculatie
 *   planning → planning + feature planning   (mobiel is /planning de Agenda,
 *              die in het dashboard ongated is; de planningsmodule zelf is
 *              /planningbord)
 *   team     → team · instellingen → instellingen · database → database
 */
export const ROUTE_GATES: Record<string, NavGate> = {
  '/pipeline': { permission: 'verkoop' },
  // Zoals het menu van het dashboard (NAV: projecten → recht `projecten`).
  '/projects': { permission: 'projecten' },
  // Planning (weekrooster): recht én pakketfeature, zoals NAV in het dashboard.
  '/planningbord': { permission: 'planning', feature: 'planning' },
  '/offers': { permission: 'offertes' },
  '/invoices': { permission: 'facturen' },
  '/expenses': { permission: 'kosten', feature: 'kosten_nacalculatie' },
  // Financiën (NAV `revenue`): alleen het recht, geen pakketfeature — net als
  // het dashboard. Het btw-blok daar (feature btw_overzicht) staat niet in de app.
  '/financien': { permission: 'bedrijfsfinancien' },
  '/team': { permission: 'team' },
  // Instellingen zelf is open (Mijn profiel is voor iedereen); de pagina
  // toont per tab wat je mag, zoals het dashboard.
  '/database': { permission: 'database' },
  '/integrations': { permission: 'instellingen' },
  // Activiteiten, werkbonnen, uren, agenda en relaties kennen in het
  // dashboard géén rechtgate: RLS bepaalt of je alleen je eigen werk ziet of
  // dat van het hele team.
};

/** De gate voor een route, of `null` als de route voor iedereen open staat. */
export function gateFor(route: string): NavGate | null {
  return ROUTE_GATES[route] ?? null;
}

// ---------------------------------------------------------------------------
// Read-only: de teksten, overgenomen uit `src/lib/readonly.js` van het dashboard
// ---------------------------------------------------------------------------
//
// De database bepaalt ÓF een account read-only is en waarom (bb_readonly_reden,
// via get_plan_status().readonlyReden). Hier staat alleen wat de klant daarover
// leest. Toon: uitleggend, niet bestraffend — wie hier terechtkomt is meestal
// iets vergeten, en het is zijn eigen administratie die hij voor zich ziet.

export const READONLY_TEKSTEN: Record<string, { titel: string; uitleg: string }> = {
  proefperiode_verlopen: {
    titel: 'Je gratis periode is voorbij',
    uitleg:
      'Je kunt alles blijven bekijken, zoeken en exporteren. Toevoegen, wijzigen, ' +
      'verwijderen en versturen kan weer zodra je een abonnement kiest.',
  },
  betaling_mislukt: {
    titel: 'Je laatste betaling is niet gelukt',
    uitleg:
      'Daardoor staat je account tijdelijk op alleen-lezen: bekijken en exporteren kan, ' +
      'wijzigen en versturen niet. Werk je betaalgegevens bij en alles gaat direct weer open.',
  },
  opgezegd: {
    titel: 'Je abonnement is gestopt',
    uitleg:
      'Je gegevens staan er nog gewoon en je kunt ze bekijken en exporteren. Toevoegen, ' +
      'wijzigen, verwijderen en versturen kan weer met een abonnement.',
  },
};

/** Vangnet voor een reden die de database wel kent en de app nog niet. */
export const READONLY_ALGEMEEN = {
  titel: 'Je account staat op alleen-lezen',
  uitleg:
    'Je gegevens staan er nog gewoon en je kunt ze bekijken en exporteren. Wijzigen en ' +
    'versturen kan weer zodra er een lopend abonnement is.',
};

/**
 * iOS (App Store 3.1.1): dezelfde uitleg zonder oproep om een abonnement te
 * kiezen of betaalgegevens bij te werken — dat gebeurt buiten de app.
 */
export const READONLY_TEKSTEN_IOS: Record<string, { titel: string; uitleg: string }> = {
  proefperiode_verlopen: {
    titel: 'Je proefperiode is voorbij',
    uitleg:
      'Je kunt alles blijven bekijken, zoeken en exporteren. Toevoegen, wijzigen, ' +
      'verwijderen en versturen kan weer zodra je abonnement actief is. Je abonnement wordt buiten de app beheerd.',
  },
  betaling_mislukt: {
    titel: 'Je account staat tijdelijk op alleen-lezen',
    uitleg:
      'Bekijken en exporteren kan; wijzigen en versturen niet. Zodra de betaling in orde is, gaat alles ' +
      'direct weer open. Je abonnement wordt buiten de app beheerd.',
  },
  opgezegd: {
    titel: 'Je abonnement is gestopt',
    uitleg:
      'Je gegevens staan er nog gewoon en je kunt ze bekijken en exporteren. Toevoegen, ' +
      'wijzigen, verwijderen en versturen kan weer zodra je abonnement actief is.',
  },
};

/** `platform`: geef `Platform.OS` mee vanuit het scherm (dit bestand blijft vrij van react-native). */
export function readonlyTekst(reden: string | null | undefined, platform: string = 'web') {
  if (platform === 'ios') return (reden && READONLY_TEKSTEN_IOS[reden]) || READONLY_ALGEMEEN;
  return (reden && READONLY_TEKSTEN[reden]) || READONLY_ALGEMEEN;
}

// ---------------------------------------------------------------------------
// Actiegates: wat mag deze gebruiker DOEN, niet alleen zien
// ---------------------------------------------------------------------------
//
// ROUTE_GATES hierboven regelt zichtbaarheid. Deze tabel regelt de knoppen, en
// dat is een andere vraag: `alles_inzien` opent de projectenlijst van het hele
// team maar geeft geen bewerkrecht, en een read-only account mag niets meer
// wijzigen (ook niet op betaald zetten).
//
// Elke regel hieronder is overgenomen uit de RLS-policy van de bijbehorende
// tabel op de live database, geverifieerd op 2026-09-09. Waar de policy een
// rolvergelijking doet (`profiles.role = 'admin'`) staat hier `roles`, en niet
// een recht — want een medewerker mét het recht 'instellingen' komt langs de
// UI-gate maar niet langs de policy, en dan zou de app een knop tonen die
// gegarandeerd faalt.
//
// `readonlyBlokkeert`: sinds migratie 20261003093416 ("alleen-lezen is echt
// alleen-lezen") weigert de trigger `bb_readonly_bewaken` op elke
// bedrijfstabel INSERT, UPDATE én DELETE zolang het account alleen-lezen is.
// Ook betaald zetten (mark_factuur_betaald draait met auth.uid() en raakt de
// trigger). Elke actie hieronder blokkeert dus op read-only.

export type ActionGate = {
  /** Recht uit user_permissions (admin telt altijd, zie canWithRole). */
  permission?: Permission;
  /** Eén van deze rechten volstaat (policy met OR tussen rechten). */
  eenVan?: readonly Permission[];
  /** Abonnementsfeature die de policy afdwingt. */
  feature?: Feature;
  /** Harde rolgate: de policy vergelijkt profiles.role, niet een recht. */
  roles?: readonly string[];
  /** Readonly-trigger op deze actie (bb_readonly_bewaken: insert/update/delete). */
  readonlyBlokkeert?: boolean;
  /** Plan-limiet die op deze insert staat (plan_limiet_*). */
  limiet?: 'klanten' | 'offertes' | 'facturen' | 'gebruikers';
};

export type ModuleActies = {
  maken?: ActionGate;
  wijzigen?: ActionGate;
  verwijderen?: ActionGate;
  /** Afzonderlijke actie waar de policy anders is dan bij 'wijzigen'. */
  [extra: string]: ActionGate | undefined;
};

export const ACTIES: Record<string, ModuleActies> = {
  // customers: insert vraagt alleen company_id (+ limiet + read-only), maar
  // wijzigen en verwijderen hebben elk hun eigen recht.
  klanten: {
    maken: { readonlyBlokkeert: true, limiet: 'klanten' },
    wijzigen: { permission: 'klanten_bewerken', readonlyBlokkeert: true },
    verwijderen: { permission: 'klanten_verwijderen', readonlyBlokkeert: true },
  },
  // werkbonnen_insert: bb_has_permission('planning') OR
  // bb_has_permission('werkbonnen_bewerken') — admin via de helper. Bewerken
  // mag ook de verantwoordelijke van de bon; dat kan alleen het scherm zelf
  // vaststellen, dus dit is de bovengrens en de bon toetst de rest.
  // Verwijderen: werkbonnen_delete vergelijkt profiles.role = 'admin'.
  werkbonnen: {
    maken: { eenVan: ['planning', 'werkbonnen_bewerken'], readonlyBlokkeert: true },
    wijzigen: { readonlyBlokkeert: true },
    verwijderen: { roles: ['admin'], readonlyBlokkeert: true },
  },
  // activities: insert/update/delete vragen alleen company_id. Geen rechtgate.
  activiteiten: {
    maken: { readonlyBlokkeert: true },
    wijzigen: { readonlyBlokkeert: true },
    verwijderen: { readonlyBlokkeert: true },
    afronden: { readonlyBlokkeert: true },
  },
  // calendar_events: aanmaken mag iedereen binnen het bedrijf; wijzigen en
  // verwijderen vraagt het recht `planning`, TENZIJ het je eigen afspraak is en
  // hij niet uit de planningsmodule komt. Dat laatste kan alleen het scherm
  // vaststellen (herkomst + assigned_to), dus dit is de ondergrens en de
  // service laat de server het laatste woord.
  agenda: {
    maken: { readonlyBlokkeert: true },
    wijzigen: { readonlyBlokkeert: true },
    verwijderen: { readonlyBlokkeert: true },
  },
  // notes: idem — company_id only.
  notities: {
    maken: { readonlyBlokkeert: true },
    wijzigen: { readonlyBlokkeert: true },
    verwijderen: { readonlyBlokkeert: true },
  },
  projecten: {
    maken: { permission: 'projecten_bewerken', readonlyBlokkeert: true },
    wijzigen: { permission: 'projecten_bewerken', readonlyBlokkeert: true },
    // projects_delete vergelijkt profiles.role = 'admin'.
    verwijderen: { roles: ['admin'], readonlyBlokkeert: true },
  },
  projectNotities: {
    maken: { readonlyBlokkeert: true },
    // Eigen notitie, of admin/`projecten_bewerken` (20261002135952). De
    // 'eigen'-helft toetst de service.
    wijzigen: { readonlyBlokkeert: true },
    verwijderen: { readonlyBlokkeert: true },
  },
  pipeline: {
    maken: { permission: 'verkoop', readonlyBlokkeert: true },
    wijzigen: { permission: 'verkoop', readonlyBlokkeert: true },
    // deals_delete vergelijkt profiles.role = 'admin'.
    verwijderen: { roles: ['admin'], readonlyBlokkeert: true },
  },
  offertes: {
    maken: { permission: 'offertes', readonlyBlokkeert: true, limiet: 'offertes' },
    wijzigen: { permission: 'offertes', readonlyBlokkeert: true },
    verwijderen: { permission: 'offertes', readonlyBlokkeert: true },
  },
  // offerte_items: sinds 20261002135952 het recht `offertes`, net als de
  // offerte zelf (voorheen de rol admin/planner).
  offerteRegels: {
    maken: { permission: 'offertes', readonlyBlokkeert: true },
    wijzigen: { permission: 'offertes', readonlyBlokkeert: true },
    verwijderen: { permission: 'offertes', readonlyBlokkeert: true },
  },
  facturen: {
    maken: { permission: 'facturen', readonlyBlokkeert: true, limiet: 'facturen' },
    wijzigen: { permission: 'facturen', readonlyBlokkeert: true },
    verwijderen: { permission: 'facturen', readonlyBlokkeert: true },
    // Betaald zetten loopt via mark_factuur_betaald; ook dat raakt de
    // readonly-trigger (alleen de Stripe-webhook als service_role niet).
    betaaldZetten: { permission: 'facturen', readonlyBlokkeert: true },
  },
  // factuur_regels: insert/update/delete alle drie op het recht `facturen`
  // (live geverifieerd 13-10-2026).
  factuurRegels: {
    maken: { permission: 'facturen', readonlyBlokkeert: true },
    wijzigen: { permission: 'facturen', readonlyBlokkeert: true },
    verwijderen: { permission: 'facturen', readonlyBlokkeert: true },
  },
  kosten: {
    maken: { permission: 'kosten', feature: 'kosten_nacalculatie', readonlyBlokkeert: true },
    wijzigen: { permission: 'kosten', feature: 'kosten_nacalculatie', readonlyBlokkeert: true },
    verwijderen: { permission: 'kosten', feature: 'kosten_nacalculatie', readonlyBlokkeert: true },
  },
  // werkbon_fotos: company + toegang tot de werkbon zelf. De werkbontoegang
  // toetst het scherm al (canEdit op de bon); hier alleen de read-onlygate.
  werkbonFotos: {
    maken: { readonlyBlokkeert: true },
    verwijderen: { readonlyBlokkeert: true },
  },
  team: {
    maken: { roles: ['admin'], readonlyBlokkeert: true, limiet: 'gebruikers' },
    wijzigen: { roles: ['admin'], readonlyBlokkeert: true },
    verwijderen: { roles: ['admin'], readonlyBlokkeert: true },
    // user_permissions heeft een eigen featuregate op ALLE drie de acties
    // (rollen_rechten zit sinds 20261004190000 ook in Groei).
    rechtenWijzigen: { roles: ['admin'], feature: 'rollen_rechten', readonlyBlokkeert: true },
  },
  bedrijfsinstellingen: {
    wijzigen: { roles: ['admin'], readonlyBlokkeert: true },
  },
  integraties: {
    // accounting_connections / google_calendar_connections: koppelen en
    // ontkoppelen is beheer, en het dashboard toont het alleen aan admins.
    wijzigen: { roles: ['admin'], readonlyBlokkeert: true },
  },
};

/** De gate voor één actie, of `null` als de module/actie niet bestaat. */
export function actieGate(module: string, actie: string): ActionGate | null {
  return ACTIES[module]?.[actie] ?? null;
}
