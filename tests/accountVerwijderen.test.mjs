/** Account verwijderen: regels en teksten van de kaart (zonder react-native). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const r = await import('../src/lib/accountVerwijderenRegels.ts');
const { readonlyTekst } = await import('../src/lib/permissions.ts');
const { routeVoorLink } = await import('../src/lib/meldingLink.ts');

const basis = {
  rol: 'medewerker', isEigenaar: false, bedrijfsnaam: 'Testbedrijf BV', verwijdering: null,
  overdrachtUit: null, overdrachtIn: null, kandidaten: [], teamleden: 3,
};

test('bevestiging: VERWIJDEREN (hoofdletterongevoelig) en exacte bedrijfsnaam', () => {
  assert.equal(r.bevestigingKlopt(' verwijderen '), true);
  assert.equal(r.bevestigingKlopt('VERWIJDER'), false);
  assert.equal(r.bevestigingKlopt(null), false);
  assert.equal(r.bedrijfsnaamKlopt('Testbedrijf BV', 'Testbedrijf BV'), true);
  assert.equal(r.bedrijfsnaamKlopt('testbedrijf bv', 'Testbedrijf BV'), false);
  assert.equal(r.bedrijfsnaamKlopt('Testbedrijf BV ', 'Testbedrijf BV'), false);
  assert.equal(r.bedrijfsnaamKlopt('', ''), false);
  assert.equal(r.bedrijfsnaamKlopt('x', null), false);
});

test('idempotentiesleutel: geldig formaat voor de server en uniek', () => {
  const a = r.nieuweSleutel(), b = r.nieuweSleutel();
  assert.match(a, /^[A-Za-z0-9-]{8,64}$/);
  assert.notEqual(a, b);
});

test('weergave per rol', () => {
  const lid = r.weergave(basis);
  assert.equal(lid.toonLidVerwijderen, true);
  assert.equal(lid.toonEigenaarKeuzes, false);
  const eigenaarZonder = r.weergave({ ...basis, isEigenaar: true });
  assert.equal(eigenaarZonder.toonLidVerwijderen, false);
  assert.equal(eigenaarZonder.kanOverdragen, false);
  assert.equal(eigenaarZonder.geenOpvolger, true);
  const eigenaarMet = r.weergave({ ...basis, isEigenaar: true, kandidaten: [{ id: 'x', naam: 'Beheerder' }] });
  assert.equal(eigenaarMet.kanOverdragen, true);
  const openOverdracht = r.weergave({ ...basis, isEigenaar: true, kandidaten: [{ id: 'x', naam: 'B' }], overdrachtUit: { id: 'o', verlooptOp: '2026-10-24T10:00:00Z' } });
  assert.equal(openOverdracht.kanOverdragen, false);
  const gepland = { ...basis, isEigenaar: true, verwijdering: { id: 'v', modus: 'gepland', status: 'gepland', geplandOp: '2026-11-16T11:00:00Z' } };
  assert.equal(r.weergave(gepland).kanAnnuleren, true);
  assert.equal(r.weergave(gepland).toonEigenaarKeuzes, false);
  assert.equal(r.weergave({ ...gepland, isEigenaar: false }).kanAnnuleren, false);
  assert.equal(r.weergave({ ...gepland, verwijdering: { ...gepland.verwijdering, status: 'bezig' } }).kanAnnuleren, false);
});

test('melding tijdens de bedenktijd noemt de datum', () => {
  const m = r.verwijderingMelding({ ...basis, verwijdering: { id: 'v', modus: 'gepland', status: 'gepland', geplandOp: '2026-11-16T11:00:00Z' } });
  assert.match(m, /16 november 2026/);
  assert.match(m, /exporteren/);
  assert.equal(r.verwijderingMelding(basis), null);
});

test('teksten: geen prijzen, geen oproep tot kopen, geen betaalverwijzing (ook op iOS)', () => {
  const alles = [...r.LID_GEVOLGEN, ...r.OVERDRACHT_GEVOLGEN, ...r.bedrijfGevolgen(1), ...r.bedrijfGevolgen(0), r.MODUS_UITLEG.gepland, r.MODUS_UITLEG.direct,
    readonlyTekst('verwijdering_gepland', 'ios').titel, readonlyTekst('verwijdering_gepland', 'ios').uitleg];
  for (const t of alles) assert.doesNotMatch(t, /€|kies|kiezen|betaalgegevens|dashboard|stripe|upgrade|gratis|kopen/i, t);
  assert.match(r.bedrijfGevolgen(1)[0], /1 teamlid\b/);
  assert.match(r.bedrijfGevolgen(4)[0], /4 teamleden/);
  assert.match(r.bedrijfGevolgen(1).join(' '), /7 jaar/);
});

test('readonly-reden verwijdering_gepland: eigen uitleg op web en iOS', () => {
  for (const p of ['web', 'ios', 'android']) {
    const t = readonlyTekst('verwijdering_gepland', p);
    assert.equal(t.titel, 'Dit bedrijf wordt verwijderd');
    assert.match(t.uitleg, /annuleren/);
  }
});

test('foutcodes van de server', () => {
  assert.match(r.foutTekst('herauthenticatie', 'x'), /wachtwoord/);
  assert.match(r.foutTekst('te_vaak', null), /kwartier/);
  assert.equal(r.foutTekst('eigenaar', 'Je bent de eigenaar.'), 'Je bent de eigenaar.');
  assert.match(r.foutTekst(null, null), /Er ging iets mis/);
});

test('melding over overdracht of verwijdering opent Mijn profiel', () => {
  assert.equal(routeVoorLink('instellingen/profiel'), '/settings?tab=profiel');
  assert.equal(routeVoorLink('instellingen'), '/settings');
});
