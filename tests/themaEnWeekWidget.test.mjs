/**
 * Thema: knop in de kop (primair) en Weergave in Mijn profiel, één centrale
 * voorkeur, zonder flits; en de weekurenwidget op iPad over de volle breedte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lees = (pad) => readFileSync(new URL('../' + pad, import.meta.url), 'utf8');
const { bepaalThema, leesVoorkeur, THEMA_OPTIES, THEMA_SLEUTEL, themaKnopLabel, volgendThema } = await import('../src/lib/themaKeuze.shared.ts');

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

test('headerknop: wisselt licht ↔ donker en de naam zegt wat een tik doet', () => {
  assert.equal(volgendThema('light'), 'dark');
  assert.equal(volgendThema('dark'), 'light');
  assert.equal(themaKnopLabel('light'), 'Donkere modus inschakelen');
  assert.equal(themaKnopLabel('dark'), 'Lichte modus inschakelen');
  // Een tik op de knop wordt een opgeslagen eigen keuze: leesVoorkeur geeft hem terug.
  assert.equal(leesVoorkeur(volgendThema('light')), 'dark');
  assert.equal(leesVoorkeur(volgendThema('dark')), 'light');
  // Zonder opgeslagen keuze volgt het systeem.
  assert.equal(bepaalThema(null, 'dark'), 'dark');
  assert.equal(bepaalThema(null, 'light'), 'light');
});

test('headerknop: rol, naam, tooltip op web, raakvlak 44×44 en één centrale voorkeur', () => {
  const bron = lees('src/components/ThemeToggleButton.tsx');
  assert.match(bron, /accessibilityRole="button"/);
  assert.match(bron, /accessibilityLabel=\{label\}/);
  assert.match(bron, /const label = themaKnopLabel\(colorMode\)/);
  assert.match(bron, /setAttribute\?\.\('title', label\)/);
  assert.match(bron, /raak: \{ width: 44, height: 44/);
  // Zelfde themastatus als Mijn profiel › Weergave: geen eigen opslag of toggle.
  assert.match(bron, /onPress=\{\(\) => setVoorkeur\(volgendThema\(colorMode\)\)\}/);
  assert.doesNotMatch(bron, /AsyncStorage|localStorage|toggleColorMode/);
  // Alleen een pictogram, geen tekstlabel in de kop.
  assert.doesNotMatch(bron, /<Text/);
  // Focusring voor toetsenbordgebruik op web (role=button).
  assert.match(lees('public/index.html'), /\[role='button'\]:focus-visible[\s\S]*?outline: 2px solid/);
});

test('headerknop in de gedeelde kop, precies één keer', () => {
  const acties = lees('src/components/HeaderActions.tsx');
  assert.equal((acties.match(/<ThemeToggleButton/g) ?? []).length, 1);
  // Volgorde: thema, meldingen, Boss, profiel.
  const i = (s) => acties.indexOf(s);
  assert.ok(i('<ThemeToggleButton') < i('onPress={openMeldingen}') && i('onPress={openMeldingen}') < i('<BossAvatar') && i('<BossAvatar') < i('<ProfileSettingsButton'));
  // AppTopBar: met profielknoppen zit hij in HeaderActions, anders los — nooit allebei.
  const kop = lees('src/components/AppTopBar.tsx');
  assert.match(kop, /\{showProfileButton \? <HeaderActions \/> : <ThemeToggleButton \/>\}/);
  assert.equal((kop.match(/<ThemeToggleButton/g) ?? []).length, 1);
  // Uitgebreidere keuze blijft in Mijn profiel, op dezelfde voorkeur.
  const profiel = lees('src/components/instellingen/ProfielTab.tsx');
  assert.match(profiel, /<Kaart titel="Weergave"[\s\S]*THEMA_OPTIES/);
  assert.match(profiel, /setVoorkeur\(id as ThemaVoorkeur\)/);
  const menu = lees('app/(tabs)/menu.tsx');
  assert.doesNotMatch(menu, /Switch/);
  assert.doesNotMatch(menu, /toggleColorMode|ThemeToggle/);
});

test('één centrale themastatus: alleen de ThemeProvider leest en schrijft de sleutel', () => {
  const provider = lees('src/providers/ThemeProvider.tsx');
  assert.match(provider, /AsyncStorage\.setItem\(STORAGE_KEY, nieuw\)/);
  assert.match(provider, /nieuw === 'systeem' \? AsyncStorage\.removeItem\(STORAGE_KEY\)/);
  for (const pad of ['src/components/ThemeToggleButton.tsx', 'src/components/instellingen/ProfielTab.tsx', 'src/components/HeaderActions.tsx']) {
    assert.doesNotMatch(lees(pad), /bb\.weergave|THEMA_SLEUTEL|AsyncStorage/, pad);
  }
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

test('oude sleutel van de themaknop wordt gewist, zodat iedereen op "Zoals het apparaat" begint', () => {
  assert.notEqual(THEMA_SLEUTEL, 'bb.colorMode');
  assert.match(lees('public/thema-start.js'), /removeItem\('bb\.colorMode'\)/);
  assert.match(lees('src/providers/ThemeProvider.tsx'), /removeItem\(OUDE_THEMA_SLEUTEL\)/);
});

test('geen groene gloed rond knoppen', () => {
  for (const pad of ['src/components/Button.tsx', 'src/components/AppFab.tsx', 'src/components/HeaderIconButton.tsx', 'app/(onboarding)/_components.tsx']) {
    assert.doesNotMatch(lees(pad), /dsShadowGreen|shadowColor: (ds|onb)\.green/, pad);
  }
});

test('weekurenwidget: op iPad onder de kolommen over de volle breedte, op telefoon in de kolom', () => {
  const bron = lees('app/(tabs)/today.tsx');
  assert.match(bron, /\{tablet \? null : dezeWeek\}/);
  assert.match(bron, /\{tablet \? dezeWeek : null\}/);
  const kolommenEinde = bron.indexOf('{tablet ? dezeWeek : null}');
  const overzicht = bron.indexOf('Overzicht: de cijfertegels');
  assert.ok(kolommenEinde > 0 && kolommenEinde < overzicht, 'tussen de kolommen en het overzicht');
});

test('native: opstartscherm blijft staan tot de opgeslagen weergave gelezen is (geen themaflits)', () => {
  const provider = lees('src/providers/ThemeProvider.tsx');
  assert.match(provider, /SplashScreen\.preventAutoHideAsync/);
  assert.match(provider, /SplashScreen\.hideAsync/);
  assert.match(provider, /klaar \? children : null/);
  assert.match(provider, /THEMA_WACHT_MS/);
});

test('native: geen dubbele themaknop — schermen met een eigen AppTopBar verbergen de stackkop met HeaderActions', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  for (const map of ['app/work-orders', 'app/customers', 'app/hours']) {
    assert.match(lees(`${map}/_layout.tsx`), /headerRight: \(\) => <HeaderActions/);
    const bestanden = [];
    const loop = (d) => { for (const n of readdirSync(new URL(`../${d}`, import.meta.url))) { const p = `${d}/${n}`; if (statSync(new URL(`../${p}`, import.meta.url)).isDirectory()) loop(p); else if (p.endsWith('.tsx') && !n.startsWith('_')) bestanden.push(p); } };
    loop(map);
    for (const f of bestanden) {
      const bron = lees(f);
      if (/<AppTopBar/.test(bron)) assert.match(bron, /headerShown: false/, f);
    }
  }
});
