// @ts-nocheck
// ── OVERGENOMEN UIT HET DASHBOARD — niet met de hand bewerken ──
// Bron: BossBase supabase/functions/_shared/bossbaseMail.ts
// Dashboardcommit: 1f9e440
// Bijwerken: node scripts/mail-overnemen.mjs (daarna npm test).
// Alles onder deze kop is een letterlijke kopie; tests/mailOpmaak.test.mjs
// vergelijkt het met het dashboard.
// ── einde overgenomen kop ──
// De opmaak van alle mail die BossBase ZELF verstuurt: aan gebruikers
// (proefperiode, abonnement, uitnodiging, wachtwoord, verificatiecode,
// meldingen aan collega's, avondsamenvatting, urenherinnering) en aan ons eigen
// info@bossbase.nl.
//
// NIET voor mail die een ondernemer aan zijn eigen klanten stuurt (offertes,
// facturen, werkbonnen, herinneringen, afspraken): die houdt de huisstijl van
// dat bedrijf en loopt via de zakelijke variant van mailTemplate.
//
// Eén bestand, zonder Deno- of browser-API's, zodat zowel de edge functions
// (_shared/mailTemplate.ts) als de frontend (src/utils/mailTemplate.js) het
// importeren. Twee kopieën liepen eerder uit elkaar.
//
// Mailclients, kort:
//  - Alles in tabellen met inline stijl; Outlook (Word-engine) kent geen flex,
//    grid, max-width of padding op <a>. Daarom bgcolor-attributen naast
//    background, een VML-knop voor Outlook en Arial als Outlook-lettertype.
//  - Gmail laat <style> in <head> staan voor de mediaquery's, maar alles moet
//    ook zonder die query's leesbaar zijn: de query's maken het alleen strakker.
//  - Altijd licht, ook in donkere modus: zie mailKleur.ts. De kop is een
//    plaatje, zwarte vlakken krijgen een gradient (donkerVlak) en witte tekst
//    daarop gmailWit, zodat Gmail ze niet omdraait.

import { donkerVlak, gmailWit, kopPlaatje, GMAIL_WIT_CSS, MAIL_KLEURSCHEMA_CSS, MAIL_KLEURSCHEMA_META } from './mailKleur'

const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const veiligeUrl = (u: unknown) => /^(https?:|mailto:|tel:)/i.test(String(u ?? '').trim()) ? esc(String(u).trim()) : ''

// ── Huisstijl ───────────────────────────────────────────────────────────────
export const BB = {
  groen: '#1DDB62',
  groenDonker: '#047a35',
  zwart: '#0D0D0D',
  tekst: '#374151',
  grijs: '#6b7280',
  lichtgrijs: '#9ca3af',
  vlak: '#f4f4f2',
  rand: '#e5e7eb',
  achtergrond: '#ecece8',
  font: `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`,
}

export const NIELS_FOTO_URL = 'https://www.bossbase.nl/brand/niels.jpg'

export const NIELS = {
  naam: 'Niels Grevink',
  telefoonLeesbaar: '06 42 00 58 89',
  telefoon: '+31642005889',
  whatsapp: 'https://wa.me/31642005889',
  mail: 'info@bossbase.nl',
}

// ── Bouwstenen ──────────────────────────────────────────────────────────────
// Vaste maten: tekst 16px, klein 14px, labels 12px hoofdletters. Tussen blokken
// steeds 24px, tussen alinea's 16px.

export const bbP = (inhoud: string) =>
  `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${BB.tekst};">${inhoud}</p>`

export const bbKlein = (inhoud: string) =>
  `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${BB.grijs};">${inhoud}</p>`

export const bbKop2 = (tekst: string) =>
  `<p style="margin:32px 0 12px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BB.zwart};">${tekst}</p>`

const label = (tekst: string, kleur: string) =>
  `<div style="font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${kleur};">${tekst}</div>`

// Groot cijfer op zwart: wat het oplevert, in één oogopslag.
export const bbGrootCijfer = (cijfer: string, onderschrift: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
    <tr><td bgcolor="${BB.zwart}" style="${donkerVlak(BB.zwart)}border-radius:14px;padding:24px 26px;">
      <div class="bb-groot" style="font-size:44px;line-height:48px;font-weight:800;letter-spacing:-1.5px;color:${BB.groen};mso-line-height-rule:exactly;">${cijfer}</div>
      <div style="margin-top:8px;font-size:15px;line-height:1.5;color:#d1d5db;">${gmailWit(onderschrift)}</div>
    </td></tr>
  </table>`

// Oud tegenover nieuw, naast elkaar. Het oude getal staat donker en rood
// doorgestreept: lichtgrijs op grijs las als "uitgeschakeld", niet als "zo was het".
export const bbVergelijking = (oud: [string, string], nieuw: [string, string], eenheid = '') => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
    <tr>
      <td width="50%" valign="top" bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${BB.rand};border-radius:14px;padding:19px 21px;">
        ${label(oud[0], BB.tekst)}
        <div class="bb-vgl" style="margin-top:6px;font-size:34px;line-height:40px;font-weight:800;letter-spacing:-1px;color:${BB.tekst};mso-line-height-rule:exactly;white-space:nowrap;"><span style="text-decoration:line-through;text-decoration-color:#ef4444;text-decoration-thickness:3px;">${oud[1]}</span></div>
        ${eenheid ? `<div style="margin-top:2px;font-size:13px;line-height:1.4;color:${BB.grijs};">${eenheid}</div>` : ''}
      </td>
      <td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>
      <td width="50%" valign="top" bgcolor="${BB.zwart}" style="${donkerVlak(BB.zwart)}border:1px solid ${BB.zwart};border-radius:14px;padding:19px 21px;">
        ${label(nieuw[0], BB.groen)}
        <div class="bb-vgl" style="margin-top:6px;font-size:34px;line-height:40px;font-weight:800;letter-spacing:-1px;color:#ffffff;mso-line-height-rule:exactly;white-space:nowrap;">${gmailWit(nieuw[1])}</div>
        ${eenheid ? `<div style="margin-top:2px;font-size:13px;line-height:1.4;color:#9ca3af;">${eenheid}</div>` : ''}
      </td>
    </tr>
  </table>`

// Wat het oplevert: één groot bedrag, met daaronder hoe je eraan komt en wat
// het kost. Bedrag en onderschrift elk op een eigen regel en zonder afbreken,
// zodat "€" en "1.250" nooit van elkaar los komen.
export const bbBesparing = (o: { bovenkop: string; bedrag: string; onder: string; feiten: [string, string][] }) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
    <tr><td bgcolor="${BB.zwart}" style="${donkerVlak(BB.zwart)}border-radius:16px;padding:26px 26px 22px;">
      ${label(o.bovenkop, BB.groen)}
      <div class="bb-groot" style="margin-top:8px;font-size:48px;line-height:52px;font-weight:800;letter-spacing:-1.5px;color:${BB.groen};white-space:nowrap;mso-line-height-rule:exactly;">${o.bedrag}</div>
      <div style="margin-top:4px;font-size:18px;line-height:1.35;font-weight:700;color:#ffffff;">${gmailWit(o.onder)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border-top:1px solid #2a2a2a;">
        <tr>
          ${o.feiten.map(([waarde, uitleg], i) => `
          <td width="${Math.floor(100 / o.feiten.length)}%" valign="top" style="padding:16px ${i < o.feiten.length - 1 ? '12px' : '0'} 0 0;">
            <div style="font-size:20px;line-height:1.3;font-weight:800;color:#ffffff;white-space:nowrap;">${gmailWit(waarde)}</div>
            <div style="margin-top:2px;font-size:13px;line-height:1.4;color:#9ca3af;">${uitleg}</div>
          </td>`).join('')}
        </tr>
      </table>
    </td></tr>
  </table>`

// Stappen naast elkaar: drie kaartjes met een nummer, een korte kop en één zin.
// Op een telefoon (mediaquery) komen ze onder elkaar; zonder query-ondersteuning
// blijven ze naast elkaar staan, daarom kort houden. Het rondje is een cel met
// vaste maat: een div met border-radius valt in Outlook uit elkaar.
export const bbStappen = (stappen: { kop: string; tekst: string }[]) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
    <tr>
      ${stappen.map((st, i) => `
      ${i > 0 ? '<td class="bb-tussen" width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>' : ''}
      <td class="bb-kol" width="${Math.floor(100 / stappen.length)}%" valign="top" bgcolor="${BB.vlak}" style="background:${BB.vlak};border-radius:14px;padding:18px 16px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="30" height="30" align="center" valign="middle" bgcolor="${BB.groen}" style="width:30px;height:30px;background:${BB.groen};border-radius:15px;font-size:14px;line-height:30px;font-weight:800;color:${BB.zwart};mso-line-height-rule:exactly;">${i + 1}</td>
        </tr></table>
        <div style="margin-top:12px;font-size:16px;line-height:1.3;font-weight:800;color:${BB.zwart};">${st.kop}</div>
        <div style="margin-top:4px;font-size:14px;line-height:1.5;color:${BB.tekst};">${st.tekst}</div>
      </td>`).join('')}
    </tr>
  </table>`

export const bbVinkjes = (regels: string[]) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
    ${regels.map(r => `
    <tr>
      <td valign="top" width="26" style="width:26px;padding:0 0 10px;font-size:16px;line-height:1.55;font-weight:800;color:${BB.groen};">&#10003;</td>
      <td valign="top" style="padding:0 0 10px;font-size:16px;line-height:1.55;color:${BB.tekst};">${r}</td>
    </tr>`).join('')}
  </table>`

// Rekentabel: taak, nu, in BossBase, wat het scheelt. De ronde hoeken zitten op
// de hoekcellen zelf; overflow:hidden op een tabel negeert Gmail.
export function bbRekentabel(kolommen: [string, string, string, string], rijen: [string, string, string, string][], totaal: [string, string]) {
  const cel = (inhoud: string, o: { rechts?: boolean; kleur?: string; vet?: boolean; boven?: boolean; extra?: string } = {}) =>
    `<td class="bb-cel" align="${o.rechts ? 'right' : 'left'}" style="padding:12px 14px;${o.boven ? `border-top:1px solid ${BB.rand};` : ''}font-size:14px;line-height:1.4;color:${o.kleur ?? BB.zwart};${o.vet ? 'font-weight:700;' : ''}${o.rechts ? 'white-space:nowrap;' : ''}${o.extra ?? ''}">${inhoud}</td>`
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border:1px solid ${BB.rand};border-radius:14px;border-collapse:separate;border-spacing:0;">
    <tr>
      ${cel(kolommen[0], { kleur: BB.grijs, vet: true, extra: `background:${BB.vlak};border-radius:13px 0 0 0;` })}
      ${cel(kolommen[1], { rechts: true, kleur: BB.grijs, vet: true, extra: `background:${BB.vlak};` })}
      ${cel(kolommen[2], { rechts: true, kleur: BB.grijs, vet: true, extra: `background:${BB.vlak};` })}
      ${cel(kolommen[3], { rechts: true, kleur: BB.grijs, vet: true, extra: `background:${BB.vlak};border-radius:0 13px 0 0;` })}
    </tr>
    ${rijen.map(([a, b, c, d]) => `
    <tr>
      ${cel(a, { boven: true, vet: true })}
      ${cel(b, { boven: true, rechts: true, kleur: BB.lichtgrijs })}
      ${cel(c, { boven: true, rechts: true })}
      ${cel(d, { boven: true, rechts: true, vet: true })}
    </tr>`).join('')}
    <tr>
      <td colspan="3" class="bb-cel" bgcolor="${BB.zwart}" style="padding:14px;${donkerVlak(BB.zwart)}border-radius:0 0 0 13px;font-size:14px;line-height:1.4;font-weight:700;color:#ffffff;">${gmailWit(totaal[0])}</td>
      <td class="bb-cel" align="right" bgcolor="${BB.zwart}" style="padding:14px;${donkerVlak(BB.zwart)}border-radius:0 0 13px 0;font-size:16px;line-height:1.4;font-weight:800;color:${BB.groen};white-space:nowrap;">${totaal[1]}</td>
    </tr>
  </table>`
}

// Een aanbod of uitgelicht punt, op lichtgroen, met optioneel een badge.
export const bbUitgelicht = (bovenkop: string, kop: string, tekst: string, badge?: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
    <tr><td bgcolor="#ecfdf3" style="background:#ecfdf3;border:1px solid #b7f0cd;border-radius:16px;padding:22px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle">${label(bovenkop, BB.groenDonker)}</td>
        ${badge ? `<td valign="middle" align="right"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${BB.groen};font-size:11px;line-height:16px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${BB.zwart};white-space:nowrap;">${badge}</span></td>` : ''}
      </tr></table>
      <div style="margin-top:8px;font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-.4px;color:${BB.zwart};">${kop}</div>
      <div style="margin-top:6px;font-size:15px;line-height:1.55;color:#166534;">${tekst}</div>
    </td></tr>
  </table>`

// De knop. Outlook krijgt een VML-vorm (anders alleen een groen randje om de
// tekst), de rest een gewone link met padding. Breedte voor VML geschat op de
// tekstlengte; Outlook rekt hem niet zelf op.
export function bbKnop(tekst: string, url: string, o: { marge?: string } = {}) {
  const href = veiligeUrl(url)
  const t = esc(tekst)
  const breed = Math.max(180, Math.round(tekst.length * 9.2 + 72))
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${o.marge ?? '8px 0 24px'};">
    <tr><td align="left">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:52px;v-text-anchor:middle;width:${breed}px;" arcsize="20%" stroke="f" fillcolor="${BB.groen}">
        <w:anchorlock/>
        <center style="color:${BB.zwart};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${t} &rarr;</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <a href="${href}" style="display:inline-block;background:${BB.groen};border-radius:10px;padding:16px 28px;font-size:16px;line-height:20px;font-weight:700;color:${BB.zwart};text-decoration:none;mso-hide:all;">${t}&nbsp;&rarr;</a>
      <!--<![endif]-->
    </td></tr>
  </table>`
}

// Handtekening: een zwart kaartje met de vraag, en daarin een wit vlak met de foto en daarnaast naam, BossBase en de
// knoppen Mail, Bel en WhatsApp. Zwart, zodat het niet lijkt op het lichtgroene
// aanbod (bbUitgelicht) dat er vaak vlak boven staat. Korte knopteksten, zodat ze ook op een
// telefoon naast de foto passen. Er is (nog) geen agendalink; antwoorden of bellen is de uitnodiging. Reply-to van deze mails
// staat op info@bossbase.nl.
export function bbHandtekening(o: { titel?: string; tekst?: string } = {}) {
  const knopje = (href: string, tekst: string) =>
    `<a class="bb-knopje" href="${href}" style="display:inline-block;margin:0 6px 6px 0;padding:8px 13px;background:${BB.groen};border-radius:999px;font-size:14px;line-height:18px;font-weight:700;color:${BB.zwart};text-decoration:none;white-space:nowrap;">${tekst}</a>`
  const knoppen = knopje(`mailto:${NIELS.mail}`, 'Mail') + knopje(`tel:${NIELS.telefoon}`, 'Bel') + knopje(NIELS.whatsapp, 'WhatsApp')
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 0;">
    <tr><td class="bb-hand" bgcolor="${BB.zwart}" style="${donkerVlak(BB.zwart)}border-radius:16px;padding:22px 24px 6px;">
      ${o.titel ? `<div style="font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-.4px;color:#ffffff;">${gmailWit(o.titel)}</div>` : ''}
      ${o.tekst ? `<div style="margin-top:6px;font-size:15px;line-height:1.55;color:#d1d5db;">${gmailWit(o.tekst)}</div>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 16px;">
        <tr><td class="bb-hand-wit" bgcolor="#ffffff" style="background:#ffffff;border-radius:14px;padding:16px 16px 10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="top" width="64" style="width:64px;">
              <img class="bb-foto" src="${NIELS_FOTO_URL}" alt="${NIELS.naam}" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:32px;border:0;outline:none;">
            </td>
            <td class="bb-naast" valign="top" style="padding-left:14px;">
              <div style="font-size:17px;line-height:1.3;font-weight:800;color:${BB.zwart};">${NIELS.naam}</div>
              <div style="margin:1px 0 10px;font-size:14px;line-height:1.4;color:${BB.grijs};">BossBase</div>
              ${knoppen}
            </td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>
  </table>`
}

// ── De kop ──────────────────────────────────────────────────────────────────
// Eén plaatje: logo op zwart, met optioneel rechts een label ("Nog 7 dagen
// gratis") en een voortgangsbalk. Vooraf getekend (mailKleur.ts, KOP_VARIANTEN;
// scripts/gen-mail-koppen.mjs), zodat geen mailprogramma er iets aan omdraait.
// De cel eronder is zwart met dezelfde hoeken: staan plaatjes uit (Outlook),
// dan blijft er een zwarte kop met de alt-tekst in wit.
function kop(o: { label?: { tekst: string; kleur?: string }; voortgang?: number | null }) {
  const k = kopPlaatje(o.label, o.voortgang)
  return `
  <tr><td bgcolor="${BB.zwart}" style="${donkerVlak(BB.zwart)}border-radius:18px 18px 0 0;line-height:0;font-size:0;">
    <a href="https://www.bossbase.nl" style="text-decoration:none;"><img src="${k.url}" alt="${esc(k.alt)}" width="600" height="${k.hoog}" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;border-radius:18px 18px 0 0;color:#ffffff;font-size:20px;line-height:${k.hoog}px;font-weight:800;"></a>
  </td></tr>`
}

export type BossbaseMailOpties = {
  titel: string                 // <title>; platte tekst
  kop: string                   // de h1; HTML (escape zelf wat van buiten komt)
  inhoud: string                // HTML
  voorvertoning?: string        // regel naast het onderwerp in de inbox
  bovenkop?: string             // klein groen label boven de h1; HTML
  label?: { tekst: string; kleur?: string }
  voortgang?: number | null
  knop?: { tekst: string; url: string }
  voetnoot?: string             // kleine tekst onderaan in de kaart; HTML
  reden?: string                // waarom je deze mail krijgt; HTML, onder de kaart
  afmeldUrl?: string
}

export function bossbaseMail(o: BossbaseMailOpties): string {
  const voorvertoning = o.voorvertoning || o.titel
  // Een label zonder eigen kopplaatje komt als bovenkop in de mail.
  const bovenkop = o.bovenkop || (kopPlaatje(o.label, o.voortgang).labelLos ? esc(o.label?.tekst) : '')
  return `<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
  ${MAIL_KLEURSCHEMA_META}
  <title>${esc(o.titel)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <style>body,table,td,p,a,div,span,h1{font-family:Arial,Helvetica,sans-serif !important;}</style>
  <![endif]-->
  <style>
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    @media (max-width: 620px) {
      .bb-buiten { padding: 16px 8px 32px !important; }
      .bb-pad { padding-left: 22px !important; padding-right: 22px !important; }
      .bb-h1 { font-size: 26px !important; line-height: 31px !important; }
      .bb-groot { font-size: 36px !important; line-height: 40px !important; }
      .bb-vgl { font-size: 28px !important; line-height: 34px !important; }
      .bb-cel { padding: 10px 7px !important; font-size: 13px !important; }
      .bb-kol { display: block !important; width: auto !important; margin-bottom: 8px !important; }
      .bb-tussen { display: none !important; }
      .bb-hand { padding: 20px 18px 4px !important; }
      .bb-hand-wit { padding: 14px 12px 8px !important; }
      .bb-knopje { padding: 6px 10px !important; font-size: 13px !important; margin-right: 3px !important; }
      .bb-foto { width: 56px !important; height: 56px !important; }
      .bb-naast { padding-left: 12px !important; }
    }
  </style>
  <style>${MAIL_KLEURSCHEMA_CSS}</style>
  <style>${GMAIL_WIT_CSS}</style>
</head>
<body class="body" style="margin:0;padding:0;background:${BB.achtergrond};font-family:${BB.font};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(voorvertoning)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BB.achtergrond}" style="background:${BB.achtergrond};">
    <tr><td class="bb-buiten" align="center" style="padding:32px 12px 40px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        ${kop(o)}
        <tr><td class="bb-pad" bgcolor="#ffffff" style="background:#ffffff;border-radius:0 0 18px 18px;padding:36px 40px 40px;">
          ${bovenkop ? `<div style="margin:0 0 10px;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#059648;">${bovenkop}</div>` : ''}
          <h1 class="bb-h1" style="margin:0 0 20px;font-size:30px;line-height:36px;font-weight:800;letter-spacing:-.8px;color:${BB.zwart};mso-line-height-rule:exactly;">${o.kop}</h1>
          <div style="font-size:16px;line-height:1.6;color:${BB.tekst};">${o.inhoud}</div>
          ${o.knop ? bbKnop(o.knop.tekst, o.knop.url, { marge: '24px 0 8px' }) : ''}
          ${o.voetnoot ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:${BB.grijs};">${o.voetnoot}</p>` : ''}
        </td></tr>
        <tr><td align="center" style="padding:24px 24px 0;font-size:12px;line-height:1.7;color:#8a8a85;">
          BossBase &middot; KvK 91856396 &middot; <a href="https://www.bossbase.nl" style="color:#8a8a85;">bossbase.nl</a>
          ${o.reden ? `<br>${o.reden}` : ''}
          ${o.afmeldUrl ? `<br><a href="${veiligeUrl(o.afmeldUrl)}" style="color:#8a8a85;">Afmelden</a>` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
