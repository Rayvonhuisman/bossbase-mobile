import { supabase } from '@/lib/supabase';
import { getUserId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';

/**
 * Klantnotities — rijen in `klant_tijdlijn` met `type = 'notitie_toegevoegd'`.
 *
 * ── Waarom niet meer `notes` ────────────────────────────────────────────────
 * De app las `public.notes`. Die tabel bestaat niet meer: het dashboard heeft
 * hem opgeruimd (migratie `20260915120500_notes_opruimen`, nadat dealnotities
 * naar `deal_notities` verhuisden). PostgREST antwoordde daarom op élke
 * aanroep met PGRST205 — "Could not find the table 'public.notes'" — en het
 * notitiescherm bleef leeg met een foutmelding.
 *
 * Notities hangen sindsdien altijd aan iets: een deal (`deal_notities`), een
 * project (`project_notes`), een werkbon (`werkbon_notities`) of een klant. Die
 * laatste is de tijdlijn: het dashboard schrijft klantnotities als een
 * tijdlijnregel van het type `notitie_toegevoegd` (zie `klantTijdlijnService.js`
 * → `getKlantNotities`/`addKlantNotitie`) en toont ze op de klantkaart. De app
 * doet nu hetzelfde, op dezelfde tabel, met hetzelfde type.
 *
 * Twee gevolgen die het scherm moet respecteren:
 *   1. `customer_id` is NOT NULL. Een notitie zonder klant kan niet meer.
 *   2. De tekst wordt in het dashboard als (gesaneerde) HTML opgeslagen. De app
 *      schrijft platte tekst met ge-escapete tekens, en leest HTML terug als
 *      platte tekst — zo blijft een notitie van beide kanten leesbaar.
 *
 * RLS (`032_klant_tijdlijn`): FOR ALL voor leden van hetzelfde bedrijf. Er is
 * geen aparte rechtgate; tenant-isolatie loopt via `company_id`.
 */

const NOTITIE_TYPE = 'notitie_toegevoegd';

const NOTE_COLUMNS = `
  id, company_id, customer_id, type, omschrijving, aangemaakt_op, created_by,
  customer:customers ( id, name ),
  auteur:profiles ( id, full_name )
`;

type NoteDbRow = {
  id: string;
  company_id: string | null;
  customer_id: string;
  type: string;
  omschrijving: string | null;
  aangemaakt_op: string;
  created_by: string | null;
  customer: { id: string; name: string | null } | null;
  auteur: { id: string; full_name: string | null } | null;
};

export type NoteRow = {
  id: string;
  company_id: string | null;
  customer_id: string;
  /** De tekst, als platte tekst. In de database staat HTML (zie hierboven). */
  body: string;
  created_at: string;
  created_by: string | null;
  /** Naam van de schrijver, uit de profielrelatie. Leeg als die ontbreekt. */
  auteurNaam: string;
  customer: { id: string; name: string | null } | null;
};

/** HTML uit het dashboard → leesbare platte tekst. */
function naarPlatteTekst(html: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Platte tekst → veilige HTML, zodat het dashboard hem ongeschonden toont. */
function naarHtml(tekst: string): string {
  return tekst
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

const toNote = (row: NoteDbRow): NoteRow => ({
  id: row.id,
  company_id: row.company_id,
  customer_id: row.customer_id,
  body: naarPlatteTekst(row.omschrijving),
  created_at: row.aangemaakt_op,
  created_by: row.created_by,
  auteurNaam: row.auteur?.full_name ?? '',
  customer: row.customer,
});

export async function listNotes(options?: {
  customerId?: string | null;
  limit?: number;
}): Promise<{ data: NoteRow[]; error: string | null }> {
  let query = supabase
    .from('klant_tijdlijn')
    .select(NOTE_COLUMNS)
    .eq('type', NOTITIE_TYPE)
    .order('aangemaakt_op', { ascending: false })
    .limit(options?.limit ?? 100);

  if (options?.customerId) query = query.eq('customer_id', options.customerId);

  const { data, error } = await query;
  if (error) {
    console.warn('[noteService.listNotes]', error.message);
    return { data: [], error: 'Notities konden niet worden geladen.' };
  }
  return { data: ((data as unknown as NoteDbRow[]) ?? []).map(toNote), error: null };
}

export async function getNote(id: string): Promise<{ data: NoteRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('klant_tijdlijn')
    .select(NOTE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('[noteService.getNote]', error.message);
    return { data: null, error: 'Notitie kon niet worden geladen.' };
  }
  return { data: data ? toNote(data as unknown as NoteDbRow) : null, error: null };
}

export type NoteInput = {
  body: string;
  /** Verplicht: de tijdlijn hangt altijd aan een klant (`customer_id` NOT NULL). */
  customer_id: string;
};

function valideer(input: NoteInput): string | null {
  if (!input.customer_id) return 'Kies een klant; een notitie hangt altijd aan een klant.';
  if (!input.body.trim()) return 'Een notitie mag niet leeg zijn.';
  return null;
}

export async function createNote(input: NoteInput): Promise<WriteResult<NoteRow>> {
  const fout = valideer(input);
  if (fout) return writeFout('validatie', fout);

  const userId = getUserId();
  const payload = withCompanyId({
    customer_id: input.customer_id,
    type: NOTITIE_TYPE,
    omschrijving: naarHtml(input.body),
    aangemaakt_op: new Date().toISOString(),
    // Net als het dashboard: expliciet meegeven wie het schreef. De kolom heeft
    // ook een default (`auth.uid()`), maar dan staat het nergens zwart op wit.
    ...(userId ? { created_by: userId } : {}),
  });
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  const res = await schrijf<NoteDbRow>(
    () => supabase.from('klant_tijdlijn').insert(payload).select(NOTE_COLUMNS),
    { context: 'noteService.createNote', bedrijfReadonly: isReadonly() },
  );
  return res.ok ? { ok: true, data: toNote(res.data) } : res;
}

export async function updateNote(
  id: string,
  input: Partial<NoteInput>,
): Promise<WriteResult<NoteRow>> {
  const updates: Record<string, unknown> = {};
  if (input.body !== undefined) {
    if (!input.body.trim()) return writeFout('validatie', 'Een notitie mag niet leeg zijn.');
    updates.omschrijving = naarHtml(input.body);
  }
  if (input.customer_id !== undefined) updates.customer_id = input.customer_id;
  if (Object.keys(updates).length === 0) {
    return writeFout('validatie', 'Er is niets gewijzigd.');
  }

  const res = await schrijf<NoteDbRow>(
    () =>
      supabase
        .from('klant_tijdlijn')
        .update(updates)
        .eq('id', id)
        .eq('type', NOTITIE_TYPE)
        .select(NOTE_COLUMNS),
    { context: 'noteService.updateNote', bedrijfReadonly: isReadonly() },
  );
  return res.ok ? { ok: true, data: toNote(res.data) } : res;
}

/**
 * Verwijdert een notitie. `.eq('type', …)` erbij zodat een verkeerde id nooit
 * een gewone tijdlijnregel (offerte aangemaakt, factuur betaald) kan wissen, en
 * `.select('id')` zodat een geweigerde of al verdwenen rij als mislukking
 * terugkomt in plaats van als stille "gelukt".
 */
export async function deleteNote(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () =>
      supabase
        .from('klant_tijdlijn')
        .delete()
        .eq('id', id)
        .eq('type', NOTITIE_TYPE)
        .select('id'),
    {
      context: 'noteService.deleteNote',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'niet-gevonden',
      leegMelding: 'Deze notitie is al verwijderd of je hebt er geen rechten voor.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}
