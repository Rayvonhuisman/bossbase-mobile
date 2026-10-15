/** Themakeuze in Instellingen (één bediening, zonder flits) en de weekurenwidget op iPad over de volle breedte. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lees = (pad) => readFileSync(new URL('../' + pad, import.meta.url), 'utf8');
const { bepaalThema, leesVoorkeur, THEMA_OPTIES, THEMA_SLEUTEL } = await import('../src/lib/themaKeuze.shared.ts');

test('opgeslagen keuze wint; zonder keuze het systeem; anders licht', () => {
  assert.equal(bepaalThema('dark', 'light'), 'dark');
  assert.equal(bepaalThema('light', 'dark'), 'light');
  assert.equal(bepaalThema(null, 'dark'), 'dark');
  assert.equal(bepaalThema(undefined, null), 'light');
  assert.equal(bepaalThema('onzin', 'light'), 'light');
});

test('voorkeur: opgeslagen licht/donker, anders zoals het apparaat', () => {
  assert.equal(leesVoorkeur('dark'), 'dark');
  assert.equal(leesVoorkeur('light'), 'light');
  assert.equal(leesVoorkeur(null), 'systeem');
  assert.equal(leesVoorkeur('onzin'), 'systeem');
  assert.deepEqual(THEMA_OPTIES.map((o) => o.id), ['light', 'dark', 'systeem']);
});

test('één themabediening: in Instellingen › Mijn profiel, niet in de kop of het menu', () => {
  assert.doesNotMatch(lees('src/components/HeaderActions.tsx'), /ThemeToggle|colorMode/i);
  assert.doesNotMatch(lees('src/components/AppTopBar.tsx'), /ThemeToggle/);
  assert.match(lees('src/components/instellingen/ProfielTab.tsx'), /<Kaart titel="Weergave"[\s\S]*THEMA_OPTIES/);
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
  assert.match(lees('src/providers/ThemeProvider.tsx'), /useState<ThemaVoorkeur>\(\(\) =>\s*leesVoorkeur\(leesOpgeslagenThemaDirect\(\)\)/);
});

test('weekurenwidget: op iPad onder de kolommen over de volle breedte, op telefoon in de kolom', () => {
  const bron = lees('app/(tabs)/today.tsx');
  assert.match(bron, /\{tablet \? null : dezeWeek\}/);
  assert.match(bron, /\{tablet \? dezeWeek : null\}/);
  const kolommenEinde = bron.indexOf('{tablet ? dezeWeek : null}');
  const overzicht = bron.indexOf('Overzicht: de cijfertegels');
  assert.ok(kolommenEinde > 0 && kolommenEinde < overzicht, 'tussen de kolommen en het overzicht');
});
