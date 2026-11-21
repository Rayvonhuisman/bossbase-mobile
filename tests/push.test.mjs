/**
 * Pushmeldingen in de service worker (public/sw.js): een push wordt getoond
 * met titel en tekst, en tikken opent alleen de eigen app (nooit een vreemde
 * link), bij voorkeur in een venster dat al open staat.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ORIGIN = 'https://app.bossbase.nl';
const bron = (await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'))
  .replace("'__BOSSBASE_BUILD__'", '"testbuild"')
  .replace('/* __BOSSBASE_PRECACHE__ */', '');

function laad({ vensters = [] } = {}) {
  const handlers = {};
  const getoond = [];
  const geopend = [];
  const sandbox = {
    self: {
      location: new URL(ORIGIN + '/sw.js'),
      addEventListener: (type, fn) => (handlers[type] = fn),
      skipWaiting: () => {},
      registration: { showNotification: async (titel, opties) => void getoond.push({ titel, ...opties }) },
      clients: {
        claim: () => {},
        matchAll: async () => vensters,
        openWindow: async (url) => void geopend.push(url),
      },
    },
    caches: { open: async () => ({}), keys: async () => [], delete: async () => true, match: async () => undefined },
    fetch: async () => new Response(''),
    Request, Response, URL, Promise, console,
  };
  vm.runInNewContext(bron, sandbox);
  return { handlers, getoond, geopend };
}

async function event(fn, extra) {
  const wachten = [];
  fn({ waitUntil: (p) => wachten.push(p), ...extra });
  await Promise.all(wachten);
}

test('push: titel, tekst en link worden getoond', async () => {
  const sw = laad();
  const data = { json: () => ({ titel: 'Nieuwe werkbon', tekst: 'WB-012 voor jou', url: `${ORIGIN}/melding?id=x`, tag: 'bb-x' }) };
  await event(sw.handlers.push, { data });
  assert.equal(sw.getoond.length, 1);
  assert.equal(sw.getoond[0].titel, 'Nieuwe werkbon');
  assert.equal(sw.getoond[0].body, 'WB-012 voor jou');
  assert.equal(sw.getoond[0].data.url, `${ORIGIN}/melding?id=x`);
});

test('tikken: eigen link in een nieuw venster', async () => {
  const sw = laad();
  await event(sw.handlers.notificationclick, { notification: { close() {}, data: { url: `${ORIGIN}/melding?id=x` } } });
  assert.deepEqual(sw.geopend, [`${ORIGIN}/melding?id=x`]);
});

test('tikken: een vreemde link opent alleen de app', async () => {
  const sw = laad();
  await event(sw.handlers.notificationclick, { notification: { close() {}, data: { url: 'https://kwaad.example/phish' } } });
  assert.deepEqual(sw.geopend, [`${ORIGIN}/`]);
});

test('tikken: een open venster wordt gebruikt', async () => {
  const naar = [];
  const venster = { url: `${ORIGIN}/today`, focus: async () => {}, navigate: async (u) => void naar.push(u) };
  const sw = laad({ vensters: [venster] });
  await event(sw.handlers.notificationclick, { notification: { close() {}, data: { url: `${ORIGIN}/melding?id=y` } } });
  assert.deepEqual(naar, [`${ORIGIN}/melding?id=y`]);
  assert.equal(sw.geopend.length, 0);
});
