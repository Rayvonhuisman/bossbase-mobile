import { supabase } from '@/lib/supabase';
import { getCompanyId, getUserId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { haalInStukken } from '@/lib/inStukken';
import { isGeldigeDatum } from '@/lib/nlTijd';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import { PROJECT_STATUS, projectStatusLabel, type FactuurBedrag } from '@/lib/projectLogica';
import { idBatches, PROJECT_BEDRAG_VELDEN, vulBedragen } from '@/lib/bedragen';

export { PROJECT_STATUS, projectStatusLabel };

/**
 * Projecten (`projects`) met alles wat de projectkaart van het dashboard toont:
 * notities, uren (uit werkbonuren), facturen, werkbonnen, offertes en foto's.
 *
 * Wat hier eerder stuk was (geverifieerd tegen de live database, 13-10-2026):
 * - De app kende zeven statussen (concept, lopend, …). De database laat via
 *   `projects_status_check` alleen `gepland | in_uitvoering | afgerond` toe,
 *   dus elk nieuw project ('concept') werd geweigerd en elke statuschip gaf
 *   een fout. De status wordt bovendien niet getypt maar afgeleid uit de
 *   werkbonnen (trigger `bb_project_status_bijwerken`); de app schrijft hem
 *   daarom niet meer.
 * - `listProjects` haalde maar 100 rijen; nu alles, in stukken van 1000.
 *
 * Projectwaarde: met `waarde_bron` ('offertes' | 'aanvraag' | 'handmatig').
 * Een zelf getypte waarde zet 'handmatig'; terug naar automatisch = 'aanvraag'.
 *
 * RLS: SELECT is breed (gedeelde werkruimte, `alles_inzien`, of zelf gekoppeld);
 * INSERT/UPDATE vragen `projecten_bewerken`; DELETE vraagt rol admin.
 *
 * Bedragen (dashboard 3-10-2026, migraties 20261003093758/093845):
 * `project_value` en `geschatte_waarde` zijn voor `authenticated` niet meer
 * leesbaar — een select die ze noemt faalt voor iedereen. Ze komen via de RPC
 * `bb_projectbedragen(p_ids)`, die alleen antwoordt met het recht
 * `projectbedragen` (admin of recht; niet via de gedeelde werkruimte). Schrijven mag nog.
 */

const PROJECT_COLUMNS = `
  id, company_id, customer_id, deal_id, offerte_id, name, description, status,
  waarde_bron, quoted_hours, start_date, deadline,
  owner_id, assigned_to, created_by, created_at,
  customer:customers ( id, name ),
  deal:deals ( title ),
  offerte:offertes ( nummer )
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
  waarde_bron: string | null;
  geschatte_waarde: number | null;
  quoted_hours: number | null;
  start_date: string | null;
  deadline: string | null;
  owner_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  customer: { id: string; name: string | null } | null;
  deal: { title: string | null } | null;
  offerte: { nummer: string | null } | null;
};

/**
 * Vult `project_value`/`geschatte_waarde` aan via `bb_projectbedragen`, zoals
 * `metBedragen` in het dashboard. Zonder recht blijven ze `null`.
 */
export async function metProjectBedragen<T extends { id: string }>(
  rijen: readonly T[],
): Promise<{ data: (T & { project_value: number | null; geschatte_waarde: number | null })[]; error: string | null }> {
  const bedragen: { id: string }[] = [];
  for (const ids of idBatches(rijen.map((r) => r.id))) {
    const { data, error } = await supabase.rpc('bb_projectbedragen', { p_ids: ids });
    if (error) {
      console.warn('[projectService.metProjectBedragen]', error.message);
      return { data: vulBedragen(rijen, [], PROJECT_BEDRAG_VELDEN), error: 'Projectbedragen konden niet worden geladen.' };
    }
    bedragen.push(...((data as { id: string }[] | null) ?? []));
  }
  return { data: vulBedragen(rijen, bedragen, PROJECT_BEDRAG_VELDEN), error: null };
}

type RuweProject = Omit<ProjectRow, 'project_value' | 'geschatte_waarde'>;

/** Na een geslaagde schrijfactie de bedragen erbij; de schrijfactie zelf telt. */
async function schrijfMetBedragen<R extends WriteResult<ProjectRow>>(res: R): Promise<R> {
  if (!res.ok) return res;
  const { data } = await metProjectBedragen([res.data as unknown as RuweProject]);
  return { ...res, data: data[0] ?? res.data };
}

export async function listProjects(): Promise<{ data: ProjectRow[]; error: string | null }> {
  const { data, error } = await haalInStukken((van, tot) =>
    supabase
      .from('projects')
      .select(PROJECT_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(van, tot),
  );

  if (error) {
    console.warn('[projectService.listProjects]', error.message);
    return { data: [], error: 'Projecten konden niet worden geladen.' };
  }
  return metProjectBedragen((data as unknown as RuweProject[]) ?? []);
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
  if (!data) return { data: null, error: null };
  const res = await metProjectBedragen([data as unknown as RuweProject]);
  return { data: res.data[0] ?? null, error: res.error };
}

/** Het (oudste) project bij een deal — wat het dashboard opent vanaf de pipeline. */
export async function getProjectByDeal(
  dealId: string,
): Promise<{ data: ProjectRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    console.warn('[projectService.getProjectByDeal]', error.message);
    return { data: null, error: 'Project kon niet worden geladen.' };
  }
  const eerste = ((data as unknown as RuweProject[]) ?? [])[0];
  if (!eerste) return { data: null, error: null };
  const res = await metProjectBedragen([eerste]);
  return { data: res.data[0] ?? null, error: res.error };
}

export type ProjectInput = {
  name: string;
  description?: string | null;
  customer_id?: string | null;
  deal_id?: string | null;
  offerte_id?: string | null;
  project_value?: number | null;
  waarde_bron?: 'offertes' | 'aanvraag' | 'handmatig';
  quoted_hours?: number | null;
  start_date?: string | null;
  deadline?: string | null;
  assigned_to?: string | null;
};

function valideerProject(input: Partial<ProjectInput>, nieuw: boolean): string | null {
  if ((nieuw || input.name !== undefined) && !input.name?.trim()) {
    return 'Projectnaam is verplicht.';
  }
  for (const [veld, label] of [
    ['start_date', 'startdatum'],
    ['deadline', 'einddatum'],
  ] as const) {
    const v = input[veld];
    if (v && !isGeldigeDatum(v)) return `Vul een geldige ${label} in (JJJJ-MM-DD).`;
  }
  if (input.start_date && input.deadline && input.deadline < input.start_date) {
    return 'De einddatum ligt vóór de startdatum.';
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
  if (input.customer_id !== undefined) p.customer_id = input.customer_id || null;
  if (input.deal_id !== undefined) p.deal_id = input.deal_id || null;
  if (input.offerte_id !== undefined) p.offerte_id = input.offerte_id || null;
  if (input.project_value !== undefined) p.project_value = Number(input.project_value ?? 0);
  if (input.waarde_bron !== undefined) p.waarde_bron = input.waarde_bron;
  if (input.quoted_hours !== undefined) p.quoted_hours = Number(input.quoted_hours ?? 0);
  if (input.start_date !== undefined) p.start_date = input.start_date || null;
  if (input.deadline !== undefined) p.deadline = input.deadline || null;
  if (input.assigned_to !== undefined) p.assigned_to = input.assigned_to || null;
  return p;
}

/**
 * Nieuw project. Status niet meesturen: de kolomdefault is 'gepland' en de
 * werkbonnen bepalen de rest. Hoort er al een project bij de gekozen aanvraag
 * (elke deal krijgt er automatisch één), dan wordt dát bijgewerkt in plaats
 * van een tweede ernaast te zetten — zoals `createProject` in het dashboard.
 */
export async function createProject(
  input: ProjectInput,
): Promise<WriteResult<ProjectRow> & { bestond?: boolean }> {
  const fout = valideerProject(input, true);
  if (fout) return writeFout('validatie', fout);

  const basis = mapProject(input);
  if (Number(input.project_value ?? 0) > 0) basis.waarde_bron = 'handmatig';
  Object.keys(basis).forEach((k) => basis[k] === null && delete basis[k]);

  if (input.deal_id) {
    const { data: bestaand } = await getProjectByDeal(input.deal_id);
    if (bestaand) {
      const patch = { ...basis };
      delete patch.deal_id;
      if (!patch.project_value) {
        delete patch.project_value;
        delete patch.waarde_bron;
      }
      if (!patch.quoted_hours) delete patch.quoted_hours;
      const res = await schrijf<ProjectRow>(
        () => supabase.from('projects').update(patch).eq('id', bestaand.id).select(PROJECT_COLUMNS),
        { context: 'projectService.createProject(bestaand)', bedrijfReadonly: isReadonly() },
      );
      return res.ok ? { ...(await schrijfMetBedragen(res)), bestond: true } : res;
    }
  }

  // created_by houdt de audittrail heel — zelfde regel als het dashboard.
  const eigen = getUserId();
  if (eigen) basis.created_by = eigen;

  const payload = withCompanyId(basis);
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  return schrijfMetBedragen(
    await schrijf<ProjectRow>(
      () => supabase.from('projects').insert(payload).select(PROJECT_COLUMNS),
      {
        context: 'projectService.createProject',
        bedrijfReadonly: isReadonly(),
        leegMelding:
          'Het project is niet opgeslagen. Je hebt het recht Projecten bewerken nodig om ' +
          'projecten aan te maken.',
      },
    ),
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

  return schrijfMetBedragen(
    await schrijf<ProjectRow>(
      () => supabase.from('projects').update(updates).eq('id', id).select(PROJECT_COLUMNS),
      {
        context: 'projectService.updateProject',
        bedrijfReadonly: isReadonly(),
        leegMelding:
          'Er is niets gewijzigd. Je hebt het recht Projecten bewerken nodig, of het project ' +
          'bestaat niet meer.',
      },
    ),
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

// ── Uren en facturen per project (lijst) ───────────────────────────────────

/** Gewerkte uren per project uit werkbonuren (RPC `bb_uren_per_project`). */
export async function getProjectUrenMap(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('bb_uren_per_project');
  if (error) {
    if (__DEV__) console.log('[projectService.getProjectUrenMap]', error.message);
    return {};
  }
  const uit: Record<string, number> = {};
  for (const [pid, uren] of Object.entries((data as Record<string, unknown>) ?? {})) {
    uit[pid] = Number(uren) || 0;
  }
  return uit;
}

/** Bedragen van alle facturen met een project, gegroepeerd per project. */
export async function getFactuurBedragenPerProject(): Promise<Record<string, FactuurBedrag[]>> {
  const { data, error } = await haalInStukken((van, tot) =>
    supabase
      .from('facturen')
      .select('id, project_id, status, totaal_incl, totaal_excl')
      .not('project_id', 'is', null)
      .order('id', { ascending: true })
      .range(van, tot),
  );
  if (error) {
    if (__DEV__) console.log('[projectService.getFactuurBedragenPerProject]', error.message);
    return {};
  }
  const uit: Record<string, FactuurBedrag[]> = {};
  for (const f of (data as (FactuurBedrag & { project_id: string })[]) ?? []) {
    (uit[f.project_id] ??= []).push(f);
  }
  return uit;
}

// ── Projectdetail ──────────────────────────────────────────────────────────

export type ProjectUur = {
  id: string;
  datum: string;
  uren: number;
  start_tijd: string | null;
  eind_tijd: string | null;
  pauze_minuten: number | null;
  reis_km: number | null;
  notitie: string | null;
  werkbon_id: string | null;
  medewerker: { full_name: string | null } | null;
};

export async function listProjectUren(projectId: string): Promise<ProjectUur[]> {
  const { data, error } = await haalInStukken((van, tot) =>
    supabase
      .from('werkbon_uren')
      .select(
        'id, datum, uren, start_tijd, eind_tijd, pauze_minuten, reis_km, notitie, werkbon_id, medewerker:profiles!werkbon_uren_profile_id_fkey ( full_name ), werkbonnen!inner ( project_id )',
      )
      .eq('werkbonnen.project_id', projectId)
      .order('datum', { ascending: false })
      .order('id', { ascending: true })
      .range(van, tot),
  );
  if (error) {
    if (__DEV__) console.log('[projectService.listProjectUren]', error.message);
    return [];
  }
  return ((data as unknown as ProjectUur[]) ?? []).map((u) => ({ ...u, uren: Number(u.uren) || 0 }));
}

export type ProjectFactuur = {
  id: string;
  nummer: string | null;
  factuurdatum: string | null;
  vervaldatum: string | null;
  status: string | null;
  totaal_incl: number | null;
  totaal_excl: number | null;
};

export async function listProjectFacturen(projectId: string): Promise<ProjectFactuur[]> {
  const { data, error } = await supabase
    .from('facturen')
    .select('id, nummer, factuurdatum, vervaldatum, status, totaal_incl, totaal_excl')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) {
    if (__DEV__) console.log('[projectService.listProjectFacturen]', error.message);
    return [];
  }
  return (data as ProjectFactuur[]) ?? [];
}

export type ProjectWerkbon = {
  id: string;
  titel: string | null;
  nummer: string | null;
  locatie: string | null;
  status: string | null;
  gepland_op: string | null;
  starttijd: string | null;
  eindtijd: string | null;
  assigned_to_ids: string[] | null;
  werkbon_dagen: {
    datum: string | null;
    starttijd: string | null;
    eindtijd: string | null;
    medewerker_ids: string[] | null;
  }[] | null;
  /** Voor de takenvoortgang in de Werkbonnen-tab (meerwerk telt niet mee). */
  werkbon_taken: { afgerond: boolean | null; is_meerwerk: boolean | null }[] | null;
};

export async function listProjectWerkbonnen(projectId: string): Promise<ProjectWerkbon[]> {
  const { data, error } = await supabase
    .from('werkbonnen')
    .select(
      'id, titel, nummer, locatie, status, gepland_op, starttijd, eindtijd, assigned_to_ids, werkbon_dagen ( datum, starttijd, eindtijd, medewerker_ids ), werkbon_taken ( afgerond, is_meerwerk )',
    )
    .eq('project_id', projectId)
    .order('gepland_op', { ascending: true });
  if (error) {
    if (__DEV__) console.log('[projectService.listProjectWerkbonnen]', error.message);
    return [];
  }
  return (data as unknown as ProjectWerkbon[]) ?? [];
}

export type ProjectOfferte = {
  id: string;
  customer_id: string | null;
  deal_id: string | null;
  nummer: string | null;
  omschrijving: string | null;
  status: string | null;
  totaal_incl: number | null;
  arbeidsuren: number | null;
  geldig_tot: string | null;
  geaccepteerd_op: string | null;
};

const PROJECT_OFFERTE_KOLOMMEN =
  'id, customer_id, deal_id, nummer, omschrijving, status, totaal_incl, arbeidsuren, geldig_tot, geaccepteerd_op';

/** Offertes van deze klus: zelfde aanvraag, plus de expliciet gekoppelde. */
export async function listProjectOffertes(
  dealId: string | null,
  offerteId: string | null,
): Promise<ProjectOfferte[]> {
  const delen = [dealId ? `deal_id.eq.${dealId}` : null, offerteId ? `id.eq.${offerteId}` : null].filter(
    Boolean,
  );
  if (!delen.length) return [];
  const { data, error } = await supabase
    .from('offertes')
    .select(PROJECT_OFFERTE_KOLOMMEN)
    .or(delen.join(','))
    .order('created_at', { ascending: false });
  if (error) {
    if (__DEV__) console.log('[projectService.listProjectOffertes]', error.message);
    return [];
  }
  return (data as ProjectOfferte[]) ?? [];
}

/**
 * Offertes om aan het project te koppelen (Offertes-tab, "Bestaande koppelen"):
 * die van de klant van het project, of alle offertes als er geen klant is —
 * dezelfde keuze als `OfferteTab` in het dashboard.
 */
export async function listKoppelbareOffertes(
  customerId: string | null,
): Promise<{ data: ProjectOfferte[]; error: string | null }> {
  const { data, error } = await haalInStukken((van, tot) => {
    let q = supabase.from('offertes').select(PROJECT_OFFERTE_KOLOMMEN);
    if (customerId) q = q.eq('customer_id', customerId);
    return q.order('created_at', { ascending: false }).order('id', { ascending: true }).range(van, tot);
  });
  if (error) {
    console.warn('[projectService.listKoppelbareOffertes]', error.message);
    return { data: [], error: 'Offertes konden niet worden geladen.' };
  }
  return { data: (data as unknown as ProjectOfferte[]) ?? [], error: null };
}

/** `url` is de tijdelijke link; `pad` het opgeslagen pad (nodig om te verwijderen). */
export type ProjectFoto = { id: string; url: string; pad: string };

const fotoPad = (val: string) => {
  const s = String(val || '').split('?')[0] ?? '';
  const marker = '/project-fotos/';
  const i = s.indexOf(marker);
  return i !== -1 ? s.slice(i + marker.length) : s;
};

/** Foto's bij de aanvraag (privébucket, signed URL van een uur). */
export async function listProjectFotos(projectId: string): Promise<ProjectFoto[]> {
  const { data, error } = await supabase
    .from('project_fotos')
    .select('id, url')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error || !data?.length) return [];
  const rijen = data as { id: string; url: string }[];
  const { data: signed } = await supabase.storage
    .from('project-fotos')
    .createSignedUrls(rijen.map((r) => fotoPad(r.url)), 3600);
  return rijen
    .map((r, i) => ({ id: r.id, url: signed?.[i]?.signedUrl ?? '', pad: fotoPad(r.url) }))
    .filter((f) => f.url);
}

/**
 * Een foto bij de aanvraag (`uploadProjectFoto` in het dashboard): privébucket
 * `project-fotos`, pad `<company_id>/<project_id>/<uuid>.<ext>`, het PAD in
 * `project_fotos.url`. Zelfde opzet als de werkbonfoto's; verkleinen deed de
 * kiezer al (`quality`, `fotoVoorbereiden`).
 *
 * RLS `project_fotos_insert`: gedeelde werkruimte, `projecten_bewerken`, of het
 * project staat op jouw naam.
 */
export async function uploadProjectFoto(input: {
  projectId: string;
  bytes: ArrayBuffer;
  contentType: string;
  extensie: string;
}): Promise<WriteResult<ProjectFoto>> {
  const companyId = getCompanyId();
  if (!companyId) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  if (isReadonly()) return writeFout('readonly', 'Je account staat op alleen-lezen.');
  const naam = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const pad = `${companyId}/${input.projectId}/${naam}.${input.extensie}`;

  const { error: uploadFout } = await supabase.storage
    .from('project-fotos')
    .upload(pad, input.bytes, { contentType: input.contentType, upsert: false });
  if (uploadFout) {
    console.warn('[projectService.uploadProjectFoto]', uploadFout.message);
    return writeFout('geen-rechten', 'De foto is niet opgeslagen. Je hebt het recht Projecten bewerken nodig.');
  }

  const res = await schrijf<{ id: string; url: string }>(
    () =>
      supabase
        .from('project_fotos')
        .insert({ company_id: companyId, project_id: input.projectId, url: pad, categorie: null })
        .select('id, url'),
    {
      context: 'projectService.uploadProjectFoto',
      bedrijfReadonly: isReadonly(),
      leegMelding: 'De foto is niet opgeslagen. Je hebt het recht Projecten bewerken nodig.',
    },
  );
  if (!res.ok) {
    // De rij is er niet gekomen; laat het bestand dan ook niet rondslingeren.
    await supabase.storage.from('project-fotos').remove([pad]);
    return res;
  }
  const { data: signed } = await supabase.storage.from('project-fotos').createSignedUrl(pad, 3600);
  return { ok: true, data: { id: res.data.id, url: signed?.signedUrl ?? '', pad } };
}

/**
 * Foto verwijderen (`deleteProjectFoto`): eerst de rij (RLS beslist), dan het
 * bestand — en alleen een pad binnen de map van het eigen bedrijf.
 */
export async function deleteProjectFoto(foto: Pick<ProjectFoto, 'id' | 'pad'>): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('project_fotos').delete().eq('id', foto.id).select('id'),
    {
      context: 'projectService.deleteProjectFoto',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De foto is niet verwijderd. Je hebt het recht Projecten bewerken nodig.',
    },
  );
  if (!res.ok) return res;
  const companyId = getCompanyId();
  if (companyId && foto.pad.startsWith(`${companyId}/`)) {
    const { error } = await supabase.storage.from('project-fotos').remove([foto.pad]);
    if (error && __DEV__) console.log('[projectService.deleteProjectFoto] bestand bleef staan', error.message);
  }
  return { ok: true, data: null };
}

export type AanvraagVeld = { key: string; label: string; waarde: string; eigen?: boolean };

export type AanvraagBron = {
  bron: string | null;
  binnenOp: string | null;
  isTest: boolean;
  /** Wat er op het websiteformulier is ingevuld; lege velden vallen weg. */
  velden: AanvraagVeld[];
  fotos: number;
};

/**
 * Waar de aanvraag vandaan kwam en wat er op het websiteformulier stond
 * (`inquiries`) — `getAanvraagBron` uit het dashboard (`projectsService.js`).
 * Null zonder rij of zonder recht (`verkoop`).
 */
export async function getAanvraagBron(dealId: string): Promise<AanvraagBron | null> {
  const { data, error } = await supabase
    .from('inquiries')
    .select(
      'source, created_at, is_test, name, email, phone, address, postcode, city, gewenste_datum, message, metadata, eigen_velden',
    )
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data?.length) return null;
  const r = data[0] as Record<string, unknown> & {
    metadata?: { fotos?: unknown } | null;
    eigen_velden?: { naam?: string; waarde?: unknown }[] | null;
  };
  const vast: [string, string, unknown][] = [
    ['naam', 'Naam', r.name],
    ['email', 'E-mailadres', r.email],
    ['telefoon', 'Telefoonnummer', r.phone],
    ['adres', 'Adres', r.address],
    ['postcode', 'Postcode', r.postcode],
    ['plaats', 'Plaats', r.city],
    ['gewensteDatum', 'Gewenste datum', r.gewenste_datum],
    ['omschrijving', 'Omschrijving', r.message],
  ];
  const velden: AanvraagVeld[] = vast
    .filter(([, , w]) => w != null && String(w).trim() !== '')
    .map(([key, label, waarde]) => ({ key, label, waarde: String(waarde) }));
  // De eigen velden van het bedrijf ("Soort dak"), onder de vaste.
  (Array.isArray(r.eigen_velden) ? r.eigen_velden : []).forEach((e, i) => {
    if (e?.naam && String(e.waarde ?? '').trim()) {
      velden.push({ key: `eigen-${i}`, label: e.naam, waarde: String(e.waarde), eigen: true });
    }
  });
  return {
    bron: (r.source as string | null) || null,
    binnenOp: (r.created_at as string | null) || null,
    isTest: !!r.is_test,
    velden,
    fotos: Number(r.metadata?.fotos || 0),
  };
}

// ── Projectnotities ────────────────────────────────────────────────────────
//
// Losse tabel `project_notes`, net als in het dashboard. INSERT vraagt alleen
// het bedrijf; wijzigen en verwijderen mag de auteur zelf, een admin of wie
// `projecten_bewerken` heeft (migratie 20261002135952, geen plannerrol meer).

const NOTE_COLUMNS =
  'id, company_id, project_id, created_by, note, created_at, auteur:profiles ( full_name )';

export type ProjectNote = {
  id: string;
  company_id: string;
  project_id: string;
  created_by: string | null;
  note: string;
  created_at: string;
  auteur: { full_name: string | null } | null;
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
  if (!tekst) return writeFout('validatie', 'Notitie mag niet leeg zijn.');

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
