/**
 * @-vermeldingen in werkbonnotities: dezelfde opslag (mention-span) en dezelfde
 * meldingen als het dashboard (NoteEditor + createMentionNotifications).
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardLader } from './hulp/dashboardLader.mjs';

const M = await import('../src/lib/mentions.ts');
const lader = dashboardLader();

test('tekst met gekozen collega wordt een mention-span; de rest blijft tekst', () => {
  const html = M.tekstMetVermeldingen('Hoi @Jan de Vries, kijk even <hier>\n@Piet', [
    { id: 'p1', naam: 'Jan de Vries' },
    { id: 'p2', naam: 'Jan' },
  ]);
  assert.equal(
    html,
    'Hoi <span class="bb-mention" data-id="p1" data-name="Jan de Vries" contenteditable="false">@Jan de Vries</span>, kijk even &lt;hier&gt;<br>@Piet',
  );
  assert.deepEqual(M.extractMentions(html), [{ name: 'Jan de Vries', userId: 'p1' }]);
});

test('extractMentions: oude en nieuwe notatie, ontdubbeld', () => {
  const t = '@[Anna](a1) en <span class="bb-mention" data-id="a1" data-name="Anna">@Anna</span> en <span data-name="Bo" class="x bb-mention" data-id="b2">@Bo</span>';
  assert.deepEqual(M.extractMentions(t), [
    { name: 'Anna', userId: 'a1' },
    { name: 'Bo', userId: 'b2' },
  ]);
  assert.equal(M.stripMentions('<b>Hoi</b> @[Anna](a1) &amp; co'), 'Hoi @Anna & co');
});

test('mentionZoekterm: alleen na witruimte of aan het begin', () => {
  assert.deepEqual(M.mentionZoekterm('Hoi @Ja', 7), { start: 4, term: 'Ja' });
  assert.deepEqual(M.mentionZoekterm('@', 1), { start: 0, term: '' });
  assert.equal(M.mentionZoekterm('mail@test', 9), null);
  assert.equal(M.mentionZoekterm('Hoi', 3), null);
});

test('meldingen gelijk aan createMentionNotifications van het dashboard', async (t) => {
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  const N = await lader.importeer('src/services/notificatieService.js');
  const log = [];
  globalThis.__bbSupabase = {
    functions: { invoke: async (naam, { body }) => (log.push({ naam, body }), { data: { success: true }, error: null }) },
    auth: { getUser: async () => ({ data: { user: { id: 'ik' } } }) },
    from: () => {
      const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: { company_id: 'c1' } }) };
      return b;
    },
  };
  const text = M.tekstMetVermeldingen('Let op @Anna en @Ik zelf: <lekkage>', [
    { id: 'a1', naam: 'Anna' },
    { id: 'ik', naam: 'Ik zelf' },
  ]);
  const opts = {
    text,
    relatedType: 'werkbon',
    relatedId: 'wb-1',
    link: 'werkbonnen',
    creatorName: 'Niels',
    contextName: 'Dakgoot vervangen',
  };
  await N.createMentionNotifications({ ...opts, creatorId: 'ik' });
  const dash = log[0].body.notifications;
  const app = M.mentionMeldingen(opts);
  assert.equal(log[0].naam, 'create-notification');
  assert.equal(app.length, 2);
  // Zelfde rijen; alleen `email` verschilt in vorm (object tegenover true) —
  // de Edge Function behandelt beide als "ook mailen" en bouwt de mail zelf.
  assert.deepEqual(
    app.map(({ email, ...r }) => r),
    dash.map(({ email, ...r }) => r),
  );
  assert.ok(dash.every((r) => r.email) && app.every((r) => r.email === true));
});
