/**
 * Getallen invoeren zoals in Nederland (besluit 26-10: "1.234,56" moet werken).
 * Zelfde regels als src/lib/getalNl.js in het dashboard.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { leesGetalNl, getalOfNul } = await import('../src/lib/getalNl.ts');
const { veldNaarNummer } = await import('../src/lib/regels.ts');
const { leesBedrag } = await import('../src/lib/werkbonLogica.ts');

test('komma is decimaal, punt voor een komma is duizendtal', () => {
  assert.equal(leesGetalNl('12,50'), 12.5);
  assert.equal(leesGetalNl('1.234,56'), 1234.56);
  assert.equal(leesGetalNl('1.234.567,8'), 1234567.8);
  assert.equal(leesGetalNl('€ 1.234,56'), 1234.56);
  assert.equal(leesGetalNl('0,05'), 0.05);
  assert.equal(leesGetalNl('100,'), 100);
});

test('losse punt: drie cijfers erachter is duizendtal, anders decimaal', () => {
  assert.equal(leesGetalNl('1.250'), 1250);
  assert.equal(leesGetalNl('12.5'), 12.5);
  assert.equal(leesGetalNl('0.125'), 0.125);
});

test('leeg en onzin', () => {
  assert.equal(leesGetalNl(''), null);
  assert.ok(Number.isNaN(leesGetalNl('12,5,0')));
  assert.ok(Number.isNaN(leesGetalNl('1,234.56')));
  assert.equal(getalOfNul('abc'), 0);
});

test('regels en werkbon gebruiken dezelfde regels', () => {
  assert.equal(veldNaarNummer('1.234,56'), 1234.56);
  assert.equal(veldNaarNummer(''), 0);
  assert.equal(leesBedrag('1.234,56'), 1234.56);
  assert.equal(leesBedrag(''), null);
  assert.equal(leesBedrag('x'), null);
});
