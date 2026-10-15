import { supabase } from '@/lib/supabase';
import { isReadonly, withCompanyId } from '@/lib/sessionContext';
import { haalInStukken } from '@/lib/inStukken';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import { naarProjectKost, type ProjectJobCost, type ProjectKost } from '@/lib/projectKostenLogica';

/**
 * De bronnen van de Kosten-tab op de projectkaart — `projectKostenService.js`
 * en `getProjectCosts` (`jobCostService.js`) van het dashboard.
 *
 * `project_kosten` (inkopen): RLS vraagt het recht `kosten` voor alles, plus
 * de feature `kosten_nacalculatie` en de read-onlygate bij een insert. Ze
 * tellen mee in de marge en gaan NIET naar de boekhouding.
 *
 * `job_costs` rond het project: de rijen van het project zelf én die van zijn
 * werkbonnen. De inkoopprijs komt mee via de materiaalregel; die tabel heeft
 * eigen RLS (`inkoopprijzen`), zonder dat recht blijft hij leeg en valt de
 * berekening terug op de verkoopprijs.
 */

const rond = (n: number) => Math.round(n * 100) / 100;

export async function listProjectKosten(
  projectId: string,
): Promise<{ data: ProjectKost[]; error: string | null }> {
  const { data, error } = await supabase
    .from('project_kosten')
    .select('*')
    .eq('project_id', projectId)
    .order('datum', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[projectKostenService.listProjectKosten]', error.message);
    return { data: [], error: 'Inkopen konden niet worden geladen.' };
  }
  return { data: ((data as Record<string, unknown>[]) ?? []).map(naarProjectKost), error: null };
}

export type ProjectKostInput = {
  naam: string;
  aantal: number;
  eenheid?: string | null;
  prijs_per: number;
  leverancier_id?: string | null;
};

function valideer(input: Partial<ProjectKostInput>, nieuw: boolean): string | null {
  if ((nieuw || input.naam !== undefined) && !input.naam?.trim()) return 'Omschrijving is verplicht.';
  for (const [veld, label] of [
    ['aantal', 'aantal'],
    ['prijs_per', 'kostprijs'],
  ] as const) {
    const v = input[veld];
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) return `Vul een geldig ${label} in.`;
  }
  return null;
}

export async function createProjectKost(
  projectId: string,
  input: ProjectKostInput,
): Promise<WriteResult<ProjectKost>> {
  const fout = valideer(input, true);
  if (fout) return writeFout('validatie', fout);
  const payload = withCompanyId({
    project_id: projectId,
    werkbon_id: null,
    naam: input.naam.trim(),
    eenheid: input.eenheid?.trim() || null,
    aantal: Number(input.aantal) || 1,
    prijs_per: rond(Number(input.prijs_per) || 0),
    leverancier_id: input.leverancier_id || null,
  });
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  const res = await schrijf<Record<string, unknown>>(
    () => supabase.from('project_kosten').insert(payload).select('*'),
    {
      context: 'projectKostenService.createProjectKost',
      bedrijfReadonly: isReadonly(),
      leegMelding: 'De inkoop is niet opgeslagen. Je hebt het recht Kosten nodig.',
    },
  );
  return res.ok ? { ok: true, data: naarProjectKost(res.data) } : res;
}

export async function updateProjectKost(
  id: string,
  input: Partial<ProjectKostInput>,
): Promise<WriteResult<ProjectKost>> {
  const fout = valideer(input, false);
  if (fout) return writeFout('validatie', fout);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.naam !== undefined) updates.naam = input.naam.trim();
  if (input.eenheid !== undefined) updates.eenheid = input.eenheid?.trim() || null;
  if (input.aantal !== undefined) updates.aantal = Number(input.aantal) || 0;
  if (input.prijs_per !== undefined) updates.prijs_per = rond(Number(input.prijs_per) || 0);
  if (input.leverancier_id !== undefined) updates.leverancier_id = input.leverancier_id || null;
  const res = await schrijf<Record<string, unknown>>(
    () => supabase.from('project_kosten').update(updates).eq('id', id).select('*'),
    {
      context: 'projectKostenService.updateProjectKost',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De inkoop is niet gewijzigd. Je hebt het recht Kosten nodig.',
    },
  );
  return res.ok ? { ok: true, data: naarProjectKost(res.data) } : res;
}

export async function deleteProjectKost(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('project_kosten').delete().eq('id', id).select('id'),
    {
      context: 'projectKostenService.deleteProjectKost',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De inkoop is niet verwijderd. Je hebt het recht Kosten nodig.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

type RuweJobCost = {
  id: string;
  description: string | null;
  amount: number | null;
  cost_date: string | null;
  created_at: string | null;
  werkbon_materiaal_id: string | null;
  werkbon_materialen?:
    | { aantal: number | null; werkbon_materiaal_inkoop?: { inkoopprijs_per: number | null } | { inkoopprijs_per: number | null }[] | null }
    | { aantal: number | null; werkbon_materiaal_inkoop?: { inkoopprijs_per: number | null } | { inkoopprijs_per: number | null }[] | null }[]
    | null;
};

const eerste = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** `getProjectCosts`: de kosten van dit project en van zijn werkbonnen. */
export async function listProjectJobCosts(
  projectId: string,
): Promise<{ data: ProjectJobCost[]; error: string | null }> {
  const { data: wbs } = await supabase.from('werkbonnen').select('id').eq('project_id', projectId);
  const werkbonIds = ((wbs as { id: string }[] | null) ?? []).map((w) => w.id);
  const delen = [`project_id.eq.${projectId}`];
  if (werkbonIds.length) delen.push(`werkbon_id.in.(${werkbonIds.join(',')})`);

  const BASIS = 'id, description, amount, cost_date, created_at, werkbon_materiaal_id';
  const haal = (kolommen: string) =>
    haalInStukken((van, tot) =>
      supabase
        .from('job_costs')
        .select(kolommen)
        .or(delen.join(','))
        .order('cost_date', { ascending: false })
        .order('id', { ascending: true })
        .range(van, tot),
    );
  let res = await haal(
    `${BASIS}, werkbon_materialen!werkbon_materiaal_id ( aantal, werkbon_materiaal_inkoop ( inkoopprijs_per ) )`,
  );
  // Kent de API die relatie niet, dan weigert hij de hele select: liever
  // kosten zonder inkoopprijs dan een lege tab.
  if (res.error) res = await haal(BASIS);
  if (res.error) {
    console.warn('[projectKostenService.listProjectJobCosts]', res.error.message);
    return { data: [], error: 'Kosten konden niet worden geladen.' };
  }
  return {
    data: ((res.data as unknown as RuweJobCost[]) ?? []).map((r) => {
      const m = eerste(r.werkbon_materialen);
      const inkoop = eerste(m?.werkbon_materiaal_inkoop);
      return {
        id: r.id,
        description: r.description,
        amount: Number(r.amount) || 0,
        cost_date: r.cost_date || (r.created_at ? r.created_at.slice(0, 10) : null),
        werkbon_materiaal_id: r.werkbon_materiaal_id,
        materiaalAantal: m?.aantal != null ? Number(m.aantal) : null,
        inkoopprijsPer: inkoop?.inkoopprijs_per != null ? Number(inkoop.inkoopprijs_per) : null,
      };
    }),
    error: null,
  };
}
