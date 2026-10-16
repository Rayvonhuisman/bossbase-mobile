import type { SupabaseClient } from '@supabase/supabase-js';
import type { jsPDF as JsPDFType } from 'jspdf';
import { bytesNaarBase64 } from './afbeelding';
import type { JsPDFKlasse, PdfBestand } from './bouwPdf';
import type { PdfOmgeving } from './omgevingBasis';
import { naarBedrijf, naarKlant, PdfFout, type PdfBedrijf, type PdfKlant } from './pdfData';
import { buildWerkbonPdf as buildWerkbonPdfJs } from './vendored/pdfOpbouw.js';
import { bouwPdfData as bouwPdfDataJs } from './vendored/werkbonPdfData.js';

/** Wat bouwPdfData teruggeeft: alleen wat de klant hoort te zien. */
export type WerkbonPdfData = {
  taken: { omschrijving: string; afgerond: true }[];
  uren: { datum: string; startTijd: string | null; eindTijd: string | null; pauzeMinuten: number; uren: number; notitie: string }[];
  materialen: { naam: string; eenheid: string; aantal: number }[];
  meerwerk: { omschrijving: string }[];
  notities: { note: string }[];
  waarschuwingen: { note: string; gevolg: string; verzondenOp: string }[];
  fotos: { url: string; categorie: string }[];
};

// De overgenomen JS kent geen types; hier de vorm waarin hij wordt aangeroepen.
export const bouwPdfData = bouwPdfDataJs as unknown as (bron: Record<string, unknown[]>) => WerkbonPdfData;
const buildWerkbonPdf = buildWerkbonPdfJs as unknown as (...args: unknown[]) => Promise<unknown>;

/**
 * De werkbon-PDF, gelijk aan "Werkbon als PDF" in het dashboard
 * (WerkbonPageV2 → handleDownloadPdf → generateWerkbonPdf.js).
 *
 * Het dashboard roept `buildWerkbonPdf` aan met:
 *   werkbon  → bouwPdfWerkbon(detail, { uitvoerders })   (werkbonOndertekenenService.js)
 *   data     → bouwPdfData({ taken, uren, materialen, meerwerk, notities, fotos })
 *              (supabase/functions/_shared/werkbonPdfData.js — hier vendored)
 *   klant    → toCustomer uit de klantenlijst, anders { name: customerName }
 *   bedrijf  → getCurrentCompany() (toCompany, géén snapshot: een werkbon heeft er geen)
 *
 * `bouwPdfData` is de zeef: geen bedragen, geen interne notities, geen open
 * taken. Die zeef is letterlijk overgenomen; deze module levert hem dezelfde
 * invoer als het dashboard, in dezelfde volgorde (de database-sortering van
 * werkbonService/werkbonUrenService).
 */

type Rij = Record<string, unknown>;

export type PdfWerkbon = {
  id: string;
  signToken: string | null;
  nummer: string;
  titel: string;
  omschrijving: string;
  locatie: string;
  geplandOp: string | undefined;
  gestartOp: string | undefined;
  afgerondOp: string | undefined;
  ondertekendOp: string | undefined;
  ondertekendDoorNaam: string | undefined;
  ondertekendDoorEmail: string | undefined;
  handtekeningUrl: string | undefined;
  handtekeningDataUrl: string | null;
  uitvoerders: string[];
};

export type WerkbonPdfInvoer = {
  werkbon: PdfWerkbon;
  data: WerkbonPdfData;
  customer: PdfKlant | { name: string };
  company: PdfBedrijf | null;
  bestandsnaam: string;
};

/** Bestandsnaam zoals generateWerkbonPdf hem geeft. */
export const werkbonBestandsnaam = (nummer: string | null | undefined) => `Werkbon-${nummer || 'concept'}.pdf`;

/**
 * Wie er namens het bedrijf voor het werk staat (uitvoerderNamen in
 * WerkbonPageV2): verantwoordelijken en gekoppelde medewerkers, ontdubbeld,
 * met de naam uit de actieve teamleden. Niet wie de uren boekte.
 */
export function uitvoerderNamen(row: Rij, teamleden: { id: string; full_name: string | null }[]): string[] {
  const verantw = Array.isArray(row.verantwoordelijke_ids) ? (row.verantwoordelijke_ids as string[]) : [];
  const gekoppeld =
    Array.isArray(row.assigned_to_ids) && (row.assigned_to_ids as string[]).length
      ? (row.assigned_to_ids as string[])
      : row.assigned_to
        ? [row.assigned_to as string]
        : [];
  const namen = new Map(teamleden.filter((m) => m.full_name).map((m) => [m.id, m.full_name as string]));
  return [...new Set([...verantw, ...gekoppeld])].map((id) => namen.get(id)).filter((n): n is string => !!n);
}

/**
 * toWerkbon (werkbonService.js) gevolgd door bouwPdfWerkbon
 * (werkbonOndertekenenService.js), in één stap. De terugvallen zijn bewust
 * dezelfde: `row.gepland_op || null` en daarna `geplandOp || gepland_op` geeft
 * `undefined` voor een lege waarde, en zo komt hij ook in de opmaak.
 */
export function naarPdfWerkbon(row: Rij, uitvoerders: string[] = []): PdfWerkbon {
  const of = (v: unknown) => (v ? (v as string) : undefined);
  return {
    id: row.id as string,
    signToken: (row.sign_token as string) || null,
    nummer: (row.nummer as string) || '',
    titel: (row.titel as string) || '',
    omschrijving: (row.omschrijving as string) || '',
    locatie: (row.locatie as string) || '',
    geplandOp: of(row.gepland_op),
    gestartOp: of(row.gestart_op),
    afgerondOp: of(row.afgerond_op),
    ondertekendOp: of(row.ondertekend_op),
    ondertekendDoorNaam: of(row.ondertekend_door_naam),
    ondertekendDoorEmail: of(row.ondertekend_door_email),
    handtekeningUrl: of(row.handtekening_url),
    handtekeningDataUrl: null,
    uitvoerders,
  };
}

/** Signed URLs voor de foto's, zoals getWerkbonFotos (privébucket, 1 uur). */
async function fotosMetLinks(client: SupabaseClient, rijen: Rij[]): Promise<Rij[]> {
  if (!rijen.length) return [];
  const pad = (v: unknown) => {
    const s = String(v || '').split('?')[0] ?? '';
    const i = s.indexOf('/werkbon-fotos/');
    return i !== -1 ? s.slice(i + '/werkbon-fotos/'.length) : s;
  };
  const { data } = await client.storage.from('werkbon-fotos').createSignedUrls(rijen.map((r) => pad(r.url)), 3600);
  return rijen.map((r, i) => ({ ...r, url: data?.[i]?.signedUrl || r.url }));
}

/** Alles wat het dashboard op het moment van "Werkbon als PDF" in handen heeft. */
export async function laadWerkbonInvoer(
  client: SupabaseClient,
  werkbonId: string,
  {
    /**
     * false = zoals de PDF-bijlage bij "per mail ter ondertekening": het
     * dashboard roept daar bouwPdfWerkbon(werkbon) aan zónder uitvoerders.
     */
    metUitvoerders = true,
  }: { metUitvoerders?: boolean } = {},
): Promise<WerkbonPdfInvoer> {
  const { data: row, error } = await client
    .from('werkbonnen')
    .select('*, customers(name)')
    .eq('id', werkbonId)
    .maybeSingle();
  if (error) throw new PdfFout('De werkbon kon niet worden geladen.');
  if (!row) throw new PdfFout('Deze werkbon bestaat niet of je hebt er geen toegang toe.');
  const w = row as Rij;

  const [taken, uren, materialen, fotos, notities, team, klant, bedrijf] = await Promise.all([
    client.from('werkbon_taken').select('*').eq('werkbon_id', werkbonId).order('volgorde', { ascending: true }),
    client
      .from('werkbon_uren')
      .select('datum, start_tijd, eind_tijd, pauze_minuten, uren, notitie')
      .eq('werkbon_id', werkbonId)
      .order('datum', { ascending: true })
      .order('start_tijd', { ascending: true, nullsFirst: true }),
    client.from('werkbon_materialen').select('naam, eenheid, aantal').eq('werkbon_id', werkbonId).order('created_at', { ascending: true }),
    client.from('werkbon_fotos').select('url, categorie').eq('werkbon_id', werkbonId).order('created_at', { ascending: true }),
    client
      .from('werkbon_notities')
      .select('note, voor_klant, gevolg, waarschuwing_verzonden_op')
      .eq('werkbon_id', werkbonId)
      .order('created_at', { ascending: false }),
    client.from('profiles').select('id, full_name').eq('company_id', w.company_id as string).eq('actief', true),
    w.customer_id
      ? client.from('customers').select('*').eq('id', w.customer_id as string).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client.from('companies').select('*').eq('id', w.company_id as string).maybeSingle(),
  ]);
  // Een onderdeel dat niet laadt geeft een bon met een gat; dan liever niets.
  for (const r of [taken, materialen, fotos, notities]) {
    if (r.error) throw new PdfFout('Niet alles van deze werkbon kon worden geladen. Probeer het opnieuw.');
  }
  if (bedrijf.error) throw new PdfFout('De bedrijfsgegevens konden niet worden geladen.');

  const takenRijen = ((taken.data as Rij[]) ?? []).map((t) => ({
    omschrijving: t.omschrijving,
    afgerond: Boolean(t.afgerond),
    isMeerwerk: t.is_meerwerk === true,
  }));
  const data = bouwPdfData({
    taken: takenRijen.filter((t) => !t.isMeerwerk),
    meerwerk: takenRijen.filter((t) => t.isMeerwerk),
    // getWerkbonUren geeft een lege lijst bij een fout (oude database); dat
    // doet het dashboard ook.
    uren: (uren.error ? [] : ((uren.data as Rij[]) ?? [])).map((u) => ({ ...u, uren: Number(u.uren || 0) })),
    materialen: (materialen.data as Rij[]) ?? [],
    notities: (notities.data as Rij[]) ?? [],
    fotos: await fotosMetLinks(client, (fotos.data as Rij[]) ?? []),
  });

  const klantNaam = ((w.customers as { name?: string } | null)?.name as string) || '';
  return {
    werkbon: naarPdfWerkbon(
      w,
      metUitvoerders ? uitvoerderNamen(w, (team.data as { id: string; full_name: string | null }[]) ?? []) : [],
    ),
    data,
    customer: klant.data ? naarKlant(klant.data as Rij) : { name: klantNaam },
    company: bedrijf.data ? naarBedrijf(bedrijf.data as Rij) : null,
    bestandsnaam: werkbonBestandsnaam(w.nummer as string),
  };
}

/** Bouwt de PDF zoals nieuwDoc() in generateWerkbonPdf.js. */
export async function bouwWerkbonPdf(
  invoer: WerkbonPdfInvoer,
  omgeving: PdfOmgeving,
  JsPDF: JsPDFKlasse,
): Promise<PdfBestand & { doc: JsPDFType }> {
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildWerkbonPdf(doc, invoer.werkbon, invoer.data, invoer.customer, invoer.company, omgeving);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  return {
    doc,
    bytes,
    base64: bytesNaarBase64(bytes),
    bestandsnaam: invoer.bestandsnaam,
    paginas: doc.getNumberOfPages(),
  };
}
