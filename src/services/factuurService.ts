import { supabase } from '@/lib/supabase';
import { getCompanyId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { isGeldigeDatum, vandaagIso } from '@/lib/nlTijd';
import {
  classificeerFout,
  schrijf,
  writeFout,
  type WriteResult,
  type WriteStatus,
} from '@/lib/writeResult';
import { negeerBijImport } from './importPrullenbak';

/**
 * Facturen (`facturen`) en factuurregels (`factuur_regels`).
 *
 * De vorige versie las kolommen die niet bestaan (`omschrijving`, `bedrag_excl`,
 * `bedrag_incl`, `datum`, `betaaldatum`) en gaf daarom bij elke aanroep 42703 —
 * het facturenscherm meldde "Facturen konden niet worden geladen". De echte
 * kolommen zijn `totaal_excl`, `totaal_incl`, `factuurdatum`, `betaald_op`, en
 * de omschrijving zit in `notities`.
 *
 * Betaald zetten loopt via de RPC `mark_factuur_betaald` — precies dezelfde
 * route als de Stripe-webhook. Die is atomair en idempotent: hij zet alleen op
 * betaald als dat nog niet zo was, en geeft terug óf er iets veranderd is. Dat
 * is de reden om hem te gebruiken en niet zelf een UPDATE te doen: twee keer
 * tikken levert dan geen dubbele boeking naar de boekhouding op.
 */

export const FACTUUR_STATUS: Record<string, string> = {
  concept: 'Concept',
  verzonden: 'Verzonden',
  betaald: 'Betaald',
};

export const FACTUUR_STATUS_OPTIES = Object.entries(FACTUUR_STATUS).map(([id, label]) => ({
  id,
  label,
}));

/** `geboekt` komt uit de boekhoudkoppeling en staat niet in de keuzelijst. */
export function factuurStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Concept';
  if (status === 'geboekt') return 'Geboekt';
  return FACTUUR_STATUS[status] ?? status;
}

const FACTUUR_COLUMNS = `
  id, company_id, customer_id, project_id, nummer, factuurdatum, vervaldatum,
  betaaltermijn_dagen, betalingskenmerk, status, notities,
  totaal_excl, totaal_incl, betaald_op, is_credit, gecrediteerd,
  credit_van_factuur_id, externe_referentie, created_at,
  customer:customers ( id, name )
`;

const REGEL_COLUMNS = `
  id, factuur_id, company_id, type, omschrijving, aantal, eenheidsprijs,
  btw_pct, btw_regime, regelprijs, volgorde
`;

export type FactuurRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  project_id: string | null;
  nummer: string;
  factuurdatum: string;
  vervaldatum: string | null;
  betaaltermijn_dagen: number | null;
  betalingskenmerk: string | null;
  status: string;
  notities: string | null;
  totaal_excl: number;
  totaal_incl: number;
  betaald_op: string | null;
  is_credit: boolean | null;
  gecrediteerd: boolean | null;
  credit_van_factuur_id: string | null;
  /** Gevuld bij import uit de boekhouding: die factuur hoort daar thuis. */
  externe_referentie: string | null;
  created_at: string;
  customer: { id: string; name: string | null } | null;
};

export type FactuurRegel = {
  id: string;
  factuur_id: string;
  company_id: string;
  type: string;
  omschrijving: string;
  aantal: number;
  eenheidsprijs: number;
  btw_pct: number;
  btw_regime: string;
  regelprijs: number;
  volgorde: number;
};

/**
 * Een verstuurde of betaalde factuur is alleen-lezen: de inhoud ligt vast.
 * Status (betaald markeren) en herinneringen mogen nog wel. Zelfde regel als
 * `FACTUUR_CONTENT_FIELDS` in het dashboard.
 */
export function inhoudLigtVast(f: Pick<FactuurRow, 'status'>): boolean {
  return !['concept', 'aangemaakt'].includes(f.status);
}

/** Geïmporteerde facturen horen in de boekhouding thuis, niet hier. */
export function isGeimporteerd(f: Pick<FactuurRow, 'externe_referentie'>): boolean {
  return Boolean(f.externe_referentie);
}

export async function listFacturen(
  limit = 100,
): Promise<{ data: FactuurRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('facturen')
    .select(FACTUUR_COLUMNS)
    .order('factuurdatum', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[factuurService.listFacturen]', error.message);
    return { data: [], error: 'Facturen konden niet worden geladen.' };
  }
  return { data: (data as unknown as FactuurRow[]) ?? [], error: null };
}

export async function getFactuurRegels(
  factuurId: string,
): Promise<{ data: FactuurRegel[]; error: string | null }> {
  const { data, error } = await supabase
    .from('factuur_regels')
    .select(REGEL_COLUMNS)
    .eq('factuur_id', factuurId)
    .order('volgorde', { ascending: true });
  if (error) {
    console.warn('[factuurService.getFactuurRegels]', error.message);
    return { data: [], error: 'Factuurregels konden niet worden geladen.' };
  }
  return { data: (data as unknown as FactuurRegel[]) ?? [], error: null };
}

/** Tijdelijke link naar de bewaarde factuur-PDF (privébucket `factuur-pdfs`). */
export async function getFactuurPdfUrl(factuurId: string): Promise<string | null> {
  const companyId = getCompanyId();
  if (!companyId) return null;
  const { data, error } = await supabase.storage
    .from('factuur-pdfs')
    .createSignedUrl(`${companyId}/${factuurId}.pdf`, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

// ── Nummering ──────────────────────────────────────────────────────────────

/**
 * Volgend factuurnummer: `BB-F001`, `BB-F002`, …
 *
 * Zie de toelichting bij `volgendOfferteNummer`: het dashboard telt rijen,
 * en dat botst zodra er ooit een factuur is verwijderd. Er is geen unique index
 * op `facturen.nummer`, dus de database vangt dat niet af. We kijken daarom
 * naar het hoogste bestaande nummer.
 */
export async function volgendFactuurNummer(): Promise<
  { ok: true; nummer: string } | { ok: false; melding: string }
> {
  const { data, error } = await supabase.from('facturen').select('nummer');
  if (error) {
    console.warn('[factuurService.volgendFactuurNummer]', error.message);
    return { ok: false, melding: 'Het factuurnummer kon niet worden bepaald. Probeer het opnieuw.' };
  }
  let hoogste = 0;
  for (const r of (data as { nummer: string | null }[]) ?? []) {
    const m = /^BB-F(\d+)/.exec(r.nummer ?? '');
    if (m) hoogste = Math.max(hoogste, Number(m[1]));
  }
  return { ok: true, nummer: `BB-F${String(hoogste + 1).padStart(3, '0')}` };
}

async function nummerAlInGebruik(nummer: string, behalveId: string): Promise<boolean> {
  const companyId = getCompanyId();
  if (!companyId) return false;
  const { data, error } = await supabase
    .from('facturen')
    .select('id')
    .eq('company_id', companyId)
    .eq('nummer', nummer)
    .neq('id', behalveId)
    .limit(1);
  if (error) return false;
  return ((data as { id: string }[]) ?? []).length > 0;
}

// ── Berekening ─────────────────────────────────────────────────────────────

/** Regelprijs = aantal × eenheidsprijs, op centen afgerond. */
export function berekenRegelprijs(aantal: number, eenheidsprijs: number): number {
  return Math.round(Number(aantal || 1) * Number(eenheidsprijs || 0) * 100) / 100;
}

/**
 * Totalen uit de regels — btw per tarief groeperen en per groep afronden,
 * dezelfde regel als de creditnota-berekening en de boekhoudexport. Het regime
 * is leidend: vrijgesteld of verlegd betekent geen btw.
 */
export function berekenFactuurTotalen(
  regels: { regelprijs: number; btw_pct: number | null; btw_regime: string }[],
): { totaal_excl: number; totaal_incl: number } {
  const excl = regels.reduce((s, r) => s + Number(r.regelprijs || 0), 0);
  const btwPerTarief: Record<number, number> = {};
  for (const r of regels) {
    if (r.btw_regime === 'vrijgesteld' || r.btw_regime === 'verlegd') continue;
    const pct = Number(r.btw_pct ?? 21);
    if (!pct) continue;
    btwPerTarief[pct] =
      Math.round(((btwPerTarief[pct] ?? 0) + (Number(r.regelprijs || 0) * pct) / 100) * 100) / 100;
  }
  const btw = Object.values(btwPerTarief).reduce((s, v) => s + v, 0);
  return {
    totaal_excl: Math.round(excl * 100) / 100,
    totaal_incl: Math.round((excl + btw) * 100) / 100,
  };
}

/** Vervaldatum uit factuurdatum + betaaltermijn. */
export function berekenVervaldatum(factuurdatum: string, termijnDagen: number): string {
  const [y, m, d] = factuurdatum.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  t.setUTCDate(t.getUTCDate() + (Number.isFinite(termijnDagen) ? termijnDagen : 14));
  return t.toISOString().slice(0, 10);
}

// ── Schrijven ──────────────────────────────────────────────────────────────

export type FactuurInput = {
  customer_id?: string | null;
  project_id?: string | null;
  factuurdatum?: string;
  betaaltermijn_dagen?: number;
  vervaldatum?: string | null;
  notities?: string | null;
  /** Totalen uit de regels; het dashboard geeft ze bij het aanmaken ook mee. */
  totaal_excl?: number;
  totaal_incl?: number;
};

function valideerFactuur(input: Partial<FactuurInput>): string | null {
  for (const [veld, label] of [
    ['factuurdatum', 'factuurdatum'],
    ['vervaldatum', 'vervaldatum'],
  ] as const) {
    const v = input[veld];
    if (v && !isGeldigeDatum(v)) return `Vul een geldige ${label} in (JJJJ-MM-DD).`;
  }
  if (
    input.betaaltermijn_dagen !== undefined &&
    (!Number.isInteger(input.betaaltermijn_dagen) ||
      input.betaaltermijn_dagen < 0 ||
      input.betaaltermijn_dagen > 365)
  ) {
    return 'Vul een betaaltermijn tussen 0 en 365 dagen in.';
  }
  return null;
}

export async function createFactuur(input: FactuurInput): Promise<WriteResult<FactuurRow>> {
  const fout = valideerFactuur(input);
  if (fout) return writeFout('validatie', fout);

  const nummerRes = await volgendFactuurNummer();
  if (!nummerRes.ok) return writeFout('onbekend', nummerRes.melding);

  const factuurdatum = input.factuurdatum || vandaagIso();
  const termijn = input.betaaltermijn_dagen ?? 14;

  const basis: Record<string, unknown> = {
    customer_id: input.customer_id || null,
    project_id: input.project_id || null,
    nummer: nummerRes.nummer,
    factuurdatum,
    vervaldatum: input.vervaldatum || berekenVervaldatum(factuurdatum, termijn),
    betaaltermijn_dagen: termijn,
    // Het dashboard zet het factuurnummer als standaard betalingskenmerk.
    betalingskenmerk: nummerRes.nummer,
    status: 'concept',
    notities: input.notities?.trim() || null,
    totaal_excl: Number(input.totaal_excl ?? 0),
    totaal_incl: Number(input.totaal_incl ?? 0),
  };
  Object.keys(basis).forEach((k) => basis[k] === null && delete basis[k]);

  const payload = withCompanyId(basis);
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  const res = await schrijf<FactuurRow>(
    () => supabase.from('facturen').insert(payload).select(FACTUUR_COLUMNS),
    {
      context: 'factuurService.createFactuur',
      bedrijfReadonly: isReadonly(),
      leegMelding:
        'De factuur is niet opgeslagen. Je hebt het recht Facturen nodig, en je abonnement ' +
        'moet ruimte hebben voor een nieuwe factuur.',
    },
  );
  if (!res.ok) return res;

  if (res.data.nummer && (await nummerAlInGebruik(res.data.nummer, res.data.id))) {
    const opnieuw = await volgendFactuurNummer();
    if (opnieuw.ok) {
      const herstel = await schrijf<FactuurRow>(
        () =>
          supabase
            .from('facturen')
            .update({ nummer: opnieuw.nummer, betalingskenmerk: opnieuw.nummer })
            .eq('id', res.data.id)
            .select(FACTUUR_COLUMNS),
        { context: 'factuurService.createFactuur.hernummer', bedrijfReadonly: isReadonly() },
      );
      if (herstel.ok) return herstel;
    }
  }

  return res;
}

export async function updateFactuur(
  id: string,
  input: Partial<FactuurInput> & { status?: string },
): Promise<WriteResult<FactuurRow>> {
  const fout = valideerFactuur(input);
  if (fout) return writeFout('validatie', fout);
  if (input.status === 'betaald') {
    return writeFout('validatie', 'Gebruik markeerBetaald om een factuur op betaald te zetten.');
  }
  if (input.status && !(input.status in FACTUUR_STATUS)) {
    return writeFout('validatie', 'Onbekende factuurstatus.');
  }

  const inhoudsVelden: (keyof FactuurInput)[] = [
    'vervaldatum',
    'notities',
    'customer_id',
    'project_id',
    'factuurdatum',
    'betaaltermijn_dagen',
  ];
  if (inhoudsVelden.some((k) => input[k] !== undefined)) {
    const { data: cur } = await supabase
      .from('facturen')
      .select('status, externe_referentie')
      .eq('id', id)
      .maybeSingle();
    const huidig = cur as { status: string; externe_referentie: string | null } | null;
    if (!huidig) return writeFout('niet-gevonden');
    if (isGeimporteerd(huidig)) {
      return writeFout(
        'op-slot',
        'Deze factuur komt uit je boekhouding en kan hier niet worden gewijzigd.',
      );
    }
    if (inhoudLigtVast(huidig)) {
      return writeFout(
        'op-slot',
        'Deze factuur is verstuurd en kan niet meer inhoudelijk wijzigen. De status en de ' +
          'betaalstand aanpassen kan wel.',
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (input.customer_id !== undefined) updates.customer_id = input.customer_id || null;
  if (input.project_id !== undefined) updates.project_id = input.project_id || null;
  if (input.factuurdatum !== undefined) updates.factuurdatum = input.factuurdatum;
  if (input.vervaldatum !== undefined) updates.vervaldatum = input.vervaldatum || null;
  if (input.betaaltermijn_dagen !== undefined) {
    updates.betaaltermijn_dagen = input.betaaltermijn_dagen;
  }
  if (input.notities !== undefined) updates.notities = input.notities?.trim() || null;
  if (input.status !== undefined) updates.status = input.status;

  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');
  updates.updated_at = new Date().toISOString();

  return schrijf<FactuurRow>(
    () => supabase.from('facturen').update(updates).eq('id', id).select(FACTUUR_COLUMNS),
    {
      context: 'factuurService.updateFactuur',
      bedrijfReadonly: isReadonly(),
      leegMelding: 'Er is niets gewijzigd. Je hebt het recht Facturen nodig.',
    },
  );
}

/**
 * Factuur op betaald zetten via `mark_factuur_betaald` — dezelfde RPC als de
 * Stripe-webhook gebruikt.
 *
 * De RPC geeft `{ changed: boolean }` terug. Was de factuur al betaald, dan is
 * `changed` false; dat is geen fout maar ook geen nieuwe boeking, en we melden
 * het als zodanig in plaats van "betaald gemarkeerd" te tonen alsof er net iets
 * gebeurde. Dubbel tikken kan hierdoor geen tweede boekhoudsync uitlokken.
 */
export async function markeerBetaald(
  id: string,
  betaaldOp?: string | null,
): Promise<WriteResult<{ factuur: FactuurRow; gewijzigd: boolean }>> {
  if (betaaldOp && !isGeldigeDatum(betaaldOp)) {
    return writeFout('validatie', 'Vul een geldige betaaldatum in (JJJJ-MM-DD).');
  }

  const { data, error } = await supabase.rpc('mark_factuur_betaald', {
    p_factuur_id: id,
    p_betaald_op: betaaldOp ?? null,
  });
  if (error) return classificeerFout(error, 'factuurService.markeerBetaald', isReadonly());

  const res = data as { changed?: boolean } | null;

  const { data: vers, error: leesFout } = await supabase
    .from('facturen')
    .select(FACTUUR_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (leesFout) return classificeerFout(leesFout, 'factuurService.markeerBetaald.lees');
  if (!vers) return writeFout('niet-gevonden');

  return {
    ok: true,
    data: { factuur: vers as unknown as FactuurRow, gewijzigd: res?.changed === true },
  };
}

export async function deleteFactuur(
  id: string,
): Promise<WriteStatus & { waarschuwing?: string }> {
  const { data: cur } = await supabase
    .from('facturen')
    .select('externe_referentie, gecrediteerd')
    .eq('id', id)
    .maybeSingle();
  const huidig = cur as { externe_referentie: string | null; gecrediteerd: boolean | null } | null;

  const res = await schrijf<{ id: string }>(
    () => supabase.from('facturen').delete().eq('id', id).select('id'),
    {
      context: 'factuurService.deleteFactuur',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De factuur is niet verwijderd. Je hebt het recht Facturen nodig.',
    },
  );
  if (!res.ok) {
    if (res.soort === 'conflict') {
      // FK facturen_credit_van_factuur_id_fkey: een creditnota die naar een
      // verdwenen factuur wijst breekt de audittrail.
      return writeFout(
        'conflict',
        'Deze factuur is gecrediteerd en kan niet verwijderd worden. Verwijder eerst de ' +
          'bijbehorende creditfactuur.',
      );
    }
    return res;
  }

  // Kwam de factuur uit de boekhouding, dan moet hij op de negeerlijst; anders
  // haalt de volgende synchronisatie hem gewoon terug. De factuur is op dit
  // punt écht weg, dus een mislukte prullenbak is een waarschuwing en geen
  // mislukte verwijdering — vandaar `waarschuwing` in plaats van een fout.
  if (huidig?.externe_referentie) {
    const waarschuwing = await negeerBijImport('factuur', huidig.externe_referentie);
    if (waarschuwing) return { ok: true, data: null, waarschuwing };
  }
  return { ok: true, data: null };
}

// ── Factuurregels ──────────────────────────────────────────────────────────

export type FactuurRegelInput = {
  factuur_id: string;
  omschrijving: string;
  aantal: number;
  eenheidsprijs: number;
  btw_pct?: number;
  btw_regime?: string;
  type?: string;
  volgorde?: number;
};

export async function createFactuurRegel(
  input: FactuurRegelInput,
): Promise<WriteResult<FactuurRegel>> {
  if (!input.factuur_id) return writeFout('validatie', 'Er is geen factuur gekozen.');
  if (!input.omschrijving.trim()) return writeFout('validatie', 'Vul een omschrijving in.');
  if (!Number.isFinite(input.aantal) || input.aantal <= 0) {
    return writeFout('validatie', 'Vul een geldig aantal in.');
  }
  if (!Number.isFinite(input.eenheidsprijs) || input.eenheidsprijs < 0) {
    return writeFout('validatie', 'Vul een geldige prijs in.');
  }

  const btwPct = input.btw_pct ?? 21;
  const basis = {
    factuur_id: input.factuur_id,
    type: input.type || 'stuks',
    omschrijving: input.omschrijving.trim(),
    aantal: Number(input.aantal),
    eenheidsprijs: Number(input.eenheidsprijs),
    btw_pct: btwPct,
    btw_regime: input.btw_regime || (btwPct === 0 ? 'vrijgesteld' : 'normaal'),
    regelprijs: berekenRegelprijs(input.aantal, input.eenheidsprijs),
    volgorde: Number(input.volgorde ?? 0),
  };

  const payload = withCompanyId(basis);
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');

  return schrijf<FactuurRegel>(
    () => supabase.from('factuur_regels').insert(payload).select(REGEL_COLUMNS),
    {
      context: 'factuurService.createFactuurRegel',
      bedrijfReadonly: isReadonly(),
      leegMelding:
        'De regel is niet opgeslagen. Factuurregels wijzigen kan alleen als beheerder of planner.',
    },
  );
}

export async function deleteFactuurRegel(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('factuur_regels').delete().eq('id', id).select('id'),
    {
      context: 'factuurService.deleteFactuurRegel',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'Factuurregels verwijderen kan alleen als beheerder.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

/** Zet de kop-totalen gelijk aan de som van de regels. */
export async function herberekenFactuurTotalen(
  factuurId: string,
): Promise<WriteResult<FactuurRow>> {
  const { data, error } = await getFactuurRegels(factuurId);
  if (error) return writeFout('onbekend', error);
  const totalen = berekenFactuurTotalen(
    data.map((r) => ({ regelprijs: r.regelprijs, btw_pct: r.btw_pct, btw_regime: r.btw_regime })),
  );
  return schrijf<FactuurRow>(
    () =>
      supabase
        .from('facturen')
        .update({ ...totalen, updated_at: new Date().toISOString() })
        .eq('id', factuurId)
        .select(FACTUUR_COLUMNS),
    { context: 'factuurService.herberekenFactuurTotalen', bedrijfReadonly: isReadonly() },
  );
}


// ── Factuur mét regels in één handeling ────────────────────────────────────

export type NieuweFactuurRegelInvoer = {
  omschrijving: string;
  type: string;
  aantal: number;
  eenheidsprijs: number;
  btw_pct: number;
  btw_regime: string;
};

/**
 * Maakt een factuur met al zijn regels, in dezelfde volgorde als de
 * factuurmodal van het dashboard: eerst de kop (met de totalen uit de regels),
 * daarna de regels.
 *
 * Net als bij offertes wordt er teruggelezen. Een door RLS geweigerde regel
 * komt bij PostgREST binnen als een lege uitkomst, niet als een fout; zonder
 * die controle kan er "factuur aangemaakt" op het scherm staan bij een factuur
 * zonder regels — en een factuur van € 0 is erger dan een foutmelding.
 *
 * Bij een halve uitkomst blijft de conceptfactuur staan (verwijderen mag lang
 * niet iedereen) en zegt de melding precies wat er wél en niet is opgeslagen.
 */
export async function createFactuurMetRegels(
  input: FactuurInput,
  regels: NieuweFactuurRegelInvoer[],
): Promise<WriteResult<{ factuur: FactuurRow; regels: FactuurRegel[] }>> {
  if (regels.length === 0) {
    return writeFout('validatie', 'Voeg minimaal één regel toe.');
  }

  const kop = await createFactuur(input);
  if (!kop.ok) return kop;

  const mislukt: string[] = [];
  for (let i = 0; i < regels.length; i++) {
    const r = regels[i]!;
    const res = await createFactuurRegel({
      factuur_id: kop.data.id,
      omschrijving: r.omschrijving,
      type: r.type,
      aantal: r.aantal,
      eenheidsprijs: r.eenheidsprijs,
      btw_pct: r.btw_pct,
      btw_regime: r.btw_regime,
      volgorde: i,
    });
    if (!res.ok) mislukt.push(`regel ${i + 1}: ${res.melding}`);
  }

  const terug = await getFactuurRegels(kop.data.id);
  if (terug.error) {
    return writeFout(
      'onbekend',
      `Factuur ${kop.data.nummer} is aangemaakt, maar de regels konden niet worden ` +
        'gecontroleerd. Open de factuur om te kijken wat erin staat.',
    );
  }
  if (mislukt.length > 0 || terug.data.length !== regels.length) {
    return writeFout(
      'onbekend',
      `Factuur ${kop.data.nummer} is aangemaakt, maar ${terug.data.length} van de ` +
        `${regels.length} regels zijn opgeslagen. ${mislukt[0] ?? ''}`.trim(),
    );
  }

  return { ok: true, data: { factuur: kop.data, regels: terug.data } };
}
