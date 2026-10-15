import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/sessionContext';
import { autoMailInhoud, kiesAutoMail, type AutoMailRij, type AutoMailType } from '@/lib/autoMail';
import { zakelijkeMail } from '@/lib/documentMail';
import { verstuurMail } from './documentMailService';

/**
 * `triggerAutoEmail` uit emailService.js: een automatische klantmail
 * (afspraakbevestiging, ontvangstbevestiging) met het sjabloon van het bedrijf,
 * in de zakelijke opmaak met logo, via `send-email`, en daarna in het archief
 * (`sent_emails`).
 *
 * Geeft `null` als er niets te doen was (geen adres, of het bedrijf heeft deze
 * mail uitgezet), `true` als hij weg is en `false` als het mislukte — dan staat
 * de fout ook bij de mailfouten (`meld_mail_fout`), net als in het dashboard.
 */
export async function verstuurAutoMail(input: {
  type: AutoMailType;
  vars: Record<string, string | null | undefined>;
  aan: string | null | undefined;
  relatedType: string;
  relatedId: string;
  customerId: string | null;
}): Promise<boolean | null> {
  const aan = (input.aan ?? '').trim();
  const companyId = getCompanyId();
  if (!aan || !companyId) return null;
  try {
    // Bewust zonder filter op actief/auto_versturen: zien of er géén rij is
    // (→ standaardtekst) of een rij die is uitgezet (→ niets versturen).
    const { data: rijen, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('type', input.type)
      .eq('company_id', companyId)
      .limit(1);
    if (error) throw new Error(error.message);
    const tpl = kiesAutoMail(input.type, (rijen?.[0] as AutoMailRij | undefined) ?? null);
    if (!tpl) return null;

    const { onderwerp, binnenHtml } = autoMailInhoud(tpl, input.vars);
    let logoUrl: string | null = null;
    try {
      const { data: co } = await supabase.from('companies').select('logo_url').eq('id', companyId).maybeSingle();
      logoUrl = (co as { logo_url?: string | null } | null)?.logo_url ?? null;
    } catch {
      // geen logo: dan de bedrijfsnaam als kop
    }
    const html = zakelijkeMail({
      titel: onderwerp,
      body: binnenHtml,
      bedrijfsnaam: input.vars.bedrijfsnaam || 'Ons bedrijf',
      logoUrl,
    });
    const r = await verstuurMail({ to: aan, subject: onderwerp, html });
    if (!r.ok) throw new Error(r.melding);

    const { error: logFout } = await supabase.from('sent_emails').insert({
      company_id: companyId,
      to_email: aan,
      subject: onderwerp,
      body_html: html,
      related_type: input.relatedType,
      related_id: input.relatedId,
      customer_id: input.customerId,
      status: 'sent',
    });
    if (logFout) console.warn('[autoMailService] archief', logFout.message);
    return true;
  } catch (e) {
    try {
      await supabase.rpc('meld_mail_fout', {
        p_soort: `auto_${input.type}`,
        p_fout: String(e instanceof Error ? e.message : e).slice(0, 500),
        p_bron: 'triggerAutoEmail',
        p_gerelateerd_type: input.relatedType || null,
        p_gerelateerd_id: input.relatedId || null,
      });
    } catch {
      // vastleggen mislukt: niets meer aan te doen
    }
    return false;
  }
}

/**
 * Afspraakbevestiging na een nieuw bezoek met een klant, zoals
 * `NewActivityModal` in het dashboard: alleen als de klant een e-mailadres
 * heeft. Geeft het resultaat van `verstuurAutoMail` en het adres terug, zodat
 * het scherm een mislukte mail kan melden.
 */
export async function stuurAfspraakbevestiging(input: {
  activiteitId: string;
  customerId: string;
  datum: string;
  tijd: string;
}): Promise<{ resultaat: boolean | null; aan: string | null }> {
  const companyId = getCompanyId();
  const [{ data: klant }, { data: bedrijf }] = await Promise.all([
    supabase.from('customers').select('name, email').eq('id', input.customerId).maybeSingle(),
    companyId
      ? supabase.from('companies').select('name').eq('id', companyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const k = klant as { name?: string | null; email?: string | null } | null;
  const aan = k?.email?.trim() || null;
  if (!aan) return { resultaat: null, aan: null };
  const resultaat = await verstuurAutoMail({
    type: 'afspraak_bevestiging',
    vars: {
      klant_naam: k?.name ?? '',
      bedrijfsnaam: (bedrijf as { name?: string | null } | null)?.name || 'BossBase',
      afspraak_datum: input.datum,
      afspraak_tijd: input.tijd,
    },
    aan,
    relatedType: 'activity',
    relatedId: input.activiteitId,
    customerId: input.customerId,
  });
  return { resultaat, aan };
}

/**
 * Ontvangstbevestiging na een nieuwe aanvraag voor een bestaande klant, zoals
 * `NewLeadModal` in het dashboard (een klant die je er net bij maakte krijgt
 * hem daar niet, en hier dus ook niet). Alleen als de klant een e-mailadres heeft.
 */
export async function stuurAanvraagOntvangen(input: {
  dealId: string;
  customerId: string;
}): Promise<{ resultaat: boolean | null; aan: string | null }> {
  const companyId = getCompanyId();
  const [{ data: klant }, { data: bedrijf }] = await Promise.all([
    supabase.from('customers').select('name, email').eq('id', input.customerId).maybeSingle(),
    companyId
      ? supabase.from('companies').select('name').eq('id', companyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const k = klant as { name?: string | null; email?: string | null } | null;
  const aan = k?.email?.trim() || null;
  if (!aan) return { resultaat: null, aan: null };
  const resultaat = await verstuurAutoMail({
    type: 'aanvraag_ontvangen',
    vars: {
      klant_naam: k?.name ?? '',
      bedrijfsnaam: (bedrijf as { name?: string | null } | null)?.name || 'BossBase',
    },
    aan,
    relatedType: 'deal',
    relatedId: input.dealId,
    customerId: input.customerId,
  });
  return { resultaat, aan };
}
