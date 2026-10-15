/**
 * Klantmail in de huisstijl van het bedrijf — de zakelijke variant van
 * `mailTemplate()` uit het dashboard (src/utils/mailTemplate.js), regel voor
 * regel overgenomen zodat de mail die de app verstuurt dezelfde is.
 * tests/werkbonVersturen.test.mjs vergelijkt de uitvoer met het dashboard.
 *
 * Alleen de zakelijke variant (bedrijf → klant). De systeemvariant
 * (BossBase → gebruiker, companyName 'BossBase') is hier niet nodig: collega-
 * meldingen bouwt de Edge Function `create-notification` zelf.
 *
 * Bewust zonder imports, zodat de tests dit rechtstreeks in Node draaien.
 */

const BOSSBASE_GREEN = '#1DDB62';

/** Leesbare tekstkleur op een achtergrond (readableTextColor). */
export function readableTextColor(hex: string | null | undefined): string {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#0a0a0a' : '#ffffff';
}

/** HTML-escape voor platte tekst in de mail (esc / escapeHtml). */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Alleen http(s) in href/src; anders leeg. */
function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return '';
  return esc(s);
}

/** Eén mail-knop in de bedrijfskleur (mailButton). */
export function mailButton(text: string, url: string, brandColor?: string | null): string {
  const bg = brandColor || BOSSBASE_GREEN;
  const fg = readableTextColor(bg);
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:10px 0;"><tr><td style="border-radius:8px;background:${bg};"><a href="${safeUrl(url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:${fg};text-decoration:none;border-radius:8px;">${esc(text)}</a></td></tr></table>`;
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
  companyName: string;
  logoUrl?: string | null;
  brandColor?: string | null;
};

/** mailTemplate() met een bedrijfsnaam: de zakelijke variant. */
export function mailTemplate({
  title,
  preheader,
  body,
  buttonText,
  buttonUrl,
  footerText,
  companyName,
  logoUrl,
  brandColor,
}: MailOpties): string {
  // Zakelijke mail volgt de bedrijfskleur, met BossBase-groen als terugval.
  const accent = brandColor || BOSSBASE_GREEN;

  // Header: bedrijfslogo of, als dat ontbreekt, de bedrijfsnaam als tekst.
  let headerHtml;
  if (safeUrl(logoUrl)) {
    headerHtml = `<img src="${safeUrl(logoUrl)}" alt="${esc(companyName)}" height="40" style="max-height:48px;max-width:220px;display:inline-block;border:0;outline:none;text-decoration:none;">`;
  } else {
    headerHtml = `<span style="font-size:20px;font-weight:700;color:#0a0a0a;letter-spacing:-0.5px;">${esc(companyName)}</span>`;
  }

  const footerLine = `Verstuurd met <a href="https://www.bossbase.nl" style="color:#9ca3af;text-decoration:none;font-weight:600;">BossBase</a>`;

  const accentText = readableTextColor(accent);
  const buttonHtml = buttonText && buttonUrl ? `
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 0;">
                <tr>
                  <td style="border-radius:8px;background:${accent};">
                    <a href="${safeUrl(buttonUrl)}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${accentText};text-decoration:none;border-radius:8px;">
                      ${esc(buttonText)}
                    </a>
                  </td>
                </tr>
              </table>` : '';

  const footerTextHtml = footerText
    ? `<p style="margin:24px 0 0;font-size:13px;color:#6b7280;">${footerText}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(preheader || title)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #f3f4f6;">
              ${headerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0a0a0a;line-height:1.3;">${esc(title)}</h1>
              <div style="font-size:15px;color:#374151;line-height:1.6;">
                ${body}
              </div>
              ${buttonHtml}
              ${footerTextHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                ${footerLine}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
