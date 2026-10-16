/**
 * Planning: Totaal met activiteiten, en voertuigen per dag — gelijk aan het
 * dashboard (PlanningPage.jsx, utils/werkbonDagen.js dubbeleBoekingen,
 * utils/voertuigDagen.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const plan = await import('../src/lib/planningRegels.ts');
const L = await import('../src/lib/werkbonLogica.ts');

const act = (id, o = {}) => ({
  id,
  title: `Act ${id}`,
  datum: '2026-10-20',
  tijd: '10:00',
  end_time: null,
  completed: false,
  assigned_to: null,
  assigned_to_ids: null,
  ...o,
});

// ── Activiteiten op de planning ─────────────────────────────────────────────

test('activiteitBlokken: Totaal = één blok per activiteit met een toewijzing', () => {
  const lijst = [
    act('a', { assigned_to_ids: ['p1', 'p2'] }),
    act('b'), // niemand: valt weg in Totaal (er is een team)
    act('c', { assigned_to: 'p3', tijd: '08:00', end_time: '08:30:00' }),
    act('d', { datum: '2026-10-27', assigned_to: 'p1' }), // buiten de week
  ];
  const blokken = plan.activiteitBlokken(lijst, { van: '2026-10-19', tot: '2026-10-25', modus: 'totaal', metTeam: true });
  assert.deepEqual(
    blokken.map((b) => [b.sleutel, b.starttijd, b.eindtijd, b.personen.join(',')]),
    [
      ['act-c', '08:00', '08:30', 'p3'],
      ['act-a', '10:00', '11:00', 'p1,p2'], // zonder eindtijd een uur, zoals DayColumn
    ],
  );
});

test('activiteitBlokken: zonder team (zzp) ook wat aan niemand hangt; zonder tijd 09:00', () => {
  const blokken = plan.activiteitBlokken([act('b', { tijd: null })], {
    van: '2026-10-20',
    tot: '2026-10-20',
    modus: 'totaal',
    metTeam: false,
  });
  assert.equal(blokken.length, 1);
  assert.equal(blokken[0].starttijd, '09:00');
});

test('activiteitBlokken: per medewerker één blok per toegewezene; voertuigen nooit', () => {
  const lijst = [act('a', { assigned_to_ids: ['p1', 'p2'] })];
  const m = plan.activiteitBlokken(lijst, { van: '2026-10-20', tot: '2026-10-20', modus: 'medewerker', metTeam: true });
  assert.deepEqual(m.map((b) => b.resource), ['p1', 'p2']);
  const v = plan.activiteitBlokken(lijst, { van: '2026-10-20', tot: '2026-10-20', modus: 'voertuig', metTeam: true });
  assert.deepEqual(v, []);
});

test('dubbelMetActiviteiten: werkbon en activiteit van dezelfde persoon botsen', () => {
  const wb = {
    id: 'w1',
    status: 'gepland',
    gepland_op: '2026-10-20',
    starttijd: '08:00',
    eindtijd: '12:00',
    assigned_to_ids: ['p1'],
    dagen: [{ datum: '2026-10-20', starttijd: null, eindtijd: null }],
  };
  const rooster = plan.roosterBlokken([wb], { van: '2026-10-20', tot: '2026-10-20', modus: 'medewerker' });
  const acts = plan.activiteitBlokken(
    [
      act('a', { assigned_to: 'p1', tijd: '11:30' }), // botst
      act('b', { assigned_to: 'p1', tijd: '12:00' }), // 12:00 = einde werkbon: geen botsing
      act('c', { assigned_to: 'p2', tijd: '11:30' }), // andere persoon
    ],
    { van: '2026-10-20', tot: '2026-10-20', modus: 'totaal', metTeam: true },
  );
  const dubbel = plan.dubbelMetActiviteiten(rooster, acts);
  assert.ok(dubbel.has('act-a'));
  assert.ok(dubbel.has(rooster[0].sleutel));
  assert.ok(!dubbel.has('act-c'));
  // b (12:00–12:30) en a (11:30–12:00, zonder eindtijd een half uur) raken elkaar alleen
  assert.ok(!dubbel.has('act-b'));
});

test('dubbelMetActiviteiten: gekoppelde activiteit, afgeronde activiteit en afgeronde werkbon tellen niet', () => {
  const wb = (o) => ({
    id: 'w1',
    status: 'gepland',
    gepland_op: '2026-10-20',
    starttijd: '08:00',
    eindtijd: '12:00',
    assigned_to_ids: ['p1'],
    dagen: [{ datum: '2026-10-20', starttijd: null, eindtijd: null }],
    ...o,
  });
  const acts = (o) =>
    plan.activiteitBlokken([act('a', { assigned_to: 'p1', tijd: '09:00', ...o })], {
      van: '2026-10-20',
      tot: '2026-10-20',
      modus: 'medewerker',
      metTeam: true,
    });
  const r = (w) => plan.roosterBlokken([w], { van: '2026-10-20', tot: '2026-10-20', modus: 'medewerker' });
  assert.equal(plan.dubbelMetActiviteiten(r(wb({ activity_id: 'a' })), acts()).size, 0);
  assert.equal(plan.dubbelMetActiviteiten(r(wb({ status: 'afgerond' })), acts()).size, 0);
  assert.equal(plan.dubbelMetActiviteiten(r(wb()), acts({ completed: true })).size, 0);
  assert.equal(plan.dubbelMetActiviteiten(r(wb()), acts()).size, 2);
});

test('dubbelMetActiviteiten: twee activiteiten van dezelfde persoon botsen ook', () => {
  const acts = plan.activiteitBlokken(
    [act('a', { assigned_to: 'p1', tijd: '10:00', end_time: '11:00' }), act('b', { assigned_to_ids: ['p1', 'p2'], tijd: '10:30' })],
    { van: '2026-10-20', tot: '2026-10-20', modus: 'totaal', metTeam: true },
  );
  assert.deepEqual([...plan.dubbelMetActiviteiten([], acts)].sort(), ['act-a', 'act-b']);
});

// ── Voertuigen per dag ──────────────────────────────────────────────────────

const bus = { id: 'v1', naam: 'Bus 1', zitplaatsen: 2 };
const kar = { id: 'v2', naam: 'Aanhanger', zitplaatsen: null };
const basisPlanning = () => ({
  dagen: ['2026-10-20', '2026-10-21'],
  tijden: {
    '2026-10-20': { starttijd: '08:00', eindtijd: '16:00' },
    '2026-10-21': { starttijd: '08:00', eindtijd: '16:00' },
  },
  ploeg: {},
  persoonTijden: {},
});
const ctxVan = (p, o = {}) => ({
  p,
  standaard: { starttijd: '08:00', eindtijd: '16:00' },
  ploegIds: ['p1', 'p2', 'p3'],
  voertuigen: [bus, kar],
  naamVan: (id) => ({ p1: 'Jan', p2: 'Piet', p3: 'Kees' })[id] ?? 'Medewerker',
  ...o,
});

test('voertuigPlanningUitWerkbon: dagen → formulier', () => {
  const w = {
    starttijd: '08:00',
    eindtijd: '16:00',
    werkbon_dagen: [
      { datum: '2026-10-20', starttijd: null, eindtijd: null, voertuig_ids: ['v1'], voertuig_tijden: { v1: { starttijd: '07:30:00', eindtijd: '17:00:00' } }, medewerker_voertuig: { p1: 'v1' } },
      { datum: '2026-10-21', starttijd: null, eindtijd: null, voertuig_ids: null, voertuig_tijden: null, medewerker_voertuig: null },
    ],
  };
  assert.deepEqual(L.voertuigPlanningUitWerkbon(w), {
    voertuigen: { '2026-10-20': ['v1'] },
    voertuigTijden: { '2026-10-20': { v1: { starttijd: '07:30', eindtijd: '17:00' } } },
    koppeling: { '2026-10-20': { p1: 'v1' } },
  });
});

test('metVoertuigen: alle drie de sleutels mee; gelijk aan de werkbon wordt null', () => {
  const p = {
    ...basisPlanning(),
    voertuigen: { '2026-10-20': ['v1'], '2026-10-21': ['v1', 'v2'] },
    voertuigTijden: {
      '2026-10-20': { v1: { starttijd: '07:30', eindtijd: '16:30' } },
      '2026-10-21': { v1: { starttijd: '08:00', eindtijd: '16:00' } }, // = dagtijd: valt weg
    },
    koppeling: { '2026-10-20': { p1: 'v1', p2: 'v2' } }, // v2 rijdt die dag niet: valt weg
  };
  const ctx = ctxVan(p);
  const dagen = L.metVoertuigen(L.dagenUitPlanning(p, ctx.ploegIds, ctx.standaard), ctx);
  assert.deepEqual(
    dagen.map((d) => [d.datum, d.voertuig_ids, d.voertuig_tijden, d.medewerker_voertuig]),
    [
      ['2026-10-20', ['v1'], { v1: { starttijd: '07:30', eindtijd: '16:30' } }, { p1: 'v1' }],
      ['2026-10-21', null, null, null],
    ],
  );
});

test('magKoppelen: buiten de voertuigtijd en te vol, met de zinnen van de database', () => {
  const p = {
    ...basisPlanning(),
    voertuigTijden: { '2026-10-20': { v1: { starttijd: '09:00', eindtijd: '16:00' } } },
    koppeling: { '2026-10-20': { p2: 'v1', p3: 'v1' } },
  };
  const ctx = ctxVan(p);
  assert.equal(L.magKoppelen(ctx, '2026-10-20', 'p1', 'v1'), 'Jan werkt 08:00–16:00, Bus 1 staat 09:00–16:00.');
  const p2 = { ...basisPlanning(), koppeling: { '2026-10-20': { p2: 'v1', p3: 'v1' } } };
  assert.equal(
    L.magKoppelen(ctxVan(p2), '2026-10-20', 'p1', 'v1'),
    'Bus 1 heeft 2 plekken, tussen 08:00 en 16:00 zitten er 3 in.',
  );
  // Zonder plekken onbeperkt
  assert.equal(L.magKoppelen(ctxVan(p2), '2026-10-20', 'p1', 'v2'), '');
});

test('teVol en hoogsteBezetting: tijden zonder eindpunt', () => {
  const b = [
    { starttijd: '08:00', eindtijd: '12:00' },
    { starttijd: '12:00', eindtijd: '16:00' },
    { starttijd: '10:00', eindtijd: '14:00' },
  ];
  assert.equal(L.hoogsteBezetting(b), 2);
  assert.equal(L.teVol(b, 2), null);
  assert.deepEqual(L.teVol(b, 1), { van: '10:00', tot: '14:00', aantal: 2 });
});

test('controleerVoertuigen: alleen nieuwe koppelingen; met datum bij meer dagen', () => {
  const p = { ...basisPlanning(), koppeling: { '2026-10-21': { p1: 'v1', p2: 'v1', p3: 'v1' } } };
  const ctx = ctxVan(p);
  assert.match(L.controleerVoertuigen(ctx), /^wo 21 okt: Bus 1 heeft 2 plekken/);
  // Al opgeslagen koppelingen worden niet opnieuw getoetst.
  assert.equal(L.controleerVoertuigen(ctx, { '2026-10-21': { p1: 'v1', p2: 'v1', p3: 'v1' } }), '');
});

test('voertuigWaarschuwingen en koppelingVanDag: wie die dag niet werkt telt niet', () => {
  const p = {
    ...basisPlanning(),
    ploeg: { '2026-10-20': ['p1', 'p2'] }, // p3 werkt die dag niet
    koppeling: { '2026-10-20': { p1: 'v1', p2: 'v1', p3: 'v1' } },
  };
  const ctx = ctxVan(p);
  assert.deepEqual(L.koppelingVanDag(ctx, '2026-10-20'), { p1: 'v1', p2: 'v1' });
  assert.equal(L.bezettingVanVoertuig(ctx, '2026-10-20', 'v1'), 2);
  assert.deepEqual(L.voertuigWaarschuwingen(ctx, '2026-10-20'), { perPersoon: {}, perVoertuig: {} });
});

test('voertuigDubbel: zelfde voertuig op een andere open werkbon tegelijk', () => {
  const ander = (status) => ({
    id: 'w2',
    titel: 'Dak',
    status,
    starttijd: '12:00',
    eindtijd: '15:00',
    voertuig_ids: ['v1'],
    werkbon_dagen: [{ datum: '2026-10-20', starttijd: null, eindtijd: null }],
  });
  const o = { werkbonId: 'w1', datum: '2026-10-20', vid: 'v1', starttijd: '08:00', eindtijd: '13:00' };
  assert.deepEqual(L.voertuigDubbel({ ...o, werkbonnen: [ander('gepland')] }), [
    { titel: 'Dak', starttijd: '12:00', eindtijd: '15:00' },
  ]);
  assert.deepEqual(L.voertuigDubbel({ ...o, werkbonnen: [ander('afgerond')] }), []);
  assert.deepEqual(L.voertuigDubbel({ ...o, eindtijd: '12:00', werkbonnen: [ander('gepland')] }), []);
});
