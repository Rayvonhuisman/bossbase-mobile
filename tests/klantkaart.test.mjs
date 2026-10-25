/**
 * De klantkaart zoals het dashboard (CustomerPage in BbPages1.jsx): tijdlijn
 * (TIJDLIJN_ICON, TIJDLIJN_KLEUR, fmtTijdlijnDate), het schrijfvak van de
 * E-mails-tab (handleTemplateSelect, handleSendEmail) en @-vermeldingen in
 * klantnotities (createMentionNotifications met relatedType 'klant').
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const K = await import('../src/lib/klantkaart.ts');
const D = await import('../src/lib/documentMail.ts');
const M = await import('../src/lib/mentions.ts');

test('tijdlijn: icoon per type zoals TIJDLIJN_ICON, onbekend → pen', () => {
  assert.equal(K.tijdlijnIcoon('klant_aangemaakt'), 'klant');
  assert.equal(K.tijdlijnIcoon('offerte_geaccepteerd'), 'document');
  assert.equal(K.tijdlijnIcoon('factuur_betaald'), 'euro');
  assert.equal(K.tijdlijnIcoon('creditfactuur_aangemaakt'), 'credit');
  assert.equal(K.tijdlijnIcoon('project_status_gewijzigd'), 'map');
  assert.equal(K.tijdlijnIcoon('email_verstuurd'), 'mail');
  assert.equal(K.tijdlijnIcoon('herinnering_verstuurd'), 'mail');
  assert.equal(K.tijdlijnIcoon('afspraak_ingepland'), 'agenda');
  assert.equal(K.tijdlijnIcoon('deal_fase_gewijzigd'), 'deal');
  assert.equal(K.tijdlijnIcoon('export_uitgevoerd'), 'export');
  assert.equal(K.tijdlijnIcoon('notitie_toegevoegd'), 'pen');
  assert.equal(K.tijdlijnIcoon('iets_nieuws'), 'pen');
  assert.equal(K.tijdlijnIcoon(null), 'pen');
});

test('tijdlijn: kleur op het begin van het type, zoals TIJDLIJN_KLEUR', () => {
  assert.equal(K.tijdlijnKleur('klant_aangemaakt'), '#3b82f6');
  assert.equal(K.tijdlijnKleur('offerte_verzonden'), '#f97316');
  assert.equal(K.tijdlijnKleur('factuur_aangemaakt'), '#10b981');
  // creditfactuur begint met "credit", niet met "factuur".
  assert.equal(K.tijdlijnKleur('creditfactuur_aangemaakt'), '#ef4444');
  assert.equal(K.tijdlijnKleur('project_aangemaakt'), '#6366f1');
  assert.equal(K.tijdlijnKleur('notitie_toegevoegd'), '#10b981');
  assert.equal(K.tijdlijnKleur('email_verstuurd'), '#0ea5e9');
  assert.equal(K.tijdlijnKleur('herinnering_verstuurd'), '#f59e0b');
  assert.equal(K.tijdlijnKleur('afspraak_ingepland'), '#14b8a6');
  assert.equal(K.tijdlijnKleur('deal_aangemaakt'), '#8b5cf6');
  assert.equal(K.tijdlijnKleur('export_uitgevoerd'), '#64748b');
  // var(--dl) in het dashboard → null, het scherm kiest de gedempte themakleur.
  assert.equal(K.tijdlijnKleur('onbekend'), null);
});

test('tijdlijn: datum als fmtTijdlijnDate (dag, datum, maand · uu:mm)', () => {
  const d = new Date(2026, 9, 14, 9, 5); // woensdag 14 oktober 2026, lokale tijd
  assert.equal(K.tijdlijnDatum(d.toISOString()), 'wo 14 okt · 09:05');
  assert.equal(K.tijdlijnDatum(null), '');
  assert.equal(K.tijdlijnDatum('geen datum'), '');
});

test('verstuurde mail: datum met jaar en tijd, plus het type als het een sjabloon was', () => {
  const iso = new Date(2026, 0, 3, 14, 30).toISOString();
  assert.equal(K.verstuurdeMailSub({ sent_at: iso, related_type: null }), '3 jan 2026 14:30');
  assert.equal(K.verstuurdeMailSub({ sent_at: iso, related_type: 'factuur' }), '3 jan 2026 14:30 · factuur');
  assert.equal(K.verstuurdeMailSub({ sent_at: null, related_type: null }), '');
});

test('schrijfvak: zelfde controles en teksten als handleSendEmail', () => {
  assert.equal(K.klantMailFout({ aan: ' ', onderwerp: 'Hoi' }), 'E-mailadres is verplicht');
  assert.equal(K.klantMailFout({ aan: 'a@b.nl', onderwerp: '' }), 'Onderwerp is verplicht');
  assert.equal(K.klantMailFout({ aan: 'a@b.nl', onderwerp: 'Hoi' }), null);
});

test('sjabloon: alleen klant_naam en bedrijfsnaam, met dezelfde terugvallen', () => {
  const sjabloon = { onderwerp: 'Bericht van {{bedrijfsnaam}}', body: 'Beste {{klant_naam}},\n{{factuur_nummer}}' };
  assert.deepEqual(D.klantMailConcept({ sjabloon, klantNaam: 'Jansen', bedrijfsnaam: 'Bouw BV' }), {
    onderwerp: 'Bericht van Bouw BV',
    tekst: 'Beste Jansen,\n{{factuur_nummer}}',
  });
  assert.deepEqual(D.klantMailConcept({ sjabloon, klantNaam: '', bedrijfsnaam: null }), {
    onderwerp: 'Bericht van BossBase',
    tekst: 'Beste klant,\n{{factuur_nummer}}',
  });
  // "Schrijf zelf een bericht": alles leeg, zoals handleTemplateSelect('').
  assert.deepEqual(D.klantMailConcept({ sjabloon: null, klantNaam: 'X', bedrijfsnaam: 'Y' }), {
    onderwerp: '',
    tekst: '',
  });
});

test('mail-HTML: tekst ge-escaped per regel in de zakelijke mail; zonder tekst het onderwerp', () => {
  const html = D.klantMailHtml({ onderwerp: 'Planning', tekst: 'Hoi <b>Jan</b>\nTot dan', bedrijfsnaam: 'Bouw BV' });
  assert.ok(html.includes('<div>Hoi &lt;b&gt;Jan&lt;/b&gt;</div><div>Tot dan</div>'));
  assert.ok(html.includes('<h1'));
  assert.ok(html.includes('Bouw BV'));
  assert.ok(html.includes('Verstuurd met'));
  const leeg = D.klantMailHtml({ onderwerp: 'A & B', tekst: '  ', bedrijfsnaam: null });
  assert.ok(leeg.includes('<p>A &amp; B</p>'));
  assert.ok(leeg.includes('Ons bedrijf'));
});

test('inkorten: eerste n of alles', () => {
  assert.deepEqual(K.ingekort([1, 2, 3], false, 2), [1, 2]);
  assert.deepEqual(K.ingekort([1, 2, 3], true, 2), [1, 2, 3]);
});

test('klantnotitie met tag: melding met relatedType klant en een link naar de klantkaart', () => {
  const html = M.tekstMetVermeldingen('Bel @Rayvon even', [{ id: 'p1', naam: 'Rayvon' }]);
  assert.ok(html.includes('class="bb-mention"'));
  const rijen = M.mentionMeldingen({
    text: html,
    relatedType: 'klant',
    relatedId: 'k1',
    link: 'customers',
    creatorName: 'Kantoor',
    contextName: 'Jansen',
  });
  assert.equal(rijen.length, 1);
  assert.equal(rijen[0].user_id, 'p1');
  assert.equal(rijen[0].link, 'klant/k1');
  assert.equal(rijen[0].related_type, 'klant');
  assert.equal(rijen[0].title, 'Kantoor heeft je getagd bij Jansen');
  assert.equal(rijen[0].email, true);
});
