/** Adres zoeken (PDOK): URL's, velden uit een document, postcode en adresregel. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const A = await import('../src/lib/adresZoeken.ts');

test('suggestie-URL pas vanaf drie tekens, met codering en vaste filters', () => {
  assert.equal(A.suggestieUrl(''), null);
  assert.equal(A.suggestieUrl('  da  '), null);
  assert.equal(A.suggestieUrl(null), null);
  assert.equal(
    A.suggestieUrl(' Dam 1 Amsterdam '),
    'https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?q=Dam%201%20Amsterdam&fq=type:adres&rows=8',
  );
  assert.match(A.suggestieUrl('Weg & Co'), /q=Weg%20%26%20Co&/);
});

test('lookup-URL codeert het id', () => {
  assert.equal(
    A.lookupUrl('adr-abc 1'),
    'https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=adr-abc%201',
  );
});

test('suggesties uit het antwoord: alleen bruikbare documenten', () => {
  const json = {
    response: {
      docs: [
        { id: 'adr-1', weergavenaam: 'Dam 1, 1012JS Amsterdam', type: 'adres' },
        { id: '', weergavenaam: 'zonder id' },
        { id: 'adr-2' },
        null,
      ],
    },
  };
  assert.deepEqual(A.suggestiesUitAntwoord(json), [{ id: 'adr-1', weergavenaam: 'Dam 1, 1012JS Amsterdam' }]);
  assert.deepEqual(A.suggestiesUitAntwoord({}), []);
  assert.deepEqual(A.suggestiesUitAntwoord(null), []);
  assert.deepEqual(A.suggestiesUitAntwoord({ response: { docs: 'x' } }), []);
});

test('lookup: eerste document of null', () => {
  assert.deepEqual(A.lookupDoc({ response: { docs: [{ straatnaam: 'Dam' }, { straatnaam: 'X' }] } }), { straatnaam: 'Dam' });
  assert.equal(A.lookupDoc({ response: { docs: [] } }), null);
  assert.equal(A.lookupDoc(undefined), null);
});

test('postcode: "1012JS" wordt "1012 JS", iets anders blijft staan', () => {
  assert.equal(A.formatPostcode('1012JS'), '1012 JS');
  assert.equal(A.formatPostcode('1012 js'), '1012 JS');
  assert.equal(A.formatPostcode('B-1000'), 'B-1000');
  assert.equal(A.formatPostcode(null), '');
});

test('velden uit een document: straat + huisnummer met toevoeging, postcode, plaats', () => {
  assert.deepEqual(
    A.adresVelden({ straatnaam: 'Industrieweg', huis_nlt: '88A', postcode: '3542AD', woonplaatsnaam: 'Utrecht' }),
    { address: 'Industrieweg 88A', postcode: '3542 AD', city: 'Utrecht' },
  );
  assert.deepEqual(A.adresVelden({ straatnaam: 'Dam' }), { address: 'Dam', postcode: '', city: '' });
});

test('adresregel: "Straat 1, 1234 AB Plaats", leeg zonder straat en plaats', () => {
  assert.equal(A.adresRegel({ address: 'Dam 1', postcode: '1012JS', city: 'Amsterdam' }), 'Dam 1, 1012 JS Amsterdam');
  assert.equal(A.adresRegel({ address: 'Dam 1', postcode: '', city: '' }), 'Dam 1');
  assert.equal(A.adresRegel({ address: '', postcode: '1012 JS', city: 'Amsterdam' }), '1012 JS Amsterdam');
  assert.equal(A.adresRegel({ address: ' ', postcode: '1012JS', city: '' }), '');
  assert.equal(A.adresRegel(undefined), '');
});

test('pijltjes lopen rond door de lijst', () => {
  assert.equal(A.volgendeIndex(-1, 3, 1), 0);
  assert.equal(A.volgendeIndex(2, 3, 1), 0);
  assert.equal(A.volgendeIndex(-1, 3, -1), 2);
  assert.equal(A.volgendeIndex(0, 3, -1), 2);
  assert.equal(A.volgendeIndex(2, 3, -1), 1);
  assert.equal(A.volgendeIndex(0, 0, 1), -1);
});
