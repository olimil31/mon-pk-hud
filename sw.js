/* =====================================================================
   sw.js — hors-ligne
   ---------------------------------------------------------------------
   Stratégie : le coquillage (HTML/CSS/JS/données embarquées) est mis en
   cache à l'installation. Il est immuable tant que VERSION n'est pas
   incrémentée → lecture cache d'abord, sans scintillement ni attente.

   Les shards PK (pks_<code>.js, sur github.io/mon-pk) sont mis en cache à
   la première visite d'une ligne et jamais invalidés : ils sont immuables
   eux aussi tant que le dépôt amont ne change pas.

   ⚠ À FAIRE : incrémenter VERSION à chaque déploiement.
   ===================================================================== */

var VERSION = 'v5';
var SHELL = VERSION + '-shell';
var SHARDS = VERSION + '-shards';

var SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/geo.js',
  './js/shards.js',
  './js/icons.js',
  './js/data.js',
  './js/app.js',
  './data/regions.js',
  './data/zones.js',
  './data/pk_lines.js',
  './data/routes.js',
  './data/signals_osm.js',
  './data/sigmap_signals.js',
  './data/signals_local.js',
  './data/pn_osm.js',
  './data/stations_osm.js',
  './data/sncf_gares.js',
  './data/sncf_vmax.js',
  './data/sncf_cantonnement.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      // addAll() est atomique : une seule URL en 404 fait échouer l'install.
      // each() + add() tolère un fichier manquant au lieu de tout casser.
      return Promise.all(SHELL_FILES.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== SHARDS) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  var sameOrigin = url.origin === self.location.origin;
  var isShard = /pks_\d+\.js$/.test(url.pathname);
  if (!sameOrigin && !isShard) return;

  var cacheName = isShard && !sameOrigin ? SHARDS : SHELL;

  e.respondWith(
    caches.open(cacheName).then(function (cache) {
      return cache.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (resp) {
          // On ne met en cache que les réponses valides : un 404 ou une
          // page d'erreur ne doit pas polluer le cache hors-ligne.
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            cache.put(req, resp.clone()).catch(function () {});
          }
          return resp;
        }).catch(function () {
          // Réseau indisponible : navigation → coquillage déjà en cache.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Hors-ligne' });
        });
      });
    })
  );
});
