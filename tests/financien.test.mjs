/**
 * Financiën: de rekenregels van RevenuePage in het dashboard — tijdvak van de
 * tegels, de grafiek, en de tabel per klant (gefactureerd, betaald,
 * openstaand, materiaal, inkopen, uren, brutowinst vóór arbeid, marge).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const F = await import('../src/lib/financienLogica.ts');
const P = await import('../src/lib/projectKostenLogica.ts');

const factuur = (o) => ({
  id: o.id,
  customer_id: o.klant ?? null,
  status: o.status ?? 'verzonden',
  totaal_incl: o.incl ?? 0,
  totaal_excl: o.excl ?? 0,
  factuurdatum: o.datum ?? null,
  betaald_op: o.betaald ?? null,
  is_credit: o.credit ?? false,
  gecrediteerd: o.gecrediteerd ?? false,
  credit_van_factuur_id: o.creditVan ?? null,
});

// ── Facturen: gefactureerd, betaald, openstaand ─────────────────────────────

test('concept telt niet als gefactureerd; creditfactuur trekt zichzelf af', () => {
  const lijst = [
    factuur({ id: 'a', incl: 121, excl: 100 }),
    factuur({ id: 'b', status: 'concept', incl: 500, excl: 413.22 }),
    factuur({ id: 'c', credit: true, creditVan: 'a', incl: -60.5, excl: -50 }),
  ];
  assert.equal(F.sumGefactureerd(lijst), 60.5);
  assert.equal(F.sumOmzetExcl(lijst), 50);
});

test('betaald: geen creditnota en geen gecrediteerde factuur', () => {
  const lijst = [
    factuur({ id: 'a', status: 'betaald', incl: 100 }),
    factuur({ id: 'b', status: 'betaald', incl: 50, gecrediteerd: true }),
    factuur({ id: 'c', status: 'betaald', incl: -20, credit: true }),
    factuur({ id: 'd', status: 'verzonden', incl: 70 }),
  ];
  assert.equal(F.sumBetaald(lijst), 100);
});

test('openstaand zoals bb_openstaand_per_factuur: deelcreditering, nooit onder 0, concept-credit telt niet', () => {
  const lijst = [
    // Factuur €127,35 met creditnota €119,79 → €7,56 blijft open
    factuur({ id: 'a', status: 'verzonden', incl: 127.35 }),
    factuur({ id: 'ca', status: 'verzonden', credit: true, creditVan: 'a', incl: -119.79 }),
    // Volledig gecrediteerd en meer → 0, niet negatief
    factuur({ id: 'b', status: 'geboekt', incl: 50 }),
    factuur({ id: 'cb', status: 'verzonden', credit: true, creditVan: 'b', incl: -80 }),
    // Credit in concept telt niet mee
    factuur({ id: 'c', status: 'verzonden', incl: 30 }),
    factuur({ id: 'cc', status: 'concept', credit: true, creditVan: 'c', incl: -30 }),
    // Betaald of concept is niet openstaand
    factuur({ id: 'd', status: 'betaald', incl: 999 }),
    factuur({ id: 'e', status: 'concept', incl: 999 }),
  ];
  assert.equal(F.sumOpenstaand(lijst), 37.56);
  const per = F.openstaandPerFactuur(lijst);
  assert.deepEqual(
    per.map((o) => [o.factuur.id, o.bedrag]),
    [
      ['a', 7.56],
      ['b', 0],
      ['c', 30],
    ],
  );
});

test('totalen per klant: alleen facturen met klant; omzet excl. voor de brutowinst', () => {
  const lijst = [
    factuur({ id: 'a', klant: 'k1', status: 'betaald', incl: 121, excl: 100 }),
    factuur({ id: 'b', klant: 'k1', status: 'verzonden', incl: 242, excl: 200 }),
    factuur({ id: 'c', klant: 'k1', status: 'concept', incl: 1000, excl: 1000 }),
    factuur({ id: 'd', klant: null, status: 'verzonden', incl: 50, excl: 50 }),
  ];
  const t = F.totalenPerKlant(lijst).get('k1');
  assert.deepEqual(t, { total: 363, paid: 121, openstaand: 242, omzetExcl: 300 });
  assert.equal(F.totalenPerKlant(lijst).size, 1);
});

// ── Tijdvak van de tegels ───────────────────────────────────────────────────

test('kpiBereik: maandgrenzen, jaarwissel, schrikkeljaar, aangepast', () => {
  const okt = new Date(2026, 9, 15, 0, 30);
  assert.deepEqual(F.kpiBereik('deze-maand', okt), { van: '2026-10-01', tot: '2026-10-31' });
  assert.deepEqual(F.kpiBereik('vorige-maand', okt), { van: '2026-09-01', tot: '2026-09-30' });
  assert.deepEqual(F.kpiBereik('vorige-maand', new Date(2027, 0, 3)), { van: '2026-12-01', tot: '2026-12-31' });
  assert.deepEqual(F.kpiBereik('deze-maand', new Date(2028, 1, 10)), { van: '2028-02-01', tot: '2028-02-29' });
  assert.deepEqual(F.kpiBereik('dit-jaar', okt), { van: '2026-01-01', tot: '2026-12-31' });
  assert.deepEqual(F.kpiBereik('vorig-jaar', okt), { van: '2025-01-01', tot: '2025-12-31' });
  assert.equal(F.kpiBereik('aangepast', okt, '2026-01-01', null), null);
  assert.deepEqual(F.kpiBereik('aangepast', okt, '2026-03-01', '2026-03-31'), { van: '2026-03-01', tot: '2026-03-31' });
});

test('tegels: labels als het dashboard, ontvangen min kosten met toon', () => {
  const tegels = F.kpiTegels(
    { gefactureerd: 1000, ontvangen: 300, openstaand: 700, teVerwachten: 5000, kosten: 450.5 },
    'deze-maand',
  );
  assert.deepEqual(
    tegels.map((t) => t.label),
    [
      'Gefactureerd deze maand',
      'Ontvangen',
      'Openstaand',
      'Te verwachten',
      'Kosten deze maand',
      'Ontvangen min kosten',
    ],
  );
  const netto = tegels.at(-1);
  assert.equal(netto.bedrag, -150.5);
  assert.equal(netto.toon, 'slecht');
  assert.equal(tegels[1].uitleg, 'Betaalde facturen deze maand');
  assert.equal(
    F.kpiTegels({ gefactureerd: 0, ontvangen: 10, openstaand: 0, teVerwachten: 0, kosten: 10 }, 'aangepast').at(-1)
      .toon,
    'goed',
  );
});

// ── Grafiek ─────────────────────────────────────────────────────────────────

test('grafiek: aantal staven en labels per periode', () => {
  const nu = new Date(2026, 9, 15, 12);
  const leeg = { facturen: [], kosten: [] };
  const week = F.grafiekStaven('week', leeg, nu);
  assert.equal(week.length, 7);
  assert.equal(week.at(-1).van, '2026-10-15');
  assert.equal(week.at(-1).label, 'Do');
  assert.equal(week[0].van, '2026-10-09');
  const maand = F.grafiekStaven('maand', leeg, nu);
  assert.equal(maand.length, 30);
  assert.equal(maand[0].van, '2026-09-16');
  const kw = F.grafiekStaven('kwartaal', leeg, nu);
  assert.equal(kw.length, 13);
  assert.deepEqual([kw.at(-1).van, kw.at(-1).tot, kw.at(-1).label], ['2026-10-09', '2026-10-15', '9 okt']);
  const jaar = F.grafiekStaven('jaar', leeg, nu);
  assert.equal(jaar.length, 12);
  assert.deepEqual([jaar[0].van, jaar[0].label], ['2025-11-01', 'nov']);
  assert.deepEqual([jaar.at(-1).van, jaar.at(-1).tot], ['2026-10-01', '2026-10-31']);
});

test('grafiek: factuurdatum, betaaldatum en kostendatum, grenzen inclusief; lokale dag ook vlak na middernacht', () => {
  const nu = new Date(2026, 9, 15, 0, 30); // 00:30 lokaal — in UTC nog 14 oktober
  const bron = {
    facturen: [
      factuur({ id: 'a', status: 'betaald', incl: 100, datum: '2026-10-15', betaald: '2026-10-15' }),
      factuur({ id: 'b', status: 'concept', incl: 900, datum: '2026-10-15' }),
      factuur({ id: 'c', credit: true, incl: -40, datum: '2026-10-15' }),
      factuur({ id: 'd', status: 'betaald', incl: 70, datum: '2026-10-01', betaald: '2026-10-14' }),
    ],
    kosten: [
      { amount: 25, datum: '2026-10-15' },
      { amount: 5, datum: '2026-10-01' },
      { amount: 9, datum: null },
    ],
  };
  const week = F.grafiekStaven('week', bron, nu);
  assert.deepEqual(
    { g: week.at(-1).gefactureerd, o: week.at(-1).ontvangen, k: week.at(-1).kosten },
    { g: 60, o: 100, k: 25 },
  );
  assert.equal(week.at(-2).ontvangen, 70);
  const jaar = F.grafiekStaven('jaar', bron, nu);
  assert.deepEqual(
    { g: jaar.at(-1).gefactureerd, o: jaar.at(-1).ontvangen, k: jaar.at(-1).kosten },
    { g: 130, o: 170, k: 30 },
  );
});

test('grafiekschaal houdt 0 in beeld; aslabel in duizenden', () => {
  assert.deepEqual(F.grafiekSchaal([0, 0]), { max: 0, min: 0 });
  assert.deepEqual(F.grafiekSchaal([5, -3, 12]), { max: 12, min: -3 });
  assert.equal(F.asLabel(0), '€0');
  assert.equal(F.asLabel(12500), '€13k');
});

// ── Kosten per klant ────────────────────────────────────────────────────────

const sleutelRijen = {
  projecten: [
    { id: 'p1', customer_id: 'k1' },
    { id: 'p2', customer_id: 'k2' },
  ],
  werkbonnen: [
    { id: 'w1', project_id: 'p1', customer_id: null }, // via project bij k1
    { id: 'w2', project_id: null, customer_id: 'k1' },
    { id: 'w3', project_id: 'p2', customer_id: 'k2' },
  ],
  deals: [{ id: 'd1', customer_id: 'k1' }],
};

const kost = (o) => ({
  id: o.id,
  description: null,
  amount: o.amount ?? 0,
  cost_date: '2026-10-01',
  werkbon_materiaal_id: o.mat ?? null,
  customer_id: o.klant ?? null,
  project_id: o.project ?? null,
  werkbon_id: o.werkbon ?? null,
  deal_id: o.deal ?? null,
  materiaalAantal: o.aantal ?? null,
  inkoopprijsPer: o.inkoop ?? null,
});

test('verdeelPerKlant: rechtstreeks, via project, werkbon of deal — één rij telt één keer', () => {
  const per = F.verdeelPerKlant(['k1', 'k2'], {
    ...sleutelRijen,
    jobCosts: [
      kost({ id: 'j1', klant: 'k1', werkbon: 'w1', mat: 'm1' }), // twee routes, één rij
      kost({ id: 'j2', werkbon: 'w2', mat: 'm2' }),
      kost({ id: 'j3', deal: 'd1', mat: 'm3' }),
      kost({ id: 'j4', werkbon: 'w3', mat: 'm4' }),
      kost({ id: 'j5', mat: 'm5' }), // nergens aan
    ],
    projectKosten: [
      { id: 'i1', project_id: 'p1', werkbon_id: null, bedrag: 10 },
      { id: 'i2', project_id: null, werkbon_id: 'w2', bedrag: 5 },
      { id: 'i3', project_id: 'p2', werkbon_id: null, bedrag: 7 },
    ],
    uren: [
      { werkbon_id: 'w1', uren: 2 },
      { werkbon_id: 'w3', uren: 4 },
      { werkbon_id: null, uren: 99 },
    ],
  });
  assert.deepEqual(
    per.get('k1').jobCosts.map((k) => k.id),
    ['j1', 'j2', 'j3'],
  );
  assert.deepEqual(
    per.get('k1').projectKosten.map((k) => k.id),
    ['i1', 'i2'],
  );
  assert.deepEqual(
    per.get('k1').uren.map((u) => u.uren),
    [2],
  );
  assert.deepEqual(
    per.get('k2').jobCosts.map((k) => k.id),
    ['j4'],
  );
});

test('per klant: materiaal op inkoopprijs + inkopen; uren tellen niet; brutowinst op omzet excl. btw', () => {
  const per = F.verdeelPerKlant(['k1'], {
    ...sleutelRijen,
    jobCosts: [
      kost({ id: 'j1', klant: 'k1', mat: 'm1', amount: 200, aantal: 4, inkoop: 25 }), // inkoop 100
      kost({ id: 'j2', klant: 'k1', mat: 'm2', amount: 30 }), // geen inkoopprijs → verkoop
    ],
    projectKosten: [P.naarProjectKost({ id: 'i1', project_id: 'p1', aantal: 2, prijs_per: 35 })],
    uren: [{ werkbon_id: 'w1', uren: 7.5 }],
  });
  const b = per.get('k1');
  const o = P.bouwKostenOverzicht({ jobCosts: b.jobCosts, projectKosten: b.projectKosten, urenRegels: b.uren });
  const kosten = new Map([
    ['k1', { materiaal: o.materiaal.bedrag, inkopen: o.inkopen.bedrag, uren: o.uren.uren, totaal: o.totaal }],
  ]);
  assert.deepEqual(kosten.get('k1'), { materiaal: 130, inkopen: 70, uren: 7.5, totaal: 200 });

  const facturen = [factuur({ id: 'a', klant: 'k1', status: 'betaald', incl: 605, excl: 500 })];
  const [rij] = F.klantRijen([{ id: 'k1', name: ' Jansen ', city: 'Utrecht' }], facturen, kosten);
  assert.equal(rij.naam, 'Jansen');
  assert.equal(rij.profit, 300);
  assert.equal(rij.margin, 60);
  assert.equal(rij.paid, 605);
});

test('per klant: zonder omzet marge 0 en negatieve winst; kosten onderweg = 0', () => {
  const kosten = new Map([['k1', { materiaal: 50, inkopen: 0, uren: 0, totaal: 50 }]]);
  const [rij] = F.klantRijen([{ id: 'k1', name: null }], [], kosten);
  assert.deepEqual([rij.naam, rij.profit, rij.margin], ['Naamloos', -50, 0]);
  const [onderweg] = F.klantRijen([{ id: 'k1', name: 'X' }], [], null);
  assert.equal(onderweg.materiaal, 0);
});

test('totaalregel: som van de rijen op centen', () => {
  const rijen = F.klantRijen(
    [
      { id: 'k1', name: 'A' },
      { id: 'k2', name: 'B' },
    ],
    [
      factuur({ id: 'a', klant: 'k1', status: 'betaald', incl: 0.1, excl: 0.1 }),
      factuur({ id: 'b', klant: 'k2', status: 'verzonden', incl: 0.2, excl: 0.2 }),
    ],
    new Map(),
  );
  const t = F.totaalRij(rijen);
  assert.equal(t.total, 0.3);
  assert.equal(t.paid, 0.1);
  assert.equal(t.openstaand, 0.2);
  assert.equal(F.formatUrenAantal(12.5), '12,5 uur');
});

// ── Rechten en menu ─────────────────────────────────────────────────────────

test('route en menu: Financiën alleen met bedrijfsfinancien, geen pakketfeature', async () => {
  const R = await import('../src/lib/permissions.ts');
  assert.deepEqual(R.gateFor('/financien'), { permission: 'bedrijfsfinancien' });
  const menu = readFileSync(new URL('../app/(tabs)/menu.tsx', import.meta.url), 'utf8');
  assert.match(menu, /title: 'Financiën', sub: 'Financieel overzicht', route: '\/financien'/);
  const scherm = readFileSync(new URL('../app/(more)/financien.tsx', import.meta.url), 'utf8');
  assert.match(scherm, /<PermissionGate permission="bedrijfsfinancien" label="Financiën">/);
});
