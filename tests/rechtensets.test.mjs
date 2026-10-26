// Voorinstellingen in "Rechten instellen" (G-31): alleen bestaande rechten,
// zonder dubbelen. Gelijk aan het dashboard (RECHTENSETS in permissions.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { RECHTENSETS, ALLE_PERMISSION_KEYS } = await import('../src/lib/permissionGroups.ts');

test('rechtensets bevatten alleen bestaande rechten, zonder dubbelen', () => {
  const bestaand = new Set(ALLE_PERMISSION_KEYS);
  for (const set of RECHTENSETS) {
    for (const r of set.rechten) assert.ok(bestaand.has(r), `${set.key}: onbekend recht ${r}`);
    assert.equal(new Set(set.rechten).size, set.rechten.length, `${set.key}: dubbel recht`);
  }
});

test('Kantoor/administratie: facturen en offertes aan, beheer en uitvoering uit', () => {
  const kantoor = RECHTENSETS.find((s) => s.key === 'kantoor');
  assert.ok(kantoor);
  for (const r of ['facturen', 'offertes', 'klanten_bewerken', 'verkoop', 'bedrijfsfinancien', 'kosten', 'projectbedragen', 'agenda_inzien', 'database']) {
    assert.ok(kantoor.rechten.includes(r), r);
  }
  for (const r of ['team', 'instellingen', 'inkoopprijzen', 'planning', 'werkbonnen_bewerken', 'alles_inzien']) {
    assert.ok(!kantoor.rechten.includes(r), r);
  }
});
