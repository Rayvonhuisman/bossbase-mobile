import { supabase } from '@/lib/supabase';
import { getCompanyId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import { naarZitplaatsen } from '@/lib/instellingenRegels';

/**
 * De tabellen achter de tabs van Instellingen die niet in `settingsService`
 * zitten — dezelfde tabellen en dezelfde schrijfacties als het dashboard
 * (`instellingenService.js`, `lostReasonService.js`, `voertuigService.js`,
 * `eigenEenheidService.js`, `billingService.js`).
 *
 * Elke schrijfactie leest de geraakte rij terug (`schrijf`): een stille
 * RLS-weigering komt zo nooit als "opgeslagen" op het scherm.
 */

const opties = (context: string, leegMelding?: string) => ({
  context,
  bedrijfReadonly: isReadonly(),
  leegSoort: 'geen-rechten' as const,
  leegMelding,
});

const ALLEEN_BEHEER = 'Niet opgeslagen. Alleen een beheerder kan dit wijzigen.';

// ── E-mailtemplates ────────────────────────────────────────────────────────

export type EmailTemplate = {
  id: string;
  type: string;
  name: string;
  onderwerp: string;
  body: string;
  is_default: boolean;
  actief: boolean;
  auto_versturen: boolean;
  auto_dagen: number;
};

type TemplateDb = Partial<Record<keyof EmailTemplate | 'body_html', unknown>> & { id: string };

const naarTemplate = (r: TemplateDb): EmailTemplate => ({
  id: r.id,
  type: String(r.type ?? ''),
  name: String(r.name ?? ''),
  onderwerp: String(r.onderwerp ?? ''),
  body: String(r.body ?? r.body_html ?? ''),
  is_default: r.is_default === true,
  actief: r.actief === true,
  auto_versturen: r.auto_versturen === true,
  auto_dagen: r.auto_dagen == null ? 7 : Number(r.auto_dagen),
});

const TEMPLATE_KOLOMMEN =
  'id, type, name, onderwerp, body, body_html, is_default, actief, auto_versturen, auto_dagen';

export async function listEmailTemplates(): Promise<{ data: EmailTemplate[]; error: string | null }> {
  const { data, error } = await supabase
    .from('email_templates')
    .select(TEMPLATE_KOLOMMEN)
    .order('type', { ascending: true });
  if (error) {
    console.warn('[instellingenService.listEmailTemplates]', error.message);
    return { data: [], error: 'E-mailtemplates konden niet worden geladen.' };
  }
  return { data: ((data as TemplateDb[]) ?? []).map(naarTemplate), error: null };
}

export async function updateEmailTemplate(
  id: string,
  input: {
    onderwerp?: string;
    /** Editor-HTML; alleen meesturen als de tekst echt is gewijzigd. */
    body?: string;
    actief?: boolean;
    auto_versturen?: boolean;
    auto_dagen?: number;
  },
): Promise<WriteResult<EmailTemplate>> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.onderwerp !== undefined) updates.onderwerp = input.onderwerp;
  if (input.body !== undefined) {
    updates.body = input.body;
    updates.body_html = input.body;
  }
  if (input.actief !== undefined) updates.actief = input.actief;
  if (input.auto_versturen !== undefined) updates.auto_versturen = input.auto_versturen;
  if (input.auto_dagen !== undefined) {
    const d = Number(input.auto_dagen);
    if (!Number.isFinite(d) || d < 0 || d > 365) {
      return writeFout('validatie', 'Vul een aantal dagen tussen 0 en 365 in.');
    }
    updates.auto_dagen = d;
  }
  const res = await schrijf<TemplateDb>(
    () => supabase.from('email_templates').update(updates).eq('id', id).select(TEMPLATE_KOLOMMEN),
    opties('instellingenService.updateEmailTemplate', ALLEEN_BEHEER),
  );
  return res.ok ? { ok: true, data: naarTemplate(res.data) } : res;
}

export async function createEmailTemplate(input: {
  type: string;
  name: string;
  onderwerp: string;
  body: string;
}): Promise<WriteResult<EmailTemplate>> {
  const payload = withCompanyId({
    type: input.type,
    name: input.name || input.type,
    onderwerp: input.onderwerp || '',
    body: input.body || '',
    body_html: input.body || '',
    is_default: false,
    actief: true,
    auto_versturen: false,
    auto_dagen: 7,
  });
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  const res = await schrijf<TemplateDb>(
    () => supabase.from('email_templates').insert(payload).select(TEMPLATE_KOLOMMEN),
    opties('instellingenService.createEmailTemplate', ALLEEN_BEHEER),
  );
  return res.ok ? { ok: true, data: naarTemplate(res.data) } : res;
}

export async function deleteEmailTemplate(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('email_templates').delete().eq('id', id).select('id'),
    opties('instellingenService.deleteEmailTemplate', ALLEEN_BEHEER),
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ── Pipeline: fasen, koppelingen, verloren-redenen ─────────────────────────

export type Fase = { id: string; name: string; position: number; color_class: string };

export async function listFasen(): Promise<{ data: Fase[]; error: string | null }> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name, position, color_class')
    .order('position', { ascending: true });
  if (error) {
    console.warn('[instellingenService.listFasen]', error.message);
    return { data: [], error: 'De pipelinefasen konden niet worden geladen.' };
  }
  return {
    data: ((data as Fase[]) ?? []).map((f) => ({
      ...f,
      name: f.name ?? '',
      position: Number(f.position ?? 0),
      color_class: f.color_class ?? 'b-gray',
    })),
    error: null,
  };
}

export async function createFase(input: { name: string; color_class: string }): Promise<WriteResult<Fase>> {
  const naam = input.name.trim();
  if (!naam) return writeFout('validatie', 'Vul een naam in.');
  const { data: laatste } = await supabase
    .from('pipeline_stages')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const positie = Number((laatste as { position?: number } | null)?.position ?? -1) + 1;
  const payload = withCompanyId({ name: naam, position: positie, color_class: input.color_class });
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  return schrijf<Fase>(
    () => supabase.from('pipeline_stages').insert(payload).select('id, name, position, color_class'),
    opties('instellingenService.createFase', ALLEEN_BEHEER),
  );
}

export async function updateFase(
  id: string,
  input: { name: string; color_class: string },
): Promise<WriteResult<Fase>> {
  const naam = input.name.trim();
  if (!naam) return writeFout('validatie', 'Vul een naam in.');
  return schrijf<Fase>(
    () =>
      supabase
        .from('pipeline_stages')
        .update({ name: naam, color_class: input.color_class })
        .eq('id', id)
        .select('id, name, position, color_class'),
    opties('instellingenService.updateFase', ALLEEN_BEHEER),
  );
}

export async function deleteFase(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('pipeline_stages').delete().eq('id', id).select('id'),
    opties('instellingenService.deleteFase', ALLEEN_BEHEER),
  );
  if (!res.ok && res.soort === 'conflict') {
    return writeFout('conflict', 'Er staan nog aanvragen of projecten in deze fase. Verplaats die eerst.');
  }
  return res.ok ? { ok: true, data: null } : res;
}

/** moment → stage_id (null = niet gekoppeld). */
export async function listKoppelingen(): Promise<Record<string, string | null>> {
  const { data } = await supabase.from('pipeline_koppelingen').select('moment, stage_id');
  const kaart: Record<string, string | null> = {};
  for (const r of ((data as { moment: string; stage_id: string | null }[]) ?? [])) {
    kaart[r.moment] = r.stage_id ?? null;
  }
  return kaart;
}

export async function zetKoppeling(moment: string, stageId: string | null): Promise<WriteStatus> {
  const payload = withCompanyId({
    moment,
    stage_id: stageId || null,
    updated_at: new Date().toISOString(),
  });
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  const res = await schrijf<{ moment: string }>(
    () =>
      supabase
        .from('pipeline_koppelingen')
        .upsert(payload, { onConflict: 'company_id,moment' })
        .select('moment'),
    opties('instellingenService.zetKoppeling', ALLEEN_BEHEER),
  );
  return res.ok ? { ok: true, data: null } : res;
}

export type VerlorenReden = { id: string; label: string; position: number };

export async function listVerlorenRedenen(): Promise<VerlorenReden[]> {
  const { data, error } = await supabase
    .from('lost_reasons')
    .select('id, label, position')
    .order('position', { ascending: true });
  if (error) return [];
  return ((data as VerlorenReden[]) ?? []).map((r) => ({ ...r, label: r.label ?? '' }));
}

export async function createVerlorenReden(label: string): Promise<WriteResult<VerlorenReden>> {
  const tekst = label.trim();
  if (!tekst) return writeFout('validatie', 'Reden is verplicht');
  const { data: laatste } = await supabase
    .from('lost_reasons')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const positie = Number((laatste as { position?: number } | null)?.position ?? -1) + 1;
  const payload = withCompanyId({ label: tekst, position: positie });
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  return schrijf<VerlorenReden>(
    () => supabase.from('lost_reasons').insert(payload).select('id, label, position'),
    opties('instellingenService.createVerlorenReden', ALLEEN_BEHEER),
  );
}

export async function updateVerlorenReden(id: string, label: string): Promise<WriteResult<VerlorenReden>> {
  const tekst = label.trim();
  if (!tekst) return writeFout('validatie', 'Reden is verplicht');
  return schrijf<VerlorenReden>(
    () => supabase.from('lost_reasons').update({ label: tekst }).eq('id', id).select('id, label, position'),
    opties('instellingenService.updateVerlorenReden', ALLEEN_BEHEER),
  );
}

export async function deleteVerlorenReden(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('lost_reasons').delete().eq('id', id).select('id'),
    opties('instellingenService.deleteVerlorenReden', ALLEEN_BEHEER),
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ── Voertuigen ─────────────────────────────────────────────────────────────

export type Voertuig = {
  id: string;
  naam: string;
  kenteken: string;
  kleur: string;
  actief: boolean;
  zitplaatsen: number | null;
};

type VoertuigDb = {
  id: string;
  naam: string | null;
  kenteken: string | null;
  kleur: string | null;
  actief: boolean | null;
  zitplaatsen: number | null;
};

const naarVoertuig = (r: VoertuigDb): Voertuig => ({
  id: r.id,
  naam: r.naam ?? '',
  kenteken: r.kenteken ?? '',
  kleur: r.kleur || '#1DDB62',
  actief: r.actief !== false,
  zitplaatsen: r.zitplaatsen ?? null,
});

export async function listVoertuigen(): Promise<{ data: Voertuig[]; error: string | null }> {
  const { data, error } = await supabase.from('voertuigen').select('*').order('naam');
  if (error) {
    console.warn('[instellingenService.listVoertuigen]', error.message);
    return { data: [], error: 'De voertuigen konden niet worden geladen.' };
  }
  return { data: ((data as VoertuigDb[]) ?? []).map(naarVoertuig), error: null };
}

export type VoertuigInput = {
  naam: string;
  kenteken: string;
  kleur: string;
  zitplaatsen: string;
  actief?: boolean;
};

export async function saveVoertuig(id: string | null, input: VoertuigInput): Promise<WriteResult<Voertuig>> {
  const naam = input.naam.trim();
  if (!naam) return writeFout('validatie', 'Naam is verplicht');
  const basis: Record<string, unknown> = {
    naam,
    kenteken: input.kenteken.trim() || null,
    kleur: input.kleur || '#1DDB62',
    zitplaatsen: naarZitplaatsen(input.zitplaatsen),
  };
  if (id) {
    if (input.actief !== undefined) basis.actief = input.actief;
    const res = await schrijf<VoertuigDb>(
      () => supabase.from('voertuigen').update(basis).eq('id', id).select('*'),
      opties('instellingenService.saveVoertuig.update', ALLEEN_BEHEER),
    );
    return res.ok ? { ok: true, data: naarVoertuig(res.data) } : res;
  }
  // Zoals het dashboard: zitplaatsen alleen meesturen als er een waarde is.
  const { zitplaatsen, ...zonderPlekken } = basis;
  const payload = withCompanyId({
    ...zonderPlekken,
    ...(zitplaatsen != null ? { zitplaatsen } : {}),
    actief: true,
  });
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  const res = await schrijf<VoertuigDb>(
    () => supabase.from('voertuigen').insert(payload).select('*'),
    opties('instellingenService.saveVoertuig.insert', ALLEEN_BEHEER),
  );
  return res.ok ? { ok: true, data: naarVoertuig(res.data) } : res;
}

export async function deleteVoertuig(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('voertuigen').delete().eq('id', id).select('id'),
    opties('instellingenService.deleteVoertuig', ALLEEN_BEHEER),
  );
  if (!res.ok && res.soort === 'conflict') {
    return writeFout('conflict', 'Dit voertuig is nog ingepland. Zet het op inactief in plaats van te verwijderen.');
  }
  return res.ok ? { ok: true, data: null } : res;
}

// ── Eigen prijzen / eenheden ───────────────────────────────────────────────

export type EigenEenheid = {
  id: string;
  naam: string;
  standaard_prijs: number;
  eenheid_label: string;
  btw_pct: number | null;
};

type EenheidDb = {
  id: string;
  naam: string | null;
  standaard_prijs: number | null;
  eenheid_label: string | null;
  btw_pct: number | null;
};

const naarEenheid = (r: EenheidDb): EigenEenheid => ({
  id: r.id,
  naam: r.naam ?? '',
  standaard_prijs: Number(r.standaard_prijs ?? 0),
  eenheid_label: r.eenheid_label ?? '',
  btw_pct: r.btw_pct == null ? null : Number(r.btw_pct),
});

const EENHEID_KOLOMMEN = 'id, naam, standaard_prijs, eenheid_label, btw_pct';

export async function listEenheden(): Promise<EigenEenheid[]> {
  const { data, error } = await supabase
    .from('eigen_eenheden')
    .select(EENHEID_KOLOMMEN)
    .order('naam', { ascending: true });
  if (error) return [];
  return ((data as EenheidDb[]) ?? []).map(naarEenheid);
}

export async function saveEenheid(
  id: string | null,
  input: { naam: string; standaard_prijs: string; eenheid_label: string; btw_pct: string },
): Promise<WriteResult<EigenEenheid>> {
  const naam = input.naam.trim();
  if (!naam) return writeFout('validatie', 'Naam is verplicht');
  const prijs = Number(input.standaard_prijs.replace(',', '.') || 0);
  if (!Number.isFinite(prijs)) return writeFout('validatie', 'Vul een geldige standaardprijs in.');
  const btwTekst = input.btw_pct.replace(',', '.').trim();
  const btw = btwTekst === '' ? null : Number(btwTekst);
  if (btw !== null && (!Number.isFinite(btw) || btw < 0 || btw > 100)) {
    return writeFout('validatie', 'Vul een btw-percentage tussen 0 en 100 in, of laat het leeg.');
  }
  const basis = {
    naam,
    standaard_prijs: prijs,
    eenheid_label: input.eenheid_label.trim() || null,
    btw_pct: btw,
  };
  if (id) {
    const res = await schrijf<EenheidDb>(
      () =>
        supabase
          .from('eigen_eenheden')
          .update({ ...basis, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select(EENHEID_KOLOMMEN),
      opties('instellingenService.saveEenheid.update', ALLEEN_BEHEER),
    );
    return res.ok ? { ok: true, data: naarEenheid(res.data) } : res;
  }
  const payload = withCompanyId(basis);
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');
  const res = await schrijf<EenheidDb>(
    () => supabase.from('eigen_eenheden').insert(payload).select(EENHEID_KOLOMMEN),
    opties('instellingenService.saveEenheid.insert', ALLEEN_BEHEER),
  );
  return res.ok ? { ok: true, data: naarEenheid(res.data) } : res;
}

export async function deleteEenheid(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('eigen_eenheden').delete().eq('id', id).select('id'),
    opties('instellingenService.deleteEenheid', ALLEEN_BEHEER),
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ── Urenherinnering: wie kan er een krijgen ────────────────────────────────

/** Actieve, niet-admin teamleden met een naam (zoals het dashboard). */
export async function listHerinneringTeam(): Promise<{ id: string; naam: string }[]> {
  const companyId = getCompanyId();
  if (!companyId) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, actief')
    .eq('company_id', companyId)
    .order('full_name', { ascending: true });
  return ((data as { id: string; full_name: string | null; role: string | null; actief: boolean | null }[]) ?? [])
    .filter((p) => p.actief !== false && p.role !== 'admin' && p.full_name)
    .map((p) => ({ id: p.id, naam: p.full_name as string }));
}

// ── Abonnement (alleen lezen) ──────────────────────────────────────────────

export type AbonnementStand = {
  tier: string;
  status: string | null;
  heeftStripe: boolean;
  billingInterval: string;
  extraGebruikers: number;
  trial: boolean;
  trialEindigtOp: string | null;
  verlengtOp: string | null;
  opzeggenPerEindePeriode: boolean;
  welkomstactie: string | null;
  heeftVerplichting: boolean;
  verplichtingTot: string | null;
  stoptNaLooptijd: boolean;
  stoptOp: string | null;
  websiteAanvraag: { status?: string } | null;
  magBeheren: boolean;
  readonly: boolean;
  readonlyReden: string | null;
  modules: string[];
  limieten: Record<string, { max: number | null; gebruikt: number }>;
  /** Actief en uitgenodigd apart: de prijs telt alleen actief (G-22). Null zonder migratie 20261026122446. */
  gebruikers: { actief: number; uitgenodigd: number } | null;
};

/** RPC `get_billing_status`, zelfde mapping als `getBillingStatus`. */
export async function getAbonnement(): Promise<{ data: AbonnementStand | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_billing_status');
  if (error) {
    console.warn('[instellingenService.getAbonnement]', error.message);
    return { data: null, error: 'Het abonnement kon niet worden geladen.' };
  }
  const d = data as Record<string, unknown> | null;
  if (!d) return { data: null, error: null };
  return {
    data: {
      tier: String(d.tier ?? ''),
      status: (d.status as string) || null,
      heeftStripe: Boolean(d.heeftStripe),
      billingInterval: (d.billingInterval as string) || 'maand',
      extraGebruikers: Number(d.extraGebruikers || 0),
      trial: Boolean(d.trial),
      trialEindigtOp: (d.trialEindigtOp as string) || null,
      verlengtOp: (d.verlengtOp as string) || null,
      opzeggenPerEindePeriode: Boolean(d.opzeggenPerEindePeriode),
      welkomstactie: (d.welkomstactie as string) || null,
      heeftVerplichting: Boolean(d.heeftVerplichting),
      verplichtingTot: (d.verplichtingTot as string) || null,
      stoptNaLooptijd: Boolean(d.stoptNaLooptijd),
      stoptOp: (d.stoptOp as string) || null,
      websiteAanvraag: (d.websiteAanvraag as { status?: string }) || null,
      magBeheren: Boolean(d.magBeheren),
      readonly: d.readonly === true,
      readonlyReden: (d.readonlyReden as string) || null,
      modules: Array.isArray(d.modules) ? (d.modules as string[]) : [],
      limieten: (d.limieten as AbonnementStand['limieten']) || {},
      gebruikers: (d.gebruikers as AbonnementStand['gebruikers']) || null,
    },
    error: null,
  };
}
