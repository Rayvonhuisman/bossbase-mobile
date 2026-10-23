/** Blok Bestanden: dezelfde regels als het dashboard, en op de juiste plekken ingebouwd. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lees = (pad) => readFileSync(new URL('../' + pad, import.meta.url), 'utf8');
const r = await import('../src/lib/bestandRegels.ts');

test('type: van het toestel als het mag, anders op de extensie; geen SVG of HTML', () => {
  assert.equal(r.bestandType({ naam: 'plan.dwg', mime: null }), 'image/vnd.dwg');
  assert.equal(r.bestandType({ naam: 'x.pdf', mime: 'application/pdf' }), 'application/pdf');
  assert.equal(r.bestandType({ naam: 'tekening.DXF', mime: 'application/octet-stream' }), 'image/vnd.dxf');
  assert.equal(r.bestandType({ naam: 'logo.svg', mime: 'image/svg+xml' }), null);
  assert.equal(r.bestandType({ naam: 'pagina.html', mime: 'text/html' }), null);
});

test('grenzen: leeg, te groot (25 MB), verkeerd type', () => {
  assert.equal(r.bestandFout({ naam: 'a.pdf', grootte: 10 }), null);
  assert.match(r.bestandFout({ naam: 'a.pdf', grootte: 0 }), /leeg/);
  assert.match(r.bestandFout({ naam: 'a.pdf', grootte: 25 * 1024 * 1024 + 1 }), /te groot/);
  assert.match(r.bestandFout({ naam: 'a.exe', grootte: 10 }), /kan niet/);
});

test('namen: veilig pad, voorstel zonder extensie, downloadnaam met extensie', () => {
  assert.equal(r.veiligeNaam('Garantiebewijs Ketel (2031).PDF'), 'garantiebewijs-ketel-2031.pdf');
  assert.equal(r.veiligeNaam('ééé.jpg'), 'eee.jpg');
  assert.equal(r.veiligeNaam('../../x'), 'bestand.x');
  assert.equal(r.naamZonderExtensie('contract.docx'), 'contract');
  assert.equal(r.downloadNaam({ naam: 'Offerte BB-1', pad: null, mime: 'application/pdf' }), 'Offerte BB-1.pdf');
  assert.equal(r.downloadNaam({ naam: 'Tekening', pad: 'c/i/tekening.dwg', mime: 'image/vnd.dwg' }), 'Tekening.dwg');
  assert.equal(r.downloadNaam({ naam: 'a/b', pad: 'c/i/x.pdf', mime: 'application/pdf' }), 'a-b.pdf');
});

test('in de app te bekijken: PDF en gewone foto’s', () => {
  assert.ok(r.isTeBekijken({ mime: 'application/pdf' }));
  assert.ok(r.isTeBekijken({ mime: 'image/jpeg' }));
  assert.ok(!r.isTeBekijken({ mime: 'image/heic' }));
  assert.ok(!r.isTeBekijken({ mime: 'image/vnd.dwg' }));
});

test('zelfde lijst als het dashboard en de database', () => {
  const dashboard = '/Users/nielsgrevink/BossBase/src/services/bestandenService.js';
  let bron;
  try {
    bron = readFileSync(dashboard, 'utf8');
  } catch {
    return; // dashboard niet naast de app (CI): overslaan
  }
  const typen = (s) => [...s.slice(s.indexOf('const TYPES'), s.indexOf('}', s.indexOf('const TYPES'))).matchAll(/'([a-z]+\/[^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(typen(lees('src/lib/bestandRegels.ts')), typen(bron));
});

test('ingebouwd op de klantkaart en de projectkaart, met dezelfde databasefuncties', () => {
  assert.match(lees('app/customers/[id].tsx'), /<BestandenBlok klantId=\{customer\.id\} projecten=\{projecten\} \/>/);
  assert.match(lees('src/components/project/ProjectDetailScherm.tsx'), /<BestandenBlok projectId=\{project\.id\} \/>/);
  const service = lees('src/services/bestandenService.ts');
  for (const naam of ['bestanden_overzicht', 'bb_mag_bestanden_beheren', 'opslag_stand']) assert.ok(service.includes(`'${naam}'`), naam);
  // Verwijderen alleen bij eigen bestanden, ook in de knoppen.
  assert.match(service, /if \(!b\.eigen \|\| !b\.pad\)/);
  const blok = lees('src/components/BestandenBlok.tsx');
  assert.match(blok, /b\.eigen && b\.magBeheren/);
  assert.match(lees('src/components/BestandWeergave.tsx'), /onVerwijder && bestand\.eigen && bestand\.magBeheren/);
  // Drie bronnen: camera, fotobibliotheek en bestanden van het toestel.
  for (const bron of ["'camera'", "'bibliotheek'", "'bestanden'"]) assert.ok(blok.includes(`id: ${bron}`), bron);
});
