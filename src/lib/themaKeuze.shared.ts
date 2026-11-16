/**
 * Welk thema bij het openen: de opgeslagen keuze van de gebruiker, en anders
 * de systeemvoorkeur. Dezelfde sleutel en regels als `public/thema-start.js`
 * (dat op web het thema al vóór de eerste weergave zet).
 */
import { tx } from '@/i18n';

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
  { id: 'light', get label() { return tx('Licht'); } },
  { id: 'dark', get label() { return tx('Donker'); } },
  { id: 'systeem', get label() { return tx('Zoals het apparaat'); } },
];

export function leesVoorkeur(opgeslagen: string | null | undefined): ThemaVoorkeur {
  return opgeslagen === 'light' || opgeslagen === 'dark' ? opgeslagen : 'systeem';
}

