import { supabase } from '@/lib/supabase';
import { getOndertekendeOffertePdfUrl } from '@/services/offerteService';
import { bouwPdf, type PdfBestand } from './bouwPdf';
import { laadJsPDF } from './jspdf';
import { pdfOmgeving } from './omgeving';
import { maakDocumentUrl } from './omgevingBasis';
import { bouwWerkbonPdf, laadWerkbonInvoer, werkbonBestandsnaam } from './werkbonPdf';
import {
  bestandsnaamVoor,
  isGeimporteerdeFactuur,
  laadFactuurInvoer,
  laadOfferteInvoer,
  PdfFout,
  type PdfSoort,
} from './pdfData';

/**
 * Offerte- en factuur-PDF in de app, gelijk aan die van het dashboard.
 *
 * De opmaak is een kopie van het dashboard (vendored/pdfOpbouw.js, met een
 * test die afwijkingen meldt), de gegevens worden op dezelfde manier
 * opgehaald (pdfData.ts), en alleen het omgaan met afbeeldingen verschilt per
 * platform (omgeving.ts / omgeving.web.ts).
 *
 * Fouten komen als `PdfFout` met een melding die zo op het scherm kan.
 */

export { PdfFout } from './pdfData';
export type { PdfBestand } from './bouwPdf';
export type { PdfSoort } from './pdfData';

/** De documenten die de app als PDF kan tonen. */
export type DocumentSoort = PdfSoort | 'werkbon';

/** Nieuw opgebouwde offerte-PDF (wat het dashboard bij "Voorbeeld" toont). */
export async function maakOffertePdf(offerteId: string): Promise<PdfBestand> {
  const [invoer, JsPDF] = await Promise.all([laadOfferteInvoer(supabase, offerteId), laadJsPDF()]);
  const { doc: _doc, ...bestand } = await bouwPdf(invoer, pdfOmgeving(), JsPDF);
  return bestand;
}

/** Nieuw opgebouwde factuur-PDF. Niet voor facturen uit de boekhouding. */
export async function maakFactuurPdf(factuurId: string): Promise<PdfBestand> {
  const [invoer, JsPDF] = await Promise.all([laadFactuurInvoer(supabase, factuurId), laadJsPDF()]);
  const { doc: _doc, ...bestand } = await bouwPdf(invoer, pdfOmgeving(), JsPDF);
  return bestand;
}

/**
 * Nieuw opgebouwde werkbon-PDF ("Werkbon als PDF" in het dashboard): zonder
 * bedragen, interne notities of open taken. Is hij getekend, dan staan naam en
 * handtekening erop; anders een leeg tekenvak om met pen af te tekenen.
 */
export async function maakWerkbonPdf(
  werkbonId: string,
  opties: { metUitvoerders?: boolean } = {},
): Promise<PdfBestand> {
  const [invoer, JsPDF] = await Promise.all([laadWerkbonInvoer(supabase, werkbonId, opties), laadJsPDF()]);
  const { doc: _doc, ...bestand } = await bouwWerkbonPdf(invoer, pdfOmgeving(), JsPDF);
  return bestand;
}

/**
 * Het ondertekende exemplaar van een werkbon: een korte link (10 minuten) via
 * de Edge Function `document-url` (soort `werkbon_pdf`), met de opgeslagen
 * link als terugval — zoals de knop "Ondertekende bon" in het dashboard.
 */
export async function ondertekendeWerkbonUrl(werkbonId: string, opgeslagen?: string | null): Promise<string | null> {
  return maakDocumentUrl(supabase)({ soort: 'werkbon_pdf', id: werkbonId, opgeslagen: opgeslagen ?? null });
}

export type DocumentPdf =
  | { bron: 'opgeslagen'; url: string; bestandsnaam: string }
  | ({ bron: 'gemaakt' } & PdfBestand);

/**
 * De PDF die bij een document hoort: het bewaarde bestand als dat er is,
 * anders een nieuw opgebouwde.
 *
 * Factuur — zoals de paperclip in het dashboard (FacturenPage, paperclipCfg):
 *   bewaard in `factuur-pdfs/{company_id}/{factuur_id}.pdf` → dat bestand
 *   (wat de klant kreeg); anders een voorbeeld. Een factuur uit de
 *   boekhouding zonder meegekomen document geeft een PdfFout: daarvan maakt
 *   het dashboard geen PDF.
 * Offerte — ondertekend: het ondertekende exemplaar via de Edge Function
 *   `offerte-pdf-url` (zoals de download van getekende offertes in het
 *   dashboard). Lukt dat niet, of is hij niet ondertekend: opgebouwd. Let op:
 *   de voorbeeldknop van het dashboard bouwt óók een ondertekende offerte
 *   altijd opnieuw op; dat krijg je hier met `opgeslagenEerst: false`.
 *
 * De `url` is tijdelijk (factuur een uur, offerte zoals de Edge Function hem
 * geeft): direct gebruiken, niet bewaren.
 */
export async function haalDocumentPdf({
  soort,
  id,
  opgeslagenEerst = true,
}: {
  soort: DocumentSoort;
  id: string;
  opgeslagenEerst?: boolean;
}): Promise<DocumentPdf> {
  if (soort === 'werkbon') {
    // Werkbon: `opgeslagenEerst` = het ondertekende exemplaar (geen terugval op
    // een nieuw opgebouwde: dat is niet wat de klant tekende). Anders altijd
    // opbouwen, zoals "Werkbon als PDF".
    if (!opgeslagenEerst) return { bron: 'gemaakt', ...(await maakWerkbonPdf(id)) };
    const { data: w } = await supabase
      .from('werkbonnen')
      .select('nummer, ondertekende_pdf_url')
      .eq('id', id)
      .maybeSingle();
    const url = await ondertekendeWerkbonUrl(id, (w as { ondertekende_pdf_url?: string | null } | null)?.ondertekende_pdf_url);
    if (!url) throw new PdfFout('De ondertekende bon kon niet worden geopend.');
    const nummer = (w as { nummer?: string | null } | null)?.nummer;
    return { bron: 'opgeslagen', url, bestandsnaam: werkbonBestandsnaam(nummer).replace(/\.pdf$/, '-ondertekend.pdf') };
  }
  if (soort === 'factuur') {
    const { data: f, error } = await supabase
      .from('facturen')
      .select('id, company_id, nummer, status, externe_referentie')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new PdfFout('De factuur kon niet worden geladen.');
    if (!f) throw new PdfFout('Deze factuur bestaat niet of je hebt er geen toegang toe.');
    const geimporteerd = isGeimporteerdeFactuur({
      externeReferentie: f.externe_referentie,
      status: f.status,
    });
    if (opgeslagenEerst || geimporteerd) {
      const { data } = await supabase.storage
        .from('factuur-pdfs')
        .createSignedUrl(`${f.company_id}/${f.id}.pdf`, 3600);
      if (data?.signedUrl) {
        return { bron: 'opgeslagen', url: data.signedUrl, bestandsnaam: bestandsnaamVoor('factuur', f.nummer) };
      }
    }
    if (geimporteerd) throw new PdfFout('Er is geen origineel document meegekomen uit de boekhouding.');
    return { bron: 'gemaakt', ...(await maakFactuurPdf(id)) };
  }

  if (opgeslagenEerst) {
    const { data: o } = await supabase
      .from('offertes')
      .select('id, nummer, signed_at')
      .eq('id', id)
      .maybeSingle();
    if (o?.signed_at) {
      const { url } = await getOndertekendeOffertePdfUrl(id);
      if (url) return { bron: 'opgeslagen', url, bestandsnaam: bestandsnaamVoor('offerte', o.nummer) };
    }
  }
  return { bron: 'gemaakt', ...(await maakOffertePdf(id)) };
}
