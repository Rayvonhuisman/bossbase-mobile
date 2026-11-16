// Voegt vertalingen uit een los JSON-bestand samen in src/i18n/talen/<taal>.json.
//   node scripts/talen-voeg-toe.mjs de /pad/naar/stuk.json
// Het stuk is { "Nederlandse bron": "vertaling", "een|meer": { "one": "...", "other": "..." } }.
// Bestaande vertalingen worden overschreven door het stuk; de uitkomst is gesorteerd.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [taal, stuk] = process.argv.slice(2);
if (!taal || !stuk) { console.error('gebruik: node scripts/talen-voeg-toe.mjs <taal> <stuk.json>'); process.exit(1); }
const doel = path.join(ROOT, `src/i18n/talen/${taal}.json`);
const boek = fs.existsSync(doel) ? JSON.parse(fs.readFileSync(doel, 'utf8')) : {};
const nieuw = JSON.parse(fs.readFileSync(stuk, 'utf8'));
Object.assign(boek, nieuw);
const gesorteerd = Object.fromEntries(Object.keys(boek).sort().map(k => [k, boek[k]]));
fs.writeFileSync(doel, JSON.stringify(gesorteerd, null, 1) + '\n');
console.log(`${taal}: ${Object.keys(nieuw).length} toegevoegd, totaal ${Object.keys(gesorteerd).length}`);
