/**
 * Dashboard a37a907 → origin/main (331250b), gebied werkvloer: uren,
 * werkbonuren, klanten, Database, Team, Instellingen en meldingen. Alleen
 * pure logica; de database blijft de grens. (Werkbonregels en bedragkolommen:
 * zie dashboardDelta.test.mjs.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const uren = await import('../src/lib/urenRegels.ts');
const link = await import('../src/lib/meldingLink.ts');
const rel = await import('../src/lib/relaties.ts');
const db = await import('../src/lib/databaseFilters.ts');
const val = await import('../src/lib/relatieValidatie.ts');
const inst = await import('../src/lib/instellingenRegels.ts');

const nee = () => false;
const alleen = (...r) => (x) => r.includes(x);

// ── Uren: recht planning in plaats van rol planner (20261002135952) ─────────

test('werkdaguren van collega’s: admin of recht planning, niet de oude rol planner', () => {
  assert.equal(uren.magTeamWerkdagen({ userId: 'u', role: 'admin', can: nee }), true);
  assert.equal(uren.magTeamWerkdagen({ userId: 'u', role: 'medewerker', can: alleen('planning') }), true);
  assert.equal(uren.magTeamWerkdagen({ userId: 'u', role: 'medewerker', can: nee }), false);
  assert.equal(uren.magTeamWerkdagen({ userId: 'u', role: 'planner', can: nee }), false);
  assert.equal(
    uren.magTeamWerkdagen({ userId: 'u', role: 'medewerker', can: alleen('werkbonnen_bewerken') }),
    false,
  );
});

test('werkbonuren voor een ander: bb_mag_uren_voor_ander (admin, planning, verantwoordelijke)', () => {
  const bon = { verantwoordelijke_ids: ['v'] };
  const mw = (id, ...r) => ({ userId: id, role: 'medewerker', can: alleen(...r) });
  assert.equal(uren.magWerkbonUrenVoorAnder(bon, mw('v')), true); // voorman op eigen bon
  assert.equal(uren.magWerkbonUrenVoorAnder(bon, mw('x')), false); // uitvoerder: alleen zichzelf
  assert.equal(uren.magWerkbonUrenVoorAnder(bon, mw('x', 'planning')), true);
  assert.equal(uren.magWerkbonUrenVoorAnder(bon, { userId: 'x', role: 'admin', can: nee }), true);
  assert.equal(uren.magWerkbonUrenVoorAnder({ verantwoordelijke_ids: null }, mw('x')), false);
  assert.equal(uren.magWerkbonUrenVoorAnder(null, mw('v')), false);
  assert.equal(uren.magWerkbonUrenVoorAnder(bon, mw(null)), false);
});

// ── Meldingen: klant/<id> en leverancier/<id> (dashboard 4-10) ─────────────

test('meldinglink: klant, leverancier en de bestaande soorten', () => {
  assert.equal(link.routeVoorLink('klant/k1'), '/customers/k1');
  assert.equal(link.routeVoorLink('/klant/k1'), '/customers/k1');
  assert.equal(link.routeVoorLink('leverancier/l1'), '/customers/leverancier/l1');
  assert.equal(link.routeVoorLink('werkbonnen/w1'), '/work-orders/w1');
  assert.equal(link.routeVoorLink('activities/a1'), '/activities?id=a1');
  assert.equal(link.routeVoorLink('activities'), '/activities');
  assert.equal(link.routeVoorLink('projecten/p1'), '/project/p1');
  assert.equal(link.routeVoorLink('planning'), '/planning');
  assert.equal(link.routeVoorLink('customers'), '/customers');
  assert.equal(link.routeVoorLink('materialen'), null);
  assert.equal(link.routeVoorLink(null), null);
  // Een id met een schuine streep wordt nooit een extra padsegment.
  assert.equal(link.routeVoorLink('klant/a%2F..'), '/customers/a%2F..');
});

// ── Klanttype opgeslagen (20261001135212) ───────────────────────────────────

test('klanttype: opgeslagen type wint, anders KvK-afleiding; VvE/aannemer zijn zakelijk', () => {
  assert.deepEqual([...rel.KLANT_TYPES], ['Particulier', 'Zakelijk', 'VvE', 'Aannemer']);
  assert.equal(rel.klantType({ type: 'VvE', kvk_number: null }), 'VvE');
  assert.equal(rel.klantType({ type: 'Particulier', kvk_number: '12345678' }), 'Particulier');
  assert.equal(rel.klantType({ type: null, kvk_number: '12345678' }), 'Zakelijk');
  assert.equal(rel.klantType({ type: 'Bedrijf', kvk_number: '' }), 'Particulier');
  assert.equal(rel.isZakelijkeKlant({ type: 'Aannemer' }), true);
  assert.equal(rel.isZakelijkeKlant({ type: 'Particulier', kvk_number: '1' }), false);
});

// ── Database: puntkomma en segmenten per gebruiker (c40abf9) ───────────────

test('database: CSV met puntkomma, formule-injectie blijft afgevangen', () => {
  const csv = db.naarCsv([{ Naam: '=1+1', Email: 'a;b@c.nl' }]);
  const [kop, rij] = csv.replace(/^﻿/, '').split('\n');
  assert.ok(kop.startsWith('"Naam";"Email";'));
  assert.ok(rij.startsWith(`"'=1+1";"a;b@c.nl";`));
  assert.equal(kop.split('";"').length, db.EXPORT_KOLOMMEN.length);
});

test('database: segmenten per gebruiker, niet gedeeld op één toestel', () => {
  assert.equal(db.segmentSleutel('u1'), 'bb_db_segments:u1');
  assert.notEqual(db.segmentSleutel('u1'), db.segmentSleutel('u2'));
  assert.equal(db.segmentSleutel(null), 'bb_db_segments:anoniem');
});

// ── Instellingen: IBAN op het bedrijf (20261002132507) ──────────────────────

test('IBAN: mod-97 zoals bb_iban_geldig, opslaan zonder spaties in hoofdletters', () => {
  assert.equal(val.valideerIban('NL91 ABNA 0417 1643 00'), null);
  assert.ok(val.valideerIban('NL91 ABNA 0417 1643 01'));
  assert.ok(val.valideerIban('NL91ABNA041716430'));
  assert.equal(val.normaliseerIban(' nl91 abna 0417 1643 00 '), 'NL91ABNA0417164300');
  assert.equal(val.normaliseerIban('   '), null);
  assert.equal(val.normaliseerIban(null), null);
});

test('factuurmail kent de variabele {{iban}}, zoals het dashboard', () => {
  const factuur = inst.TEMPLATE_CONFIGS.find((t) => t.type === 'factuur');
  assert.ok(factuur, 'factuur-template gevonden');
  assert.ok(factuur.vars.includes('iban'));
});
