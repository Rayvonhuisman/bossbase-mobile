import { supabase } from '@/lib/supabase';
import { maakWerkbonPdf } from '@/lib/pdf';
import { alsTekst } from '@/lib/notitieTekst';
import {
  signWerkbon,
  verstuurTerOndertekening,
  verstuurWaarschuwing,
  VersturenFout,
  waarschuwingMail,
  type MailBedrijf,
  type SignResultaat,
} from '@/lib/werkbonVersturen';
import type { Werkbon, WerkbonNotitie } from './workOrderService';

/**
 * Laten ondertekenen en waarschuwen vanuit de app. De verzoeken zelf staan in
 * lib/werkbonVersturen (getest tegen het dashboard); hier alleen de gegevens
 * die het dashboard op dat moment in handen heeft: het bedrijf
 * (getCurrentCompany) en de klantnaam.
 */

export { VersturenFout };

const NOTE_KOLOMMEN = `
  id, note, created_by, created_at, voor_klant, gevolg,
  waarschuwing_verzonden_op, waarschuwing_verzonden_naar,
  auteur:profiles!werkbon_notities_created_by_fkey ( id, full_name )
`;

/** toCompany: naam, logo en huisstijlkleur (met BossBase-groen als terugval). */
export async function mailBedrijf(companyId: string): Promise<MailBedrijf | null> {
  const { data } = await supabase.from('companies').select('name, logo_url, branding_color').eq('id', companyId).maybeSingle();
  const r = data as { name?: string | null; logo_url?: string | null; branding_color?: string | null } | null;
  if (!r) return null;
  return { name: r.name || '', logoUrl: r.logo_url || '', brandingColor: r.branding_color || '#1DDB62' };
}

/** De naam zoals toCustomer hem geeft (sanitizeName: leeg wordt 'Naamloos'). */
const klantVan = (w: Werkbon) => (w.customer ? { name: (w.customer.name ?? '').trim() || 'Naamloos' } : null);

const alsFout = (e: unknown, terugval: string) =>
  e instanceof VersturenFout ? e.message : e instanceof Error && e.message ? e.message : terugval;

/** Klant tekent op het toestel. */
export async function tekenOpToestel(
  werkbon: Werkbon,
  invoer: { naam: string; email: string; handtekening: string },
): Promise<{ data: SignResultaat | null; error: string | null }> {
  if (!werkbon.sign_token) {
    return { data: null, error: 'Deze werkbon heeft nog geen ondertekenlink. Herlaad de werkbon en probeer het opnieuw.' };
  }
  try {
    const data = await signWerkbon(supabase, {
      signToken: werkbon.sign_token,
      name: invoer.naam.trim(),
      email: invoer.email.trim(),
      signatureDataUrl: invoer.handtekening,
    });
    return { data, error: null };
  } catch (e) {
    return { data: null, error: alsFout(e, 'Ondertekenen mislukt') };
  }
}

/** Ondertekenlink per mail, met de werkbon als bijlage. */
export async function mailTerOndertekening(
  werkbon: Werkbon,
  email: string,
): Promise<{ data: { email: string } | null; error: string | null }> {
  try {
    const company = await mailBedrijf(werkbon.company_id);
    const res = await verstuurTerOndertekening(supabase, {
      werkbon: {
        id: werkbon.id,
        nummer: werkbon.nummer,
        titel: werkbon.titel,
        sign_token: werkbon.sign_token ?? null,
        customer_id: werkbon.customer_id,
      },
      email,
      companyId: werkbon.company_id,
      customer: klantVan(werkbon),
      company,
      maakPdfBase64: async () => (await maakWerkbonPdf(werkbon.id, { metUitvoerders: false })).base64,
    });
    return { data: { email: res.email }, error: null };
  } catch (e) {
    return { data: null, error: alsFout(e, 'Versturen mislukt') };
  }
}

/** Het voorbeeld van de waarschuwingsmail: dezelfde functie als het echte versturen. */
export function waarschuwingVoorbeeld(
  werkbon: Werkbon,
  company: MailBedrijf | null,
  constatering: string,
  gevolg: string,
): { onderwerp: string; html: string } {
  return waarschuwingMail({ werkbon, constatering: constatering.trim(), gevolg: gevolg.trim(), customer: klantVan(werkbon), company });
}

/** Wkb-waarschuwing: eerst mailen, dan vastleggen op de notitie. */
export async function stuurWaarschuwing(
  werkbon: Werkbon,
  notitie: Pick<WerkbonNotitie, 'id'>,
  velden: { constatering: string; gevolg: string; email: string },
): Promise<{ data: WerkbonNotitie | null; error: string | null }> {
  try {
    const company = await mailBedrijf(werkbon.company_id);
    const { notitie: bij } = await verstuurWaarschuwing<WerkbonNotitie>(supabase, {
      werkbon: {
        id: werkbon.id,
        nummer: werkbon.nummer,
        titel: werkbon.titel,
        sign_token: werkbon.sign_token ?? null,
        customer_id: werkbon.customer_id,
      },
      notitieId: notitie.id,
      constatering: velden.constatering,
      gevolg: velden.gevolg,
      email: velden.email,
      companyId: werkbon.company_id,
      customer: klantVan(werkbon),
      company,
      kolommen: NOTE_KOLOMMEN,
    });
    return { data: bij, error: null };
  } catch (e) {
    return { data: null, error: alsFout(e, 'Versturen mislukt') };
  }
}

/** De constatering voorinvullen met de notitie, als leesbare tekst. */
export const constateringUit = (note: string | null | undefined) => alsTekst(note);

/**
 * Getekend maar het ondertekende exemplaar ontbreekt: de server maakt het
 * alsnog, bewaart het en stuurt de bijlage na (getekende-pdf-nazenden). Het
 * dashboard vraagt dat zodra iemand van het bedrijf de werkbon opent; openen
 * twee mensen tegelijk, dan wint er één.
 */
export async function stuurGetekendePdfNa(werkbonId: string): Promise<{ nagezonden: boolean; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('getekende-pdf-nazenden', {
      body: { soort: 'werkbon', id: werkbonId },
    });
    if (error) {
      let melding: string | null = null;
      try {
        const b = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
        if (b?.error) melding = b.error;
      } catch {
        /* geen json */
      }
      return { nagezonden: false, error: melding || 'De ontbrekende PDF kon niet worden nagestuurd.' };
    }
    const d = data as { nagezonden?: boolean; error?: string } | null;
    if (d?.error) return { nagezonden: false, error: d.error };
    return { nagezonden: !!d?.nagezonden, error: null };
  } catch {
    return { nagezonden: false, error: 'De ontbrekende PDF kon niet worden nagestuurd.' };
  }
}

/** Startmoment vastleggen vóór het afronden ("Wanneer is de klus gestart?"). */
export async function zetStartmoment(werkbonId: string, iso: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('werkbonnen').update({ gestart_op: iso }).eq('id', werkbonId).select('id');
  if (error) return { error: 'Startmoment opslaan mislukt' };
  if (!((data as { id: string }[]) ?? []).length) return { error: 'Startmoment opslaan mislukt — je hebt hier geen rechten voor.' };
  return { error: null };
}
