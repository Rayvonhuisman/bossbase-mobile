import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { omgevingZonderDom, type PdfOmgeving } from './omgevingBasis';

/**
 * Telefoon (iOS/Android): geen DOM, dus geen `Image` en geen canvas. De
 * afmetingen komen uit de bestandskop; zie afbeelding.ts. Op het web neemt
 * Metro omgeving.web.ts, met dezelfde aanpak als het dashboard.
 */
export function pdfOmgeving(): PdfOmgeving {
  return omgevingZonderDom(supabase, env.SUPABASE_URL);
}
