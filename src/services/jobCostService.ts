import { supabase } from '@/lib/supabase';
import { isReadonly, withCompanyId } from '@/lib/sessionContext';
import { isGeldigeDatum } from '@/lib/nlTijd';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import { negeerBijImport } from './importPrullenbak';

/**
 * Kosten (`job_costs`) — dezelfde tabel en dezelfde categorieën als het
 * dashboard (`jobCostService.js`).
 *
 * Twee dingen die op de live database staan en die de app moet respecteren:
 *
 * 1. `job_costs_leverancier_verplicht` — een kostenpost met een positief bedrag
 *    moet een leverancier hebben (of van een werkbonmateriaal of een import
 *    komen). De constraint is NOT VALID, dus bestaande rijen zijn ontzien maar
 *    élke nieuwe rij wordt getoetst. Zonder leveranciersveld zou opslaan hier
 *    dus altijd stranden op een check-fout die niemand kan plaatsen.
 * 2. `plan_feature_kosten` — een kostenpost zónder werkbon vraagt de feature
 *    `kosten_nacalculatie`. Met werkbon telt hij als werkbonkost en valt hij
 *    onder het werkbonrecht.
 *
 * De bonnetjes staan in de privébucket `kosten-bijlagen`, pad
 * `{company_id}/{bestand}`; `bijlage_url` bevat een JSON-array met die paden.
 */

export const KOSTEN_CATEGORIEEN = [
  'Materiaal',
  'Arbeid',
  'Reiskosten',
  'Inkoopfactuur',
  'Algemene kosten',
  'Overig',
] as const;

const JOB_COST_COLUMNS = `
  id, company_id, customer_id, deal_id, project_id, werkbon_id,
  description, amount, category, cost_date, bijlage_url, klant_type,
  btw_inclusief, btw_percentage, leverancier, leverancier_id,
  externe_referentie, werkbon_materiaal_id, created_at,
  customer:customers ( id, name )
`;

export type JobCostRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  deal_id: string | null;
  project_id: string | null;
  werkbon_id: string | null;
  description: string | null;
  amount: number | null;
  category: string | null;
  cost_date: string | null;
  bijlage_url: string | null;
  klant_type: string;
  btw_inclusief: boolean | null;
  btw_percentage: number | null;
  leverancier: string | null;
  leverancier_id: string | null;
  /** Gevuld bij import uit de boekhouding: die rij hoort daar thuis. */
  externe_referentie: string | null;
  werkbon_materiaal_id: string | null;
  created_at: string;
  customer: { id: string; name: string | null } | null;
};

/**
 * Een uit de boekhouding geïmporteerde kostenpost, of een spiegelregel van
 * werkbonmateriaal, hoort niet mobiel bewerkt te worden: de bron staat elders
 * en een wijziging hier loopt bij de volgende sync weg.
 */
export function isVergrendeld(k: JobCostRow): boolean {
  return Boolean(k.externe_referentie) || Boolean(k.werkbon_materiaal_id);
}

export async function listJobCosts(
  limit = 100,
): Promise<{ data: JobCostRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('job_costs')
    .select(JOB_COST_COLUMNS)
    .order('cost_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[jobCostService.listJobCosts]', error.message);
    return { data: [], error: 'Kosten konden niet worden geladen.' };
  }
  return { data: (data as unknown as JobCostRow[]) ?? [], error: null };
}

/** Leveranciers voor het verplichte leveranciersveld. */
export async function listLeveranciers(): Promise<{
  data: { id: string; naam: string }[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('leveranciers')
    .select('id, naam, actief')
    .eq('actief', true)
    .order('naam', { ascending: true });
  if (error) {
    console.warn('[jobCostService.listLeveranciers]', error.message);
    return { data: [], error: 'Leveranciers konden niet worden geladen.' };
  }
  return {
    data: ((data as { id: string; naam: string }[]) ?? []).map((l) => ({ id: l.id, naam: l.naam })),
    error: null,
  };
}

/**
 * Een leverancier aanmaken vanuit het kostenformulier.
 *
 * Zonder dit is het formulier onbruikbaar voor een bedrijf dat nog geen
 * leveranciers heeft: de databaseconstraint eist er één, en de app zou dan een
 * verplicht veld tonen met een lege keuzelijst. De RLS op `leveranciers` vraagt
 * voor INSERT alleen het eigen bedrijf (plus de read-onlygate) — dezelfde regel
 * als de leverancierspagina van het dashboard.
 */
export async function createLeverancier(naam: string): Promise<WriteResult<{ id: string; naam: string }>> {
  const schoon = naam.trim();
  if (!schoon) return writeFout('validatie', 'Vul een naam in.');

  const payload = withCompanyId({ naam: schoon, actief: true });
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');

  return schrijf<{ id: string; naam: string }>(
    () => supabase.from('leveranciers').insert(payload).select('id, naam'),
    {
      context: 'jobCostService.createLeverancier',
      bedrijfReadonly: isReadonly(),
      leegMelding: 'De leverancier is niet opgeslagen.',
    },
  );
}

/** Tijdelijke link naar het eerste bonnetje. Bucket is privé. */
export async function getBijlageUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  let items: unknown;
  try {
    items = JSON.parse(stored);
  } catch {
    items = [stored];
  }
  const eerste = Array.isArray(items) ? items[0] : items;
  if (!eerste || typeof eerste !== 'string') return null;
  // Legacy: er staan nog rijen met een kant-en-klare publieke URL in.
  if (eerste.startsWith('http')) return eerste;
  const { data, error } = await supabase.storage
    .from('kosten-bijlagen')
    .createSignedUrl(eerste, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export type JobCostInput = {
  description: string;
  amount: number;
  category?: string | null;
  cost_date?: string | null;
  leverancier_id?: string | null;
  customer_id?: string | null;
  project_id?: string | null;
  werkbon_id?: string | null;
  btw_percentage?: number | null;
  btw_inclusief?: boolean | null;
  klant_type?: 'klant' | 'algemeen';
  bijlage_url?: string | null;
};

function valideerKost(input: Partial<JobCostInput>, nieuw: boolean): string | null {
  if ((nieuw || input.description !== undefined) && !input.description?.trim()) {
    return 'Vul een omschrijving in.';
  }
  if (nieuw || input.amount !== undefined) {
    const bedrag = Number(input.amount);
    if (!Number.isFinite(bedrag) || bedrag <= 0) return 'Voer een geldig bedrag in.';
  }
  if (input.cost_date && !isGeldigeDatum(input.cost_date)) {
    return 'Vul een geldige datum in (JJJJ-MM-DD).';
  }
  if (
    input.btw_percentage !== undefined &&
    input.btw_percentage !== null &&
    (!Number.isFinite(input.btw_percentage) ||
      input.btw_percentage < 0 ||
      input.btw_percentage > 100)
  ) {
    return 'Vul een geldig btw-percentage in.';
  }
  // De databaseconstraint in gewone taal, vóórdat de server hem als 23514
  // teruggeeft. Een werkbonkost is de uitzondering: die hangt aan de klus.
  if (nieuw && !input.leverancier_id && !input.werkbon_id) {
    return 'Kies een leverancier. Zonder leverancier kan een kostenpost niet worden vastgelegd.';
  }
  if (input.klant_type && !['klant', 'algemeen'].includes(input.klant_type)) {
    return 'Onbekend kostentype.';
  }
  return null;
}

function mapKost(input: Partial<JobCostInput>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (input.description !== undefined) p.description = input.description.trim();
  if (input.amount !== undefined) p.amount = Number(input.amount);
  if (input.category !== undefined) p.category = input.category || null;
  if (input.cost_date !== undefined) p.cost_date = input.cost_date || null;
  if (input.leverancier_id !== undefined) p.leverancier_id = input.leverancier_id || null;
  if (input.customer_id !== undefined) p.customer_id = input.customer_id || null;
  if (input.project_id !== undefined) p.project_id = input.project_id || null;
  if (input.werkbon_id !== undefined) p.werkbon_id = input.werkbon_id || null;
  if (input.btw_percentage !== undefined) p.btw_percentage = Number(input.btw_percentage ?? 21);
  if (input.btw_inclusief !== undefined) p.btw_inclusief = input.btw_inclusief;
  if (input.klant_type !== undefined) p.klant_type = input.klant_type;
  if (input.bijlage_url !== undefined) p.bijlage_url = input.bijlage_url;
  return p;
}

export async function createJobCost(input: JobCostInput): Promise<WriteResult<JobCostRow>> {
  const fout = valideerKost(input, true);
  if (fout) return writeFout('validatie', fout);

  const basis = mapKost({
    category: 'Overig',
    btw_percentage: 21,
    klant_type: input.customer_id ? 'klant' : 'algemeen',
    ...input,
  });

  // Werkbonkoppeling: project en klant volgen uit de werkbon, zodat de kost bij
  // het juiste project en de juiste klant terechtkomt. Zelfde afleiding als
  // `createJobCost` in het dashboard.
  if (basis.werkbon_id && (!basis.project_id || !basis.customer_id)) {
    const { data: wb } = await supabase
      .from('werkbonnen')
      .select('project_id, customer_id')
      .eq('id', basis.werkbon_id as string)
      .maybeSingle();
    const bon = wb as { project_id: string | null; customer_id: string | null } | null;
    if (bon) {
      if (!basis.project_id) basis.project_id = bon.project_id;
      if (!basis.customer_id) basis.customer_id = bon.customer_id;
    }
  }

  const payload = withCompanyId(basis);
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  return schrijf<JobCostRow>(
    () => supabase.from('job_costs').insert(payload).select(JOB_COST_COLUMNS),
    {
      context: 'jobCostService.createJobCost',
      bedrijfReadonly: isReadonly(),
      leegMelding:
        'De kostenpost is niet opgeslagen. Je hebt het recht Kosten nodig, en Kosten & ' +
        'nacalculatie moet in je abonnement zitten.',
    },
  );
}

export async function updateJobCost(
  id: string,
  input: Partial<JobCostInput>,
): Promise<WriteResult<JobCostRow>> {
  const fout = valideerKost(input, false);
  if (fout) return writeFout('validatie', fout);

  const updates = mapKost(input);
  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

  return schrijf<JobCostRow>(
    () => supabase.from('job_costs').update(updates).eq('id', id).select(JOB_COST_COLUMNS),
    { context: 'jobCostService.updateJobCost', bedrijfReadonly: isReadonly() },
  );
}

/**
 * Verwijdert een kostenpost.
 *
 * Hangt er werkbonmateriaal aan, dan verwijderen we dát; de foreign key ruimt
 * de kost mee op. Zo blijven materiaallijst en kosten in sync, ongeacht vanaf
 * welke kant je verwijdert — precies zoals `deleteJobCost` in het dashboard.
 *
 * Een geïmporteerde kostenpost laten we met rust: het dashboard zet die op de
 * prullenbaklijst van de boekhoudkoppeling (`negeerBijImport`) zodat de import
 * hem niet terughaalt. Dat pad heeft de app niet, en zonder die stap zou de
 * kost bij de volgende sync gewoon terugkomen.
 */
export async function deleteJobCost(
  id: string,
): Promise<WriteStatus & { waarschuwing?: string }> {
  const { data: cur } = await supabase
    .from('job_costs')
    .select('werkbon_materiaal_id, externe_referentie')
    .eq('id', id)
    .maybeSingle();
  const kost = cur as { werkbon_materiaal_id: string | null; externe_referentie: string | null } | null;

  if (kost?.werkbon_materiaal_id) {
    const res = await schrijf<{ id: string }>(
      () =>
        supabase
          .from('werkbon_materialen')
          .delete()
          .eq('id', kost.werkbon_materiaal_id as string)
          .select('id'),
      {
        context: 'jobCostService.deleteJobCost.materiaal',
        bedrijfReadonly: isReadonly(),
        leegSoort: 'geen-rechten',
        leegMelding: 'Je hebt geen rechten om dit werkbonmateriaal te verwijderen.',
      },
    );
    return res.ok ? { ok: true, data: null } : res;
  }

  const res = await schrijf<{ id: string }>(
    () => supabase.from('job_costs').delete().eq('id', id).select('id'),
    {
      context: 'jobCostService.deleteJobCost',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'Je hebt geen rechten om deze kostenpost te verwijderen.',
    },
  );
  if (!res.ok) return res;

  // Uit de boekhouding geïmporteerd? Dan op de negeerlijst, anders komt hij bij
  // de volgende synchronisatie terug.
  if (kost?.externe_referentie) {
    const waarschuwing = await negeerBijImport('kost', kost.externe_referentie);
    if (waarschuwing) return { ok: true, data: null, waarschuwing };
  }
  return { ok: true, data: null };
}
