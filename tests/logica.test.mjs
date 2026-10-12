/**
 * Pure logica achter het toetsenbord, de installatieknop en de
 * netwerkfoutmelding. De TypeScript-bestanden draaien rechtstreeks in Node
 * (type-stripping); ze hebben geen React Native nodig.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.__DEV__ = false;
const { berekenViewport } = await import('../src/lib/zichtbareViewport.web.ts');
const { bepaalInstallatieSoort } = await import('../src/lib/pwa.web.ts');
const { isNetwerkfout } = await import('../src/lib/netwerkfout.ts');

test('toetsenbord: geen visual viewport of ingezoomd → volle ruimte', () => {
  assert.equal(berekenViewport(null, 844).hoogte, null);
  assert.equal(berekenViewport({ height: 400, offsetTop: 0, scale: 2 }, 844).hoogte, null);
});

test('toetsenbord dicht → volle ruimte, niets aangepast', () => {
  assert.deepEqual(berekenViewport({ height: 844, offsetTop: 0, scale: 1 }, 844), {
    hoogte: null,
    boven: 0,
    toetsenbordOpen: false,
  });
  // Een paar pixels verschil (adresbalk) is geen toetsenbord.
  assert.equal(berekenViewport({ height: 790, offsetTop: 0, scale: 1 }, 844).toetsenbordOpen, false);
});

test('toetsenbord open → hoogte en verschuiving van het zichtbare deel', () => {
  assert.deepEqual(berekenViewport({ height: 507.6, offsetTop: 300.2, scale: 1 }, 844), {
    hoogte: 508,
    boven: 300,
    toetsenbordOpen: true,
  });
  // iOS kan bij terugveren kort een negatieve offset geven.
  assert.equal(berekenViewport({ height: 508, offsetTop: -4, scale: 1 }, 844).boven, 0);
});

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile';

test('installeren: al geïnstalleerd → geen melding, ook niet op iPhone', () => {
  const s = { geinstalleerd: true, prompt: true, userAgent: IPHONE, touchPunten: 5 };
  assert.equal(bepaalInstallatieSoort(s), 'geinstalleerd');
});

test('installeren: browserprompt gaat voor', () => {
  const s = { geinstalleerd: false, prompt: true, userAgent: ANDROID, touchPunten: 5 };
  assert.equal(bepaalInstallatieSoort(s), 'prompt');
});

test('installeren: iPhone en iPad (die zich als Mac voordoet) → Delen-instructie', () => {
  assert.equal(bepaalInstallatieSoort({ geinstalleerd: false, prompt: false, userAgent: IPHONE, touchPunten: 5 }), 'ios');
  assert.equal(bepaalInstallatieSoort({ geinstalleerd: false, prompt: false, userAgent: IPAD, touchPunten: 5 }), 'ios');
  // Een echte Mac heeft geen touchscreen.
  assert.equal(bepaalInstallatieSoort({ geinstalleerd: false, prompt: false, userAgent: IPAD, touchPunten: 0 }), 'handmatig');
});

test('netwerkfout: ook de meldingen van Safari en Firefox', () => {
  for (const m of [
    'TypeError: Load failed',
    'Failed to fetch',
    'Network request failed',
    'NetworkError when attempting to fetch resource.',
    'The network connection was lost.',
    'The Internet connection appears to be offline.',
  ]) {
    assert.equal(isNetwerkfout(m), true, m);
  }
  for (const m of ['permission denied for table klanten', 'JWT expired', '', null, undefined]) {
    assert.equal(isNetwerkfout(m), false, String(m));
  }
});
