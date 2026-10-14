/** Themaknop in de kop (één bediening, zonder flits) en de weekurenwidget op iPad over de volle breedte. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lees = (pad) => readFileSync(new URL('../' + pad, import.meta.url), 'utf8');
const { bepaalThema, themaKnopLabel, THEMA_SLEUTEL } = await import('../src/lib/themaKeuze.shared.ts');

test('opgeslagen keuze wint; zonder keuze het systeem; anders licht', () => {
  assert.equal(bepaalThema('dark', 'light'), 'dark');
  assert.equal(bepaalThema('light', 'dark'), 'light');
  assert.equal(bepaalThema(null, 'dark'), 'dark');
  assert.equal(bepaalThema(undefined, null), 'light');
  assert.equal(bepaalThema('onzin', 'light'), 'light');
});

test('toegankelijke naam zegt wat een tik doet', () => {
  assert.equal(themaKnopLabel('light'), 'Donkere modus inschakelen');
  assert.equal(themaKnopLabel('dark'), 'Lichte modus inschakelen');
});

test('themaknop: rol, naam, tooltip en raakvlak van 44', () => {
  const bron = lees('src/components/ThemeToggleButton.tsx');
  assert.match(bron, /accessibilityRole="button"/);
  assert.match(bron, /accessibilityLabel=\{label\}/);
  assert.match(bron, /setAttribute\?\.\('title', label\)/);
  assert.match(bron, /raak: \{ width: 44, height: 44/);
});

test('één themabediening: in de kop, niet meer als schakelaar in het menu', () => {
  assert.match(lees('src/components/HeaderActions.tsx'), /<ThemeToggleButton/);
  assert.match(lees('src/components/AppTopBar.tsx'), /showProfileButton \? <HeaderActions \/> : <ThemeToggleButton \/>/);
  const menu = lees('app/(tabs)/menu.tsx');
  assert.doesNotMatch(menu, /Switch/);
  assert.doesNotMatch(menu, /toggleColorMode/);
});

test('geen themaflits: startscript leest dezelfde sleutel vóór de bundel en zit in de precache', () => {
  const start = lees('public/thema-start.js');
  assert.ok(start.includes(`'${THEMA_SLEUTEL}'`));
  assert.match(start, /prefers-color-scheme: dark/);
  const html = lees('public/index.html');
  assert.ok(html.indexOf('/thema-start.js') > 0 && html.indexOf('/thema-start.js') < html.indexOf('</head>'));
  assert.match(lees('scripts/pwa-na-export.mjs'), /'\/thema-start\.js'/);
  // Offline: de service worker moet het startscript ook uit de cache leveren.
  const sw = lees('public/sw.js');
  const statisch = new RegExp(sw.match(/const STATISCH = \/(.+)\/;/)[1]);
  assert.ok(statisch.test('/thema-start.js'));
  assert.match(lees('src/providers/ThemeProvider.tsx'), /useState<ColorMode>\(\(\) =>\s*bepaalThema\(leesOpgeslagenThemaDirect\(\)/);
});

test('weekurenwidget: op iPad onder de kolommen over de volle breedte, op telefoon in de kolom', () => {
  const bron = lees('app/(tabs)/today.tsx');
  assert.match(bron, /\{tablet \? null : dezeWeek\}/);
  assert.match(bron, /\{tablet \? dezeWeek : null\}/);
  const kolommenEinde = bron.indexOf('{tablet ? dezeWeek : null}');
  const overzicht = bron.indexOf('Overzicht: de cijfertegels');
  assert.ok(kolommenEinde > 0 && kolommenEinde < overzicht, 'tussen de kolommen en het overzicht');
});
