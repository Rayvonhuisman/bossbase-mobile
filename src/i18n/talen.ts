// De talen van BossBase. Nederlands is de brontaal: alle tekst in de code is
// Nederlands, en een ontbrekende vertaling valt terug op het Nederlands.
// Zelfde lijst als de check op profiles.taal (migratie 20261118140000) en als
// src/i18n/talen.js in het dashboard.
export type Taal = 'nl' | 'en' | 'de' | 'fr' | 'es' | 'pt' | 'pl' | 'ro' | 'bg' | 'uk' | 'tr';

export const TALEN: { code: Taal; naam: string; locale: string }[] = [
  { code: 'nl', naam: 'Nederlands', locale: 'nl-NL' },
  { code: 'en', naam: 'English', locale: 'en-GB' },
  { code: 'de', naam: 'Deutsch', locale: 'de-DE' },
  { code: 'fr', naam: 'Français', locale: 'fr-FR' },
  { code: 'es', naam: 'Español', locale: 'es-ES' },
  { code: 'pt', naam: 'Português', locale: 'pt-PT' },
  { code: 'pl', naam: 'Polski', locale: 'pl-PL' },
  { code: 'ro', naam: 'Română', locale: 'ro-RO' },
  { code: 'bg', naam: 'Български', locale: 'bg-BG' },
  { code: 'uk', naam: 'Українська', locale: 'uk-UA' },
  { code: 'tr', naam: 'Türkçe', locale: 'tr-TR' },
];

export const isTaal = (x: unknown): x is Taal => TALEN.some(l => l.code === x);
