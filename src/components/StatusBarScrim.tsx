/**
 * Vroeger een vlak (eerst met verloop) achter de iOS-statusbalk. Dat gaf op de
 * iPhone een witte waas onder het Dynamic Island, over de dag en datum heen.
 * Op verzoek helemaal weg: dit tekent niets meer. De naam en props blijven,
 * zodat de schermen die hem gebruiken niet hoeven te veranderen.
 */
export function StatusBarScrim(_props: { background?: string }) {
  return null;
}
