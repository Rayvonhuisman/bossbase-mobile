import { supabase } from '@/lib/supabase';
import { describeError } from '@/lib/errors';
import { metTijdslimiet } from '@/lib/queryTijdslimiet';

/**
 * Onderhoudscontracten met SLA, de app-kant (09-11-2026). De app beheert geen
 * contracten: hij leest ze, toont de SLA op de werkbon en kan een
 * storingswerkbon onder een contract hangen. Installaties bekijken en
 * toevoegen kan wel.
 *
 * Rechten (database, migratie 20261109150000):
 *   contracten, beurten     — lezen met recht `contracten` (admin altijd)
 *   installaties            — lezen hele bedrijf; schrijven admin, `contracten`
 *                             of `klanten_bewerken`, plus feature contracten
 *   bb_werkbon_contract_info — wie de werkbon mag zien; geen prijzen
 *   bb_klant_contracten     — planning, werkbonnen_bewerken of contracten
 */

export type ContractStatus = 'concept' | 'ter_ondertekening' | 'actief' | 'opgezegd' | 'afgelopen';

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  concept: 'Concept',
  ter_ondertekening: 'Ter ondertekening',
  actief: 'Actief',
  opgezegd: 'Opgezegd',
  afgelopen: 'Afgelopen',
};

export const FACTUUR_RITME_LABEL: Record<string, string> = {
  maand: 'per maand',
  kwartaal: 'per kwartaal',
  halfjaar: 'per halfjaar',
  jaar: 'per jaar',
};

export type Installatie = {
  id: string;
  customer_id: string;
  soort: string | null;
  merk: string | null;
  type: string | null;
  serienummer: string | null;
  plaatsingsdatum: string | null;
  adres: string | null;
  postcode: string | null;
  plaats: string | null;
  notities: string | null;
  actief: boolean;
};

/** Wat bb_werkbon_contract_info teruggeeft. Bewust zonder prijzen. */
export type WerkbonContractInfo = {
  werkbon_id: string;
  contract: {
    id: string;
    nummer: string | null;
    titel: string | null;
    status: string | null;
    einddatum: string | null;
    binnen_contract: string | null;
  } | null;
  installatie: Pick<
    Installatie,
    'id' | 'soort' | 'merk' | 'type' | 'serienummer' | 'plaatsingsdatum' | 'adres' | 'postcode' | 'plaats' | 'notities'
  > | null;
  beurt: { id: string; omschrijving: string | null; taken: unknown; geschatte_uren: number | null } | null;
  prioriteit: string | null;
  uiterlijk_op: string | null;
  sla: { niveau: string | null; klok: string | null; reactie_uren: number | null; oplos_uren: number | null } | null;
  sla_reactie_voor: string | null;
  sla_oplossen_voor: string | null;
  sla_toelichting: string | null;
  gestart_op: string | null;
  afgerond_op: string | null;
};

/** Contract + installatie + SLA van één werkbon; null als hij er geen heeft. */
export async function getWerkbonContractInfo(
  werkbonId: string,
): Promise<{ data: WerkbonContractInfo | null; error: string | null }> {
  const { data, error } = await metTijdslimiet((signal) =>
    supabase.rpc('bb_werkbon_contract_info', { p_werkbon: werkbonId }).abortSignal(signal),
  );
  if (error) return { data: null, error: describeError(error, 'contract.werkbonInfo') };
  const info = (data ?? null) as WerkbonContractInfo | null;
  // Het kortingspercentage geeft de server alleen aan wie facturen/contracten
  // heeft; de app toont het nergens, dus ook niet bewaren.
  if (info?.contract) delete (info.contract as Record<string, unknown>).meerwerk_korting_pct;
  return { data: info, error: null };
}

/** Een lopend contract van een klant, om een werkbon onder te hangen. */
export type KlantContractKeuze = {
  id: string;
  nummer: string | null;
  titel: string | null;
  status: string | null;
  sla_niveau: string | null;
  sla_klok: string | null;
  heeft_sla: boolean;
  binnen_contract: string | null;
};

export async function listContractKeuzes(
  customerId: string,
): Promise<{ data: KlantContractKeuze[]; error: string | null }> {
  const { data, error } = await metTijdslimiet((signal) =>
    supabase.rpc('bb_klant_contracten', { p_customer: customerId }).abortSignal(signal),
  );
  if (error) return { data: [], error: describeError(error, 'contract.keuzes') };
  return { data: (data as KlantContractKeuze[]) ?? [], error: null };
}

/** Een contract in de lijst op de klantkaart. */
export type KlantContract = {
  id: string;
  nummer: string | null;
  titel: string;
  status: string;
  startdatum: string | null;
  einddatum: string | null;
  volgende_beurt: string | null;
};

type BeurtRij = { volgende_op: string | null; actief: boolean | null };

/** Eerstvolgende datum van de actieve beurten. */
export function volgendeBeurt(beurten: BeurtRij[] | null | undefined): string | null {
  const datums = (beurten ?? [])
    .filter((b) => b.actief !== false && b.volgende_op)
    .map((b) => b.volgende_op as string)
    .sort();
  return datums[0] ?? null;
}

/** Contracten van een klant (recht contracten; RLS geeft anders niets). */
export async function listKlantContracten(
  customerId: string,
): Promise<{ data: KlantContract[]; error: string | null }> {
  const { data, error } = await metTijdslimiet((signal) =>
    supabase
      .from('contracten')
      .select('id, nummer, titel, status, startdatum, einddatum, contract_beurten ( volgende_op, actief )')
      .eq('customer_id', customerId)
      // Nieuwste eerst; op created_at, want nummer is tekst (CT-999 > CT-1000).
      .order('created_at', { ascending: false })
      .abortSignal(signal),
  );
  if (error) return { data: [], error: describeError(error, 'contract.klant') };
  const rijen = (data ?? []) as unknown as (Omit<KlantContract, 'volgende_beurt'> & {
    contract_beurten: BeurtRij[] | null;
  })[];
  return {
    data: rijen.map(({ contract_beurten, ...c }) => ({
      ...c,
      volgende_beurt: c.status === 'actief' ? volgendeBeurt(contract_beurten) : null,
    })),
    error: null,
  };
}

export type ContractDetail = {
  id: string;
  nummer: string | null;
  titel: string;
  status: string;
  customer_id: string | null;
  adres: string | null;
  postcode: string | null;
  plaats: string | null;
  startdatum: string | null;
  einddatum: string | null;
  stilzwijgend_verlengen: boolean;
  verleng_maanden: number | null;
  opzegtermijn_dagen: number | null;
  prijs_excl: number | null;
  btw_pct: number | null;
  factuur_ritme: string | null;
  binnen_contract: string | null;
  opgezegd_op: string | null;
  ondertekend_op: string | null;
  ondertekend_door_naam: string | null;
  customer: { id: string; name: string | null } | null;
  sla: {
    naam: string;
    klok: string;
    reactie_spoed_uren: number | null;
    oplos_spoed_uren: number | null;
    reactie_normaal_uren: number | null;
    oplos_normaal_uren: number | null;
    reactie_laag_uren: number | null;
    oplos_laag_uren: number | null;
  } | null;
  beurten: {
    id: string;
    omschrijving: string;
    interval_aantal: number | null;
    interval_eenheid: string | null;
    volgende_op: string | null;
    actief: boolean;
  }[];
  installaties: Installatie[];
};

const INSTALLATIE_KOLOMMEN =
  'id, customer_id, soort, merk, type, serienummer, plaatsingsdatum, adres, postcode, plaats, notities, actief';

/** Eén contract, alleen-lezen (recht contracten). */
export async function getContract(id: string): Promise<{ data: ContractDetail | null; error: string | null }> {
  const { data, error } = await metTijdslimiet((signal) =>
    supabase
      .from('contracten')
      .select(
        `id, nummer, titel, status, customer_id, adres, postcode, plaats, startdatum, einddatum,
         stilzwijgend_verlengen, verleng_maanden, opzegtermijn_dagen, prijs_excl, btw_pct, factuur_ritme,
         binnen_contract, opgezegd_op, ondertekend_op, ondertekend_door_naam,
         customer:customers ( id, name ),
         sla:sla_niveaus ( naam, klok, reactie_spoed_uren, oplos_spoed_uren, reactie_normaal_uren,
           oplos_normaal_uren, reactie_laag_uren, oplos_laag_uren ),
         beurten:contract_beurten ( id, omschrijving, interval_aantal, interval_eenheid, volgende_op, actief ),
         contract_installaties ( installatie:installaties ( ${INSTALLATIE_KOLOMMEN} ) )`,
      )
      .eq('id', id)
      .abortSignal(signal)
      .maybeSingle(),
  );
  if (error) return { data: null, error: describeError(error, 'contract.get') };
  if (!data) return { data: null, error: null };
  const { contract_installaties, ...rest } = data as unknown as Omit<ContractDetail, 'installaties'> & {
    contract_installaties: { installatie: Installatie | null }[] | null;
  };
  return {
    data: {
      ...rest,
      beurten: [...(rest.beurten ?? [])].sort((a, b) => (a.volgende_op ?? '9').localeCompare(b.volgende_op ?? '9')),
      installaties: (contract_installaties ?? []).map((ci) => ci.installatie).filter((x): x is Installatie => !!x),
    },
    error: null,
  };
}

/** Installaties van een klant (iedereen in het bedrijf mag ze zien). */
export async function listInstallaties(
  customerId: string,
): Promise<{ data: Installatie[]; error: string | null }> {
  const { data, error } = await metTijdslimiet((signal) =>
    supabase
      .from('installaties')
      .select(INSTALLATIE_KOLOMMEN)
      .eq('customer_id', customerId)
      .order('actief', { ascending: false })
      .order('created_at', { ascending: true })
      .abortSignal(signal),
  );
  if (error) return { data: [], error: describeError(error, 'installaties.list') };
  return { data: (data as Installatie[]) ?? [], error: null };
}

export type InstallatieInvoer = {
  customer_id: string;
  soort: string;
  merk: string;
  type: string;
  serienummer: string;
  /** YYYY-MM-DD of leeg. */
  plaatsingsdatum: string | null;
  notities: string;
};

const leegNaarNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * Een installatie toevoegen. Adres laat de app leeg: dan zet de database het
 * adres van de klant (trigger bb_installatie_standaard). company_id vult de
 * kolomstandaard.
 */
export async function createInstallatie(
  invoer: InstallatieInvoer,
): Promise<{ data: Installatie | null; error: string | null }> {
  const soort = leegNaarNull(invoer.soort);
  if (!soort) return { data: null, error: 'Vul in wat voor installatie het is (bijvoorbeeld cv-ketel).' };
  const { data, error } = await supabase
    .from('installaties')
    .insert({
      customer_id: invoer.customer_id,
      soort,
      merk: leegNaarNull(invoer.merk),
      type: leegNaarNull(invoer.type),
      serienummer: leegNaarNull(invoer.serienummer),
      plaatsingsdatum: invoer.plaatsingsdatum || null,
      notities: leegNaarNull(invoer.notities),
    })
    .select(INSTALLATIE_KOLOMMEN);
  if (error) return { data: null, error: describeError(error, 'installaties.create') };
  const rij = (data as Installatie[] | null)?.[0];
  if (!rij) return { data: null, error: 'De installatie is niet opgeslagen: je hebt daar geen rechten voor.' };
  return { data: rij, error: null };
}

/** "Cv-ketel · Remeha Calenta 25c" — soort, merk en type in één regel. */
export function installatieNaam(i: Pick<Installatie, 'soort' | 'merk' | 'type'> | null | undefined): string {
  if (!i) return '';
  const soort = i.soort ? i.soort.charAt(0).toUpperCase() + i.soort.slice(1) : 'Installatie';
  const merkType = [i.merk, i.type].filter(Boolean).join(' ');
  return merkType ? `${soort} · ${merkType}` : soort;
}

/** "elke 6 weken", "elk jaar", "elke 3 maanden". */
export function intervalLabel(aantal: number | null | undefined, eenheid: string | null | undefined): string {
  if (!aantal || !eenheid) return '';
  const enkel: Record<string, [string, string]> = {
    week: ['elke week', 'weken'],
    maand: ['elke maand', 'maanden'],
    jaar: ['elk jaar', 'jaar'],
  };
  const w = enkel[eenheid];
  if (!w) return '';
  return aantal === 1 ? w[0] : `elke ${aantal} ${w[1]}`;
}
