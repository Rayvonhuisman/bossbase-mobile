// @ts-nocheck
// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase supabase/functions/_shared/zakelijkeMail.ts
// Dashboardcommit: 4f36bec
// Bijwerken: node scripts/mail-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie; tests/mailOpmaak.test.mjs
// vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
// De opmaak van mail die een ondernemer aan zijn eigen klanten stuurt
// (offertes, facturen, werkbonnen, herinneringen, afspraken): bedrijfslogo en
// bedrijfskleur, geen "via BossBase" behalve de kleine regel onderaan.
//
// Eén bestand, zonder Deno- of browser-API's, zodat zowel de edge functions
// (_shared/mailTemplate.ts) als de frontend (src/utils/mailTemplate.js) het
// importeren. Dit stond eerder als twee gelijke kopieën in die twee bestanden.
//
// Donkere modus: geen color-scheme en geen eigen donkere CSS; elk mailprogramma
// doet wat het zelf doet. Met color-scheme "light dark" ging Apple Mail de
// kleuren omdraaien en zag de mail er slechter uit (23 oktober 2026). Alleen de
// eigen mails van BossBase (bossbaseMail.ts) zijn geforceerd licht.
//
// Eén uitzondering: de knop in de bedrijfskleur, voor Gmail. Gmail draait in
// donkere modus achtergrondkleuren om, een background-image niet: daarom staat
// de kleur er ook als gradient (donkerVlak). Witte knoptekst zou Gmail donker
// maken; gmailWitInline houdt hem wit (de CSS daarvoor geldt alleen in Gmail,
// via "u + .body"). Donkere tekst op een lichte bedrijfskleur kan Gmail nog wel
// licht maken; daar bestaat geen truc voor.

import { donkerVlak, gmailWitInline, GMAIL_WIT_CSS } from './mailKleur'

const BOSSBASE_GREEN = '#1DDB62'

// Leesbare tekstkleur op een achtergrondkleur: donkere tekst op lichte kleuren
// (bv. geel), witte tekst op donkere kleuren. O.b.v. waargenomen helderheid.
export function readableTextColor(hex?: string): string {
  let h = String(hex || '').trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#ffffff'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#0a0a0a' : '#ffffff'
}

// HTML-escape voor door gebruikers/bedrijven ingevoerde tekst die als PLATTE
// tekst in de mail-HTML terechtkomt (titel, preheader, bedrijfsnaam, knoptekst).
// `body` en `footerText` blijven bewust rauwe HTML (developer-gecontroleerd).
function esc(s?: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Alleen http(s)-URL's toestaan in href/src (blokkeert javascript:/data:), en
// daarna attribuut-escapen. Ongeldige URL → lege string (geen XSS-vector).
function safeUrl(u?: string): string {
  const s = String(u ?? '').trim()
  if (!/^https?:\/\//i.test(s)) return ''
  return esc(s)
}

// De knop voor Gmail (zie boven): kleur ook als gradient, witte tekst vast.
// Alleen een geldige hex-kleur in de gradient; iets anders blijft zoals het was.
const knopVlak = (bg: string) => (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(bg) ? donkerVlak(bg) : `background:${bg};`)
const knopTekst = (tekst: string, fg: string) => (fg === '#ffffff' ? gmailWitInline(esc(tekst)) : esc(tekst))

// Eén bron voor een mail-knop: achtergrond = bedrijfskleur (val terug op
// BossBase-groen, nooit een vaste oranje), tekstkleur o.b.v. leesbaarheid.
export function mailButton(text: string, url: string, brandColor?: string): string {
  const bg = brandColor || BOSSBASE_GREEN
  const fg = readableTextColor(bg)
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:10px 0;"><tr><td bgcolor="${esc(bg)}" style="border-radius:8px;${knopVlak(bg)}"><a href="${safeUrl(url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:${fg};text-decoration:none;border-radius:8px;">${knopTekst(text, fg)}</a></td></tr></table>`
}

export type ZakelijkeMailOpties = {
  title: string
  preheader?: string
  body: string
  buttonText?: string
  buttonUrl?: string
  footerText?: string
  companyName: string
  logoUrl?: string
  brandColor?: string
}

export function zakelijkeMail({
  title,
  preheader,
  body,
  buttonText,
  buttonUrl,
  footerText,
  companyName,
  logoUrl,
  brandColor,
}: ZakelijkeMailOpties): string {
  // Zakelijke mail volgt de bedrijfskleur, met BossBase-groen als terugval.
  const accent = brandColor || BOSSBASE_GREEN

  // Header: bedrijfslogo of, als dat ontbreekt, de bedrijfsnaam als tekst.
  let headerHtml: string
  if (safeUrl(logoUrl)) {
    // Alleen een plaatje als er een geldige logo-URL is; anders de bedrijfsnaam
    // als tekst — nooit een leeg of gebroken plaatje.
    headerHtml = `<img src="${safeUrl(logoUrl)}" alt="${esc(companyName)}" height="40" style="max-height:48px;max-width:220px;display:inline-block;border:0;outline:none;text-decoration:none;">`
  } else {
    headerHtml = `<span style="font-size:20px;font-weight:700;color:#0a0a0a;letter-spacing:-0.5px;">${esc(companyName)}</span>`
  }

  const footerLine = `Verstuurd met <a href="https://www.bossbase.nl" style="color:#9ca3af;text-decoration:none;font-weight:600;">BossBase</a>`

  const accentText = readableTextColor(accent)
  const buttonHtml = buttonText && buttonUrl ? `
              <table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 0;">
                <tr>
                  <td bgcolor="${esc(accent)}" style="border-radius:8px;${knopVlak(accent)}">
                    <a href="${safeUrl(buttonUrl)}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${accentText};text-decoration:none;border-radius:8px;">
                      ${knopTekst(buttonText, accentText)}
                    </a>
                  </td>
                </tr>
              </table>` : ''

  const footerTextHtml = footerText
    ? `<p style="margin:24px 0 0;font-size:13px;color:#6b7280;">${footerText}</p>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>${GMAIL_WIT_CSS}</style>
</head>
<body class="body" style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
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
</html>`
}
