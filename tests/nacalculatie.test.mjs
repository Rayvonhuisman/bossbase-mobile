/**
 * De nacalculatie zoals het dashboard (kostenOverzichtService.js,
 * NacalculatieTabel.jsx, migratie 20261107143517): arbeid op de kostprijs per
 * uur die gold bij het boeken, de begroting uit de geaccepteerde offertes en
 * begroot tegenover werkelijk. Met de referentiegetallen van het dashboard.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardLader } from './hulp/dashboardLader.mjs';

const K = await import('../src/lib/projectKostenLogica.ts');
const W = await import('../src/lib/werkbonKosten.ts');
const J = await import('../src/lib/projectLogica.ts');
const lader = dashboardLader();

const fmt = (n) => `€ ${n}`;

// 4 × € 50 + 2 × € 40 + 3 uur zonder kostprijs.
const uren = [
  { uren: 4, reis_km: 10, kostprijsPerUur: 50 },
  { uren: 2, reis_km: null, kostprijsPerUur: 40 },
  { uren: 3, reis_km: 5, kostprijsPerUur: null },
];
const materiaal = {
  id: 'm1',
  description: 'Materiaal: Verf',
  amount: 140,
  cost_date: null,
  werkbon_materiaal_id: 'wm1',
  materiaalAantal: 5,
  inkoopprijsPer: 19,
};
const inkoop = K.naarProjectKost({ id: 'i1', aantal: 3, prijs_per: 40 });
const begrotingRij = {
  project_id: 'p1',
  aantal_offertes: 1,
  opdracht_excl: '2000',
  begrote_uren: '21',
  arbeid_kosten: '1092',
  uren_zonder_kostprijs: 0,
  materiaal_kosten: '180',
  regels_zonder_calculatie: 0,
};

test('arbeid: uren × kostprijs per uur; uren zonder kostprijs tellen als uur, niet in het bedrag', () => {
  assert.deepEqual(K.arbeidUitUren(uren), { uren: 9, km: 15, bedrag: 280, urenZonderKostprijs: 3 });
  assert.deepEqual(K.arbeidUitUren([]), { uren: 0, km: 0, bedrag: 0, urenZonderKostprijs: 0 });
});

test('kostprijs per uur uit de embed: object of lijst, zonder recht null', () => {
  assert.equal(K.kostprijsVanUurRij({ werkbon_uren_kostprijs: { kostprijs_per_uur: '42.50' } }), 42.5);
  assert.equal(K.kostprijsVanUurRij({ werkbon_uren_kostprijs: [{ kostprijs_per_uur: 30 }] }), 30);
  assert.equal(K.kostprijsVanUurRij({ werkbon_uren_kostprijs: null }), null);
  assert.equal(K.kostprijsVanUurRij({}), null);
  // Een kostprijs van € 0 is een kostprijs, geen ontbrekende.
  assert.equal(K.kostprijsVanUurRij({ werkbon_uren_kostprijs: { kostprijs_per_uur: 0 } }), 0);
});

test('kostenoverzicht: totaal = arbeid + materiaal + inkopen; boekingen tellen niet', () => {
  const boeking = { ...materiaal, id: 'b1', werkbon_materiaal_id: null, amount: 999 };
  const o = K.bouwKostenOverzicht({ jobCosts: [materiaal, boeking], projectKosten: [inkoop], urenRegels: uren });
  assert.equal(o.arbeid.bedrag, 280);
  assert.equal(o.arbeid.urenZonderKostprijs, 3);
  assert.equal(o.materiaal.bedrag, 95);
  assert.equal(o.inkopen.bedrag, 120);
  assert.equal(o.boekingen.bedrag, 999);
  assert.equal(o.totaal, 495);
  assert.equal('uren' in o, false);
});

test('werkbon rekent de arbeid met dezelfde regel als het project', () => {
  const w = W.bouwKostenOverzicht({
    jobCosts: [{ werkbonMateriaalId: 'wm1', amt: 140, materiaalAantal: 5, inkoopprijsPer: 19 }],
    inkopen: [{ bedrag: 120 }],
    uren,
  });
  assert.deepEqual(w.arbeid, K.arbeidUitUren(uren));
  assert.equal(w.totaal, 495);
});

test('begroting: rij van bb_project_begroting en optellen over projecten', () => {
  const b = K.naarBegroting(begrotingRij);
  assert.deepEqual(b, {
    aantalOffertes: 1,
    opdrachtExcl: 2000,
    uren: 21,
    arbeid: 1092,
    urenZonderKostprijs: 0,
    materiaal: 180,
    regelsZonderCalculatie: 0,
    totaal: 1272,
  });
  assert.equal(K.telBegrotingenOp([]), null);
  assert.equal(K.telBegrotingenOp([null, undefined]), null);
  const som = K.telBegrotingenOp([b, K.naarBegroting({ ...begrotingRij, opdracht_excl: 500.1, materiaal_kosten: 0.2 })]);
  assert.equal(som.aantalOffertes, 2);
  assert.equal(som.opdrachtExcl, 2500.1);
  assert.equal(som.totaal, 2364.2);
});

test('nacalculatie: begroot tegenover werkelijk (referentiegetallen dashboard)', () => {
  const overzicht = K.bouwKostenOverzicht({ jobCosts: [materiaal], projectKosten: [inkoop], urenRegels: uren });
  const nc = K.bouwNacalculatie({ overzicht, begroting: K.naarBegroting(begrotingRij), gefactureerdExcl: 1000 });
  assert.equal(nc.heeftBegroting, true);
  assert.equal(nc.arbeid.werkelijk, 280);
  assert.equal(nc.arbeid.urenWerkelijk, 9);
  assert.equal(nc.arbeid.urenBegroot, 21);
  assert.equal(nc.materiaal.werkelijk, 215);
  assert.equal(nc.kosten.begroot, 1272);
  assert.equal(nc.kosten.werkelijk, 495);
  assert.equal(nc.resultaat.begroot, 728);
  assert.equal(nc.resultaat.margeBegroot, 36.4);
  assert.equal(nc.resultaat.werkelijk, 505);
  assert.equal(nc.resultaat.margeWerkelijk, 50.5);
  assert.equal(nc.nogTeFactureren, 1000);
  assert.equal(nc.voorlopig, true);
  assert.equal(nc.onvolledig, true);
  // Alles gefactureerd: niet meer voorlopig.
  assert.equal(K.bouwNacalculatie({ overzicht, begroting: K.naarBegroting(begrotingRij), gefactureerdExcl: 2000 }).voorlopig, false);
});

test('nacalculatie zonder begroting: kolom Begroot leeg, geen nog-te-factureren', () => {
  const nc = K.bouwNacalculatie({ overzicht: K.LEEG_OVERZICHT, begroting: null, gefactureerdExcl: 0 });
  assert.equal(nc.heeftBegroting, false);
  assert.equal(nc.kosten.begroot, null);
  assert.equal(nc.resultaat.margeWerkelijk, null);
  assert.equal(nc.nogTeFactureren, 0);
});

test('verschil: kosten duurder = slecht, opbrengst hoger = goed, onder € 0,50 gelijk', () => {
  assert.deepEqual(K.nacalculatieVerschil(100, 150, true), { soort: 'slecht', bedrag: 50, teken: '+' });
  assert.deepEqual(K.nacalculatieVerschil(100, 80, true), { soort: 'goed', bedrag: 20, teken: '−' });
  assert.deepEqual(K.nacalculatieVerschil(100, 150, false), { soort: 'goed', bedrag: 50, teken: '+' });
  assert.equal(K.nacalculatieVerschil(100, 100.4, true).soort, 'gelijk');
  assert.equal(K.nacalculatieVerschil(null, 100, true).soort, 'leeg');
  assert.equal(K.nacalculatieVerschil(100, null, false).soort, 'leeg');
});

test('meldingen: uren zonder kostprijs, offerte zonder calculatie, nog te factureren', () => {
  const overzicht = K.bouwKostenOverzicht({ urenRegels: [{ uren: 1 }] });
  const b = K.naarBegroting({ ...begrotingRij, uren_zonder_kostprijs: 2.5, regels_zonder_calculatie: 3 });
  const nc = K.bouwNacalculatie({ overzicht, begroting: b, gefactureerdExcl: 0 });
  const m = K.nacalculatieMeldingen(nc, { magBedragen: true, isAdmin: true, fmt });
  assert.equal(m.length, 4);
  assert.match(m[0].tekst, /^1 uur op de werkbonnen heeft geen kostprijs per uur en telt niet mee in de arbeid\. Het resultaat is daardoor te hoog\. Stel de kostprijs per uur in/);
  assert.equal(m[0].letOp, true);
  assert.match(m[1].tekst, /^2,5 uur in de offerte zijn begroot zonder kostprijs per uur\./);
  assert.match(m[2].tekst, /^3 offerteregels hebben geen calculatie/);
  assert.equal(m[3].tekst.startsWith('Nog te factureren: € 2000 excl. btw.'), true);
  assert.equal(m[3].letOp, false);
  // Zonder projectbedragen geen opbrengst, dus ook geen nog-te-factureren; een
  // medewerker krijgt geen verwijzing naar de instellingen.
  const zonder = K.nacalculatieMeldingen(nc, { magBedragen: false, isAdmin: false, fmt });
  assert.equal(zonder.length, 3);
  assert.doesNotMatch(zonder[0].tekst, /Instellingen/);
  const geen = K.nacalculatieMeldingen(K.bouwNacalculatie({}), { fmt });
  assert.deepEqual(geen.map((x) => x.letOp), [false]);
  assert.match(geen[0].tekst, /^Nog geen geaccepteerde offerte bij dit project/);
});

test('begrote uren: herkomst en tabnaam zoals het dashboard', () => {
  assert.equal(J.urenBronUitleg('offertes', 12), 'Uit de geaccepteerde offertes');
  assert.equal(J.urenBronUitleg('offertes', 0), 'Komt uit de geaccepteerde offerte');
  assert.equal(J.urenBronUitleg('handmatig', 12), 'Met de hand ingesteld');
  assert.equal(J.PROJECT_TABS.find((t) => t.id === 'kosten')?.label, 'Nacalculatie');
});

test('gelijk aan bouwNacalculatie van het dashboard', async (t) => {
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  const O = await lader.importeer('src/services/kostenOverzichtService.js');
  if (!O.bouwNacalculatie) return t.skip('dashboard zonder nacalculatie (vóór migratie 20261107143517)');
  const dashOverzicht = O.bouwKostenOverzicht({
    jobCosts: [{ ...materiaal, amt: materiaal.amount, werkbonMateriaalId: materiaal.werkbon_materiaal_id }],
    projectKosten: [inkoop],
    urenRegels: uren,
  });
  const appOverzicht = K.bouwKostenOverzicht({ jobCosts: [materiaal], projectKosten: [inkoop], urenRegels: uren });
  assert.equal(appOverzicht.totaal, dashOverzicht.totaal);
  const { regels: _r, ...dashArbeid } = dashOverzicht.arbeid;
  assert.deepEqual(appOverzicht.arbeid, dashArbeid);
  const dashBegroting = (await (async () => {
    globalThis.__bbSupabase = { rpc: async () => ({ data: [begrotingRij], error: null }) };
    return O.getProjectBegrotingen(['p1']);
  })()).get('p1');
  assert.deepEqual(K.naarBegroting(begrotingRij), dashBegroting);
  const dash = O.bouwNacalculatie({ overzicht: dashOverzicht, begroting: dashBegroting, gefactureerdExcl: 1000 });
  const app = K.bouwNacalculatie({ overzicht: appOverzicht, begroting: K.naarBegroting(begrotingRij), gefactureerdExcl: 1000 });
  assert.deepEqual(app, dash);
});
