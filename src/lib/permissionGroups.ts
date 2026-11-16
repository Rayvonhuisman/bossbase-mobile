import type { Permission } from './permissions';
import { tx } from '@/i18n';

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
    get label() { return tx('Klanten & Verkoop'); },
    subs: [
      {
        key: 'klanten_bewerken',
        get label() { return tx('Klanten bewerken'); },
        get kort() { return tx('Klanten aanmaken en gegevens wijzigen'); },
      },
      {
        key: 'klanten_verwijderen',
        get label() { return tx('Klanten verwijderen'); },
        get kort() { return tx('Klanten definitief verwijderen'); },
      },
      {
        key: 'verkoop',
        get label() { return tx('Verkooppijplijn'); },
        get kort() { return tx('Aanvragen en projecten in de pipeline bekijken en beheren'); },
      },
      {
        key: 'contracten',
        get label() { return tx('Contracten'); },
        get kort() { return tx('Onderhoudscontracten, beurten en SLA bekijken en beheren'); },
      },
    ],
  },
  {
    key: 'uitvoering',
    get label() { return tx('Uitvoering'); },
    subs: [
      {
        key: 'projecten',
        get label() { return tx('Projecten'); },
        get kort() { return tx('De Projecten-pagina openen'); },
      },
      {
        key: 'projecten_bewerken',
        get label() { return tx('Projecten bewerken'); },
        get kort() { return tx('Alle projecten aanmaken en bewerken'); },
      },
      {
        key: 'werkbonnen_bewerken',
        get label() { return tx('Werkbonnen bewerken'); },
        get kort() { return tx('Alle werkbonnen bewerken + materiaalkosten'); },
      },
      {
        key: 'planning',
        get label() { return tx('Planning'); },
        get kort() { return tx('Inplannen, weekplanning, agenda van collega’s'); },
      },
      {
        key: 'alles_inzien',
        get label() { return tx('Alle projecten & werkbonnen inzien'); },
        get kort() { return tx('Brede inzage in werk van collega’s'); },
        // WARN_ON_ENABLE in het dashboard.
        waarschuw: true,
      },
      {
        key: 'agenda_inzien',
        get label() { return tx('Elkaars agenda inzien'); },
        get kort() { return tx('Agenda’s van collega’s bekijken'); },
      },
    ],
  },
  {
    key: 'financieel',
    get label() { return tx('Financieel'); },
    subs: [
      {
        key: 'projectbedragen',
        get label() { return tx('Projectbedragen zien'); },
        get kort() { return tx('Bedragen en marges op projecten/werkbonnen'); },
      },
      {
        key: 'bedrijfsfinancien',
        get label() { return tx('Bedrijfsfinanciën zien'); },
        get kort() { return tx('Omzet, winst en marges van het bedrijf'); },
      },
      { key: 'offertes', get label() { return tx('Offertes'); }, get kort() { return tx('Offertes maken, versturen en inzien'); } },
      { key: 'facturen', get label() { return tx('Facturen'); }, get kort() { return tx('Facturen maken, versturen en inzien'); } },
      {
        key: 'inkoopprijzen',
        get label() { return tx('Inkoop- en kostprijzen zien'); },
        get kort() { return tx('Inkoopprijzen, kostprijs per uur, calculatie en nacalculatie'); },
      },
      { key: 'kosten', get label() { return tx('Kosten'); }, get kort() { return tx('Kosten en inkoop registreren en inzien'); } },
    ],
  },
  {
    key: 'beheer',
    get label() { return tx('Beheer'); },
    subs: [
      {
        key: 'team',
        get label() { return tx('Team beheren'); },
        get kort() { return tx('Team-pagina openen (beheer blijft bij admin)'); },
      },
      { key: 'instellingen', get label() { return tx('Instellingen'); }, get kort() { return tx('Bedrijfsinstellingen beheren'); } },
      {
        key: 'database',
        get label() { return tx('Database & Export'); },
        get kort() { return tx('Gegevens bekijken en exporteren naar Excel'); },
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
    get label() { return tx('Kantoor/administratie'); },
    rechten: [
      'klanten_bewerken', 'verkoop', 'agenda_inzien',
      'offertes', 'facturen', 'kosten', 'projectbedragen', 'bedrijfsfinancien',
      'database',
    ],
  },
];
