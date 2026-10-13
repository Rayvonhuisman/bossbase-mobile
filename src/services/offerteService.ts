import { supabase } from '@/lib/supabase';
import { getCompanyId, isReadonly, withCompanyId } from '@/lib/sessionContext';
import { isGeldigeDatum } from '@/lib/nlTijd';
import { schrijf, writeFout, type WriteResult, type WriteStatus } from '@/lib/writeResult';
import { haalInStukken } from '@/lib/inStukken';

/**
 * Offertes (`offertes`) en offerteregels (`offerte_items`).
 *
 * Statuswaarden, bevriezingsregel en berekening komen uit
 * `src/services/offerteService.js` op origin/main.
 *
 * Let op de asymmetrie in de RLS, want die is niet af te leiden uit het menu:
 * de offerte zélf hangt op het recht `offertes`, maar de REGELS hangen op de
 * ROL (admin of planner). Een medewerker met offerterecht mag dus wel een
 * offerte openen en de status bijwerken, en geen regels toevoegen. De app toont
 * die knoppen daarom apart.
 */

export const OFFERTE_STATUS: Record<string, string> = {
  concept: 'Concept',
  verzonden: 'Verzonden',
  geaccepteerd: 'Geaccepteerd',
  afgewezen: 'Afgewezen',
};

export const OFFERTE_STATUS_OPTIES = Object.entries(OFFERTE_STATUS).map(([id, label]) => ({
  id,
  label,
}));

const OFFERTE_COLUMNS = `
  id, company_id, customer_id, deal_id, nummer, omschrijving, status,
  arbeidsuren, uurtarief, materiaalkosten, reiskosten, marge_pct, btw_pct,
  totaal_excl, totaal_incl, geldig_tot, verzonden_op, geaccepteerd_op,
  signed_at, notes, created_at,
  customer:customers ( id, name )
`;

const ITEM_COLUMNS = `
  id, offerte_id, company_id, omschrijving, eenheid, type,
  aantal, prijs_per, subtotaal, btw_pct, btw_regime, volgorde
`;

export type OfferteRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  deal_id: string | null;
  nummer: string | null;
  omschrijving: string | null;
  status: string | null;
  arbeidsuren: number | null;
  uurtarief: number | null;
  materiaalkosten: number | null;
  reiskosten: number | null;
  marge_pct: number | null;
  btw_pct: number | null;
  totaal_excl: number | null;
  totaal_incl: number | null;
  geldig_tot: string | null;
  verzonden_op: string | null;
  geaccepteerd_op: string | null;
  signed_at: string | null;
  notes: string | null;
  created_at: string;
  customer: { id: string; name: string | null } | null;
};

export type OfferteItem = {
  id: string;
  offerte_id: string;
  company_id: string;
  omschrijving: string;
  eenheid: string | null;
  type: string | null;
  aantal: number;
  prijs_per: number;
  subtotaal: number;
  btw_pct: number | null;
  btw_regime: string;
  volgorde: number;
};

/**
 * Een verstuurde of ondertekende offerte is een vastgelegd document: de inhoud
 * ligt vast, de status mag nog wijzigen. Zelfde regel als
 * `OFFERTE_CONTENT_FIELDS` in het dashboard.
 */
export function inhoudLigtVast(o: Pick<OfferteRow, 'status' | 'signed_at'>): boolean {
  return o.status !== 'concept' || Boolean(o.signed_at);
}

export async function listOffertes(
  limit = 100,
): Promise<{ data: OfferteRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('offertes')
    .select(OFFERTE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[offerteService.listOffertes]', error.message);
    return { data: [], error: 'Offertes konden niet worden geladen.' };
  }
  return { data: (data as unknown as OfferteRow[]) ?? [], error: null };
}

export async function getOfferteItems(
  offerteId: string,
): Promise<{ data: OfferteItem[]; error: string | null }> {
  const { data, error } = await supabase
    .from('offerte_items')
    .select(ITEM_COLUMNS)
    .eq('offerte_id', offerteId)
    .order('volgorde', { ascending: true });
  if (error) {
    console.warn('[offerteService.getOfferteItems]', error.message);
    return { data: [], error: 'Offerteregels konden niet worden geladen.' };
  }
  return { data: (data as unknown as OfferteItem[]) ?? [], error: null };
}

// ── Nummering ──────────────────────────────────────────────────────────────

/**
 * Volgend offertenummer: `BB-001`, `BB-002`, …
 *
 * Het dashboard telt hiervoor de rijen (`count + 1`). Dat gaat mis zodra er
 * ooit een offerte is verwijderd: na het weggooien van BB-003 uit vier offertes
 * geeft de telling opnieuw BB-004, en dat nummer bestaat al. Er is géén unique
 * index op `offertes.nummer`, dus de database vangt dat niet af — er staan dan
 * twee offertes met hetzelfde nummer bij dezelfde klant.
 *
 * Daarom kijken we naar het HOOGSTE bestaande nummer in plaats van naar het
 * aantal. Dezelfde reeks, dezelfde opmaak, en in de normale situatie exact
 * dezelfde uitkomst — alleen zonder de botsing. De echte oplossing is een
 * unique index op (company_id, nummer); die staat als voorstel in
 * MOBILE_SERVERWIJZIGINGEN.sql en is server-werk.
 */
export async function volgendOfferteNummer(): Promise<
  { ok: true; nummer: string } | { ok: false; melding: string }
> {
  const { data, error } = await haalInStukken((van, tot) =>
    supabase.from('offertes').select('id, nummer').order('id', { ascending: true }).range(van, tot),
  );
  if (error) {
    console.warn('[offerteService.volgendOfferteNummer]', error.message);
    return { ok: false, melding: 'Het offertenummer kon niet worden bepaald. Probeer het opnieuw.' };
  }
  let hoogste = 0;
  for (const r of (data as { nummer: string | null }[]) ?? []) {
    const m = /^BB-(\d+)/.exec(r.nummer ?? '');
    if (m) hoogste = Math.max(hoogste, Number(m[1]));
  }
  return { ok: true, nummer: `BB-${String(hoogste + 1).padStart(3, '0')}` };
}

/** Bestaat dit nummer al binnen het bedrijf? Voor de controle ná het opslaan. */
async function nummerAlInGebruik(nummer: string, behalveId: string): Promise<boolean> {
  const companyId = getCompanyId();
  if (!companyId) return false;
  const { data, error } = await supabase
    .from('offertes')
    .select('id')
    .eq('company_id', companyId)
    .eq('nummer', nummer)
    .neq('id', behalveId)
    .limit(1);
  if (error) return false;
  return ((data as { id: string }[]) ?? []).length > 0;
}

// ── Berekening ─────────────────────────────────────────────────────────────

/**
 * `calculateOfferteTotals` uit het dashboard, letterlijk.
 *
 * Zijn de totalen al berekend (de regelmodus), dan gaan die er ongewijzigd
 * doorheen — dat is de vroege terugkeer die maakt dat `marge_pct` in de
 * praktijk nergens meer op wordt toegepast.
 */
export function berekenOfferteTotalen(input: {
  arbeidsuren?: number;
  uurtarief?: number;
  materiaalkosten?: number;
  reiskosten?: number;
  marge_pct?: number;
  btw_pct?: number;
  totaal_excl?: number;
  totaal_incl?: number;
}): { totaal_excl: number; totaal_incl: number } {
  if (input.totaal_excl !== undefined && input.totaal_incl !== undefined) {
    return { totaal_excl: input.totaal_excl, totaal_incl: input.totaal_incl };
  }
  const arbeid = Number(input.arbeidsuren ?? 0) * Number(input.uurtarief ?? 55);
  const subtotaal = arbeid + Number(input.materiaalkosten ?? 0) + Number(input.reiskosten ?? 0);
  const excl = subtotaal * (1 + Number(input.marge_pct ?? 25) / 100);
  const incl = excl * (1 + Number(input.btw_pct ?? 21) / 100);
  return {
    totaal_excl: Math.round(excl * 100) / 100,
    totaal_incl: Math.round(incl * 100) / 100,
  };
}

/** Regeltotaal, met dezelfde afronding als `createOfferteItem` in het dashboard. */
export function berekenRegelSubtotaal(aantal: number, prijsPer: number): number {
  return Math.round(Number(aantal || 1) * Number(prijsPer || 0) * 100) / 100;
}

/**
 * Totalen uit de regels. Btw per tarief groeperen en per groep afronden —
 * dezelfde regel als `useRegelTotals` en de boekhoudexport in het dashboard,
 * anders scheelt het centen. Het regime is leidend, niet het percentage:
 * vrijgesteld of verlegd betekent géén btw, ook als er een percentage staat.
 */
export function berekenTotalenUitRegels(
  regels: { subtotaal: number; btw_pct: number | null; btw_regime: string }[],
): { totaal_excl: number; totaal_incl: number } {
  const excl = regels.reduce((s, r) => s + Number(r.subtotaal || 0), 0);
  const btwPerTarief: Record<number, number> = {};
  for (const r of regels) {
    if (r.btw_regime === 'vrijgesteld' || r.btw_regime === 'verlegd') continue;
    const pct = Number(r.btw_pct ?? 21);
    if (!pct) continue;
    const bedrag = (Number(r.subtotaal || 0) * pct) / 100;
    btwPerTarief[pct] = Math.round(((btwPerTarief[pct] ?? 0) + bedrag) * 100) / 100;
  }
  const btw = Object.values(btwPerTarief).reduce((s, v) => s + v, 0);
  return {
    totaal_excl: Math.round(excl * 100) / 100,
    totaal_incl: Math.round((excl + btw) * 100) / 100,
  };
}

// ── Schrijven ──────────────────────────────────────────────────────────────

export type OfferteInput = {
  customer_id?: string | null;
  deal_id?: string | null;
  omschrijving?: string | null;
  arbeidsuren?: number;
  uurtarief?: number;
  materiaalkosten?: number;
  reiskosten?: number;
  btw_pct?: number;
  geldig_tot?: string | null;
  notes?: string | null;
  /**
   * Totalen uit de regels. Staan ze er, dan zijn ze leidend — precies zoals
   * `calculateOfferteTotals` in het dashboard meteen terugkeert zodra beide
   * meegegeven zijn. De oude velden (arbeidsuren × uurtarief + materiaal +
   * reis) blijven werken voor offertes zonder regels.
   */
  totaal_excl?: number;
  totaal_incl?: number;
};

function valideerOfferte(input: Partial<OfferteInput>): string | null {
  if (input.geldig_tot && !isGeldigeDatum(input.geldig_tot)) {
    return 'Vul een geldige datum in (JJJJ-MM-DD).';
  }
  for (const [veld, label] of [
    ['arbeidsuren', 'arbeidsuren'],
    ['uurtarief', 'uurtarief'],
    ['materiaalkosten', 'materiaalkosten'],
    ['reiskosten', 'reiskosten'],
  ] as const) {
    const v = input[veld];
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) return `Vul een geldig ${label} in.`;
  }
  if (
    input.btw_pct !== undefined &&
    (!Number.isFinite(input.btw_pct) || input.btw_pct < 0 || input.btw_pct > 100)
  ) {
    return 'Vul een geldig btw-percentage in.';
  }
  return null;
}

export async function createOfferte(input: OfferteInput): Promise<WriteResult<OfferteRow>> {
  const fout = valideerOfferte(input);
  if (fout) return writeFout('validatie', fout);

  const nummerRes = await volgendOfferteNummer();
  if (!nummerRes.ok) return writeFout('onbekend', nummerRes.melding);

  const totalen = berekenOfferteTotalen(input);
  const basis: Record<string, unknown> = {
    customer_id: input.customer_id || null,
    deal_id: input.deal_id || null,
    nummer: nummerRes.nummer,
    omschrijving: input.omschrijving?.trim() || null,
    status: 'concept',
    arbeidsuren: Number(input.arbeidsuren ?? 0),
    uurtarief: Number(input.uurtarief ?? 55),
    materiaalkosten: Number(input.materiaalkosten ?? 0),
    reiskosten: Number(input.reiskosten ?? 0),
    // Vervallen veld; de kolom blijft omdat de onderteken-RPC's hem in hun
    // signatuur hebben. `??` en niet `||`: 0 is falsy en werd stilzwijgend 25.
    marge_pct: 0,
    btw_pct: Number(input.btw_pct ?? 21),
    ...totalen,
    geldig_tot: input.geldig_tot || null,
    notes: input.notes?.trim() || null,
  };
  Object.keys(basis).forEach((k) => basis[k] === null && delete basis[k]);

  const payload = withCompanyId(basis);
  if (!payload) {
    return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen. Probeer het zo opnieuw.');
  }

  const res = await schrijf<OfferteRow>(
    () => supabase.from('offertes').insert(payload).select(OFFERTE_COLUMNS),
    {
      context: 'offerteService.createOfferte',
      bedrijfReadonly: isReadonly(),
      leegMelding:
        'De offerte is niet opgeslagen. Je hebt het recht Offertes nodig, en je abonnement ' +
        'moet ruimte hebben voor een nieuwe offerte.',
    },
  );
  if (!res.ok) return res;

  // Zonder unique index kan een gelijktijdige aanmaak hetzelfde nummer
  // opleveren. Eén keer terugkijken en zo nodig ophogen is goedkoop, en het
  // alternatief is twee offertes BB-007 die pas bij de klant opvallen.
  if (res.data.nummer && (await nummerAlInGebruik(res.data.nummer, res.data.id))) {
    const opnieuw = await volgendOfferteNummer();
    if (opnieuw.ok) {
      const herstel = await schrijf<OfferteRow>(
        () =>
          supabase
            .from('offertes')
            .update({ nummer: opnieuw.nummer })
            .eq('id', res.data.id)
            .select(OFFERTE_COLUMNS),
        { context: 'offerteService.createOfferte.hernummer', bedrijfReadonly: isReadonly() },
      );
      if (herstel.ok) return herstel;
    }
  }

  return res;
}

export async function updateOfferte(
  id: string,
  input: Partial<OfferteInput> & { status?: string },
): Promise<WriteResult<OfferteRow>> {
  const fout = valideerOfferte(input);
  if (fout) return writeFout('validatie', fout);
  if (input.status && !(input.status in OFFERTE_STATUS)) {
    return writeFout('validatie', 'Onbekende offertestatus.');
  }

  const inhoudsVelden: (keyof OfferteInput)[] = [
    'customer_id',
    'omschrijving',
    'geldig_tot',
    'notes',
    'arbeidsuren',
    'uurtarief',
    'materiaalkosten',
    'reiskosten',
    'btw_pct',
  ];
  const raaktInhoud = inhoudsVelden.some((k) => input[k] !== undefined);

  // Dezelfde voorcontrole als het dashboard: een verstuurde of ondertekende
  // offerte is een vastgelegd document.
  if (raaktInhoud) {
    const { data: cur } = await supabase
      .from('offertes')
      .select('status, signed_at')
      .eq('id', id)
      .maybeSingle();
    const huidig = cur as { status: string; signed_at: string | null } | null;
    if (!huidig) return writeFout('niet-gevonden');
    if (inhoudLigtVast(huidig)) {
      return writeFout(
        'op-slot',
        'Deze offerte is verstuurd of ondertekend en kan niet meer inhoudelijk wijzigen. ' +
          'De status aanpassen kan wel.',
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (input.customer_id !== undefined) updates.customer_id = input.customer_id || null;
  if (input.deal_id !== undefined) updates.deal_id = input.deal_id || null;
  if (input.omschrijving !== undefined) updates.omschrijving = input.omschrijving?.trim() || null;
  if (input.geldig_tot !== undefined) updates.geldig_tot = input.geldig_tot || null;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;
  if (input.status !== undefined) {
    updates.status = input.status;
    // Dezelfde momentopnames als het dashboard bij een statuswissel.
    if (input.status === 'verzonden') updates.verzonden_op = new Date().toISOString();
    if (input.status === 'geaccepteerd') updates.geaccepteerd_op = new Date().toISOString();
  }

  const financieel = (
    ['arbeidsuren', 'uurtarief', 'materiaalkosten', 'reiskosten', 'btw_pct'] as const
  ).some((k) => input[k] !== undefined);

  if (financieel) {
    const { data: cur } = await supabase.from('offertes').select('*').eq('id', id).maybeSingle();
    const huidig = (cur ?? {}) as Record<string, number>;
    const samen = {
      arbeidsuren: input.arbeidsuren ?? Number(huidig.arbeidsuren ?? 0),
      uurtarief: input.uurtarief ?? Number(huidig.uurtarief ?? 55),
      materiaalkosten: input.materiaalkosten ?? Number(huidig.materiaalkosten ?? 0),
      reiskosten: input.reiskosten ?? Number(huidig.reiskosten ?? 0),
      marge_pct: Number(huidig.marge_pct ?? 0),
      btw_pct: input.btw_pct ?? Number(huidig.btw_pct ?? 21),
    };
    Object.assign(updates, samen, berekenOfferteTotalen(samen));
  }

  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

  return schrijf<OfferteRow>(
    () => supabase.from('offertes').update(updates).eq('id', id).select(OFFERTE_COLUMNS),
    {
      context: 'offerteService.updateOfferte',
      bedrijfReadonly: isReadonly(),
      leegMelding: 'Er is niets gewijzigd. Je hebt het recht Offertes nodig.',
    },
  );
}

export async function deleteOfferte(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('offertes').delete().eq('id', id).select('id'),
    {
      context: 'offerteService.deleteOfferte',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'De offerte is niet verwijderd. Je hebt het recht Offertes nodig.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ── Offerteregels ──────────────────────────────────────────────────────────

export type OfferteItemInput = {
  offerte_id: string;
  omschrijving: string;
  eenheid?: string | null;
  /**
   * Regeltype uit `lib/regels.ts`: 'uren' | 'km' | 'vast' | 'eigen:<id>'.
   * Het dashboard bewaart dit zodat een regel bij het openen zijn eigen
   * eenheid, standaardprijs en btw terugkrijgt in plaats van geraden wordt.
   */
  type?: string | null;
  aantal: number;
  prijs_per: number;
  btw_pct?: number | null;
  btw_regime?: string;
  volgorde?: number;
};

/**
 * De btw-regimes uit `lib/btwRegime.js`. `normaal` is de standaard; de andere
 * twee betekenen géén btw op de regel, ongeacht het percentage.
 */
export const BTW_REGIMES = [
  { id: 'normaal', label: 'Normaal (btw)' },
  { id: 'verlegd', label: 'Btw verlegd' },
  { id: 'vrijgesteld', label: 'Vrijgesteld' },
] as const;

/** Regime afleiden uit het percentage, voor regels van vóór de regime-migratie. */
export function regimeVanPct(pct: number | null | undefined): string {
  return pct === 0 ? 'vrijgesteld' : 'normaal';
}

export async function createOfferteItem(
  input: OfferteItemInput,
): Promise<WriteResult<OfferteItem>> {
  if (!input.offerte_id) return writeFout('validatie', 'Er is geen offerte gekozen.');
  if (!input.omschrijving.trim()) return writeFout('validatie', 'Vul een omschrijving in.');
  if (!Number.isFinite(input.aantal) || input.aantal <= 0) {
    return writeFout('validatie', 'Vul een geldig aantal in.');
  }
  if (!Number.isFinite(input.prijs_per) || input.prijs_per < 0) {
    return writeFout('validatie', 'Vul een geldige prijs in.');
  }

  const btwPct = input.btw_pct ?? 21;
  const basis = {
    offerte_id: input.offerte_id,
    omschrijving: input.omschrijving.trim(),
    eenheid: input.eenheid?.trim() || null,
    type: input.type || null,
    btw_pct: btwPct,
    btw_regime: input.btw_regime || regimeVanPct(btwPct),
    aantal: Number(input.aantal),
    prijs_per: Number(input.prijs_per),
    subtotaal: berekenRegelSubtotaal(input.aantal, input.prijs_per),
    volgorde: Number(input.volgorde ?? 0),
  };

  const payload = withCompanyId(basis);
  if (!payload) return writeFout('onbekend', 'Je bedrijfsgegevens zijn nog niet geladen.');

  return schrijf<OfferteItem>(
    () => supabase.from('offerte_items').insert(payload).select(ITEM_COLUMNS),
    {
      context: 'offerteService.createOfferteItem',
      bedrijfReadonly: isReadonly(),
      leegMelding:
        'De regel is niet opgeslagen. Offerteregels wijzigen kan alleen als beheerder of planner.',
    },
  );
}

export async function updateOfferteItem(
  id: string,
  input: Partial<Omit<OfferteItemInput, 'offerte_id'>>,
): Promise<WriteResult<OfferteItem>> {
  const updates: Record<string, unknown> = {};
  if (input.omschrijving !== undefined) {
    if (!input.omschrijving.trim()) return writeFout('validatie', 'Vul een omschrijving in.');
    updates.omschrijving = input.omschrijving.trim();
  }
  if (input.eenheid !== undefined) updates.eenheid = input.eenheid?.trim() || null;
  if (input.btw_pct !== undefined) updates.btw_pct = input.btw_pct;
  if (input.btw_regime !== undefined) updates.btw_regime = input.btw_regime;
  if (input.volgorde !== undefined) updates.volgorde = Number(input.volgorde);

  if (input.aantal !== undefined || input.prijs_per !== undefined) {
    const { data: cur } = await supabase
      .from('offerte_items')
      .select('aantal, prijs_per')
      .eq('id', id)
      .maybeSingle();
    const huidig = (cur ?? {}) as { aantal?: number; prijs_per?: number };
    const aantal = input.aantal ?? Number(huidig.aantal ?? 1);
    const prijs = input.prijs_per ?? Number(huidig.prijs_per ?? 0);
    if (!Number.isFinite(aantal) || aantal <= 0) return writeFout('validatie', 'Vul een geldig aantal in.');
    if (!Number.isFinite(prijs) || prijs < 0) return writeFout('validatie', 'Vul een geldige prijs in.');
    updates.aantal = aantal;
    updates.prijs_per = prijs;
    updates.subtotaal = berekenRegelSubtotaal(aantal, prijs);
  }

  if (Object.keys(updates).length === 0) return writeFout('validatie', 'Er is niets gewijzigd.');

  return schrijf<OfferteItem>(
    () => supabase.from('offerte_items').update(updates).eq('id', id).select(ITEM_COLUMNS),
    {
      context: 'offerteService.updateOfferteItem',
      bedrijfReadonly: isReadonly(),
      leegMelding: 'Offerteregels wijzigen kan alleen als beheerder of planner.',
    },
  );
}

export async function deleteOfferteItem(id: string): Promise<WriteStatus> {
  const res = await schrijf<{ id: string }>(
    () => supabase.from('offerte_items').delete().eq('id', id).select('id'),
    {
      context: 'offerteService.deleteOfferteItem',
      bedrijfReadonly: isReadonly(),
      leegSoort: 'geen-rechten',
      leegMelding: 'Offerteregels verwijderen kan alleen als beheerder of planner.',
    },
  );
  return res.ok ? { ok: true, data: null } : res;
}

/**
 * Zet de kop-totalen gelijk aan de som van de regels. Wordt aangeroepen na elke
 * regelmutatie, zodat de lijst en de klantkaart hetzelfde bedrag tonen als de
 * offerte zelf.
 */
export async function herberekenOfferteTotalen(
  offerteId: string,
): Promise<WriteResult<OfferteRow>> {
  const { data, error } = await getOfferteItems(offerteId);
  if (error) return writeFout('onbekend', error);
  const totalen = berekenTotalenUitRegels(
    data.map((r) => ({ subtotaal: r.subtotaal, btw_pct: r.btw_pct, btw_regime: r.btw_regime })),
  );
  return schrijf<OfferteRow>(
    () => supabase.from('offertes').update(totalen).eq('id', offerteId).select(OFFERTE_COLUMNS),
    { context: 'offerteService.herberekenOfferteTotalen', bedrijfReadonly: isReadonly() },
  );
}

// ── Offerte mét regels in één handeling ────────────────────────────────────

export type NieuweRegelInvoer = {
  omschrijving: string;
  type: string;
  aantal: number;
  prijs_per: number;
  btw_pct: number;
  btw_regime: string;
};

/**
 * Maakt een offerte met al zijn regels, zoals de offertemodal van het dashboard
 * dat doet: eerst de kop (met de totalen uit de regels), daarna de regels op
 * volgorde.
 *
 * Wat de app hier extra doet, en waarom:
 *
 * - **Terugleescontrole.** Na afloop halen we de regels op en tellen we ze.
 *   PostgREST geeft bij een door RLS geweigerde insert geen fout maar een lege
 *   uitkomst; zonder deze controle zou "offerte aangemaakt" kunnen verschijnen
 *   bij een offerte zonder enkele regel.
 * - **Geen halve waarheid.** Mislukt een regel, dan blijft de offerte staan
 *   (weggooien kan een medewerker niet altijd — DELETE vraagt admin/planner) en
 *   krijgt de gebruiker te zien wélke regel niet is opgeslagen, met het nummer
 *   van de aangemaakte offerte erbij. Beter een eerlijke halve uitkomst dan een
 *   groen vinkje op een document dat niet klopt.
 */
export async function createOfferteMetRegels(
  input: OfferteInput,
  regels: NieuweRegelInvoer[],
): Promise<WriteResult<{ offerte: OfferteRow; regels: OfferteItem[] }>> {
  if (regels.length === 0) {
    return writeFout('validatie', 'Voeg minimaal één regel toe.');
  }

  const kop = await createOfferte(input);
  if (!kop.ok) return kop;

  const mislukt: string[] = [];
  for (let i = 0; i < regels.length; i++) {
    const r = regels[i]!;
    const res = await createOfferteItem({
      offerte_id: kop.data.id,
      omschrijving: r.omschrijving,
      type: r.type,
      aantal: r.aantal,
      prijs_per: r.prijs_per,
      btw_pct: r.btw_pct,
      btw_regime: r.btw_regime,
      volgorde: i,
    });
    if (!res.ok) mislukt.push(`regel ${i + 1}: ${res.melding}`);
  }

  // Teruglezen: alleen wat de database daadwerkelijk teruggeeft telt.
  const terug = await getOfferteItems(kop.data.id);
  if (terug.error) {
    return writeFout(
      'onbekend',
      `Offerte ${kop.data.nummer ?? ''} is aangemaakt, maar de regels konden niet worden ` +
        'gecontroleerd. Open de offerte om te kijken wat erin staat.',
    );
  }
  if (mislukt.length > 0 || terug.data.length !== regels.length) {
    return writeFout(
      'onbekend',
      `Offerte ${kop.data.nummer ?? ''} is aangemaakt, maar ${terug.data.length} van de ` +
        `${regels.length} regels zijn opgeslagen. ${mislukt[0] ?? ''}`.trim(),
    );
  }

  return { ok: true, data: { offerte: kop.data, regels: terug.data } };
}
