export {
  bepaalThema,
  leesVoorkeur,
  THEMA_OPTIES,
  THEMA_SLEUTEL,
  OUDE_THEMA_SLEUTEL,
  themaKnopLabel,
  volgendThema,
  type Thema,
  type ThemaVoorkeur,
} from './themaKeuze.shared';

/**
 * Native: de opgeslagen keuze is pas asynchroon bekend (AsyncStorage); de
 * eerste weergave volgt dan het systeem. Zie themaKeuze.web.ts voor web.
 */
export function leesOpgeslagenThemaDirect(): string | null {
  return null;
}
