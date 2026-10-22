import { THEMA_SLEUTEL } from './themaKeuze.shared';

export {
  bepaalThema,
  leesVoorkeur,
  THEMA_OPTIES,
  THEMA_SLEUTEL,
  OUDE_THEMA_SLEUTEL,
  type Thema,
  type ThemaVoorkeur,
} from './themaKeuze.shared';

/**
 * Web: AsyncStorage is hier gewoon localStorage, dus de keuze is synchroon te
 * lezen — de eerste weergave staat meteen in het goede thema, zonder flits.
 */
export function leesOpgeslagenThemaDirect(): string | null {
  try {
    return window.localStorage.getItem(THEMA_SLEUTEL);
  } catch {
    return null;
  }
}
