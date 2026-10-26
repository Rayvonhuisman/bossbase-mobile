import type { SupabaseClient } from '@supabase/supabase-js';
import { esc, mailButton, mailTemplate } from './mail/mailTemplate';

/**
 * Werkbon laten ondertekenen en de Wkb-waarschuwing, met dezelfde aanroepen
 * als het dashboard (src/services/werkbonOndertekenenService.js,
 * emailService.js en werkbonService.legWaarschuwingVast).
 *
 * De Supabase-client komt als argument binnen, zodat
 * tests/werkbonVersturen.test.mjs deze code in Node met een nep-client kan
 * draaien en de verzoeken vergelijkt met die van het dashboard. Er wordt in
 * die test niets verstuurd.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** De publieke ondertekenpagina van het dashboard (werkbonSignUrl). */
export const SIGN_BASIS = 'https://dashboard.bossbase.nl';
export function werkbonSignUrl(signToken: string | null | undefined): string | null {
  return signToken ? `${SIGN_BASIS}/werkbon/${signToken}` : null;
}

/** De werkbon zoals deze functies hem nodig hebben. */
export type VerstuurWerkbon = {
  id: string;
  nummer: string | null;
  titel: string | null;
  sign_token: string | null;
  customer_id: string | null;
};

/** getCurrentCompany()/toCompany: alleen wat de mail gebruikt. */
export type MailBedrijf = { name: string; logoUrl: string; brandingColor: string };
export type MailKlant = { name?: string | null } | null;

/** Een fout met een melding die zo op het scherm kan. */
export class VersturenFout extends Error {}

type Bijlage = { filename: string; content: string };

/** De echte melding staat in de response body, niet in error.message. */
async function functieFout(error: { message?: string; context?: unknown }): Promise<string> {
  let melding = error.message || 'Er ging iets mis';
  try {
    const b = await (error.context as { json?: () => Promise<{ error?: string }> } | undefined)?.json?.();
    if (b?.error) melding = b.error;
  } catch {
    /* de rauwe melding is dan het beste wat we hebben */
  }
  return melding;
}

/**
 * sendEmail() uit emailService.js: de afzendernaam en het antwoordadres van
 * het bedrijf (reply_to_email, anders het bedrijfsadres) centraal opgelost.
 */
export async function verstuurMail(
  client: SupabaseClient,
  companyId: string,
  mail: { to: string; subject: string; html: string; attachments?: Bijlage[]; werkbonId?: string | null },
): Promise<void> {
  let fromName = 'BossBase';
  let replyTo: string | null = null;
  try {
    const { data } = await client
      .from('companies')
      .select('name, reply_to_email, email')
      .eq('id', companyId)
      .maybeSingle();
    const co = data as { name?: string; reply_to_email?: string; email?: string } | null;
    fromName = co?.name || 'BossBase';
    replyTo = co?.reply_to_email || co?.email || null;
  } catch {
    /* zoals het dashboard: dan BossBase zonder antwoordadres */
  }
  // Soort werkbon: send-email vraagt dan dat je de werkbon mag beheren
  // (uitvoerder, verantwoordelijke, of werkbonnen/planning). Review 26-10, S2-02.
  const body: Record<string, unknown> = {
    to: mail.to, subject: mail.subject, html: mail.html, from_name: fromName, gerelateerd_type: 'werkbon',
  };
  if (mail.werkbonId) body.gerelateerd_id = mail.werkbonId;
  if (replyTo) body.reply_to = replyTo;
  if (mail.attachments?.length) body.attachments = mail.attachments;

  const { data, error } = await client.functions.invoke('send-email', { body });
  if (error) throw new VersturenFout(await functieFout(error));
  if (!(data as { success?: boolean } | null)?.success) {
    throw new VersturenFout((data as { error?: string } | null)?.error || 'Versturen mislukt');
  }
}

/** logSentEmail(): de mail in het archief op de klantkaart. Mislukt stil. */
export async function logVerstuurdeMail(
  client: SupabaseClient,
  r: { companyId: string; toEmail: string; subject: string; bodyHtml: string; relatedId: string; customerId: string | null },
): Promise<void> {
  const { error } = await client.from('sent_emails').insert({
    to_email: r.toEmail,
    subject: r.subject,
    body_html: r.bodyHtml || null,
    related_type: 'werkbon',
    related_id: r.relatedId || null,
    customer_id: r.customerId || null,
    status: 'sent',
    company_id: r.companyId,
  });
  if (error && typeof __DEV__ !== 'undefined' && __DEV__) console.log('[werkbon] mailarchief bijwerken mislukt', error.message);
}

declare const __DEV__: boolean | undefined;

// ── Ondertekenen ter plekke ───────────────────────────────────────────────

export type SignResultaat = {
  success: true;
  werkbon_nummer?: string;
  ondertekend_op?: string;
  ondertekend_door_naam?: string;
  handtekening_url?: string | null;
  ondertekende_pdf_url?: string | null;
  warnings?: string[];
};

/**
 * signWerkbon(): de klant tekent op het toestel. Ook ingelogd via het
 * sign_token en de Edge Function `sign-werkbon`; die maakt het ondertekende
 * exemplaar, zet de bon op slot en mailt de bevestiging.
 */
export async function signWerkbon(
  client: SupabaseClient,
  { signToken, name, email, signatureDataUrl }: { signToken: string; name: string; email: string; signatureDataUrl: string },
): Promise<SignResultaat> {
  const body = { sign_token: signToken, name, email, signature_data_url: signatureDataUrl };
  const { data, error } = await client.functions.invoke('sign-werkbon', { body });
  if (error) throw new VersturenFout(await functieFout(error));
  const d = data as (SignResultaat & { error?: string }) | { success?: false; error?: string } | null;
  if (!d?.success) throw new VersturenFout(d?.error || 'Ondertekenen mislukt');
  return d as SignResultaat;
}

/** Wat het scherm na het tekenen meldt (handleAfrondKlaar). */
export function signMelding(res: Pick<SignResultaat, 'warnings'> | null | undefined): { ok: boolean; tekst: string } {
  const w = Array.isArray(res?.warnings) ? res!.warnings! : [];
  return w.length
    ? { ok: false, tekst: `Ondertekend en afgerond, maar: ${w.join(' · ')}` }
    : { ok: true, tekst: 'Ondertekend en afgerond. De klant heeft de bon per mail gekregen.' };
}

// ── Per mail ter ondertekening ────────────────────────────────────────────

export function ondertekenMail({
  werkbon,
  link,
  customer,
  company,
}: {
  werkbon: Pick<VerstuurWerkbon, 'nummer' | 'titel'>;
  link: string;
  customer: MailKlant;
  company: MailBedrijf | null;
}): { onderwerp: string; html: string } {
  const bedrijf = company?.name || 'ons bedrijf';
  const onderwerp = `Werkbon ${werkbon.nummer || ''} — graag uw akkoord`;
  const html = mailTemplate({
    title: onderwerp,
    preheader: `Werkbon ${werkbon.nummer || ''} ligt klaar om af te tekenen`,
    body: `<p>Beste ${esc(customer?.name || 'klant')},</p>
<p>Het werk aan <strong>${esc(werkbon.titel || '')}</strong> is klaar. Wilt u de werkbon nalezen en digitaal aftekenen?</p>
${mailButton('Werkbon bekijken en ondertekenen', link, company?.brandingColor)}
<p style="font-size:13px;color:#6b7280">Werkt de knop niet? Kopieer deze link in uw browser:<br>${link}</p>
<p>Met vriendelijke groet,<br>${esc(bedrijf)}</p>`,
    companyName: bedrijf,
    logoUrl: company?.logoUrl,
    brandColor: company?.brandingColor,
  });
  return { onderwerp, html };
}

/**
 * verstuurWerkbonTerOndertekening(): de link per mail, met de werkbon als
 * PDF-bijlage (mislukt die, dan gaat de mail zonder), in het mailarchief, en
 * `verstuurd_naar_email`/`verstuurd_op` op de werkbon. De bon blijft open tot
 * de klant tekent.
 */
export async function verstuurTerOndertekening(
  client: SupabaseClient,
  {
    werkbon,
    email,
    companyId,
    customer,
    company,
    maakPdfBase64,
  }: {
    werkbon: VerstuurWerkbon;
    email: string;
    companyId: string;
    customer: MailKlant;
    company: MailBedrijf | null;
    /** De bijlage; mag gooien. */
    maakPdfBase64: () => Promise<string>;
  },
): Promise<{ email: string; link: string }> {
  const adres = String(email || '').trim();
  if (!adres) throw new VersturenFout('Vul een e-mailadres in');
  if (!EMAIL_RE.test(adres)) throw new VersturenFout('Dat is geen geldig e-mailadres');
  const link = werkbonSignUrl(werkbon.sign_token);
  if (!link) {
    throw new VersturenFout('Deze werkbon heeft nog geen ondertekenlink. Herlaad de pagina en probeer het opnieuw.');
  }

  let bijlage: Bijlage | null = null;
  try {
    bijlage = { filename: `Werkbon-${werkbon.nummer || ''}.pdf`, content: await maakPdfBase64() };
  } catch {
    // De link is het eigenlijke doel; de mail gaat ook zonder bijlage.
  }

  const { onderwerp, html } = ondertekenMail({ werkbon, link, customer, company });
  await verstuurMail(client, companyId, {
    to: adres,
    subject: onderwerp,
    html,
    attachments: bijlage ? [bijlage] : undefined,
    werkbonId: werkbon.id,
  });
  void logVerstuurdeMail(client, {
    companyId,
    toEmail: adres,
    subject: onderwerp,
    bodyHtml: html,
    relatedId: werkbon.id,
    customerId: werkbon.customer_id,
  });
  await client
    .from('werkbonnen')
    .update({ verstuurd_naar_email: adres, verstuurd_op: new Date().toISOString() })
    .eq('id', werkbon.id);
  return { email: adres, link };
}

// ── Wkb-waarschuwing ──────────────────────────────────────────────────────

/** bouwWaarschuwingMail(): constatering en gevolg als twee aparte blokken. */
export function waarschuwingMail({
  werkbon,
  constatering,
  gevolg,
  customer,
  company,
}: {
  werkbon: Pick<VerstuurWerkbon, 'titel'> | null;
  constatering: string;
  gevolg: string;
  customer: MailKlant;
  company: MailBedrijf | null;
}): { onderwerp: string; html: string } {
  const wat = String(constatering || '').trim();
  const gev = String(gevolg || '').trim();
  const bedrijf = company?.name || 'ons bedrijf';
  const onderwerp = `Belangrijke constatering bij ${werkbon?.titel || 'het werk'}`;
  const accent = company?.brandingColor || '#1DDB62';

  const gevolgBlok = gev
    ? `<p style="margin:18px 0 6px;font-weight:700;color:#0a0a0a;">Wat daarvan het gevolg kan zijn</p>
<div style="border-left:3px solid #f59e0b;background:#fffbeb;padding:10px 14px;border-radius:4px;">
${esc(gev).replace(/\n/g, '<br>')}</div>`
    : '';

  const html = mailTemplate({
    title: onderwerp,
    preheader: 'Wij hebben iets geconstateerd dat gevolgen kan hebben',
    body: `<p>Beste ${esc(customer?.name || 'klant')},</p>
<p>Tijdens het werk aan <strong>${esc(werkbon?.titel || '')}</strong> hebben wij iets
geconstateerd dat buiten de opdracht valt en gevolgen kan hebben. Wij zijn verplicht u
hierover te informeren, zodat u kunt beslissen wat u wilt doen.</p>

<p style="margin:18px 0 6px;font-weight:700;color:#0a0a0a;">Wat wij hebben geconstateerd</p>
<div style="border-left:3px solid ${esc(accent)};background:#f9fafb;padding:10px 14px;border-radius:4px;">
${esc(wat).replace(/\n/g, '<br>')}</div>
${gevolgBlok}

<p style="margin-top:18px;">Wilt u laten weten hoe u hiermee verder wilt? U kunt op deze
mail antwoorden.</p>
<p>Met vriendelijke groet,<br>${esc(bedrijf)}</p>`,
    footerText:
      'Deze melding versturen wij op grond van onze waarschuwingsplicht ' +
      '(artikel 7:754 BW, Wet kwaliteitsborging voor het bouwen).',
    companyName: bedrijf,
    logoUrl: company?.logoUrl,
    brandColor: company?.brandingColor,
  });
  return { onderwerp, html };
}

/**
 * verstuurWaarschuwing(): eerst de mail, dan pas vastleggen. Gaat de mail
 * mis, dan staat er ook geen verzenddatum — geen bewijs van iets wat nooit is
 * aangekomen. Het gevolg is bewust niet verplicht.
 */
export async function verstuurWaarschuwing<T>(
  client: SupabaseClient,
  {
    werkbon,
    notitieId,
    constatering,
    gevolg,
    email,
    companyId,
    customer,
    company,
    kolommen = '*',
  }: {
    werkbon: VerstuurWerkbon;
    notitieId: string;
    constatering: string;
    gevolg: string;
    email: string;
    companyId: string;
    customer: MailKlant;
    company: MailBedrijf | null;
    /** De select na het vastleggen (het dashboard: '*, profiles(full_name)'). */
    kolommen?: string;
  },
): Promise<{ email: string; notitie: T }> {
  const adres = String(email || '').trim();
  if (!adres) throw new VersturenFout('Vul een e-mailadres in');
  if (!EMAIL_RE.test(adres)) throw new VersturenFout('Dat is geen geldig e-mailadres');
  const wat = String(constatering || '').trim();
  const gev = String(gevolg || '').trim();
  if (!wat) throw new VersturenFout('Beschrijf wat je hebt geconstateerd');

  const { onderwerp, html } = waarschuwingMail({ werkbon, constatering: wat, gevolg: gev, customer, company });
  await verstuurMail(client, companyId, { to: adres, subject: onderwerp, html, werkbonId: werkbon.id });
  void logVerstuurdeMail(client, {
    companyId,
    toEmail: adres,
    subject: onderwerp,
    bodyHtml: html,
    relatedId: werkbon.id,
    customerId: werkbon.customer_id,
  });

  // legWaarschuwingVast(): het bewijs in één statement.
  const nu = new Date().toISOString();
  const { data, error } = await client
    .from('werkbon_notities')
    .update({
      note: wat,
      gevolg: gev,
      waarschuwing_verzonden_op: nu,
      waarschuwing_verzonden_naar: adres,
      updated_at: nu,
    })
    .eq('id', notitieId)
    .select(kolommen)
    .single();
  if (error || !data) {
    throw new VersturenFout('De mail is verstuurd, maar het vastleggen lukte niet. Probeer het opnieuw of meld het.');
  }
  return { email: adres, notitie: data as T };
}
