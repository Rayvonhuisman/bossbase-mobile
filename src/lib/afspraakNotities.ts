/**
 * Het notitielog van een agenda-afspraak: `calendar_events.comments`, een
 * jsonb-lijst (oplopend) van `{ id, userId, name, text, at }` — precies wat
 * `CalendarEventDetailDrawer` in het dashboard opslaat. Het log toont de
 * nieuwste bovenaan, net als de klantkaart.
 *
 * Geen imports: draait in de Node-tests.
 */

export type AfspraakNotitie = {
  id: string;
  userId: string | null;
  name: string;
  text: string;
  at: string;
};

/** Leest wat er in de kolom staat; onbekende of kapotte regels vallen weg. */
export function leesAfspraakNotities(waarde: unknown): AfspraakNotitie[] {
  if (!Array.isArray(waarde)) return [];
  return waarde
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      id: String(x.id ?? ''),
      userId: typeof x.userId === 'string' ? x.userId : null,
      name: typeof x.name === 'string' && x.name ? x.name : 'Onbekend',
      text: typeof x.text === 'string' ? x.text : '',
      at: typeof x.at === 'string' ? x.at : '',
    }))
    .filter((x) => x.id && x.text);
}

/** Een nieuwe regel, zoals `handlePostComment`. */
export function nieuweAfspraakNotitie(o: {
  id: string;
  userId: string | null;
  naam: string | null;
  tekst: string;
  nu: Date;
}): AfspraakNotitie {
  return { id: o.id, userId: o.userId, name: o.naam || 'Onbekend', text: o.tekst, at: o.nu.toISOString() };
}

/** Voor het scherm: nieuwste eerst. */
export function nieuwsteEerst(notities: readonly AfspraakNotitie[]): AfspraakNotitie[] {
  return [...notities].reverse();
}
