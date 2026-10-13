/**
 * Werkbonregels (taken, meerwerk, materiaal) toevoegen en verwijderen.
 *
 * Migratie 20261002135952 (dashboard origin/main, "geen plannerrol"):
 * `werkbon_taken_insert`/`_delete` en `werkbon_materialen_delete` volgen
 * dezelfde regel als hun update-policy — gedeelde werkruimte, het recht
 * `werkbonnen_bewerken` (admin telt via bb_has_permission mee) of
 * verantwoordelijke van de bon. Voorheen de rol admin/planner; die rol bestaat
 * niet meer. Het recht `planning` opent de werkbon zelf (werkbonnen_update),
 * maar deze regels niet.
 *
 * Bewust zonder imports, zodat de tests dit rechtstreeks in Node draaien.
 */
export type RegelRechten = {
  userId: string | null;
  role: string | null;
  can: (permission: string) => boolean;
  gedeeldeWerkruimte: boolean;
  readonly: boolean;
};

export function magWerkbonRegelsBeheren(
  workOrder: { verantwoordelijke_ids?: string[] | null; ondertekend_op?: string | null },
  r: RegelRechten,
): boolean {
  if (workOrder.ondertekend_op) return false;
  if (r.readonly) return false;
  if (r.gedeeldeWerkruimte) return true;
  if (r.role === 'admin' || r.can('werkbonnen_bewerken')) return true;
  return !!r.userId && (workOrder.verantwoordelijke_ids ?? []).includes(r.userId);
}
