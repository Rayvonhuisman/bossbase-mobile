import type { jsPDF as JsPDFType, jsPDFOptions } from 'jspdf';
import { bytesNaarBase64 } from './afbeelding';
import type { PdfOmgeving } from './omgevingBasis';
import type { PdfInvoer } from './pdfData';
import { buildPdf } from './vendored/pdfOpbouw.js';

export type JsPDFKlasse = new (opties?: jsPDFOptions) => JsPDFType;

export type PdfBestand = {
  /** De PDF als base64, zonder `data:`-voorvoegsel (zoals getOffertePdfBase64). */
  base64: string;
  bytes: Uint8Array;
  bestandsnaam: string;
  paginas: number;
};

/**
 * Bouwt de PDF precies zoals generatePdf.js in het dashboard: een A4-document
 * in millimeters, en dan de gedeelde opmaak (`buildPdf`) met dezelfde
 * gegevens. Zonder netwerk of globale toestand; zie index.ts voor de app.
 */
export async function bouwPdf(
  invoer: PdfInvoer,
  omgeving: PdfOmgeving,
  JsPDF: JsPDFKlasse,
): Promise<PdfBestand & { doc: JsPDFType }> {
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  await buildPdf(doc, invoer.soort, invoer.document, invoer.regels, invoer.customer, invoer.company, omgeving);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  return {
    doc,
    bytes,
    base64: bytesNaarBase64(bytes),
    bestandsnaam: invoer.bestandsnaam,
    paginas: doc.getNumberOfPages(),
  };
}
