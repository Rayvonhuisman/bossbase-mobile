/**
 * De cijfers van de dashboard-tegels die de homepage van de app overneemt
 * (`WidgetCard.jsx` in het dashboard). Pure functies, zonder imports, zodat ze
 * in Node te testen zijn.
 *
 *   open_pipeline_value  som dealwaarde, `deals.status = 'open'` en niet voltooid
 *                        (`afgerond_op` leeg; dashboard origin/main WidgetCard)
 *   accepted_value       som dealwaarde, `deals.status = 'won'`
 *   new_leads            deals in de eerste pipelinefase (laagste positie)
 *   open_offertes        offertes met status concept of verzonden, som incl. btw
 *   open_facturen        status niet betaald/concept/aangemaakt, zonder
 *                        creditfacturen en gecrediteerde facturen; "te laat"
 *                        als de vervaldatum vóór vandaag ligt
 *   revenue_month        som excl. btw van niet-concept facturen met
 *                        factuurdatum in deze maand
 */

export type DealKern = {
  status: string | null;
  stage_id: string | null;
  expected_revenue: number | null;
  final_revenue: number | null;
  /** Voltooid project: staat niet meer op het bord en telt niet als open. */
  afgerond_op?: string | null;
};

export type FaseKern = { id: string; position: number | null };

export type OfferteKern = { status: string | null; totaal_incl: number | null };

export type FactuurKern = {
  status: string | null;
  totaal_incl: number | null;
  totaal_excl: number | null;
  factuurdatum: string | null;
  vervaldatum: string | null;
  is_credit: boolean | null;
  gecrediteerd: boolean | null;
};

/** Waarde van een deal zoals het dashboard hem leest: verwacht, anders definitief. */
export function dealWaarde(d: DealKern): number {
  const v = Number(d.expected_revenue ?? d.final_revenue ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** `dealStatus` uit het dashboard: de kolom is leidend, onbekend telt als open. */
export function dealStatus(d: DealKern): 'open' | 'won' | 'lost' {
  const s = String(d.status ?? '').toLowerCase();
  if (s === 'won' || s === 'lost') return s;
  return 'open';
}

export function pipelineWaarden(deals: DealKern[]): {
  open: { aantal: number; waarde: number };
  geaccepteerd: { aantal: number; waarde: number };
} {
  // Een voltooid project (afgerond_op) staat niet meer op het pipelinebord en
  // telt dus ook niet als open, ook al is de status nog 'open' (dashboard 4-10).
  const open = deals.filter((d) => dealStatus(d) === 'open' && !d.afgerond_op);
  const won = deals.filter((d) => dealStatus(d) === 'won');
  const som = (r: DealKern[]) => r.reduce((s, d) => s + dealWaarde(d), 0);
  return {
    open: { aantal: open.length, waarde: som(open) },
    geaccepteerd: { aantal: won.length, waarde: som(won) },
  };
}

export function eersteFaseId(fases: FaseKern[]): string | null {
  if (fases.length === 0) return null;
  const gesorteerd = [...fases].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return gesorteerd[0]?.id ?? null;
}

export function nieuweAanvragen(
  deals: DealKern[],
  fases: FaseKern[],
): { aantal: number; waarde: number } {
  const eerste = eersteFaseId(fases);
  if (!eerste) return { aantal: 0, waarde: 0 };
  const rijen = deals.filter((d) => d.stage_id === eerste);
  return { aantal: rijen.length, waarde: rijen.reduce((s, d) => s + dealWaarde(d), 0) };
}

export function openOffertes(offertes: OfferteKern[]): { aantal: number; waarde: number } {
  const open = offertes.filter((o) => o.status === 'concept' || o.status === 'verzonden');
  return {
    aantal: open.length,
    waarde: open.reduce((s, o) => s + (Number(o.totaal_incl) || 0), 0),
  };
}

const isEchteFactuur = (f: FactuurKern) => !f.is_credit && !f.gecrediteerd;

export function openFacturen(
  facturen: FactuurKern[],
  vandaag: string,
): { aantal: number; waarde: number; teLaat: number } {
  const open = facturen
    .filter((f) => f.status && !['betaald', 'concept', 'aangemaakt'].includes(f.status))
    .filter(isEchteFactuur);
  return {
    aantal: open.length,
    waarde: open.reduce((s, f) => s + (Number(f.totaal_incl) || 0), 0),
    teLaat: open.filter((f) => !!f.vervaldatum && f.vervaldatum < vandaag).length,
  };
}

/** `vandaag` = YYYY-MM-DD; de maand is het voorvoegsel YYYY-MM. */
export function omzetDezeMaand(facturen: FactuurKern[], vandaag: string): number {
  const maand = vandaag.slice(0, 7);
  return facturen
    .filter((f) => f.status !== 'concept')
    .filter((f) => (f.factuurdatum ?? '').slice(0, 7) === maand)
    .reduce((s, f) => s + (Number(f.totaal_excl) || 0), 0);
}
