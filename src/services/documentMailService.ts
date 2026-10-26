import { supabase } from '@/lib/supabase';
import { getCompanyId, withCompanyId } from '@/lib/sessionContext';
import { alsTekst } from '@/lib/notitieTekst';
import { naarBedrijf, type PdfBedrijf } from '@/lib/pdf/pdfData';
import type { MailSjabloon } from '@/lib/documentMail';

/**
 * Mail versturen vanuit offertes en facturen — dezelfde aanroepen als
 * `emailService.js` en `stripeService.js` in het dashboard:
 *
 *   sjabloon     → `email_templates` (type, actief)
 *   versturen    → Edge Function `send-email` met `from_name` (bedrijfsnaam) en
 *                  `reply_to` (antwoordadres, anders het bedrijfsadres), PDF's
 *                  als base64-bijlage
 *   archief      → `sent_emails` (status 'sent', gekoppeld aan document en klant)
 *   betaallink   → Edge Function `stripe-create-payment-link`
 *
 * Geen eigen route en geen eigen regels: de Edge Functions controleren rechten,
 * abonnement en ontvanger zelf, net als bij het dashboard.
 */

/**
 * `getMailTemplate(type)`. Het dashboard leest de body als HTML uit zijn
 * editor; de app bewerkt platte tekst. Een sjabloon zonder opmaak (de
 * standaard) blijft daardoor letterlijk gelijk; een sjabloon mét opmaak wordt
 * leesbare tekst met dezelfde regels.
 */
export async function getMailSjabloon(type: string): Promise<{ data: MailSjabloon; error: string | null }> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('type', type)
    .eq('actief', true)
    .maybeSingle();
  if (error) {
    console.warn('[documentMailService.getMailSjabloon]', error.message);
    return { data: null, error: 'Het e-mailsjabloon kon niet worden geladen.' };
  }
  if (!data) return { data: null, error: null };
  const rij = data as { onderwerp?: string | null; body?: string | null };
  const body = rij.body ?? '';
  return {
    data: { onderwerp: rij.onderwerp ?? '', body: /<[a-zA-Z]/.test(body) ? alsTekst(body) : body },
    error: null,
  };
}

export type KlantMailSjabloon = { id: string; type: string; naam: string; onderwerp: string; body: string };

/**
 * De sjablonen in de keuzelijst van het schrijfvak op de klantkaart:
 * `getEmailTemplates().filter(t => t.actief)`, gesorteerd op type. De body
 * wordt platte tekst, zoals bij `getMailSjabloon`.
 */
export async function listKlantMailSjablonen(): Promise<{ data: KlantMailSjabloon[]; error: string | null }> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('id, type, name, onderwerp, body, actief')
    .eq('actief', true)
    .order('type', { ascending: true });
  if (error) {
    console.warn('[documentMailService.listKlantMailSjablonen]', error.message);
    return { data: [], error: 'De e-mailsjablonen konden niet worden geladen.' };
  }
  type Rij = { id: string; type: string | null; name: string | null; onderwerp: string | null; body: string | null };
  return {
    data: ((data as Rij[]) ?? []).map((r) => {
      const body = r.body ?? '';
      return {
        id: r.id,
        type: r.type ?? '',
        naam: r.name || r.type || 'Sjabloon',
        onderwerp: r.onderwerp ?? '',
        body: /<[a-zA-Z]/.test(body) ? alsTekst(body) : body,
      };
    }),
    error: null,
  };
}

export type VerstuurdeMail = {
  id: string;
  to_email: string | null;
  subject: string | null;
  body_html: string | null;
  related_type: string | null;
  sent_at: string | null;
};

/** `getSentEmailsByCustomer`: de mails aan deze klant, nieuwste eerst. */
export async function listVerstuurdeMails(
  customerId: string,
): Promise<{ data: VerstuurdeMail[]; error: string | null }> {
  const { data, error } = await supabase
    .from('sent_emails')
    .select('id, to_email, subject, body_html, related_type, sent_at')
    .eq('customer_id', customerId)
    .order('sent_at', { ascending: false });
  if (error) {
    console.warn('[documentMailService.listVerstuurdeMails]', error.message);
    return { data: [], error: 'De verstuurde e-mails konden niet worden geladen.' };
  }
  return { data: (data as VerstuurdeMail[]) ?? [], error: null };
}

/** Het bedrijf zoals het dashboard het kent (`toCompany`), voor mail en snapshot. */
export async function getBedrijfVoorDocument(): Promise<PdfBedrijf | null> {
  const companyId = getCompanyId();
  if (!companyId) return null;
  const { data, error } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle();
  if (error || !data) return null;
  return naarBedrijf(data as Record<string, unknown>);
}

export type MailBijlage = { filename: string; content: string };

async function leesFout(error: unknown, terugval: string): Promise<string> {
  let melding = (error as { message?: string } | null)?.message || terugval;
  try {
    const body = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
    if (body?.error) melding = body.error;
  } catch {
    /* geen json */
  }
  return melding;
}

/**
 * `sendEmail` uit emailService.js. Bedrijfsnaam en antwoordadres komen uit
 * `companies` (reply_to_email, anders email, anders geen reply-to). Gooit niet:
 * een fout komt terug als melding die zo op het scherm kan.
 */
/**
 * Soorten mail die send-email kent; elk vraagt een eigen recht (review 26-10,
 * S2-02). Onbekend of leeg wordt 'klant' (klanten bewerken of verkoop).
 */
const MAILSOORTEN = ['factuur', 'offerte', 'deal', 'werkbon', 'calendar_event', 'activity', 'klant', 'leverancier', 'uitnodiging'];
export const mailSoortVan = (t: string | null | undefined): string => (t && MAILSOORTEN.includes(t) ? t : 'klant');

export async function verstuurMail(input: {
  to: string;
  subject: string;
  html: string;
  attachments?: MailBijlage[];
  /** Soort mail (factuur, offerte, klant, …): bepaalt welk recht send-email vraagt. */
  soort?: string | null;
  gerelateerdId?: string | null;
}): Promise<{ ok: true } | { ok: false; melding: string }> {
  let fromName = 'BossBase';
  let replyTo: string | null = null;
  const companyId = getCompanyId();
  if (companyId) {
    try {
      const { data } = await supabase
        .from('companies')
        .select('name, reply_to_email, email')
        .eq('id', companyId)
        .maybeSingle();
      const co = data as { name?: string | null; reply_to_email?: string | null; email?: string | null } | null;
      fromName = co?.name || 'BossBase';
      replyTo = co?.reply_to_email || co?.email || null;
    } catch {
      /* zoals getCompanyMailMeta: terugval op BossBase, geen reply-to */
    }
  }
  const body: Record<string, unknown> = {
    to: input.to,
    subject: input.subject,
    html: input.html,
    from_name: fromName,
    gerelateerd_type: mailSoortVan(input.soort),
  };
  if (input.gerelateerdId) body.gerelateerd_id = input.gerelateerdId;
  if (replyTo) body.reply_to = replyTo;
  if (input.attachments?.length) body.attachments = input.attachments;

  try {
    const { data, error } = await supabase.functions.invoke('send-email', { body });
    if (error) return { ok: false, melding: await leesFout(error, 'Versturen mislukt') };
    const res = data as { success?: boolean; error?: string } | null;
    if (!res?.success) return { ok: false, melding: res?.error || 'Versturen mislukt' };
    return { ok: true };
  } catch (e) {
    return { ok: false, melding: e instanceof Error ? e.message : 'Versturen mislukt' };
  }
}

/** `logSentEmail`: de verstuurde mail in het archief. Faalt stil (alleen een waarschuwing). */
export async function logVerstuurdeMail(input: {
  toEmail: string;
  subject: string;
  bodyHtml: string;
  /**
   * 'offerte' of 'factuur' bij een document; bij een losse mail vanaf de
   * klantkaart het type van het gekozen sjabloon, of null (zoals het dashboard:
   * `relatedType: tpl?.type || null`).
   */
  relatedType: string | null;
  relatedId?: string | null;
  customerId: string | null;
}): Promise<void> {
  const payload = withCompanyId({
    to_email: input.toEmail,
    subject: input.subject,
    body_html: input.bodyHtml || null,
    related_type: input.relatedType || null,
    related_id: input.relatedId || null,
    customer_id: input.customerId || null,
    status: 'sent',
  });
  if (!payload) return;
  const { error } = await supabase.from('sent_emails').insert(payload);
  if (error) console.warn('[documentMailService.logVerstuurdeMail]', error.message);
}

/**
 * Is de Stripe-koppeling actief (`getStripeConnection()?.chargesEnabled`)?
 * Bepaalt alleen de tekst van `{{betaalinstructie}}`; bij twijfel: nee.
 */
export async function stripeActief(): Promise<boolean> {
  const companyId = getCompanyId();
  if (!companyId) return false;
  try {
    const { data, error } = await supabase
      .from('stripe_connections')
      .select('charges_enabled')
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) return false;
    return (data as { charges_enabled?: boolean } | null)?.charges_enabled === true;
  } catch {
    return false;
  }
}

/**
 * `createFactuurPaymentLink`: de iDEAL-betaallink voor deze factuur. De Edge
 * Function bepaalt zelf of er een link komt (koppeling actief, feature, bedrag
 * > 0) en geeft anders `url: null`. Een fout geeft hier ook null: de mail gaat
 * dan zonder knop, zoals in het dashboard — Stripe mag het versturen nooit
 * tegenhouden.
 */
export async function maakBetaallink(factuurId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-create-payment-link', {
      body: { factuur_id: factuurId },
    });
    if (error) {
      console.warn('[documentMailService.maakBetaallink]', await leesFout(error, 'mislukt'));
      return null;
    }
    return (data as { url?: string | null } | null)?.url || null;
  } catch {
    return null;
  }
}
