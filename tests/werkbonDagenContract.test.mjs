/**
 * Contract met RPC `bb_werkbon_dagen_zetten(p_werkbon_id uuid, p_dagen jsonb)`.
 *
 * De RPC (live gecontroleerd) doet per dag:
 *   - starttijd, eindtijd, medewerker_ids, medewerker_tijden: ALTIJD uit de
 *     payload — een ontbrekende sleutel wordt NULL. Dus: wie de sleutel vergeet,
 *     wist de dagploeg of de eigen tijden per persoon.
 *   - voertuig_ids, voertuig_tijden, medewerker_voertuig: ontbreekt de sleutel,
 *     dan blijft de bestaande waarde staan. De app kent geen voertuigen per dag,
 *     dus die sleutels mogen er NIET in staan (anders wist de app ze).
 *   - dagen die niet in de lijst staan worden verwijderd.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../src/lib/werkbonLogica.ts');

const werkbon = {
  gepland_op: '2026-11-02',
  starttijd: '08:00:00',
  eindtijd: '16:30:00',
  assigned_to_ids: ['a', 'b'],
  werkbon_dagen: [
    {
      datum: '2026-11-02', starttijd: null, eindtijd: null, medewerker_ids: null,
      medewerker_tijden: { b: { starttijd: '07:00', eindtijd: '12:00' } },
      voertuig_ids: ['bus1'], voertuig_tijden: null, medewerker_voertuig: { a: 'bus1' },
    },
    {
      datum: '2026-11-03', starttijd: '09:00', eindtijd: '17:00', medewerker_ids: ['a'],
      medewerker_tijden: null, voertuig_ids: ['bus2'], voertuig_tijden: null, medewerker_voertuig: null,
    },
  ],
};

test('dagenUitPlanning: elke dag draagt medewerker_ids en medewerker_tijden (geen stil wissen)', () => {
  const p = L.planningUitWerkbon(werkbon);
  const dagen = L.dagenUitPlanning(p, werkbon.assigned_to_ids, { starttijd: '08:00', eindtijd: '16:30' });
  assert.equal(dagen.length, 2);
  for (const d of dagen) {
    assert.ok('medewerker_ids' in d, 'medewerker_ids ontbreekt');
    assert.ok('medewerker_tijden' in d, 'medewerker_tijden ontbreekt');
    assert.ok('starttijd' in d && 'eindtijd' in d);
  }
  // Ongewijzigd opslaan houdt de dagploeg en de eigen tijd.
  assert.deepEqual(dagen[0].medewerker_tijden, { b: { starttijd: '07:00', eindtijd: '12:00' } });
  assert.deepEqual(dagen[1].medewerker_ids, ['a']);
});

test('dagenUitPlanning: stuurt GEEN voertuigsleutels, zodat de RPC voertuigen per dag laat staan', () => {
  const p = L.planningUitWerkbon(werkbon);
  for (const d of L.dagenUitPlanning(p, werkbon.assigned_to_ids)) {
    assert.equal('voertuig_ids' in d, false);
    assert.equal('voertuig_tijden' in d, false);
    assert.equal('medewerker_voertuig' in d, false);
  }
});

test('dagenUitPlanning: alleen datums YYYY-MM-DD (kolom werkbon_dagen.datum is date, geen tijdzone)', () => {
  const p = L.planningUitWerkbon(werkbon);
  for (const d of L.dagenUitPlanning(p, werkbon.assigned_to_ids)) {
    assert.match(d.datum, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('dagenUitPlanning: een eigen tijd voor iemand die niet (meer) in de dagploeg staat gaat niet mee', () => {
  // Trigger bb_werkbon_dag_tijden weigert anders de hele opslag.
  const p = L.planningUitWerkbon(werkbon);
  const dagen = L.dagenUitPlanning(p, ['a']); // b is uit de ploeg gehaald
  assert.equal(dagen[0].medewerker_tijden, null);
});
