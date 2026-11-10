/**
 * Seizoen van een contractbeurt als tekst op de contractkaart.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { seizoenLabel } = await import('../src/lib/contractSeizoen.ts');

test('seizoenLabel: maart t/m oktober', () => {
  assert.equal(seizoenLabel(3, 10), 'maart t/m oktober');
});

test('seizoenLabel: over de jaargrens', () => {
  assert.equal(seizoenLabel(11, 3), 'november t/m maart');
});

test('seizoenLabel: hele jaar of leeg geeft niets', () => {
  assert.equal(seizoenLabel(null, null), '');
  assert.equal(seizoenLabel(1, 12), '');
  assert.equal(seizoenLabel(4, 3), '');
  assert.equal(seizoenLabel(3, null), '');
  assert.equal(seizoenLabel(13, 2), '');
});

test('seizoenLabel: één maand', () => {
  assert.equal(seizoenLabel(7, 7), 'juli');
});
