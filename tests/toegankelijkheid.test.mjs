/**
 * Toegankelijkheid op web: react-native-web maakt van een Pressable zonder
 * rol een kale <div>. Schermlezers zien dan geen knop. Daarnaast negeert
 * RN-web 0.21 `accessibilityState.checked/selected/expanded/busy`; alleen de
 * `aria-*`-props komen in de DOM. Statische controle op de broncode.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const lees = (pad) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf8');

function bestanden(map) {
  const uit = [];
  for (const naam of readdirSync(new URL(`../${map}`, import.meta.url))) {
    const pad = join(map, naam);
    if (statSync(new URL(`../${pad}`, import.meta.url)).isDirectory()) uit.push(...bestanden(pad));
    else if (pad.endsWith('.tsx')) uit.push(pad);
  }
  return uit;
}

/** Alle openingstags `<Pressable …>` uit een bestand, met regelnummer. */
function pressables(bron) {
  const tags = [];
  const re = /<Pressable\b/g;
  let m;
  while ((m = re.exec(bron))) {
    let i = m.index + m[0].length;
    let diepte = 0;
    for (; i < bron.length; i++) {
      const c = bron[i];
      if (c === '{') diepte++;
      else if (c === '}') diepte--;
      else if (c === '>' && diepte === 0 && bron[i - 1] !== '=') break;
    }
    tags.push({ tag: bron.slice(m.index, i + 1), regel: bron.slice(0, m.index).split('\n').length });
  }
  return tags;
}

test('Button geeft altijd een knoprol, label en status mee', () => {
  const bron = lees('src/components/Button.tsx');
  assert.match(bron, /accessibilityRole=\{accessibilityRole \?\? 'button'\}/);
  assert.match(bron, /accessibilityLabel=\{accessibilityLabel \?\? label\}/);
  assert.match(bron, /accessibilityState=\{\{ disabled: !!isDisabled, busy: !!loading \}\}/);
  assert.match(bron, /aria-busy=/);
});

test('FormFooter gebruikt de toegankelijke Button', () => {
  const bron = lees('src/components/FormFooter.tsx');
  assert.match(bron, /import \{ Button \} from '\.\/Button'/);
  assert.match(bron, /<Button\b/);
  assert.doesNotMatch(bron, /<Pressable\b/);
});

test('elke tikbare Pressable in src/ en app/ heeft een rol', () => {
  // Achtergronden van een modaal (wegklikken) zijn bewust geen knop.
  const uitzonderingen = [/accessible=\{false\}/, /e\.stopPropagation\(\)\}>$/, /styles\.overlay/];
  const fouten = [];
  for (const pad of [...bestanden('src'), ...bestanden('app')]) {
    for (const { tag, regel } of pressables(lees(pad))) {
      if (!/\bonPress=/.test(tag)) continue;
      if (/accessibilityRole=|\brole=/.test(tag)) continue;
      if (pad.endsWith('Button.tsx')) continue; // rol via variabele, hierboven getoetst
      if (uitzonderingen.some((re) => re.test(tag))) continue;
      fouten.push(`${pad}:${regel}`);
    }
  }
  assert.deepEqual(fouten, []);
});

test('checkbox/radio met accessibilityState.checked heeft ook aria-checked (RN-web)', () => {
  const fouten = [];
  for (const pad of [...bestanden('src'), ...bestanden('app')]) {
    for (const { tag, regel } of pressables(lees(pad))) {
      if (!/accessibilityRole="(checkbox|radio)"/.test(tag)) continue;
      if (!/accessibilityState=\{\{[^}]*\b(checked|selected)\b/.test(tag)) continue;
      if (!/aria-checked=/.test(tag)) fouten.push(`${pad}:${regel}`);
    }
  }
  assert.deepEqual(fouten, []);
});

test('WerkbonFormulier: maandnavigatie is een knop, kalenderdagen hebben aria-checked', () => {
  const bron = lees('src/components/WerkbonFormulier.tsx');
  assert.match(bron, /accessibilityRole="button" onPress=\{\(\) => schuif\(-1\)\} accessibilityLabel="Vorige maand"/);
  assert.match(bron, /accessibilityRole="button" onPress=\{\(\) => schuif\(1\)\} accessibilityLabel="Volgende maand"/);
  assert.match(bron, /aria-checked=\{gekozen\.includes\(iso\)\}/);
  // De ploegkeuze (vinkjes + ster) staat sinds de planning in een eigen onderdeel.
  assert.match(bron, /<PloegKeuze/);
  assert.match(lees('src/components/PloegKeuze.tsx'), /aria-checked=\{verantw\}/);
});
