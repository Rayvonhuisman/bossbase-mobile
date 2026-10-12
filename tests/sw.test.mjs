/**
 * De service worker (public/sw.js) mag alleen statische appbestanden cachen:
 * nooit API-antwoorden, nooit iets met een Authorization-header, nooit HTML
 * buiten het lege app-omhulsel, en paginabezoeken altijd netwerk-eerst.
 *
 * We draaien het echte bestand in een kale sandbox met nep-`caches` en
 * nep-`fetch`, en kijken wat hij met elk soort verzoek doet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ORIGIN = 'https://app.bossbase.nl';
const bron = (await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'))
  .replace("'__BOSSBASE_BUILD__'", '"testbuild"')
  .replace('/* __BOSSBASE_PRECACHE__ */', '"/index.html"');

function laadServiceWorker({ netwerk }) {
  const handlers = {};
  const opgeslagen = new Map(); // url → Response
  const cache = {
    match: async (req) => opgeslagen.get(typeof req === 'string' ? new URL(req, ORIGIN).href : req.url),
    put: async (req, res) => void opgeslagen.set(req.url, res),
    addAll: async () => {},
  };
  const sandbox = {
    self: {
      location: new URL(ORIGIN + '/sw.js'),
      addEventListener: (type, fn) => (handlers[type] = fn),
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: {
      open: async () => cache,
      match: async (url) => opgeslagen.get(new URL(url, ORIGIN).href),
      keys: async () => [],
      delete: async () => true,
    },
    // Zoals de browser: een antwoord van het eigen domein heeft type "basic".
    fetch: async (req) => {
      const res = await netwerk(req);
      Object.defineProperty(res, 'type', { value: 'basic' });
      return res;
    },
    Request,
    Response,
    URL,
    Promise,
  };
  vm.runInNewContext(bron, sandbox);
  return { handlers, opgeslagen };
}

/** Een fetch-event; geeft terug of en wat de service worker beantwoordde. */
async function verzoek(sw, url, { method = 'GET', mode = 'cors', headers = {} } = {}) {
  let antwoord = null;
  const wachten = [];
  const req = new Request(new URL(url, ORIGIN), { method, headers });
  Object.defineProperty(req, 'mode', { value: mode });
  sw.handlers.fetch({
    request: req,
    respondWith: (p) => (antwoord = p),
    waitUntil: (p) => wachten.push(p),
  });
  const res = antwoord ? await antwoord : null;
  await Promise.all(wachten);
  return res;
}

const js = (body = 'x') =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/javascript' } });

test('Supabase en andere domeinen: nooit aangeraakt', async () => {
  const sw = laadServiceWorker({ netwerk: async () => js() });
  assert.equal(await verzoek(sw, 'https://mawzqpnsluljxpbarhng.supabase.co/rest/v1/klanten'), null);
  assert.equal(await verzoek(sw, 'https://mawzqpnsluljxpbarhng.supabase.co/auth/v1/token'), null);
  assert.equal(sw.opgeslagen.size, 0);
});

test('alleen GET, en nooit met Authorization-header', async () => {
  const sw = laadServiceWorker({ netwerk: async () => js() });
  assert.equal(await verzoek(sw, '/_expo/static/js/web/a.js', { method: 'POST' }), null);
  assert.equal(
    await verzoek(sw, '/_expo/static/js/web/a.js', { headers: { authorization: 'Bearer x' } }),
    null,
  );
  assert.equal(sw.opgeslagen.size, 0);
});

test('querystrings en onbekende paden: niet aangeraakt', async () => {
  const sw = laadServiceWorker({ netwerk: async () => js() });
  assert.equal(await verzoek(sw, '/_expo/static/js/web/a.js?v=1'), null);
  assert.equal(await verzoek(sw, '/api/iets'), null);
  assert.equal(await verzoek(sw, '/rest/v1/klanten'), null);
  assert.equal(sw.opgeslagen.size, 0);
});

test('paginabezoek: netwerk-eerst en nooit bewaard', async () => {
  const sw = laadServiceWorker({
    netwerk: async () => new Response('<html>vers</html>', { headers: { 'content-type': 'text/html' } }),
  });
  const res = await verzoek(sw, '/klanten/123', { mode: 'navigate' });
  assert.equal(await res.text(), '<html>vers</html>');
  assert.equal(sw.opgeslagen.size, 0);
});

test('paginabezoek offline: het lege app-omhulsel', async () => {
  const sw = laadServiceWorker({
    netwerk: async () => {
      throw new TypeError('Load failed');
    },
  });
  sw.opgeslagen.set(ORIGIN + '/index.html', new Response('<html>shell</html>'));
  const res = await verzoek(sw, '/werkbonnen', { mode: 'navigate' });
  assert.equal(await res.text(), '<html>shell</html>');
});

test('gehashte bundel: cache-eerst', async () => {
  let aanroepen = 0;
  const sw = laadServiceWorker({ netwerk: async () => (aanroepen++, js('bundel')) });
  await verzoek(sw, '/_expo/static/js/web/entry-abc.js');
  await verzoek(sw, '/_expo/static/js/web/entry-abc.js');
  assert.equal(aanroepen, 1);
  assert.ok(sw.opgeslagen.has(ORIGIN + '/_expo/static/js/web/entry-abc.js'));
});

test('controle van de test: een gewoon JS-bestand wordt wél bewaard', async () => {
  const sw = laadServiceWorker({ netwerk: async () => js() });
  await verzoek(sw, '/assets/font-abc.ttf');
  assert.equal(sw.opgeslagen.size, 1);
});

test('nooit HTML, no-store of set-cookie in de cache', async () => {
  for (const headers of [
    { 'content-type': 'text/html' },
    { 'content-type': 'text/javascript', 'cache-control': 'no-store' },
    { 'content-type': 'text/javascript', 'cache-control': 'private, max-age=60' },
    { 'content-type': 'text/javascript', 'set-cookie': 'a=b' },
  ]) {
    const sw = laadServiceWorker({ netwerk: async () => new Response('x', { status: 200, headers }) });
    await verzoek(sw, '/_expo/static/js/web/entry-abc.js');
    assert.equal(sw.opgeslagen.size, 0, JSON.stringify(headers));
  }
});

test('mislukte antwoorden worden niet bewaard', async () => {
  const sw = laadServiceWorker({ netwerk: async () => new Response('weg', { status: 404 }) });
  await verzoek(sw, '/_expo/static/js/web/entry-abc.js');
  assert.equal(sw.opgeslagen.size, 0);
});
