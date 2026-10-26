/** Werkbonlogica zoals het dashboard: statussen, dagen/tijden, filters, bedragen. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../src/lib/werkbonLogica.ts');

test('status: aliassen en kleuren van het dashboard', () => {
  assert.equal(L.normaliseerStatus('planned'), 'gepland');
  assert.equal(L.normaliseerStatus('in_progress'), 'in_uitvoering');
  assert.equal(L.normaliseerStatus('done'), 'afgerond');
  assert.equal(L.normaliseerStatus(null), 'gepland');
  assert.equal(L.WERKBON_STATUS_STIJL.gepland.kleur, '#2563eb');
  assert.equal(L.WERKBON_STATUS_STIJL.gepland.bg, '#eff6ff');
  assert.equal(L.WERKBON_STATUS_STIJL.in_uitvoering.kleur, '#e8784a');
  assert.equal(L.WERKBON_STATUS_STIJL.in_uitvoering.bg, '#fff4ec');
  assert.equal(L.WERKBON_STATUS_STIJL.afgerond.kleur, '#15A34A');
  assert.equal(L.WERKBON_STATUS_STIJL.afgerond.bg, '#ecfdf5');
});

const wb = {
  gepland_op: '2026-11-02',
  starttijd: '08:00:00',
  eindtijd: '16:30:00',
  assigned_to_ids: ['a', 'b'],
  werkbon_dagen: [
    { datum: '2026-11-04', starttijd: null, eindtijd: null, medewerker_ids: ['a'], medewerker_tijden: null },
    { datum: '2026-11-02', starttijd: null, eindtijd: null, medewerker_ids: null, medewerker_tijden: { b: { starttijd: '07:00', eindtijd: '12:00' } } },
    { datum: '2026-11-03', starttijd: '09:00', eindtijd: '17:00', medewerker_ids: null, medewerker_tijden: null },
  ],
};

test('dagen: gesorteerd, label, venster, ploeg', () => {
  assert.deepEqual(L.werkbonDagen(wb).map((d) => d.datum), ['2026-11-02', '2026-11-03', '2026-11-04']);
  assert.equal(L.planningLabel(wb), 'ma 2 nov – wo 4 nov · 3 dagen');
  assert.deepEqual(L.werkbonVenster(wb), { starttijd: '07:00', eindtijd: '17:00' });
  assert.deepEqual(L.ploegOpDag(wb, L.werkbonDagen(wb)[2]), ['a']);
  assert.equal(L.isIngepland(wb), true);
  assert.equal(L.isIngepland({ gepland_op: null }), false);
  assert.equal(L.planningLabel({ gepland_op: '2026-11-03' }), 'di 3 nov');
});

test('mijn volgende dag: eigen tijd en collega\'s', () => {
  const m = L.mijnVolgendeDag(wb, 'b', '2026-11-01');
  assert.equal(m.dag.datum, '2026-11-02');
  assert.deepEqual(m.tijd, { starttijd: '07:00', eindtijd: '12:00' });
  assert.equal(m.collegas, 1);
  assert.equal(L.mijnVolgendeDag(wb, 'b', '2026-11-04'), null);
  assert.equal(L.dagWoord('2026-11-02', '2026-11-01'), 'morgen');
});

test('formulier: dag aantikken neemt tijd over, dagenUitPlanning zoals dashboard', () => {
  let p = L.legePlanning('');
  p = L.wisselDag(p, '2026-11-02');
  assert.deepEqual(p.tijden['2026-11-02'], L.STANDAARD_TIJD);
  p = { ...p, tijden: { '2026-11-02': { starttijd: '07:30', eindtijd: '15:00' } } };
  p = L.wisselDag(p, '2026-11-03');
  assert.deepEqual(p.tijden['2026-11-03'], { starttijd: '07:30', eindtijd: '15:00' });
  p = { ...p, tijden: { ...p.tijden, '2026-11-03': { starttijd: '09:00', eindtijd: '12:00' } } };
  p = L.wisselPersoonOpDag(p, '2026-11-03', 'b', ['a', 'b']);
  const dagen = L.dagenUitPlanning(p, ['a', 'b']);
  assert.deepEqual(dagen, [
    { datum: '2026-11-02', starttijd: null, eindtijd: null, medewerker_ids: null, medewerker_tijden: null },
    { datum: '2026-11-03', starttijd: '09:00', eindtijd: '12:00', medewerker_ids: ['a'], medewerker_tijden: null },
  ]);
  // Weer aanzetten = hele ploeg = NULL
  p = L.wisselPersoonOpDag(p, '2026-11-03', 'b', ['a', 'b']);
  assert.equal(L.dagenUitPlanning(p, ['a', 'b'])[1].medewerker_ids, null);
  assert.equal(L.tijdenVerschillen(p), true);
  assert.equal(L.tijdenVerschillen(L.tijdVoorAlleDagen(p)), false);
});

test('planning terug uit werkbon en weer heen blijft gelijk', () => {
  const p = L.planningUitWerkbon(wb);
  const dagen = L.dagenUitPlanning(p, wb.assigned_to_ids, { starttijd: '08:00', eindtijd: '16:30' });
  assert.equal(dagen[0].starttijd, null);
  assert.equal(dagen[1].starttijd, '09:00');
  assert.deepEqual(dagen[2].medewerker_ids, ['a']);
  assert.deepEqual(dagen[0].medewerker_tijden, { b: { starttijd: '07:00', eindtijd: '12:00' } });
});

test('controleerPlanning: tijden, volgorde en maximum', () => {
  const p = { dagen: ['2026-11-02'], tijden: { '2026-11-02': { starttijd: '10:00', eindtijd: '09:00' } }, ploeg: {}, persoonTijden: {} };
  assert.match(L.controleerPlanning(p), /eindtijd na de begintijd/);
  assert.match(L.controleerPlanning({ ...p, tijden: { '2026-11-02': { starttijd: '', eindtijd: '' } } }), /begin- en eindtijd/);
  assert.equal(L.controleerPlanning(L.legePlanning('')), '');
  const veel = Array.from({ length: 61 }, (_, i) => L.plusDagen('2026-01-01', i));
  assert.match(L.controleerPlanning({ dagen: veel, tijden: {}, ploeg: {}, persoonTijden: {} }, { starttijd: '08:00', eindtijd: '16:00' }), /maximaal 60/);
});

test('verplaatsNaar schuift een meerdaagse klus in zijn geheel', () => {
  const p = { dagen: ['2026-11-02', '2026-11-03'], tijden: {}, ploeg: {}, persoonTijden: {} };
  assert.deepEqual(L.verplaatsNaar(p, '2026-11-09').dagen, ['2026-11-09', '2026-11-10']);
});

test('lijst: zoeken op titel/klant/locatie en tellen per status', () => {
  const lijst = [
    { titel: 'Dak', status: 'gepland', locatie: 'Emmen', customer: { name: 'Jansen' } },
    { titel: 'Goot', status: 'in_uitvoering', locatie: 'Assen', customer: null },
    { titel: 'Kozijn', status: 'afgerond', locatie: null, customer: { name: 'Pietersen' } },
  ];
  assert.equal(lijst.filter((w) => L.matchtZoekterm(w, 'jans')).length, 1);
  assert.equal(lijst.filter((w) => L.matchtZoekterm(w, 'assen')).length, 1);
  assert.deepEqual(L.telStatussen(lijst), { alle: 3, gepland: 1, in_uitvoering: 1, afgerond: 1, geannuleerd: 0 });
  assert.equal(lijst.filter((w) => L.matchtStatus(w, 'afgerond')).length, 1);
  // Geannuleerd telt niet bij "Alle" en heeft een eigen filter.
  const metAfgezegd = [...lijst, { titel: 'Schuur', status: 'geannuleerd', locatie: null, customer: null }];
  assert.deepEqual(L.telStatussen(metAfgezegd), { alle: 3, gepland: 1, in_uitvoering: 1, afgerond: 1, geannuleerd: 1 });
  assert.equal(metAfgezegd.filter((w) => L.matchtStatus(w, 'alle')).length, 3);
  assert.equal(metAfgezegd.filter((w) => L.matchtStatus(w, 'geannuleerd')).length, 1);
  assert.equal(L.normaliseerStatus('geannuleerd'), 'geannuleerd');
});

test('materiaal: subtotaal, btw, marge en bedrag lezen', () => {
  assert.equal(L.materiaalSubtotaal(3, 1.335), 4.01);
  assert.equal(L.inclusiefBtw(100, 21), 121);
  assert.deepEqual(L.marge(8, 10), { bedrag: 2, pct: 20 });
  assert.deepEqual(L.marge(12, 10), { bedrag: -2, pct: -20 });
  assert.equal(L.marge(null, 10), null);
  assert.equal(L.leesBedrag('12,50'), 12.5);
  assert.equal(L.leesBedrag('1.234,5'), 1234.5);
  assert.equal(L.leesBedrag(''), null);
  assert.equal(L.rondAfOpVijf('08:07'), '08:05');
  assert.equal(L.rondAfOpVijf('08:08'), '08:10');
});

test('maandraster begint op maandag', () => {
  const r = L.maandRaster(2026, 10); // november 2026: 1 nov = zondag
  assert.equal(r.slice(0, 6).every((x) => x === null), true);
  assert.equal(r[6], '2026-11-01');
  assert.equal(r.length % 7, 0);
});

// ── Planning: verzetten en meldingen per dag (dashboard PlanningPage) ────────

const P = await import('../src/lib/werkbonLogica.ts');
const bon = (x = {}) => ({
  id: 'w1',
  gepland_op: '2026-10-12',
  starttijd: '08:00:00',
  eindtijd: '16:30:00',
  assigned_to: 'jan',
  assigned_to_ids: ['jan', 'piet'],
  dagen: [
    { datum: '2026-10-12', starttijd: null, eindtijd: null, medewerker_ids: null, medewerker_tijden: null },
    { datum: '2026-10-13', starttijd: null, eindtijd: null, medewerker_ids: null, medewerker_tijden: null },
  ],
  ...x,
});

test('verzetTijd: een persoon krijgt een eigen tijd, de rest blijft staan', () => {
  const r = P.verzetTijd(bon(), '2026-10-13', 'piet', { starttijd: '12:00', eindtijd: '17:00' });
  assert.deepEqual(r.standaard, { starttijd: '08:00', eindtijd: '16:30' });
  assert.deepEqual(r.dagen[1].medewerker_tijden, { piet: { starttijd: '12:00', eindtijd: '17:00' } });
  assert.equal(r.dagen[0].medewerker_tijden, null);
  // Terug naar de dagtijd: de eigen tijd vervalt.
  const terug = P.verzetTijd({ ...bon(), dagen: [bon().dagen[0], { ...bon().dagen[1], medewerker_tijden: { piet: { starttijd: '12:00', eindtijd: '17:00' } } }] }, '2026-10-13', 'piet', { starttijd: '08:00', eindtijd: '16:30' });
  assert.equal(terug.dagen[1].medewerker_tijden, null);
});

test('verzetTijd: dag 1 verschuift de standaardtijd, dag 2 houdt zijn tijd', () => {
  const r = P.verzetTijd(bon(), '2026-10-12', null, { starttijd: '09:00', eindtijd: '15:00' });
  assert.deepEqual(r.standaard, { starttijd: '09:00', eindtijd: '15:00' });
  assert.deepEqual([r.dagen[1].starttijd, r.dagen[1].eindtijd], ['08:00', '16:30']);
  assert.throws(() => P.verzetTijd(bon(), '2026-10-20', null, { starttijd: '09:00', eindtijd: '10:00' }), /niet \(meer\)/);
});

test('dagMeldingen: een dag erbij of eraf voor wie op de bon blijft', () => {
  const oud = bon().dagen;
  const nieuw = [oud[0], { ...oud[1], medewerker_ids: ['jan'] }, { datum: '2026-10-14', starttijd: '09:00', eindtijd: '12:00', medewerker_ids: ['piet'] }];
  const m = P.dagMeldingen({ oudeDagen: oud, nieuweDagen: nieuw, oudePloeg: ['jan', 'piet'], nieuwePloeg: ['jan', 'piet'], blijvers: ['jan', 'piet'] });
  assert.deepEqual(
    m.map((x) => [x.uid, x.soort, x.dag.datum]),
    [['piet', 'ingepland', '2026-10-14'], ['piet', 'afgehaald', '2026-10-13']],
  );
});
