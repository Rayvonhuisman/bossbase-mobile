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
import { haalInStukken } from '@/lib/inStukken';
import {
  bouwCreditFactuur,
  btwPctVoorOpslag,
  magCrediteren,
  magFactuurVerwijderen,
  type CreditBronRegel,
} from '@/lib/documentLogica';
import { maakFactuurPdf } from '@/lib/pdf';
import { DOCUMENT_KLANT_KOLOMMEN, type DocumentKlant } from './offerteService';
import { logTijdlijn, tijdlijnBedrag } from './klantTijdlijnService';

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
  if (status === 'geboekt') return 'Uit SnelStart';
  if (status === 'vervallen') return 'Vervallen';
  return FACTUUR_STATUS[status] ?? status;
}

const FACTUUR_COLUMNS = `
  id, company_id, customer_id, project_id, nummer, factuurdatum, vervaldatum,
  betaaltermijn_dagen, betalingskenmerk, status, notities,
  totaal_excl, totaal_incl, betaald_op, is_credit, gecrediteerd,
  credit_van_factuur_id, externe_referentie, created_at,
  herinnering_1_verstuurd_at, herinnering_2_verstuurd_at,
  customer:customers ( id, name )
`;

const REGEL_COLUMNS = `
  id, factuur_id, company_id, type, omschrijving, aantal, eenheidsprijs,
  btw_pct, btw_regime, regelprijs, volgorde
`;
/** Met de groep (ruimte, onderdeel) uit de offerte; `factuur_groepen` bestaat sinds 27-10. */
const REGEL_COLUMNS_MET_GROEP = `${REGEL_COLUMNS}, groep:factuur_groepen ( id, naam, werkzaamheden, volgorde )`;

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
  herinnering_1_verstuurd_at: string | null;
  herinnering_2_verstuurd_at: string | null;
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
  /** Groep uit de offerte; ontbreekt als de database hem (nog) niet kent. */
  groep?: { id: string; naam: string; werkzaamheden: string | null; volgorde: number | null } | null;
};

/** De groep zoals `bb_factuur_aanmaken` en `bb_factuur_regels_vervangen` hem verwachten. */
export type FactuurRegelGroep = { sleutel: string; naam: string; werkzaamheden: string | null };

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

/**
 * Alle facturen, nieuwste eerst (zelfde sortering als het dashboard). Zonder
 * `limit` in stukken van 1000, zodat zoeken, filteren en de KPI's over de hele
 * lijst gaan.
 */
export async function listFacturen(
  limit?: number,
): Promise<{ data: FactuurRow[]; error: string | null }> {
  const basis = () =>
    supabase
      .from('facturen')
      .select(FACTUUR_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });

  const { data, error } =
    limit !== undefined
      ? await basis().limit(limit)
      : await haalInStukken((van, tot) => basis().range(van, tot));

  if (error) {
    console.warn('[factuurService.listFacturen]', error.message);
    return { data: [], error: 'Facturen konden niet worden geladen.' };
  }
  return { data: (data as unknown as FactuurRow[]) ?? [], error: null };
}

/** Eén factuur met herinneringen, bevroren bedrijfsgegevens en klantgegevens. */
export type FactuurDetail = Omit<FactuurRow, 'customer'> & {
  herinnering_1_verstuurd_at?: string | null;
  herinnering_2_verstuurd_at?: string | null;
  snapshot_bedrijfsnaam?: string | null;
  snapshot_logo_url?: string | null;
  snapshot_branding_color?: string | null;
  snapshot_adres?: string | null;
  snapshot_postcode?: string | null;
  snapshot_plaats?: string | null;
  snapshot_email?: string | null;
  snapshot_kvk?: string | null;
  snapshot_btw?: string | null;
  snapshot_iban?: string | null;
  snapshot_iban_tnv?: string | null;
  customer: DocumentKlant | null;
};

export async function getFactuurDetail(
  id: string,
): Promise<{ data: FactuurDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from('facturen')
    .select(`*, customer:customers ( ${DOCUMENT_KLANT_KOLOMMEN} )`)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.warn('[factuurService.getFactuurDetail]', error.message);
    return { data: null, error: 'De factuur kon niet worden geladen.' };
  }
  return { data: (data as unknown as FactuurDetail | null) ?? null, error: null };
}

/**
 * Welke facturen hebben een bewaarde PDF in `factuur-pdfs`? Eén listing van
 * de map van het bedrijf in plaats van een controle per rij — zoals
 * `getFacturenMetDocument` in het dashboard. Mislukt het, dan een lege set:
 * de app toont dan de afdrukweergave in plaats van een bestand.
 */
export async function listFacturenMetDocument(): Promise<Set<string>> {
  const companyId = getCompanyId();
  if (!companyId) return new Set();
  const { data, error } = await supabase.storage
    .from('factuur-pdfs')
    .list(companyId, { limit: 1000 });
  if (error) return new Set();
  return new Set(
    (data ?? [])
      .filter((o) => o.name?.endsWith('.pdf'))
      .map((o) => o.name.replace(/\.pdf$/, '')),
  );
}

export async function getFactuurRegels(
  factuurId: string,
): Promise<{ data: FactuurRegel[]; error: string | null }> {
  const lees = (kolommen: string) =>
    supabase.from('factuur_regels').select(kolommen).eq('factuur_id', factuurId).order('volgorde', { ascending: true });
  let { data, error } = await lees(REGEL_COLUMNS_MET_GROEP);
  // Relatie nog niet in de schemacache: zonder groepen, zoals het dashboard.
  if (error && (['PGRST200', 'PGRST204', '42703'].includes(error.code ?? '') || /factuur_groepen|schema cache/i.test(error.message ?? ''))) {
    ({ data, error } = await lees(REGEL_COLUMNS));
  }
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

// ── Restbedrag ─────────────────────────────────────────────────────────────

/**
 * Wat er van een factuur nog openstaat: het totaal min de creditnota's
 * (`bb_factuur_restbedrag`). Na een deelcreditering is dat minder dan het
 * totaal; herinneringen en de betaallink gaan over dit bedrag (audit
 * 2026-10-25, G-02). Bij een fout het meegegeven totaal.
 */
export async function factuurRestbedrag(id: string, terugval: number): Promise<number> {
  const { data, error } = await supabase.rpc('bb_factuur_restbedrag', { p_factuur_id: id });
  if (error || data == null) return Number(terugval) || 0;
  return Number(data);
}

// ── Nummering ──────────────────────────────────────────────────────────────

/**
 * Volgend factuurnummer: `BB-F001`, `BB-F002`, …
 *
 * Het echte nummer deelt de database uit bij het opslaan (trigger
 * `a02_factuur_nummer_uitdelen`, per bedrijf uniek en doorlopend, met een
 * unieke index — audit 2026-10-25, G-01). Wat de app meestuurt telt niet. Dit is
 * de voorproef voor het formulier, via `bb_volgend_factuurnummer`.
 */
export async function volgendFactuurNummer(): Promise<
  { ok: true; nummer: string } | { ok: false; melding: string }
> {
  const { data, error } = await supabase.rpc('bb_volgend_factuurnummer', { p_credit: false });
  if (error || typeof data !== 'string') {
    console.warn('[factuurService.volgendFactuurNummer]', error?.message);
    return { ok: false, melding: 'Het factuurnummer kon niet worden bepaald. Probeer het opnieuw.' };
  }
  return { ok: true, nummer: data };
}

/** Volgend creditnummer: `BB-CF001`, `BB-CF002`, … (voorproef; de database deelt uit). */
export async function volgendCreditNummer(): Promise<
  { ok: true; nummer: string } | { ok: false; melding: string }
> {
  const { data, error } = await supabase.rpc('bb_volgend_factuurnummer', { p_credit: true });
  if (error || typeof data !== 'string') {
    console.warn('[factuurService.volgendCreditNummer]', error?.message);
    return { ok: false, melding: 'Het creditnummer kon niet worden bepaald. Probeer het opnieuw.' };
  }
  return { ok: true, nummer: data };
}

// Vangnet van vóór de nummering in de database. Met de unieke index kan een
// nieuw nummer niet meer botsen, dus dit vindt niets; blijft voor oude rijen.
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
  /** Alleen bij aanmaken uit een offerte; de RPC controleert hem en zoekt het project erbij. */
  offerte_id?: string | null;
  factuurdatum?: string;
  betaaltermijn_dagen?: number;
  vervaldatum?: string | null;
  notities?: string | null;
  /** Standaard het factuurnummer; alleen bij een concept te wijzigen. */
  betalingskenmerk?: string | null;
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
  logAangemaakt(res.data);

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
    'betalingskenmerk',
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
  if (input.betalingskenmerk !== undefined) updates.betalingskenmerk = input.betalingskenmerk?.trim() || null;
  if (input.status !== undefined) updates.status = input.status;

  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');
  updates.updated_at = new Date().toISOString();

  const res = await schrijf<FactuurRow>(
    () => supabase.from('facturen').update(updates).eq('id', id).select(FACTUUR_COLUMNS),
    {
      context: 'factuurService.updateFactuur',
      bedrijfReadonly: isReadonly(),
      leegMelding: 'Er is niets gewijzigd. Je hebt het recht Facturen nodig.',
    },
  );
  if (res.ok && input.status === 'verzonden') logVerzonden(res.data);
  return res;
}

/** Tijdlijnregels zoals factuurService.js van het dashboard ze schrijft. */
function logAangemaakt(f: FactuurRow): void {
  if (!f.customer_id) return;
  if (f.is_credit) {
    void logTijdlijn(f.customer_id, 'creditfactuur_aangemaakt', `Creditfactuur ${f.nummer} aangemaakt`, {
      nummer: f.nummer,
    });
  } else {
    void logTijdlijn(
      f.customer_id,
      'factuur_aangemaakt',
      `Factuur ${f.nummer} aangemaakt (€${tijdlijnBedrag(f.totaal_incl)})`,
      { nummer: f.nummer, totaalIncl: Number(f.totaal_incl ?? 0) },
    );
  }
}

function logVerzonden(f: FactuurRow): void {
  if (!f.customer_id) return;
  void logTijdlijn(f.customer_id, 'factuur_verzonden', `Factuur ${f.nummer} verzonden naar klant`, {
    nummer: f.nummer,
  });
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
    // Vandaag in Nederland, niet `current_date` van de server (UTC): tussen
    // middernacht en 02:00 zou dat gisteren zijn.
    p_betaald_op: betaaldOp ?? vandaagIso(),
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
  const factuur = vers as unknown as FactuurRow;

  // Alleen bij een echte overgang naar betaald, net als `updateFactuur` in het
  // dashboard: één keer naar de boekhouding en één tijdlijnregel.
  if (res?.changed === true) {
    void syncFactuurNaarBoekhouding(id);
    if (factuur.customer_id) {
      void logTijdlijn(
        factuur.customer_id,
        'factuur_betaald',
        `Factuur ${factuur.nummer} betaald (€${tijdlijnBedrag(factuur.totaal_incl)})`,
        { nummer: factuur.nummer },
      );
    }
  }

  return { ok: true, data: { factuur, gewijzigd: res?.changed === true } };
}

/**
 * `syncFactuurNaarBoekhouding`: best-effort naar de gekoppelde boekhouding
 * (Moneybird en/of SnelStart), via dezelfde Edge Functions als het dashboard.
 * Welke gekoppeld zijn komt uit `get_accounting_status` (alleen een
 * `connected`-vlag, nooit tokens). Faalt stil.
 */
export async function syncFactuurNaarBoekhouding(factuurId: string): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('get_accounting_status');
    if (error) return;
    const rijen = (data as { provider: string; connected?: boolean }[] | null) ?? [];
    const gekoppeld = (p: string) => rijen.some((r) => r.provider === p && r.connected);
    const taken: Promise<unknown>[] = [];
    if (gekoppeld('moneybird')) {
      taken.push(supabase.functions.invoke('moneybird-sync-factuur', { body: { factuur_id: factuurId } }));
    }
    if (gekoppeld('snelstart')) {
      taken.push(supabase.functions.invoke('snelstart-sync-factuur', { body: { factuur_id: factuurId } }));
    }
    await Promise.allSettled(taken);
  } catch {
    /* best-effort */
  }
}

export async function deleteFactuur(
  id: string,
): Promise<WriteStatus & { waarschuwing?: string }> {
  const { data: cur } = await supabase
    .from('facturen')
    .select('status, externe_referentie, gecrediteerd')
    .eq('id', id)
    .maybeSingle();
  const huidig = cur as {
    status: string;
    externe_referentie: string | null;
    gecrediteerd: boolean | null;
  } | null;
  // Zelfde regel als het dashboard (`magFactuurVerwijderen`): alleen een
  // concept, of een factuur uit de boekhouding.
  if (huidig && !magFactuurVerwijderen(huidig)) {
    return writeFout(
      'op-slot',
      'Een verstuurde factuur of creditnota kun je niet verwijderen. Crediteer hem in plaats daarvan.',
    );
  }

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
    // Trigger `bb_factuur_concept_verwijderen`: een ouder concept heeft al een
    // nummer in de reeks; verwijderen zou een gat geven. Dan "vervallen".
    if (/op vervallen/i.test(res.technisch ?? '')) {
      return writeFout(
        'op-slot',
        'Deze factuur heeft al een nummer in de reeks en kan daarom niet weg. Zet hem op Vervallen: hij blijft in de lijst staan, telt nergens meer mee en kan niet meer worden verstuurd.',
        'vervallen_ipv_verwijderen',
      );
    }
    // Trigger `bb_factuur_verzonden_bevriezen`: alleen een concept mag weg.
    if (res.soort === 'validatie' && /verstuurde factuur|creditnota/i.test(res.technisch ?? '')) {
      return writeFout(
        'op-slot',
        'Een verstuurde factuur of creditnota kun je niet verwijderen. Maak een creditnota om hem te corrigeren.',
      );
    }
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

  const btwRegime = input.btw_regime || (input.btw_pct === 0 ? 'vrijgesteld' : 'normaal');
  const basis = {
    factuur_id: input.factuur_id,
    type: input.type || 'stuks',
    omschrijving: input.omschrijving.trim(),
    aantal: Number(input.aantal),
    eenheidsprijs: Number(input.eenheidsprijs),
    btw_pct: btwPctVoorOpslag(input.btw_pct, btwRegime),
    btw_regime: btwRegime,
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
      leegMelding: 'De regel is niet opgeslagen. Je hebt het recht Facturen nodig.',
    },
  );
}

/**
 * Een concept op "vervallen" zetten: het nummer blijft in de reeks, de factuur
 * telt nergens meer mee en kan niet meer worden verstuurd. De database staat
 * dit alleen toe vanuit concept (`bb_factuur_vervallen_slot`).
 */
export async function zetFactuurVervallen(id: string): Promise<WriteResult<FactuurRow>> {
  return schrijf<FactuurRow>(
    () => supabase.from('facturen').update({ status: 'vervallen' }).eq('id', id).select(FACTUUR_COLUMNS),
    { context: 'factuurService.zetFactuurVervallen', bedrijfReadonly: isReadonly() },
  );
}

export async function deleteFactuurRegel(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('factuur_regels').delete().eq('id', id).select('id'),
    {
      context: 'factuurService.deleteFactuurRegel',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De regel is niet verwijderd. Je hebt het recht Facturen nodig.',
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


// ── Factuur mét regels in één transactie ───────────────────────────────────

type RpcRegel = {
  type: string;
  omschrijving: string;
  aantal: number;
  eenheidsprijs: number;
  btw_pct: number;
  btw_regime: string;
  volgorde: number;
  groep?: FactuurRegelGroep;
};

const naarRpcRegels = (regels: NieuweFactuurRegelInvoer[]): RpcRegel[] =>
  regels.map((r, i) => ({
    type: r.type || 'stuks',
    omschrijving: r.omschrijving.trim(),
    aantal: Number(r.aantal),
    eenheidsprijs: Number(r.eenheidsprijs),
    btw_pct: r.btw_pct,
    btw_regime: r.btw_regime || (r.btw_pct === 0 ? 'vrijgesteld' : 'normaal'),
    volgorde: i,
    ...(r.groep?.naam ? { groep: r.groep } : {}),
  }));

/**
 * Kop en regels in één transactie via de RPC `bb_factuur_aanmaken` — dezelfde
 * route als `maakFactuurMetRegels` in het dashboard (SECURITY INVOKER: RLS,
 * recht `facturen`, alleen-lezen en planlimiet blijven gelden). Faalt één
 * regel, dan bestaat de factuur niet: geen halve factuur met een verbruikt
 * nummer. Bij een creditnota zet de RPC het origineel in dezelfde transactie op
 * `gecrediteerd`.
 *
 * Voor een creditnota is dit de énige werkende route: die staat meteen op
 * `verzonden`, en de trigger `bb_factuur_regels_op_slot` weigert regels op een
 * niet-concept factuur die niet in dezelfde transactie is aangemaakt.
 */
async function maakViaRpc(
  kop: Record<string, unknown>,
  regels: RpcRegel[],
  context: string,
): Promise<WriteResult<FactuurRow>> {
  const p_regels = regels.map((r) => ({
    ...r,
    btw_pct: btwPctVoorOpslag(r.btw_pct, r.btw_regime),
  }));
  const { data: id, error } = await supabase.rpc('bb_factuur_aanmaken', {
    p_kop: kop,
    p_regels,
  });
  if (error) {
    const hint = String((error as { hint?: string }).hint ?? '');
    if (hint === 'limiet') return writeFout('plan-limiet', error.message);
    if (/verlegd_nul_check/.test(error.message ?? '')) {
      return writeFout(
        'validatie',
        'Bij btw verlegd of vrijgesteld hoort 0% btw. Kies het regime opnieuw en probeer het nog eens.',
      );
    }
    if (error.code === '22023') return writeFout('validatie', error.message);
    return classificeerFout(error, context, isReadonly());
  }
  if (!id) return writeFout('onbekend', 'De factuur is niet aangemaakt.');

  const { data: vers, error: leesFout } = await supabase
    .from('facturen')
    .select(FACTUUR_COLUMNS)
    .eq('id', id as string)
    .maybeSingle();
  if (leesFout) return classificeerFout(leesFout, `${context}.lees`);
  if (!vers) return writeFout('niet-gevonden');
  return { ok: true, data: vers as unknown as FactuurRow };
}

export type NieuweFactuurRegelInvoer = {
  omschrijving: string;
  type: string;
  aantal: number;
  eenheidsprijs: number;
  btw_pct: number;
  btw_regime: string;
  /** Groep uit de offerte: de database maakt per sleutel één factuurgroep. */
  groep?: FactuurRegelGroep;
};

/**
 * Maakt een factuur met al zijn regels in één transactie (`bb_factuur_aanmaken`,
 * zoals het dashboard). De totalen rekent de databasetrigger uit de regels.
 *
 * Daarna nog de nummercontrole van `createFactuur`: er is geen unique index op
 * het nummer, en een concept mag nog hernummerd worden.
 */
export async function createFactuurMetRegels(
  input: FactuurInput,
  regels: NieuweFactuurRegelInvoer[],
): Promise<WriteResult<{ factuur: FactuurRow; regels: FactuurRegel[] }>> {
  if (regels.length === 0) {
    return writeFout('validatie', 'Voeg minimaal één regel toe.');
  }
  const fout = valideerFactuur(input);
  if (fout) return writeFout('validatie', fout);
  for (const [i, r] of regels.entries()) {
    if (!r.omschrijving.trim()) return writeFout('validatie', `Regel ${i + 1}: vul een omschrijving in.`);
    if (!Number.isFinite(r.aantal) || r.aantal <= 0) {
      return writeFout('validatie', `Regel ${i + 1}: vul een geldig aantal in.`);
    }
    if (!Number.isFinite(r.eenheidsprijs) || r.eenheidsprijs < 0) {
      return writeFout('validatie', `Regel ${i + 1}: vul een geldige prijs in.`);
    }
  }

  const nummerRes = await volgendFactuurNummer();
  if (!nummerRes.ok) return writeFout('onbekend', nummerRes.melding);

  const factuurdatum = input.factuurdatum || vandaagIso();
  const termijn = input.betaaltermijn_dagen ?? 14;
  const kop = await maakViaRpc(
    {
      customer_id: input.customer_id || null,
      project_id: input.project_id || null,
      offerte_id: input.offerte_id || null,
      nummer: nummerRes.nummer,
      factuurdatum,
      vervaldatum: input.vervaldatum || berekenVervaldatum(factuurdatum, termijn),
      betaaltermijn_dagen: termijn,
      betalingskenmerk: nummerRes.nummer,
      notities: input.notities?.trim() || null,
    },
    naarRpcRegels(regels),
    'factuurService.createFactuurMetRegels',
  );
  if (!kop.ok) return kop;

  let factuur = kop.data;
  if (factuur.nummer && (await nummerAlInGebruik(factuur.nummer, factuur.id))) {
    const opnieuw = await volgendFactuurNummer();
    if (opnieuw.ok) {
      const herstel = await schrijf<FactuurRow>(
        () =>
          supabase
            .from('facturen')
            .update({ nummer: opnieuw.nummer, betalingskenmerk: opnieuw.nummer })
            .eq('id', factuur.id)
            .select(FACTUUR_COLUMNS),
        { context: 'factuurService.createFactuurMetRegels.hernummer', bedrijfReadonly: isReadonly() },
      );
      if (herstel.ok) factuur = herstel.data;
    }
  }

  logAangemaakt(factuur);
  const terug = await getFactuurRegels(factuur.id);
  return { ok: true, data: { factuur, regels: terug.data } };
}


/**
 * Regels en kop van een concept in één transactie opslaan (RPC
 * `bb_factuur_regels_vervangen`, zoals `slaConceptOp` in het dashboard): alles
 * of niets. `regels` null laat de regels ongemoeid. Bedragen en btw rekent de
 * database; de status gaat hier niet mee. De functie weigert zelf een factuur
 * die geen concept meer is, zonder recht Facturen of op alleen-lezen.
 */
export async function slaFactuurConceptOp(
  factuurId: string,
  regels: NieuweFactuurRegelInvoer[] | null,
  kop: { vervaldatum: string | null; betalingskenmerk: string; notities: string } | null,
): Promise<WriteStatus> {
  if (regels) {
    if (regels.length === 0) return writeFout('validatie', 'Een factuur heeft minstens één regel nodig.');
    for (const [i, r] of regels.entries()) {
      if (!r.omschrijving.trim()) return writeFout('validatie', `Regel ${i + 1}: vul een omschrijving in.`);
      if (!Number.isFinite(r.aantal) || !Number.isFinite(r.eenheidsprijs)) {
        return writeFout('validatie', `Regel ${i + 1}: vul een geldig aantal en een geldige prijs in.`);
      }
    }
  }
  const { error } = await supabase.rpc('bb_factuur_regels_vervangen', {
    p_factuur_id: factuurId,
    p_regels: regels
      ? naarRpcRegels(regels).map((r) => ({ ...r, btw_pct: btwPctVoorOpslag(r.btw_pct, r.btw_regime) }))
      : null,
    p_kop: kop,
  });
  if (error) {
    const hint = String((error as { hint?: string }).hint ?? '');
    if (hint === 'readonly') return writeFout('readonly', error.message);
    if (hint === 'geen_recht') return writeFout('geen-rechten', error.message);
    if (error.code === '22023' || error.code === '23514') return writeFout('validatie', error.message);
    return classificeerFout(error, 'factuurService.slaFactuurConceptOp', isReadonly());
  }
  return { ok: true, data: null };
}

// ── Creditfactuur ──────────────────────────────────────────────────────────

const SNAPSHOT_VELDEN = [
  'snapshot_logo_url',
  'snapshot_branding_color',
  'snapshot_bedrijfsnaam',
  'snapshot_adres',
  'snapshot_postcode',
  'snapshot_plaats',
  'snapshot_email',
  'snapshot_kvk',
  'snapshot_btw',
  'snapshot_iban',
  'snapshot_iban_tnv',
] as const;

/**
 * Een factuur volledig crediteren, zoals "Crediteer factuur" in het dashboard
 * (`createCreditFactuur`): nummer `BB-CF…`, status meteen `verzonden`,
 * notitie "Creditering van factuur …", alle regels met negatieve prijs, de
 * bevroren bedrijfsgegevens van het origineel, en het origineel krijgt
 * `gecrediteerd = true` — alles in één transactie via `bb_factuur_aanmaken`.
 *
 * De vorige versie deed losse inserts: de kop (status `verzonden`) lukte, de
 * regels weigerde de trigger `bb_factuur_regels_op_slot`, en er bleef een lege
 * creditnota met een verbruikt BB-CF-nummer achter die niet meer te
 * verwijderen is.
 *
 * Gedeeltelijk crediteren geeft de gekozen regels mee; verder dezelfde route.
 */
export async function createCreditFactuur(
  origineelId: string,
  /**
   * Gedeeltelijk crediteren (`CrediteerModal` → "Gedeeltelijk"): alleen deze
   * regels, met hun aangepaste aantal en prijs. Weglaten = volledig.
   */
  gekozenRegels?: CreditBronRegel[],
): Promise<WriteResult<FactuurRow>> {
  const { data: org, error: orgFout } = await supabase
    .from('facturen')
    .select('*')
    .eq('id', origineelId)
    .maybeSingle();
  if (orgFout) return classificeerFout(orgFout, 'factuurService.createCreditFactuur.lees');
  const origineel = org as (Record<string, unknown> & FactuurRow) | null;
  if (!origineel) return writeFout('niet-gevonden');
  if (!magCrediteren(origineel)) {
    return writeFout(
      'op-slot',
      'Deze factuur kan niet gecrediteerd worden. Alleen een verzonden of betaalde factuur ' +
        'die nog niet gecrediteerd is, kan een creditfactuur krijgen.',
    );
  }

  const regelRes = await getFactuurRegels(origineelId);
  if (regelRes.error) return writeFout('onbekend', regelRes.error);
  if (regelRes.data.length === 0) {
    return writeFout('validatie', 'Deze factuur heeft geen regels om te crediteren.');
  }

  const nummerRes = await volgendCreditNummer();
  if (!nummerRes.ok) return writeFout('onbekend', nummerRes.melding);

  // Kop, regels en `gecrediteerd = true` op het origineel in één transactie,
  // zoals het dashboard. De totalen rekent de databasetrigger uit de regels.
  if (gekozenRegels && gekozenRegels.length === 0) {
    return writeFout('validatie', 'Selecteer minimaal één regel.');
  }
  const credit = bouwCreditFactuur(gekozenRegels ?? regelRes.data);
  const kop: Record<string, unknown> = {
    customer_id: origineel.customer_id,
    project_id: origineel.project_id,
    nummer: nummerRes.nummer,
    factuurdatum: vandaagIso(),
    notities: `Creditering van factuur ${origineel.nummer}`,
    is_credit: true,
    credit_van_factuur_id: origineelId,
  };
  for (const veld of SNAPSHOT_VELDEN) kop[veld] = origineel[veld] ?? null;

  const res = await maakViaRpc(
    kop,
    credit.regels.map(({ regelprijs: _r, ...r }) => r),
    'factuurService.createCreditFactuur',
  );
  if (res.ok) logAangemaakt(res.data);
  return res;
}

// ── PDF bewaren (utils/bewaarFactuurPdf.js) ────────────────────────────────

/**
 * `uploadFactuurPdf`: de PDF in de privébucket `factuur-pdfs`, pad
 * `{company_id}/{factuur_id}.pdf`, upsert. Server-side flows zonder browser
 * lezen deze kopie: de Stripe-webhook (bijlage bij de betaalbevestiging) en de
 * boekhoudkoppeling (brondocument bij de verkoopboeking). Daarna de
 * bijlagevlaggen terug op "nog te sturen", zodat een al geboekte factuur zijn
 * document alsnog krijgt. Best-effort: geeft false bij een fout.
 */
export async function uploadFactuurPdf(factuurId: string, companyId: string, bytes: Uint8Array): Promise<boolean> {
  if (!factuurId || !companyId || !bytes?.length) return false;
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const { error } = await supabase.storage
      .from('factuur-pdfs')
      .upload(`${companyId}/${factuurId}.pdf`, buffer, { contentType: 'application/pdf', upsert: true });
    if (error) {
      console.warn('[factuurService.uploadFactuurPdf]', error.message);
      return false;
    }
    await supabase
      .from('facturen')
      .update({ snelstart_bijlage_gesynct: false })
      .eq('id', factuurId)
      .eq('snelstart_bijlage_gesynct', true);
    await supabase
      .from('facturen')
      .update({ moneybird_bijlage_gesynct: false })
      .eq('id', factuurId)
      .eq('moneybird_bijlage_gesynct', true);
    return true;
  } catch {
    return false;
  }
}

/**
 * `bewaarFactuurPdf`: de factuur-PDF maken (dezelfde opmaak als het
 * dashboard, met de bevroren bedrijfsgegevens als die er zijn) en bewaren.
 * Aanroepen zodra een factuur definitief wordt: versturen per mail, of op
 * verzonden/betaald zetten. Best-effort: een mislukte PDF blokkeert niets.
 */
export async function bewaarFactuurPdf(factuurId: string): Promise<boolean> {
  const companyId = getCompanyId();
  if (!factuurId || !companyId) return false;
  try {
    const pdf = await maakFactuurPdf(factuurId);
    return await uploadFactuurPdf(factuurId, companyId, pdf.bytes);
  } catch (e) {
    console.warn('[factuurService.bewaarFactuurPdf]', e instanceof Error ? e.message : e);
    return false;
  }
}

// ── Versturen en herinneren ────────────────────────────────────────────────

/**
 * Na het mailen van een concept: status verzonden en de bedrijfsgegevens
 * (met IBAN) bevriezen — `updateFactuur(id, { status: 'verzonden',
 * ...buildCompanySnapshot(company, { metIban: true }) })` in het dashboard.
 */
export async function markeerFactuurVerstuurd(
  id: string,
  snapshot: Record<string, string | null>,
): Promise<WriteResult<FactuurRow>> {
  const res = await schrijf<FactuurRow>(
    () =>
      supabase
        .from('facturen')
        .update({ status: 'verzonden', ...snapshot, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(FACTUUR_COLUMNS),
    { context: 'factuurService.markeerFactuurVerstuurd', bedrijfReadonly: isReadonly() },
  );
  if (res.ok) logVerzonden(res.data);
  return res;
}

/**
 * Herinnering 1 of 2 vastleggen (`herinnering_N_verstuurd_at`) met de regel op
 * de klanttijdlijn. Zonder de feature `betaalherinneringen` weigert een
 * trigger op `facturen` dit; die melding komt dan gewoon terug.
 */
export async function zetHerinneringVerstuurd(
  f: Pick<FactuurRow, 'id' | 'nummer' | 'customer_id'>,
  nr: 1 | 2,
): Promise<WriteResult<FactuurRow>> {
  const kolom = nr === 1 ? 'herinnering_1_verstuurd_at' : 'herinnering_2_verstuurd_at';
  const res = await schrijf<FactuurRow>(
    () =>
      supabase
        .from('facturen')
        .update({ [kolom]: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', f.id)
        .select(FACTUUR_COLUMNS),
    { context: 'factuurService.zetHerinneringVerstuurd', bedrijfReadonly: isReadonly() },
  );
  if (res.ok && f.customer_id) {
    void logTijdlijn(
      f.customer_id,
      'herinnering_verstuurd',
      `Betaalherinnering ${nr} verstuurd voor factuur ${f.nummer}`,
      { nummer: f.nummer },
    );
  }
  return res;
}

// ── Kopiëren ───────────────────────────────────────────────────────────────

/**
 * `kopieerFactuur`: een NIEUWE, losse conceptfactuur met dezelfde klant,
 * project, betaaltermijn, notities en regels. Geen versie: een verstuurde
 * factuur is een boekstuk en blijft onaangeroerd. Status, betaaldatum,
 * herkomst, creditverwijzing, snapshot en herinneringen gaan niet mee.
 */
export async function kopieerFactuur(bronId: string): Promise<WriteResult<FactuurRow>> {
  const { data: bronRij, error } = await supabase.from('facturen').select('*').eq('id', bronId).maybeSingle();
  if (error) return classificeerFout(error, 'factuurService.kopieerFactuur.lees');
  const bron = bronRij as FactuurRow | null;
  if (!bron) return writeFout('niet-gevonden');
  const regels = await getFactuurRegels(bronId);
  if (regels.error) return writeFout('onbekend', regels.error);
  const nummerRes = await volgendFactuurNummer();
  if (!nummerRes.ok) return writeFout('onbekend', nummerRes.melding);

  const res = await maakViaRpc(
    {
      customer_id: bron.customer_id,
      project_id: bron.project_id,
      nummer: nummerRes.nummer,
      factuurdatum: vandaagIso(),
      betaaltermijn_dagen: bron.betaaltermijn_dagen,
      notities: bron.notities,
    },
    regels.data.map((r) => ({
      type: r.type || 'stuks',
      omschrijving: r.omschrijving,
      aantal: Number(r.aantal),
      eenheidsprijs: Number(r.eenheidsprijs),
      btw_pct: Number(r.btw_pct ?? 21),
      btw_regime: r.btw_regime || (Number(r.btw_pct) === 0 ? 'vrijgesteld' : 'normaal'),
      volgorde: Number(r.volgorde ?? 0),
      // Groepen gaan mee: de database maakt per sleutel één nieuwe factuurgroep.
      ...(r.groep?.naam ? { groep: { sleutel: r.groep.id, naam: r.groep.naam, werkzaamheden: r.groep.werkzaamheden } } : {}),
    })),
    'factuurService.kopieerFactuur',
  );
  if (res.ok) logAangemaakt(res.data);
  return res;
}

// ── Betaaltermijn ──────────────────────────────────────────────────────────

/**
 * De betaaltermijn voor een nieuwe factuur, zoals `NewFactuurModal`: die van
 * de klant als hij er een heeft (0 = direct betalen telt ook), anders die uit
 * Instellingen → Algemeen (`bedrijfsinstellingen.betaaltermijn_dagen`), anders
 * 14 dagen. Vers opgehaald: een termijn die net op de klantkaart is gezet telt.
 */
export async function standaardBetaaltermijn(customerId: string | null): Promise<number> {
  if (customerId) {
    const { data } = await supabase
      .from('customers')
      .select('betaaltermijn_dagen')
      .eq('id', customerId)
      .maybeSingle();
    const v = (data as { betaaltermijn_dagen?: number | string | null } | null)?.betaaltermijn_dagen;
    if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  const { data: inst } = await supabase
    .from('bedrijfsinstellingen')
    .select('betaaltermijn_dagen')
    .limit(1)
    .maybeSingle();
  const b = (inst as { betaaltermijn_dagen?: number | null } | null)?.betaaltermijn_dagen;
  if (b !== null && b !== undefined && Number.isFinite(Number(b))) return Number(b);
  return 14;
}

/**
 * Welke offertes al een factuur hebben (via "Maak factuur", kolom `offerte_id`),
 * zoals `getFactuurnummersPerOfferte` in het dashboard. Vervallen facturen en
 * creditnota's tellen niet. Zonder recht op facturen of bij een fout: leeg.
 */
export async function factuurnummersPerOfferte(): Promise<Map<string, string[]>> {
  const per = new Map<string, string[]>();
  const { data, error } = await haalInStukken((van, tot) =>
    supabase
      .from('facturen')
      .select('id, offerte_id, nummer')
      .not('offerte_id', 'is', null)
      .neq('status', 'vervallen')
      .eq('is_credit', false)
      .order('id')
      .range(van, tot),
  );
  if (error) return per;
  for (const r of (data ?? []) as { offerte_id: string; nummer: string | null }[]) {
    per.set(r.offerte_id, [...(per.get(r.offerte_id) ?? []), r.nummer ?? '']);
  }
  return per;
}
