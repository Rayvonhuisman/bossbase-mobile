/*
 * BossBase — service worker.
 *
 * Bewust minimaal. Deze service worker maakt de app installeerbaar en laat het
 * app-omhulsel (HTML, JavaScript, lettertypes, iconen) snel laden. Meer niet.
 *
 * Wat hij NOOIT doet:
 * - Iets van Supabase aanraken. Database, login, opslag en edge functions
 *   draaien op een ander domein; verzoeken naar een ander domein laat deze
 *   service worker ongemoeid door. Er komt dus nooit een API-antwoord, token,
 *   klant, werkbon of foto in een cache.
 * - Verzoeken met een Authorization-header, of iets anders dan GET, afhandelen.
 * - Een paginabezoek bewaren. Pagina's komen altijd eerst van het netwerk; pas
 *   als er geen netwerk is, valt hij terug op het lege app-omhulsel.
 * - Achtergrond-synchronisatie, pushberichten of offline gegevens.
 *
 * Updates: de build-ID hieronder wordt na `expo export` ingevuld door
 * `scripts/pwa-na-export.mjs` (een hash over de app-bestanden). Elke nieuwe
 * build levert daardoor een ander `sw.js` op; de browser installeert hem, hij
 * neemt meteen over (`skipWaiting`) en ruimt de caches van oude versies op.
 * Omdat paginabezoeken netwerk-eerst gaan, start iedereen na een deploy op de
 * nieuwe versie — niemand blijft hangen op een oude.
 *
 * Noodrem: wil je de service worker ooit helemaal kwijt, publiceer dan een
 * `sw.js` die in `activate` alle caches wist en `self.registration.unregister()`
 * aanroept.
 */

const BUILD = '__BOSSBASE_BUILD__';
const PRECACHE = [/* __BOSSBASE_PRECACHE__ */];

const CACHE_PREFIX = 'bossbase-static-';
const CACHE = CACHE_PREFIX + BUILD;
const APP_SHELL = '/index.html';

/** Bestanden met een hash in de naam: veranderen nooit, dus cache-eerst. */
const ONVERANDERLIJK = /^\/(_expo\/static\/|assets\/)/;
/** Overige statische bestanden: uit de cache, op de achtergrond ververst. */
const STATISCH = /^\/(icons\/[^/]+\.png|apple-touch-icon\.png|favicon\.ico|manifest\.webmanifest)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `cache: 'reload'`: nooit een verouderde kopie uit de HTTP-cache van de
      // browser in een nieuwe versie stoppen.
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((namen) =>
        Promise.all(
          namen
            .filter((naam) => naam.startsWith(CACHE_PREFIX) && naam !== CACHE)
            .map((naam) => caches.delete(naam)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('authorization')) return;

  const url = new URL(req.url);
  // Ander domein (Supabase, Google, …): niet aankomen.
  if (url.origin !== self.location.origin) return;

  // Paginabezoek: altijd netwerk-eerst en nooit opslaan. Alleen offline het
  // lege omhulsel, zodat de app opent en zelf meldt dat er geen verbinding is.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(APP_SHELL).then((shell) => shell || Response.error()),
      ),
    );
    return;
  }

  // Alles met een querystring of buiten de bekende statische paden: niet
  // aankomen.
  if (url.search) return;

  if (ONVERANDERLIJK.test(url.pathname)) {
    event.respondWith(cacheEerst(req));
    return;
  }
  if (STATISCH.test(url.pathname)) {
    event.respondWith(cacheDanNetwerk(req, event));
  }
});

async function cacheEerst(req) {
  const cache = await caches.open(CACHE);
  const bewaard = await cache.match(req);
  if (bewaard) return bewaard;
  const antwoord = await fetch(req);
  if (magBewaren(antwoord)) cache.put(req, antwoord.clone());
  return antwoord;
}

async function cacheDanNetwerk(req, event) {
  const cache = await caches.open(CACHE);
  const bewaard = await cache.match(req);
  const vers = fetch(req)
    .then((antwoord) => {
      if (magBewaren(antwoord)) cache.put(req, antwoord.clone());
      return antwoord;
    })
    .catch(() => bewaard);
  if (bewaard) {
    event.waitUntil(vers);
    return bewaard;
  }
  return vers;
}

/**
 * Alleen complete antwoorden van het eigen domein, nooit iets persoonlijks.
 *
 * En nooit HTML: vraagt een oude pagina na een deploy om een bundel die niet
 * meer bestaat, en geeft de server dan (verkeerd ingesteld) `index.html` terug,
 * dan mag die nooit als JavaScript-bestand in de cache belanden.
 */
function magBewaren(antwoord) {
  return (
    antwoord &&
    antwoord.ok &&
    antwoord.type === 'basic' &&
    !antwoord.headers.has('set-cookie') &&
    !/no-store|private/i.test(antwoord.headers.get('cache-control') || '') &&
    !/text\/html/i.test(antwoord.headers.get('content-type') || '')
  );
}
