/**
 * iPad en andere schermformaten: welke indeling, hoe breed de kolom, en
 * welke installatie-uitleg. Pure regels, zonder React Native.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.__DEV__ = false;
const regels = await import('../src/lib/schermklasseRegels.ts');
const { bepaalApparaat, isIosSafari, bepaalInstallatieSoort } = await import('../src/lib/pwa.web.ts');
const { bepaalSchermklasse, kolomBreedte, TABLET_VANAF, KOLOM_MAX_TABLET, FORMULIER_MAX } = regels;

const IPAD_PORTRAIT = [744, 768, 810, 820, 834, 1024];
const IPAD_LANDSCAPE = [1024, 1080, 1180, 1194, 1366];
const SPLIT_VIEW = [320, 375, 507, 640];

test('iPad staand en liggend: tabletindeling', () => {
  for (const b of [...IPAD_PORTRAIT, ...IPAD_LANDSCAPE]) assert.equal(bepaalSchermklasse(b, 'web'), 'tablet', String(b));
});

test('Split View en telefoon: telefoonindeling over de volle vensterbreedte', () => {
  for (const b of [...SPLIT_VIEW, 390]) {
    assert.equal(bepaalSchermklasse(b, 'web'), 'telefoon', String(b));
    assert.equal(kolomBreedte(b, 'telefoon'), b, `kolom vult ${b}`);
  }
});

test('grens: 699 telefoon, 700 tablet', () => {
  assert.equal(bepaalSchermklasse(TABLET_VANAF - 1, 'web'), 'telefoon');
  assert.equal(bepaalSchermklasse(TABLET_VANAF, 'web'), 'tablet');
});

test('kolom op tablet en desktop begrensd; formulieren op leesbreedte', () => {
  assert.equal(kolomBreedte(820, 'tablet'), 820);
  assert.equal(kolomBreedte(1180, 'tablet'), KOLOM_MAX_TABLET);
  assert.equal(kolomBreedte(1440, 'tablet'), KOLOM_MAX_TABLET);
  assert.equal(kolomBreedte(1180, 'tablet', 'formulier'), FORMULIER_MAX);
  assert.equal(kolomBreedte(390, 'telefoon', 'formulier'), 390);
});

test('native iOS en Android: zelfde regel als web (iPad = tablet, telefoon = telefoon)', () => {
  assert.equal(bepaalSchermklasse(1024, 'ios'), 'tablet');
  assert.equal(bepaalSchermklasse(820, 'ios'), 'tablet');
  assert.equal(bepaalSchermklasse(507, 'ios'), 'telefoon', 'Split View smal');
  assert.equal(bepaalSchermklasse(430, 'ios'), 'telefoon', 'grote iPhone');
  assert.equal(bepaalSchermklasse(1280, 'android'), 'tablet');
});

const UA = {
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  ipadMobielSafari: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipadPwa: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1',
  ipadInstagram: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36',
};

test('apparaat: iPad die zich als Mac voordoet wordt herkend, een echte Mac niet', () => {
  assert.equal(bepaalApparaat(UA.ipadSafari, 5), 'ipad');
  assert.equal(bepaalApparaat(UA.ipadMobielSafari, 5), 'ipad');
  assert.equal(bepaalApparaat(UA.ipadPwa, 5), 'ipad');
  assert.equal(bepaalApparaat(UA.macSafari, 0), 'computer');
  assert.equal(bepaalApparaat(UA.iphoneSafari, 5), 'iphone');
  assert.equal(bepaalApparaat(UA.android, 5), 'android');
});

test('Safari-advies: Chrome en ingebouwde browsers op iPhone/iPad', () => {
  assert.equal(isIosSafari(UA.ipadSafari), true);
  assert.equal(isIosSafari(UA.ipadMobielSafari), true);
  assert.equal(isIosSafari(UA.iphoneSafari), true);
  assert.equal(isIosSafari(UA.iphoneChrome), false);
  assert.equal(isIosSafari(UA.ipadInstagram), false);
});

test('installatieroute iPad: Delen-instructie, of niets als hij al geïnstalleerd is', () => {
  assert.equal(bepaalInstallatieSoort({ geinstalleerd: false, prompt: false, userAgent: UA.ipadSafari, touchPunten: 5 }), 'ios');
  assert.equal(bepaalInstallatieSoort({ geinstalleerd: true, prompt: false, userAgent: UA.ipadPwa, touchPunten: 5 }), 'geinstalleerd');
});
