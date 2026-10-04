/* =====================================================================
   shards.js — chargement à la demande de la géométrie PK
   ---------------------------------------------------------------------
   Source : dépôt « mon-pk » (Nicolas Wurtz, ODbL 1.0) — un fichier
   pks_<code>.js par ligne, ~29 Ko. On ne charge que la ligne détectée.

   Pourquoi fetch() et pas <script src> : le fichier amont déclare
   « const pkData = [...] ». L'injecter en <script> pollue le scope global
   et plante au 2e chargement (SyntaxError sur redéclaration) — c'est
   exactement ce que fait l'amont, qui recharge une balise à chaque fois.
   On lit donc le texte en fetch() et on n'en garde que le littéral JSON :
   aucun global, aucun conflit, et le cache disque est possible.

   Repli hors-ligne : les lignes dont la géométrie est déjà embarquée dans
   data/pk_lines.js restent utilisables sans réseau.
   ===================================================================== */

var PkShards = (function () {
  'use strict';

  var BASES = [
    'https://olimil31.github.io/mon-pk/',
    'https://raw.githubusercontent.com/olimil31/mon-pk/main/'
  ];
  var CACHE_PREFIX = 'monpk.pk.';
  var CACHE_MAX = 12;          // lignes conservées dans localStorage (~350 Ko)
  var TIMEOUT_MS = 8000;
  var inflight = {};

  function cacheKey(code) { return CACHE_PREFIX + code; }

  function cacheGet(code) {
    try {
      var raw = localStorage.getItem(cacheKey(code));
      if (!raw) return null;
      var arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length ? arr : null;
    } catch (e) { return null; }
  }

  function cacheSet(code, pts) {
    try {
      localStorage.setItem(cacheKey(code), JSON.stringify(pts));
    } catch (e) { /* quota atteint : on continue sans cache disque */ }
    // Purge LRU : le localStorage est partagé avec les rappels.
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(CACHE_PREFIX) === 0) keys.push(k);
      }
      if (keys.length > CACHE_MAX) {
        keys.sort();
        for (var j = 0; j < keys.length - CACHE_MAX; j++) localStorage.removeItem(keys[j]);
      }
    } catch (e) {}
  }

  function fetchText(url) {
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function fetchFrom(baseIdx, code) {
    if (baseIdx >= BASES.length) return Promise.reject(new Error('source PK indisponible'));
    return fetchText(BASES[baseIdx] + 'pks_' + code + '.js');
  }

  /* Le shard est « const pkData = [ ... ]; » : on isole le littéral. */
  function parseShard(text) {
    var i = text.indexOf('[');
    var j = text.lastIndexOf(']');
    if (i < 0 || j <= i) throw new Error('shard illisible');
    var lit = text.slice(i, j + 1);
    try {
      return JSON.parse(lit);
    } catch (e) {
      return new Function('return ' + lit)();   // repli si JSON non strict
    }
  }

  function load(code) {
    if (inflight[code]) return inflight[code];

    var cached = cacheGet(code);
    if (cached) return Promise.resolve(cached);

    inflight[code] = fetchFrom(0, code)
      .catch(function () { return fetchFrom(1, code); })
      .then(parseShard)
      .then(function (arr) {
        if (!Array.isArray(arr) || !arr.length) throw new Error('shard vide');
        cacheSet(code, arr);
        delete inflight[code];
        return arr;
      }, function (e) {
        delete inflight[code];
        throw e;
      });
    return inflight[code];
  }

  return { load: load, BASES: BASES, cacheGet: cacheGet };
})();
