/**
 * Welk thema bij het openen: de opgeslagen keuze van de gebruiker, en anders
 * de systeemvoorkeur. Dezelfde sleutel en regels als `public/thema-start.js`
 * (dat op web het thema al vóór de eerste weergave zet).
 */
export type Thema = 'light' | 'dark';

/**
 * Nieuwe sleutel sinds 22-10: onder `bb.colorMode` stonden ook de standen van de
 * oude themaknop in de kop, waardoor wie daar ooit op tikte nooit op
 * "Zoals het apparaat" kwam. Die oude waarde wordt bij het openen gewist.
 */
export const THEMA_SLEUTEL = 'bb.weergave';
export const OUDE_THEMA_SLEUTEL = 'bb.colorMode';

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


/** De headerknop wisselt tussen licht en donker; dat wordt een eigen keuze. */
export function volgendThema(huidig: Thema): Thema {
  return huidig === 'dark' ? 'light' : 'dark';
}

/** Toegankelijke naam (en tooltip) van de headerknop: wat een tik doet. */
export function themaKnopLabel(huidig: Thema): string {
  return huidig === 'dark' ? 'Lichte modus inschakelen' : 'Donkere modus inschakelen';
}
