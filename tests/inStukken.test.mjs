/** Grote lijsten: alles in stukken van 1000, niets kwijt boven de 1000. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { haalInStukken } = await import('../src/lib/inStukken.ts');

const bron = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
const nep = (rijen, verzoeken) => (van, tot) => {
  verzoeken.push([van, tot]);
  return Promise.resolve({ data: rijen.slice(van, tot + 1), error: null });
};

test('2500 rijen komen allemaal mee, in drie verzoeken', async () => {
  const v = [];
  const { data, error } = await haalInStukken(nep(bron(2500), v));
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  assert.deepEqual(v, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(new Set(data.map((r) => r.id)).size, 2500);
});

test('precies 1000: nog één (leeg) verzoek om zeker te zijn', async () => {
  const v = [];
  const { data } = await haalInStukken(nep(bron(1000), v));
  assert.equal(data.length, 1000);
  assert.equal(v.length, 2);
});

test('minder dan 1000: één verzoek', async () => {
  const v = [];
  const { data } = await haalInStukken(nep(bron(12), v));
  assert.equal(data.length, 12);
  assert.equal(v.length, 1);
});

test('fout halverwege wordt doorgegeven', async () => {
  let n = 0;
  const { error } = await haalInStukken(() => (n++ === 1 ? Promise.resolve({ data: null, error: { message: 'stuk' } }) : Promise.resolve({ data: bron(1000), error: null })));
  assert.deepEqual(error, { message: 'stuk' });
});

test('vangnet tegen een eindeloze bron', async () => {
  const v = [];
  const altijdVol = (van, tot) => (v.push(van), Promise.resolve({ data: bron(1000), error: null }));
  const { data } = await haalInStukken(altijdVol, { maximum: 5000 });
  assert.equal(v.length, 5);
  assert.equal(data.length, 5000);
});
