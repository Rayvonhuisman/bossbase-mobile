/**
 * Is dit de melding van een verzoek dat het netwerk niet haalde?
 *
 * Elke omgeving formuleert dat anders, en Supabase geeft de tekst van `fetch`
 * gewoon door:
 * - React Native: "Network request failed"
 * - Chrome en Edge: "Failed to fetch"
 * - Firefox: "NetworkError when attempting to fetch resource."
 * - Safari (ook de geïnstalleerde app op iPhone): "Load failed", of
 *   "The network connection was lost." / "The Internet connection appears to
 *   be offline."
 *
 * Zonder de Safari-varianten krijgt een iPhone zonder bereik "Er ging iets
 * mis" te zien in plaats van "Geen verbinding".
 */
const NETWERKFOUTEN = [
  'failed to fetch',
  'network request failed',
  'networkerror',
  'load failed',
  'network connection was lost',
  'appears to be offline',
];

export function isNetwerkfout(tekst: string | null | undefined): boolean {
  if (!tekst) return false;
  const lower = tekst.toLowerCase();
  return NETWERKFOUTEN.some((t) => lower.includes(t));
}
