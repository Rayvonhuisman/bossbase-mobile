/**
 * Datacontract offertes/facturen: wat de database-constraints eisen.
 * - offerte_items/factuur_regels_verlegd_nul_check: verlegd/vrijgesteld = 0%.
 * - Een creditnota van een verlegde of vrijgestelde regel houdt 0%.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const D = await import('../src/lib/documentLogica.ts');

test('btwPctVoorOpslag: verlegd en vrijgesteld altijd 0', () => {
  assert.equal(D.btwPctVoorOpslag(21, 'verlegd'), 0);
  assert.equal(D.btwPctVoorOpslag(21, 'vrijgesteld'), 0);
  assert.equal(D.btwPctVoorOpslag(null, 'verlegd'), 0);
});

test('btwPctVoorOpslag: 0% bij normaal blijft 0, ontbrekend wordt 21', () => {
  assert.equal(D.btwPctVoorOpslag(0, 'normaal'), 0);
  assert.equal(D.btwPctVoorOpslag(9, 'verlaagd'), 9);
  assert.equal(D.btwPctVoorOpslag(null, 'normaal'), 21);
  assert.equal(D.btwPctVoorOpslag(undefined, undefined), 21);
});

test('creditnota: verlegde/vrijgestelde regel krijgt 0% (geen check-violation)', () => {
  const c = D.bouwCreditFactuur([
    { type: 'vast', omschrijving: 'Verlegd', aantal: 1, eenheidsprijs: 60, regelprijs: 60, btw_pct: 0, btw_regime: 'verlegd' },
    { type: 'vast', omschrijving: 'Vrij', aantal: 1, eenheidsprijs: 10, regelprijs: 10, btw_pct: 0, btw_regime: null },
    { type: 'uren', omschrijving: 'Werk', aantal: 1, eenheidsprijs: 100, regelprijs: 100, btw_pct: 21, btw_regime: 'normaal' },
  ]);
  for (const r of c.regels) {
    if (r.btw_regime === 'verlegd' || r.btw_regime === 'vrijgesteld') {
      assert.equal(r.btw_pct, 0, `${r.omschrijving}: ${r.btw_regime} met ${r.btw_pct}%`);
    }
  }
  assert.equal(c.regels[1].btw_regime, 'vrijgesteld');
  assert.equal(c.regels[2].btw_pct, 21);
  assert.equal(c.totaal_incl, -(170 + 21));
});
