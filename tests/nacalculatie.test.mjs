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
    meerwerkExcl: 0,
    meerwerkRegels: 0,
    meerwerkZonderBedrag: 0,
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

// ── Meerwerk met een bedrag (migratie 20261107170000) ─────────────────────
// Dezelfde scenario's als scripts/test-nacalculatie.mjs van het dashboard,
// met dezelfde verwachte getallen.
const ovz = (o = {}) => ({
  ...K.LEEG_OVERZICHT,
  materiaal: { ...K.LEEG_OVERZICHT.materiaal, bedrag: 300 },
  inkopen: { ...K.LEEG_OVERZICHT.inkopen, bedrag: 100 },
  arbeid: { ...K.LEEG_OVERZICHT.arbeid, bedrag: 425, uren: 10 },
  totaal: 825,
  ...o,
});
const rij = (x = {}) => ({
  aantal_offertes: 1, opdracht_excl: 2050, begrote_uren: 10, arbeid_kosten: 425, uren_zonder_kostprijs: 0,
  materiaal_kosten: 400, regels_zonder_calculatie: 0, ...x,
});

test('meerwerk: zonder meerwerk hetzelfde als ervoor', () => {
  const nc = K.bouwNacalculatie({ overzicht: ovz(), begroting: K.naarBegroting(rij()), gefactureerdExcl: 0 });
  assert.equal(nc.opbrengst.begroot, 2050);
  assert.equal(nc.resultaat.begroot, 2050 - 825);
  assert.equal(nc.nogTeFactureren, 2050);
  assert.equal(nc.voorlopig, true);
  assert.equal(nc.meerwerk.bedrag, 0);
});

test('meerwerk: oude database (geen meerwerkkolommen) geeft 0', () => {
  const b = K.naarBegroting(rij());
  assert.equal(b.meerwerkExcl, 0);
  assert.equal(b.meerwerkZonderBedrag, 0);
});

test('meerwerk telt mee in begrote opbrengst, resultaat en nog te factureren', () => {
  const b = K.naarBegroting(rij({ meerwerk_excl: 375, meerwerk_regels: 2, meerwerk_zonder_bedrag: 1 }));
  const nc = K.bouwNacalculatie({ overzicht: ovz(), begroting: b, gefactureerdExcl: 2050 });
  assert.equal(nc.opbrengst.begroot, 2425);
  assert.equal(nc.opbrengst.opdracht, 2050);
  assert.equal(nc.opbrengst.meerwerk, 375);
  assert.equal(nc.kosten.begroot, 825, 'meerwerk heeft geen begrote kosten');
  assert.equal(nc.resultaat.begroot, 2425 - 825);
  assert.equal(nc.nogTeFactureren, 375, 'opdracht gefactureerd, meerwerk nog niet');
  assert.equal(nc.voorlopig, true);
  assert.equal(nc.meerwerk.zonderBedrag, 1);
  const klaar = K.bouwNacalculatie({ overzicht: ovz(), begroting: b, gefactureerdExcl: 2425 });
  assert.equal(klaar.nogTeFactureren, 0);
  assert.equal(klaar.voorlopig, false);
});

test('alleen meerwerk, geen offerte: opbrengst wel, begrote kosten leeg (niet € 0)', () => {
  const b = K.naarBegroting(
    rij({ aantal_offertes: 0, opdracht_excl: 0, arbeid_kosten: 0, materiaal_kosten: 0, begrote_uren: 0, meerwerk_excl: 200, meerwerk_regels: 1 }),
  );
  const nc = K.bouwNacalculatie({ overzicht: ovz(), begroting: b, gefactureerdExcl: 0 });
  assert.equal(nc.heeftBegroting, false);
  assert.equal(nc.opbrengst.begroot, 200);
  assert.equal(nc.kosten.begroot, null);
  assert.equal(nc.arbeid.begroot, null);
  assert.equal(nc.arbeid.urenBegroot, null);
  assert.equal(nc.materiaal.begroot, null);
  assert.equal(nc.resultaat.begroot, null);
  assert.equal(nc.nogTeFactureren, 200);
  // Verschil bij de kosten blijft leeg (geen rode € 0-begroting).
  assert.equal(K.nacalculatieVerschil(nc.kosten.begroot, nc.kosten.werkelijk, true).soort, 'leeg');
});

test('meerwerk: begrotingen van meerdere projecten tellen op', () => {
  const som = K.telBegrotingenOp([
    K.naarBegroting(rij({ meerwerk_excl: 100, meerwerk_regels: 1 })),
    K.naarBegroting(rij({ opdracht_excl: 1000, meerwerk_excl: 50.5, meerwerk_regels: 2, meerwerk_zonder_bedrag: 1 })),
    null,
  ]);
  assert.equal(som.opdrachtExcl, 3050);
  assert.equal(som.meerwerkExcl, 150.5);
  assert.equal(som.meerwerkRegels, 3);
  assert.equal(som.meerwerkZonderBedrag, 1);
  assert.equal(K.bouwNacalculatie({ overzicht: ovz(), begroting: som }).opbrengst.begroot, 3200.5);
});

test('geen begroting: alles leeg; zonder factuur maar met kosten wel voorlopig', () => {
  const nc = K.bouwNacalculatie({ overzicht: ovz(), begroting: null, gefactureerdExcl: 500 });
  assert.equal(nc.opbrengst.begroot, null);
  assert.equal(nc.nogTeFactureren, 0);
  assert.equal(nc.voorlopig, false);
  // Nog niets gefactureerd, wel kosten: een tussenstand, niet rood.
  assert.equal(K.bouwNacalculatie({ overzicht: ovz(), begroting: null, gefactureerdExcl: 0 }).voorlopig, true);
  assert.equal(K.bouwNacalculatie({ overzicht: K.LEEG_OVERZICHT, begroting: null }).voorlopig, false);
});

test('meldingen: meerwerk zonder bedrag, alleen met projectbedragen', () => {
  const een = K.bouwNacalculatie({ overzicht: ovz(), begroting: K.naarBegroting(rij({ meerwerk_zonder_bedrag: 1 })) });
  const m = K.nacalculatieMeldingen(een, { magBedragen: true, fmt });
  assert.ok(m.some((x) => x.letOp && x.tekst === '1 meerwerkregel heeft nog geen bedrag en telt niet mee in de opbrengst. Vul het bedrag in bij het meerwerk op de werkbon.'));
  const twee = K.bouwNacalculatie({ overzicht: ovz(), begroting: K.naarBegroting(rij({ meerwerk_zonder_bedrag: 2 })) });
  assert.ok(K.nacalculatieMeldingen(twee, { magBedragen: true, fmt }).some((x) => x.tekst.startsWith('2 meerwerkregels hebben nog geen bedrag en tellen niet mee')));
  assert.ok(!K.nacalculatieMeldingen(twee, { magBedragen: false, fmt }).some((x) => /meerwerk/.test(x.tekst)));
  // Volgorde zoals het dashboard: vóór "Nog te factureren".
  const tekst = K.nacalculatieMeldingen(een, { magBedragen: true, fmt }).map((x) => x.tekst);
  assert.ok(tekst.findIndex((x) => x.startsWith('1 meerwerkregel')) < tekst.findIndex((x) => x.startsWith('Nog te factureren')));
});

test('meerwerkbedrag: invoer zoals het dashboard (zetMeerwerkPrijs)', async () => {
  const M = await import('../src/lib/meerwerkPrijs.ts');
  assert.deepEqual(M.leesMeerwerkInvoer('', ''), { leeg: true });
  assert.deepEqual(M.leesMeerwerkInvoer('1.250', ''), { bedragExcl: 1250, uren: null });
  assert.deepEqual(M.leesMeerwerkInvoer('99,999', '2,5'), { bedragExcl: 100, uren: 2.5 });
  assert.deepEqual(M.leesMeerwerkInvoer('', '1,5'), { bedragExcl: null, uren: 1.5 });
  assert.deepEqual(M.leesMeerwerkInvoer('-5', ''), { fout: 'Vul een geldig bedrag in.' });
  assert.deepEqual(M.leesMeerwerkInvoer('abc', ''), { fout: 'Vul een geldig bedrag in.' });
  assert.deepEqual(M.leesMeerwerkInvoer('10', 'x'), { fout: 'Vul een geldig aantal uren in.' });
  assert.equal(M.meerwerkTotaal([{ taakId: 'a', bedragExcl: 100.1, uren: null }, { taakId: 'b', bedragExcl: null, uren: 2 }, { taakId: 'c', bedragExcl: 0.2, uren: null }]), 100.3);
  assert.deepEqual(M.naarMeerwerkPrijs({ werkbon_taak_id: 't1', bedrag_excl: '12.50', uren: null }), { taakId: 't1', bedragExcl: 12.5, uren: null });
  assert.equal(M.naarInvoer(12.5), '12,5');
  assert.equal(M.naarInvoer(null), '');
});

test('werkbon-PDF en ondertekenen lezen het meerwerkbedrag nooit', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const pdfMap = new URL('../src/lib/pdf/', import.meta.url);
  for (const f of readdirSync(pdfMap)) {
    if (!/\.(ts|tsx|js|mjs)$/.test(f)) continue;
    assert.doesNotMatch(readFileSync(new URL(f, pdfMap), 'utf8'), /werkbon_meerwerk_prijs|meerwerkPrijs/i, f);
  }
  const onderteken = readFileSync(new URL('../src/services/werkbonOndertekenenService.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(onderteken, /werkbon_meerwerk_prijs|meerwerkPrijs/i);
});

test('gelijk aan lib/nacalculatie.js van het dashboard (zelfde scenario\'s)', async (t) => {
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  if (!existsSync(join(lader.repo, 'src/lib/nacalculatie.js'))) return t.skip('dashboard zonder lib/nacalculatie.js (vóór migratie 20261107170000)');
  const D = await lader.importeer('src/lib/nacalculatie.js');
  const rijen = [
    rij(),
    rij({ meerwerk_excl: 375, meerwerk_regels: 2, meerwerk_zonder_bedrag: 1 }),
    rij({ aantal_offertes: 0, opdracht_excl: 0, arbeid_kosten: 0, materiaal_kosten: 0, begrote_uren: 0, meerwerk_excl: 200, meerwerk_regels: 1 }),
    rij({ uren_zonder_kostprijs: 2.5, regels_zonder_calculatie: 3 }),
    rij({ aantal_offertes: 0, opdracht_excl: 0, meerwerk_excl: 0, meerwerk_zonder_bedrag: 2 }),
  ];
  for (const r of rijen) {
    assert.deepEqual(K.naarBegroting(r), D.naarBegroting(r));
    for (const gef of [0, 500, 2050, 2425, 5000]) {
      for (const o of [ovz(), K.LEEG_OVERZICHT]) {
        assert.deepEqual(
          K.bouwNacalculatie({ overzicht: o, begroting: K.naarBegroting(r), gefactureerdExcl: gef }),
          D.bouwNacalculatie({ overzicht: o, begroting: D.naarBegroting(r), gefactureerdExcl: gef }),
          JSON.stringify({ r, gef }),
        );
      }
    }
  }
  for (const gef of [0, 500]) {
    assert.deepEqual(
      K.bouwNacalculatie({ overzicht: ovz(), begroting: null, gefactureerdExcl: gef }),
      D.bouwNacalculatie({ overzicht: ovz(), begroting: null, gefactureerdExcl: gef }),
    );
  }
  const lijst = [K.naarBegroting(rij({ meerwerk_excl: 100 })), K.naarBegroting(rij({ opdracht_excl: 1000, meerwerk_excl: 50.5 })), null];
  assert.deepEqual(K.telBegrotingenOp(lijst), D.telBegrotingenOp(lijst));
});

test('gelijk aan bouwNacalculatie van het dashboard', async (t) => {
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  const O = await lader.importeer('src/services/kostenOverzichtService.js');
  if (!O.bouwNacalculatie) return t.skip('dashboard zonder nacalculatie (vóór migratie 20261107143517)');
  const { existsSync } = await import('node:fs');
  if (!existsSync(`${lader.repo}/src/lib/nacalculatie.js`)) return t.skip('dashboard zonder meerwerk in de begroting (vóór migratie 20261107170000)');
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
