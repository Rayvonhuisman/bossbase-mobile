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

/** Toegankelijke naam van de themaknop: wat een tik doet. */
export function themaKnopLabel(huidig: Thema): string {
  return huidig === 'dark' ? 'Lichte modus inschakelen' : 'Donkere modus inschakelen';
}

