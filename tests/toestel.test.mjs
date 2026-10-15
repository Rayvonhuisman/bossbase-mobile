/**
 * iOS/Android-app: verversen bij terugkeren en ruimte voor het toetsenbord.
 * Pure regels, zonder React Native.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { moetVerversenBijActief, toetsenbordRuimte } = await import('../src/lib/toestelRegels.ts');
const lees = (pad) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf8');

test('web ververst bij elke terugkeer naar active', () => {
  assert.equal(moetVerversenBijActief('web', 'inactive'), true);
  assert.equal(moetVerversenBijActief('web', 'background'), true);
  assert.equal(moetVerversenBijActief('web', undefined), true);
});

test('native ververst alleen na de achtergrond, niet na een kort inactive', () => {
  assert.equal(moetVerversenBijActief('ios', 'background'), true);
  assert.equal(moetVerversenBijActief('android', 'background'), true);
  // Face ID, systeemmelding, Bedieningspaneel
  assert.equal(moetVerversenBijActief('ios', 'inactive'), false);
  assert.equal(moetVerversenBijActief('ios', 'active'), false);
  assert.equal(moetVerversenBijActief('ios', null), false);
});

test('useLaden luistert ook native naar AppState (niet meer alleen web)', () => {
  const src = lees('src/lib/useLaden.ts');
  assert.match(src, /moetVerversenBijActief\(Platform\.OS/);
  assert.doesNotMatch(src, /Platform\.OS !== 'web' \|\| !bijFocus/);
});

test('toetsenbordruimte rekent in venstercoördinaten (pageSheet begint lager)', () => {
  // iPhone 15: scherm 852 hoog, vel begint op 59, toetsenbord (336) vanaf 516.
  assert.equal(toetsenbordRuimte(59, 852 - 59, 516), 336);
  // Vlak dat al boven het toetsenbord eindigt: geen ruimte.
  assert.equal(toetsenbordRuimte(0, 400, 516), 0);
  // iPad: gecentreerd formSheet 120..740, toetsenbord vanaf 690.
  assert.equal(toetsenbordRuimte(120, 620, 690), 50);
});

test('toetsenbordruimte: overvloeien (screenY 0) en onzinwaarden geven 0', () => {
  assert.equal(toetsenbordRuimte(59, 793, 0), 0);
  assert.equal(toetsenbordRuimte(Number.NaN, 793, 516), 0);
  assert.equal(toetsenbordRuimte(59, 793, Number.POSITIVE_INFINITY), 0);
});

test('formuliervellen gebruiken geen KeyboardAvoidingView zonder vensteroffset', () => {
  assert.doesNotMatch(lees('src/components/FormSheet.tsx'), /<KeyboardAvoidingView/);
  assert.match(lees('src/components/FormSheet.tsx'), /<ToetsenbordVlak/);
  const werkbon = lees('app/work-orders/[id].tsx');
  assert.doesNotMatch(werkbon, /<KeyboardAvoidingView/);
  // Elke formSheet-ScrollView met invoer (notitie, materiaal, uren) en de
  // hoofdlijst met de inline taakinvoer laat iOS de inset zelf zetten.
  assert.equal(werkbon.match(/automaticallyAdjustKeyboardInsets/g)?.length, 4);
  // De vellen uit app-verbeteren volgen hetzelfde patroon.
  for (const pad of ['src/components/werkbon/AfrondenModal.tsx', 'src/components/werkbon/WaarschuwingModal.tsx']) {
    const bron = lees(pad);
    assert.doesNotMatch(bron, /KeyboardAvoidingView/, pad);
    assert.match(bron, /<VelStatusbalk \/>/, pad);
    assert.match(bron, /keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets/, pad);
  }
});

test('geen keyboardDismissMode on-drag: scrollen sluit het toetsenbord niet', () => {
  for (const pad of ['src/components/FormSheet.tsx', 'src/components/AppScreen.tsx', 'app/work-orders/[id].tsx']) {
    assert.doesNotMatch(lees(pad), /keyboardDismissMode="on-drag"/, pad);
  }
});

test('externe links lopen via openExtern (nette melding bij weigering)', () => {
  for (const pad of [
    'app/(more)/invoices.tsx',
    'app/(more)/offers.tsx',
    'app/(more)/expenses.tsx',
    'app/(more)/support.tsx',
    'app/(tabs)/menu.tsx',
    'src/components/project/ProjectDetailScherm.tsx',
    'src/components/instellingen/ProfielTab.tsx',
    'app/work-orders/[id].tsx',
    'app/(onboarding)/account.tsx',
  ]) {
    assert.doesNotMatch(lees(pad), /Linking\.openURL/, pad);
  }
});
