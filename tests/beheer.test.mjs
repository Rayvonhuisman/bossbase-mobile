/**
 * Team, Instellingen en Database: de pure regels die het dashboard volgen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const team = await import('../src/lib/teamRegels.ts');
const inst = await import('../src/lib/instellingenRegels.ts');
const db = await import('../src/lib/databaseFilters.ts');

// ── Team ────────────────────────────────────────────────────────────────────

const lid = (id, role, status, extra = {}) => ({ id, profile_id: id, role, status, ...extra });

test('team: status "Mail mislukt" gaat voor "Uitgenodigd"', () => {
  assert.equal(team.statusWeergave(lid('a', 'medewerker', 'actief')).label, 'Actief');
  assert.equal(team.statusWeergave({ ...lid('b', 'medewerker', 'uitgenodigd'), profile_id: null }).label, 'Uitgenodigd');
  assert.equal(
    team.statusWeergave({ ...lid('c', 'medewerker', 'uitgenodigd'), invite_email_failed_at: '2026-10-01' }).label,
    'Mail mislukt',
  );
  assert.equal(team.statusWeergave(lid('d', 'medewerker', 'inactief')).label, 'Inactief');
});

test('team: tellingen Totaal / Actief / Uitgenodigd', () => {
  const leden = [lid('a', 'admin', 'actief'), lid('b', 'medewerker', 'inactief'), lid('c', 'medewerker', 'uitgenodigd')];
  assert.deepEqual(team.teamTellingen(leden), { totaal: 3, actief: 1, uitgenodigd: 1 });
});

test('team: eigenaar en laatste beheerder zijn beschermd', () => {
  const leden = [lid('eig', 'admin', 'actief'), lid('mw', 'medewerker', 'actief')];
  // Ik ben de medewerker: de eigenaar is vergrendeld.
  assert.equal(team.rolInfo(leden[0], leden, 'eig', 'mw').vergrendeld, true);
  assert.equal(team.rolInfo(leden[0], leden, 'eig', 'mw').reden, team.EIGENAAR_REDEN);
  // Ik bén de eigenaar, maar ook de laatste admin: nog steeds vergrendeld.
  assert.equal(team.rolInfo(leden[0], leden, 'eig', 'eig').reden, team.LAATSTE_ADMIN_REDEN);
  // Twee actieve admins: niet meer de laatste.
  const twee = [...leden, lid('adm2', 'admin', 'actief')];
  assert.equal(team.rolInfo(twee[0], twee, 'eig', 'eig').vergrendeld, false);
  assert.equal(team.rolInfo(twee[1], twee, 'eig', 'eig').vergrendeld, false);
});

test('team: actiekolom — Jij, Beschermd of acties', () => {
  const leden = [lid('eig', 'admin', 'actief'), lid('adm2', 'admin', 'actief'), lid('mw', 'medewerker', 'actief')];
  assert.equal(team.beheerStand(leden[1], leden, 'eig', 'adm2').soort, 'jij');
  assert.equal(team.beheerStand(leden[0], leden, 'eig', 'adm2').soort, 'beschermd');
  assert.deepEqual(team.beheerStand(leden[2], leden, 'eig', 'adm2'), { soort: 'acties', geblokkeerd: null });
  const alleen = [lid('x', 'admin', 'actief'), lid('mw', 'medewerker', 'actief')];
  assert.equal(team.beheerStand(alleen[0], alleen, null, 'mw').geblokkeerd, team.LAATSTE_ADMIN_REDEN);
});

test('team: planner alleen als keuze bij de huidige rol', () => {
  assert.deepEqual(team.rolOpties('medewerker').map((r) => r.id), ['medewerker', 'admin']);
  assert.deepEqual(team.rolOpties('planner').map((r) => r.id), ['medewerker', 'admin', 'planner']);
});

test('team: uitnodigingsmail escapet namen en noemt de rol', () => {
  const m = team.uitnodigingsMail({
    inviteUrl: 'https://www.bossbase.nl/uitnodiging/abc',
    bedrijfsnaam: 'Bouw & <Zn>',
    uitnodiger: 'Piet',
    ontvanger: 'jan@x.nl',
    rol: 'admin',
  });
  assert.equal(m.onderwerp, 'Je bent uitgenodigd voor Bouw & <Zn> op BossBase');
  assert.ok(m.html.includes('Bouw &amp; &lt;Zn&gt;'));
  assert.ok(!m.html.includes('<Zn>'));
  assert.ok(m.html.includes('Beheerder'));
  assert.ok(m.html.includes('48 uur geldig'));
});

// ── Instellingen ────────────────────────────────────────────────────────────

test('instellingen: tabs zoals het dashboard', () => {
  const ids = (x) => inst.zichtbareTabs(x).map((t) => t.id);
  assert.deepEqual(ids({ instellingen: false, isAdmin: true, voertuigen: true }), ['profiel']);
  assert.deepEqual(ids({ instellingen: true, isAdmin: false, voertuigen: true }), [
    'profiel', 'bedrijf', 'standaard', 'templates', 'pipeline', 'integraties',
  ]);
  assert.deepEqual(ids({ instellingen: true, isAdmin: true, voertuigen: false }), [
    'profiel', 'bedrijf', 'standaard', 'templates', 'pipeline', 'abonnement', 'integraties',
  ]);
  assert.equal(ids({ instellingen: true, isAdmin: true, voertuigen: true }).length, 8);
  const zicht = inst.zichtbareTabs({ instellingen: false, isAdmin: false, voertuigen: false });
  assert.equal(inst.kiesTab('abonnement', zicht), 'profiel');
});

test('instellingen: wachtwoordeisen', () => {
  assert.equal(inst.wachtwoordGeldig('kort'), false);
  assert.equal(inst.wachtwoordGeldig('langgenoeg1!'), false); // geen hoofdletter
  assert.equal(inst.wachtwoordGeldig('Langgenoeg1!'), true);
});

test('instellingen: nieuw template — slug en controles', () => {
  assert.equal(inst.slugify('Nieuwe Klant – welkom!'), 'nieuwe_klant_welkom');
  assert.deepEqual(inst.controleerNieuwTemplate('', '', []), { ok: false, melding: 'Naam is verplicht' });
  assert.equal(inst.controleerNieuwTemplate('Factuur', '', []).ok, false);
  assert.equal(inst.controleerNieuwTemplate('Welkom', '', ['welkom']).ok, false);
  assert.deepEqual(inst.controleerNieuwTemplate('Welkom', '', []), { ok: true, slug: 'welkom' });
});

test('instellingen: tekst → editor-HTML zoals plainToEditorHtml', () => {
  assert.equal(inst.tekstNaarEditorHtml('a\n\n<b>'), '<div>a</div><div><br></div><div>&lt;b&gt;</div>');
  assert.equal(inst.tekstNaarEditorHtml(''), '');
});

test('instellingen: fasekleuren, agenda-uren, zitplaatsen, weekdagen', () => {
  assert.equal(inst.faseKleurHex('b-progress'), '#f97316');
  assert.equal(inst.faseKleurHex('#123456'), '#123456');
  assert.equal(inst.faseKleurHex(null), '#6b7280');
  assert.equal(inst.faseKleurLabel('b-new'), 'Groen');
  assert.deepEqual(inst.agendaEindUren(22), [23, 24]);
  assert.equal(inst.naarZitplaatsen(''), null);
  assert.equal(inst.naarZitplaatsen('0'), null);
  assert.equal(inst.naarZitplaatsen('150'), 99);
  assert.deepEqual(inst.wisselInLijst([1, 2, 3], 2, false), [1, 3]);
  assert.deepEqual(inst.wisselInLijst([1, 3], 2, true), [1, 3, 2]);
  assert.equal(inst.maandbedrag('team', 2), 79);
});

// ── Database ────────────────────────────────────────────────────────────────

const klant = (id, extra = {}) => ({
  id, name: `Klant ${id}`, email: null, phone: null, address: null, postcode: null, city: null,
  kvk_number: null, btw_number: null, iban: null, type: 'Klant', source: null, moneybird_id: null,
  created_at: '2026-01-01T10:00:00Z', ...extra,
});

const data = {
  klanten: [
    klant('a', { city: 'Utrecht', kvk_number: '12345678' }),
    klant('b', { city: 'Amersfoort', moneybird_id: 'mb1' }),
    klant('c', { name: 'Bakker', city: 'Utrecht' }),
  ],
  projecten: [
    { id: 'p1', customer_id: 'a', name: 'Dak', status: 'in_uitvoering', start_date: '2026-09-01', deadline: null, quoted_hours: 10, used_hours: 12, owner_id: 'u1', created_at: '2026-09-01' },
    { id: 'p2', customer_id: 'b', name: 'Tuin', status: 'afgerond', start_date: null, deadline: '2026-05-01', quoted_hours: 10, used_hours: 2, owner_id: 'u2', created_at: '2026-04-01' },
  ],
  facturen: [
    { id: 'f1', customer_id: 'a', status: 'betaald', factuurdatum: '2026-09-10', vervaldatum: '2026-09-24', totaal_incl: 121, betaald_op: '2026-09-20', herinnering_1_verstuurd_at: null, herinnering_2_verstuurd_at: null, is_credit: false, gecrediteerd: false },
    { id: 'f2', customer_id: 'a', status: 'verzonden', factuurdatum: '2026-09-15', vervaldatum: '2026-09-29', totaal_incl: 100, betaald_op: null, herinnering_1_verstuurd_at: '2026-10-05', herinnering_2_verstuurd_at: null, is_credit: false, gecrediteerd: false },
    { id: 'f3', customer_id: 'b', status: 'concept', factuurdatum: null, vervaldatum: null, totaal_incl: 50, betaald_op: null, herinnering_1_verstuurd_at: null, herinnering_2_verstuurd_at: null, is_credit: false, gecrediteerd: false },
  ],
  offertes: [
    { id: 'o1', customer_id: 'c', status: 'verzonden', geldig_tot: '2026-10-01', totaal_incl: 500, signed_at: null, created_at: '2026-09-01T00:00:00Z' },
    { id: 'o2', customer_id: 'a', status: 'geaccepteerd', geldig_tot: '2026-12-01', totaal_incl: 900, signed_at: '2026-09-02', created_at: '2026-08-20T00:00:00Z' },
  ],
  deals: [{ id: 'd1', customer_id: 'c', stage_id: 's1', value: 2000, lost_reason: 'Te duur' }],
  activiteiten: [{ id: 'x1', customer_id: 'b', type: 'call', due_at: '2026-10-10T09:00:00Z', completed: false }],
  mails: [{ id: 'm1', customer_id: 'a', subject: 'Factuur', sent_at: '2026-10-12T10:00:00Z', related_type: 'factuur' }],
  uren: [{ customer_id: null, project_id: 'p1' }],
};
const nu = new Date('2026-10-13T12:00:00');
const per = db.indexeerPerKlant(data);
const zoek = (f, extra = {}) =>
  db.filterKlanten(data, per, { ...db.LEGE_FILTERS, ...f }, { zoek: '', tab: 'alle', nu, ...extra }).map((k) => k.id);

test('database: zoeken op naam en snel-tab lopend project', () => {
  assert.deepEqual(zoek({}, { zoek: 'bak' }), ['c']);
  assert.deepEqual(zoek({}, { tab: 'lopend_project' }), ['a']);
});

test('database: klantfilters', () => {
  assert.deepEqual(zoek({ stad: 'utr' }), ['a', 'c']);
  assert.deepEqual(zoek({ heeftKvk: 'ja' }), ['a']);
  assert.deepEqual(zoek({ heeftMoneybird: 'ja' }), ['b']);
  assert.deepEqual(zoek({ geenProject: true }), ['c']);
  // Laatste contact ouder dan 7 dagen: a had gisteren een mail, b een activiteit 3 dagen terug.
  assert.deepEqual(zoek({ laatsteContactDagen: '7' }), ['c']);
});

test('database: project-, offerte- en factuurfilters', () => {
  assert.deepEqual(zoek({ heeftOverrun: true }), ['a']);
  assert.deepEqual(zoek({ projectStatussen: ['afgerond'] }), ['b']);
  assert.deepEqual(zoek({ projectMedewerker: 'u2' }), ['b']);
  assert.deepEqual(zoek({ offerteVerlopen: true }), ['c']);
  assert.deepEqual(zoek({ offerteOndertekend: 'ja' }), ['a']);
  assert.deepEqual(zoek({ offerteBedragMin: '600' }), ['a']);
  assert.deepEqual(zoek({ factuurVervallen: true }), ['a']);
  assert.deepEqual(zoek({ herinnering1: 'ja' }), ['a']);
  assert.deepEqual(zoek({ betaaldVan: '2026-09-15' }), ['a']);
});

test('database: pipeline, communicatie, uren en documenten', () => {
  assert.deepEqual(zoek({ dealFasen: ['s1'] }), ['c']);
  assert.deepEqual(zoek({ dealVerlorenRedenen: ['Te duur'] }), ['c']);
  assert.deepEqual(zoek({ heeftOpenActiviteiten: true }), ['b']);
  assert.deepEqual(zoek({ activiteitTypen: ['call'] }), ['b']);
  assert.deepEqual(zoek({ heeftMail: 'nee' }), ['b', 'c']);
  assert.deepEqual(zoek({ mailTemplateType: 'factuur' }), ['a']);
  assert.deepEqual(zoek({ heeftFactureerbareUren: true }), ['a']);
  assert.deepEqual(zoek({ heeftOnbetaaldeFacturen: true }), ['a', 'b']);
  assert.deepEqual(zoek({ documentenPeriodeVan: '2026-09-12' }), ['a']);
});

test('database: actieve filters tellen en pagineren per 50', () => {
  assert.equal(db.aantalActieveFilters(db.LEGE_FILTERS), 0);
  assert.equal(db.aantalActieveFilters({ ...db.LEGE_FILTERS, stad: 'x', projectStatussen: ['gepland'] }), 2);
  const lijst = Array.from({ length: 120 }, (_, i) => i);
  const p = db.pagina(lijst, 3);
  assert.equal(p.totaal, 3);
  assert.equal(p.items.length, 20);
  assert.equal(db.pagina(lijst, 99).huidig, 3);
  assert.equal(db.PER_PAGINA, 50);
});

test('database: bedragen en export zoals het dashboard', () => {
  const rel = per.get('a');
  assert.equal(db.sumGefactureerd(rel.facturen), 221);
  assert.equal(db.sumBetaald(rel.facturen), 121);
  assert.equal(db.sumOpenstaand(rel.facturen), 100);
  const [r] = db.exportRegels([data.klanten[0]], per);
  assert.equal(r['Totaal betaald'], '121,00');
  assert.equal(r['Openstaand bedrag'], '100,00');
  assert.equal(r['Laatste project naam'], 'Dak');
  assert.equal(r['Moneybird gesynchroniseerd'], 'Nee');
  const csv = db.naarCsv([r]);
  assert.ok(csv.startsWith('﻿"Naam","Email"'));
  assert.equal(csv.split('\n').length, 2);
  assert.equal(db.EXPORT_KOLOMMEN.length, 24);
});
