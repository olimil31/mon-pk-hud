/* =====================================================================
   icons.js — pictogrammes SVG (signaux, gare, PN, rappel)
   Formes : jeu SNCF/IRT SystemX "images des feux"
            (chassis A, C, F, H, ID2, ID3, R ; aspects).
   Types FR : schéma OpenRailwayMap/Tagging_in_France
            (railway:signal:main=FR:C/S/Cv, :shape=FR:C/F/H, form, ref,
             railway:position:exact = PK du signal).
   ===================================================================== */

var SignalIcons = (function () {
  'use strict';

  function norm(s) {
    s = String(s || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s;
  }
  function frUp(s) { return String(s || '').trim().toUpperCase(); }

  // Châssis : disposition des feux (vue 32x32) + boîtier.
  var CHASSIS = {
    A:   { box: [9, 3, 14, 26, 4], lamps: [[16, 8], [16, 16], [16, 24]] },
    C:   { box: [9, 2, 14, 28, 4], lamps: [[16, 6], [16, 11], [16, 16], [16, 21], [16, 26]] },
    ID2: { box: [4, 9, 24, 14, 4], lamps: [[11, 16], [21, 16]] },
    ID3: { box: [3, 9, 26, 14, 4], lamps: [[8, 16], [16, 16], [24, 16]] },
    F:   { box: [4, 5, 24, 22, 4], lamps: [[9, 11], [16, 11], [23, 11], [9, 19], [16, 19], [23, 19], [23, 26]] },
    H:   { box: [4, 3, 24, 26, 4], lamps: [[9, 8], [16, 8], [23, 8], [9, 15], [16, 15], [23, 15], [12, 23], [16, 23], [20, 23]] },
    R:   { disc: true, lamps: [[12, 13], [16, 13], [20, 13], [12, 20], [16, 20], [20, 20]] }
  };

  // Aspect -> [regex, couleur, nombre de feux allumés].
  var ASPECTS = [
    [/carre.*violet|violet/, '#8e24aa', 1],
    [/carre/, '#e53935', 2],
    [/semaphore/, '#e53935', 1],
    [/disque/, '#e53935', 1],
    [/avertissement/, '#fdd835', 1],
    [/rappel/, '#fdd835', 2],
    [/ralentissement/, '#fdd835', 2],
    [/croix/, '#f5f5f5', 1],
    [/manoeuvre/, '#f5f5f5', 1],
    [/blanc|voie libre|\bvl\b/, '#f5f5f5', 1],
    [/vert/, '#43a047', 1],
    [/jaune/, '#fdd835', 1],
    [/rouge/, '#e53935', 1]
  ];

  // Codes FR : type -> [aspect, chassis par défaut]
  var FR_MAIN = {
    'FR:C': ['carre', 'ID2'],
    'FR:CV': ['carre_violet', 'ID2'],
    'FR:S': ['semaphore', 'A'],
    'FR:GA': ['carre', 'ID2'],
    'FR:M': ['manoeuvre', 'A'],
    'FR:RR': ['rappel', 'A'],
    'FR:R': ['ralentissement', 'A'],
    'FR:VL': ['feu_blanc', 'A'],
    'FR:X': ['croix', 'A']
  };
  var FR_DISTANT = {
    'FR:D': ['disque', 'R'],
    'FR:A': ['avertissement', 'A'],
    'FR:RR': ['rappel', 'A'],
    'FR:R': ['ralentissement', 'A'],
    'FR:VL': ['feu_blanc', 'A']
  };
  var FR_SHAPE = { 'FR:A': 'A', 'FR:C': 'C', 'FR:F': 'F', 'FR:H': 'H', 'FR:K': 'C' };
  var FR_LABEL = {
    'FR:C': 'Carré', 'FR:CV': 'Carré violet', 'FR:S': 'Sémaphore', 'FR:GA': "Guidon d'arrêt",
    'FR:D': 'Disque', 'FR:A': 'Avertissement', 'FR:M': 'Manœuvre', 'FR:RR': 'Rappel',
    'FR:R': 'Ralentissement', 'FR:VL': 'Voie libre', 'FR:X': 'Croix blanche'
  };

  // Nature des installations fixes SNCF-SigMap (champ type_if).
  // aspect : aspect lumineux ; chassis : forme ; panel : panneau à texte.
  var SM_TYPES = {
    'CARRE':      { label: 'Carré', aspect: 'carre', chassis: 'ID2' },
    'S':          { label: 'Sémaphore', aspect: 'semaphore', chassis: 'A' },
    'A':          { label: 'Avertissement', aspect: 'avertissement', chassis: 'A' },
    'CV':         { label: 'Carré violet', aspect: 'carre_violet', chassis: 'ID2' },
    'D':          { label: 'Disque', aspect: 'disque', chassis: 'R' },
    'DD':         { label: 'Double disque', aspect: 'disque', chassis: 'R' },
    'R':          { label: 'Ralentissement', aspect: 'ralentissement', chassis: 'A' },
    'RR':         { label: 'Rappel de ralentissement', aspect: 'rappel', chassis: 'A' },
    'GA':         { label: "Guidon d'arrêt", aspect: 'croix', chassis: 'A' },
    'ARRET':      { label: "Signal d'arrêt", aspect: 'carre', chassis: 'ID2' },
    'ARRET VOY':  { label: 'Arrêt pour voyageurs', aspect: 'carre', chassis: 'ID2' },
    'Z':          { label: 'Avertissement de Z', aspect: 'avertissement', chassis: 'A' },
    'ID':         { label: 'Indicateur de direction', panel: true, short: 'ID' },
    'IDD':        { label: 'Indicateur de direction', panel: true, short: 'IDD' },
    'CHEVRON':    { label: 'Chevron', panel: true, short: '<<' },
    'TIV D FIXE': { label: 'TIV à distance (fixe)', panel: true, short: 'TIV' },
    'TIV D MOB':  { label: 'TIV à distance (mobile)', panel: true, short: 'TIV' },
    'TIV R MOB':  { label: 'TIV de rappel (mobile)', panel: true, short: 'TIV' },
    'TIVD B FIX': { label: 'TIV disque (fixe)', panel: true, short: 'TIV' },
    'TIVD C FIX': { label: 'TIV disque (fixe)', panel: true, short: 'TIV' },
    'TECS':       { label: "Tableau d'exécution", panel: true, short: 'TECS' },
    'TSCS':       { label: 'Tableau de signalisation', panel: true, short: 'TSCS' },
    'TLD':        { label: 'Tableau lumineux de direction', panel: true, short: 'TLD' },
    'SLD':        { label: 'Sélecteur lumineux de direction', panel: true, short: 'SLD' },
    'SLM':        { label: 'Sélecteur lumineux', panel: true, short: 'SLM' },
    'ATC':        { label: "Avertissement de travaux", panel: true, short: 'ATC' },
    'LM':         { label: 'Limite de manœuvre', panel: true, short: 'LM' },
    'LIMITETS':   { label: 'Limite TS', panel: true, short: 'LTS' },
    'REPER VIT':  { label: 'Repère de vitesse', panel: true, speedPanel: true },
    'MIBLAN VER': { label: 'Mi-blanc-vert', panel: true, short: 'MBV' },
    'SIFFLER':    { label: 'Siffler', panel: true, short: 'S' },
    'APPROETSA':  { label: 'Approche ETSA', panel: true, short: 'AET' },
    'DEPOT':      { label: 'Dépôt', panel: true, short: 'D' },
    'DESTI':      { label: 'Destination', panel: true, short: 'D' },
    'G':          { label: 'Garage', panel: true, short: 'G' },
    'PN':         { label: 'Passage à niveau', panel: true, short: 'PN' },
    'PN...':      { label: 'Passage à niveau', panel: true, short: 'PN' },
    'BP DIS':     { label: 'Bouton-poussoir disque', panel: true, short: 'BPD' },
    'BP EXE':     { label: "Bouton-poussoir d'exécution", panel: true, short: 'BPX' },
    'BP FIN':     { label: 'Bouton-poussoir de fin', panel: true, short: 'BPF' },
    'VOIE CONV':  { label: 'Voie convoyeuse', panel: true, short: 'VC' },
    'REV':        { label: 'Repère', panel: true, short: 'REV' },
    'TAB DIVERS': { label: 'Tableau divers', panel: true, short: 'TAB' },
    'DIVERS':     { label: 'Divers', panel: true, short: '?' },
    'IMP':        { label: 'Implantation', panel: true, short: 'IMP' },
    'HEURT...':   { label: 'Heurtoir', panel: true, short: 'H' }
  };

  function smEntry(e) {
    if (!e || !e.type) return null;
    return SM_TYPES[frUp(e.type)] || { label: frUp(e.type), panel: true, short: frUp(e.type).slice(0, 4) };
  }

  function typeLabel(e) {
    var t = e.tags || {};
    if (e.source === 'CODELI' && e.type) return e.type;
    if (e.source === 'SIGMAP' && e.type) {
      var sm = smEntry(e);
      return sm ? sm.label : e.type;
    }
    var mt = frUp(t['railway:signal:main']);
    if (mt && FR_LABEL[mt]) return FR_LABEL[mt];
    var dt = frUp(t['railway:signal:distant']);
    if (dt && FR_LABEL[dt]) return FR_LABEL[dt];
    return t['railway:signal:type'] || '';
  }

  function aspectOf(e) {
    var t = e.tags || {};
    var a = norm(e.aspect || '');
    if (!a && e.source === 'SIGMAP') {
      var sm = smEntry(e);
      if (sm && sm.aspect) a = sm.aspect;
    }
    if (!a) {
      var mt = frUp(t['railway:signal:main']);
      var dt = frUp(t['railway:signal:distant']);
      var entry = (mt && FR_MAIN[mt]) || (dt && FR_DISTANT[dt]) || null;
      if (entry) a = entry[0];
    }
    if (!a) {
      a = norm(t['railway:signal:main:states'] || t['railway:signal:distant:states'] ||
               t['railway:signal:minor:states'] || t['railway:signal:states'] || '');
    }
    for (var i = 0; i < ASPECTS.length; i++) {
      if (ASPECTS[i][0].test(a)) return { color: ASPECTS[i][1], n: ASPECTS[i][2] };
    }
    return null;
  }

  function chassisOf(e) {
    var t = e.tags || {};
    var c = String(e.chassis || t['railway:signal:chassis'] || '').toUpperCase();
    if (CHASSIS[c]) return c;
    if (e.source === 'SIGMAP') {
      var sm = smEntry(e);
      if (sm && sm.chassis) return sm.chassis;
    }
    var sh = frUp(t['railway:signal:main:shape'] || t['railway:signal:distant:shape']);
    if (FR_SHAPE[sh]) return FR_SHAPE[sh];
    var mt = frUp(t['railway:signal:main']);
    var dt = frUp(t['railway:signal:distant']);
    var entry = (mt && FR_MAIN[mt]) || (dt && FR_DISTANT[dt]) || null;
    if (entry && CHASSIS[entry[1]]) return entry[1];
    var type = norm(e.type || t['railway:signal:type'] || '');
    if (type.indexOf('carre') === 0) return 'ID2';
    if (type.indexOf('semaphore') === 0) return 'R';
    if (type.indexOf('avertissement') === 0) return 'A';
    if (type.indexOf('ralentissement') === 0 || type.indexOf('rappel') === 0) return 'ID3';
    return null;
  }

  function escapeSvg(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function signal(e) {
    var t = e.tags || {};
    var form = norm(t['railway:signal:form'] || t['railway:signal:main:form'] || t['railway:signal:distant:form'] || t['railway:signal:minor:form'] || '');
    var asp = aspectOf(e);
    var ch = chassisOf(e);
    var sm = (e.source === 'SIGMAP') ? smEntry(e) : null;
    var body = '';

    if (ch) {
      var def = CHASSIS[ch];
      if (def.disc) body += '<circle cx="16" cy="16" r="13" fill="#161616" stroke="#9aa" stroke-width="1.5"/>';
      else body += '<rect x="' + def.box[0] + '" y="' + def.box[1] + '" width="' + def.box[2] + '" height="' + def.box[3] + '" rx="' + def.box[4] + '" fill="#161616" stroke="#9aa" stroke-width="1.5"/>';
      var lit = asp ? asp.n : 0;
      for (var i = 0; i < def.lamps.length; i++) {
        var p = def.lamps[i];
        var on = i < lit;
        var col = on ? asp.color : '#3a3a3a';
        body += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.7" fill="' + col + '"' + (on ? '' : ' stroke="#555"') + '/>';
      }
      if (asp && asp.color === '#fdd835') {
        var p0 = def.lamps[0];
        body += '<circle cx="' + p0[0] + '" cy="' + p0[1] + '" r="3.8" fill="none" stroke="#fdd835" stroke-width="0.8" opacity="0.6"/>';
      }
    } else if (sm && sm.speedPanel) {
      var spd = (typeof e.displaySpeed === 'number') ? e.displaySpeed : 30;
      body = '<rect x="14" y="10" width="4" height="18" fill="#888"/>' +
             '<rect x="3" y="3" width="26" height="19" rx="2" fill="#fff" stroke="#111" stroke-width="2"/>' +
             '<text x="16" y="17" font-size="13" font-weight="800" text-anchor="middle" fill="#111" font-family="sans-serif">' + escapeSvg(spd) + '</text>';
    } else if (sm && sm.panel) {
      body = '<rect x="14" y="8" width="4" height="20" fill="#888"/>' +
             '<rect x="4" y="3" width="24" height="17" rx="2" fill="#fff" stroke="#111" stroke-width="2"/>' +
             '<text x="16" y="15" font-size="8" font-weight="700" text-anchor="middle" fill="#111" font-family="sans-serif">' + escapeSvg(sm.short || '') + '</text>';
    } else if (form === 'light') {
      body = '<rect x="11" y="3" width="10" height="24" rx="3" fill="#161616" stroke="#9aa" stroke-width="1.5"/>' +
             '<circle cx="16" cy="8" r="2.6" fill="#e8e8e8"/><circle cx="16" cy="15" r="2.6" fill="#e8e8e8"/><circle cx="16" cy="22" r="2.6" fill="#e8e8e8"/>';
    } else if (form === 'sign') {
      body = '<rect x="14" y="6" width="4" height="22" fill="#888"/><rect x="6" y="4" width="20" height="16" rx="2" fill="#fff" stroke="#111" stroke-width="2"/>';
    } else {
      body = '<rect x="14" y="6" width="4" height="22" fill="#888"/>' +
             '<rect x="7" y="3" width="18" height="13" rx="2" fill="#161616" stroke="#aaa" stroke-width="1.5"/>' +
             '<circle cx="12" cy="9.5" r="2.2" fill="#e8e8e8"/><circle cx="16" cy="9.5" r="2.2" fill="#e8e8e8"/><circle cx="20" cy="9.5" r="2.2" fill="#e8e8e8"/>';
    }
    return '<svg viewBox="0 0 32 32" class="sigicon" aria-hidden="true">' + body + '</svg>';
  }

  function gare() {
    return '<svg viewBox="0 0 32 32" class="sigicon" aria-hidden="true"><rect x="5" y="13" width="22" height="13" rx="2" fill="#7b2ff7"/><polygon points="16,4 29,14 3,14" fill="#c77dff"/><rect x="13" y="18" width="6" height="8" fill="#fff"/></svg>';
  }
  function pn() {
    return '<svg viewBox="0 0 32 32" class="sigicon" aria-hidden="true"><polygon points="16,4 30,27 2,27" fill="#ff8c42" stroke="#fff" stroke-width="1.5"/><rect x="14.6" y="11" width="2.8" height="9" fill="#111"/><circle cx="16" cy="23" r="1.9" fill="#111"/></svg>';
  }
  function rappel() {
    return '<svg viewBox="0 0 32 32" class="sigicon" aria-hidden="true"><rect x="6" y="6" width="20" height="20" rx="3" fill="#ffe066" stroke="#b8860b" stroke-width="1.5"/><rect x="14.6" y="9" width="2.8" height="9" fill="#111"/><circle cx="16" cy="22" r="2" fill="#111"/></svg>';
  }

  return { signal: signal, gare: gare, pn: pn, rappel: rappel, typeLabel: typeLabel, chassis: Object.keys(CHASSIS) };
})();