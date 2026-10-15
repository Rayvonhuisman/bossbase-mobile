/**
 * Activiteiten (status, groepen, filters, homepage-tegel) en de cijfers van de
 * overzichtstegels op de homepage — dezelfde regels als het dashboard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const A = await import('../src/lib/activiteitStatus.ts');
const O = await import('../src/lib/overzichtCijfers.ts');
const { lokaleDatum } = await import('../src/lib/nlTijd.ts');

const dagVan = (iso) => lokaleDatum(iso);
const VANDAAG = '2026-10-13';
// 09:00 Nederlandse tijd (zomertijd, UTC+2) op een gegeven dag.
const om9 = (dag) => `${dag}T07:00:00.000Z`;

test('status: afgerond, te laat, vandaag, open', () => {
  assert.equal(A.activiteitStatus({ completed: true, due_at: om9('2026-10-01') }, VANDAAG, dagVan), 'completed');
  assert.equal(A.activiteitStatus({ completed: false, due_at: om9('2026-10-12') }, VANDAAG, dagVan), 'overdue');
  assert.equal(A.activiteitStatus({ completed: false, due_at: om9('2026-10-13') }, VANDAAG, dagVan), 'today');
  assert.equal(A.activiteitStatus({ completed: false, due_at: om9('2026-10-20') }, VANDAAG, dagVan), 'open');
  assert.equal(A.activiteitStatus({ completed: false, due_at: null }, VANDAAG, dagVan), 'open');
});

test('status rekent op de Nederlandse kalenderdag, niet op UTC', () => {
  // 13 okt 23:30 UTC = 14 okt 01:30 in Amsterdam → morgen, dus open.
  assert.equal(
    A.activiteitStatus({ completed: false, due_at: '2026-10-13T23:30:00.000Z' }, VANDAAG, dagVan),
    'open',
  );
  // 12 okt 22:30 UTC = 13 okt 00:30 in Amsterdam → vandaag, niet te laat.
  assert.equal(
    A.activiteitStatus({ completed: false, due_at: '2026-10-12T22:30:00.000Z' }, VANDAAG, dagVan),
    'today',
  );
});

test('groepen: morgen, deze week (≤ 7 dagen), later', () => {
  const g = (dag) => A.activiteitGroep({ completed: false, due_at: om9(dag) }, VANDAAG, dagVan);
  assert.equal(g('2026-10-14'), 'tomorrow');
  assert.equal(g('2026-10-20'), 'week');
  assert.equal(g('2026-10-21'), 'later');
  assert.equal(g('2026-10-10'), 'overdue');
  assert.equal(A.activiteitGroep({ completed: false, due_at: null }, VANDAAG, dagVan), 'later');
  assert.equal(A.activiteitGroep({ completed: true, due_at: om9('2026-10-14') }, VANDAAG, dagVan), 'done');
});

const rijen = [
  { id: 1, title: 'Bellen Jansen', completed: false, due_at: om9('2026-10-10'), assigned_to: 'u1', customer: { name: 'Jansen BV' } },
  { id: 2, title: 'Offerte nasturen', completed: false, due_at: om9('2026-10-13'), assigned_to: 'u2', assigned_to_ids: ['u2', 'u1'], customer: null },
  { id: 3, title: 'Bezoek', completed: false, due_at: om9('2026-10-15'), assigned_to: 'u2', customer: { name: 'Pietersen' } },
  { id: 4, title: 'Klaar', completed: true, due_at: om9('2026-10-01'), assigned_to: 'u1', customer: null },
];

test('tellingen per status', () => {
  assert.deepEqual(A.telActiviteiten(rijen, VANDAAG, dagVan), { all: 4, overdue: 1, today: 1, open: 1, done: 1 });
});

test('filters: status, verantwoordelijke (ook meegewezen), zoeken op titel en klant', () => {
  const f = (o) => A.filterActiviteiten(rijen, { filter: 'all', ...o }, VANDAAG, dagVan).map((r) => r.id);
  assert.deepEqual(f({ filter: 'overdue' }), [1]);
  assert.deepEqual(f({ filter: 'today' }), [2]);
  assert.deepEqual(f({ filter: 'open' }), [3]);
  assert.deepEqual(f({ filter: 'done' }), [4]);
  assert.deepEqual(f({ medewerker: 'u1' }), [1, 2, 4]);
  assert.deepEqual(f({ zoek: 'pieters' }), [3]);
  assert.deepEqual(f({ zoek: '  BELLEN ' }), [1]);
});

test('groeperen houdt de vaste volgorde en laat lege groepen weg', () => {
  const g = A.groepeerActiviteiten(rijen, VANDAAG, dagVan);
  assert.deepEqual(g.map((x) => x.key), ['overdue', 'today', 'week', 'done']);
});

test('homepage: eigen activiteiten vandaag en te laat', () => {
  const r = A.eigenActiviteitenVandaag(rijen, 'u1', VANDAAG, dagVan);
  assert.deepEqual(r.teLaat.map((x) => x.id), [1]);
  assert.deepEqual(r.vandaag.map((x) => x.id), [2]);
  assert.deepEqual(A.eigenActiviteitenVandaag(rijen, null, VANDAAG, dagVan), { teLaat: [], vandaag: [] });
});

test('homepage: aan niemand toegewezen telt mee, van een collega niet (1 eigen + 3 los = 4 te laat)', () => {
  const r = A.eigenActiviteitenVandaag(
    [
      { id: 'eigen', completed: false, due_at: om9('2026-09-18'), assigned_to: 'u1', assigned_to_ids: ['u1'] },
      { id: 'los1', completed: false, due_at: om9('2026-05-01'), assigned_to: null, assigned_to_ids: [] },
      { id: 'los2', completed: false, due_at: om9('2026-05-09'), assigned_to: null, assigned_to_ids: null },
      { id: 'los3', completed: false, due_at: om9('2026-05-12'), assigned_to: null },
      { id: 'collega', completed: false, due_at: om9('2026-10-01'), assigned_to: 'u2', assigned_to_ids: ['u2'] },
      { id: 'alleenLijst', completed: false, due_at: om9('2026-10-02'), assigned_to: null, assigned_to_ids: ['u2'] },
    ],
    'u1',
    VANDAAG,
    dagVan,
  );
  assert.deepEqual(r.teLaat.map((x) => x.id).sort(), ['eigen', 'los1', 'los2', 'los3']);
  assert.equal(A.isNiemandToegewezen({ assigned_to: null, assigned_to_ids: ['u2'] }), false);
});

test('overzicht: pipelinewaarden op deals.status', () => {
  const deals = [
    { status: 'open', stage_id: 's1', expected_revenue: 1000, final_revenue: null },
    { status: 'won', stage_id: 's3', expected_revenue: null, final_revenue: 2500 },
    { status: 'lost', stage_id: 's2', expected_revenue: 900, final_revenue: null },
    { status: null, stage_id: 's2', expected_revenue: 100, final_revenue: null },
  ];
  assert.deepEqual(O.pipelineWaarden(deals), {
    open: { aantal: 2, waarde: 1100 },
    geaccepteerd: { aantal: 1, waarde: 2500 },
  });
  const fases = [{ id: 's2', position: 2 }, { id: 's1', position: 1 }];
  assert.deepEqual(O.nieuweAanvragen(deals, fases), { aantal: 1, waarde: 1000 });
  assert.deepEqual(O.nieuweAanvragen(deals, []), { aantal: 0, waarde: 0 });
});

test('overzicht: open offertes, openstaande facturen, omzet deze maand', () => {
  assert.deepEqual(
    O.openOffertes([
      { status: 'concept', totaal_incl: 100 },
      { status: 'verzonden', totaal_incl: 50 },
      { status: 'geaccepteerd', totaal_incl: 999 },
    ]),
    { aantal: 2, waarde: 150 },
  );
  const facturen = [
    { status: 'verzonden', totaal_incl: 121, totaal_excl: 100, factuurdatum: '2026-10-02', vervaldatum: '2026-10-10', is_credit: false, gecrediteerd: false },
    { status: 'verzonden', totaal_incl: 242, totaal_excl: 200, factuurdatum: '2026-09-20', vervaldatum: '2026-10-30', is_credit: false, gecrediteerd: false },
    { status: 'verzonden', totaal_incl: -50, totaal_excl: -41, factuurdatum: '2026-10-05', vervaldatum: null, is_credit: true, gecrediteerd: false },
    { status: 'betaald', totaal_incl: 605, totaal_excl: 500, factuurdatum: '2026-10-08', vervaldatum: null, is_credit: false, gecrediteerd: false },
    { status: 'concept', totaal_incl: 1210, totaal_excl: 1000, factuurdatum: '2026-10-09', vervaldatum: null, is_credit: false, gecrediteerd: false },
  ];
  assert.deepEqual(O.openFacturen(facturen, VANDAAG), { aantal: 2, waarde: 363, teLaat: 1 });
  // Niet-concept facturen van oktober, creditnota trekt zichzelf af.
  assert.equal(O.omzetDezeMaand(facturen, VANDAAG), 100 - 41 + 500);
});
