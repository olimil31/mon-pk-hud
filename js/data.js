/* =====================================================================
   data.js — PK (lignes), signaux, passages à niveau, gares, info ligne
   Dépend de : geo.js, shards.js et des fichiers data/*.js
   ===================================================================== */

var PkStore = (function () {
  'use strict';

  var embedded = (typeof pkLines !== 'undefined') ? pkLines : {};
  var lines = {};                                                  // géométrie chargée
  // Attention : ne pas s'appeler `zones` — le var hoité masquerait le global
  // et zonesCovering() renvoie alors toujours une liste vide.
  var zoneList = (typeof zones !== 'undefined') ? zones : [];
  var loading = {};
  var MAX_CANDIDATES = 6;      // lignes voisines essayées en parallèle

  function get(code) { return lines[code] || null; }
  function has(code) { return !!lines[code]; }
  function all() { return lines; }
  function isEmbedded(code) { return !!embedded[code]; }
  function zoneCount() { return zoneList.length; }

  /* Géométrie utilisable pour un simple calcul (région, simulation) sans
     déclencher de chargement réseau. */
  function points(code) { return lines[code] || embedded[code] || null; }

  /* Toutes les lignes connues : embarquées +chargées + en cours de chargement. */
  function codes() {
    var seen = {}, out = [], src = [embedded, lines, loading], i, k;
    for (i = 0; i < src.length; i++) {
      for (k in src[i]) if (!seen[k]) { seen[k] = 1; out.push(k); }
    }
    out.sort();
    return out;
  }

  /* Codes de lignes dont l'emprise contient le point. Ne filtre plus sur
     "lignes connues" : les 1005 shards du dépôt mon-pk sont joignables. */
  function zonesCovering(lat, lon, marginDeg) {
    if (typeof marginDeg !== 'number') marginDeg = 0.002;
    var out = [];
    for (var i = 0; i < zoneList.length; i++) {
      var z = zoneList[i];
      if (lat >= z.latMin - marginDeg && lat <= z.latMax + marginDeg &&
          lon >= z.lonMin - marginDeg && lon <= z.lonMax + marginDeg) {
        out.push(z.code_ligne);
      }
    }
    return out;
  }

  /* Charge la géométrie d'une ligne, une seule fois.
     Ordre : mémoire -> cache disque -> dépôt mon-pk -> copie embarquée. */
  function ensure(code) {
    if (lines[code]) return Promise.resolve(lines[code]);
    if (loading[code]) return loading[code];
    var remote = (typeof PkShards !== 'undefined')
      ? PkShards.load(code)
      : Promise.reject(new Error('chargeur de shards absent'));
    loading[code] = remote
      .catch(function () {
        if (!embedded[code]) throw new Error('ligne ' + code + ' indisponible');
        return embedded[code];
      })
      .then(function (pts) { lines[code] = pts; delete loading[code]; return pts; },
            function (e) { delete loading[code]; throw e; });
    return loading[code];
  }

  function ensureAll(codes) {
    return Promise.all(codes.map(function (c) {
      return ensure(c).then(function () { return c; }, function () { return null; });
    }));
  }

  /* Localisation. Asynchrone : le découpage par zone évite de charger
     toute la France, et `prefer` garde la ligne courante en tête (les
     emprises se chevauchent aux bifurcations).

     Ne renvoie plus `null` mais un objet résultat :
       { ok: true, line, pk, dist, offset, segBearing, diag }
       { ok: false, diag }
     `diag.why` distingue les échecs — sans ça, « hors zone connue » mélange
     une position hors réseau, un chargement de shard échoué et une voie
     simplement trop loin, et impossible de comprendre ce qui se passe. */
  function locate(lat, lon, opts) {
    opts = opts || {};
    var maxDist = opts.maxDist || 500;
    var diag = {
      lat: lat, lon: lon, maxDist: maxDist,
      candidates: [], loaded: [], failed: [], nearest: null, why: '', zoneCount: 0
    };
    var codes;
    if (opts.line) {
      codes = [opts.line];
      diag.candidates = codes.slice();
    } else {
      codes = zonesCovering(lat, lon);
      diag.candidates = codes.slice();
      if (opts.prefer && codes.indexOf(opts.prefer) !== -1) {
        codes = [opts.prefer].concat(codes.filter(function (c) { return c !== opts.prefer; }));
      }
      if (!codes.length) {
        diag.why = 'hors-emprises';      // aucune ligne cartographiée autour
        return Promise.resolve({ ok: false, diag: diag });
      }
      if (codes.length > MAX_CANDIDATES) {
        codes = codes.slice(0, MAX_CANDIDATES);
        diag.truncated = codes.length;
      }
    }
    diag.zoneCount = diag.candidates.length;
    return ensureAll(codes).then(function (res) {
      for (var i = 0; i < res.length; i++) {
        if (res[i]) diag.loaded.push(res[i]); else diag.failed.push(codes[i]);
      }
      var best = null;
      for (var j = 0; j < codes.length; j++) {
        var pts = lines[codes[j]];
        if (!pts) continue;
        var pr = Geo.projectOnPolyline(lat, lon, pts);
        if (pr && (best === null || pr.dist < best.dist)) { best = pr; best.line = codes[j]; }
      }
      if (best) {
        diag.nearest = { line: best.line, dist: Math.round(best.dist), pk: Math.round(best.pk * 1000) / 1000 };
      }
      if (!best) {
        diag.why = 'donnees-indisponibles';   // candidats trouvés, aucun chargé
        return { ok: false, diag: diag };
      }
      if (best.dist > maxDist) {
        diag.why = 'voie-trop-loin';
        return { ok: false, diag: diag };
      }
      diag.why = 'ok';
      return { ok: true, line: best.line, pk: best.pk, dist: best.dist,
               offset: best.offset, segBearing: best.segBearing, diag: diag };
    });
  }

  return { get: get, has: has, all: all, points: points, codes: codes,
           isEmbedded: isEmbedded, zoneCount: zoneCount,
           zonesCovering: zonesCovering, ensure: ensure, ensureAll: ensureAll, locate: locate };
})();


/* ---------------------------------------------------------------------
   Éléments ponctuels le long de la ligne (signaux, PN)
   --------------------------------------------------------------------- */
function makeLinearSource(getRaw, captureM, dedupeM) {
  var cache = {};
  function parsePkExact(v) {
    if (v === undefined || v === null) return null;
    var s = String(v).trim();
    var m = s.match(/^(\d+)\+(\d+)/);
    if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / 1000;
    var f = parseFloat(s.replace(',', '.'));
    return isNaN(f) ? null : f;
  }
  function build(code) {
    if (cache[code]) return cache[code];
    var pts = PkStore.points(code);
    var out = [];
    if (!pts) { cache[code] = out; return out; }
    var raw = getRaw() || [];
    for (var i = 0; i < raw.length; i++) {
      var s = raw[i];
      if (s.line && s.line !== code) continue;
      var pk = (typeof s.pk === 'number') ? s.pk : null;
      var offset = 0, dist = 0;
      if (typeof s.lat === 'number' && typeof s.lon === 'number') {
        var pr = Geo.projectOnPolyline(s.lat, s.lon, pts, pk);
        if (!pr || pr.dist > captureM) continue;
        if (pk === null) pk = pr.pk;
        offset = pr.offset; dist = pr.dist;
      } else if (pk === null) {
        continue;
      }
      // PK officiel porté par OSM (railway:position:exact) si plausible.
      if (s.tags) {
        var ex = parsePkExact(s.tags['railway:position:exact']);
        if (ex !== null && Math.abs(ex - pk) < 10) pk = ex;
      }
      out.push({ id: s.id, source: s.source || 'OSM', pk: pk, offset: offset, dist: dist,
                 tags: s.tags || {}, lat: s.lat, lon: s.lon,
                 type: s.type, name: s.name, speedLimit: s.speedLimit });
    }
    out.sort(function (a, b) { return a.pk - b.pk; });
    if (dedupeM > 0) {
      var kept = [];
      for (var m = 0; m < out.length; m++) {
        if (kept.length && (out[m].pk - kept[kept.length - 1].pk) * 1000 < dedupeM) continue;
        kept.push(out[m]);
      }
      out = kept;
    }
    cache[code] = out;
    return out;
  }
  function windowFn(code, trainPk, dirSign, windowKm, behind) {
    var arr = build(code), res = [];
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      var ahead = dirSign >= 0 ? (e.pk - trainPk) : (trainPk - e.pk);
      if (behind) { if (ahead > 0.02 || ahead < -windowKm) continue; }
      else { if (ahead < -0.02 || ahead > windowKm) continue; }
      res.push({ e: e, aheadM: ahead * 1000 });
    }
    res.sort(function (a, b) { return behind ? (Math.abs(a.aheadM) - Math.abs(b.aheadM)) : (a.aheadM - b.aheadM); });
    return res;
  }
  function clear() { cache = {}; }
  return { build: build, windowFn: windowFn, clear: clear };
}

var Signals = (function () {
  'use strict';
  var cache = {};
  var CAPTURE_M = 350;   // OSM : distance max à la géométrie de la ligne
  var DEDUPE_PK = 0.04;  // SigMap prime sur OSM au même point (40 m)

  function sideToOffset(side) {
    if (side === 'right') return 3;
    if (side === 'left') return -3;
    return 0;
  }

  /* Filtres de sûreté : on ne masque un signal que si l'on est CERTAIN
     qu'il ne concerne pas le train. Signal de nomenclature inconnue =>
     affiché. Mieux vaut un signal en trop qu'un signal absent. */

  /* Sens de circulation du signal : C croissant, D décroissant, B les deux.
     C'est le SEUL champ fiable pour dire à qui le signal s'adresse, et le
     seul utilisé comme filtre (voir la note sur le nom de voie plus bas). */
  function dirOk(e, dirSign) {
    var d = String(e.dir || '').trim().toUpperCase();
    if (d === 'B') return true;
    if (!d) return true;
    return dirSign >= 0 ? d === 'C' : d === 'D';
  }

  /* Nom de voie SNCF-SigMap -> identifiant canonique.
     "V1", "1", "1A", "1B", "1C", "1BIS", "2BIS", "4E" -> 1 / 2 / ...
     "UNIQUE" -> 'unique'
     "VCE", "3CIRC", "J0003", "TIR6", "" ... -> null (non identifié) */
  var TRACK_NUM = /^V?(\d{1,2})(?:BIS|[A-Z])?$/;
  function trackVoie(track) {
    var s = String(track === undefined || track === null ? '' : track).trim().toUpperCase();
    if (!s) return null;
    if (s === 'UNIQUE') return 'unique';
    var m = s.match(TRACK_NUM);
    return m ? parseInt(m[1], 10) : null;
  }

  /* Pourquoi on ne filtre PAS sur le nom de voie.
     SigMap contredit sa propre regle « V1 = croissant » sur 22 % des signaux
     de la 650000 et 38 % de la 640000 (448 signaux dir=C poses sur une voie
     > 1, 256 signaux dir=D poses sur la voie 1), et ces contradictions ne
     sont pas concentrees en gare : 180/180 sont a plus de 1,5 km d'une gare
     sur la 650000. Un filtre « voie 1 seulement » masquerait donc des signaux
     que `dir` declare pourtant nostres. Le nom de voie reste donc une
     information affichee ; seul `dir` filtre. */

  /* Sections a voie unique, deduites des signaux "UNIQUE" de SigMap.
     routes.js ne porte que le mode nominal de la ligne (doubleTrack), donc
     sans ce calcul l'application ne peut jamais afficher "Voie unique". */
  var stCache = {};
  function singleTrackRanges(code) {
    if (stCache[code]) return stCache[code];
    var arr = build(code), pks = [], i;
    for (i = 0; i < arr.length; i++) {
      if (trackVoie(arr[i].track) === 'unique') pks.push(arr[i].pk);
    }
    pks.sort(function (a, b) { return a - b; });
    var runs = [];
    for (i = 0; i < pks.length; i++) {
      var last = runs[runs.length - 1];
      if (last && pks[i] - last.pkf <= 3) last.pkf = pks[i];
      else runs.push({ pkd: pks[i], pkf: pks[i] });
    }
    var out = [];
    for (i = 0; i < runs.length; i++) {
      if (runs[i].pkf - runs[i].pkd < 0.05) continue;   // signal isole : bruit
      out.push({ pkd: Math.max(0, runs[i].pkd - 0.3), pkf: runs[i].pkf + 0.3 });
    }
    stCache[code] = out;
    return out;
  }
  function inSingleTrack(code, pk) {
    if (typeof pk !== 'number') return false;
    var r = singleTrackRanges(code);
    for (var i = 0; i < r.length; i++) if (pk >= r[i].pkd && pk <= r[i].pkf) return true;
    return false;
  }

  function parsePkExact(v) {
    if (v === undefined || v === null) return null;
    var s = String(v).trim();
    var m = s.match(/^(\d+)\+(\d+)/);
    if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / 1000;
    var f = parseFloat(s.replace(',', '.'));
    return isNaN(f) ? null : f;
  }

  // Construit la liste des signaux d'une ligne, sur TOUT son parcours :
  //  1) SNCF-SigMap (nature + n° + côté + voie) : prioritaire ;
  //  2) OSM : complément, ignoré si un signal SigMap existe au même point ;
  //  3) CODELI locaux : prioritaires au PK.
  function build(code) {
    if (cache[code]) return cache[code];
    var pts = PkStore.points(code);
    var out = [];
    var smPk = [];

    var sg = (typeof sigmapSignals !== 'undefined') ? sigmapSignals : [];
    for (var i = 0; i < sg.length; i++) {
      var s = sg[i];
      if (s.line !== code) continue;
      var pk = (typeof s.pk === 'number') ? s.pk : parseFloat(s.pk);
      if (isNaN(pk)) continue;
      var dist = 0;
      if (pts && typeof s.lat === 'number' && typeof s.lon === 'number') {
        var pr = Geo.projectOnPolyline(s.lat, s.lon, pts, pk);
        if (pr) dist = pr.dist;
      }
      var num = s.ref || s.id || '';
      out.push({ id: 'SM' + num, source: 'SIGMAP', pk: pk, offset: sideToOffset(s.side),
                 dist: dist, tags: {}, lat: s.lat, lon: s.lon, type: s.type,
                 name: num, ref: num, side: s.side, track: s.track, dir: s.dir,
                 codeVoie: s.code_voie });
      smPk.push(pk);
    }

    var osms = (typeof osmSignals !== 'undefined') ? osmSignals : [];
    for (var j = 0; j < osms.length; j++) {
      var o = osms[j];
      if (o.line && o.line !== code) continue;
      var pk2 = (typeof o.pk === 'number') ? o.pk : null;
      var off2 = 0, d2 = 0;
      if (typeof o.lat === 'number' && typeof o.lon === 'number' && pts) {
        var pr2 = Geo.projectOnPolyline(o.lat, o.lon, pts, pk2);
        if (!pr2 || pr2.dist > CAPTURE_M) continue;
        if (pk2 === null) pk2 = pr2.pk;
        off2 = pr2.offset; d2 = pr2.dist;
      } else if (pk2 === null) {
        continue;
      }
      if (o.tags) {
        var ex = parsePkExact(o.tags['railway:position:exact']);
        if (ex !== null && Math.abs(ex - pk2) < 10) pk2 = ex;
      }
      var dup = false;
      for (var k = 0; k < smPk.length; k++) {
        if (Math.abs(smPk[k] - pk2) < DEDUPE_PK) { dup = true; break; }
      }
      if (dup) continue;
      out.push({ id: o.id, source: 'OSM', pk: pk2, offset: off2, dist: d2,
                 tags: o.tags || {}, lat: o.lat, lon: o.lon, type: o.type, name: o.name,
                 speedLimit: o.speedLimit });
    }

    var locals = (typeof localSignals !== 'undefined') ? localSignals : [];
    for (var m = 0; m < locals.length; m++) {
      var L = locals[m];
      if (!L || (L.line && L.line !== code) || typeof L.pk !== 'number') continue;
      out = out.filter(function (e) { return Math.abs(e.pk - L.pk) > 0.05; });
      out.push({ id: L.id || ('LOCAL-' + m), source: 'CODELI', pk: L.pk,
                 offset: sideToOffset(L.side), dist: 0, tags: L.tags || {},
                 lat: L.lat, lon: L.lon, type: L.type, name: L.name,
                 speedLimit: L.speedLimit, track: L.track, direction: L.direction });
    }

    out.sort(function (a, b) { return a.pk - b.pk; });
    cache[code] = out;
    return out;
  }

  function windowFn(code, trainPk, dirSign, windowKm, behind) {
    var arr = build(code), res = [];
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!dirOk(e, dirSign)) continue;
      var ahead = dirSign >= 0 ? (e.pk - trainPk) : (trainPk - e.pk);
      if (behind) { if (ahead > 0.02 || ahead < -windowKm) continue; }
      else { if (ahead < -0.02 || ahead > windowKm) continue; }
      res.push({ kind: 'signal', e: e, aheadM: ahead * 1000 });
    }
    res.sort(function (a, b) { return behind ? (Math.abs(a.aheadM) - Math.abs(b.aheadM)) : (a.aheadM - b.aheadM); });
    return res;
  }

  function upcoming(code, trainPk, dirSign, windowKm, scope, trainOffset) {
    var res = windowFn(code, trainPk, dirSign, windowKm, false);
    if (scope !== 'mine' || typeof trainOffset !== 'number') return res;
    var mySide = trainOffset > 1.5 ? 1 : (trainOffset < -1.5 ? -1 : 0);
    if (mySide === 0) return res;
    return res.filter(function (x) {
      var sigSide = x.e.offset > 1.5 ? 1 : (x.e.offset < -1.5 ? -1 : 0);
      return sigSide === 0 || sigSide === mySide;
    });
  }
  function past(code, trainPk, dirSign, windowKm) {
    return windowFn(code, trainPk, dirSign, windowKm, true);
  }

  function mergeOSM(nodes) {
    var osms = (typeof osmSignals !== 'undefined') ? osmSignals : null;
    if (!osms || !nodes) return 0;
    var known = {};
    for (var i = 0; i < osms.length; i++) known[osms[i].id] = 1;
    var keys = ['railway:signal:direction', 'railway:signal:position', 'railway:signal:form',
                'railway:signal:type', 'railway:signal:function', 'railway:signal:system',
                'railway:signal:main', 'railway:signal:main:form', 'railway:signal:main:states',
                'railway:signal:main:function', 'railway:signal:distant', 'railway:signal:distant:form',
                'railway:signal:distant:states', 'railway:signal:minor', 'railway:signal:minor:form',
                'railway:signal:minor:states', 'railway:signal:states',
                'railway:position:exact', 'ref', 'name', 'source'];
    var added = 0;
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      if (!n || typeof n.lat !== 'number' || typeof n.lon !== 'number') continue;
      if (known[n.id]) continue;
      var tags = {};
      if (n.tags) for (var k = 0; k < keys.length; k++) if (n.tags[keys[k]] !== undefined) tags[keys[k]] = n.tags[keys[k]];
      osms.push({ id: n.id, lat: n.lat, lon: n.lon, tags: tags });
      known[n.id] = 1; added++;
    }
    cache = {};
    return added;
  }
  function clearCache() { cache = {}; stCache = {}; }
  return { build: build, upcoming: upcoming, past: past, mergeOSM: mergeOSM,
           singleTrackRanges: singleTrackRanges, inSingleTrack: inSingleTrack,
           clearCache: clearCache };
})();

var Crossings = (function () {
  'use strict';
  var src = makeLinearSource(function () { return (typeof osmCrossings !== 'undefined') ? osmCrossings : []; }, 60, 30);
  function upcoming(code, trainPk, dirSign, windowKm) {
    return src.windowFn(code, trainPk, dirSign, windowKm, false).map(function (x) { x.kind = 'pn'; return x; });
  }
  function past(code, trainPk, dirSign, windowKm) {
    return src.windowFn(code, trainPk, dirSign, windowKm, true).map(function (x) { x.kind = 'pn'; return x; });
  }
  return { build: src.build, upcoming: upcoming, past: past, clearCache: src.clear };
})();

var Stations = (function () {
  'use strict';
  var CAPTURE_M = 600;
  var cache = {};

  function build(code) {
    if (cache[code]) return cache[code];
    var out = [];

    // 1) Gares officielles SNCF (PK exact, UIC)
    var g = (typeof sncfGares !== 'undefined' && sncfGares[code]) ? sncfGares[code] : null;
    if (g && g.length) {
      for (var i = 0; i < g.length; i++) {
        var x = g[i];
        out.push({ id: x.uic || ('G' + i), name: x.name, type: 'gare', pk: x.pk,
                   lat: x.lat, lon: x.lon, uic: x.uic, voy: x.voy, source: 'SNCF' });
      }
    } else {
      // 2) repli OSM
      var pts = PkStore.points(code);
      var raw = (typeof osmStations !== 'undefined') ? osmStations : [];
      var seen = {};
      for (var j = 0; j < raw.length && pts; j++) {
        var st = raw[j];
        var pr = Geo.projectOnPolyline(st.lat, st.lon, pts, null);
        if (!pr || pr.dist > CAPTURE_M) continue;
        var key = st.name + '@' + pr.pk.toFixed(1);
        if (seen[key]) continue; seen[key] = 1;
        out.push({ id: st.id, name: st.name, type: st.type || 'gare', pk: pr.pk, lat: st.lat, lon: st.lon, source: 'OSM' });
      }
    }
    out.sort(function (a, b) { return a.pk - b.pk; });
    cache[code] = out;
    return out;
  }

  function ahead(code, trainPk, dirSign, windowKm) {
    var arr = build(code), res = [];
    for (var i = 0; i < arr.length; i++) {
      var st = arr[i];
      var ahead = dirSign >= 0 ? (st.pk - trainPk) : (trainPk - st.pk);
      if (ahead < -0.02 || ahead > windowKm) continue;
      res.push({ kind: 'gare', e: st, aheadM: ahead * 1000 });
    }
    res.sort(function (a, b) { return a.aheadM - b.aheadM; });
    return res;
  }
  function past(code, trainPk, dirSign, windowKm) {
    var arr = build(code), res = [];
    for (var i = 0; i < arr.length; i++) {
      var st = arr[i];
      var ahead = dirSign >= 0 ? (st.pk - trainPk) : (trainPk - st.pk);
      if (ahead > 0.02 || ahead < -windowKm) continue;
      res.push({ kind: 'gare', e: st, aheadM: ahead * 1000 });
    }
    res.sort(function (a, b) { return Math.abs(a.aheadM) - Math.abs(b.aheadM); });
    return res;
  }
  function nearest(code, pk, maxKm) {
    var arr = build(code);
    for (var i = 0; i < arr.length; i++) if (Math.abs(arr[i].pk - pk) <= maxKm) return arr[i];
    return null;
  }
  function clearCache() { cache = {}; }
  return { build: build, ahead: ahead, past: past, nearest: nearest, clearCache: clearCache };
})();

/* ---------------------------------------------------------------------
   Info ligne : vitesse limite nominale et cantonnement au PK courant
   --------------------------------------------------------------------- */
var LineInfo = (function () {
  'use strict';
  function pick(arr, pk) {
    if (!arr) return null;
    for (var i = 0; i < arr.length; i++) {
      if (pk >= arr[i].pkd - 0.001 && pk <= arr[i].pkf + 0.001) return arr[i];
    }
    return null;
  }
  function vmaxAt(code, pk) {
    if (typeof sncfVmax === 'undefined') return null;
    var s = pick(sncfVmax[code], pk);
    return s ? s.v : null;
  }
  // Vitesse de la prochaine restriction (tronçon à venir de vitesse différente).
  function nextVmax(code, pk) {
    if (typeof sncfVmax === 'undefined' || !sncfVmax[code]) return null;
    var arr = sncfVmax[code];
    var cur = vmaxAt(code, pk);
    var best = null;
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (s.pkd <= pk + 0.001) continue;
      if (cur != null && String(s.v) === String(cur)) continue;
      if (best === null || s.pkd < best.pkd) best = s;
    }
    if (!best) return null;
    var n = parseInt(best.v, 10);
    return isNaN(n) ? null : n;
  }
  function cantAt(code, pk) {
    if (typeof sncfCant === 'undefined') return null;
    var s = pick(sncfCant[code], pk);
    return s ? s.label : null;
  }
  return { vmaxAt: vmaxAt, nextVmax: nextVmax, cantAt: cantAt };
})();