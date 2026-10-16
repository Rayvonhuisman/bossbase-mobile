import type { SupabaseClient } from '@supabase/supabase-js';
import {
  afmetingenUitDataUrl,
  bereidZonderCanvas,
  bytesNaarBase64,
  mimeUitBytes,
  type Afmetingen,
  type VoorbereideAfbeelding,
} from './afbeelding';

/**
 * De `omgeving` die vendored/pdfOpbouw.js verwacht (zie de kop van dat
 * bestand). Het dashboard geeft `browserOmgeving` uit generatePdf.js mee.
 */
export type PdfOmgeving = {
  naarDataUrl: (url: string) => Promise<string | null>;
  bereidAfbeelding: (dataUrl: string, maxWmm: number, maxHmm: number) => Promise<VoorbereideAfbeelding | null>;
  afmetingen: (dataUrl: string) => Promise<Afmetingen | null>;
  documentUrl: (args: { soort: string; id?: string; token?: string | null; opgeslagen?: string | null }) => Promise<string | null>;
  supabaseUrl: string;
};

/**
 * Korte link naar een handtekening via de Edge Function `document-url`, met de
 * opgeslagen link als terugval. Letterlijk documentUrl() uit het dashboard
 * (src/services/documentService.js).
 */
export function maakDocumentUrl(client: SupabaseClient): PdfOmgeving['documentUrl'] {
  return async ({ soort, id, token, opgeslagen }) => {
    try {
      const { data, error } = await client.functions.invoke('document-url', {
        body: token ? { soort, token } : { soort, id },
      });
      const url = (data as { url?: string } | null)?.url;
      if (!error && url) return url;
    } catch {
      // val terug op de opgeslagen link
    }
    return /^https?:\/\//.test(opgeslagen || '') ? (opgeslagen as string) : null;
  };
}

/**
 * Afbeelding ophalen als data-URL zonder FileReader of canvas: de bytes via
 * `fetch`, de soort uit de bestandskop (en anders de Content-Type), base64 in
 * pure JS. Werkt in React Native (Hermes), in de browser en in Node.
 */
export async function haalDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length) return null;
    const mime =
      mimeUitBytes(bytes) ||
      (res.headers.get('content-type') || 'application/octet-stream').split(';')[0]!.trim();
    return `data:${mime};base64,${bytesNaarBase64(bytes)}`;
  } catch {
    return null;
  }
}

/** Omgeving zonder DOM (telefoon, Node): afmetingen uit de bestandskop, niets verkleind. */
export function omgevingZonderDom(client: SupabaseClient, supabaseUrl: string): PdfOmgeving {
  return {
    naarDataUrl: haalDataUrl,
    bereidAfbeelding: async (dataUrl, maxWmm, maxHmm) => bereidZonderCanvas(dataUrl, maxWmm, maxHmm),
    afmetingen: async (dataUrl) => afmetingenUitDataUrl(dataUrl),
    documentUrl: maakDocumentUrl(client),
    supabaseUrl,
  };
}
