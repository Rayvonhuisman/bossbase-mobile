/**
 * Metingen en "Vertel het Boss" in de app.
 *
 * De eerste test is het alarm: wijkt src/lib/metingen/vendored/ af van het
 * dashboard (HEAD of origin/main van ~/BossBase), dan faalt hij. Bijwerken met
 * `node scripts/meting-overnemen.mjs`. Staat de dashboardrepo niet op deze
 * machine (CI), dan wordt hij overgeslagen, met een melding.
 *
 * Daarna: het samenvoegen van stukken in de app geeft hetzelfde als het
 * dashboard (voegStukToe uit de dashboardrepo zelf), ook met komma's in de
 * maten zoals de app ze in het formulier bewaart.
 */
import './hulp/tsPaden.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DASHBOARD_REFS,
  METING_BESTANDEN,
  METING_MAP_APP,
  commitUitKop,
  dashboardBestand,
  dashboardRepo,
  naarApp,
  zonderKop,
} from '../scripts/meting-bron.mjs';

const hier = dirname(fileURLToPath(import.meta.url));
const appRoot = join(hier, '..');
const lees = (pad) => readFileSync(join(appRoot, pad), 'utf8');
const repo = dashboardRepo();

const M = await import('../src/lib/metingen/index.ts');
const S = await import('../src/lib/metingen/vendored/metingControle.js');

// ── 1. Kopie gelijk aan het dashboard ────────────────────────────────────────

test('overgenomen metinglogica is gelijk aan het dashboard (HEAD of origin/main)', (t) => {
  if (!repo) {
    t.skip('dashboardrepo niet gevonden (zet BOSSBASE_DASHBOARD); vergelijking overgeslagen');
    return;
  }
  for (const { bron, doel, vervang } of METING_BESTANDEN) {
    const lokaal = lees(`${METING_MAP_APP}/${doel}`);
    assert.ok(commitUitKop(lokaal), `${doel}: kop met dashboardcommit ontbreekt`);
    const versies = DASHBOARD_REFS.map((ref) => dashboardBestand(repo, ref, bron)).filter((x) => x !== null);
    assert.ok(versies.length, `${bron} staat niet in ${repo}`);
    assert.ok(
      versies.some((v) => naarApp(v, vervang) === zonderKop(lokaal)),
      `${doel} wijkt af van het dashboard (${bron}). Draai: node scripts/meting-overnemen.mjs`,
    );
  }
});

test('overgenomen bestanden importeren alleen elkaar', () => {
  const namen = METING_BESTANDEN.map((b) => b.doel);
  for (const naam of namen) {
    const tekst = lees(`${METING_MAP_APP}/${naam}`);
    for (const [, spec] of tekst.matchAll(/^import .* from ['"]([^'"]+)['"]/gm)) {
      assert.ok(namen.includes(spec.replace(/^\.\//, '')), `${naam} importeert ${spec}; neem dat ook over`);
    }
  }
});

// ── 2. Samenvoegen: app = dashboard ──────────────────────────────────────────

/** voegStukToe zoals hij nu in het dashboard staat (niet de kopie). */
async function dashboardVoegStukToe() {
  if (!repo) return null;
  const bron = DASHBOARD_REFS.map((r) => dashboardBestand(repo, r, 'supabase/functions/_shared/metingControle.js')).find(Boolean);
  if (!bron) return null;
  const map = mkdtempSync(join(tmpdir(), 'meting-'));
  const pad = join(map, 'metingControle.mjs');
  writeFileSync(pad, bron);
  return (await import(pathToFileURL(pad).href)).voegStukToe;
}

const voorstel = (naam, b, h, extra = {}) => ({
  naam, soort: 'oppervlak', breedte: b, hoogte: h, diepte: null, aantal: 1, eenheid: 'm',
  opmerking: '', extra: {}, twijfel: false, twijfelReden: '', twijfelVelden: [], ...extra,
});

// Een woning in drie stukken, met een verbetering en een herhaling.
const STUK1 = S.wandenErbij([
  { ...voorstel('Woonkamer', 5.2, 4.1), ruimtehoogte: 2.6 },
  voorstel('Raam woonkamer', 1.2, 1.4, { aantal: 2 }),
]);
const STUK2 = [voorstel('Keuken', 3, 2.8), voorstel('Raam woonkamer', 1.2, 1.4, { aantal: 2 })];
const STUK3 = [voorstel('Woonkamer', 5.3, 4.1, { vervangt: 'Woonkamer' }), voorstel('Badkamer', 2.1, 1.8, { twijfel: true, twijfelReden: 'Breedte onzeker.' })];

function viaApp() {
  let n = 0;
  const sleutel = () => `k${n++}`;
  let regels = [];
  let stukken = [];
  const berichten = [];
  for (const [id, metingen] of [['s1', STUK1], ['s2', STUK2], ['s3', STUK3]]) {
    const uit = M.stukVerwerkt({ regels, stukken, stukId: id, opnieuw: false, tekst: id, metingen, melding: '', maakSleutel: sleutel });
    regels = uit.regels;
    stukken = uit.stukken;
    berichten.push(uit.bericht.tekst);
  }
  return { regels, stukken, berichten };
}

/** Wat het dashboard doet: naarRegel + voegStukToe, met getallen. */
function viaDashboard(voegStukToe) {
  let n = 0;
  const sleutel = () => `k${n++}`;
  const naarRegel = (r) => ({ ...r, sleutel: sleutel(), extra: r.extra || {}, nagekeken: !r.twijfel });
  let regels = [];
  for (const [id, metingen] of [['s1', STUK1], ['s2', STUK2], ['s3', STUK3]]) {
    regels = voegStukToe(regels, id, metingen.map(naarRegel), sleutel).regels;
  }
  return regels;
}

const vergelijkbaar = (r) => ({
  naam: r.naam,
  soort: r.soort,
  breedte: M.leesGetal(r.breedte),
  hoogte: M.leesGetal(r.hoogte),
  diepte: M.leesGetal(r.diepte),
  aantal: M.leesGetal(r.aantal),
  eenheid: r.eenheid,
  stuk: r.stuk,
  opmerking: r.opmerking,
  nagekeken: r.nagekeken,
});

test('stukken samenvoegen geeft in de app dezelfde lijst als in het dashboard', async (t) => {
  const voegStukToe = (await dashboardVoegStukToe()) ?? S.voegStukToe;
  if (voegStukToe === S.voegStukToe) t.diagnostic('dashboardrepo niet gevonden: vergeleken met de kopie');
  const app = viaApp();
  assert.deepEqual(app.regels.map(vergelijkbaar), viaDashboard(voegStukToe).map(vergelijkbaar));
});

test('een woning in drie stukken: niets dubbel, verbetering op zijn plek, wanden opnieuw uitgerekend', () => {
  const { regels, stukken, berichten } = viaApp();
  assert.deepEqual(regels.map((r) => r.naam), ['Woonkamer', 'Wanden woonkamer', 'Raam woonkamer', 'Keuken', 'Badkamer']);
  // Formulierwaarden met komma, zoals een vakman ze typt.
  assert.equal(regels[0].breedte, '5,3');
  // 2 × (5,3 + 4,1) = 18,8 bij 2,6 hoog.
  assert.equal(regels[1].breedte, '18,8');
  assert.equal(regels[1].hoogte, '2,6');
  assert.equal(regels[2].aantal, '2');
  assert.equal(stukken.length, 3);
  assert.equal(berichten[0], 'Stuk 1: 3 metingen erbij.');
  assert.equal(berichten[1], 'Stuk 2: 1 meting erbij, 1 stond er al.');
  assert.equal(berichten[2], 'Stuk 3: 1 meting erbij, 1 verbeterd.');
  assert.equal(regels.find((r) => r.naam === 'Badkamer').nagekeken, false);
  assert.equal(M.waaromNietOpslaan(regels), '1 meting moet je nog nakijken.');
});

test('een stuk opnieuw verwerken vervangt zijn eigen regels; weghalen haalt alles van dat stuk weg', () => {
  const eerst = viaApp();
  const uit = M.stukVerwerkt({
    regels: eerst.regels,
    stukken: eerst.stukken,
    stukId: 's2',
    opnieuw: true,
    tekst: 'keuken 3,10 bij 2,80',
    metingen: [voorstel('Keuken', 3.1, 2.8)],
    melding: '',
  });
  assert.equal(uit.regels.filter((r) => r.naam === 'Keuken').length, 1);
  assert.equal(uit.regels.find((r) => r.naam === 'Keuken').breedte, '3,1');
  assert.equal(uit.stukken.length, 3);
  assert.equal(uit.stukken[1].tekst, 'keuken 3,10 bij 2,80');
  assert.match(uit.bericht.tekst, /^Stuk 2: /);

  const weg = M.haalStukWeg(uit.regels, uit.stukken, 's2');
  assert.ok(!weg.regels.some((r) => r.stuk === 's2'));
  assert.equal(weg.stukken.length, 2);
});

test('hetzelfde stuk nog eens: herkend, ook met andere spaties of hoofdletters', () => {
  const stukken = [{ id: 'a', tekst: 'Woonkamer 5 meter 20 bij 4 meter 10', aantal: 1 }];
  assert.equal(M.alVerwerkt(stukken, '  woonkamer 5 meter 20  bij 4 meter 10 ', null), 1);
  assert.equal(M.alVerwerkt(stukken, 'Woonkamer 5 meter 20 bij 4 meter 10', 'a'), null);
  assert.equal(M.alVerwerkt(stukken, 'keuken', null), null);
});

test('wat er als "bestaande" meegaat: zonder het stuk dat opnieuw wordt verwerkt, maten als getal', () => {
  const regels = [
    { ...M.naarRegel(voorstel('Woonkamer', 5.2, 4.1)), stuk: 'a', breedte: '5,2' },
    { ...M.naarRegel(voorstel('Keuken', 3, 2.8)), stuk: 'b' },
  ];
  assert.deepEqual(M.bestaandeVoor(regels, 'b'), [{ naam: 'Woonkamer', breedte: 5.2, hoogte: 4.1, diepte: '', aantal: 1, eenheid: 'm' }]);
});

// ── 3. Weergave en opslaan ──────────────────────────────────────────────────

test('getallen: komma in, komma uit; berekening zoals het dashboard', () => {
  assert.equal(M.leesGetal('1,20'), 1.2);
  assert.equal(M.leesGetal(' 1 250 '), 1250);
  assert.equal(M.leesGetal(''), null);
  assert.equal(M.leesGetal('x'), null);
  assert.equal(M.getalTekst(1.2), '1,2');
  assert.equal(M.getalTekst(''), '');
  const f = { ...M.LEEG_FORM, soort: 'oppervlak', breedte: '1,2', hoogte: '1,0', aantal: '4', eenheid: 'm' };
  assert.equal(M.toonSom(M.alsMaten(f)), '4 × 1,2 × 1 = 4,8 m²');
  assert.equal(M.toonSom(M.alsMaten({ ...f, breedte: '' })), '');
  assert.equal(M.totalen([{ waarde: 4.8, waardeEenheid: 'm²' }, { waarde: 7, waardeEenheid: 'm' }, { waarde: 3, waardeEenheid: 'stuk' }, { waarde: null, waardeEenheid: '' }]), '4,8 m² · 7 m · 3 stuks');
});

test('opslaan: maten als getal (komma wordt punt), lege velden null, waarde rekent de database', () => {
  const rij = M.naarRij({ ...M.LEEG_FORM, naam: ' Raam ', breedte: '1,25', hoogte: '0,85', aantal: '', eenheid: 'm', extra: { ondergrond: 'Hout', lagen: ' ' } });
  assert.equal(rij.naam, 'Raam');
  assert.equal(rij.breedte, 1.25);
  assert.equal(rij.hoogte, 0.85);
  assert.equal(rij.diepte, null);
  assert.equal(rij.aantal, 1);
  assert.deepEqual(rij.extra, { ondergrond: 'Hout' });
  assert.ok(!('waarde' in rij) && !('waarde_eenheid' in rij));
});

test('velden per branche: een schilder krijgt ondergrond, binnen/buiten en lagen', () => {
  assert.deepEqual(M.brancheVelden('Schildersbedrijf').map((v) => v.key), ['ondergrond', 'binnen_buiten', 'lagen']);
  assert.deepEqual(M.brancheVelden('').map((v) => v.key), ['ruimte', 'materiaal']);
});

// ── 4. Ingebouwd zoals bedoeld ──────────────────────────────────────────────

test('het blok staat op de projectkaart, met de rechten- en pakketregels van het dashboard', () => {
  const scherm = lees('src/components/project/ProjectDetailScherm.tsx');
  assert.match(scherm, /<MetingenBlok projectId=\{project\.id\} \/>/);
  const blok = lees('src/components/project/MetingenBlok.tsx');
  const dienst = lees('src/services/metingService.ts');
  assert.match(dienst, /rpc\('bb_mag_metingen_beheren'/);
  assert.match(blok, /hasFeature\('metingen_uitlezen'\)/);
  assert.match(blok, /zit in Groei en Team/);
  assert.match(dienst, /functions\.invoke\('metingen-uitlezen', \{ body: \{ project_id: projectId, tekst, bestaande \} \}\)/);
});

test('de microfoonknop staat er alleen als de browser kan inspreken', () => {
  const v = lees('src/components/project/VertelHetBoss.tsx');
  const knop = v.indexOf('testID="meting-boss-mic"');
  const voorwaarde = v.lastIndexOf('{spraak.ondersteund ? (', knop);
  assert.ok(knop > 0 && voorwaarde > 0 && knop - voorwaarde < 600, 'microfoonknop hoort binnen {spraak.ondersteund ? …}');
  // Anders: de uitleg over het dicteren van het toetsenbord.
  assert.match(v, /DICTEER_HINT/);
});

test('geen prijzen in het metingenblok', () => {
  for (const pad of ['src/components/project/MetingenBlok.tsx', 'src/components/project/VertelHetBoss.tsx', 'src/components/project/MetingVelden.tsx', 'src/services/metingService.ts']) {
    const tekst = lees(pad);
    assert.doesNotMatch(tekst, /formatEUR|verkoopprijs|inkoopprijs|materialen'\)/, `${pad} toont of haalt prijzen op`);
  }
});
