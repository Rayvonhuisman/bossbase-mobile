import type { Permission } from './permissions';

/**
 * De rechtenmatrix zoals het teamscherm hem toont — één op één overgenomen uit
 * `src/config/permissions.js` op origin/main van het dashboard.
 *
 * De groepen zijn puur UI: alleen de subrecht-sleutels leven in
 * `user_permissions`. De korte regels komen letterlijk uit het dashboard, zodat
 * een beheerder op zijn telefoon dezelfde uitleg leest als op kantoor — en niet
 * een mobiele parafrase die net iets anders belooft.
 */

export type PermissionSub = {
  key: Permission;
  label: string;
  /** Korte, scanbare regel onder het recht. */
  kort: string;
  /** Brede inzage: vraagt om een expliciete bevestiging bij aanzetten. */
  waarschuw?: boolean;
};

export type PermissionGroep = {
  key: string;
  label: string;
  subs: PermissionSub[];
};

export const PERMISSION_GROEPEN: PermissionGroep[] = [
  {
    key: 'klanten_verkoop',
    label: 'Klanten & Verkoop',
    subs: [
      {
        key: 'klanten_bewerken',
        label: 'Klanten bewerken',
        kort: 'Klanten aanmaken en gegevens wijzigen',
      },
      {
        key: 'klanten_verwijderen',
        label: 'Klanten verwijderen',
        kort: 'Klanten definitief verwijderen',
      },
      {
        key: 'verkoop',
        label: 'Verkooppijplijn',
        kort: 'Aanvragen en projecten in de pipeline bekijken en beheren',
      },
    ],
  },
  {
    key: 'uitvoering',
    label: 'Uitvoering',
    subs: [
      {
        key: 'projecten',
        label: 'Projecten',
        kort: 'De Projecten-pagina openen',
      },
      {
        key: 'projecten_bewerken',
        label: 'Projecten bewerken',
        kort: 'Alle projecten aanmaken en bewerken',
      },
      {
        key: 'werkbonnen_bewerken',
        label: 'Werkbonnen bewerken',
        kort: 'Alle werkbonnen bewerken + materiaalkosten',
      },
      {
        key: 'planning',
        label: 'Planning',
        kort: 'Inplannen, weekplanning, agenda van collega’s',
      },
      {
        key: 'alles_inzien',
        label: 'Alle projecten & werkbonnen inzien',
        kort: 'Brede inzage in werk van collega’s',
        // WARN_ON_ENABLE in het dashboard.
        waarschuw: true,
      },
      {
        key: 'agenda_inzien',
        label: 'Elkaars agenda inzien',
        kort: 'Agenda’s van collega’s bekijken',
      },
    ],
  },
  {
    key: 'financieel',
    label: 'Financieel',
    subs: [
      {
        key: 'projectbedragen',
        label: 'Projectbedragen zien',
        kort: 'Bedragen en marges op projecten/werkbonnen',
      },
      {
        key: 'bedrijfsfinancien',
        label: 'Bedrijfsfinanciën zien',
        kort: 'Omzet, winst en marges van het bedrijf',
      },
      { key: 'offertes', label: 'Offertes', kort: 'Offertes maken, versturen en inzien' },
      { key: 'facturen', label: 'Facturen', kort: 'Facturen maken, versturen en inzien' },
      {
        key: 'inkoopprijzen',
        label: 'Inkoopprijzen zien',
        kort: 'Inkoopprijs en marge op materialen',
      },
      { key: 'kosten', label: 'Kosten', kort: 'Kosten en inkoop registreren en inzien' },
    ],
  },
  {
    key: 'beheer',
    label: 'Beheer',
    subs: [
      {
        key: 'team',
        label: 'Team beheren',
        kort: 'Team-pagina openen (beheer blijft bij admin)',
      },
      { key: 'instellingen', label: 'Instellingen', kort: 'Bedrijfsinstellingen beheren' },
      {
        key: 'database',
        label: 'Database & Export',
        kort: 'Gegevens bekijken en exporteren naar Excel',
      },
    ],
  },
];

export const ALLE_PERMISSION_KEYS: Permission[] = PERMISSION_GROEPEN.flatMap((g) =>
  g.subs.map((s) => s.key),
);

/**
 * Voorinstellingen in "Rechten instellen": één tik zet precies deze rechten aan
 * (de rest uit); daarna is elk recht nog los aan te passen. Zelfde lijst als
 * `RECHTENSETS` in `src/config/permissions.js` van het dashboard (G-31).
 */
export type Rechtenset = { key: string; label: string; rechten: Permission[] };

export const RECHTENSETS: Rechtenset[] = [
  {
    key: 'kantoor',
    label: 'Kantoor/administratie',
    rechten: [
      'klanten_bewerken', 'verkoop', 'agenda_inzien',
      'offertes', 'facturen', 'kosten', 'projectbedragen', 'bedrijfsfinancien',
      'database',
    ],
  },
];
