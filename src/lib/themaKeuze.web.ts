export { bepaalThema, THEMA_SLEUTEL, themaKnopLabel, type Thema } from './themaKeuze.shared';

/**
 * Web: AsyncStorage is hier gewoon localStorage, dus de keuze is synchroon te
 * lezen — de eerste weergave staat meteen in het goede thema, zonder flits.
 */
export function leesOpgeslagenThemaDirect(): string | null {
  try {
    return window.localStorage.getItem('bb.colorMode');
  } catch {
    return null;
  }
}
