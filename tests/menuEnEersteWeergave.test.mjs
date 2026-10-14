/** iPad-menu in twee onafhankelijke kolommen, en een eerste weergave zonder extra lagen. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { verdeelOverKolommen, sectieGewicht } = await import('../src/lib/menuKolommen.ts');
const { magEntreeAnimeren, resetEersteWeergave } = await import('../src/lib/eersteWeergave.ts');

const sectie = (titel, n) => ({ titel, n });
const gewicht = (s) => sectieGewicht(s.n);
const titels = (kolommen) => kolommen.map((k) => k.map((s) => s.titel));

test('menu van een beheerder: aaneengesloten, in volgorde, kolommen in balans', () => {
  const secties = [sectie('Hoofdmenu', 4), sectie('Uitvoering', 6), sectie('Financieel', 3), sectie('Ondersteuning', 5), sectie('Weergave', 1)];
  const k = verdeelOverKolommen(secties, gewicht);
  assert.deepEqual(titels(k), [['Hoofdmenu', 'Uitvoering'], ['Financieel', 'Ondersteuning', 'Weergave']]);
  assert.deepEqual(k.flat(), secties, 'niets weg, niets dubbel, volgorde gelijk');
});

test('medewerker zonder Financieel: verborgen sectie laat geen plek over', () => {
  const secties = [sectie('Hoofdmenu', 3), sectie('Uitvoering', 4), sectie('Ondersteuning', 5), sectie('Weergave', 1)];
  const k = verdeelOverKolommen(secties, gewicht);
  assert.equal(k.flat().length, 4);
  assert.ok(k.every((kolom) => kolom.length > 0), 'geen lege kolom');
  assert.ok(!k.flat().some((s) => s.titel === 'Financieel'));
});

test('verschillende aantallen onderdelen: knip minimaliseert de hoogste kolom', () => {
  const secties = [sectie('A', 10), sectie('B', 1), sectie('C', 1), sectie('D', 1)];
  assert.deepEqual(titels(verdeelOverKolommen(secties, gewicht)), [['A'], ['B', 'C', 'D']]);
  const veel = [sectie('A', 1), sectie('B', 1), sectie('C', 1), sectie('D', 10)];
  assert.deepEqual(titels(verdeelOverKolommen(veel, gewicht)), [['A', 'B', 'C'], ['D']]);
});

test('één kolom (telefoon, Split View) en terug naar twee', () => {
  const secties = [sectie('A', 2), sectie('B', 2), sectie('C', 2)];
  assert.deepEqual(titels(verdeelOverKolommen(secties, gewicht, 1)), [['A', 'B', 'C']]);
  assert.equal(verdeelOverKolommen(secties, gewicht, 2).length, 2);
  assert.deepEqual(titels(verdeelOverKolommen([sectie('A', 2)], gewicht, 2)), [['A']]);
  assert.deepEqual(verdeelOverKolommen([], gewicht, 2), [[]]);
});

test('menu gebruikt geen rij-wrap-raster meer, wel twee kolommen uit één lijst', () => {
  const bron = readFileSync(new URL('../app/(tabs)/menu.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(bron, /flexWrap: 'wrap'/);
  assert.doesNotMatch(bron, /width: '50%'/);
  assert.match(bron, /verdeelOverKolommen\(blokken/);
});

test('eerste weergave: geen ingang-animatie, daarna wel', () => {
  resetEersteWeergave();
  assert.equal(magEntreeAnimeren(), false);
  assert.equal(magEntreeAnimeren(), true);
  assert.equal(magEntreeAnimeren(), true);
});

test('AnimatedScreen houdt geen opacity/transform vast in rust', () => {
  const bron = readFileSync(new URL('../src/components/AnimatedScreen.tsx', import.meta.url), 'utf8');
  assert.match(bron, /style=\{inRust \? style :/);
  assert.match(bron, /magEntreeAnimeren\(\)/);
});

test('AppScreen dwingt op web geen extra compositielaag af', () => {
  const bron = readFileSync(new URL('../src/components/AppScreen.tsx', import.meta.url), 'utf8');
  assert.match(bron, /transform: 'none'/);
});

test('viewport: verschuiving zonder toetsenbord geeft geen hoogte of transform', async () => {
  const { berekenViewport } = await import('../src/lib/zichtbareViewport.web.ts');
  assert.deepEqual(berekenViewport({ height: 820, offsetTop: 24, scale: 1 }, 844), { hoogte: null, boven: 0, toetsenbordOpen: false });
  assert.equal(berekenViewport({ height: 500, offsetTop: 300, scale: 1 }, 844).boven, 300);
});

test('viewport-luisteraars worden opgeruimd', async () => {
  const doel = () => ({ addEventListener() {}, removeEventListener() {} });
  globalThis.window ??= { ...doel(), visualViewport: { ...doel(), height: 844, offsetTop: 0, scale: 1 }, innerHeight: 844, scrollTo() {} };
  globalThis.document ??= { ...doel(), documentElement: { clientHeight: 844 } };
  const { abonneer, aantalLuisteraars } = await import('../src/lib/zichtbareViewport.web.ts');
  const voor = aantalLuisteraars();
  const af1 = abonneer(() => {});
  const af2 = abonneer(() => {});
  assert.equal(aantalLuisteraars(), voor + 2);
  af1(); af2();
  assert.equal(aantalLuisteraars(), voor);
});
