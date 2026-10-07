/* =====================================================================
   app.js — logique et rendu du HUD conducteur (v2)
   Dépend de : geo.js, data.js, data/routes.js
   ===================================================================== */

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var state = {
    mode: 'idle',          // 'idle' | 'gps' | 'sim'
    layout: 'full',
    windowKm: 5,
    windowBackKm: 3,
    scope: 'all',
    sensOverride: 0,      // 0 = auto, 1/-1 = sens impose
    acceptM: 500,        // rayon d'acceptation GPS -> voie
    diag: null,           // dernier diagnostic de localisation
    dirSource: 'defaut',   // 'defaut' = sens normal presume, 'gps' = mesure
    sources: { sigmap: true, osm: true, codeli: true },
    showPn: true,
    night: true,
    line: null,
    pk: null,
    lat: null,
    lon: null,
    offset: 0,
    smoothOffset: 0,
    speedKmh: null,
    precision: null,
    heading: null,
    dirSign: 1,             // sens normal par defaut : le plus frequent en ligne
    trackLabel: '--',
    trackSub: '',
    manualTrackSide: null,
    manualLine: null,
    watchId: null,
    lastPk: null,
    lastPkTs: null,
    lastLine: null,
    fixBusy: false,
    fallbackShown: false,
    reminders: [],
    sim: { route: '650000', dirSign: 1, pk: 10, speed: 100, running: false, timer: null }
  };

  /* ------------------------- Region-line mapping ------------------------- */
  // Calculé à la volée dans le navigateur à partir des points PK de chaque
  // ligne (pkLines) et des emprises approximatives des régions (regions.js).
  // Les anciens scripts Node (require/module.exports) ne sont plus chargés :
  // le mapping n'est plus un stub vide, le filtre région est réellement actif.
  var LineRegions = (function () {
    'use strict';
    var cache = {};

    function inRegion(lat, lon, r) {
      return lat >= r.latMin && lat <= r.latMax && lon >= r.lonMin && lon <= r.lonMax;
    }

    function get(code) {
      if (cache[code]) return cache[code];
      var info = { code: code, regions: [], regionsJoin: '' };
      var pts = PkStore.points(code);
      var regs = (typeof frenchRegions !== 'undefined') ? frenchRegions : [];
      if (pts && pts.length && regs.length) {
        for (var i = 0; i < regs.length; i++) {
          for (var j = 0; j < pts.length; j++) {
            if (inRegion(pts[j].lat, pts[j].lon, regs[i])) { info.regions.push(regs[i].code); break; }
          }
        }
      }
      info.regionsJoin = info.regions.map(regionName).join(', ');
      cache[code] = info;
      return info;
    }

    function regionName(code) {
      var regs = (typeof frenchRegions !== 'undefined') ? frenchRegions : [];
      for (var i = 0; i < regs.length; i++) if (regs[i].code === code) return regs[i].name;
      return code;
    }

    return {
      get: get,
      regionName: regionName,
      getRegionsForLine: function (code) { return get(code).regions; },
      isLineActive: function (code) { return typeof routes !== 'undefined' && !!routes[code]; }
    };
  })();

  /* ------------------------- Formatage ------------------------- */
  // PK à l'hectomètre : on tronque (pas d'arrondi). 18,87 -> 18,8
  function fmtHecto(pk) {
    if (pk === null || pk === undefined || isNaN(pk)) return '--';
    var t = Math.floor(pk * 10) / 10;
    if (t < 0) t = 0;
    return t.toFixed(1).replace('.', ',');
  }
  function fmtDist(m) {
    if (m === null || m === undefined || isNaN(m)) return '--';
    if (m < 0) m = 0;
    if (m < 1000) return (Math.round(m / 10) * 10) + ' m';
    var km = m / 1000;
    return km.toFixed(km < 10 ? 2 : 1).replace('.', ',') + ' km';
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  /* ------------------------- UI helpers ------------------------ */
  function setStatus(text, cls) {
    var el = $('gps-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'status ' + (cls || 'off');
  }
  function bumpPk() {
    var el = $('pk-value');
    if (!el) return;
    el.classList.add('bump');
    setTimeout(function () { el.classList.remove('bump'); }, 150);
  }

  /* --------------------- Sens / destination -------------------- */
  function routeFor(line) { return (typeof routes !== 'undefined' && routes[line]) ? routes[line] : null; }
  function endpointsSorted(route) {
    var ep = route.endpoints.slice();
    ep.sort(function (a, b) { return a.pk - b.pk; });
    return ep;
  }
  function destinationShort() {
    var r = routeFor(state.line);
    if (!r || state.dirSign === 0) return '';
    var ep = endpointsSorted(r);
    var dest = state.dirSign > 0 ? ep[1] : ep[0];
    return dest ? dest.short : '';
  }

  /* ---------------------- Signaux : détails -------------------- */
  var FORM_FR = { light: 'lumineux', sign: 'panneau', semaphore: 'sémaphore', board: 'panneau' };
  var TYPE_FR = {
    carre: 'Carré', semaphore: 'Sémaphore', avertissement: 'Avertissement',
    disque: 'Disque', ralentissement: 'Ralentissement', rappel: 'Rappel',
    manoeuvre: 'Manœuvre', entree: 'Entrée', sortie: 'Sortie',
    heurtoir: 'Heurtoir', tiv: 'TIV', carre_voie_unique: 'Carré de voie unique'
  };
  var FUNC_FR = {
    entrance: 'entrée', exit: 'sortie', intermediate: 'intermédiaire',
    block: 'canton', distant: 'avertissement', station: 'gare'
  };
  function tr(map, v) { if (!v) return ''; return map[String(v).toLowerCase()] || v; }

  function travelSideOffset(offset) { return state.dirSign >= 0 ? offset : -offset; }
  function signalTravelSide(e) {
    var t = e.tags || {};
    if (t['railway:signal:position'] === 'bridge') return 'bridge';
    var off = travelSideOffset(e.offset);
    if (off > 1.5) return 'right';
    if (off < -1.5) return 'left';
    return 'center';
  }
  function sideWord(side) {
    if (side === 'bridge') return 'pont';
    if (side === 'right') return 'droite';
    if (side === 'left') return 'gauche';
    return 'centre';
  }

  /* ----------- Pictogrammes (délégués à js/icons.js) ----------- */
  function signalSvg(e) { return SignalIcons.signal(e); }
  function gareSvg() { return SignalIcons.gare(); }
  function pnSvg() { return SignalIcons.pn(); }
  function rappelSvg() { return SignalIcons.rappel(); }
  function signalDetails(e) {
    var t = e.tags || {};
    var name = '';
    var parts = [];
    if (e.source === 'CODELI' || e.source === 'SIGMAP') {
      name = e.source === 'CODELI' ? (e.ref || e.name || '') : '';
      var nat = (typeof SignalIcons !== 'undefined' && SignalIcons.typeLabel) ? SignalIcons.typeLabel(e) : (e.type || '');
      if (nat) parts.push(nat);
      if (e.track) parts.push('voie ' + e.track);
    } else {
      name = t.ref || t.name || t['railway:signal:main:ref'] || '';
      var lbl = (typeof SignalIcons !== 'undefined' && SignalIcons.typeLabel) ? SignalIcons.typeLabel(e) : '';
      if (lbl) parts.push(lbl);
      if (t['railway:signal:system']) parts.push(String(t['railway:signal:system']).toUpperCase());
      if (t['railway:signal:form']) parts.push(tr(FORM_FR, t['railway:signal:form']));
      else if (t['railway:signal:main:form']) parts.push(tr(FORM_FR, t['railway:signal:main:form']));
      if (t['railway:signal:type']) parts.push(tr(TYPE_FR, t['railway:signal:type']));
      if (t['railway:signal:function']) parts.push(tr(FUNC_FR, t['railway:signal:function']));
    }
    if (!parts.length) parts.push('Signal');
    return { name: name, info: parts.join(' · ') };
  }

  /* --------------------------- Voie ---------------------------- */
  /* Convention de la ligne : PK croissant -> voie 1 (sens normal),
     PK décroissant -> voie 2. Sur une section a voie unique, seul le sens
     du PK compte. La voie est une deduction, jamais une donnee : elle sert
     a l'affichage, pas au filtrage des signaux (voir Signals.dirOk). */
  function sensLabel() {
    var s = state.dirSign > 0 ? 'PK croissant' : (state.dirSign < 0 ? 'PK décroissant' : 'PK inconnu');
    if (state.dirSource === 'defaut') return s + ' · par défaut';
    if (state.dirSource === 'manuel') return s + ' · imposé';
    return s;
  }

  /* Le sens est le seul critere de filtrage des signaux (Signals.dirOk).
     Il est deduit du sens de marche du PK, avec le sens normal en defaut ;
     un controle manuel permet de tranche quand le GPS hesite (manoeuvres,
     arret a l'arriere, reception en gare). */
  function applySensOverride() {
    if (state.sensOverride) { state.dirSign = state.sensOverride; state.dirSource = 'manuel'; }
  }

  function computeVoie() {
    if (state.manualTrackSide) {
      if (state.manualTrackSide === 'unique') return { label: 'Voie unique', sub: sensLabel() };
      if (state.manualTrackSide === 'v1') return { label: 'Voie 1', sub: 'imposé' };
      if (state.manualTrackSide === 'v2') return { label: 'Voie 2', sub: 'imposé' };
      if (state.manualTrackSide === 'gare') return { label: 'Gare', sub: 'plusieurs voies' };
      return { label: 'Voie ?', sub: '' };
    }
    var r = routeFor(state.line);
    if (r && r.doubleTrack === false) return { label: 'Voie unique', sub: sensLabel() };
    // Voie unique deduite des signaux "UNIQUE" : routes.js ne porte que le
    // mode nominal de la ligne, donc sans cela l'app ne l'afficherait jamais.
    if (state.line && state.pk !== null && Signals.inSingleTrack(state.line, state.pk)) {
      return { label: 'Voie unique', sub: sensLabel() };
    }
    if (state.line && state.pk !== null && Stations.nearest(state.line, state.pk, 0.35)) {
      return { label: 'Gare', sub: 'plusieurs voies' };
    }
    if (state.dirSign > 0) return { label: 'Voie 1', sub: 'PK croissant' };
    if (state.dirSign < 0) return { label: 'Voie 2', sub: 'PK décroissant' };
    return { label: 'Voie ?', sub: '' };
  }

  /* ------------------------- Rappels --------------------------- */
  function loadReminders() {
    try {
      var raw = localStorage.getItem('monpk.reminders');
      state.reminders = raw ? JSON.parse(raw) : [];
    } catch (e) { state.reminders = []; }
    if (!Array.isArray(state.reminders)) state.reminders = [];
  }
  function saveReminders() {
    try { localStorage.setItem('monpk.reminders', JSON.stringify(state.reminders)); } catch (e) {}
  }
  function activeLineForReminders() {
    return state.line || state.manualLine || state.sim.route;
  }
  function addReminder() {
    var label = ($('rem-label').value || '').trim();
    var pk = parseFloat($('rem-pk').value);
    var dir = $('rem-dir').value;
    var radiusKm = parseFloat($('rem-radius').value) || 0.5;
    var line = activeLineForReminders();
    if (!label) { $('rem-label').focus(); return; }
    if (isNaN(pk)) { $('rem-pk').focus(); return; }
    if (!line) { setStatus('Choisir une ligne (simulation)', 'warn'); return; }
    state.reminders.push({ id: 'R' + Date.now(), line: line, pk: pk, dir: dir, radiusKm: radiusKm, label: label });
    saveReminders();
    $('rem-label').value = '';
    $('rem-pk').value = '';
    renderReminderList();
    renderAll();
  }
  function removeReminder(id) {
    state.reminders = state.reminders.filter(function (r) { return r.id !== id; });
    saveReminders();
    renderReminderList();
    renderAll();
  }
  function remindersForActive() {
    var line = state.line;
    if (!line) return [];
    return state.reminders.filter(function (r) { return r.line === line; });
  }
  function reminderApplies(r, dir) {
    if (r.dir === 'both') return true;
    if (r.dir === 'increasing') return dir >= 0;
    return dir < 0;
  }
  function remindersAhead() {
    var dir = state.dirSign === 0 ? 1 : state.dirSign;
    var res = [];
    var list = remindersForActive();
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!reminderApplies(r, dir)) continue;
      var ahead = dir >= 0 ? (r.pk - state.pk) : (state.pk - r.pk);
      if (ahead < -0.02 || ahead > r.radiusKm) continue;
      res.push({ kind: 'rappel', e: r, aheadM: ahead * 1000 });
    }
    return res;
  }
  function remindersPast() {
    var dir = state.dirSign === 0 ? 1 : state.dirSign;
    var res = [];
    var list = remindersForActive();
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!reminderApplies(r, dir)) continue;
      var ahead = dir >= 0 ? (r.pk - state.pk) : (state.pk - r.pk);
      if (ahead > 0.02 || ahead < -r.radiusKm) continue;
      res.push({ kind: 'rappel', e: r, aheadM: ahead * 1000 });
    }
    return res;
  }
  function renderReminderList() {
    var box = $('reminder-list');
    if (!box) return;
    if (!state.reminders.length) {
      box.innerHTML = '<div class="sub" style="font-size:.72rem">Aucun rappel enregistré.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < state.reminders.length; i++) {
      var r = state.reminders[i];
      var dirTxt = r.dir === 'both' ? '↕' : (r.dir === 'increasing' ? '↑' : '↓');
      html += '<div class="reminder-item">' +
        '<span class="rl">' + dirTxt + ' PK ' + fmtHecto(r.pk) + ' · ' + escapeHtml(r.label) + ' <span class="sub">(' + r.line + ')</span></span>' +
        '<button class="danger" data-id="' + r.id + '">✕</button></div>';
    }
    box.innerHTML = html;
    var btns = box.querySelectorAll('button[data-id]');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function () { removeReminder(this.getAttribute('data-id')); });
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* --------------------------- Couverture --------------------------- */
  /* Une ligne peut être localisée (PK) sans la moindre donnée
     d'enrichissement embarquée. Il faut le dire : « rien à venir » ne
     veut pas dire « voie libre », surtout pas en conduite. */
  var scopeCache = {};
  function lineHasEnrichment(code) {
    if (scopeCache[code] !== undefined) return scopeCache[code];
    var ok = false;
    if (typeof sncfVmax !== 'undefined' && sncfVmax[code]) ok = true;
    if (!ok && typeof sncfCant !== 'undefined' && sncfCant[code]) ok = true;
    if (!ok && typeof sncfGares !== 'undefined' && sncfGares[code]) ok = true;
    if (!ok && typeof sigmapSignals !== 'undefined') {
      for (var i = 0; i < sigmapSignals.length; i++) {
        if (sigmapSignals[i].line === code) { ok = true; break; }
      }
    }
    scopeCache[code] = ok;
    return ok;
  }

  /* ---------------------------- Rendu ---------------------------- */
  function renderTop() {
    var badge = $('line-badge');
    var name = $('line-name');
    var r = routeFor(state.line);
    if (badge) badge.textContent = state.line ? ('Ligne ' + state.line) : 'Aucune ligne';
    if (name) {
      if (r) name.textContent = r.label;
      else if (!state.line) name.textContent = 'Position non localisée';
      else if (lineHasEnrichment(state.line)) name.textContent = 'Ligne ' + state.line + ' (hors base)';
      else name.textContent = 'Ligne ' + state.line + ' — PK seul';
    }
  }

  function renderPk() {
    var el = $('pk-value');
    if (!el) return;
    var txt = fmtHecto(state.pk);
    if (el.textContent !== txt) { el.textContent = txt; bumpPk(); }
    var sub = $('pk-sub');
    if (sub) {
      if (state.pk === null) sub.textContent = 'PK estimé · indicatif';
      else if (state.precision) sub.textContent = '±' + Math.round(state.precision) + ' m · indicatif';
      else sub.textContent = 'PK estimé · indicatif';
    }
  }

  function renderSpeed() {
    var el = $('speed-value');
    if (!el) return;
    el.textContent = (state.speedKmh === null || isNaN(state.speedKmh)) ? '--' : '' + Math.round(state.speedKmh);
  }

  function renderDir() {
    var arrow = $('dir-arrow'), text = $('dir-text'), track = $('track-text'), tsub = $('track-sub');
    if (arrow) {
      arrow.textContent = '\u25B2';
      arrow.className = state.dirSign > 0 ? 'up' : (state.dirSign < 0 ? 'down' : '');
    }
    if (text) {
      var dest = destinationShort();
      text.textContent = dest ? ('vers ' + dest) : '--';
    }
    if (track) track.textContent = state.trackLabel || '--';
    // Le sous-titre montre d'ou vient le sens : mesure, impose, ou par defaut.
    if (tsub) tsub.textContent = state.trackSub || sensLabel();
  }

  function srcWord(s) { return s === 'CODELI' ? 'CODELI' : (s === 'SIGMAP' ? 'SNCF' : 'OSM'); }
  function sourceOk(e) {
    if (!e) return true;
    if (e.source === 'SIGMAP') return state.sources.sigmap;
    if (e.source === 'CODELI') return state.sources.codeli;
    return state.sources.osm;
  }
  function decorateSignal(e) {
    if (e && e.type && /REPER\s*VIT/i.test(e.type) && e.displaySpeed === undefined) {
      var ns = LineInfo.nextVmax(state.line, e.pk);
      e.displaySpeed = (ns != null) ? ns : 30;
    }
  }
  // Regroupe les signaux situés au même PK dans un même cadre.
  function groupEvents(evts) {
    var out = [];
    for (var i = 0; i < evts.length; i++) {
      var ev = evts[i];
      if (ev.kind === 'signal') {
        var last = out[out.length - 1];
        if (last && last.kind === 'signal' && Math.abs(last.e.pk - ev.e.pk) < 0.005) {
          last.multi.push(ev.e);
          continue;
        }
        out.push({ kind: 'signal', e: ev.e, multi: [ev.e], aheadM: ev.aheadM });
        continue;
      }
      out.push(ev);
    }
    return out;
  }

  function multiSignalCardHtml(ev, list, past) {
    var dist = fmtDist(Math.abs(ev.aheadM)) + (past ? ' ✓' : '');
    var cls = 'sig multi' + (past ? ' pastcard' : '');
    var srcs = [], rows = '';
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (srcs.indexOf(e.source) === -1) srcs.push(e.source);
      var side = signalTravelSide(e);
      var det = signalDetails(e);
      rows += '<div class="sig-multi-row">' + signalSvg(e) +
        '<span>' + escapeHtml(det.info) + ' · ' + sideWord(side) + '</span></div>';
    }
    var badge = '<span class="sig-badge">' + srcs.map(srcWord).join('/') + '</span>';
    return '<div class="' + cls + '">' + badge +
      '<div class="sig-top">' + signalSvg(list[0]) + '<div class="sig-dist">' + dist + '</div></div>' +
      '<div class="sig-pk">PK ' + fmtHecto(ev.e.pk) + ' · ' + list.length + ' signaux</div>' +
      rows + '</div>';
  }

  function eventCardHtml(ev, past) {
    var cls = 'sig' + (past ? ' pastcard' : '');
    var badge = '', dist = fmtDist(Math.abs(ev.aheadM)) + (past ? ' ✓' : '');
    var pkHtml = '', nameHtml = '', infoHtml = '', icon = '';

    if (ev.kind === 'signal') {
      var list = (ev.multi && ev.multi.length > 1) ? ev.multi : [ev.e];
      for (var q = 0; q < list.length; q++) decorateSignal(list[q]);
      if (list.length > 1) return multiSignalCardHtml(ev, list, past);
      var e = ev.e;
      var side = signalTravelSide(e);
      if (side === 'left') cls += ' side-left';
      else if (side === 'right') cls += ' side-right';
      else cls += ' side-center';
      var isTyped = (e.source === 'CODELI' || e.source === 'SIGMAP');
      if (isTyped) cls += ' codeli';
      var det = signalDetails(e);
      badge = '<span class="sig-badge">' + srcWord(e.source) + '</span>';
      icon = signalSvg(e);
      pkHtml = '<div class="sig-pk">PK ' + fmtHecto(e.pk) + '</div>';
      nameHtml = det.name ? '<div class="sig-name">' + (isTyped ? 'N° ' : '') + escapeHtml(det.name) + '</div>' : '';
      infoHtml = '<div class="sig-info">' + escapeHtml(det.info) + ' · ' + sideWord(side) + '</div>';
    } else if (ev.kind === 'gare') {
      cls += ' gare';
      badge = '<span class="sig-badge">' + (ev.e.type === 'halte' ? 'halte' : 'gare') + '</span>';
      icon = gareSvg();
      pkHtml = '<div class="sig-pk">PK ' + fmtHecto(ev.e.pk) + '</div>';
      nameHtml = '<div class="sig-name">' + escapeHtml(ev.e.name) + '</div>';
      infoHtml = '<div class="sig-info">' + (ev.e.voy === 'N' ? 'Gare (fret)' : 'Gare') + ' · BV</div>';
    } else if (ev.kind === 'pn') {
      cls += ' pn';
      badge = '<span class="sig-badge">PN</span>';
      icon = pnSvg();
      var tg = ev.e.tags || {};
      pkHtml = '<div class="sig-pk">PK ' + fmtHecto(ev.e.pk) + '</div>';
      nameHtml = (tg.name || tg.ref) ? '<div class="sig-name">' + escapeHtml(tg.name || tg.ref) + '</div>' : '';
      infoHtml = '<div class="sig-info">Passage à niveau</div>';
    } else {
      cls += ' rappel';
      badge = '<span class="sig-badge">rappel</span>';
      icon = rappelSvg();
      pkHtml = '<div class="sig-pk">PK ' + fmtHecto(ev.e.pk) + '</div>';
      nameHtml = '<div class="sig-name">' + escapeHtml(ev.e.label) + '</div>';
      infoHtml = '<div class="sig-info">Rappel</div>';
    }

    return '<div class="' + cls + '">' + badge +
      '<div class="sig-top">' + icon + '<div class="sig-dist">' + dist + '</div></div>' +
      pkHtml + nameHtml + infoHtml + '</div>';
  }

  function buildAheadEvents() {
    var dir = state.dirSign === 0 ? 1 : state.dirSign;
    var evts = [];
    evts = evts.concat(Signals.upcoming(state.line, state.pk, dir, state.windowKm, state.scope, state.smoothOffset));
    evts = evts.concat(Stations.ahead(state.line, state.pk, dir, state.windowKm));
    if (state.showPn) evts = evts.concat(Crossings.upcoming(state.line, state.pk, dir, state.windowKm));
    evts = evts.concat(remindersAhead());
    evts = evts.filter(function (x) { return x.kind !== 'signal' || sourceOk(x.e); });
    evts.sort(function (a, b) { return a.aheadM - b.aheadM; });
    return groupEvents(evts);
  }
  function buildPastEvents() {
    if (!state.windowBackKm) return [];
    var dir = state.dirSign === 0 ? 1 : state.dirSign;
    var evts = [];
    evts = evts.concat(Signals.past(state.line, state.pk, dir, state.windowBackKm));
    evts = evts.concat(Stations.past(state.line, state.pk, dir, state.windowBackKm));
    if (state.showPn) evts = evts.concat(Crossings.past(state.line, state.pk, dir, state.windowBackKm));
    evts = evts.concat(remindersPast());
    evts = evts.filter(function (x) { return x.kind !== 'signal' || sourceOk(x.e); });
    evts.sort(function (a, b) { return Math.abs(a.aheadM) - Math.abs(b.aheadM); });
    return groupEvents(evts);
  }

  function renderSignals() {
    var strip = $('signal-strip');
    var pastStrip = $('past-strip');
    var summary = $('sig-summary');
    if (!strip) return;

    // fenêtre derrière
    var pastHead = document.querySelector('.past-head');
    if (pastHead) pastHead.style.display = state.windowBackKm ? '' : 'none';
    if (pastStrip) pastStrip.style.display = state.windowBackKm ? '' : 'none';
    var bwl = $('back-window-label');
    if (bwl) bwl.textContent = state.windowBackKm;

    if (!state.line || state.pk === null) {
      lastHtml.ahead = null; lastHtml.past = null;
      setHtml(strip, '<div class="sig-empty">Aucune position. Démarrez le GPS ou le mode simulation.</div>', 'ahead');
      setHtml(pastStrip, '', 'past');
      if (summary) summary.textContent = '';
      renderNextBlock([]);
      return;
    }

    var evts = buildAheadEvents();

    /* Le bloc "Prochain" prend les 3 elements les plus imminents : en
       conduite c'est la seule information qui doit sauter aux yeux. Le
       bandeau defileant garde le reste, sans doublon. */
    var promoted = renderNextBlock(evts);
    var rest = evts.slice(promoted);

    if (!evts.length) {
      if (summary) summary.textContent = lineHasEnrichment(state.line) ? 'rien devant' : 'non couvert';
    } else {
      if (summary) summary.textContent = evts.length + ' élément' + (evts.length > 1 ? 's' : '') +
        ' dans les ' + state.windowKm + ' km';
    }

    var html = '';
    var max = Math.min(rest.length, 20);
    for (var i = 0; i < max; i++) html += eventCardHtml(rest[i], false);
    setHtml(strip, html || '<div class="sig-empty"> Rien de plus dans la fenêtre.</div>', 'ahead');

    if (pastStrip) {
      var pevts = buildPastEvents();
      var ph = '';
      var pmax = Math.min(pevts.length, 12);
      for (var j = 0; j < pmax; j++) ph += eventCardHtml(pevts[j], true);
      setHtml(pastStrip, ph || '<div class="sig-empty">aucun</div>', 'past');
    }
  }

  /* Mémoisation du HTML : innerHTML est réécrit à chaque fix GPS, ce qui
     remettait le défilement à zéro et scintillait. On ne touche au DOM que
     si le contenu a réellement changé. */
  var lastHtml = { ahead: null, past: null };
  function setHtml(el, html, key) {
    if (!el) return;
    if (lastHtml[key] === html) return;
    var sl = el.scrollLeft;
    el.innerHTML = html;
    if (sl) el.scrollLeft = sl;
    lastHtml[key] = html;
  }

  /* --------------------- Bloc "Prochain" --------------------- */
  var NEXT_N = 3;

  function evLabel(e) {
    if (e.kind === 'signal') return signalDetails(e.e).info;
    if (e.kind === 'gare') return (e.e.type === 'halte' ? 'Halte ' : 'Gare ') + e.e.name;
    if (e.kind === 'pn') { var t = e.e.tags || {}; return 'Passage à niveau' + (t.ref ? ' n°' + t.ref : ''); }
    return 'Rappel ' + (e.e.label || '');
  }
  function evIcon(e) {
    if (e.kind === 'signal') return signalSvg(e.e);
    if (e.kind === 'gare') return gareSvg();
    if (e.kind === 'pn') return pnSvg();
    return rappelSvg();
  }
  function nextRowHtml(e, isLead) {
    var pk = (e.e && typeof e.e.pk === 'number') ? ('<span class="next-pk">PK ' + fmtHecto(e.e.pk) + '</span>') : '';
    return '<div class="next-row' + (isLead ? ' lead' : '') + ' k-' + e.kind + '">' +
      '<span class="next-ico">' + evIcon(e) + '</span>' +
      '<span class="next-d">' + fmtDist(Math.abs(e.aheadM)) + '</span>' +
      '<span class="next-t">' + escapeHtml(evLabel(e)) + pk + '</span>' +
      '</div>';
  }

  /* Si aucun signal n'est connu devant, on ne dit pas « rien à venir » : on
     dit jusqu'où la donnée est connue. Un bandeau vide se lit sinon comme
     une voie libre. */
  function coverageMessage() {
    var dir = state.dirSign === 0 ? 1 : state.dirSign;
    var probe = Signals.upcoming(state.line, state.pk, dir, 60, 'all', 0);
    if (probe.length) {
      return 'Aucun signal connu sur ' + fmtDist(probe[0].aheadM) +
             ' — donnée disponible seulement jusqu\'au PK ' + fmtHecto(probe[0].e.pk);
    }
    var pts = PkStore.points(state.line);
    var nk = pts ? Geo.nextKnownPk(pts, state.pk, dir) : null;
    if (nk === null) {
      return pts ? 'Aucun signal connu jusqu\'au bout de la ligne (PK ' +
        fmtHecto(pts[0].pk) + ' → ' + fmtHecto(pts[pts.length - 1].pk) + ')' : 'Ligne inconnue';
    }
    return 'Aucun signal connu avant le PK ' + fmtHecto(nk) +
           ' (' + fmtDist(Math.abs(nk - state.pk) * 1000) + ')';
  }

  function renderNextBlock(evts) {
    var box = $('next-block'), main = $('next-main'), sub = $('next-sub');
    if (!box || !main || !sub) return 0;
    if (!state.line || state.pk === null) { box.classList.add('hidden'); return 0; }
    box.classList.remove('hidden');

    if (!evts.length) {
      box.classList.add('void');
      main.innerHTML = '<div class="next-void">' +
        (lineHasEnrichment(state.line)
          ? '<b>Rien de connu devant</b><br>' + escapeHtml(coverageMessage())
          : '<b>Ligne ' + escapeHtml(state.line) + ' : PK seul</b><br>' +
            'aucun signal, PN, gare ni VL embarqué pour cette ligne — ne rien en déduire.') +
        '</div>';
      sub.innerHTML = '';
      lastNext = null;
      return 0;
    }
    box.classList.remove('void');

    var rows = '', n = Math.min(NEXT_N, evts.length), i;
    for (i = 0; i < n; i++) rows += nextRowHtml(evts[i], i === 0);
    var key = rows;
    if (lastNext !== key) { main.innerHTML = rows; lastNext = key; }

    var rest = evts.slice(n, n + 3);
    sub.innerHTML = rest.length
      ? 'puis&nbsp; ' + rest.map(function (e) {
          return escapeHtml(fmtDist(Math.abs(e.aheadM)) + ' ' + evLabel(e));
        }).join(' &nbsp;·&nbsp; ')
      : '';
    return n;
  }
  var lastNext = null;

  function renderStationBar() {
    var el = $('station-bar'), txt = $('station-text');
    if (!el || !txt) return;
    if (!state.line || state.pk === null) { el.classList.add('hidden'); return; }
    var dir = state.dirSign === 0 ? 1 : state.dirSign;

    var near = Stations.nearest(state.line, state.pk, 0.35);
    if (near) {
      el.classList.remove('hidden'); el.classList.add('alert');
      txt.textContent = '🏠 BV : ' + near.name + ' (' + (near.type === 'halte' ? 'halte' : 'gare') + ')';
      return;
    }
    var ahead = Stations.ahead(state.line, state.pk, dir, state.windowKm);
    var next = ahead.length ? ahead[0] : null;
    if (next && next.aheadM <= 1200) {
      el.classList.remove('hidden'); el.classList.add('alert');
      txt.textContent = 'GARE À 1000 m : ' + next.e.name;
      return;
    }
    if (next) {
      el.classList.remove('hidden'); el.classList.remove('alert');
      txt.textContent = 'Prochaine gare : ' + next.e.name + ' · ' + fmtDist(next.aheadM);
      return;
    }
    el.classList.add('hidden'); el.classList.remove('alert');
  }

  function renderLineInfo() {
    var el = $('line-info');
    if (!el) return;
    if (!state.line || state.pk === null) { el.textContent = 'VL --'; el.className = 'status off'; return; }
    if (!lineHasEnrichment(state.line)) {
      el.textContent = 'VL -- non couvert';
      el.className = 'status warn';
      return;
    }
    var v = LineInfo.vmaxAt(state.line, state.pk);
    var c = LineInfo.cantAt(state.line, state.pk);
    var txt = (v != null ? ('VL ' + v + ' km/h') : 'VL --');
    if (c) txt += ' · ' + c;
    el.textContent = txt;
    el.className = (v != null || c) ? 'status ok' : 'status warn';
  }

  function renderAll() {
    state.trackLabel = '';
    var v = computeVoie();
    state.trackLabel = v.label;
    state.trackSub = v.sub;
    renderTop();
    renderPk();
    renderSpeed();
    renderDir();
    renderLineInfo();
    renderStationBar();
    renderSignals();
  }

  /* ------------------- Détection sens -------------------------- */
  function updateDirectionFromFix(pk, heading, segBearing) {
    var now = Date.now();
    if (state.lastPk !== null && state.lastPkTs !== null) {
      var delta = pk - state.lastPk;
      var dt = (now - state.lastPkTs) / 1000;
      if (Math.abs(delta) > 0.003 && dt > 0.2) {
        state.dirSign = delta > 0 ? 1 : -1;
        state.dirSource = 'gps';
        return;
      }
    }
    if (typeof heading === 'number' && !isNaN(heading) && typeof segBearing === 'number') {
      var diff = Geo.angleDiff(heading, segBearing);
      if (diff < 70) { state.dirSign = 1; state.dirSource = 'gps'; }
      else if (diff > 110) { state.dirSign = -1; state.dirSource = 'gps'; }
    }
  }

  /* ------------------------- Traitement GPS ------------------- */
  /* Le chargement d'un shard est asynchrone : une correction GPS peut
     arriver avant sa résolution. On sérialise et on n'écrit jamais une
     position périmée (celle qui a déclenché le chargement). */
  function onFix(coords) {
    if (state.fixBusy) return;
    state.mode = 'gps';
    state.precision = coords.accuracy || null;
    state.lat = coords.latitude;
    state.lon = coords.longitude;

    var maxDist = state.acceptM || 500;
    var opts = { maxDist: maxDist, prefer: state.lastLine || null };
    if (state.manualLine) { opts.line = state.manualLine; opts.prefer = state.manualLine; }

    state.fixBusy = true;
    if (!state.line) setStatus('Chargement de la ligne...', 'warn');

    PkStore.locate(coords.latitude, coords.longitude, opts).then(function (res) {
      state.fixBusy = false;
      state.diag = res.diag;
      if (res.ok) {
        state.line = res.line;
        state.lastLine = res.line;
        state.pk = res.pk;
        state.offset = res.offset;
        state.smoothOffset = state.smoothOffset * 0.7 + res.offset * 0.3;
        updateDirectionFromFix(res.pk, coords.heading, res.segBearing);
        applySensOverride();
        state.heading = (typeof coords.heading === 'number' ? coords.heading : null);
        state.lastPk = res.pk;
        state.lastPkTs = Date.now();

        var v = null;
        if (typeof coords.speed === 'number' && !isNaN(coords.speed) && coords.speed >= 0) v = coords.speed * 3.6;
        if (v !== null) state.speedKmh = (state.speedKmh === null) ? v : (state.speedKmh * 0.6 + v * 0.4);

        if (coords.accuracy && coords.accuracy > 100) setStatus('GPS ±' + Math.round(coords.accuracy) + ' m', 'warn');
        else setStatus('GPS actif', 'ok');
      } else {
        setStatus(failureMessage(res.diag), 'error');
      }
      renderAll();
      renderDiagnostics();
    }, function (err) {
      state.fixBusy = false;
      state.diag = { why: 'exception', message: (err && err.message) || String(err) };
      setStatus(failureMessage(state.diag), 'error');
      renderAll();
      renderDiagnostics();
    });
  }

  /* Un échec de localisation a quatre causes très différentes. Les distinguer est
     indispensable : « hors zone connue » seul ne permet ni de diagnostiquer un
     test sur téléphone, ni de corriger. */
  function failureMessage(d) {
    if (!d) return 'Position inconnue';
    if (d.why === 'hors-emprises') return 'Aucune ligne autour de cette position';
    if (d.why === 'donnees-indisponibles') return 'Ligne trouvée, données indisponibles';
    if (d.why === 'voie-trop-loin' && d.nearest) {
      return 'Voie la plus proche à ' + fmtDist(d.nearest.dist) + ' (seuil ' + d.maxDist + ' m)';
    }
    if (d.why === 'exception') return 'Erreur : ' + (d.message || '?');
    return 'Position non localisée';
  }

  /* ----------------------- Panneau diagnostic ---------------------- */
  function renderDiagnostics() {
    var box = $('diag-box');
    if (!box) return;
    var seuil = state.acceptM || 500;
    var L = ['position ' + (state.lat !== null ? state.lat.toFixed(5) + ', ' + state.lon.toFixed(5) : '—') +
             '  ±' + (state.precision ? Math.round(state.precision) : '?') + ' m  seuil ' + seuil + ' m'];
    var d = state.diag;
    if (!d) { L.push('aucun essai de localisation encore.'); box.textContent = L.join('\n'); return; }

    if (d.why === 'ok') {
      L.push('OK — ligne ' + state.line + ' au PK ' + (state.pk === null ? '—' : state.pk.toFixed(2)));
      if (d.nearest) L.push('distance à la voie : ' + d.nearest.dist + ' m');
    } else if (d.why === 'hors-emprises') {
      L.push('CAUSE : aucune des 1005 emprises de lignes ne contient cette position.');
      L.push('→ il n’y a probablement aucune voie du RFN ici. Utiliser « Position manuelle » avec un PK connu.');
    } else if (d.why === 'donnees-indisponibles') {
      L.push('CAUSE : lignes candidates trouvées, aucune géométrie chargée.');
      L.push('candidates : ' + ((d.candidates || []).join(', ') || '—'));
      L.push('chargées   : ' + ((d.loaded || []).join(', ') || 'aucune'));
      L.push('échouées   : ' + ((d.failed || []).join(', ') || 'aucune'));
      L.push('→ échec réseau ou shard indisponible pour ces lignes.');
    } else if (d.why === 'voie-trop-loin') {
      L.push('CAUSE : la voie la plus proche dépasse le seuil.');
      L.push('candidates : ' + (d.candidates || []).length + ' — chargées : ' +
             ((d.loaded || []).join(', ') || 'aucune'));
      if (d.nearest) {
        L.push('plus proche : ligne ' + d.nearest.line + ' à ' + d.nearest.dist + ' m (PK ' + d.nearest.pk.toFixed(1) + ')');
      }
    } else {
      L.push('CAUSE : ' + (d.why || '?') + (d.message ? ' — ' + d.message : ''));
    }
    box.textContent = L.join('\n');
  }

  function onGpsError(err) {
    var msg = 'GPS indisponible';
    if (err && err.code === 1) msg = 'GPS refusé';
    else if (err && err.code === 2) msg = 'GPS hors service';
    else if (err && err.code === 3) msg = 'GPS délai dépassé';
    setStatus(msg, 'error');
    if (!state.fallbackShown && state.pk === null) {
      state.fallbackShown = true;
      simShowStatic();
      setStatus('SIMULATION (GPS indisponible)', 'sim');
    }
  }
  function simShowStatic() {
    var keep = state.sim.speed;
    state.sim.speed = 0;
    simApplyPosition();
    state.sim.speed = keep;
    updateSimSpeedLabel();
  }

  function startGps() {
    if (!navigator.geolocation) { setStatus('GPS non supporté', 'error'); return; }
    simStop();
    if (state.watchId !== null) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
    state.lastPk = null;
    state.lastPkTs = null;
    setStatus('Recherche GPS...', 'warn');
    state.watchId = navigator.geolocation.watchPosition(onFix, onGpsError, {
      enableHighAccuracy: true, maximumAge: 1000, timeout: 15000
    });
    setModeButton();
  }
  function stopGps() {
    if (state.watchId !== null && navigator.geolocation) { navigator.geolocation.clearWatch(state.watchId); state.watchId = null; }
  }
  function refreshNow() {
    if (state.mode === 'sim') { renderAll(); return; }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
  }

  /* --------------------------- Simulation --------------------- */
  function getRoute() { return routeFor(state.sim.route); }

  function populateSimRoute(resetPos) {
    var route = getRoute();
    var ep = endpointsSorted(route);
    var pkSlider = $('sim-pk');
    pkSlider.min = ep[0].pk;
    pkSlider.max = ep[1].pk;
    pkSlider.step = 0.1;
    if (resetPos) {
      state.sim.pk = (typeof route.demoPk === 'number') ? route.demoPk : ep[0].pk;
      state.sim.dirSign = route.demoDir === -1 ? -1 : 1;
    }
    if (state.sim.pk < ep[0].pk || state.sim.pk > ep[1].pk) state.sim.pk = ep[0].pk + (ep[1].pk - ep[0].pk) / 2;
    pkSlider.value = state.sim.pk;
    updateSimPkLabel();

    var dirSel = $('sim-dir');
    dirSel.innerHTML =
      '<option value="1">PK croissant → vers ' + ep[1].short + '</option>' +
      '<option value="-1">PK décroissant → vers ' + ep[0].short + '</option>';
    dirSel.value = String(state.sim.dirSign);
  }
  function updateSimPkLabel() { var l = $('sim-pk-label'); if (l) l.textContent = 'PK ' + fmtHecto(state.sim.pk); }
  function updateSimSpeedLabel() { var l = $('sim-speed-label'); if (l) l.textContent = state.sim.speed + ' km/h'; }

  function simApplyPosition() {
    // points() = géométrie chargée sinon copie embarquée : la simulation
    // démarre hors-ligne, sans attendre le réseau.
    var pts = PkStore.points(state.sim.route);
    if (!pts) return;
    var pos = Geo.atPk(pts, state.sim.pk);
    state.mode = 'sim';
    state.line = state.sim.route;
    state.pk = state.sim.pk;
    state.lat = pos ? pos.lat : null;
    state.lon = pos ? pos.lon : null;
    state.offset = 0;
    state.smoothOffset = 0;
    state.dirSign = state.sim.dirSign;
    applySensOverride();
    state.speedKmh = state.sim.speed;
    state.heading = pos ? pos.segBearing : null;
    setStatus('SIMULATION', 'sim');
    renderAll();
    // Si la géométrie vient du repli embarqué, on rafraîchit depuis mon-pk
    // pour disposer des signaux de la ligne, puis on redessine.
    if (!PkStore.has(state.sim.route)) {
      PkStore.ensure(state.sim.route).then(renderAll, function () {});
    }
  }
  function simTick() {
    var ep = endpointsSorted(getRoute());
    var dt = 0.4;
    state.sim.pk += state.sim.dirSign * (state.sim.speed * dt / 3600);
    if (state.sim.pk >= ep[1].pk) { state.sim.pk = ep[1].pk; simStop(); }
    if (state.sim.pk <= ep[0].pk) { state.sim.pk = ep[0].pk; simStop(); }
    var ps = $('sim-pk'); if (ps) ps.value = state.sim.pk;
    updateSimPkLabel();
    simApplyPosition();
  }
  function simPlay() {
    stopGps();
    if (state.sim.running) return;
    state.sim.running = true;
    setModeButton();
    var btn = $('btn-sim-play');
    if (btn) { btn.textContent = '⏸ Pause'; btn.classList.add('active'); }
    simApplyPosition();
    state.sim.timer = setInterval(simTick, 400);
  }
  function simStop() {
    state.sim.running = false;
    if (state.sim.timer) { clearInterval(state.sim.timer); state.sim.timer = null; }
    var btn = $('btn-sim-play');
    if (btn) { btn.textContent = '▶ Lancer'; btn.classList.remove('active'); }
    setModeButton();
  }
  function simStep() {
    stopGps(); simStop();
    state.mode = 'sim';
    var ep = endpointsSorted(getRoute());
    state.sim.pk += state.sim.dirSign * 0.2;
    if (state.sim.pk > ep[1].pk) state.sim.pk = ep[1].pk;
    if (state.sim.pk < ep[0].pk) state.sim.pk = ep[0].pk;
    var ps = $('sim-pk'); if (ps) ps.value = state.sim.pk;
    updateSimPkLabel();
    simApplyPosition();
  }
  function simReset() {
    simStop();
    state.sim.pk = parseFloat($('sim-pk').min) + 0.1;
    $('sim-pk').value = state.sim.pk;
    updateSimPkLabel();
    simApplyPosition();
  }

  /* ---------------------- Position manuelle ------------------- */
  function testManual() {
    simStop(); stopGps();
    var lat = parseFloat($('manual-lat').value);
    var lon = parseFloat($('manual-lon').value);
    if (isNaN(lat) || isNaN(lon)) { setStatus('Coordonnées invalides', 'error'); return; }
    setStatus('Chargement...', 'warn');
    PkStore.locate(lat, lon, { maxDist: 2000, prefer: state.lastLine || null })
      .then(function (res) {
        state.diag = res.diag;
        if (!res.ok) { setStatus(failureMessage(res.diag), 'error'); renderDiagnostics(); return; }
        state.mode = 'idle';
        state.line = res.line;
        state.lastLine = res.line;
        state.pk = res.pk;
        state.lat = lat;
        state.lon = lon;
        state.offset = res.offset;
        state.smoothOffset = res.offset;
        state.speedKmh = null;
        state.dirSign = state.sim.dirSign || 1;
        setStatus('Position manuelle', 'warn');
        renderAll();
        renderDiagnostics();
      }, function (err) {
        state.diag = { why: 'exception', message: (err && err.message) || String(err) };
        setStatus(failureMessage(state.diag), 'error');
        renderDiagnostics();
      });
  }

  /* ---------------------- Rechargement OSM live --------------- */
  function reloadOsm() {
    if (state.lat === null || state.lon === null) { setStatus('Position requise', 'warn'); return; }
    if (typeof fetch !== 'function') { setStatus('fetch non supporté', 'error'); return; }
    var r = 0.3;
    var query = '[out:json][timeout:60];node["railway"="signal"](' +
      (state.lat - r) + ',' + (state.lon - r) + ',' + (state.lat + r) + ',' + (state.lon + r) + ');out body;';
    var endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];
    setStatus('Chargement signaux OSM...', 'warn');
    function tryEndpoint(i) {
      if (i >= endpoints.length) { setStatus('Échec chargement OSM', 'error'); return; }
      fetch(endpoints[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      })
        .then(function (resp) { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.json(); })
        .then(function (json) {
          var added = Signals.mergeOSM((json && json.elements) ? json.elements : []);
          renderSignals();
          setStatus('Signaux OSM +' + added, 'ok');
        })
        .catch(function () { tryEndpoint(i + 1); });
    }
    tryEndpoint(0);
  }

  /* ------------------------- Apparence ------------------------ */
  function applyLayout(name) {
    state.layout = name;
    document.body.classList.remove('layout-full', 'layout-pk', 'layout-speed', 'layout-signals');
    document.body.classList.add('layout-' + name);
    var sel = $('sel-layout');
    if (sel) sel.value = name;
    renderAll();
  }
  function cycleLayout() {
    var order = ['full', 'pk', 'speed', 'signals'];
    var i = order.indexOf(state.layout);
    applyLayout(order[(i + 1) % order.length]);
  }
  function applyTheme() {
    document.body.classList.toggle('day', !state.night);
    try { localStorage.setItem('monpk.night', state.night ? '1' : '0'); } catch (e) {}
  }
  function toggleTheme() { state.night = !state.night; applyTheme(); }
  function toggleFullscreen() {
    var d = document, el = d.documentElement;
    var isFs = d.fullscreenElement || d.webkitFullscreenElement;
    if (!isFs) {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { try { req.call(el); } catch (e) { document.body.classList.add('fs-pseudo'); } }
      else document.body.classList.add('fs-pseudo');
    } else {
      var ex = d.exitFullscreen || d.webkitExitFullscreen;
      if (ex) { try { ex.call(d); } catch (e) {} }
      document.body.classList.remove('fs-pseudo');
    }
  }
  function setModeButton() {
    var b = $('btn-mode');
    if (!b) return;
    b.textContent = state.mode === 'sim' ? '🛠 Simu' : (state.mode === 'gps' ? '📡 GPS' : '⏸ Arrêt');
    b.setAttribute('data-mode', state.mode);
  }
  function openSettings() { $('settings').classList.remove('hidden'); }
  function closeSettings() { $('settings').classList.add('hidden'); }

  function populateSettings() {
    var selRegion = $('sel-region');
    if (selRegion && typeof frenchRegions !== 'undefined') {
      // Options derivées de data/regions.js : plus de liste dupliquée à maintenir.
      var rgs = frenchRegions.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'fr'); });
      var ro = '<option value="">Toutes régions</option>';
      for (var g = 0; g < rgs.length; g++) ro += '<option value="' + rgs[g].code + '">' + escapeHtml(rgs[g].name) + '</option>';
      selRegion.innerHTML = ro;
    }
    var selLine = $('sel-line');
    if (selLine) {
      var html = '<option value="">Auto</option>';
      var keys = PkStore.codes();
      for (var i = 0; i < keys.length; i++) {
        var code = keys[i];
        var info = LineRegions.get(code);
        var label = 'Ligne ' + code + (info.regionsJoin ? ' - ' + info.regionsJoin : '');
        html += '<option value="' + code + '">' + label + '</option>';
      }
      selLine.innerHTML = html;
    }
    var selRoute = $('sel-route');
    if (selRoute && typeof routes !== 'undefined') {
      var rh = '', rk = Object.keys(routes);
      for (var j = 0; j < rk.length; j++) rh += '<option value="' + rk[j] + '">' + routes[rk[j]].label + '</option>';
      selRoute.innerHTML = rh;
    }
    // Filtre région : n'affiche que les lignes ayant un point PK dans la
    // région. Ne masque jamais tout sans prévenir, et laisse "Auto" accessible.
    if (selRegion) {
      selRegion.addEventListener('change', function () {
        var selected = this.value;
        var lineSel = $('sel-line');
        if (!lineSel) return;
        var shown = 0;
        for (var i = 0; i < lineSel.options.length; i++) {
          var opt = lineSel.options[i];
          var code = opt.value;
          if (!code) { opt.style.display = ''; continue; }
          var match = !selected || LineRegions.getRegionsForLine(code).indexOf(selected) !== -1;
          opt.style.display = match ? '' : 'none';
          if (match) shown++;
        }
        if (selected && !shown) {
          setStatus('Aucune ligne embarquée en ' + LineRegions.regionName(selected), 'warn');
        }
      });
    }
  }

  /* -------------------------- Événements ---------------------- */
  function bind() {
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-close-settings').addEventListener('click', closeSettings);
    $('btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('btn-theme').addEventListener('click', toggleTheme);
    $('btn-layout').addEventListener('click', cycleLayout);
    $('btn-refresh').addEventListener('click', refreshNow);
    $('btn-mode').addEventListener('click', function () {
      if (state.mode === 'gps') { stopGps(); state.mode = 'idle'; setStatus('En pause', 'off'); setModeButton(); }
      else startGps();
    });

    $('sel-layout').addEventListener('change', function () { applyLayout(this.value); });
    $('sel-window').addEventListener('change', function () { state.windowKm = parseFloat(this.value); renderAll(); });
    $('sel-window-back').addEventListener('change', function () { state.windowBackKm = parseFloat(this.value); renderSignals(); });
    $('sel-scope').addEventListener('change', function () { state.scope = this.value; renderSignals(); });
    $('sel-line').addEventListener('change', function () { state.manualLine = this.value || null; });
    $('sel-accept').addEventListener('change', function () {
      state.acceptM = parseInt(this.value, 10) || 500;
      renderDiagnostics();
    });
    $('sel-track').addEventListener('change', function () { state.manualTrackSide = this.value || null; renderAll(); });
    $('sel-sens').addEventListener('change', function () {
      state.sensOverride = parseInt(this.value, 10) || 0;
      applySensOverride();
      renderAll();
    });
    $('chk-src-sigmap').addEventListener('change', function () { state.sources.sigmap = this.checked; renderSignals(); });
    $('chk-src-osm').addEventListener('change', function () { state.sources.osm = this.checked; renderSignals(); });
    $('chk-src-codeli').addEventListener('change', function () { state.sources.codeli = this.checked; renderSignals(); });
    $('chk-pn').addEventListener('change', function () { state.showPn = this.checked; renderSignals(); });

    $('sel-route').addEventListener('change', function () { state.sim.route = this.value; populateSimRoute(true); simApplyPosition(); });
    $('sim-dir').addEventListener('change', function () { state.sim.dirSign = parseInt(this.value, 10); if (state.mode === 'sim') simApplyPosition(); });
    $('sim-pk').addEventListener('input', function () {
      state.sim.pk = parseFloat(this.value); updateSimPkLabel();
      if (state.mode === 'sim' && !state.sim.running) simApplyPosition();
    });
    $('sim-speed').addEventListener('input', function () {
      state.sim.speed = parseInt(this.value, 10); updateSimSpeedLabel();
      if (state.mode === 'sim') { state.speedKmh = state.sim.speed; renderSpeed(); }
    });
    $('btn-sim-play').addEventListener('click', function () { if (state.sim.running) simStop(); else simPlay(); });
    $('btn-sim-step').addEventListener('click', simStep);
    $('btn-sim-reset').addEventListener('click', simReset);
    $('btn-manual').addEventListener('click', testManual);
    $('btn-diag').addEventListener('click', function () {
      renderDiagnostics();
      if (state.lat !== null && state.lon !== null) testManual();
      else refreshNow();
    });
    $('btn-clear-cache').addEventListener('click', function () {
      try {
        var n = 0;
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && k.indexOf('monpk.pk.') === 0) { localStorage.removeItem(k); n++; }
        }
        setStatus(n + ' ligne(s) retirée(s) du cache', 'ok');
      } catch (e) { setStatus('Cache inaccessible', 'warn'); }
      renderDiagnostics();
    });
    $('btn-reload-osm').addEventListener('click', reloadOsm);

    $('btn-rem-add').addEventListener('click', addReminder);
    $('btn-rem-pk').addEventListener('click', function () {
      if (state.pk === null) { setStatus('Aucune position', 'warn'); return; }
      $('rem-pk').value = state.pk.toFixed(3);
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT')) return;
      if (ev.key === ' ') { ev.preventDefault(); if (state.sim.running) simStop(); else simPlay(); }
      else if (ev.key === 'l' || ev.key === 'L') cycleLayout();
      else if (ev.key === 'n' || ev.key === 'N') toggleTheme();
      else if (ev.key === 'f' || ev.key === 'F') toggleFullscreen();
      else if (ev.key === '+') simStep();
    });
  }

  function startClock() {
    function tick() {
      var d = new Date(), el = $('clock');
      if (el) el.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    }
    tick();
    setInterval(tick, 1000);
  }

  /* --------------------------- Init --------------------------- */
  function init() {
    try { if (localStorage.getItem('monpk.night') === '0') state.night = false; } catch (e) {}
    applyTheme();

    loadReminders();
    populateSettings();
    bind();
    renderReminderList();
    startClock();

    if (typeof routes !== 'undefined' && routes['650000']) {
      state.sim.route = '650000';
      state.sim.speed = 100;
      var sp = $('sim-speed'); if (sp) sp.value = state.sim.speed;
      updateSimSpeedLabel();
      populateSimRoute(true);
    }

    applyLayout('full');
    setModeButton();

    if (navigator.geolocation) startGps();
    else setStatus('GPS non supporté — utilisez la simulation', 'warn');

    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();