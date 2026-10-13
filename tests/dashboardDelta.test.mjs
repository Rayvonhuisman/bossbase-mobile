/**
 * Dashboard a37a907 → origin/main (331250b): rechten, pakketten, projectbedragen,
 * werkbonregels, pipeline-tegel en de factuurvoettekst.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const P = await import('../src/lib/permissions.ts');
const B = await import('../src/lib/bedragen.ts');
const W = await import('../src/lib/werkbonRechten.ts');
const O = await import('../src/lib/overzichtCijfers.ts');
const H = await import('../src/lib/documentHtml.ts');
const D = await import('../src/lib/documentLogica.ts');
const L = await import('../src/lib/werkbonLogica.ts');

test('offerte- en factuurregels hangen op het recht, niet op de rol (20261002135952)', () => {
  for (const actie of ['maken', 'wijzigen', 'verwijderen']) {
    const o = P.actieGate('offerteRegels', actie);
    assert.equal(o.permission, 'offertes', actie);
    assert.equal(o.roles, undefined, actie);
    const f = P.actieGate('factuurRegels', actie);
    assert.equal(f.permission, 'facturen', actie);
    assert.equal(f.roles, undefined, actie);
  }
});

test('werkbon aanmaken: planning OF werkbonnen_bewerken, geen rolgate', () => {
  const g = P.actieGate('werkbonnen', 'maken');
  assert.equal(g.roles, undefined);
  assert.deepEqual([...g.eenVan].sort(), ['planning', 'werkbonnen_bewerken']);
});

test('nergens meer een planner-rol in de actiematrix', () => {
  for (const [mod, acties] of Object.entries(P.ACTIES)) {
    for (const [actie, gate] of Object.entries(acties)) {
      assert.ok(!(gate?.roles ?? []).includes('planner'), `${mod}.${actie}`);
    }
  }
});

test('alleen-lezen is echt alleen-lezen: elke actie blokkeert (20261003093416)', () => {
  for (const [mod, acties] of Object.entries(P.ACTIES)) {
    for (const [actie, gate] of Object.entries(acties)) {
      assert.equal(gate?.readonlyBlokkeert, true, `${mod}.${actie}`);
    }
  }
  assert.match(P.readonlyTekst('opgezegd').uitleg, /exporteren/);
  assert.match(P.readonlyTekst('onbekend').uitleg, /exporteren/);
});

test('idBatches: uniek, zonder lege waarden, in stukken van 500', () => {
  const ids = Array.from({ length: 1201 }, (_, i) => `id-${i}`);
  const b = B.idBatches([...ids, 'id-1', null, undefined, '']);
  assert.deepEqual(b.map((x) => x.length), [500, 500, 201]);
  assert.equal(B.idBatches([]).length, 0);
});

test('vulBedragen: bedrag uit de RPC, anders null (geen recht)', () => {
  const rijen = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const uit = B.vulBedragen(rijen, [{ id: 'a', project_value: '1250.50', geschatte_waarde: null }], B.PROJECT_BEDRAG_VELDEN);
  assert.deepEqual(uit[0], { id: 'a', name: 'A', project_value: 1250.5, geschatte_waarde: null });
  assert.deepEqual(uit[1], { id: 'b', name: 'B', project_value: null, geschatte_waarde: null });
  const m = B.vulBedragen([{ id: 'x' }], null, B.MATERIAAL_BEDRAG_VELDEN);
  assert.deepEqual(m[0], { id: 'x', prijs_per: null, subtotaal: null });
});

test('bedragkolommen staan niet in de selects (kolomrecht ingetrokken)', async () => {
  const { readFile } = await import('node:fs/promises');
  const proj = await readFile(new URL('../src/services/projectService.ts', import.meta.url), 'utf8');
  const kol = proj.slice(proj.indexOf('const PROJECT_COLUMNS'), proj.indexOf('`;', proj.indexOf('const PROJECT_COLUMNS')));
  assert.doesNotMatch(kol, /project_value|geschatte_waarde/);
  const wo = await readFile(new URL('../src/services/workOrderService.ts', import.meta.url), 'utf8');
  const mk = wo.slice(wo.indexOf('const MATERIAAL_KOLOMMEN'), wo.indexOf('`;', wo.indexOf('const MATERIAAL_KOLOMMEN')));
  assert.doesNotMatch(mk.replace("inkoopprijs_per", ""), /prijs_per|subtotaal/);
  const klant = await readFile(new URL('../src/services/customerService.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(klant, /'id, name, status, project_value/);
});

const rechten = (o = {}) => ({
  userId: 'u1', role: 'medewerker', can: () => false, gedeeldeWerkruimte: false, readonly: false, ...o,
});

test('werkbonregels: werkbonnen_bewerken, verantwoordelijke of werkruimte; planning niet', () => {
  const bon = { verantwoordelijke_ids: ['v1'], ondertekend_op: null };
  assert.equal(W.magWerkbonRegelsBeheren(bon, rechten()), false);
  assert.equal(W.magWerkbonRegelsBeheren(bon, rechten({ role: 'planner' })), false);
  assert.equal(W.magWerkbonRegelsBeheren(bon, rechten({ can: (p) => p === 'planning' })), false);
  assert.equal(W.magWerkbonRegelsBeheren(bon, rechten({ can: (p) => p === 'werkbonnen_bewerken' })), true);
  assert.equal(W.magWerkbonRegelsBeheren(bon, rechten({ userId: 'v1' })), true);
  assert.equal(W.magWerkbonRegelsBeheren(bon, rechten({ gedeeldeWerkruimte: true })), true);
  assert.equal(W.magWerkbonRegelsBeheren(bon, rechten({ role: 'admin' })), true);
  assert.equal(W.magWerkbonRegelsBeheren(bon, rechten({ role: 'admin', readonly: true })), false);
  assert.equal(W.magWerkbonRegelsBeheren({ ...bon, ondertekend_op: '2026-10-01' }, rechten({ role: 'admin' })), false);
});

test('open pipeline: voltooide projecten (afgerond_op) tellen niet mee', () => {
  const deals = [
    { status: 'open', stage_id: 's', expected_revenue: 100, final_revenue: null, afgerond_op: null },
    { status: 'open', stage_id: 's', expected_revenue: 50, final_revenue: null, afgerond_op: '2026-10-01T10:00:00Z' },
    { status: 'won', stage_id: 's', expected_revenue: 70, final_revenue: null },
  ];
  const w = O.pipelineWaarden(deals);
  assert.deepEqual(w.open, { aantal: 1, waarde: 100 });
  assert.deepEqual(w.geaccepteerd, { aantal: 1, waarde: 70 });
});

test('factuurvoettekst: IBAN, verlegd met btw-nummer, geen betaalverzoek op credit', () => {
  const t = H.factuurVoettekst({
    regimes: ['normaal', 'verlegd'], klantBtw: 'NL001234567B01', iban: 'nl91abna0417164300',
    ibanTnv: null, bedrijfsnaam: 'Bouw BV', vervaldatum: '2026-11-01', kenmerk: null, nummer: 'BB-F-0012',
  });
  assert.equal(t[0], 'Btw verlegd: de btw wordt afgedragen door de opdrachtgever (btw-nummer NL001234567B01).');
  assert.equal(t[1], 'Graag het totaalbedrag vóór 01-11-2026 overmaken op NL91 ABNA 0417 1643 00 t.n.v. Bouw BV, onder vermelding van BB-F-0012.');
  assert.deepEqual(H.factuurVoettekst({ regimes: [], isCredit: true, iban: 'NL91ABNA0417164300' }), []);
  assert.deepEqual(H.factuurVoettekst({ regimes: ['vrijgesteld'] }), ['Een deel van deze factuur is vrijgesteld van btw.']);
});

test('factuur-HTML toont de IBAN ge-escapet; snapshot wint, anders het huidige', () => {
  const bedrijf = D.bedrijfVoorDocument({ snapshot_iban: null }, { name: 'X', iban: 'NL91ABNA0417164300', iban_tnv: '<b>X</b>' });
  assert.equal(bedrijf.iban, 'NL91ABNA0417164300');
  assert.equal(D.bedrijfVoorDocument({ snapshot_iban: 'NL02RABO0123456789' }, { iban: 'NL91ABNA0417164300' }).iban, 'NL02RABO0123456789');
  const html = H.bouwDocumentHtml({
    soort: 'factuur', nummer: 'F1', datum: '2026-10-01', vervaldatum: null, bedrijf, klant: null,
    regels: [], totalen: { excl: 0, btwPerTarief: [], incl: 0 },
  });
  assert.match(html, /NL91 ABNA 0417 1643 00 t\.n\.v\. &lt;b&gt;X&lt;\/b&gt;/);
  const offerte = H.bouwDocumentHtml({
    soort: 'offerte', nummer: 'O1', datum: null, bedrijf, klant: null, regels: [], totalen: { excl: 0, btwPerTarief: [], incl: 0 },
  });
  assert.doesNotMatch(offerte, /overmaken/);
});

test('materiaaleenheden zoals het dashboard (8c7302b)', () => {
  for (const e of ['stuk', 'm³', 'kg', 'zak', 'bigbag']) assert.ok(L.EENHEDEN.includes(e), e);
});
