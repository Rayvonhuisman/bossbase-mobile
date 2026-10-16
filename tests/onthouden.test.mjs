/** Filters onthouden: sleutel per gebruiker, en alleen geldige waarden tellen. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const O = await import('../src/lib/onthoudenRegels.ts');

test('sleutel per gebruiker en scherm', () => {
  assert.equal(O.filterSleutel('u1', 'werkbonnen.chip'), 'bb.filters.u1.werkbonnen.chip');
  assert.notEqual(O.filterSleutel('u1', 'x'), O.filterSleutel('u2', 'x'));
});

test('bewaarde waarde alleen als hij nog geldig is', () => {
  const chips = ['alle', 'gepland', 'bezig'];
  assert.equal(O.leesBewaard('"gepland"', chips), 'gepland');
  assert.equal(O.leesBewaard('"bestaat-niet"', chips), null);
  assert.equal(O.leesBewaard('{kapot', chips), null);
  assert.equal(O.leesBewaard(null, chips), null);
  assert.deepEqual(O.leesBewaard('{"fase":null}', (v) => typeof v === 'object' && v !== null), { fase: null });
  assert.equal(O.leesBewaard('null', (v) => v === null || typeof v === 'string'), null, 'null als waarde mag, maar leest als "niets bewaard" — het standaardfilter');
});
