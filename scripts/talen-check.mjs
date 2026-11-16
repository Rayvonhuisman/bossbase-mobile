// Zoekt alle tx()/txn()/txm()-aanroepen in app/ en src/, schrijft de lijst
// bronteksten naar src/i18n/bron.json en meldt per taal wat ontbreekt of niet
// klopt (ontbrekende {plaatshouders}, lege vertalingen, verouderde sleutels).
//
//   node scripts/talen-check.mjs            overzicht
//   node scripts/talen-check.mjs --streng   exitcode 1 bij ontbrekende vertalingen
//   node scripts/talen-check.mjs --ontbrekend de   ontbrekende sleutels van één taal als JSON
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MAPPEN = ['app', 'src'];
const TALEN = ['en', 'de', 'fr', 'es', 'pt', 'pl', 'ro', 'bg', 'uk', 'tr'];
const args = process.argv.slice(2);

function bestanden(dir) {
  const uit = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'i18n') uit.push(...bestanden(p)); }
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !e.name.endsWith('.d.ts')) uit.push(p);
  }
  return uit;
}

const lit = n => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;
const bron = new Map(); // sleutel -> { soort, bestanden:Set, een, meer }
const problemen = [];

for (const f of MAPPEN.flatMap(m => bestanden(path.join(ROOT, m)))) {
  const code = fs.readFileSync(f, 'utf8');
  if (!/\btx[nm]?\(/.test(code)) continue;
  const sf = ts.createSourceFile(f, code, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = path.relative(ROOT, f);
  const bezoek = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const naam = node.expression.text;
      const [a, b, c, d, e] = node.arguments;
      const regel = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const voeg = (sleutel, extra) => {
        const x = bron.get(sleutel) || { ...extra, bestanden: new Set() };
        x.bestanden.add(rel); bron.set(sleutel, x);
      };
      if (naam === 'tx' || naam === 'txm') {
        const s = lit(a);
        const ctx = naam === 'tx' ? lit(c) : null;
        if (s != null) voeg(ctx ? `${ctx}::${s}` : s, { soort: 'tekst' });
        else if (a && ts.isTemplateExpression(a)) problemen.push(`${rel}:${regel} ${naam}() met \${...} in de tekst; gebruik {naam} en vars`);
      } else if (naam === 'txn') {
        const een = lit(a), meer = lit(b), ctx = lit(e);
        if (een != null && meer != null) voeg(ctx ? `${ctx}::${een}|${meer}` : `${een}|${meer}`, { soort: 'meervoud', een, meer });
        else problemen.push(`${rel}:${regel} txn() zonder letterlijke teksten`);
      }
    }
    ts.forEachChild(node, bezoek);
  };
  bezoek(sf);
}

const sleutels = [...bron.keys()].sort();
const uitvoer = Object.fromEntries(sleutels.map(k => [k, { soort: bron.get(k).soort, bestanden: [...bron.get(k).bestanden].sort() }]));
fs.writeFileSync(path.join(ROOT, 'src/i18n/bron.json'), JSON.stringify(uitvoer, null, 1) + '\n');

const houders = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const bronTekst = k => k.includes('::') ? k.split('::').slice(1).join('::') : k;

if (args[0] === '--ontbrekend') {
  const taal = args[1];
  const boek = JSON.parse(fs.readFileSync(path.join(ROOT, `src/i18n/talen/${taal}.json`), 'utf8'));
  const mist = sleutels.filter(k => boek[k] == null || boek[k] === '');
  console.log(JSON.stringify(mist, null, 1));
  process.exit(0);
}

let fout = false;
console.log(`${sleutels.length} teksten (${sleutels.filter(k => bron.get(k).soort === 'meervoud').length} met meervoud)`);
for (const taal of TALEN) {
  const p = path.join(ROOT, `src/i18n/talen/${taal}.json`);
  const boek = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  let mist = 0, oud = 0; const fouten = [];
  for (const k of sleutels) {
    const v = boek[k];
    if (v == null || v === '') { mist++; continue; }
    const x = bron.get(k);
    if (x.soort === 'meervoud') {
      if (typeof v !== 'object' || !v.other) { fouten.push(`${k}: meervoud moet een object met minstens "other" zijn`); continue; }
      const verwacht = houders(x.meer);
      for (const [vorm, tekst] of Object.entries(v)) {
        if (houders(tekst) !== verwacht && houders(tekst) !== houders(x.een)) fouten.push(`${k} [${vorm}]: plaatshouders {${houders(tekst)}} ≠ {${verwacht}}`);
      }
    } else {
      if (typeof v !== 'string') { fouten.push(`${k}: moet tekst zijn`); continue; }
      if (houders(v) !== houders(bronTekst(k))) fouten.push(`${k}: plaatshouders {${houders(v)}} ≠ {${houders(bronTekst(k))}}`);
    }
  }
  for (const k of Object.keys(boek)) if (!bron.has(k)) oud++;
  console.log(`${taal}: ${sleutels.length - mist}/${sleutels.length} vertaald${oud ? `, ${oud} verouderd` : ''}${fouten.length ? `, ${fouten.length} fouten` : ''}`);
  fouten.slice(0, 10).forEach(f => console.log('   ' + f));
  if (mist || fouten.length) fout = true;
}
problemen.slice(0, 30).forEach(p => console.log('! ' + p));
if (problemen.length) fout = true;
if (args.includes('--streng') && fout) process.exit(1);
