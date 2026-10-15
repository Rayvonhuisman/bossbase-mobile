/**
 * De projectkaart zoals het dashboard (ProjectDetailDrawer.jsx): tabs per recht
 * en pakket, het kostenoverzicht (kostenOverzichtService.js), meldingen bij
 * toewijzen en @-vermeldingen (notificatieService.js, noteFormat.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const J = await import('../src/lib/projectLogica.ts');
const K = await import('../src/lib/projectKostenLogica.ts');
const M = await import('../src/lib/collegaMeldingen.ts');

const ids = (tabs) => tabs.map((t) => t.id);

test('tabs: zonder rechten en pakket alleen overzicht, uren en notities', () => {
  assert.deepEqual(ids(J.zichtbareProjectTabs(() => false, () => false)), ['overzicht', 'uren', 'notities']);
});

test('tabs: alles mag → zelfde volgorde als het dashboard', () => {
  assert.deepEqual(ids(J.zichtbareProjectTabs(() => true, () => true)), [
    'overzicht', 'offertes', 'facturen', 'uren', 'kosten', 'werkbonnen', 'notities',
  ]);
});

test('tabs: kosten vraagt recht én pakket, werkbonnen alleen het pakket', () => {
  const alleenKostenRecht = J.zichtbareProjectTabs((r) => r === 'kosten', () => false);
  assert.ok(!ids(alleenKostenRecht).includes('kosten'));
  const alleenPakket = J.zichtbareProjectTabs(() => false, (f) => f === 'kosten_nacalculatie' || f === 'werkbonnen');
  assert.ok(!ids(alleenPakket).includes('kosten'));
  assert.ok(ids(alleenPakket).includes('werkbonnen'));
  const beide = J.zichtbareProjectTabs((r) => r === 'kosten', (f) => f === 'kosten_nacalculatie');
  assert.ok(ids(beide).includes('kosten'));
  assert.deepEqual(ids(J.zichtbareProjectTabs((r) => r === 'offertes', () => false)), ['overzicht', 'offertes', 'uren', 'notities']);
});

test('uren: begroot, geregistreerd, resterend en percentage', () => {
  assert.deepEqual(J.urenOverzicht(10, 8.5), { begroot: 10, gebruikt: 8.5, resterend: 1.5, percentage: 0.85 });
  assert.equal(J.urenOverzicht(10, 12).resterend, 0);
  assert.equal(J.urenOverzicht(null, 3).percentage, 0);
});

test('taken: meerwerk telt niet mee', () => {
  assert.deepEqual(
    J.takenVoortgang([{ afgerond: true }, { afgerond: false }, { afgerond: true, is_meerwerk: true }]),
    { klaar: 1, totaal: 2, pct: 50 },
  );
  assert.deepEqual(J.takenVoortgang(null), { klaar: 0, totaal: 0, pct: 0 });
});

const jc = (o) => ({ id: 'x', description: '', amount: 0, cost_date: null, werkbon_materiaal_id: null, materiaalAantal: null, inkoopprijsPer: null, ...o });

test('kosten: materiaal op inkoop, inkopen erbij, boekingen apart', () => {
  const o = K.bouwKostenOverzicht({
    jobCosts: [
      jc({ id: 'm1', amount: 50, werkbon_materiaal_id: 'wm1', materiaalAantal: 2, inkoopprijsPer: 10 }),
      jc({ id: 'm2', amount: 30, werkbon_materiaal_id: 'wm2', materiaalAantal: 3, inkoopprijsPer: null }),
      jc({ id: 'b1', amount: 420 }),
    ],
    projectKosten: [K.naarProjectKost({ id: 'p1', aantal: 2, prijs_per: 12.5 })],
    urenRegels: [{ uren: 4, reis_km: 12 }, { uren: 3.5 }],
  });
  assert.equal(o.materiaal.bedrag, 50); // 2×10 + 30 (op verkoopprijs)
  assert.equal(o.materiaal.zonderInkoopprijs, 1);
  assert.equal(o.materiaal.geschatBedrag, 30);
  assert.equal(o.inkopen.bedrag, 25);
  assert.equal(o.boekingen.bedrag, 420);
  assert.equal(o.boekingen.regels.length, 1);
  assert.equal(o.totaal, 75); // boekingen tellen niet mee
  assert.deepEqual(o.uren, { uren: 7.5, km: 12 });
});

test('kosten: projectkost uit de database en het subtotaal', () => {
  const p = K.naarProjectKost({ id: 'a', naam: 'Steiger', aantal: '3', prijs_per: '40', bedrag: '120', leverancier_id: null, eenheid: null });
  assert.equal(p.bedrag, 120);
  assert.equal(p.eenheid, '');
  assert.equal(K.kostBedrag(1.5, 3.333), 5);
  assert.equal(K.materiaalNaam('Materiaal: Verf wit'), 'Verf wit');
});

test('toewijzing: alleen nieuwe behandelaars, jezelf niet, met diepe link en mail', () => {
  const rijen = M.toewijzingMeldingen({
    userIds: ['a', 'b', 'c', 'b'],
    vorigeIds: ['a'],
    maker: 'c',
    type: 'toewijzing_project',
    titel: 'Je behandelt nu Dakgoot',
    link: 'projecten',
    relatedType: 'project',
    relatedId: 'p1',
  });
  assert.deepEqual(rijen, [
    {
      user_id: 'b',
      type: 'toewijzing_project',
      title: 'Je behandelt nu Dakgoot',
      body: null,
      link: 'projecten/p1',
      related_type: 'project',
      related_id: 'p1',
      email: true,
    },
  ]);
  assert.equal(M.diepeLinkVoor('pipeline', null, 'd1'), 'pipeline');
});

test('vermelding (gedeeld met de werkbon): opslag zoals het dashboard, ook midden in de tekst', async () => {
  const V = await import('../src/lib/mentions.ts');
  assert.deepEqual(V.mentionZoekterm('Bel @Da en dan', 7), { start: 4, term: 'Da' });
  assert.equal(V.mentionZoekterm('mail info@bedrijf.nl', 20), null);
  assert.equal(
    V.tekstMetVermeldingen('@Jan Jansen en @Jan:\nkijk <hier>', [
      { id: 'u2', naam: 'Jan' },
      { id: 'u1', naam: 'Jan Jansen' },
    ]),
    '<span class="bb-mention" data-id="u1" data-name="Jan Jansen" contenteditable="false">@Jan Jansen</span> en ' +
      '<span class="bb-mention" data-id="u2" data-name="Jan" contenteditable="false">@Jan</span>:<br>kijk &lt;hier&gt;',
  );
});

test('vermelding: melding per getagde op een project, met mail en diepe link', async () => {
  const V = await import('../src/lib/mentions.ts');
  const rijen = V.mentionMeldingen({
    text: V.tekstMetVermeldingen('@Jan   kijk even', [{ id: 'u1', naam: 'Jan' }]),
    relatedType: 'project',
    relatedId: 'p1',
    link: 'projecten',
    creatorName: 'Niels',
    contextName: 'Dakgoot',
  });
  assert.deepEqual(rijen, [
    {
      user_id: 'u1',
      type: 'mention',
      title: 'Niels heeft je getagd bij Dakgoot',
      body: '@Jan kijk even',
      link: 'projecten/p1',
      related_type: 'project',
      related_id: 'p1',
      email: true,
    },
  ]);
});
