import type { PostgrestError } from '@supabase/supabase-js';
import { isNetwerkfout } from './netwerkfout';

/**
 * Eén schrijfpad voor de hele app.
 *
 * De aanleiding: een RLS-policy die een rij weigert geeft geen fout. Postgres
 * laat de rij simpelweg buiten de policy vallen, PostgREST geeft `[]` terug en
 * `error` blijft null. Wie dan op `!error` afgaat, meldt "opgeslagen" terwijl er
 * niets is opgeslagen. Dat is precies de melding die niemand controleert.
 *
 * Daarom geeft elke schrijfactie hier een `WriteResult` terug, en is dat het
 * enige toegestane resultaat van een insert/update/delete:
 *
 *   ok            — de server heeft de rij teruggegeven; er is écht geschreven
 *   geen-rechten  — 42501 / lege update: de policy liet het niet toe
 *   readonly      — abonnement verlopen, betaling mislukt of opgezegd
 *   plan-limiet   — binnen het pakket zit deze rij er niet meer bij
 *   op-slot       — het record ligt vast (verstuurde offerte/factuur)
 *   validatie     — check/not-null/unique-constraint, of onze eigen voorcontrole
 *   conflict      — foreign key: er hangt nog iets aan
 *   niet-gevonden — de rij bestaat niet (meer)
 *   netwerk       — geen verbinding
 *   onbekend      — al het overige
 *
 * Alles behalve `ok` is een mislukking en moet als zodanig op het scherm komen.
 */

export type WriteFoutSoort =
  | 'geen-rechten'
  | 'readonly'
  | 'plan-limiet'
  | 'op-slot'
  | 'validatie'
  | 'conflict'
  | 'niet-gevonden'
  | 'netwerk'
  | 'onbekend';

export type WriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; soort: WriteFoutSoort; melding: string; technisch?: string };

/** Kortweg: gelukt of niet, zonder data. */
export type WriteStatus = WriteResult<null>;

const MELDINGEN: Record<WriteFoutSoort, string> = {
  'geen-rechten': 'Je hebt geen rechten voor deze actie.',
  readonly:
    'Je account staat op alleen-lezen. Bekijken kan gewoon; nieuw werk vastleggen kan weer zodra je abonnement loopt.',
  'plan-limiet': 'Dit past niet binnen je huidige abonnement. Kijk bij Instellingen → Abonnement.',
  'op-slot': 'Dit record ligt vast en kan niet meer gewijzigd worden.',
  validatie: 'Niet alle gegevens zijn geldig. Controleer het formulier.',
  conflict: 'Er hangt nog iets aan dit record. Verwijder dat eerst.',
  'niet-gevonden': 'Dit record bestaat niet meer. Ververs het scherm.',
  netwerk: 'Geen verbinding met de server. Controleer je internet.',
  onbekend: 'Er ging iets mis. Probeer het opnieuw.',
};

export function writeFout(
  soort: WriteFoutSoort,
  melding?: string,
  technisch?: string,
): { ok: false; soort: WriteFoutSoort; melding: string; technisch?: string } {
  return { ok: false, soort, melding: melding ?? MELDINGEN[soort], technisch };
}

export function writeOk<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

/**
 * Classificeert een PostgREST-fout.
 *
 * `bedrijfReadonly` komt uit `get_plan_status().readonly`. Zonder die context is
 * 42501 niet te onderscheiden van een bereikte plan-limiet of een gewone
 * rechtenweigering — precies de waarschuwing die in `readonly.js` van het
 * dashboard staat. Wie hem wél meegeeft, krijgt de juiste tekst.
 */
export function classificeerFout(
  error: PostgrestError | { message?: string; code?: string; details?: string; hint?: string },
  context: string,
  bedrijfReadonly = false,
): { ok: false; soort: WriteFoutSoort; melding: string; technisch?: string } {
  const code = error.code ?? '';
  const message = error.message ?? '';
  const details = 'details' in error ? (error.details ?? '') : '';
  const hint = 'hint' in error ? (error.hint ?? '') : '';
  const alles = `${message} ${details} ${hint}`.toLowerCase();

  if (__DEV__) console.warn(`[${context}]`, { code, message, details, hint });

  const technisch = `${code} ${message}`.trim();

  // De trigger van het dashboard zet 'readonly' letterlijk in de HINT.
  if (alles.includes('readonly')) return writeFout('readonly', undefined, technisch);

  // PostgREST vertaalt een lege timeout/offline anders per platform.
  if (isNetwerkfout(alles) || code === 'ECONNABORTED') {
    return writeFout('netwerk', undefined, technisch);
  }

  if (alles.includes('jwt') || alles.includes('token is expired')) {
    return writeFout('geen-rechten', 'Je sessie is verlopen. Log opnieuw in.', technisch);
  }

  // 42501 / de RLS-melding. Welke gate hem tegenhield staat er niet bij, dus
  // gebruiken we wat we wél weten: staat het bedrijf op read-only, dan is dát
  // de reden; anders is het een rechten- of limietweigering.
  if (
    code === '42501' ||
    code === 'PGRST301' ||
    alles.includes('row-level security') ||
    alles.includes('row level security')
  ) {
    if (bedrijfReadonly) return writeFout('readonly', undefined, technisch);
    return writeFout('geen-rechten', undefined, technisch);
  }

  // Geen rij teruggekregen waar er één werd verwacht.
  if (code === 'PGRST116') return writeFout('niet-gevonden', undefined, technisch);

  if (code === '23505') {
    return writeFout('validatie', 'Dit bestaat al. Kies een andere waarde.', technisch);
  }
  if (code === '23503') return writeFout('conflict', undefined, technisch);
  if (code === '23502') {
    return writeFout('validatie', 'Er ontbreekt een verplicht veld.', technisch);
  }
  if (code === '23514') return writeFout('validatie', undefined, technisch);

  // Kolom of tabel onbekend: de app loopt achter op de database.
  if (code === '42703' || code === '42P01' || code === 'PGRST204') {
    return writeFout(
      'onbekend',
      'De app moet worden bijgewerkt. Neem contact op met je beheerder.',
      technisch,
    );
  }

  return writeFout('onbekend', undefined, technisch);
}

/**
 * Voert een insert/update/delete uit en controleert dat er écht iets is geraakt.
 *
 * `run` moet een PostgREST-aanroep zijn die de geschreven rijen teruggeeft
 * (`.select(...)`). Komt er een lege lijst terug zonder fout, dan heeft de
 * policy de rij geweigerd of bestaat hij niet meer — allebei een mislukking.
 */
export async function schrijf<T>(
  run: () => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  opties: {
    context: string;
    bedrijfReadonly?: boolean;
    /** Wat er staat als er nul rijen zijn geraakt. */
    leegSoort?: WriteFoutSoort;
    leegMelding?: string;
  },
): Promise<WriteResult<T>> {
  let res: { data: T[] | null; error: PostgrestError | null };
  try {
    res = await run();
  } catch (e) {
    return classificeerFout(
      { message: e instanceof Error ? e.message : String(e) },
      opties.context,
      opties.bedrijfReadonly,
    );
  }

  if (res.error) {
    return classificeerFout(res.error, opties.context, opties.bedrijfReadonly);
  }

  const rijen = res.data ?? [];
  const eerste = rijen[0];
  if (eerste === undefined) {
    // Dit is de stille weigering. Nooit als succes tonen.
    if (__DEV__) {
      console.warn(`[${opties.context}] nul rijen geraakt — RLS-weigering of rij bestaat niet meer`);
    }
    return writeFout(
      opties.leegSoort ?? (opties.bedrijfReadonly ? 'readonly' : 'geen-rechten'),
      opties.leegMelding ??
        (opties.bedrijfReadonly
          ? undefined
          : 'Er is niets opgeslagen: je hebt hier geen rechten voor, of het record bestaat niet meer.'),
    );
  }

  return writeOk(eerste);
}

/** Zoals `schrijf`, maar voor een actie die geen rij teruggeeft (pure delete). */
export async function schrijfLeeg(
  run: () => PromiseLike<{ error: PostgrestError | null }>,
  opties: { context: string; bedrijfReadonly?: boolean },
): Promise<WriteStatus> {
  try {
    const { error } = await run();
    if (error) return classificeerFout(error, opties.context, opties.bedrijfReadonly);
    return writeOk(null);
  } catch (e) {
    return classificeerFout(
      { message: e instanceof Error ? e.message : String(e) },
      opties.context,
      opties.bedrijfReadonly,
    );
  }
}
