/**
 * De mail die de app verstuurt, moet bij de ontvanger dezelfde zijn als die uit
 * het dashboard.
 *
 * 1. Alarm: src/lib/mail/vendored/ moet gelijk zijn aan de gedeelde mailcode
 *    van het dashboard (HEAD). Wijkt het af, dan: npm run mail:overnemen.
 * 2. Uitnodiging, offerte- en factuurmail: dezelfde HTML als het dashboard
 *    (mailTemplate en mailButton uit src/utils/mailTemplate.js, zoals
 *    teamService.js, OffertesPage.jsx en FacturenPage.jsx ze aanroepen).
 *
 * Staat de dashboardrepo niet op deze machine, dan worden deze tests
 * overgeslagen.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIL_BESTANDEN, MAIL_MAP_DASHBOARD, normaliseer, zonderKop, dashboardRepo } from '../scripts/mail-bron.mjs';
import { dashboardLader } from './hulp/dashboardLader.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const repo = dashboardRepo();
const lader = dashboardLader();
const team = await import('../src/lib/teamRegels.ts');
const doc = await import('../src/lib/documentMail.ts');

test('vendored mailcode is gelijk aan het dashboard', (t) => {
  if (!repo) return t.skip('dashboardrepo niet gevonden');
  for (const naam of MAIL_BESTANDEN) {
    const dashboard = normaliseer(execFileSync('git', ['-C', repo, 'show', `HEAD:${MAIL_MAP_DASHBOARD}/${naam}`], { encoding: 'utf8' }));
    const app = zonderKop(readFileSync(join(hier, '../src/lib/mail/vendored', naam), 'utf8'));
    assert.equal(app, dashboard, `${naam} wijkt af van het dashboard: draai npm run mail:overnemen`);
  }
});

test('uitnodiging: dezelfde mail als het dashboard (teamService.js)', async (t) => {
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  const D = await lader.importeer('src/utils/mailTemplate.js');
  const E = await lader.importeer('src/services/emailService.js');
  const invoer = { inviteUrl: 'https://dashboard.bossbase.nl/uitnodiging/abc', bedrijfsnaam: "Bouw & <Zn> 'O", uitnodiger: 'Piet "P"', ontvanger: 'jan@x.nl', rol: 'admin' };
  const app = team.uitnodigingsMail(invoer);
  // Zoals inviteTeamMember in het dashboard het opbouwt.
  const dash = D.mailTemplate({
    title: 'Je bent uitgenodigd!',
    preheader: `${invoer.uitnodiger} heeft je uitgenodigd voor ${invoer.bedrijfsnaam} op BossBase`,
    body: `<p>Hallo ${E.escapeHtml(invoer.ontvanger)},</p>
           <p><strong>${E.escapeHtml(invoer.uitnodiger)}</strong> heeft je uitgenodigd om deel uit te maken van
           <strong>${E.escapeHtml(invoer.bedrijfsnaam)}</strong> op BossBase.</p>
           <p>Je krijgt de rol: <strong>${E.escapeHtml('Beheerder')}</strong></p>`,
    buttonText: 'Accepteer uitnodiging',
    buttonUrl: invoer.inviteUrl,
    footerText: 'Deze uitnodiging is 48 uur geldig. Als je deze uitnodiging niet verwacht hebt, kun je deze mail negeren.',
    companyName: 'BossBase',
  });
  assert.equal(app.html, dash);
  assert.equal(app.onderwerp, `Je bent uitgenodigd voor ${invoer.bedrijfsnaam} op BossBase`);
});

test('offerte- en factuurmail: dezelfde opmaak en knop als het dashboard', async (t) => {
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  const D = await lader.importeer('src/utils/mailTemplate.js');
  for (const kleur of ['#1d4ed8', '#F5C400', null]) {
    // De knop (OffertesPage: mailButton(…, signLink, company.brandingColor)).
    assert.equal(doc.mailKnop('Offerte bekijken & ondertekenen', 'https://dashboard.bossbase.nl/offerte/x?a=1&b=2', kleur),
      D.mailButton('Offerte bekijken & ondertekenen', 'https://dashboard.bossbase.nl/offerte/x?a=1&b=2', kleur ?? undefined));
    // De omhulling (mailTemplate met bedrijfsnaam, logo en kleur, zonder knop).
    for (const logo of ['https://logo.nl/l.png', null]) {
      const body = `<p>Beste klant,</p>${D.mailButton('Factuur betalen', 'https://dashboard.bossbase.nl/betaal/t', kleur ?? undefined)}<p>Groet</p>`;
      assert.equal(
        doc.zakelijkeMail({ titel: 'Factuur F-1 van Bouw & Zn', body, bedrijfsnaam: 'Bouw & Zn', logoUrl: logo, merkkleur: kleur }),
        D.mailTemplate({ title: 'Factuur F-1 van Bouw & Zn', body, companyName: 'Bouw & Zn', logoUrl: logo ?? undefined, brandColor: kleur ?? undefined }),
      );
    }
  }
});
