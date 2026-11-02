import type { SupabaseClient } from '@supabase/supabase-js';
import { regimeVanPct } from './vendored/btwRegime.js';

/**
 * De gegevens die het dashboard aan `buildPdf` geeft, in exact dezelfde vorm.
 *
 * Het dashboard roept de opmaak aan met de objecten uit zijn services:
 *   offerte  → toOfferte       (src/services/offerteService.js)
 *   regels   → toOfferteItem / toRegel (offerteService.js / factuurService.js)
 *   klant    → toCustomer      (src/services/customerService.js)
 *   bedrijf  → toCompany       (src/services/profileService.js), door
 *              companyForDocument (src/utils/documentSnapshot.js) vervangen
 *              door de bevroren gegevens zodra het document verstuurd is.
 * Hieronder staan dezelfde omzettingen, beperkt tot de velden die
 * vendored/pdfOpbouw.js leest, met dezelfde standaardwaarden: een andere
 * terugval (`|| 21` tegenover `?? 21`) geeft anders een andere PDF.
 *
 * Alles krijgt de Supabase-client mee in plaats van hem te importeren, zodat
 * scripts/vergelijk-pdf.mjs deze code in Node met een eigen sessie kan draaien.
 * RLS bepaalt wat er gelezen mag worden, net als in het dashboard.
 */

export type PdfSoort = 'offerte' | 'factuur';

type Rij = Record<string, unknown>;

export type PdfBedrijf = {
  id: string;
  name: string;
  email: string;
  phone: string;
  kvk: string;
  btwNumber: string;
  address: string;
  city: string;
  postalCode: string;
  logoUrl: string;
  brandingColor: string;
  iban: string;
  ibanTnv: string;
};

export type PdfKlant = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  postcode: string;
  kvkNumber: string;
  btwNumber: string;
};

/** Bevroren bedrijfsgegevens op het document (camelCase, zoals toOfferte/toFactuur). */
type Snapshot = {
  snapshotLogoUrl: string | null;
  snapshotBrandingColor: string | null;
  snapshotBedrijfsnaam: string | null;
  snapshotAdres: string | null;
  snapshotPostcode: string | null;
  snapshotPlaats: string | null;
  snapshotEmail: string | null;
  snapshotKvk: string | null;
  snapshotBtw: string | null;
  snapshotIban?: string | null;
  snapshotIbanTnv?: string | null;
};

export type PdfOfferte = Snapshot & {
  id: string;
  companyId: string;
  customerId: string | null;
  nummer: string;
  status: string;
  btwPct: number;
  geldigTot: string | null;
  verzondenOp: string | null;
  notes: string;
  sign_token: string | null;
  createdAt: string;
  signedAt: string | null;
  signedByName: string;
  signedByEmail: string;
  signatureUrl: string | null;
};

export type PdfGroep = { id: string; naam: string; werkzaamheden: string | null; volgorde: number };

export type PdfOfferteItem = {
  id: string;
  omschrijving: string;
  eenheid: string;
  type: string | null;
  btwPct: number | null;
  btwRegime: string;
  aantal: number;
  prijsPer: number;
  subtotaal: number;
  volgorde: number;
  /** Groep (ruimte, onderdeel); de PDF tekent per groep een kop en subtotaal. */
  groep?: PdfGroep | null;
};

export type PdfFactuur = Snapshot & {
  id: string;
  companyId: string;
  customerId: string | null;
  nummer: string;
  factuurdatum: string | null;
  vervaldatum: string | null;
  betalingskenmerk: string;
  status: string;
  notities: string;
  isCredit: boolean;
  externeReferentie: string | null;
  /** Alleen bij een creditfactuur: de toelichting onder de titel (FacturenPage). */
  creditNote?: string;
};

export type PdfFactuurRegel = {
  id: string;
  type: string;
  omschrijving: string;
  aantal: number;
  eenheidsprijs: number;
  btwPct: number;
  btwRegime: string;
  regelprijs: number;
  volgorde: number;
  /** Groep (ruimte, onderdeel); de PDF tekent per groep een kop en subtotaal. */
  groep?: PdfGroep | null;
};

export type PdfInvoer =
  | {
      soort: 'offerte';
      document: PdfOfferte;
      regels: PdfOfferteItem[];
      customer: PdfKlant | null;
      company: PdfBedrijf | null;
      bestandsnaam: string;
    }
  | {
      soort: 'factuur';
      document: PdfFactuur;
      regels: PdfFactuurRegel[];
      customer: PdfKlant | null;
      company: PdfBedrijf | null;
      bestandsnaam: string;
    };

/** Fout met een melding die zo op het scherm kan. */
export class PdfFout extends Error {
  constructor(melding: string) {
    super(melding);
    this.name = 'PdfFout';
  }
}

const s = (v: unknown) => (v == null ? '' : String(v));
const sOfNull = (v: unknown) => (v == null || v === '' ? null : String(v));

// ── Omzettingen (zelfde als het dashboard) ─────────────────────────────────

function snapshotVan(row: Rij): Snapshot {
  return {
    snapshotLogoUrl: sOfNull(row.snapshot_logo_url),
    snapshotBrandingColor: sOfNull(row.snapshot_branding_color),
    snapshotBedrijfsnaam: sOfNull(row.snapshot_bedrijfsnaam),
    snapshotAdres: sOfNull(row.snapshot_adres),
    snapshotPostcode: sOfNull(row.snapshot_postcode),
    snapshotPlaats: sOfNull(row.snapshot_plaats),
    snapshotEmail: sOfNull(row.snapshot_email),
    snapshotKvk: sOfNull(row.snapshot_kvk),
    snapshotBtw: sOfNull(row.snapshot_btw),
  };
}

/** toOfferte uit offerteService.js. */
export function naarOfferte(row: Rij): PdfOfferte {
  return {
    id: s(row.id),
    companyId: s(row.company_id),
    customerId: sOfNull(row.customer_id),
    nummer: s(row.nummer),
    status: s(row.status) || 'concept',
    // `|| 21`, net als het dashboard: een opgeslagen 0 wordt daar 21.
    btwPct: Number(row.btw_pct || 21),
    geldigTot: sOfNull(row.geldig_tot),
    verzondenOp: sOfNull(row.verzonden_op),
    notes: s(row.notes),
    sign_token: sOfNull(row.sign_token),
    createdAt: row.created_at as string,
    signedAt: sOfNull(row.signed_at),
    signedByName: s(row.signed_by_name),
    signedByEmail: s(row.signed_by_email),
    signatureUrl: sOfNull(row.signature_url),
    ...snapshotVan(row),
  };
}

/** toOfferteItem uit offerteService.js. */
export function naarOfferteItem(row: Rij): PdfOfferteItem {
  return {
    id: s(row.id),
    omschrijving: row.omschrijving as string,
    eenheid: s(row.eenheid),
    type: sOfNull(row.type),
    btwPct: row.btw_pct != null ? Number(row.btw_pct) : null,
    btwRegime: (row.btw_regime as string) || regimeVanPct(row.btw_pct),
    aantal: Number(row.aantal || 1),
    prijsPer: Number(row.prijs_per || 0),
    subtotaal: Number(row.subtotaal || 0),
    volgorde: Number(row.volgorde || 0),
    groep: groepUit(row),
  };
}

/** toFactuur uit factuurService.js. */
export function naarFactuur(row: Rij): PdfFactuur {
  return {
    id: s(row.id),
    companyId: s(row.company_id),
    customerId: sOfNull(row.customer_id),
    nummer: s(row.nummer),
    factuurdatum: sOfNull(row.factuurdatum),
    vervaldatum: sOfNull(row.vervaldatum),
    betalingskenmerk: s(row.betalingskenmerk),
    status: s(row.status) || 'concept',
    notities: s(row.notities),
    isCredit: Boolean(row.is_credit),
    externeReferentie: sOfNull(row.externe_referentie),
    ...snapshotVan(row),
    snapshotIban: sOfNull(row.snapshot_iban),
    snapshotIbanTnv: sOfNull(row.snapshot_iban_tnv),
  };
}

/** toRegel uit factuurService.js. */
export function naarFactuurRegel(row: Rij): PdfFactuurRegel {
  return {
    id: s(row.id),
    type: s(row.type) || 'stuks',
    omschrijving: s(row.omschrijving),
    aantal: Number(row.aantal || 1),
    eenheidsprijs: Number(row.eenheidsprijs || 0),
    btwPct: Number(row.btw_pct ?? 21),
    btwRegime: (row.btw_regime as string) || regimeVanPct(row.btw_pct),
    regelprijs: Number(row.regelprijs || 0),
    volgorde: Number(row.volgorde || 0),
    groep: groepUit(row),
  };
}

/** toCustomer uit customerService.js (met sanitizeName). */
export function naarKlant(row: Rij): PdfKlant {
  return {
    id: s(row.id),
    name: s(row.name).trim() || 'Naamloos',
    email: s(row.email),
    phone: s(row.phone),
    city: s(row.city),
    address: s(row.address),
    postcode: s(row.postcode),
    kvkNumber: s(row.kvk_number),
    btwNumber: s(row.btw_number),
  };
}

/** toCompany uit profileService.js. */
export function naarBedrijf(row: Rij): PdfBedrijf {
  return {
    id: s(row.id),
    name: s(row.name),
    email: s(row.email),
    phone: s(row.phone),
    kvk: s(row.kvk),
    btwNumber: s(row.btw_number),
    address: s(row.address),
    city: s(row.city),
    postalCode: s(row.postal_code),
    logoUrl: s(row.logo_url),
    brandingColor: (row.branding_color as string) || '#1DDB62',
    iban: s(row.iban),
    ibanTnv: s(row.iban_tnv),
  };
}

/** hasCompanySnapshot uit documentSnapshot.js. */
export function heeftSnapshot(doc: Snapshot | null | undefined): boolean {
  return !!(doc && (doc.snapshotBedrijfsnaam || doc.snapshotLogoUrl || doc.snapshotBrandingColor));
}

/** companyForDocument uit documentSnapshot.js: bevroren gegevens gaan voor. */
export function bedrijfVoorDocument(doc: Snapshot, live: PdfBedrijf | null): PdfBedrijf | null {
  if (!heeftSnapshot(doc)) return live;
  return {
    ...(live as PdfBedrijf),
    name: doc.snapshotBedrijfsnaam ?? live?.name,
    logoUrl: doc.snapshotLogoUrl ?? live?.logoUrl,
    brandingColor: doc.snapshotBrandingColor ?? live?.brandingColor,
    address: doc.snapshotAdres ?? live?.address,
    postalCode: doc.snapshotPostcode ?? live?.postalCode,
    city: doc.snapshotPlaats ?? live?.city,
    email: doc.snapshotEmail ?? live?.email,
    kvk: doc.snapshotKvk ?? live?.kvk,
    btwNumber: doc.snapshotBtw ?? live?.btwNumber,
    iban: doc.snapshotIban ?? live?.iban,
    ibanTnv: doc.snapshotIbanTnv ?? live?.ibanTnv,
  } as PdfBedrijf;
}

/**
 * Geïmporteerd uit de boekhouding (isGeimporteerdeFactuur): daarvan maakt het
 * dashboard geen PDF, alleen het meegekomen document wordt getoond.
 */
export function isGeimporteerdeFactuur(f: Pick<PdfFactuur, 'externeReferentie' | 'status'>): boolean {
  return Boolean(f.externeReferentie || f.status === 'geboekt');
}

/** Bestandsnaam zoals het dashboard hem geeft (doc.save / mailbijlage). */
export function bestandsnaamVoor(soort: PdfSoort, nummer: string | null | undefined): string {
  return soort === 'offerte' ? `${nummer || 'offerte'}.pdf` : `Factuur-${nummer}.pdf`;
}

// ── Ophalen ────────────────────────────────────────────────────────────────

async function klantOphalen(client: SupabaseClient, id: string | null): Promise<PdfKlant | null> {
  if (!id) return null;
  // Zoals klantVoorPdf in OffertesPage: lukt het niet, dan zonder klantblok.
  const { data, error } = await client.from('customers').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return naarKlant(data as Rij);
}

async function bedrijfOphalen(client: SupabaseClient, id: string): Promise<PdfBedrijf | null> {
  // Het dashboard gebruikt het bedrijf van de ingelogde gebruiker; dat is het
  // bedrijf van het document (RLS laat alleen eigen documenten zien).
  const { data, error } = await client.from('companies').select('*').eq('id', id).maybeSingle();
  if (error) throw new PdfFout('De bedrijfsgegevens konden niet worden geladen.');
  return data ? naarBedrijf(data as Rij) : null;
}

/**
 * Regels met hun groep (ruimte, onderdeel), zoals `getOfferteItems` en
 * `getFactuurRegels` in het dashboard: de PDF tekent dan per groep een kop en
 * een subtotaal. Kent de schemacache de relatie nog niet, dan zonder groepen.
 */
async function regelsMetGroep(client: SupabaseClient, tabel: 'offerte_items' | 'factuur_regels', groepTabel: string, kolom: string, id: string) {
  const lees = async (select: string) => {
    const { data, error } = await client.from(tabel).select(select).eq(kolom, id).order('volgorde', { ascending: true });
    return { data: data as unknown as Rij[] | null, error };
  };
  const res = await lees(`*, groep:${groepTabel}(id, naam, werkzaamheden, volgorde)`);
  if (res.error && (['PGRST200', 'PGRST204', '42703'].includes(res.error.code ?? '') || /groep|schema cache/i.test(res.error.message ?? ''))) {
    return lees('*');
  }
  return res;
}

const groepUit = (row: Rij) => {
  const g = row.groep as { id?: string; naam?: string; werkzaamheden?: string | null; volgorde?: number | null } | null | undefined;
  return g?.naam ? { id: s(g.id), naam: g.naam, werkzaamheden: g.werkzaamheden ?? null, volgorde: Number(g.volgorde ?? 0) } : null;
};

export async function laadOfferteInvoer(client: SupabaseClient, offerteId: string): Promise<PdfInvoer> {
  const { data: row, error } = await client.from('offertes').select('*').eq('id', offerteId).maybeSingle();
  if (error) throw new PdfFout('De offerte kon niet worden geladen.');
  if (!row) throw new PdfFout('Deze offerte bestaat niet of je hebt er geen toegang toe.');
  const offerte = naarOfferte(row as Rij);

  const [regelsRes, customer, live] = await Promise.all([
    regelsMetGroep(client, 'offerte_items', 'offerte_groepen', 'offerte_id', offerteId),
    klantOphalen(client, offerte.customerId),
    bedrijfOphalen(client, offerte.companyId),
  ]);
  if (regelsRes.error) throw new PdfFout('De offerteregels konden niet worden geladen.');

  return {
    soort: 'offerte',
    document: offerte,
    regels: ((regelsRes.data as Rij[]) ?? []).map(naarOfferteItem),
    customer,
    company: bedrijfVoorDocument(offerte, live),
    bestandsnaam: bestandsnaamVoor('offerte', offerte.nummer),
  };
}

export async function laadFactuurInvoer(client: SupabaseClient, factuurId: string): Promise<PdfInvoer> {
  const { data: row, error } = await client.from('facturen').select('*').eq('id', factuurId).maybeSingle();
  if (error) throw new PdfFout('De factuur kon niet worden geladen.');
  if (!row) throw new PdfFout('Deze factuur bestaat niet of je hebt er geen toegang toe.');
  const factuur = naarFactuur(row as Rij);
  if (isGeimporteerdeFactuur(factuur)) {
    throw new PdfFout('Deze factuur komt uit de boekhouding; daarvan maakt BossBase geen PDF.');
  }

  const [regelsRes, customer, live] = await Promise.all([
    regelsMetGroep(client, 'factuur_regels', 'factuur_groepen', 'factuur_id', factuurId),
    klantOphalen(client, factuur.customerId),
    bedrijfOphalen(client, factuur.companyId),
  ]);
  if (regelsRes.error) throw new PdfFout('De factuurregels konden niet worden geladen.');

  // FacturenPage: bij een creditfactuur staat de toelichting onder de titel.
  const document: PdfFactuur = factuur.isCredit ? { ...factuur, creditNote: factuur.notities } : factuur;

  return {
    soort: 'factuur',
    document,
    regels: ((regelsRes.data as Rij[]) ?? []).map(naarFactuurRegel),
    customer,
    company: bedrijfVoorDocument(factuur, live),
    bestandsnaam: bestandsnaamVoor('factuur', factuur.nummer),
  };
}
