/**
 * Pure regels voor de iOS- en Android-app (geen React Native-imports, zodat
 * ze rechtstreeks in de Node-tests draaien).
 */

/**
 * Stil verversen als de app weer 'active' wordt? Web: altijd (het tabblad of
 * de geïnstalleerde app komt weer in beeld). Native: alleen na een echte
 * terugkeer uit de achtergrond — niet na een kort 'inactive' door Face ID,
 * een systeemmelding of het Bedieningspaneel.
 */
export function moetVerversenBijActief(platform: string, vorige: string | null | undefined): boolean {
  if (platform === 'web') return true;
  return vorige === 'background';
}

/**
 * Hoeveel ruimte een vlak onderaan moet vrijhouden voor het toetsenbord.
 *
 * Alles in venstercoördinaten: `boven` en `hoogte` van het vlak (uit
 * `measureInWindow`), `toetsenbordBoven` = `endCoordinates.screenY`. Dat is
 * het verschil met `KeyboardAvoidingView`, die de positie van het vlak ten
 * opzichte van zijn ouder neemt: in een pageSheet/formSheet (iPhone: het vel
 * begint onder de statusbalk; iPad: een gecentreerd vel) rekent die daardoor
 * te weinig ruimte en valt de onderkant (de opslaanknop) onder het toetsenbord.
 *
 * `toetsenbordBoven` 0 komt voor bij "Voorkeur voor overvloeien": dan geen
 * verschuiving (zelfde regel als React Native).
 */
export function toetsenbordRuimte(boven: number, hoogte: number, toetsenbordBoven: number): number {
  if (!Number.isFinite(boven) || !Number.isFinite(hoogte) || !Number.isFinite(toetsenbordBoven)) return 0;
  if (toetsenbordBoven <= 0) return 0;
  return Math.max(0, Math.round(boven + hoogte - toetsenbordBoven));
}
