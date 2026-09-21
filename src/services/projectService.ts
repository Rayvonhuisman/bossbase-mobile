import { supabase } from '@/lib/supabase';
import { getUserId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { isGeldigeDatum } from '@/lib/nlTijd';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';

/**
 * Projecten (`projects`) en projectnotities (`project_notes`).
 *
 * De statuswaarden komen letterlijk uit `PROJECT_STATUS` in
 * `projectsService.js` van het dashboard en zijn gecontroleerd tegen de rijen
 * die er nu in staan (concept, lopend, afgerond). De app had eerder een eigen
 * setje (`in_progress`, `on_hold`, `completed`) dat nergens in de database
 * voorkomt — een filter daarop gaf altijd nul resultaten en een schrijfactie
 * zou een status hebben opgeleverd die het dashboard niet kent.
 *
 * RLS: SELECT is breed (gedeelde werkruimte, `alles_inzien`, of zelf gekoppeld);
 * INSERT/UPDATE vragen `projecten_bewerken`; DELETE vraagt rol admin. Dat
 * `alles_inzien` géén bewerkrecht geeft is precies waarom de knoppen een eigen
 * gate hebben en niet meeliften op de zichtbaarheid.
 */

export const PROJECT_STATUS: Record<string, string> = {
  concept: 'Concept',
  offerte_akkoord: 'Offerte akkoord',
  lopend: 'Lopend',
  wachten_op_klant: 'Wachten op klant',
  te_factureren: 'Te factureren',
  afgerond: 'Afgerond',
  risico: 'Risico',
};

export const PROJECT_STATUS_OPTIES = Object.entries(PROJECT_STATUS).map(([id, label]) => ({
  id,
  label,
}));

export function projectStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Concept';
  return PROJECT_STATUS[status] ?? status;
}

/**
 * `used_hours` staat hier bewust NIET bij: die kolom bestaat niet meer in de
 * live database. PostgREST beantwoordde de hele select daarom met 42703
 * ("column projects.used_hours does not exist") en het projectenscherm bleef
 * leeg met een foutmelding.
 *
 * Het dashboard rekent geschreven uren live uit `werkbon_uren` via de werkbon
 * (`werkbonnen.project_id`) — zie `projectsService.js`, dat dezelfde kolom om
 * dezelfde reden liet vallen. De app doet dat hieronder ook.
 */
const PROJECT_COLUMNS = `
  id, company_id, customer_id, deal_id, offerte_id, name, description, status,
  project_value, quoted_hours, start_date, deadline,
  owner_id, assigned_to, created_at,
  customer:customers ( id, name )
`;

export type ProjectRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  deal_id: string | null;
  offerte_id: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  project_value: number | null;
  quoted_hours: number | null;
  start_date: string | null;
  deadline: string | null;
  owner_id: string | null;
  assigned_to: string | null;
  created_at: string;
  customer: { id: string; name: string | null } | null;
};

export async function listProjects(
  limit = 100,
): Promise<{ data: ProjectRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[projectService.listProjects]', error.message);
    return { data: [], error: 'Projecten konden niet worden geladen.' };
  }
  return { data: (data as unknown as ProjectRow[]) ?? [], error: null };
}

export async function getProject(
  id: string,
): Promise<{ data: ProjectRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('[projectService.getProject]', error.message);
    return { data: null, error: 'Project kon niet worden geladen.' };
  }
  return { data: (data as unknown as ProjectRow | null) ?? null, error: null };
}

export type ProjectInput = {
  name: string;
  description?: string | null;
  status?: string;
  customer_id?: string | null;
  deal_id?: string | null;
  project_value?: number | null;
  quoted_hours?: number | null;
  start_date?: string | null;
  deadline?: string | null;
  assigned_to?: string | null;
};

function valideerProject(input: Partial<ProjectInput>, nieuw: boolean): string | null {
  if ((nieuw || input.name !== undefined) && !input.name?.trim()) {
    return 'Geef het project een naam.';
  }
  if (input.status && !(input.status in PROJECT_STATUS)) {
    return 'Onbekende projectstatus.';
  }
  for (const [veld, label] of [
    ['start_date', 'startdatum'],
    ['deadline', 'deadline'],
  ] as const) {
    const v = input[veld];
    if (v && !isGeldigeDatum(v)) return `Vul een geldige ${label} in (JJJJ-MM-DD).`;
  }
  if (input.start_date && input.deadline && input.deadline < input.start_date) {
    return 'De deadline ligt vóór de startdatum.';
  }
  for (const [veld, label] of [
    ['project_value', 'projectwaarde'],
    ['quoted_hours', 'begrote uren'],
  ] as const) {
    const v = input[veld];
    if (v !== undefined && v !== null && (!Number.isFinite(v) || v < 0)) {
      return `Vul een geldige ${label} in.`;
    }
  }
  return null;
}

function mapProject(input: Partial<ProjectInput>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (input.name !== undefined) p.name = input.name.trim();
  if (input.description !== undefined) p.description = input.description?.trim() || null;
  if (input.status !== undefined) p.status = input.status;
  if (input.customer_id !== undefined) p.customer_id = input.customer_id || null;
  if (input.deal_id !== undefined) p.deal_id = input.deal_id || null;
  if (input.project_value !== undefined) p.project_value = Number(input.project_value ?? 0);
  if (input.quoted_hours !== undefined) p.quoted_hours = Number(input.quoted_hours ?? 0);
  if (input.start_date !== undefined) p.start_date = input.start_date || null;
  if (input.deadline !== undefined) p.deadline = input.deadline || null;
  if (input.assigned_to !== undefined) p.assigned_to = input.assigned_to || null;
  return p;
}

export async function createProject(input: ProjectInput): Promise<WriteResult<ProjectRow>> {
  const fout = valideerProject(input, true);
  if (fout) return writeFout('validatie', fout);

  const basis = mapProject({ status: 'concept', ...input });
  // created_by houdt de audittrail heel — zelfde regel als het dashboard.
  const eigen = getUserId();
  if (eigen) basis.created_by = eigen;
  Object.keys(basis).forEach((k) => basis[k] === null && delete basis[k]);

  const payload = withCompanyId(basis);
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  return schrijf<ProjectRow>(
    () => supabase.from('projects').insert(payload).select(PROJECT_COLUMNS),
    {
      context: 'projectService.createProject',
      bedrijfReadonly: isReadonly(),
      leegMelding:
        'Het project is niet opgeslagen. Je hebt het recht Projecten bewerken nodig om ' +
        'projecten aan te maken.',
    },
  );
}

export async function updateProject(
  id: string,
  input: Partial<ProjectInput>,
): Promise<WriteResult<ProjectRow>> {
  const fout = valideerProject(input, false);
  if (fout) return writeFout('validatie', fout);

  const updates = mapProject(input);
  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

  return schrijf<ProjectRow>(
    () => supabase.from('projects').update(updates).eq('id', id).select(PROJECT_COLUMNS),
    {
      context: 'projectService.updateProject',
      bedrijfReadonly: isReadonly(),
      leegMelding:
        'Er is niets gewijzigd. Je hebt het recht Projecten bewerken nodig, of het project ' +
        'bestaat niet meer.',
    },
  );
}

export async function deleteProject(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('projects').delete().eq('id', id).select('id'),
    {
      context: 'projectService.deleteProject',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'Alleen een beheerder kan een project verwijderen.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ── Projectnotities ────────────────────────────────────────────────────────
//
// Losse tabel `project_notes`, net als in het dashboard. INSERT vraagt alleen
// het bedrijf; wijzigen en verwijderen mag de auteur zelf of een admin/planner.
// Die 'eigen'-helft kan de policy niet uit de UI afleiden, dus tonen we de knop
// op basis van dezelfde regel — de server blijft de autoriteit.

const NOTE_COLUMNS = 'id, company_id, project_id, created_by, note, created_at';

export type ProjectNote = {
  id: string;
  company_id: string;
  project_id: string;
  created_by: string | null;
  note: string;
  created_at: string;
};

export async function listProjectNotes(
  projectId: string,
): Promise<{ data: ProjectNote[]; error: string | null }> {
  const { data, error } = await supabase
    .from('project_notes')
    .select(NOTE_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[projectService.listProjectNotes]', error.message);
    return { data: [], error: 'Projectnotities konden niet worden geladen.' };
  }
  return { data: (data as unknown as ProjectNote[]) ?? [], error: null };
}

export async function addProjectNote(
  projectId: string,
  note: string,
): Promise<WriteResult<ProjectNote>> {
  const tekst = note.trim();
  if (!tekst) return writeFout('validatie', 'Een notitie mag niet leeg zijn.');

  const basis: Record<string, unknown> = { project_id: projectId, note: tekst };
  const eigen = getUserId();
  if (eigen) basis.created_by = eigen;

  const payload = withCompanyId(basis);
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');

  return schrijf<ProjectNote>(
    () => supabase.from('project_notes').insert(payload).select(NOTE_COLUMNS),
    { context: 'projectService.addProjectNote', bedrijfReadonly: isReadonly() },
  );
}

export async function deleteProjectNote(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('project_notes').delete().eq('id', id).select('id'),
    {
      context: 'projectService.deleteProjectNote',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'Je kunt alleen je eigen projectnotities verwijderen.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}
