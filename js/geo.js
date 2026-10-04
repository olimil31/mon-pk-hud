/* =====================================================================
   geo.js — utilitaires géométriques (aucune dépendance)
   ===================================================================== */

var Geo = (function () {
  'use strict';

  var R = 6371000;
  var M_PER_DEG_LAT = 111132.92;

  function toRad(d) { return d * Math.PI / 180; }

  /* Distance haversine en mètres */
  function distance(lat1, lon1, lat2, lon2) {
    var p1 = toRad(lat1), p2 = toRad(lat2);
    var dp = toRad(lat2 - lat1), dl = toRad(lon2 - lon1);
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* Cap en degrés (0 = nord, 90 = est) */
  function bearing(lat1, lon1, lat2, lon2) {
    var p1 = toRad(lat1), p2 = toRad(lat2), dl = toRad(lon2 - lon1);
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /* Écart angulaire absolu entre deux caps (0..180) */
  function angleDiff(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  /* La polyligne est-elle triee par PK croissant ? Memoise sur le tableau. */
  function isMonotone(pts) {
    if (pts.__mono !== undefined) return pts.__mono;
    var mono = true;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].pk < pts[i - 1].pk) { mono = false; break; }
    }
    pts.__mono = mono;
    return mono;
  }

  /* Index du segment qui contient le PK (recherche dichotomique). */
  function segmentAtPk(pts, pk) {
    var lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (pts[mid].pk <= pk) lo = mid; else hi = mid;
    }
    return lo;
  }

  /* Projection d'un point sur une polyligne de points {pk, lat, lon}.
     Retourne { index, t, pk, dist, offset, segBearing } ou null.
     offset > 0  => le point est à DROITE du sens de parcours (PK croissant).
     offset < 0  => à gauche.
     dist        => distance perpendiculaire en mètres (au segment).

     pkHint : PK attendu (PK officiel SNCF). La ligne étant triée par PK, on
     ne projette que sur une fenêtre de segments autour de pkHint au lieu des
     ~4700 segments de la ligne : divise le coût par ~40. Les polygones PK
     des deux sources pouvant différer de quelques centaines de mètres, la
     fenêtre est volontairement large (span = 80 segments ≈ 8 km). */
  function projectOnPolyline(lat, lon, pts, pkHint, span) {
    if (!pts || pts.length < 2) return null;

    var mPerDegLon = 111320 * Math.cos(toRad(lat));
    var from = 0, to = pts.length - 1;
    if (typeof pkHint === 'number' && isFinite(pkHint) && isMonotone(pts)) {
      var m = (typeof span === 'number' && span > 0) ? span : 80;
      var c = segmentAtPk(pts, pkHint);
      from = Math.max(0, c - m);
      to = Math.min(pts.length - 1, c + m + 1);
    }

    var best = null;

    for (var i = from; i < to; i++) {
      var a = pts[i], b = pts[i + 1];

      var ax = (a.lon - lon) * mPerDegLon;
      var ay = (a.lat - lat) * M_PER_DEG_LAT;
      var bx = (b.lon - lon) * mPerDegLon;
      var by = (b.lat - lat) * M_PER_DEG_LAT;

      var vx = bx - ax, vy = by - ay;
      var len2 = vx * vx + vy * vy;
      var t = len2 > 0 ? (-ax * vx - ay * vy) / len2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;

      var cx = ax + vx * t, cy = ay + vy * t;
      var d = Math.sqrt(cx * cx + cy * cy);

      // bearing() coûte ~7 fonctions transcendantes : on ne le calcule que
      // pour le segment gagnant, pas aux ~5000 itérations de la projection.
      if (best === null || d < best.dist) {
        var cross = vx * (0 - ay) - vy * (0 - ax);   // w = P - A, P est l'origine
        best = {
          index: i,
          t: t,
          dist: d,
          pk: a.pk + (b.pk - a.pk) * t,
          offset: (cross > 0 ? -1 : 1) * d
        };
      }
    }
    if (best) best.segBearing = bearing(pts[best.index].lat, pts[best.index].lon,
                                        pts[best.index + 1].lat, pts[best.index + 1].lon);
    return best;
  }

  /* Prochain PK de la polyligne strictement au-delà de pk, dans le sens dir. */
  function nextKnownPk(pts, pk, dir) {
    if (!pts || !pts.length) return null;
    if (dir >= 0) {
      for (var i = 0; i < pts.length; i++) if (pts[i].pk > pk + 0.005) return pts[i].pk;
    } else {
      for (var j = pts.length - 1; j >= 0; j--) if (pts[j].pk < pk - 0.005) return pts[j].pk;
    }
    return null;
  }

  /* Point interpolé le long de la polyligne au PK donné. */
  function atPk(pts, pk) {
    if (!pts || pts.length === 0) return null;
    if (pts.length === 1) return { lat: pts[0].lat, lon: pts[0].lon, pk: pts[0].pk, segBearing: 0 };

    var n = pts.length;
    if (pk <= pts[0].pk) {
      return { lat: pts[0].lat, lon: pts[0].lon, pk: pts[0].pk,
               segBearing: bearing(pts[0].lat, pts[0].lon, pts[1].lat, pts[1].lon) };
    }
    if (pk >= pts[n - 1].pk) {
      return { lat: pts[n - 1].lat, lon: pts[n - 1].lon, pk: pts[n - 1].pk,
               segBearing: bearing(pts[n - 2].lat, pts[n - 2].lon, pts[n - 1].lat, pts[n - 1].lon) };
    }

    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (pts[mid].pk <= pk) lo = mid; else hi = mid;
    }
    var a = pts[lo], b = pts[hi];
    var span = b.pk - a.pk;
    var t = span > 0 ? (pk - a.pk) / span : 0;
    return {
      lat: a.lat + (b.lat - a.lat) * t,
      lon: a.lon + (b.lon - a.lon) * t,
      pk: pk,
      segBearing: bearing(a.lat, a.lon, b.lat, b.lon)
    };
  }

  return {
    distance: distance,
    bearing: bearing,
    angleDiff: angleDiff,
    projectOnPolyline: projectOnPolyline,
    nextKnownPk: nextKnownPk,
    atPk: atPk
  };
})();
