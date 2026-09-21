/**
 * Een tijdslimiet op een Supabase-query.
 *
 * Waarom dit bestaat: een verzoek dat nooit antwoordt is erger dan een
 * verzoek dat faalt. Bij een weggevallen tunnel, een slapende verbinding in de
 * bus of een backend die blijft hangen, blijft de `await` staan — en daarmee
 * de laadvlag van het scherm. De gebruiker ziet dan een spinner die nooit
 * ophoudt, zonder foutmelding en zonder knop om het opnieuw te proberen.
 *
 * PostgREST-builders van supabase-js accepteren een `AbortSignal`. We geven ze
 * er één met een timer: komt er binnen de limiet geen antwoord, dan breken we
 * af en geven we een gewone foutuitkomst terug — precies de vorm die de rest
 * van de app al verwerkt, dus het scherm toont zijn foutstaat mét
 * opnieuw-proberenknop.
 *
 * De limiet is ruim (15 seconden): een trage 3G-verbinding moet het gewoon
 * halen. Hij is bedoeld tegen "nooit", niet tegen "traag".
 */

export const STANDAARD_TIJDSLIMIET_MS = 15000;

export type TijdslimietFout = {
  code: 'timeout';
  message: string;
  details: null;
  hint: null;
};

/**
 * Voert een query uit met een harde tijdslimiet.
 *
 * De aanroeper krijgt het signaal aangereikt en hangt het zelf aan de query —
 * `abortSignal()` moet namelijk vóór afsluiters als `.maybeSingle()` staan:
 *
 *     metTijdslimiet((signal) =>
 *       supabase.from('werkbonnen').select(KOLOMMEN).abortSignal(signal))
 *
 * Geeft hetzelfde `{ data, error }` terug als de query zelf; bij een
 * overschrijding een `error` met code `timeout`, die `describeError` en
 * `classificeerFout` als netwerkprobleem behandelen.
 */
export async function metTijdslimiet<T extends { data: unknown; error: unknown }>(
  maakQuery: (signal: AbortSignal) => PromiseLike<T>,
  ms: number = STANDAARD_TIJDSLIMIET_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await maakQuery(controller.signal);
  } catch (e) {
    // Een afgebroken fetch komt als exception terug, niet als `{ error }`.
    const afgebroken =
      controller.signal.aborted ||
      (e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message)));
    const fout: TijdslimietFout = {
      code: 'timeout',
      message: afgebroken
        ? `Geen antwoord binnen ${Math.round(ms / 1000)} seconden. Controleer je verbinding.`
        : e instanceof Error
          ? e.message
          : 'Onbekende netwerkfout.',
      details: null,
      hint: null,
    };
    return { data: null, error: fout } as unknown as T;
  } finally {
    clearTimeout(timer);
  }
}
