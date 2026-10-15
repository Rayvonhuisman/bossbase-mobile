import { test } from 'node:test';
import assert from 'node:assert/strict';

const A = await import('../src/lib/afspraakNotities.ts');

test('leest de comments-jsonb van het dashboard, slaat rommel over', () => {
  const r = A.leesAfspraakNotities([
    { id: 'a', userId: 'u1', name: 'Niels', text: 'Hoi', at: '2026-10-15T08:00:00Z' },
    { id: 'b', text: '' },
    null,
    'x',
    { id: 'c', text: 'Zonder naam' },
  ]);
  assert.deepEqual(
    r.map((x) => [x.id, x.name, x.userId]),
    [
      ['a', 'Niels', 'u1'],
      ['c', 'Onbekend', null],
    ],
  );
  assert.deepEqual(A.leesAfspraakNotities(null), []);
  assert.deepEqual(A.leesAfspraakNotities({}), []);
});

test('nieuwe notitie in het formaat van handlePostComment, nieuwste eerst op het scherm', () => {
  const n = A.nieuweAfspraakNotitie({ id: 'x', userId: 'u', naam: null, tekst: '<div>t</div>', nu: new Date('2026-10-15T09:30:00Z') });
  assert.deepEqual(n, { id: 'x', userId: 'u', name: 'Onbekend', text: '<div>t</div>', at: '2026-10-15T09:30:00.000Z' });
  assert.deepEqual(
    A.nieuwsteEerst([{ id: '1' }, { id: '2' }]).map((x) => x.id),
    ['2', '1'],
  );
});
