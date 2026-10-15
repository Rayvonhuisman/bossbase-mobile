/**
 * Offertes, facturen en kosten: de pure logica achter lijsten, KPI's,
 * nummering, totalen en de kostenpagina. Zelfde regels als het dashboard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const D = await import('../src/lib/documentLogica.ts');
const K = await import('../src/lib/kostenLogica.ts');

// ── Statussen ──────────────────────────────────────────────────────────────

test('statussen: tonen en labels zoals statusColors.js', () => {
  assert.deepEqual(D.offerteStatusInfo('concept'), { toon: 'gray', label: 'Concept' });
  assert.deepEqual(D.offerteStatusInfo('Verstuurd'), { toon: 'blue', label: 'Verzonden' });
  assert.deepEqual(D.offerteStatusInfo('geaccepteerd'), { toon: 'green', label: 'Geaccepteerd' });
  assert.deepEqual(D.offerteStatusInfo('afgewezen'), { toon: 'red', label: 'Afgewezen' });
  assert.deepEqual(D.factuurStatusInfo('aangemaakt'), { toon: 'gray', label: 'Concept' });
  assert.deepEqual(D.factuurStatusInfo('verlopen'), { toon: 'red', label: 'Te laat' });
  assert.deepEqual(D.factuurStatusInfo('geboekt'), { toon: 'purple', label: 'Uit SnelStart' });
  assert.deepEqual(D.factuurStatusInfo('in-behandeling'), { toon: 'gray', label: 'In-behandeling' });
});

// ── Offertes ───────────────────────────────────────────────────────────────

const offertes = [
  { nummer: 'BB-001', omschrijving: 'Dak', status: 'concept', totaal_incl: 100, customer: { name: 'Jansen' } },
  { nummer: 'BB-002', omschrijving: 'Goot', status: 'verzonden', totaal_incl: 200, customer: { name: 'Pietersen' } },
  { nummer: 'BB-003', omschrijving: 'Schuur', status: 'geaccepteerd', totaal_incl: 300.105, customer: null },
  { nummer: 'BB-004', omschrijving: null, status: 'geaccepteerd', totaal_incl: 50, customer: { name: 'Jansen' } },
  { nummer: 'BB-005', omschrijving: 'Kozijn', status: 'afgewezen', totaal_incl: 10, customer: { name: 'De Vries' } },
];

test('offertes: KPI-tegels', () => {
  assert.deepEqual(D.offerteKpis(offertes), {
    totaal: 5,
    concept: 1,
    verzonden: 1,
    geaccepteerd: 2,
    geaccepteerdBedrag: 350.11,
  });
});

test('offertes: filtertabs exact op status, zoeken op nummer/omschrijving/klant', () => {
  assert.equal(D.filterOffertes(offertes, { filter: 'geaccepteerd', zoek: '' }).length, 2);
  assert.equal(D.filterOffertes(offertes, { filter: 'alle', zoek: 'jansen' }).length, 2);
  assert.equal(D.filterOffertes(offertes, { filter: 'alle', zoek: 'GOOT' })[0].nummer, 'BB-002');
  assert.equal(D.filterOffertes(offertes, { filter: 'concept', zoek: 'bb-00' }).length, 1);
  assert.deepEqual(D.telOfferteFilters(offertes), {
    alle: 5,
    concept: 1,
    verzonden: 1,
    geaccepteerd: 2,
    afgewezen: 1,
  });
});

// ── Facturen ───────────────────────────────────────────────────────────────

const VANDAAG = '2026-10-13';
const f = (x) => ({
  nummer: 'BB-F001',
  status: 'verzonden',
  vervaldatum: null,
  totaal_incl: 0,
  betaald_op: null,
  is_credit: false,
  gecrediteerd: false,
  customer: null,
  ...x,
});
const facturen = [
  f({ nummer: 'BB-F001', status: 'betaald', totaal_incl: 121, betaald_op: '2026-10-02', vervaldatum: '2026-09-01' }),
  f({ nummer: 'BB-F002', status: 'verzonden', totaal_incl: 242, vervaldatum: '2026-10-20', customer: { name: 'Bakker' } }),
  f({ nummer: 'BB-F003', status: 'verzonden', totaal_incl: 50, vervaldatum: '2026-10-12' }),
  f({ nummer: 'BB-F004', status: 'concept', totaal_incl: 10, vervaldatum: '2026-11-01' }),
  f({ nummer: 'BB-F005', status: 'geboekt', totaal_incl: 100, vervaldatum: '2026-10-13' }),
  f({ nummer: 'BB-CF001', status: 'verzonden', totaal_incl: -121, is_credit: true, vervaldatum: null }),
  f({ nummer: 'BB-F006', status: 'betaald', totaal_incl: 121, gecrediteerd: true, betaald_op: '2026-09-30' }),
  f({ nummer: 'BB-F007', status: 'aangemaakt', totaal_incl: 5, vervaldatum: '2026-01-01' }),
];

test('facturen: te laat = verstuurd, niet gecrediteerd, geen creditnota, vervaldatum vóór vandaag (dashboard H9)', () => {
  assert.equal(D.isFactuurVerlopen(facturen[2], VANDAAG), true);
  assert.equal(D.isFactuurVerlopen(facturen[4], VANDAAG), false, 'vandaag zelf is nog niet te laat');
  assert.equal(D.isFactuurVerlopen(facturen[0], VANDAAG), false, 'betaald is nooit te laat');
  assert.equal(D.isFactuurVerlopen(facturen[7], VANDAAG), false, 'een concept is nooit verstuurd, dus nooit te laat');
  assert.equal(D.isFactuurVerlopen({ ...facturen[2], gecrediteerd: true }, VANDAAG), false, 'gecrediteerd is niet meer verschuldigd');
  assert.equal(D.factuurWeergaveStatus(facturen[2], VANDAAG), 'verlopen');
  assert.equal(D.factuurWeergaveStatus(facturen[1], VANDAAG), 'verzonden');
});

test('facturen: KPI-tegels zoals FacturenPage (openstaand na eigen creditnota, nooit onder 0)', () => {
  assert.deepEqual(D.factuurKpis(facturen, VANDAAG), {
    totaal: 8,
    // BB-F002 (242) en BB-F005 (100, vervalt vandaag); de losse creditnota telt niet.
    openstaand: 242 + 100,
    betaaldDezeMaand: 121,
    verlopen: 1,
  });
  // Gedeeltelijk gecrediteerd: €127,35 − €119,79 = €7,56 blijft openstaan.
  const deel = [
    f({ id: 'a', nummer: 'BB-F010', status: 'verzonden', totaal_incl: 127.35, vervaldatum: '2026-12-01' }),
    f({ id: 'b', nummer: 'BB-CF010', status: 'verzonden', totaal_incl: -119.79, is_credit: true, credit_van_factuur_id: 'a' }),
  ];
  assert.equal(D.factuurKpis(deel, VANDAAG).openstaand, 7.56);
});

test('facturen: filtertabs en zoeken', () => {
  const tel = D.telFactuurFilters(facturen, VANDAAG);
  // BB-F007 ('aangemaakt', vervaldatum voorbij) is een concept, niet verlopen.
  assert.deepEqual(tel, { alle: 8, concept: 2, verzonden: 2, betaald: 2, verlopen: 1, gecrediteerd: 2 });
  assert.equal(D.filterFacturen(facturen, { filter: 'alle', zoek: 'bakker', vandaag: VANDAAG }).length, 1);
  assert.equal(D.filterFacturen(facturen, { filter: 'gecrediteerd', zoek: 'cf', vandaag: VANDAAG }).length, 1);
});

test('crediteren mag alleen bij verzonden/betaald, niet gecrediteerd, geen credit, geen import', () => {
  const basis = { status: 'verzonden', gecrediteerd: false, is_credit: false, externe_referentie: null };
  assert.equal(D.magCrediteren(basis), true);
  assert.equal(D.magCrediteren({ ...basis, status: 'concept' }), false);
  assert.equal(D.magCrediteren({ ...basis, gecrediteerd: true }), false);
  assert.equal(D.magCrediteren({ ...basis, is_credit: true }), false);
  assert.equal(D.magCrediteren({ ...basis, externe_referentie: 'snelstart_1' }), false);
});

// ── Nummering ──────────────────────────────────────────────────────────────

test('nummering: BB-001, BB-F001, BB-CF001 — hoogste + 1, reeksen los van elkaar', () => {
  assert.equal(D.volgendNummer([], 'offerte'), 'BB-001');
  assert.equal(D.volgendNummer([], 'factuur'), 'BB-F001');
  assert.equal(D.volgendNummer([], 'credit'), 'BB-CF001');
  const alles = ['BB-001', 'BB-005-v2', 'BB-003', 'BB-F009', 'BB-F010', 'BB-CF002', null, 'X-99'];
  assert.equal(D.volgendNummer(alles, 'offerte'), 'BB-006');
  assert.equal(D.volgendNummer(alles, 'factuur'), 'BB-F011');
  assert.equal(D.volgendNummer(alles, 'credit'), 'BB-CF003');
  assert.equal(D.volgendNummer(['BB-999'], 'offerte'), 'BB-1000');
});

// ── Totalen ────────────────────────────────────────────────────────────────

test('documenttotalen: btw per tarief afgerond, verlegd/vrijgesteld zonder btw', () => {
  const t = D.documentTotalen([
    { bedrag: 100.05, btwPct: 21, btwRegime: 'normaal' },
    { bedrag: 33.33, btwPct: 21, btwRegime: 'normaal' },
    { bedrag: 50, btwPct: 9, btwRegime: 'verlaagd' },
    { bedrag: 200, btwPct: 21, btwRegime: 'verlegd' },
    { bedrag: 10, btwPct: null },
  ]);
  assert.equal(t.excl, 393.38);
  // 21%: (100.05 + 33.33 + 10) × 0,21 = 30,1098 → per regel cumulatief afgerond
  assert.deepEqual(t.btwPerTarief, [
    { pct: 21, bedrag: 30.11 },
    { pct: 9, bedrag: 4.5 },
  ]);
  assert.equal(t.incl, 427.99);
});

test('creditfactuur: negatieve totalen en regels, regime leidend', () => {
  const c = D.bouwCreditFactuur([
    { type: 'uren', omschrijving: 'Werk', aantal: 2, eenheidsprijs: 50, regelprijs: 100, btw_pct: 21, btw_regime: 'normaal' },
    { type: null, omschrijving: 'Materiaal', aantal: 1, eenheidsprijs: 40, regelprijs: 40, btw_pct: 9, btw_regime: null },
    { type: 'vast', omschrijving: 'Verlegd', aantal: 1, eenheidsprijs: 60, regelprijs: 60, btw_pct: 0, btw_regime: 'verlegd' },
  ]);
  assert.equal(c.totaal_excl, -200);
  assert.equal(c.totaal_incl, -(200 + 21 + 3.6));
  assert.equal(c.regels[0].eenheidsprijs, -50);
  assert.equal(c.regels[0].regelprijs, -100);
  assert.equal(c.regels[0].aantal, 2);
  assert.equal(c.regels[1].btw_regime, 'verlaagd');
  assert.equal(c.regels[1].type, 'stuks');
  assert.equal(c.regels[2].volgorde, 2);
});

// ── Afdrukweergave ─────────────────────────────────────────────────────────

// ── Kosten ─────────────────────────────────────────────────────────────────

const kost = (x) =>
  K.rijUitJobCost({
    id: x.id,
    category: x.cat ?? 'Materiaal',
    description: x.desc ?? 'Post',
    amount: x.amt,
    btw_percentage: x.pct ?? 21,
    cost_date: x.datum ?? '2026-10-05',
    customer_id: x.klant ?? null,
    klant_type: x.klantType ?? 'klant',
    leverancier_id: x.lev === undefined ? 'lev1' : x.lev,
    werkbon_materiaal_id: x.wbm ?? null,
    externe_referentie: x.ref ?? null,
    bijlage_url: null,
    deals: x.dealKlant ? { customer_id: x.dealKlant } : null,
  });

const kosten = [
  kost({ id: 'k1', cat: 'Materiaal', amt: 100 }),
  kost({ id: 'k2', cat: 'reiskosten', amt: 20.005, klant: 'c1' }),
  kost({ id: 'k3', cat: 'Arbeid', amt: 0 }),
  kost({ id: 'k4', cat: 'Gereedschap', amt: 50, lev: null }),
  kost({ id: 'k5', cat: 'Materiaal', amt: 30, wbm: 'm1', lev: null, dealKlant: 'c1' }),
  kost({ id: 'k6', cat: 'Inkoopfactuur', amt: 70, ref: 'snelstart_9_1', klant: 'c2' }),
];
const inkopen = [
  K.rijUitWerkbonInkoop({ id: 'i1', naam: 'Steiger', aantal: 2, prijs_per: 12.5, bedrag: null, datum: '2026-10-09', leverancier_id: null, werkbonnen: { customer_id: 'c1' } }),
];

test('kosten: groepen tellen op tot het totaal; onbekend → overig', () => {
  assert.equal(K.kostenGroepVan('MATERIAAL'), 'materiaal');
  assert.equal(K.kostenGroepVan('brandstof'), 'reiskosten');
  assert.equal(K.kostenGroepVan('Inkopen'), 'overig');
  const g = K.kostenPerGroep(kosten);
  assert.deepEqual(g, { materiaal: 130, arbeid: 0, reiskosten: 20.01, overig: 120 });
});

test('kosten: geboekte weergave sluit werkbonmateriaal uit, tegels in dashboardvolgorde', () => {
  const p = K.bouwKostenPagina({ kosten, inkopen, weergave: 'kosten', filterKlant: null, filterCat: null });
  assert.deepEqual(p.regels.map((r) => r.id), ['k1', 'k2', 'k3', 'k4', 'k6']);
  assert.equal(p.totaal, 240.01);
  assert.deepEqual(p.tegels.map((t) => t.label), [
    'Geboekte kosten',
    'Materiaalkosten',
    'Reiskosten',
    'Overige kosten',
  ]);
  const som = p.tegels.slice(1).reduce((s, t) => s + t.bedrag, 0);
  assert.equal(Math.round(som * 100) / 100, p.totaal);
  assert.equal(p.zonderLeverancier, 1, 'k4; werkbonmateriaal telt niet');
  assert.deepEqual(p.categorieen, ['Materiaal', 'reiskosten', 'Arbeid', 'Gereedschap', 'Inkoopfactuur']);
});

test('kosten: werkbonweergave = materiaal + inkopen, nieuwste eerst, nooit opgeteld met boekingen', () => {
  const p = K.bouwKostenPagina({ kosten, inkopen, weergave: 'materiaal', filterKlant: null, filterCat: null });
  assert.deepEqual(p.regels.map((r) => r.id), ['i1', 'k5']);
  assert.equal(p.totaal, 55);
  assert.equal(p.tegels[0].label, 'Kosten op werkbonnen');
  assert.equal(inkopen[0].bedrag, 25, 'bedrag = aantal × prijs als de kolom leeg is');
  assert.equal(inkopen[0].btwPct, null);
});

test('kosten: klantfilter gebruikt customer_id met deal als terugval; categoriefilter exact', () => {
  const p = K.bouwKostenPagina({ kosten, inkopen, weergave: 'materiaal', filterKlant: 'c1', filterCat: null });
  assert.deepEqual(p.regels.map((r) => r.id), ['i1', 'k5']);
  const q = K.bouwKostenPagina({ kosten, inkopen, weergave: 'kosten', filterKlant: null, filterCat: 'Materiaal' });
  assert.deepEqual(q.regels.map((r) => r.id), ['k1']);
  assert.equal(K.legeKostenTekst('kosten', 'Oktober 2026', true), 'Geen kosten in Oktober 2026 bij dit filter.');
});

test('kosten: arbeidstegel alleen als er arbeidskosten zijn', () => {
  const met = [kost({ id: 'a', cat: 'uren', amt: 40 })];
  const p = K.bouwKostenPagina({ kosten: met, inkopen: [], weergave: 'kosten', filterKlant: null, filterCat: null });
  assert.ok(p.tegels.some((t) => t.label === 'Arbeidskosten'));
});

test('kosten: btw-berekening en bron', () => {
  assert.deepEqual(K.calcBtw(100, 21, 'excl'), { excl: 100, btw: 21, incl: 121 });
  assert.deepEqual(K.calcBtw(121, 21, 'incl'), { excl: 100, btw: 21, incl: 121 });
  assert.deepEqual(K.calcBtw(10, 9, 'incl'), { excl: 9.17, btw: 0.83, incl: 10 });
  assert.equal(K.kostenBron('snelstart_1_2'), 'snelstart');
  assert.equal(K.kostenBron('purchase_123'), 'moneybird');
  assert.equal(K.kostenBron(null), 'handmatig');
  assert.deepEqual(K.categorieMeta('INKOOPFACTUUR'), { label: 'Inkoopfactuur', toon: 'purple' });
  assert.deepEqual(K.categorieMeta('gereedschap'), { label: 'Gereedschap', toon: 'gray' });
});

test('periode: week (ma–zo), maand, kwartaal, jaar met bladeren', () => {
  const dag = new Date(2026, 9, 13); // di 13 oktober 2026
  assert.deepEqual(K.periodeRange('maand', 0, dag), { start: '2026-10-01', eind: '2026-10-31', label: 'Oktober 2026' });
  assert.deepEqual(K.periodeRange('maand', -10, dag), { start: '2025-12-01', eind: '2025-12-31', label: 'December 2025' });
  assert.deepEqual(K.periodeRange('week', 0, dag), { start: '2026-10-12', eind: '2026-10-18', label: 'Week 42 · 12–18 okt 2026' });
  assert.equal(K.periodeRange('week', 3, dag).label, 'Week 45 · 2–8 nov 2026');
  assert.equal(K.periodeRange('week', 1, new Date(2026, 9, 27)).label, 'Week 45 · 2–8 nov 2026');
  assert.equal(K.periodeRange('week', 0, new Date(2026, 9, 28)).label, 'Week 44 · 26 okt – 1 nov 2026');
  assert.deepEqual(K.periodeRange('kwartaal', 1, dag), { start: '2027-01-01', eind: '2027-03-31', label: 'Q1 2027' });
  assert.deepEqual(K.periodeRange('jaar', -1, dag), { start: '2025-01-01', eind: '2025-12-31', label: '2025' });
});
