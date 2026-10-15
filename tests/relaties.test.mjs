/** Relaties: KvK/btw/IBAN-validatie, bedragen per klant, zoeken, planregels. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const v = await import('../src/lib/relatieValidatie.ts');
const r = await import('../src/lib/relaties.ts');

test('KvK: 8 cijfers, spaties en punten mogen', () => {
  assert.equal(v.valideerKvk(''), null);
  assert.equal(v.valideerKvk(null), null);
  assert.equal(v.valideerKvk('12345678'), null);
  assert.equal(v.valideerKvk('1234 5678'), null);
  assert.equal(v.valideerKvk('1234567'), 'Een KvK-nummer bestaat uit 8 cijfers.');
  assert.equal(v.valideerKvk('1234567a'), 'Een KvK-nummer bestaat uit 8 cijfers.');
});

test('btw: NL-vorm en elfproef; buitenlands wordt niet beoordeeld', () => {
  // 123456782: 1·9+2·8+3·7+4·6+5·5+6·4+7·3+8·2−2 = 154 = 14·11
  assert.equal(v.valideerBtwNummer('NL123456782B01'), null);
  assert.equal(v.valideerBtwNummer('nl 1234.5678.2 b01'), null);
  assert.equal(v.valideerBtwNummer('NL123456789B01'), 'Dit btw-nummer klopt niet — controleer de cijfers.');
  assert.equal(
    v.valideerBtwNummer('NL12345678B01'),
    'Een Nederlands btw-nummer ziet eruit als NL123456789B01.',
  );
  assert.equal(v.valideerBtwNummer('DE123456789'), null);
  assert.equal(v.valideerBtwNummer(''), null);
});

test('IBAN: mod-97, NL is 18 tekens', () => {
  assert.equal(v.valideerIban('NL91ABNA0417164300'), null);
  assert.equal(v.valideerIban('nl91 abna 0417 1643 00'), null);
  assert.equal(v.valideerIban('DE89370400440532013000'), null);
  assert.equal(v.valideerIban('NL91ABNA0417164301'), 'Dit rekeningnummer klopt niet — controleer de IBAN.');
  assert.equal(v.valideerIban('NL91ABNA041716430'), 'Een Nederlandse IBAN bestaat uit 18 tekens.');
  assert.equal(v.valideerIban('12345'), 'Dit lijkt geen geldige IBAN — controleer het rekeningnummer.');
  assert.equal(v.valideerIban(undefined), null);
});

test('valideerRelatieVelden en eersteRelatieFout (btw eerst, zoals het dashboard)', () => {
  assert.deepEqual(v.valideerRelatieVelden({}), {});
  const fouten = v.valideerRelatieVelden({ kvk_number: '1', btw_number: 'NL1', iban: 'x' });
  assert.deepEqual(Object.keys(fouten).sort(), ['btw_number', 'iban', 'kvk_number']);
  assert.match(v.eersteRelatieFout({ kvk_number: '1', btw_number: 'NL1' }), /btw-nummer/);
  assert.equal(v.eersteRelatieFout({ kvk_number: '12345678' }), null);
});

test('klantTotalen: concept telt niet, credit trekt af, gecrediteerd is niet betaald', () => {
  const t = r.klantTotalen([
    { customer_id: 'a', status: 'concept', totaal_incl: 500, totaal_excl: 400 },
    { customer_id: 'a', status: 'verzonden', totaal_incl: 121, totaal_excl: 100 },
    { customer_id: 'a', status: 'betaald', totaal_incl: '242', totaal_excl: 200 },
    { customer_id: 'a', status: 'betaald', totaal_incl: 127.35, totaal_excl: 105.25, gecrediteerd: true },
    { customer_id: 'a', status: 'verzonden', totaal_incl: -119.79, totaal_excl: -99, is_credit: true },
  ]);
  assert.equal(Math.round(t.gefactureerd * 100) / 100, 370.56);
  assert.equal(t.betaald, 242);
  assert.equal(Math.round(t.openstaand * 100) / 100, 128.56);
  assert.equal(Math.round(t.omzetExcl * 100) / 100, 306.25);
});

test('totalenPerKlant groepeert op klant en slaat rijen zonder klant over', () => {
  const m = r.totalenPerKlant([
    { customer_id: 'a', status: 'betaald', totaal_incl: 10 },
    { customer_id: 'b', status: 'verzonden', totaal_incl: 5 },
    { customer_id: null, status: 'betaald', totaal_incl: 99 },
  ]);
  assert.equal(m.size, 2);
  assert.equal(m.get('a').betaald, 10);
  assert.equal(m.get('b').openstaand, 5);
});

test('zoeken: hoofdletterongevoelig, leeg past altijd', () => {
  assert.equal(r.klantPastBijZoek({ name: 'Bakkerij Jansen', city: 'Utrecht' }, 'utr'), true);
  assert.equal(r.klantPastBijZoek({ name: 'Bakkerij Jansen' }, '  '), true);
  assert.equal(r.klantPastBijZoek({ name: 'Bakkerij Jansen' }, 'piet'), false);
  assert.equal(r.leverancierPastBijZoek({ naam: 'Gamma', email: 'inkoop@gamma.nl' }, 'INKOOP'), true);
  assert.equal(r.leverancierPastBijZoek({ naam: 'Gamma', contactpersoon: 'Kees' }, 'kees'), true);
  assert.equal(r.leverancierPastBijZoek({ naam: 'Gamma', city: 'Breda' }, 'tilburg'), false);
});

test('kosten per leverancier en de verwijderblokkade', () => {
  const k = r.kostenPerLeverancier([
    { leverancier_id: 'x', amount: 10 },
    { leverancier_id: 'x', amount: '2.5' },
    { leverancier_id: null, amount: 100 },
  ]);
  assert.deepEqual(k, { x: { aantal: 2, bedrag: 12.5 } });
  assert.equal(r.verwijderBlokkade('Gamma', 0), null);
  assert.match(r.verwijderBlokkade('Gamma', 1), /er hangt 1 kostenpost aan/);
  assert.match(r.verwijderBlokkade('Gamma', 3), /er hangen 3 kostenposten aan/);
});

test('planRegels: werkbondagen en losse activiteiten op datum en tijd', () => {
  const regels = r.planRegels(
    [
      {
        id: 'w1', titel: 'Dakgoot', status: 'gepland', gepland_op: '2026-10-20',
        starttijd: '08:00:00', eindtijd: '16:00:00', activity_id: 'a-wb',
        dagen: [
          { datum: '2026-10-20', starttijd: null, eindtijd: null },
          { datum: '2026-10-21', starttijd: '07:30:00', eindtijd: '12:00:00' },
        ],
      },
      { id: 'w2', titel: '', gepland_op: '2026-10-15', starttijd: null, eindtijd: null },
      { id: 'w3', titel: 'Zonder datum', gepland_op: null, starttijd: null, eindtijd: null },
    ],
    [
      { id: 'a1', title: 'Bellen', due_at: '2026-10-20T07:00:00' },
      { id: 'a-wb', title: 'Hoort bij werkbon', due_at: '2026-10-20T08:00:00' },
      { id: 'a2', title: null, due_at: null },
    ],
  );
  assert.deepEqual(
    regels.map((x) => [x.sleutel, x.datum, x.starttijd, x.titel]),
    [
      ['w2-2026-10-15', '2026-10-15', null, 'Werkbon'],
      ['los-a1', '2026-10-20', '07:00', 'Bellen'],
      ['w1-2026-10-20', '2026-10-20', '08:00', 'Dakgoot'],
      ['w1-2026-10-21', '2026-10-21', '07:30', 'Dakgoot'],
    ],
  );
  assert.deepEqual(
    r.komendePlanRegels(regels, '2026-10-21').map((x) => x.sleutel),
    ['w1-2026-10-21'],
  );
  assert.equal(r.komendePlanRegels(regels, '2027-01-01', 2).length, 2);
});

test('lokaleDatumTijd: middernacht is geen tijd', () => {
  assert.deepEqual(r.lokaleDatumTijd('2026-10-20T00:00:00'), { datum: '2026-10-20', tijd: null });
  assert.equal(r.lokaleDatumTijd('geen datum'), null);
});

test('betaaltermijn per klant: leeg = standaard, anders hele dagen 0–365', async () => {
  const { leesBetaaltermijn } = await import('../src/lib/relatieValidatie.ts');
  assert.deepEqual(leesBetaaltermijn(''), { waarde: null, fout: null });
  assert.deepEqual(leesBetaaltermijn(' 30 '), { waarde: 30, fout: null });
  assert.ok(leesBetaaltermijn('14,5').fout);
  assert.ok(leesBetaaltermijn('400').fout);
});
