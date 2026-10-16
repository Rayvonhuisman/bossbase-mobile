import { test } from 'node:test';
import assert from 'node:assert/strict';

const { kiesAutoMail, autoMailInhoud, afspraakDatum, STANDAARD_AUTO_MAILS } = await import('../src/lib/autoMail.ts');

test('geen rij → standaardsjabloon; uitgezet → niets', () => {
  assert.equal(kiesAutoMail('afspraak_bevestiging', null), STANDAARD_AUTO_MAILS.afspraak_bevestiging);
  assert.equal(kiesAutoMail('afspraak_bevestiging', { actief: true, auto_versturen: false, body: 'x' }), null);
  assert.equal(kiesAutoMail('afspraak_bevestiging', { actief: false, auto_versturen: true, body: 'x' }), null);
  assert.deepEqual(kiesAutoMail('afspraak_bevestiging', { actief: true, auto_versturen: true, onderwerp: 'O', body: 'B' }), {
    onderwerp: 'O',
    body: 'B',
    body_html: '',
  });
});

test('platte tekst: één <p> per regel, lege regel leeg, &<> ge-escaped maar aanhalingstekens niet', () => {
  const r = autoMailInhoud(
    { onderwerp: 'Afspraak {{afspraak_datum}}', body: 'Beste {{klant_naam}},\n\nA & "B" <c>', body_html: '' },
    { klant_naam: 'Jan', afspraak_datum: '5-10-2026' },
  );
  assert.equal(r.onderwerp, 'Afspraak 5-10-2026');
  assert.equal(
    r.binnenHtml,
    '<p style="margin:0 0 8px 0">Beste Jan,</p><p style="margin:0 0 8px 0">A &amp; "B" &lt;c&gt;</p>',
  );
});

test('HTML-sjabloon: variabelen ge-escaped, onbekende blijven staan', () => {
  const r = autoMailInhoud({ onderwerp: 's', body: '', body_html: '<b>{{klant_naam}}</b> {{x}}' }, { klant_naam: '<Jan>' });
  assert.equal(r.binnenHtml, '<b>&lt;Jan&gt;</b> {{x}}');
});

test('afspraakdatum zoals toLocaleDateString nl-NL', () => {
  assert.equal(afspraakDatum('2026-10-05'), '5-10-2026');
  assert.equal(afspraakDatum('2026-12-31'), '31-12-2026');
  assert.equal(afspraakDatum(''), '');
  assert.equal(afspraakDatum(null), '');
});
