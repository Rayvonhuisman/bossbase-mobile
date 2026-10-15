/**
 * Rekenregels van Uren, Agenda en Planning — gelijk aan het dashboard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const uren = await import('../src/lib/urenRegels.ts');
const plan = await import('../src/lib/planningRegels.ts');

// ── Uren ────────────────────────────────────────────────────────────────────

test('rondAfOpVijf: afronden op vijf minuten, zoals het dashboard', () => {
  assert.equal(uren.rondAfOpVijf('14:37'), '14:35');
  assert.equal(uren.rondAfOpVijf('14:38'), '14:40');
  assert.equal(uren.rondAfOpVijf('08:02:59'), '08:00');
  assert.equal(uren.rondAfOpVijf('23:58'), '00:00');
  assert.equal(uren.rondAfOpVijf(''), '');
  assert.equal(uren.rondAfOpVijf(null), null);
  assert.equal(uren.rondAfOpVijf('xx'), 'xx');
});

test('week: maandag, dagen, weeknummer en label', () => {
  assert.equal(uren.maandagVan('2026-10-13'), '2026-10-12');
  assert.equal(uren.maandagVan('2026-10-18'), '2026-10-12'); // zondag
  assert.equal(uren.maandagVan('2026-10-12'), '2026-10-12');
  assert.deepEqual(uren.dagenVanWeek('2026-10-12').at(-1), '2026-10-18');
  assert.equal(uren.isoWeek('2026-10-12'), 42);
  assert.equal(uren.isoWeek('2026-01-01'), 1);
  assert.equal(uren.isoWeek('2027-01-01'), 53);
  assert.equal(uren.weekLabel('2026-10-12'), 'Week 42 · 12 okt – 18 okt');
  // over de zomertijdwissel heen
  assert.equal(uren.plusDagen('2026-10-24', 2), '2026-10-26');
});

const r = (id, datum, bron, u, pid = 'p1') => ({ id, datum, bron, uren: u, profile_id: pid });

test('Open: werkbonuren zonder (of met te korte) werkdag', () => {
  const regels = [
    r('a', '2026-10-12', 'werkdag', 8),
    r('b', '2026-10-12', 'werkbon', 6),
    r('c', '2026-10-13', 'werkbon', 3),
    r('d', '2026-10-14', 'werkdag', 2),
    r('e', '2026-10-14', 'werkbon', 4),
    r('f', '2026-10-13', 'werkdag', 8, 'p2'),
  ];
  assert.deepEqual([...uren.openDagen(regels)].sort(), ['2026-10-13|p1', '2026-10-14|p1']);
  assert.deepEqual(uren.filterUren(regels, 'open').map((x) => x.id), ['c', 'd', 'e']);
  assert.deepEqual(uren.filterUren(regels, 'werkdag').map((x) => x.id), ['a', 'd', 'f']);
  assert.deepEqual(uren.filterUren(regels, 'werkbon').map((x) => x.id), ['b', 'c', 'e']);
  assert.equal(uren.filterUren(regels, 'alles').length, 6);
});

test('KPI en groeperen per dag (werkdag en werkbon apart)', () => {
  const regels = [r('a', '2026-10-12', 'werkdag', 7.5), r('b', '2026-10-13', 'werkdag', 8, 'p2'), r('c', '2026-10-13', 'werkbon', 2)];
  const kpi = uren.urenKpi(regels.filter((x) => x.bron === 'werkdag'));
  assert.deepEqual(kpi, { totaal: 15.5, medewerkers: 2, dagen: 2, gemPerDag: 7.75 });
  const g = uren.groepeerPerDag(regels);
  assert.equal(g[0].datum, '2026-10-13');
  assert.equal(g[0].werkdag, 8);
  assert.equal(g[0].werkbon, 2);
  assert.equal(uren.dagKop('2026-10-13', '2026-10-13'), 'Vandaag');
  assert.equal(uren.dagKop('2026-10-12', '2026-10-13'), 'Gisteren');
  assert.equal(uren.dagKop('2026-10-09', '2026-10-13'), 'Vrijdag 9 okt');
});

test('kilometers: leeg = null, ongeldig = undefined', () => {
  assert.equal(uren.leesKm(''), null);
  assert.equal(uren.leesKm('12,5'), 12.5);
  assert.equal(uren.leesKm('-1'), undefined);
  assert.equal(uren.leesKm('abc'), undefined);
});

// ── Werkbondagen ────────────────────────────────────────────────────────────

const wb = (extra = {}) => ({
  id: 'w1',
  status: 'gepland',
  gepland_op: '2026-10-12',
  starttijd: '08:00:00',
  eindtijd: '16:30:00',
  assigned_to: null,
  assigned_to_ids: ['jan', 'piet'],
  voertuig_ids: ['bus1'],
  dagen: [],
  ...extra,
});

test('dagen: terugval op gepland_op, tijden en ploeg per dag/persoon', () => {
  const w = wb();
  assert.deepEqual(plan.werkbonDagen(w).map((d) => d.datum), ['2026-10-12']);
  const dag = {
    datum: '2026-10-13', starttijd: null, eindtijd: null,
    medewerker_ids: ['piet'], medewerker_tijden: { piet: { starttijd: '13:00', eindtijd: '17:00' } },
  };
  assert.deepEqual(plan.tijdenOpDag(w, dag), { starttijd: '08:00', eindtijd: '16:30' });
  assert.deepEqual(plan.ploegOpDag(w, dag), ['piet']);
  assert.deepEqual(plan.tijdenVoorPersoon(w, dag, 'piet'), { starttijd: '13:00', eindtijd: '17:00' });
  assert.equal(plan.staatOpDagVoor(w, dag, 'jan'), false);
  assert.equal(plan.isIngepland(w), true);
  assert.equal(plan.isIngepland(wb({ starttijd: null, gepland_op: null })), false);
  assert.equal(plan.isIngepland(wb({ starttijd: null })), false);
});

// ── Agenda ──────────────────────────────────────────────────────────────────

const meerdaags = wb({
  dagen: [
    { datum: '2026-10-12', starttijd: null, eindtijd: null, medewerker_ids: null,
      medewerker_tijden: { piet: { starttijd: '13:00', eindtijd: '17:00' } },
      medewerker_voertuig: { jan: 'bus1' } },
    { datum: '2026-10-13', starttijd: '09:00', eindtijd: '12:00', medewerker_ids: ['piet'] },
    { datum: '2026-10-20', starttijd: null, eindtijd: null, medewerker_ids: null },
  ],
});

test('agenda: persoonlijk alleen jouw dagen met jouw tijd en voertuig', () => {
  const jan = plan.agendaWerkbonItems([meerdaags], { uid: 'jan', gedeeld: false, van: '2026-10-12', tot: '2026-10-18' });
  assert.deepEqual(jan.map((i) => [i.datum, i.starttijd, i.voertuigId]), [['2026-10-12', '08:00', 'bus1']]);
  const piet = plan.agendaWerkbonItems([meerdaags], { uid: 'piet', gedeeld: false, van: '2026-10-12', tot: '2026-10-18' });
  assert.deepEqual(piet.map((i) => [i.datum, i.starttijd]), [['2026-10-12', '13:00'], ['2026-10-13', '09:00']]);
  assert.equal(piet[0].sleutel, 'wb-w1-2026-10-12-13:00');
});

test('agenda: gedeelde werkruimte één item per verschillende tijd; afgerond telt niet', () => {
  const alles = plan.agendaWerkbonItems([meerdaags], { uid: 'jan', gedeeld: true, van: '2026-10-12', tot: '2026-10-18' });
  assert.deepEqual(alles.map((i) => [i.datum, i.starttijd]), [['2026-10-12', '08:00'], ['2026-10-12', '13:00'], ['2026-10-13', '09:00']]);
  assert.equal(plan.agendaWerkbonItems([{ ...meerdaags, status: 'afgerond' }], { uid: 'jan', gedeeld: true, van: '2026-10-01', tot: '2026-10-31' }).length, 0);
});

test('homepage: werkbon op dag 2 van een meerdaagse klus telt mee, afgerond ook, andermans dag niet', () => {
  // gepland_op is dag 1 (12-10); op 13-10 moet piet hem zien, jan niet (dagploeg).
  const opDag2 = (uid, w = meerdaags) =>
    plan.agendaWerkbonItems([w], { uid, gedeeld: false, van: '2026-10-13', tot: '2026-10-13', ookAfgerond: true });
  assert.deepEqual(opDag2('piet').map((i) => [i.datum, i.starttijd]), [['2026-10-13', '09:00']]);
  assert.equal(opDag2('jan').length, 0);
  assert.equal(opDag2('piet', { ...meerdaags, status: 'afgerond' }).length, 1);
});

test('agenda: afspraken persoonlijk filteren, werkbon-gekoppelde verbergen, bewerkrecht', () => {
  const ev = [
    { id: 1, assigned_to: 'jan', werkbon_id: null, herkomst: 'zelf' },
    { id: 2, assigned_to: 'piet', werkbon_id: null, herkomst: 'zelf' },
    { id: 3, assigned_to: 'jan', werkbon_id: 'w1', herkomst: 'planning' },
  ];
  assert.deepEqual(plan.zichtbareAfspraken(ev, { uid: 'jan', gedeeld: false }).map((e) => e.id), [1]);
  assert.deepEqual(plan.zichtbareAfspraken(ev, { uid: 'jan', gedeeld: true }).map((e) => e.id), [1, 2]);
  assert.equal(plan.magAfspraakBewerken(ev[0], { uid: 'jan', planningRecht: false }), true);
  assert.equal(plan.magAfspraakBewerken(ev[1], { uid: 'jan', planningRecht: false }), false);
  assert.equal(plan.magAfspraakBewerken({ assigned_to: 'jan', herkomst: 'planning' }, { uid: 'jan', planningRecht: false }), false);
  assert.equal(plan.magAfspraakBewerken(ev[1], { uid: 'jan', planningRecht: true }), true);
});

// ── Planning ────────────────────────────────────────────────────────────────

test('rooster: blok per medewerker met eigen tijd; zonder ploeg niet toegewezen', () => {
  const b = plan.roosterBlokken([meerdaags, wb({ id: 'w2', assigned_to_ids: [] })], { van: '2026-10-12', tot: '2026-10-18', modus: 'medewerker' });
  assert.deepEqual(
    b.map((x) => [x.werkbon.id, x.datum, x.resource, x.starttijd, x.dagNr, x.dagenTotaal]),
    [
      ['w1', '2026-10-12', 'jan', '08:00', 1, 3],
      ['w2', '2026-10-12', null, '08:00', 1, 1],
      ['w1', '2026-10-12', 'piet', '13:00', 1, 3],
      ['w1', '2026-10-13', 'piet', '09:00', 2, 3],
    ],
  );
  assert.equal(b[0].voertuigId, 'bus1');
});

test('rooster: voertuigmodus met inzittenden', () => {
  const b = plan.roosterBlokken([meerdaags], { van: '2026-10-12', tot: '2026-10-12', modus: 'voertuig' });
  assert.equal(b.length, 1);
  assert.equal(b[0].resource, 'bus1');
  assert.deepEqual(b[0].inzittenden, ['jan']);
});

test('niet ingepland en dubbel ingepland', () => {
  const los = wb({ id: 'los', starttijd: null, gepland_op: null });
  assert.deepEqual(plan.nietIngepland([meerdaags, los]).map((w) => w.id), ['los']);
  const ander = wb({ id: 'w3', starttijd: '16:00', eindtijd: '18:00', assigned_to_ids: ['piet'] });
  const blokken = plan.roosterBlokken([meerdaags, ander], { van: '2026-10-12', tot: '2026-10-12', modus: 'medewerker' });
  const dubbel = plan.dubbeleBlokken(blokken);
  assert.deepEqual([...dubbel].sort(), ['w1-2026-10-12-p-piet', 'w3-2026-10-12-p-piet']);
  // aansluitend is geen botsing
  const aansluit = wb({ id: 'w4', starttijd: '17:00', eindtijd: '18:00', assigned_to_ids: ['piet'] });
  assert.equal(plan.dubbeleBlokken(plan.roosterBlokken([meerdaags, aansluit], { van: '2026-10-12', tot: '2026-10-12', modus: 'medewerker' })).size, 0);
  assert.equal(plan.medewerkerKleur(-1), '#9ca3af');
  assert.equal(plan.medewerkerKleur(0), 'hsl(120, 65%, 50%)');
});
