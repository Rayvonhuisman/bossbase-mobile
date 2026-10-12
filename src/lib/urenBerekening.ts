/**
 * Uren uit begin, eind en pauze — dezelfde rekenregel als het dashboard.
 *
 * Bewust een letterlijke vertaling van `berekenUren` in het dashboard
 * (`src/services/urenService.js`), zodat een uur dat in de app wordt geschreven
 * precies hetzelfde getal oplevert als hetzelfde uur in het dashboard:
 *
 * - totaal = eind − begin − pauze;
 * - afgerond op twee decimalen (20 minuten = 0,33, niet 0,3333…);
 * - `null` als een tijd ontbreekt of ongeldig is, of als er na de pauze niets
 *   overblijft — dan is de invoer niet kloppend te maken, en hoort het scherm
 *   dat te zeggen in plaats van 0 op te slaan.
 *
 * Tijden mogen `HH:MM` of `HH:MM:SS` zijn (de database levert het laatste).
 */
export function berekenUren(
  startTijd: string | null | undefined,
  eindTijd: string | null | undefined,
  pauzeMinuten: number | string | null | undefined = 0,
): number | null {
  if (!startTijd || !eindTijd) return null;
  const [sh, sm] = String(startTijd).split(':').map(Number);
  const [eh, em] = String(eindTijd).split(':').map(Number);
  if ([sh, sm, eh, em].some((v) => v === undefined || Number.isNaN(v))) return null;
  const pauze = Math.max(0, Number(pauzeMinuten) || 0);
  const verschil = eh! * 60 + em! - (sh! * 60 + sm!) - pauze;
  if (verschil <= 0) return null;
  return rondUrenAf(verschil / 60);
}

/** Twee decimalen, zoals het dashboard uren opslaat. */
export function rondUrenAf(uren: number): number {
  return Math.round(uren * 100) / 100;
}
