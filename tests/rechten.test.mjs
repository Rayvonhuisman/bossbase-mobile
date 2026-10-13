/** Rechten zoals het dashboard: zien (gedeelde werkruimte) versus bewerken. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { canWithRole, canZien, INZAGE_RECHTEN } = await import('../src/lib/permissions.ts');

test('admin mag alles; planner krijgt alleen planning automatisch', () => {
  assert.equal(canWithRole('facturen', 'admin', []), true);
  assert.equal(canWithRole('planning', 'planner', []), true);
  assert.equal(canWithRole('facturen', 'planner', []), false);
  assert.equal(canWithRole('facturen', 'medewerker', ['facturen']), true);
  assert.equal(canWithRole('facturen', null, ['facturen']), false);
});

test('gedeelde werkruimte (Groei): inzagerechten gelden voor iedereen', () => {
  const groei = ['gedeelde_werkruimte'];
  for (const r of ['projecten', 'offertes', 'facturen', 'kosten', 'verkoop', 'database', 'team']) {
    assert.equal(canZien(r, 'medewerker', [], groei), true, r);
  }
});

test('gedeelde werkruimte geeft géén bewerkrechten', () => {
  const groei = ['gedeelde_werkruimte'];
  for (const r of ['klanten_bewerken', 'projecten_bewerken', 'werkbonnen_bewerken', 'planning', 'inkoopprijzen', 'instellingen']) {
    assert.equal(INZAGE_RECHTEN.includes(r), false, r);
    assert.equal(canZien(r, 'medewerker', [], groei), false, r);
  }
});

test('zonder gedeelde werkruimte: gewone rechtencheck', () => {
  assert.equal(canZien('projecten', 'medewerker', [], ['planning']), false);
  assert.equal(canZien('projecten', 'medewerker', ['projecten'], null), true);
});
