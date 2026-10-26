/** Native iOS/iPadOS gelijk aan de PWA: iPad-indeling, configuratie, thema bij koude start. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lees = (pad) => readFileSync(new URL('../' + pad, import.meta.url), 'utf8');
const { bepaalSchermklasse, kolomMax } = await import('../src/lib/schermklasseRegels.ts');

test('iPad-formaten krijgen native de tabletindeling, telefoons en smalle Split View niet', () => {
  for (const b of [768, 820, 834, 1024, 1180, 1194, 1366]) assert.equal(bepaalSchermklasse(b, 'ios'), 'tablet', String(b));
  for (const b of [320, 375, 390, 430, 507, 694]) assert.equal(bepaalSchermklasse(b, 'ios'), 'telefoon', String(b));
});

test('native kader: gecentreerde kolom op tablet, niets op telefoon', () => {
  const bron = lees('src/components/MobielKader.tsx');
  assert.match(bron, /kolomMax\(bepaalSchermklasse\(width\), soort\)/);
  assert.match(bron, /if \(soort === 'formulier' \|\| width <= max\) return <>\{children\}<\/>;/);
  assert.equal(kolomMax('tablet'), 880);
  assert.equal(kolomMax('tablet', 'formulier'), 600);
});

test('app-configuratie: echte iPad-app, iPhone staand, iPad alle oriëntaties, multitasking', () => {
  const cfg = lees('app.config.ts');
  assert.match(cfg, /supportsTablet: true/);
  assert.match(cfg, /orientation: 'portrait'/);
  const ipad = cfg.slice(cfg.indexOf("'UISupportedInterfaceOrientations~ipad'"), cfg.indexOf('],', cfg.indexOf("'UISupportedInterfaceOrientations~ipad'")));
  for (const o of ['Portrait', 'PortraitUpsideDown', 'LandscapeLeft', 'LandscapeRight']) assert.ok(ipad.includes(`UIInterfaceOrientation${o}'`), o);
  assert.match(cfg, /userInterfaceStyle: 'automatic'/);
  assert.doesNotMatch(cfg, /UIRequiresFullScreen/);
  assert.match(cfg, /photosPermission:/);
  assert.match(cfg, /cameraPermission:/);
});

test('native thema: opstartscherm blijft tot de keuze gelezen is, met noodtijd', () => {
  const bron = lees('src/providers/ThemeProvider.tsx');
  assert.match(bron, /if \(NATIVE\) SplashScreen\.preventAutoHideAsync\(\)/);
  assert.match(bron, /\.finally\(\(\) => \{\s*if \(mounted\) setKlaar\(true\);/);
  assert.match(bron, /THEMA_WACHT_MS = 1500/);
  assert.match(bron, /SplashScreen\.hideAsync\(\)/);
  assert.match(bron, /\{klaar \? children : null\}/);
});

test('PWA-only onderdelen niet in de native app', () => {
  assert.match(lees('app/installeren.tsx'), /if \(Platform\.OS !== 'web'\) return <Redirect href="\/" \/>;/);
  assert.match(lees('src/lib/pwa.ts'), /export function registreerServiceWorker\(\): void \{\}/);
  assert.match(lees('src/components/InstalleerBossBase.tsx'), /if \(soort === 'native' \|\| soort === 'geinstalleerd'\) return null;/);
});

test('scrollen sluit het toetsenbord niet in formulieren', () => {
  assert.doesNotMatch(lees('src/components/FormSheet.tsx'), /on-drag/);
});

test('Info.plist: gebruiksteksten dekken werkbon, kostenbon en project; Google Maps-query; geen oriëntatielock-module', () => {
  const cfg = lees('app.config.ts');
  const tekst = (sleutel) => cfg.match(new RegExp(`${sleutel}:\\s*'((?:[^'\\\\]|\\\\.)*)'`))?.[1] ?? '';
  for (const sleutel of ['photosPermission', 'cameraPermission']) {
    const t = tekst(sleutel);
    for (const woord of ['werkbonnen', 'kostenbonnen', 'projecten']) assert.ok(t.includes(woord), `${sleutel}: ${woord}`);
  }
  assert.match(cfg, /LSApplicationQueriesSchemes: \['comgooglemaps'\]/);
  const pkg = JSON.parse(lees('package.json'));
  assert.equal(pkg.dependencies['expo-screen-orientation'], undefined);
});

test('interne previewbuild: eigen kanaal, wél de Supabase-variabelen van de app; geen microfoontekst', () => {
  const eas = JSON.parse(lees('eas.json'));
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.preview.channel, 'preview');
  assert.equal(eas.build.preview.environment, 'production');
  assert.equal(eas.build.production.channel, 'production');
  assert.match(lees('app.config.ts'), /microphonePermission: false/);
  assert.match(lees('app.config.ts'), /version: '0\.2\.0'/);
});
