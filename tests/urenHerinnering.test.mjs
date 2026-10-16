/** Urenherinnering: wie hem krijgt en welke dagen open staan (regels van het dashboard). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const H = await import('../src/lib/urenHerinnering.ts');

const basis = { rol: 'medewerker', actieveLeden: 3, intervalMin: 60, uitgesloten: [], dagen: [1, 2, 3, 4, 5], uid: 'u1', weekdag: 4 };

test('alleen voor personeel, met de herinnering aan, niet uitgesloten, op een herinneringsdag', () => {
  assert.equal(H.herinneringActief(basis), true);
  assert.equal(H.herinneringActief({ ...basis, rol: 'admin' }), false, 'de eigenaar niet');
  assert.equal(H.herinneringActief({ ...basis, actieveLeden: 1 }), false, 'zzp zonder personeel niet');
  assert.equal(H.herinneringActief({ ...basis, intervalMin: 0 }), false, 'uit in Instellingen');
  assert.equal(H.herinneringActief({ ...basis, uitgesloten: ['u1'] }), false);
  assert.equal(H.herinneringActief({ ...basis, weekdag: 6 }), false, 'zaterdag geen herinneringsdag');
  assert.equal(H.herinneringActief({ ...basis, dagen: [] , weekdag: 6 }), true, 'geen dagen gekozen = elke dag');
});

test('open dagen: gepland zonder werkdaguren, binnen 14 dagen, vandaag pas na het moment', () => {
  const gepland = [
    { datum: '2026-10-12', eind: '16:30', label: 'Dakgoot', werkbonId: 'w1' },
    { datum: '2026-10-12', eind: '18:00', label: 'Bellen', werkbonId: null },
    { datum: '2026-10-13', eind: null, label: 'Bellen Jan', werkbonId: null },
    { datum: '2026-10-14', eind: '15:00', label: 'Stucwerk', werkbonId: 'w2' },
    { datum: '2026-10-15', eind: '14:00', label: 'Vandaag', werkbonId: 'w3' },
    { datum: '2026-09-20', eind: null, label: 'Te oud', werkbonId: 'w4' },
  ];
  const vandaag = '2026-10-15';
  const ochtend = H.openWerkdagen({ gepland, geboekt: ['2026-10-14'], vandaag, nuTijd: '09:00', moment: 'volgende_ochtend' });
  assert.deepEqual(ochtend.map((d) => [d.datum, d.label]), [['2026-10-12', 'Dakgoot'], ['2026-10-13', 'Bellen Jan']]);
  const naWerk = (nu) => H.openWerkdagen({ gepland, geboekt: [], vandaag, nuTijd: nu, moment: 'na_werkdag' }).map((d) => d.datum);
  assert.ok(!naWerk('13:59').includes(vandaag));
  assert.ok(naWerk('14:00').includes(vandaag), 'na je laatste eindtijd van vandaag');
  const eindeDag = (nu) => H.openWerkdagen({ gepland, geboekt: [], vandaag, nuTijd: nu, moment: 'einde_dag' }).map((d) => d.datum);
  assert.ok(!eindeDag('16:59').includes(vandaag));
  assert.ok(eindeDag('17:00').includes(vandaag));
});
