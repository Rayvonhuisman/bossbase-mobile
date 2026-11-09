/**
 * Calculatie in de offerte, materialen importeren en werkbon uit offerte:
 * dezelfde regels als het dashboard (src/lib/offerteCalculatie.js,
 * src/lib/materiaalImport.js, src/lib/werkbonUitOfferte.js).
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const calc = await import('../src/lib/offerteCalculatie.ts');
const imp = await import('../src/lib/materiaalImport.ts');
const wb = await import('../src/lib/werkbonUitOfferte.ts');

const regel = (o) => ({ omschrijving: 'x', type: 'vast', aantal: '1', prijs: '0', herkomst: null, ...o });

test('adviesprijs: marge is deel van de verkoopprijs, geen opslag', () => {
  assert.equal(calc.adviesPrijs(75, '25'), 100);
  assert.equal(calc.adviesPrijs(75, 25), 100);
  assert.equal(calc.adviesPrijs(0, 25), null);
  assert.equal(calc.adviesPrijs(75, '96'), null);
  assert.equal(calc.adviesPrijs(75, '-1'), null);
  assert.equal(calc.adviesPrijs(100, '0'), 100);
});

test('calculatie: uren-, km- en gewone regels zoals de database', () => {
  const rs = [
    regel({ id: 'a', omschrijving: 'Muren sauzen', aantal: '40', prijs: '13,86', calc: { urenPer: '0,2', kostprijsPer: '1,20' } }),
    regel({ id: 'b', type: 'uren', omschrijving: 'Voorbereiden', aantal: '3', prijs: '60,71' }),
    regel({ id: 'c', type: 'km', omschrijving: 'Reis', aantal: '20', prijs: '0,23', calc: { urenPer: '9', kostprijsPer: '9' } }),
    regel({ id: 'd', omschrijving: 'Nog niets', aantal: '1', prijs: '50' }),
  ];
  const c = calc.berekenCalculatie(rs, '42,50');
  assert.equal(c.uren, 11); // 40 × 0,2 + 3
  assert.equal(c.arbeid, 467.5);
  assert.equal(c.materiaal, 48);
  assert.equal(c.kostprijs, 515.5);
  assert.equal(c.verkoop, 554.4 + 182.13 + 4.6 + 50);
  assert.equal(c.regelsZonderCalculatie, 1);
  assert.equal(calc.berekenCalculatie(rs, '').zonderKostprijsPerUur, true);
});

test('kostprijs per eenheid en opslag van de calculatie', () => {
  assert.equal(calc.kostprijsPerEenheid(regel({ calc: { urenPer: '0,25', kostprijsPer: '1,5' } }), '40'), 11.5);
  assert.equal(calc.kostprijsPerEenheid(regel({ type: 'uren' }), '42,5'), 42.5);
  assert.equal(calc.kostprijsPerEenheid(regel({ type: 'km' }), '42,5'), null);
  assert.equal(calc.kostprijsPerEenheid(regel({}), '42,5'), null); // nog geen calculatie
  assert.equal(calc.kostprijsPerEenheid(regel({ calc: { urenPer: '2', kostprijsPer: '' } }), ''), null);

  const opslag = calc.calculatieVoorOpslag(
    [
      regel({ id: 'a', calc: { urenPer: '1.250', kostprijsPer: '0,5' } }),
      regel({ id: 'b' }), // niet aangeraakt: niet meesturen
      regel({ id: 'c', type: 'uren', calc: { urenPer: '3', kostprijsPer: '3' } }),
    ],
    (id) => `nieuw-${id}`,
  );
  assert.deepEqual(opslag, [
    { id: 'nieuw-a', uren_per: 1250, kostprijs_per: 0.5 },
    { id: 'nieuw-c', uren_per: null, kostprijs_per: null },
  ]);
});

test('CSV: scheidingsteken, kop herkennen, bedragen en btw', () => {
  const rijen = imp.leesCsv('﻿Artikelnr;Omschrijving;Eenheid;Netto prijs;Adviesprijs;BTW\nA1;"Kit, wit";stuks;€ 4,50;7,95;21%\nA2;Schroef;doos;12.5;;laag\n;Totaal;;;;\n');
  const kop = imp.vindKop(rijen);
  assert.deepEqual(kop, { kopIndex: 0, map: { artikelnummer: 0, naam: 1, eenheid: 2, inkoopprijs: 3, verkoopprijs: 4, btwPct: 5 } });
  const regels = imp.regelsUitRijen(rijen, kop.kopIndex, kop.map);
  assert.equal(regels.length, 2);
  assert.deepEqual(
    regels.map((r) => [r.naam, r.artikelnummer, r.eenheid, r.inkoopprijs, r.verkoopprijs, r.btwPct]),
    [
      ['Kit, wit', 'A1', 'stuk', 4.5, 7.95, 21],
      ['Schroef', 'A2', 'doos', 12.5, null, 9],
    ],
  );
  assert.equal(imp.leesBedrag('1.250'), 1250);
  assert.equal(imp.leesBedrag('1,250'), 1.25);
  assert.equal(imp.leesBedrag('1.234,56'), 1234.56);
  assert.equal(imp.metOpslag(10, 30), 13);
});

test('CSV-tekst: UTF-8, anders Windows-1252', () => {
  assert.equal(imp.csvTekstUitBytes(new Uint8Array([0x6d, 0xc2, 0xb2])), 'm²');
  assert.equal(imp.csvTekstUitBytes(new Uint8Array([0x6d, 0xb2, 0x80])), 'm²€');
});

test('dubbele materialen: artikelnummer wint, dubbel in bestand', () => {
  const bestaand = [{ id: 'm1', naam: 'Kit wit', artikelnummer: 'A1', inkoopprijs: 4.5, verkoopprijs: 7.95 }];
  const r = imp.koppelBestaand(
    [
      { naam: 'Andere naam', artikelnummer: 'a 1', eenheid: '', inkoopprijs: 4.5, verkoopprijs: 7.95, btwPct: 21 },
      { naam: 'Nieuw', artikelnummer: '', eenheid: '', inkoopprijs: 1, verkoopprijs: null, btwPct: 21 },
      { naam: 'nieuw', artikelnummer: '', eenheid: '', inkoopprijs: 2, verkoopprijs: null, btwPct: 21 },
    ],
    bestaand,
  );
  assert.equal(r[0].bestaand.id, 'm1');
  assert.equal(imp.wijzigtIets(r[0]), false);
  assert.equal(r[1].bestaand, null);
  assert.equal(r[2].dubbel, true);
});

test('soort bestand uit de bytes', () => {
  assert.equal(imp.soortVanBestand(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'x.csv', null), 'pdf');
  assert.equal(imp.soortVanBestand(new Uint8Array([0x41]), 'lijst.CSV', null), 'csv');
  assert.equal(imp.soortVanBestand(new Uint8Array([0x50, 0x4b]), 'lijst.xlsx', null), 'xlsx');
});

test('werkbon uit offerte: taken, arbeid, materiaal en wat er al staat', () => {
  const rij = (o) => ({ offerte_id: 'o1', offerte_nummer: 'BB-006', offerte_omschrijving: '', offerte_status: 'geaccepteerd', volgorde: 0, eenheid: null, aantal: 1, materiaal_id: null, ...o });
  const bron = wb.deelOfferteRegelsIn(
    [
      rij({ regel_id: 'r1', soort: 'taak', omschrijving: 'Woonkamer schilderen' }),
      rij({ regel_id: 'r2', soort: 'uren', omschrijving: 'Arbeid schilderwerk' }),
      rij({ regel_id: 'r3', soort: 'taak', omschrijving: 'Voorrijkosten' }),
      rij({ regel_id: 'r4', soort: 'materiaal', omschrijving: 'Verf', materiaal_id: 'm1' }),
      rij({ regel_id: 'r5', soort: 'km', omschrijving: 'Reis' }),
      rij({ regel_id: 'r6', soort: 'taak', omschrijving: 'woonkamer  schilderen' }),
    ],
    { taken: [{ omschrijving: 'Arbeid schilderwerk' }], materialen: [{ materiaal_id: 'm1' }] },
  );
  assert.equal(bron.length, 1);
  assert.deepEqual(bron[0].taken.map((t) => [t.id, t.standaard, t.alAanwezig]), [
    ['r1', true, false],
    ['r2', false, true],
    ['r3', false, false],
  ]);
  assert.deepEqual(wb.standaardTaakIds(bron[0]), ['r1']);
  assert.equal(bron[0].materialen[0].alAanwezig, true);
});
