/**
 * Pipeline- en projectregels, gelijk aan het dashboard (BbDashboard.jsx,
 * bb-shared.jsx, ProjectsPage.jsx, projectsService.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const P = await import('../src/lib/pipelineLogica.ts');
const J = await import('../src/lib/projectLogica.ts');

const fasen = [
  { id: 'f1', name: 'Nieuwe aanvragen', position: 1, color_class: 'b-new' },
  { id: 'f2', name: 'Offerte verstuurd', position: 2, color_class: '#f97316' },
  { id: 'f3', name: 'Afgerond', position: 3, color_class: 'b-done' },
  { id: 'f4', name: 'Verloren', position: 4, color_class: null },
];
const deal = (o) => ({
  id: 'd', stage_id: 'f1', customer_id: 'k', title: 'Badkamer', status: 'open', priority: 'med',
  assigned_to: null, assigned_to_ids: [], afgerond_op: null, expected_revenue: 100, customer: { name: 'Jansen', city: 'Ede' }, ...o,
});

test('fasekleur: hex blijft, legacy klasse vertaald, leeg via positie, onbekend grijs', () => {
  assert.equal(P.faseHex('#f97316'), '#f97316');
  assert.equal(P.faseHex('b-planned'), '#3b82f6');
  assert.equal(P.faseHex(null, 12), '#6b7280');
  assert.equal(P.faseHex(null, 1), '#1DDB62');
  assert.equal(P.faseHex('raar'), '#6b7280');
  assert.deepEqual(P.faseBadge('#3b82f6'), { bg: '#3b82f61A', fg: '#3b82f6' });
  assert.deepEqual(P.faseBadge('#abc'), { bg: '#aabbcc1A', fg: '#aabbcc' });
});

test('filter: open verbergt verloren en afgerond; done alleen afgerond', () => {
  const lijst = [
    deal({ id: 'a' }),
    deal({ id: 'b', status: 'lost' }),
    deal({ id: 'c', afgerond_op: '2026-10-01' }),
    deal({ id: 'w', status: 'won' }),
  ];
  const ids = (f) => P.filterDeals(lijst, { ...P.STANDAARD_FILTER, ...f }).map((d) => d.id);
  assert.deepEqual(ids({}), ['a', 'w']);
  assert.deepEqual(ids({ status: 'done' }), ['c']);
  assert.deepEqual(ids({ status: 'lost' }), ['b']);
  assert.deepEqual(ids({ status: 'any' }), ['a', 'b', 'w']);
});

test('filter: tekst, persoon (assigned_to als terugval), prioriteit', () => {
  const lijst = [deal({ id: 'a', assigned_to: 'u1' }), deal({ id: 'b', title: 'Dak', customer: { name: 'Pietersen', city: 'Zwolle' }, priority: 'high', assigned_to_ids: ['u2'] })];
  const ids = (f) => P.filterDeals(lijst, { ...P.STANDAARD_FILTER, ...f }).map((d) => d.id);
  assert.deepEqual(ids({ text: 'zwol' }), ['b']);
  assert.deepEqual(ids({ persoon: 'u1' }), ['a']);
  assert.deepEqual(ids({ priority: 'high' }), ['b']);
  assert.deepEqual(ids({ priority: 'med' }), ['a']);
  assert.equal(P.filterIsActief(P.STANDAARD_FILTER), false);
  assert.equal(P.filterIsActief({ ...P.STANDAARD_FILTER, text: 'x' }), true);
});

test('totaal sluit verloren uit, behalve bij filter Verloren', () => {
  const lijst = [deal({ expected_revenue: 100 }), deal({ status: 'lost', expected_revenue: 50 })];
  assert.equal(P.totaalWaarde(lijst, { ...P.STANDAARD_FILTER, status: 'any' }), 100);
  assert.equal(P.totaalWaarde(lijst, { ...P.STANDAARD_FILTER, status: 'lost' }), 150);
});

test('kolommen: Afgerond alleen bij done of als gekozen fase; wezen naar eerste kolom', () => {
  assert.deepEqual(P.zichtbareFasen(fasen, P.STANDAARD_FILTER).map((f) => f.id), ['f1', 'f2', 'f4']);
  assert.deepEqual(P.zichtbareFasen(fasen, { ...P.STANDAARD_FILTER, status: 'done' }).map((f) => f.id), ['f1', 'f2', 'f3', 'f4']);
  assert.deepEqual(P.zichtbareFasen(fasen, { ...P.STANDAARD_FILTER, stage: 'f3' }).map((f) => f.id), ['f3']);
  const kol = P.zichtbareFasen(fasen, P.STANDAARD_FILTER);
  const per = P.dealsPerFase([deal({ id: 'x', stage_id: 'f3' }), deal({ id: 'y', stage_id: null }), deal({ id: 'z', stage_id: 'f2' })], kol);
  assert.deepEqual(per.get('f1').map((d) => d.id), ['x', 'y']);
  assert.deepEqual(per.get('f2').map((d) => d.id), ['z']);
});

test('fasekeuzes, verloren- en heropenfase', () => {
  assert.deepEqual(P.faseKeuzes(fasen, 'f1').map((f) => f.id), ['f1', 'f2', 'f4']);
  assert.deepEqual(P.faseKeuzes(fasen, 'f3').map((f) => f.id), ['f1', 'f2', 'f3', 'f4']);
  assert.equal(P.verlorenFase(fasen).id, 'f4');
  assert.equal(P.heropenFase([...fasen].reverse()).id, 'f1');
});

test('vervolgactiviteit: open en vandaag/later telt, over datum en afgerond niet', () => {
  const s = P.vervolgSleutels([
    { deal_id: 'd1', customer_id: null, completed: false, dag: '2026-10-13' },
    { deal_id: 'd2', customer_id: null, completed: false, dag: '2026-10-01' },
    { deal_id: 'd3', customer_id: null, completed: true, dag: '2026-12-01' },
    { deal_id: null, customer_id: 'k9', completed: false, dag: null },
  ], '2026-10-13');
  assert.equal(P.heeftGeenVervolg({ id: 'd1', customer_id: null }, s), false);
  assert.equal(P.heeftGeenVervolg({ id: 'd2', customer_id: null }, s), true);
  assert.equal(P.heeftGeenVervolg({ id: 'd3', customer_id: null }, s), true);
  assert.equal(P.heeftGeenVervolg({ id: 'd4', customer_id: 'k9' }, s), false);
});

test('project: alleen de drie databasestatussen', () => {
  assert.deepEqual(Object.keys(J.PROJECT_STATUS), ['gepland', 'in_uitvoering', 'afgerond']);
  assert.equal(J.projectStatusLabel(null), 'Gepland');
  assert.equal(J.projectStatusLabel('in_uitvoering'), 'In uitvoering');
});

test('project: gefactureerd zonder concepten, credit trekt af, te factureren excl. btw', () => {
  const f = [
    { status: 'verzonden', totaal_incl: 121, totaal_excl: 100 },
    { status: 'concept', totaal_incl: 999, totaal_excl: 999 },
    { status: 'betaald', totaal_incl: -60.5, totaal_excl: -50 },
  ];
  const c = J.projectCijfers({ project_value: 300, quoted_hours: 10 }, 9, f);
  assert.equal(c.invoicedAmount, 60.5);
  assert.equal(c.omzetExclBtw, 50);
  assert.equal(c.remainingToInvoice, 250);
  assert.equal(c.hoursPercentage, 0.9);
  assert.equal(J.urenToon(0.9), 'oranje');
  assert.equal(J.urenToon(1.2), 'rood');
  assert.equal(J.urenToon(0.5), 'normaal');
});

test('projectfilter en KPI', () => {
  const basis = { description: null, usedHours: 2, hoursPercentage: 0, omzetExclBtw: 0 };
  const lijst = [
    { ...basis, name: 'Dak', status: 'gepland', project_value: 100, customerName: 'Jansen', invoicedAmount: 0, remainingToInvoice: 100 },
    { ...basis, name: 'Keuken', status: 'afgerond', project_value: 50, customerName: 'Piet', invoicedAmount: 50, remainingToInvoice: 0 },
  ];
  assert.equal(J.filterProjecten(lijst, 'all', 'all', 'jans').length, 1);
  assert.equal(J.filterProjecten(lijst, 'afgerond', 'all', '').length, 1);
  assert.equal(J.filterProjecten(lijst, 'all', 'unbilled', '')[0].name, 'Dak');
  assert.equal(J.filterProjecten(lijst, 'all', 'billed', '')[0].name, 'Keuken');
  assert.deepEqual(J.projectKpi(lijst), { actief: 1, totaleWaarde: 100, teFactureren: 100, uren: 4 });
  assert.equal(J.isVerlopen('2026-10-01', 'gepland', '2026-10-13'), true);
  assert.equal(J.isVerlopen('2026-10-01', 'afgerond', '2026-10-13'), false);
});

test('planning en wanneer-label', () => {
  const r = J.planRegels([
    { id: 'w1', titel: 'Slopen', gepland_op: '2026-10-20', starttijd: '08:00:00', eindtijd: '12:00:00', werkbon_dagen: [
      { datum: '2026-10-21', starttijd: null, eindtijd: null, medewerker_ids: ['u1'] },
      { datum: '2026-10-20', starttijd: '07:30:00', eindtijd: null, medewerker_ids: ['u2', 'onbekend'] },
    ] },
    { id: 'w2', titel: null, gepland_op: '2026-10-05', starttijd: null, eindtijd: null, assigned_to_ids: [], werkbon_dagen: [] },
  ], (id) => ({ u1: 'Ann', u2: 'Bob' })[id] ?? null);
  assert.deepEqual(r.map((x) => x.datum), ['2026-10-05', '2026-10-20', '2026-10-21']);
  assert.equal(r[1].starttijd, '07:30');
  assert.deepEqual(r[1].wie, ['Bob']);
  assert.equal(r[2].starttijd, '08:00');
  assert.equal(J.wanneerLabel(r, null, '2026-10-13'), 'Ingepland 20-10-2026 (+1 dag)');
  assert.equal(J.wanneerLabel(r, null, '2026-11-01'), '05-10-2026 t/m 21-10-2026');
  assert.equal(J.wanneerLabel([], '2026-09-01', '2026-11-01'), 'Gestart 01-09-2026');
  assert.equal(J.wanneerLabel([], null, '2026-11-01'), 'Nog niet ingepland');
});
