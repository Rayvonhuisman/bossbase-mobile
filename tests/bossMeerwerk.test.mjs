/** Meerwerk met Boss: rekenregel (gelijk aan de server), voorstel en koppeling. */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const R = await import('../src/lib/boss/meerwerkRegels.ts');

test('bedrag: uren × uurtarief + aantal × prijs, met opbouw', () => {
  const b = R.berekenBedrag({
    uren: 2,
    uurtarief: 55,
    materialen: [{ omschrijving: 'houtrot-vuller', aantal: 1, prijs_excl: 18.5 }],
  });
  assert.equal(b.bedrag, 128.5);
  assert.deepEqual(b.ontbreekt, []);
  assert.equal(b.opbouw.split('\n').length, 3);
});

test('bedrag: geen uurtarief of geen prijs = geen bedrag (Boss verzint niets)', () => {
  assert.equal(R.berekenBedrag({ uren: 2, uurtarief: null }).bedrag, null);
  assert.deepEqual(R.berekenBedrag({ uren: 2, uurtarief: null }).ontbreekt, ['uurtarief']);
  const b = R.berekenBedrag({ uren: 1, uurtarief: 50, materialen: [{ omschrijving: 'kit', aantal: 2, prijs_excl: null }] });
  assert.equal(b.bedrag, null);
  assert.deepEqual(b.ontbreekt, ['prijs kit']);
  assert.deepEqual(R.berekenBedrag({}).ontbreekt, ['uren of materiaal']);
});

test('bedrag: Nederlandse invoer ("2,5" uur, "1.250" tarief)', () => {
  assert.equal(R.berekenBedrag({ uren: '2,5', uurtarief: '60' }).bedrag, 150);
  assert.equal(R.berekenBedrag({ uren: '1', uurtarief: '1.250' }).bedrag, 1250);
});

test('voorstel: getallen naar velden en terug', () => {
  const v = R.naarVoorstel(
    {
      soort: 'voorstel',
      omschrijving: 'Kozijn hersteld',
      uren: 2.5,
      materialen: [{ omschrijving: 'vuller', aantal: null, eenheid: 'koker', materiaal_id: null, prijs_excl: null }],
      bedrag_excl: null,
      opbouw: null,
      vragen: ['Hoeveel vuller is er gebruikt?'],
    },
    ['let op'],
  );
  assert.equal(v.uren, '2,5');
  assert.equal(v.materialen[0].aantal, '');
  assert.deepEqual(v.waarschuwingen, ['let op']);
  // Materiaal zonder aantal kan niet op de werkbon.
  assert.ok(R.voorstelOngeldig(v, '', false));
  v.materialen[0].aantal = '1';
  assert.equal(R.voorstelOngeldig(v, '', false), null);
  assert.ok(R.voorstelOngeldig(v, 'abc', true), 'onleesbaar bedrag');
  assert.equal(R.voorstelOngeldig(v, 'abc', false), null, 'zonder bedragen telt het bedrag niet');
  v.omschrijving = ' ';
  assert.ok(R.voorstelOngeldig(v, '', false));
});

test('gekoppeld aan meerwerk: uren opgeteld, materiaal per regel', () => {
  const k = R.gekoppeldAanMeerwerk('m1', {
    uren: [
      { meerwerk_taak_id: 'm1', uren: 1.25 },
      { meerwerk_taak_id: 'm1', uren: '0.5' },
      { meerwerk_taak_id: null, uren: 4 },
    ],
    materialen: [{ meerwerk_taak_id: 'm1', naam: 'kit' }, { meerwerk_taak_id: 'm2', naam: 'verf' }],
  });
  assert.equal(k.uren, 1.75);
  assert.equal(k.aantalUren, 2);
  assert.deepEqual(k.materialen.map((m) => m.naam), ['kit']);
});

test('werkbon-PDF leest de koppeling of het meerwerkbedrag niet', () => {
  const pdf = fs.readFileSync(new URL('../src/lib/pdf/werkbonPdf.ts', import.meta.url), 'utf8');
  assert.ok(!pdf.includes('werkbon_meerwerk_prijs'));
  assert.ok(!pdf.includes('bossMeerwerk'));
});
