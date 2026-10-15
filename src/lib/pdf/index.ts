import { supabase } from '@/lib/supabase';
import { getOndertekendeOffertePdfUrl } from '@/services/offerteService';
import { bouwPdf, type PdfBestand } from './bouwPdf';
import { laadJsPDF } from './jspdf';
import { pdfOmgeving } from './omgeving';
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
  soort: PdfSoort;
  id: string;
  opgeslagenEerst?: boolean;
}): Promise<DocumentPdf> {
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
