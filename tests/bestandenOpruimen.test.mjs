/**
 * Bestanden in de opslag opruimen zonder iemand anders' data te raken:
 * - werkbonfoto: eerst de rij, dan het bestand (regressie uit app-verbeteren);
 * - kostenbon: alleen het eigen bestand van die post, ook bij vervangen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lees = (pad) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf8');
const { bijlagePaden, bonPad, isEigenBonPad, teVerwijderenBonPaden } = await import('../src/lib/kostenBonnen.ts');

const BEDRIJF = '11111111-2222-3333-4444-555555555555';
const ANDER = '99999999-2222-3333-4444-555555555555';
const KOST = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/** De broncode van één geëxporteerde functie (tot de volgende top-level export). */
function functieBron(bron, naam) {
  const start = bron.indexOf(`export async function ${naam}(`);
  assert.ok(start >= 0, `${naam} niet gevonden`);
  const rest = bron.slice(start + 1);
  const eind = rest.search(/\n(export |\/\/ -{5,})/);
  return eind < 0 ? rest : rest.slice(0, eind);
}

test('werkbonfoto verwijderen: eerst de rij (werkbon_fotos), dan het bestand', () => {
  const f = functieBron(lees('src/services/workOrderService.ts'), 'deleteWorkOrderPhoto');
  const rij = f.indexOf(".from('werkbon_fotos').delete()");
  const bestand = f.indexOf('.remove([');
  assert.ok(rij > 0, 'rij-delete ontbreekt');
  assert.ok(bestand > 0, 'opruimen van het bestand ontbreekt');
  assert.ok(rij < bestand, 'het bestand gaat weg vóór de rij');
  // Geweigerde rij (RLS/slot): stoppen vóór het bestand.
  assert.match(f.slice(rij, bestand), /return \{ error:/);
});

test('FotoViewer verwijdert zelf niets uit de opslag (loopt via de service)', () => {
  const viewer = lees('src/components/FotoViewer.tsx');
  assert.doesNotMatch(viewer, /supabase|storage|\.remove\(/);
});

test('kostenbon: nieuw pad is eigen aan de post en heeft twee segmenten', () => {
  const pad = bonPad(BEDRIJF, KOST, 'JPEG', 1700000000000, 'x1y2');
  assert.equal(pad, `${BEDRIJF}/${KOST}-1700000000000-x1y2.jpeg`);
  assert.ok(isEigenBonPad(pad, BEDRIJF));
  // Rare invoer wordt opgeschoond, geen extra mappen of padsprongen.
  const raar = bonPad(BEDRIJF, '../x', '../sh', 1, 'a/b');
  assert.equal(raar.split('/').length, 2);
  assert.ok(!raar.includes('..'));
  assert.ok(raar.endsWith('.jpg'));
});

test('kostenbon: alleen eigen bedrijfsmap en nette bestandsnamen tellen als eigen', () => {
  assert.ok(isEigenBonPad(`${BEDRIJF}/1700-abc.pdf`, BEDRIJF)); // dashboardpad
  assert.ok(!isEigenBonPad(`${ANDER}/1700-abc.pdf`, BEDRIJF));
  assert.ok(!isEigenBonPad(`${BEDRIJF}/sub/1700-abc.pdf`, BEDRIJF));
  assert.ok(!isEigenBonPad(`${BEDRIJF}/..`, BEDRIJF));
  assert.ok(!isEigenBonPad(`${BEDRIJF}/.verborgen`, BEDRIJF));
  assert.ok(!isEigenBonPad('1700-abc.pdf', BEDRIJF));
  assert.ok(!isEigenBonPad(`${BEDRIJF}/a.pdf`, ''));
});

test('kostenbon verwijderen: een pad dat ook bij een andere post staat blijft staan', () => {
  const eigen = `${BEDRIJF}/${KOST}-1-a.jpg`;
  const gedeeld = `${BEDRIJF}/1700-gedeeld.jpg`;
  const vreemd = `${ANDER}/1700-x.jpg`;
  assert.deepEqual(teVerwijderenBonPaden([eigen, gedeeld, vreemd], BEDRIJF, [gedeeld]), [eigen]);
  assert.deepEqual(teVerwijderenBonPaden([], BEDRIJF), []);
  assert.deepEqual(teVerwijderenBonPaden([eigen, eigen], BEDRIJF), [eigen]);
});

test('kostenbon vervangen: oude bestanden weg, de nieuwe blijven', () => {
  const oud = [`${BEDRIJF}/${KOST}-1-a.jpg`, `${BEDRIJF}/${KOST}-1-b.jpg`];
  const nieuw = [`${BEDRIJF}/${KOST}-2-c.jpg`];
  assert.deepEqual(teVerwijderenBonPaden(oud, BEDRIJF, [], nieuw), oud);
  // Zelfde pad behouden (geen echte vervanging): niets weg.
  assert.deepEqual(teVerwijderenBonPaden(nieuw, BEDRIJF, [], nieuw), []);
});

test('bijlage_url lezen: JSON-array, los pad, oude http-URL telt niet', () => {
  assert.deepEqual(bijlagePaden(JSON.stringify(['a/b.jpg', 'https://x/y.jpg'])), ['a/b.jpg']);
  assert.deepEqual(bijlagePaden('a/b.jpg'), ['a/b.jpg']);
  assert.deepEqual(bijlagePaden(null), []);
});

test('jobCostService: koppelBonnen per post, opruimen alleen via de padregels', () => {
  const bron = lees('src/services/jobCostService.ts');
  assert.match(bron, /export async function koppelBonnen\(\s*kostId: string,/);
  // Elke remove op kosten-bijlagen gaat óf over net geüploade paden
  // (terugdraaien) óf over de gefilterde lijst `weg`.
  const removes = [...bron.matchAll(/from\('kosten-bijlagen'\)\.remove\((\w+)\)/g)].map((m) => m[1]);
  assert.deepEqual(removes.sort(), ['paden', 'weg']);
  assert.match(functieBron(bron, 'deleteJobCost'), /ruimBonnenOp\(id,/);
  assert.match(lees('app/(more)/expenses.tsx'), /koppelBonnen\(rij\.id, bonnen\)/);
});
