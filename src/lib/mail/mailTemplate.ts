/**
 * `mailTemplate()` en `mailButton()` zoals in het dashboard
 * (src/utils/mailTemplate.js), zodat een mail vanuit de app er bij de
 * ontvanger precies zo uitziet als een mail vanuit het dashboard:
 *  - companyName 'BossBase': de BossBase-opmaak (systeemmail, bv. de
 *    uitnodiging);
 *  - een andere naam: de zakelijke variant in de huisstijl van het bedrijf.
 *
 * De opmaak zelf staat in ./vendored: een letterlijke kopie van de gedeelde
 * mailcode van het dashboard (scripts/mail-overnemen.mjs). Tot oktober 2026
 * stond hier een eigen kopie die achterliep: de knop in de bedrijfskleur miste
 * de Gmail-fix voor donkere modus (dashboardcommit 71066c0).
 * tests/mailOpmaak.test.mjs en tests/werkbonVersturen.test.mjs vergelijken met
 * het dashboard.
 */
import { bossbaseMail } from './vendored/bossbaseMail';
import { zakelijkeMail, mailButton as dashboardMailButton, readableTextColor as dashboardTekstkleur } from './vendored/zakelijkeMail';

/** HTML-escape voor platte tekst in de mail (esc / escapeHtml). */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Leesbare tekstkleur op een achtergrond (readableTextColor). */
export function readableTextColor(hex: string | null | undefined): string {
  return dashboardTekstkleur(hex ?? undefined);
}

/** Eén mail-knop in de bedrijfskleur (mailButton). */
export function mailButton(text: string, url: string, brandColor?: string | null): string {
  return dashboardMailButton(text, url, brandColor ?? undefined);
}

export type MailOpties = {
  title: string;
  preheader?: string;
  /** Rauwe HTML; de aanroeper escapet wat erin moet. */
  body: string;
  buttonText?: string;
  buttonUrl?: string;
  /** Rauwe HTML. */
  footerText?: string;
  companyName?: string;
  logoUrl?: string | null;
  brandColor?: string | null;
};

/** mailTemplate() uit het dashboard, regel voor regel. */
export function mailTemplate({
  title,
  preheader,
  body,
  buttonText,
  buttonUrl,
  footerText,
  companyName = 'BossBase',
  logoUrl,
  brandColor,
}: MailOpties): string {
  if (companyName === 'BossBase') {
    return bossbaseMail({
      titel: title,
      kop: esc(title),
      voorvertoning: preheader || title,
      inhoud: body,
      knop: buttonText && buttonUrl ? { tekst: buttonText, url: buttonUrl } : undefined,
      voetnoot: footerText,
    });
  }
  return zakelijkeMail({
    title, preheader, body, buttonText, buttonUrl, footerText, companyName,
    logoUrl: logoUrl ?? undefined, brandColor: brandColor ?? undefined,
  });
}
