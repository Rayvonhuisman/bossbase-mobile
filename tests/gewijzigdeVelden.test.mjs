/** Alleen gewijzigde velden wegschrijven (bedrijfsprofiel, standaardwaarden). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { gewijzigdeVelden, isLeeg, zelfdeWaarde } = await import('../src/lib/gewijzigdeVelden.ts');

const geladen = { name: 'BossBase', website: '', email: 'info@voorbeeld.nl', iban: 'NL91ABNA0417164300' };

test('niets veranderd: leeg resultaat, dus niets wegschrijven', () => {
  const uit = gewijzigdeVelden(geladen, { ...geladen });
  assert.deepEqual(uit, {});
  assert.equal(isLeeg(uit), true);
});

test('ongewijzigd leeg veld gaat niet mee (geen "" → NULL)', () => {
  const uit = gewijzigdeVelden(geladen, { ...geladen, name: 'BossBase BV' });
  assert.deepEqual(uit, { name: 'BossBase BV' });
  assert.equal('website' in uit, false);
});

test('alleen spaties toevoegen telt niet als wijziging; leegmaken wel', () => {
  assert.deepEqual(gewijzigdeVelden(geladen, { ...geladen, name: ' BossBase ' }), {});
  assert.deepEqual(gewijzigdeVelden(geladen, { ...geladen, email: '' }), { email: '' });
});

test('eigen normalisatie (IBAN met spaties/kleine letters is hetzelfde)', () => {
  const normaliseer = (k, v) => (k === 'iban' ? String(v ?? '').replace(/\s+/g, '').toUpperCase() : v);
  assert.deepEqual(
    gewijzigdeVelden(geladen, { ...geladen, iban: 'nl91 abna 0417 1643 00' }, { normaliseer }),
    {},
  );
});

test('getallen, booleans en arrays (volgorde telt niet)', () => {
  const a = { uurtarief: 55, mail: true, dagen: [1, 2, 3], uitgesloten: [] };
  assert.deepEqual(gewijzigdeVelden(a, { ...a, dagen: [3, 1, 2] }), {});
  assert.deepEqual(gewijzigdeVelden(a, { ...a, uurtarief: 60 }), { uurtarief: 60 });
  assert.deepEqual(gewijzigdeVelden(a, { ...a, mail: false }), { mail: false });
  assert.deepEqual(gewijzigdeVelden(a, { ...a, uitgesloten: ['x'] }), { uitgesloten: ['x'] });
  // Ongeldige invoer (NaN) is een wijziging, zodat de validatie hem ziet.
  assert.equal(Number.isNaN(gewijzigdeVelden(a, { ...a, uurtarief: NaN }).uurtarief), true);
});

test('samenhangende velden gaan samen mee', () => {
  const a = { agenda_start_uur: 7, agenda_eind_uur: 18, btw_pct: 21 };
  assert.deepEqual(
    gewijzigdeVelden(a, { ...a, agenda_start_uur: 8 }, { samen: [['agenda_start_uur', 'agenda_eind_uur']] }),
    { agenda_start_uur: 8, agenda_eind_uur: 18 },
  );
  assert.deepEqual(
    gewijzigdeVelden(a, { ...a, btw_pct: 9 }, { samen: [['agenda_start_uur', 'agenda_eind_uur']] }),
    { btw_pct: 9 },
  );
});

test('zelfdeWaarde: null en undefined zijn gelijk', () => {
  assert.equal(zelfdeWaarde(null, undefined), true);
  assert.equal(zelfdeWaarde(null, ''), false);
});
