/**
 * Offertes en facturen: de acties van het dashboard (versturen, herzien,
 * kopiëren, crediteren, herinneren, verwijderen) als pure regels.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const D = await import('../src/lib/documentLogica.ts');
const M = await import('../src/lib/documentMail.ts');

// ── Offertes ───────────────────────────────────────────────────────────────

test('versienummer: zoals nextOfferteVersionNumber', () => {
  assert.equal(D.volgendVersieNummer('BB-005', ['BB-005']), 'BB-005-v2');
  assert.equal(D.volgendVersieNummer('BB-005', ['BB-005', 'BB-005-v2', 'BB-005-V3']), 'BB-005-v4');
  // Herzien vanaf een versie telt vanaf het basisnummer.
  assert.equal(D.volgendVersieNummer('BB-005-v2', ['BB-005', 'BB-005-v2']), 'BB-005-v3');
  // BB-0050 begint met BB-005 maar is een andere offerte.
  assert.equal(D.volgendVersieNummer('BB-005', ['BB-005', 'BB-0050', 'BB-0050-v7']), 'BB-005-v2');
  assert.equal(D.versieBasis('BB-012-v9'), 'BB-012');
  assert.equal(D.versieBasis(null), 'BB');
});

test('offerte: herzien, volledig vast en verwijderen', () => {
  const concept = { status: 'concept', signed_at: null, vervangen_op: null };
  const verzonden = { status: 'verzonden', signed_at: null, vervangen_op: null };
  const vervangen = { status: 'verzonden', signed_at: null, vervangen_op: '2026-10-01' };
  const getekend = { status: 'verzonden', signed_at: '2026-10-02', vervangen_op: null };
  const geaccepteerd = { status: 'geaccepteerd', signed_at: null, vervangen_op: null };
  assert.equal(D.offerteHerzienbaar(verzonden), true);
  assert.equal(D.offerteHerzienbaar(concept), false);
  assert.equal(D.offerteHerzienbaar(vervangen), false);
  assert.equal(D.offerteHerzienbaar(getekend), false);
  assert.equal(D.offerteVolledigVast(getekend), true);
  assert.equal(D.offerteVolledigVast(geaccepteerd), true);
  assert.equal(D.offerteVolledigVast(verzonden), false);
  assert.equal(D.magOfferteVerwijderen(verzonden), true);
  assert.equal(D.magOfferteVerwijderen(getekend), false);
  assert.equal(D.magOfferteVerwijderen(geaccepteerd), false);
});

test('offerteregel terug naar het formulier (reconstructRegel)', () => {
  const kop = { totaal_excl: 100, totaal_incl: 109 };
  const nieuw = D.regelVeldenUitOfferteItem(
    { omschrijving: 'Dak', type: 'km', aantal: 12, prijs_per: 0.23, btw_pct: 21, btw_regime: 'normaal' },
    kop,
  );
  assert.deepEqual(nieuw, { omschrijving: 'Dak', type: 'km', aantal: 12, prijs: 0.23, btwPct: 21, btwRegime: 'normaal' });
  // Oude regel zonder type/percentage: percentage uit de kop (9%), type uit het aantal.
  const oud = D.regelVeldenUitOfferteItem(
    { omschrijving: null, type: null, aantal: 1, prijs_per: 100, btw_pct: null, btw_regime: null },
    kop,
  );
  assert.equal(oud.type, 'vast');
  assert.equal(oud.btwPct, 9);
  assert.equal(oud.btwRegime, 'verlaagd');
  assert.equal(
    D.regelVeldenUitOfferteItem({ omschrijving: 'x', type: null, aantal: 3, prijs_per: 1, btw_pct: 0, btw_regime: 'verlegd' }, kop).type,
    'uren',
  );
});

test('limiet: plan.within', () => {
  assert.equal(D.binnenLimiet(null, 'offertes'), true);
  assert.equal(D.binnenLimiet({ offertes: { max: null, gebruikt: 99 } }, 'offertes'), true);
  assert.equal(D.binnenLimiet({ offertes: { max: 20, gebruikt: 19 } }, 'offertes'), true);
  assert.equal(D.binnenLimiet({ offertes: { max: 20, gebruikt: 20 } }, 'offertes'), false);
  assert.equal(D.binnenLimiet({ facturen: { max: 1, gebruikt: 5 } }, 'offertes'), true);
});

// ── Facturen ───────────────────────────────────────────────────────────────

test('factuur verwijderen: alleen concept of uit de boekhouding', () => {
  assert.equal(D.magFactuurVerwijderen({ status: 'concept', externe_referentie: null }), true);
  assert.equal(D.magFactuurVerwijderen({ status: 'aangemaakt', externe_referentie: null }), true);
  assert.equal(D.magFactuurVerwijderen({ status: 'verzonden', externe_referentie: null }), false);
  assert.equal(D.magFactuurVerwijderen({ status: 'betaald', externe_referentie: null }), false);
  assert.equal(D.magFactuurVerwijderen({ status: 'betaald', externe_referentie: 'snelstart_1' }), true);
  assert.equal(D.magFactuurVerwijderen({ status: 'geboekt', externe_referentie: null }), true);
});

test('statusWeigering en PDF bij definitief worden', () => {
  assert.match(D.factuurStatusWeigering({ status: 'concept' }, 'betaald', 0), /geen regels/);
  assert.equal(D.factuurStatusWeigering({ status: 'concept' }, 'betaald', 2), null);
  assert.equal(D.factuurStatusWeigering({ status: 'verzonden' }, 'betaald', 0), null);
  assert.equal(D.factuurStatusWeigering({ status: 'concept' }, 'verzonden', 0), null);
  assert.equal(D.wordtDefinitief('concept', 'verzonden'), true);
  assert.equal(D.wordtDefinitief('concept', 'betaald'), true);
  assert.equal(D.wordtDefinitief('verzonden', 'betaald'), false);
  assert.equal(D.wordtDefinitief('concept', 'concept'), false);
});

test('herinneringen: alleen te laat, eerst 1 dan 2, 2 alleen met de feature', () => {
  const basis = { status: 'verzonden', vervaldatum: '2026-10-01', is_credit: false, gecrediteerd: false };
  const v = '2026-10-15';
  assert.deepEqual(D.factuurHerinneringen(basis, v, true), { eerste: true, tweede: false });
  assert.deepEqual(D.factuurHerinneringen({ ...basis, herinnering_1_verstuurd_at: '2026-10-05' }, v, true), {
    eerste: false,
    tweede: true,
  });
  assert.deepEqual(D.factuurHerinneringen({ ...basis, herinnering_1_verstuurd_at: '2026-10-05' }, v, false), {
    eerste: false,
    tweede: false,
  });
  assert.deepEqual(D.factuurHerinneringen({ ...basis, vervaldatum: '2026-10-20' }, v, true), { eerste: false, tweede: false });
  assert.deepEqual(D.factuurHerinneringen({ ...basis, status: 'betaald' }, v, true), { eerste: false, tweede: false });
  assert.deepEqual(D.factuurHerinneringen({ ...basis, gecrediteerd: true }, v, true), { eerste: false, tweede: false });
});

test('gedeeltelijk crediteren: gekozen regels met eigen aantal en prijs', () => {
  const r1 = { type: 'uren', omschrijving: 'Arbeid', aantal: 8, eenheidsprijs: 55, regelprijs: 440, btw_pct: 21, btw_regime: 'normaal' };
  const r2 = { type: 'vast', omschrijving: 'Materiaal', aantal: 1, eenheidsprijs: 200, regelprijs: 200, btw_pct: 9, btw_regime: 'verlaagd' };
  const uit = D.gedeeltelijkeCreditRegels([
    { regel: r1, gekozen: true, aantal: '2,5', prijs: '-55' },
    { regel: r2, gekozen: false, aantal: '1', prijs: '200' },
  ]);
  assert.equal(uit.ok, true);
  assert.equal(uit.regels.length, 1);
  assert.equal(uit.regels[0].aantal, 2.5);
  assert.equal(uit.regels[0].eenheidsprijs, 55);
  assert.equal(uit.regels[0].regelprijs, 137.5);
  // Zelfde opbouw als de creditnota van het dashboard.
  const cf = D.bouwCreditFactuur(uit.regels);
  assert.equal(cf.totaal_excl, -137.5);
  assert.equal(cf.totaal_incl, -166.38);
  assert.equal(cf.regels[0].eenheidsprijs, -55);
  assert.equal(cf.regels[0].aantal, 2.5);

  assert.equal(D.gedeeltelijkeCreditRegels([{ regel: r1, gekozen: false, aantal: '1', prijs: '1' }]).ok, false);
  assert.equal(D.gedeeltelijkeCreditRegels([{ regel: r1, gekozen: true, aantal: '0', prijs: '1' }]).ok, false);
  assert.equal(D.gedeeltelijkeCreditRegels([{ regel: r1, gekozen: true, aantal: '1', prijs: 'x' }]).ok, false);
});

// ── Mail ───────────────────────────────────────────────────────────────────

test('mail: variabelen, escapen en regels', () => {
  assert.equal(M.substituteVars('Hoi {{naam}} {{onbekend}}', { naam: 'Jan' }), 'Hoi Jan {{onbekend}}');
  assert.equal(M.tekstNaarHtml('a <b>\n\nc & "d"'), '<div>a &lt;b&gt;</div><div><br></div><div>c &amp; &quot;d&quot;</div>');
  assert.equal(M.mailDatum('2026-01-05'), '5-1-2026');
  assert.equal(M.mailDatum(null), '');
  assert.equal(M.formatIban('nl91abna0417164300'), 'NL91 ABNA 0417 1643 00');
  assert.equal(M.leesbareTekstkleur('#ffee00'), '#0a0a0a');
  assert.equal(M.leesbareTekstkleur('#123456'), '#ffffff');
});

test('mail: zonder handtekening gaat de ondertekenbelofte eruit', () => {
  const tekst = 'Beste Jan,\n\nVia onderstaande link kunt u digitaal ondertekenen:\n{{link}}\n\nGroet';
  assert.equal(M.zonderOndertekenTekst(tekst), 'Beste Jan,\n\n\nGroet');
  const html = M.tekstNaarHtml(tekst);
  assert.equal(M.zonderOndertekenHtml(html), M.tekstNaarHtml('Beste Jan,\n\n\nGroet'));
});

test('offertemail: knop alleen met handtekening en token', () => {
  const basis = {
    onderwerp: 'Offerte',
    tekst: 'Beste,\n{{link}}\nGroet',
    appUrl: 'https://www.bossbase.nl',
    bedrijfsnaam: 'Stamvol',
    merkkleur: '#123456',
  };
  const met = M.offerteMailHtml({ ...basis, kanOndertekenen: true, signToken: 'abc' });
  assert.match(met, /href="https:\/\/www\.bossbase\.nl\/offerte\/abc"/);
  assert.match(met, /Offerte bekijken &amp; ondertekenen/);
  const zonderToken = M.offerteMailHtml({ ...basis, kanOndertekenen: true, signToken: null });
  assert.match(zonderToken, /<div>https:\/\/www\.bossbase\.nl\/offerte\/<\/div>/);
  const zonder = M.offerteMailHtml({ ...basis, kanOndertekenen: false, signToken: 'abc' });
  assert.doesNotMatch(zonder, /offerte\/abc|\{\{link\}\}/);
  assert.match(zonder, /Verstuurd met <a href="https:\/\/www\.bossbase\.nl"/);
});

test('offertemail: terugvaltekst zonder sjabloon', () => {
  const c = M.offerteMailConcept({
    sjabloon: null,
    kanOndertekenen: false,
    klantNaam: null,
    bedrijfsnaam: 'Stamvol',
    nummer: 'BB-007',
    omschrijving: null,
    totaalIncl: 0,
    geldigTot: null,
  });
  assert.equal(c.onderwerp, 'Offerte BB-007 van Stamvol');
  assert.match(c.tekst, /^Beste klant,/);
  assert.match(c.tekst, /als bijlage/);
  assert.doesNotMatch(c.tekst, /onderteken/i);
});

test('factuurmail: betaalgegevens vóór de groet als het IBAN er nog niet staat', () => {
  const basis = {
    sjabloon: { onderwerp: 'Factuur {{factuur_nummer}}', body: 'Beste {{klant_naam}},\n\nTotaal: {{totaal_bedrag}}\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}' },
    klantNaam: 'Jan',
    bedrijfsnaam: 'Stamvol',
    nummer: 'BB-F001',
    totaalIncl: 121,
    vervaldatum: '2026-11-01',
    betalingskenmerk: 'KENMERK-1',
    isCredit: false,
    iban: 'NL91ABNA0417164300',
    ibanTnv: 'Stamvol BV',
    documentBedrijfsnaam: 'Stamvol',
    stripeActief: false,
  };
  const c = M.factuurMailConcept(basis);
  assert.equal(c.onderwerp, 'Factuur BB-F001');
  assert.equal(
    c.tekst,
    `Beste Jan,\n\nTotaal: ${M.mailBedrag(121)}\n\nBetaalgegevens: NL91 ABNA 0417 1643 00 t.n.v. Stamvol BV, onder vermelding van KENMERK-1.\nMet vriendelijke groet,\nStamvol`,
  );
  // Creditnota: niets te betalen, dus geen regel.
  assert.doesNotMatch(M.factuurMailConcept({ ...basis, isCredit: true }).tekst, /Betaalgegevens/);
  // Staat het IBAN er al (via {{iban}}), dan niet nog eens.
  const metIban = M.factuurMailConcept({
    ...basis,
    sjabloon: { onderwerp: 'x', body: 'Maak over op {{iban}}.\nMet vriendelijke groet' },
  });
  assert.doesNotMatch(metIban.tekst, /Betaalgegevens/);
  // Stripe actief: online betalen als hoofdroute in {{betaalinstructie}}.
  const stripe = M.factuurMailConcept({ ...basis, sjabloon: null, stripeActief: true });
  assert.match(stripe.tekst, /online betalen via de knop hieronder/);
});

test('factuurmail: betaalknop direct vóór de groet', () => {
  const html = M.factuurMailHtml({
    onderwerp: 'F',
    tekst: 'Beste,\n\nMet vriendelijke groet,\nStamvol',
    betaalUrl: 'https://www.bossbase.nl/betaal/t',
    bedrijfsnaam: 'Stamvol',
    merkkleur: '#1DDB62',
  });
  const knop = html.indexOf('Factuur betalen');
  const groet = html.indexOf('Met vriendelijke groet');
  assert.ok(knop > 0 && knop < groet);
  assert.doesNotMatch(
    M.factuurMailHtml({ onderwerp: 'F', tekst: 'x', betaalUrl: null, bedrijfsnaam: 'S' }),
    /Factuur betalen/,
  );
  // Alleen http(s) in de knop.
  assert.match(M.mailKnop('Betaal', 'javascript:alert(1)', null), /href=""/);
});

test('bedrijfssnapshot: zoals buildCompanySnapshot', () => {
  const co = { name: 'Stamvol', logoUrl: '', brandingColor: '#1DDB62', iban: 'NL91', ibanTnv: '' };
  assert.deepEqual(Object.keys(M.bedrijfSnapshot(co)).sort(), [
    'snapshot_adres', 'snapshot_bedrijfsnaam', 'snapshot_branding_color', 'snapshot_btw', 'snapshot_email',
    'snapshot_kvk', 'snapshot_logo_url', 'snapshot_plaats', 'snapshot_postcode',
  ]);
  const f = M.bedrijfSnapshot(co, { metIban: true });
  assert.equal(f.snapshot_iban, 'NL91');
  assert.equal(f.snapshot_iban_tnv, null);
  assert.equal(f.snapshot_logo_url, null);
  assert.deepEqual(M.bedrijfSnapshot(null), {});
});
