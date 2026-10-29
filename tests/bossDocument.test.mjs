/**
 * Boss bij offertes en facturen: dezelfde regels als het dashboard
 * (scripts/test-offerte-regels.mjs en test-boss-factuur.mjs daar).
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../src/lib/regels.ts');
const O = await import('../src/lib/boss/offerteRegels.ts');
const F = await import('../src/lib/boss/factuurRegels.ts');
const B = await import('../src/lib/base64.ts');

const leeg = () => ({ ...R.legeRegel({ uurtarief: 58, btwPct: 21 }), id: R.nieuweId() });

test('base64 heen en terug', () => {
  for (const tekst of ['', 'a', 'ab', 'abc', 'Badkamer 2,4 × 1,8 m²']) {
    const bytes = new TextEncoder().encode(tekst);
    const b64 = B.bytesNaarBase64(bytes);
    assert.equal(b64, Buffer.from(bytes).toString('base64'));
    assert.deepEqual([...B.base64NaarBytes(b64)], [...bytes]);
  }
});

test('voorstel met groepen: nieuwe groepen, regels in hun groep, aanvulling alleen als aangevinkt', () => {
  const voorstel = {
    groepen: [{ ref: null, sleutel: 'bad', naam: 'Badkamer', werkzaamheden: 'Wanden en vloer' }, { ref: null, sleutel: 'wc', naam: 'Toilet', werkzaamheden: 'Vloer' }],
    regels: [
      { ref: null, groep: 'bad', groep_nieuw: true, type: 'uren', omschrijving: 'Arbeid tegelwerk', eenheid: 'uur', aantal: 22, eenheidsprijs: 58, btw_regime: null, btw_pct: null, sleutel: 'uren:tegel', herkomst: { aantal: { soort: 'antwoord' }, prijs: { soort: 'instellingen', waarde: 58 } } },
      { ref: null, groep: 'bad', groep_nieuw: true, type: 'vast', omschrijving: 'Vloertegel', eenheid: 'm²', aantal: 4.32, eenheidsprijs: null, btw_regime: 'normaal', btw_pct: 21, herkomst: { prijs: { soort: 'onbekend' } } },
      { ref: null, groep: 'bad', groep_nieuw: true, type: 'vast', omschrijving: 'Tegellijm', aantal: 4, eenheidsprijs: 21.95, aanvulling: { reden: 'Nodig' } },
      { ref: null, groep: 'wc', groep_nieuw: true, type: 'uren', omschrijving: 'Arbeid tegelwerk', aantal: 6, eenheidsprijs: 58 },
    ],
  };
  const res = O.pasVoorstelToe({ regels: [leeg()], groepen: [] }, voorstel, { maakRegel: leeg });
  assert.equal(res.groepen.length, 2);
  assert.deepEqual(res.regels.map((r) => r.omschrijving), ['Arbeid tegelwerk', 'Vloertegel', 'Arbeid tegelwerk']);
  const [bad, wc] = res.groepen;
  assert.equal(res.regels[0].groepId, bad.id);
  assert.equal(res.regels[2].groepId, wc.id);
  assert.equal(res.regels[0].aantal, '22');
  assert.equal(res.regels[1].aantal, '4,32');
  assert.equal(res.regels[1].prijs, '');
  assert.deepEqual(O.ontbreektIn(res.regels[1]), ['prijs']);
  // Opslaan: ontbrekende prijs als 0, gemarkeerd; groepen en ids mee.
  const op = O.naarOpslag(res);
  assert.equal(op.regels[1].prijs_per, 0);
  assert.deepEqual(op.regels[1].herkomst.ontbreekt, ['prijs']);
  assert.equal(op.regels[0].groep_id, bad.id);
  assert.equal(op.groepen[0].werkzaamheden, 'Wanden en vloer');
  // Met aanvulling aangevinkt (index 2)
  const met = O.pasVoorstelToe({ regels: [leeg()], groepen: [] }, voorstel, { maakRegel: leeg, keuze: { 2: true } });
  assert.ok(met.regels.some((r) => r.omschrijving === 'Tegellijm'));
});

test('gerichte wijziging: zelf aangepast veld blijft staan', () => {
  const r = { ...leeg(), omschrijving: 'Arbeid', aantal: '6', prijs: '58', herkomst: { aantal: { soort: 'opdracht' } } };
  const voor = { regels: [{ ...r }] };
  const nu = { regels: [{ ...r, aantal: '7' }], groepen: [] };
  const res = O.pasVoorstelToe(nu, { groepen: [], regels: [{ ref: r.id, type: 'uren', omschrijving: 'Arbeid', aantal: 9, eenheidsprijs: 60 }] }, { voor, maakRegel: leeg });
  assert.equal(res.regels[0].aantal, '7');
  assert.equal(res.regels[0].prijs, '60');
  assert.equal(res.overgeslagen.length, 1);
});

test('btw van een voorstel: 9% blijft verlaagd, regime van de bestaande regel blijft', () => {
  assert.deepEqual(O.btwVoorVoorstel({ btw_regime: 'verlaagd' }, null, 21), { btwPct: 9, btwRegime: 'verlaagd' });
  assert.deepEqual(O.btwVoorVoorstel({ btw_pct: 9 }, null, 21), { btwPct: 9, btwRegime: 'verlaagd' });
  const oud = { ...leeg(), btwPct: 0, btwRegime: 'verlegd' };
  assert.deepEqual(O.btwVoorVoorstel({}, oud, 21), { btwPct: 0, btwRegime: 'verlegd' });
});

test('regelsVoorBoss stuurt getallen, geen tekstvelden', () => {
  const r = { ...leeg(), omschrijving: 'Kit', aantal: '2,5', prijs: '1.234,50' };
  const b = O.regelsVoorBoss({ regels: [r, leeg()], groepen: [] });
  assert.equal(b.regels.length, 1);
  assert.equal(b.regels[0].aantal, 2.5);
  assert.equal(b.regels[0].prijs_per, 1234.5);
  const f = F.factuurRegelsVoorBoss([r]);
  assert.equal(f[0].aantal, 2.5);
  assert.equal(f[0].eenheidsprijs, 1234.5);
});

test('factuurvoorstel: bestaande regel aangepast, nieuwe erbij, prijs ontbreekt gemarkeerd, eigen regel blijft', () => {
  const a = { ...leeg(), omschrijving: 'Arbeid', aantal: '8', prijs: '58' };
  const voor = [a];
  const eigen = { ...leeg(), omschrijving: 'Zelf toegevoegd', aantal: '1', prijs: '10' };
  const res = F.pasFactuurVoorstelToe([a, eigen], [
    { ref: a.id, type: 'uren', omschrijving: 'Arbeid badkamer', aantal: 8, eenheidsprijs: 58, bron: 'WB-012', tekst_door_boss: true },
    { ref: null, type: 'vast', omschrijving: 'Afvoer', aantal: 1, eenheidsprijs: null, bron: 'WB-012' },
  ], { voor, maakRegel: leeg });
  assert.deepEqual(res.regels.map((r) => r.omschrijving), ['Arbeid badkamer', 'Afvoer', 'Zelf toegevoegd']);
  assert.equal(res.regels[0].id, a.id);
  assert.equal(res.regels[0].bossBron, 'WB-012');
  assert.ok(res.regels[0].bossTekst);
  assert.equal(F.aantalZonderPrijs(res.regels), 1);
  assert.equal(res.gewijzigd.length, 2);
});

test('metOndertekenplek zet {{link}} na de knopzin en vóór de groet', async () => {
  const { metOndertekenplek } = await import('../src/lib/boss/gesprek.ts');
  const tekst = 'Beste Jan,\n\nIn de bijlage de offerte. Met de knop hieronder kunt u ondertekenen.\n\nMet vriendelijke groet,\nPiet';
  assert.equal(
    metOndertekenplek(tekst, true),
    'Beste Jan,\n\nIn de bijlage de offerte. Met de knop hieronder kunt u ondertekenen.\n\n{{link}}\n\nMet vriendelijke groet,\nPiet',
  );
  assert.equal(metOndertekenplek('Beste Jan,\n\nHier de offerte.\n\nMet vriendelijke groet', true), 'Beste Jan,\n\nHier de offerte.\n\n{{link}}\n\nMet vriendelijke groet');
  assert.equal(metOndertekenplek('Kort.', true), 'Kort.\n\n{{link}}');
  assert.equal(metOndertekenplek('A\n\n{{ link }}\n\nB', true), 'A\n\n{{ link }}\n\nB');
  assert.equal(metOndertekenplek(tekst, false), tekst);
});

test('factuurregels: groep gaat mee naar de database en terug in het formulier', async () => {
  const Z = await import('../src/lib/regelOmzetting.ts');
  const kop = { totaal_excl: 100, totaal_incl: 121 };
  const uitDb = Z.regelUitFactuurRegel(
    { id: 'r1', omschrijving: 'Tegelwerk', type: 'uren', aantal: 2.5, eenheidsprijs: 58, btw_pct: 21, btw_regime: 'normaal', groep: { id: 'g1', naam: 'Badkamer', werkzaamheden: 'Betegelen' } },
    kop,
  );
  assert.equal(uitDb.id, 'r1');
  assert.equal(uitDb.aantal, '2,5');
  assert.deepEqual(uitDb.groep, { sleutel: 'g1', naam: 'Badkamer', werkzaamheden: 'Betegelen' });
  const opslag = Z.factuurRegelVoorOpslag(uitDb);
  assert.equal(opslag.aantal, 2.5);
  assert.deepEqual(opslag.groep, { sleutel: 'g1', naam: 'Badkamer', werkzaamheden: 'Betegelen' });
  const zonder = Z.factuurRegelVoorOpslag({ ...uitDb, groep: null });
  assert.equal('groep' in zonder, false);
});

test('offerte → factuur: regels krijgen de groep van de offerte', async () => {
  const Z = await import('../src/lib/regelOmzetting.ts');
  const regels = Z.factuurRegelsUitOfferte(
    [
      { omschrijving: 'Arbeid', type: 'uren', aantal: 6, prijs_per: 58, btw_pct: 21, btw_regime: 'normaal', groep_id: 'wc' },
      { omschrijving: 'Voorrijden', type: 'vast', aantal: 1, prijs_per: 35, btw_pct: 21, btw_regime: 'normaal', groep_id: null },
    ],
    { totaal_excl: 383, totaal_incl: 463.43 },
    [{ id: 'wc', naam: 'Toilet', werkzaamheden: 'Vloer betegelen' }],
  );
  assert.equal(regels[0].groep.naam, 'Toilet');
  assert.equal(regels[1].groep, null);
});
