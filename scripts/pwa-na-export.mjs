#!/usr/bin/env node
/**
 * Na `expo export --platform web`: de service worker afmaken.
 *
 * Expo kopieert `public/sw.js` letterlijk naar de export. Hier vullen we twee
 * dingen in die pas na het bundelen bekend zijn:
 *
 * - de lijst bestanden die bij installatie in de cache gaan (het app-omhulsel:
 *   index.html, de JavaScript-bundel, de lettertypes, manifest en iconen);
 * - een build-ID: een hash over precies die bestanden. Verandert de app, dan
 *   verandert de hash, dan verandert `sw.js` — en dat is voor de browser het
 *   signaal om de nieuwe versie te installeren en de oude cache op te ruimen.
 *
 * Gebruik: node scripts/pwa-na-export.mjs [exportmap]   (standaard: dist)
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const MAP = process.argv[2] ?? 'dist';

async function alleBestanden(map) {
  const uit = [];
  for (const naam of await readdir(map)) {
    const pad = join(map, naam);
    if ((await stat(pad)).isDirectory()) uit.push(...(await alleBestanden(pad)));
    else uit.push(pad);
  }
  return uit;
}

const urlVan = (pad) => '/' + relative(MAP, pad).split(sep).join('/');

const bestanden = (await alleBestanden(MAP)).map(urlVan);
const precache = bestanden
  .filter(
    (url) =>
      url === '/index.html' ||
      url === '/manifest.webmanifest' ||
      url === '/favicon.ico' ||
      url === '/thema-start.js' ||
      url === '/apple-touch-icon.png' ||
      /^\/icons\/[^/]+\.png$/.test(url) ||
      /^\/_expo\/static\/(js|css)\/web\/[^/]+\.(js|css)$/.test(url) ||
      /^\/assets\/.+\.(ttf|otf|woff2?)$/.test(url),
  )
  .sort();

for (const nodig of ['/index.html', '/manifest.webmanifest', '/sw.js']) {
  if (!bestanden.includes(nodig)) throw new Error(`${nodig} ontbreekt in ${MAP} — is public/ meegekopieerd?`);
}
if (!precache.some((url) => url.startsWith('/_expo/static/js/web/'))) {
  throw new Error('Geen webbundel gevonden in _expo/static/js/web — draai eerst `expo export --platform web`.');
}

const hash = createHash('sha256');
for (const url of precache) {
  hash.update(url);
  hash.update(await readFile(join(MAP, url)));
}
const build = hash.digest('hex').slice(0, 16);

const swPad = join(MAP, 'sw.js');
let sw = await readFile(swPad, 'utf8');
if (!sw.includes("'__BOSSBASE_BUILD__'") || !sw.includes('/* __BOSSBASE_PRECACHE__ */')) {
  throw new Error('sw.js bevat de plaatshouders niet (al ingevuld, of public/sw.js gewijzigd?).');
}
sw = sw
  .replace("'__BOSSBASE_BUILD__'", JSON.stringify(build))
  .replace('/* __BOSSBASE_PRECACHE__ */', precache.map((u) => JSON.stringify(u)).join(', '));
await writeFile(swPad, sw);

// Controle: verwijst index.html naar het manifest?
const html = await readFile(join(MAP, 'index.html'), 'utf8');
if (!html.includes('rel="manifest"')) throw new Error('index.html linkt niet naar het manifest.');

console.log(`PWA: sw.js build ${build}, ${precache.length} bestanden in de precache.`);
