/** Nieuwe voorwaarden: wie moet accepteren, en de kopie gelijk aan het dashboard. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardLader } from './hulp/dashboardLader.mjs';

const A = await import('../src/lib/akkoord.ts');
const lader = dashboardLader();

const versies = { algemene_voorwaarden: '2026-12', verwerkersovereenkomst: '2026-12' };
const ingang = { algemene_voorwaarden: '2026-10-27', verwerkersovereenkomst: '2026-10-27' };
const oud = [
  { document: 'algemene_voorwaarden', versie: '2026-10' },
  { document: 'verwerkersovereenkomst', versie: '2026-10' },
];

test('beheerder op een oude versie: beide documenten, vanaf de ingangsdatum', () => {
  assert.deepEqual(A.teAccepteren({ isAdmin: true, rijen: oud, vandaag: '2026-10-27', versies, ingang }), ['algemene_voorwaarden', 'verwerkersovereenkomst']);
  assert.deepEqual(A.teAccepteren({ isAdmin: true, rijen: oud, vandaag: '2026-10-26', versies, ingang }), [], 'nog niet ingegaan');
});

test('medewerker nooit; al geaccepteerd niet; zonder ingangsdatum niet', () => {
  assert.deepEqual(A.teAccepteren({ isAdmin: false, rijen: oud, vandaag: '2026-12-01', versies, ingang }), []);
  const half = [{ document: 'algemene_voorwaarden', versie: '2026-12' }, oud[1]];
  assert.deepEqual(A.teAccepteren({ isAdmin: true, rijen: half, vandaag: '2026-12-01', versies, ingang }), ['verwerkersovereenkomst']);
  assert.deepEqual(A.teAccepteren({ isAdmin: true, rijen: oud, vandaag: '2026-12-01', versies, ingang: { ...ingang, algemene_voorwaarden: null } }), ['verwerkersovereenkomst']);
  assert.deepEqual(A.teAccepteren({ isAdmin: true, rijen: [], vandaag: '2026-12-01', versies, ingang }), ['algemene_voorwaarden', 'verwerkersovereenkomst'], 'geen rijen: ook vragen');
});

test('de privacyverklaring vraagt geen akkoord', () => {
  assert.ok(!A.OPNIEUW_AKKOORD.includes('privacyverklaring'));
});

test('versies, ingang en teksten gelijk aan het dashboard (src/lib/akkoord.js)', async (t) => {
  if (!lader) return t.skip('dashboardrepo niet gevonden');
  const D = await lader.importeer('src/lib/akkoord.js');
  assert.deepEqual({ ...A.AKKOORD_VERSIES }, D.AKKOORD_VERSIES);
  assert.deepEqual(A.AKKOORD_INGANG, D.AKKOORD_INGANG);
  assert.deepEqual(Object.keys(A.AKKOORD_NIEUW), Object.keys(D.AKKOORD_NIEUW));
  for (const d of Object.keys(D.AKKOORD_NIEUW)) {
    assert.equal(A.AKKOORD_NIEUW[d].naam, D.AKKOORD_NIEUW[d].naam);
    assert.equal(A.AKKOORD_NIEUW[d].wat, D.AKKOORD_NIEUW[d].wat, `${d}: tekst wijkt af van het dashboard`);
    assert.ok(A.AKKOORD_NIEUW[d].url.endsWith(D.AKKOORD_NIEUW[d].pad.replace(/^https:\/\/www\.bossbase\.nl/, '')));
  }
});
