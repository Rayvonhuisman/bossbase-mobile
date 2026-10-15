/**
 * Welk thema bij het openen: de opgeslagen keuze van de gebruiker, en anders
 * de systeemvoorkeur. Dezelfde sleutel en regels als `public/thema-start.js`
 * (dat op web het thema al vóór de eerste weergave zet).
 */
export type Thema = 'light' | 'dark';

export const THEMA_SLEUTEL = 'bb.colorMode';

export function bepaalThema(opgeslagen: string | null | undefined, systeem: string | null | undefined): Thema {
  if (opgeslagen === 'light' || opgeslagen === 'dark') return opgeslagen;
  return systeem === 'dark' ? 'dark' : 'light';
}

/** Wat de gebruiker in Instellingen kiest; `systeem` = geen opgeslagen keuze. */
export type ThemaVoorkeur = Thema | 'systeem';

export const THEMA_OPTIES: { id: ThemaVoorkeur; label: string }[] = [
  { id: 'light', label: 'Licht' },
  { id: 'dark', label: 'Donker' },
  { id: 'systeem', label: 'Zoals het apparaat' },
];

export function leesVoorkeur(opgeslagen: string | null | undefined): ThemaVoorkeur {
  return opgeslagen === 'light' || opgeslagen === 'dark' ? opgeslagen : 'systeem';
}

