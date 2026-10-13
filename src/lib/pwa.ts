/**
 * Installeerbare webapp (PWA). Op iOS en Android is er niets te registreren,
 * bij te werken of te installeren: dat doet de App Store of Play Store. De
 * webvariant staat in `pwa.web.ts`.
 */

/**
 * Hoe deze gebruiker de app kan installeren.
 * - `native`: de iOS- of Android-app; niets te doen.
 * - `geinstalleerd`: draait al als geïnstalleerde app.
 * - `prompt`: de browser biedt installeren zelf aan (Chrome, Edge, Android).
 * - `ios`: iPhone of iPad; installeren gaat via Delen → Zet op beginscherm.
 * - `handmatig`: een andere browser; zie de uitleg op /installeren.
 */
export type InstallatieSoort = 'native' | 'geinstalleerd' | 'prompt' | 'ios' | 'handmatig';

/** Voor de juiste uitleg: iPhone en iPad installeren anders dan Android of een computer. */
export type Apparaat = 'iphone' | 'ipad' | 'android' | 'computer';

export type Installatie = {
  soort: InstallatieSoort;
  apparaat: Apparaat;
  /**
   * Op iPhone/iPad: draait dit in Safari? In Chrome, Firefox of de ingebouwde
   * browser van een andere app ontbreekt "Zet op beginscherm" vaak; dan
   * adviseren we Safari. Elders altijd true.
   */
  safari: boolean;
  /** Toont de installatieprompt van de browser. True als iemand installeerde. */
  installeer: () => Promise<boolean>;
};

const NATIVE: Installatie = {
  soort: 'native',
  apparaat: 'iphone',
  safari: true,
  installeer: async () => false,
};

export function registreerServiceWorker(): void {}

export function useNieuweVersie(): boolean {
  return false;
}

export function herlaadNieuweVersie(): void {}

export function useInstallatie(): Installatie {
  return NATIVE;
}
