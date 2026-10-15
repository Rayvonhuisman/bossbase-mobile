/**
 * Pure logica achter het werkbondetail: de invoer van de werkbon-PDF, het
 * kostenblok en het planningblok, naast de functies van het dashboard.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardLader } from './hulp/dashboardLader.mjs';

const W = await import('../src/lib/pdf/werkbonPdf.ts');
const K = await import('../src/lib/werkbonKosten.ts');
const L = await import('../src/lib/werkbonLogica.ts');
const lader = dashboardLader();

const rij = {
  id: 'wb-1',
  sign_token: 'tok',
  nummer: 'WB-7',
  titel: 'Dak',
  omschrijving: null,
  locatie: null,
  gepland_op: '2026-10-01',
  gestart_op: null,
  afgerond_op: '2026-10-02T10:00:00Z',
  ondertekend_op: null,
  ondertekend_door_naam: null,
  ondertekend_door_email: null,
  handtekening_url: null,
  verantwoordelijke_ids: ['b'],
  assigned_to_ids: ['a', 'b', 'c'],
  assigned_to: 'a',
};

test('PDF-werkbon: zelfde velden en terugvallen als toWerkbon + bouwPdfWerkbon', async (t) => {
  const team = [
    { id: 'a', full_name: 'Anna' },
    { id: 'b', full_name: 'Bo' },
    { id: 'c', full_name: null },
  ];
  const namen = W.uitvoerderNamen(rij, team);
  assert.deepEqual(namen, ['Bo', 'Anna']);
  const app = W.naarPdfWerkbon(rij, namen);
  assert.equal(app.omschrijving, '');
  assert.equal(app.gestartOp, undefined);
  assert.equal(app.handtekeningDataUrl, null);
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  globalThis.__bbSupabase = {};
  const S = await lader.importeer('src/services/werkbonOndertekenenService.js');
  // Het detail zoals toWerkbon het maakt (alleen de velden die bouwPdfWerkbon leest).
  const detail = {
    id: 'wb-1',
    signToken: 'tok',
    nummer: 'WB-7',
    titel: 'Dak',
    omschrijving: '',
    locatie: '',
    geplandOp: '2026-10-01',
    gestartOp: null,
    afgerondOp: '2026-10-02T10:00:00Z',
    ondertekendOp: null,
    ondertekendDoorNaam: '',
    ondertekendDoorEmail: '',
    handtekeningUrl: null,
  };
  assert.deepEqual(JSON.parse(JSON.stringify(app)), JSON.parse(JSON.stringify(S.bouwPdfWerkbon(detail, { uitvoerders: namen }))));
  assert.deepEqual(Object.keys(app).sort(), Object.keys(S.bouwPdfWerkbon(detail, { uitvoerders: namen })).sort());
});

test('PDF-zeef: geen bedragen, geen interne notities, geen open taken', () => {
  const d = W.bouwPdfData({
    taken: [
      { omschrijving: 'klaar', afgerond: true, isMeerwerk: false },
      { omschrijving: 'open', afgerond: false, isMeerwerk: false },
    ],
    meerwerk: [
      { omschrijving: 'extra', afgerond: true, isMeerwerk: true },
      { omschrijving: 'extra open', afgerond: false, isMeerwerk: true },
    ],
    materialen: [{ naam: 'Lood', eenheid: 'kg', aantal: 2, prijs_per: 10, subtotaal: 20, inkoopprijs_per: 5 }],
    notities: [
      { note: 'intern', voor_klant: false },
      { note: 'klant', voor_klant: true },
      { note: 'houtrot', voor_klant: true, gevolg: 'lek', waarschuwing_verzonden_op: '2026-10-01T00:00:00Z' },
    ],
    uren: [],
    fotos: [],
  });
  assert.deepEqual(d.taken, [{ omschrijving: 'klaar', afgerond: true }]);
  assert.deepEqual(d.meerwerk, [{ omschrijving: 'extra' }]);
  assert.deepEqual(d.materialen, [{ naam: 'Lood', eenheid: 'kg', aantal: 2 }]);
  assert.deepEqual(d.notities, [{ note: 'klant' }]);
  assert.equal(d.waarschuwingen.length, 1);
  assert.equal(W.werkbonBestandsnaam(''), 'Werkbon-concept.pdf');
});

test('kostenblok gelijk aan bouwKostenOverzicht van het dashboard', async (t) => {
  const rijen = [
    { werkbon_materiaal_id: 'm1', amount: 50, werkbon_materialen: { aantal: 2, werkbon_materiaal_inkoop: [{ inkoopprijs_per: 12.5 }] } },
    { werkbon_materiaal_id: 'm2', amount: 30, werkbon_materialen: { aantal: 1, werkbon_materiaal_inkoop: null } },
    { werkbon_materiaal_id: null, amount: 99.99 },
  ];
  const inkopen = [K.naarInkoop({ id: 'i1', naam: 'Steiger', aantal: 2, prijs_per: 45.5, bedrag: null })];
  const uren = [{ uren: 3.5, reis_km: 12 }, { uren: 1.25, reis_km: null }];
  const app = K.bouwKostenOverzicht({ jobCosts: rijen.map(K.naarKostBron), inkopen, uren });
  assert.equal(app.totaal, 25 + 30 + 91);
  assert.deepEqual(app.boekingen, { aantal: 1, bedrag: 99.99 });
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  const O = await lader.importeer('src/services/kostenOverzichtService.js');
  const J = await lader.importeer('src/services/jobCostService.js');
  const dashKosten = rijen.map((r) => ({
    ...J.toJobCost(r),
    materiaalAantal: r.werkbon_materialen?.aantal ?? null,
    inkoopprijsPer: r.werkbon_materialen?.werkbon_materiaal_inkoop?.[0]?.inkoopprijs_per ?? null,
  }));
  const dash = O.bouwKostenOverzicht({ jobCosts: dashKosten, projectKosten: inkopen, urenRegels: uren });
  assert.equal(app.totaal, dash.totaal);
  assert.equal(app.materiaal.bedrag, dash.materiaal.bedrag);
  assert.equal(app.materiaal.zonderInkoopprijs, dash.materiaal.zonderInkoopprijs);
  assert.equal(app.inkopen.bedrag, dash.inkopen.bedrag);
  assert.equal(app.boekingen.bedrag, dash.boekingen.bedrag);
  assert.equal(app.boekingen.aantal, dash.boekingen.regels.length);
  assert.deepEqual(app.uren, { uren: dash.uren.uren, km: dash.uren.km });
});

test('kostenrechten: kosten + module om te zien, admin of projecten_bewerken om te bewerken', () => {
  const r = (role, rechten, features = ['kosten_nacalculatie'], readonly = false) =>
    K.kostenRechten({ role, can: (p) => role === 'admin' || rechten.includes(p), hasFeature: (f) => features.includes(f), readonly });
  assert.deepEqual(r('admin', []), { zien: true, bewerken: true, inkoop: true });
  assert.deepEqual(r('medewerker', ['kosten']), { zien: true, bewerken: false, inkoop: false });
  assert.deepEqual(r('medewerker', ['kosten', 'projecten_bewerken']), { zien: true, bewerken: true, inkoop: false });
  assert.equal(r('admin', [], []).zien, false);
  assert.equal(r('admin', [], ['kosten_nacalculatie'], true).bewerken, false);
});

// PlanningBlok.jsx is JSX en laadt niet in Node; de verwachte regels hieronder
// zijn met de hand nagerekend volgens planRegels() en busRegels() daarin.
test('planningblok: zelfde regels als planRegels en busRegels van het dashboard', () => {
  const appW = {
    id: 'w',
    starttijd: '08:00:00',
    eindtijd: '16:30:00',
    assigned_to_ids: ['a', 'b', 'x'],
    voertuig_ids: ['v1', 'v2'],
    werkbon_dagen: [
      {
        id: 'd2',
        datum: '2026-10-03',
        starttijd: null,
        eindtijd: null,
        medewerker_ids: ['a', 'b'],
        medewerker_tijden: { b: { starttijd: '10:00', eindtijd: '14:00' } },
        voertuig_ids: ['v1'],
        voertuig_tijden: { v1: { starttijd: '07:30', eindtijd: '17:00' } },
        medewerker_voertuig: { a: 'v1', b: 'v2' },
      },
      { id: 'd1', datum: '2026-10-02', starttijd: '09:00', eindtijd: '12:00', medewerker_ids: null, medewerker_tijden: null, voertuig_ids: null, voertuig_tijden: null, medewerker_voertuig: null },
    ],
  };
  const namen = { a: 'Anna', b: 'Bo' };
  const voertuigen = { v1: { naam: 'Bus 1', zitplaatsen: 3 }, v2: { naam: 'Bus 2', zitplaatsen: null } };
  const app = L.planRegels(appW, (p) => namen[p]);
  assert.deepEqual(
    app.map((r) => [r.datum, L.planTijd(r), r.wie.join(', ')]),
    [
      ['2026-10-02', '09:00–12:00', 'Anna, Bo'],
      ['2026-10-03', '08:00–16:30', 'Anna, Bo (10:00–14:00)'],
    ],
  );
  const bus = app.map((r) => L.busRegels(appW, r.dag, voertuigen, (p) => namen[p]).map((b) => b.tekst));
  assert.deepEqual(bus, [['Bus 1 · 09:00–12:00 · niemand erin · 0/3', 'Bus 2 · 09:00–12:00 · niemand erin'], ['Bus 1 · 07:30–17:00 · Anna · 1/3']]);
});
