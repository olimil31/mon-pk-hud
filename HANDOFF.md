# HANDOFF — intégration du jeu de signaux SNCF-SigMap

> Note de reprise (session précédente devenue lourde). Ce document décrit la source
> découverte et le plan d'intégration. Le fichier de données est déjà extrait.

## 1. Source découverte : SNCF-SigMap

- Application : https://sncf-sigmap.netlify.app/ (par Noël Danjou — auteur des presets
  JOSM « French Railway Signalling »).
- **Base compilée de 123 870 signaux** sur la France, **avec positions, type, ligne,
  voie, sens, côté, PK et idreseau** — bien plus riche qu'OSM brut.
- **Couverture Montréjeau confirmée** : notre extraction donne 54 signaux sur 650000
  entre PK 90 et 115.

### Accès aux données
- Manifeste : `https://sncf-sigmap.netlify.app/data/manifest.json`
  → `{ tile_deg: 0.5, tiles: { "<lonIdx>:<latIdx>": <count> } }`
- Index : `https://sncf-sigmap.netlify.app/data/index.json` (types, lignes, blocs)
- **Tuiles GeoJSON** : `https://sncf-sigmap.netlify.app/data/tiles/<lonIdx>_<latIdx>.json`
  - **Nom de fichier avec `_`**, alors que le manifeste utilise `:`.
  - indices : `floor(deg / 0.5)`, `lonIdx` puis `latIdx` (ex. Montréjeau → `1_86`).
  - servies gzip transparent (utiliser `curl --compressed`).

### Schéma d'un signal (exemple réel, ligne 650000)
```json
{ "lat":43.0788695, "lng":0.5683976, "type_if":"S", "code_ligne":"650000",
  "nom_voie":"V1", "sens":"C", "position":"G", "pk":"104+299",
  "idreseau":"158548", "code_voie":"650000-1-V1" }
```
- `type_if` : type (CARRE, S, A, CV, D, R, GA, ARRET, ARRET VOY, TIV D FIXE, Z,
  CHEVRON, ID, TECS, ATC, LM, PN, …).
- `sens` : **C** = croissant, **D** = décroissant, B = les deux.
- `position` : **G** = gauche, **D** = droite.
- `nom_voie` : V1 / V2 / UNIQUE / voies de gare.
- `pk` : PK officiel (format `"104+299"` = 104,299).

### Licence / attribution
Le site référence ODbL (OSM) et SNCF Open Data ; le code est AGPL-3.0 (Noël Danjou).
→ **Attribuer « SNCF-SigMap (Noël Danjou) / OpenStreetMap / SNCF Open Data »** et
conserver la compatibilité ODbL. À vérifier avant toute redistribution.

## 2. Déjà fait
- Extraction des lignes **640000** et **650000** :
  `data/sigmap_signals.js` — `const sigmapSignals = [ ... ]` (**3015 signaux** :
  640000 = 2208, 650000 = 807 ; dont 54 à Montréjeau).
  Champs : `id, line, pk, lat, lon, type, side (left/right), track, dir (C/D/B), code_voie, ref`.

## 3. Intégration (FAIT)
1. **data.js** : `Signals` reconstruit `sigmapSignals` (source `SIGMAP`) sur **toute la
   ligne** (640000 + 650000), avec `side` → `offset`, technique `ref` (n°) et nature
   (`type`). OSM en complément (dédupliqué à 40 m), CODELI en surcharge au PK.
2. **index.html** : `data/sigmap_signals.js` chargé avant `js/data.js`.
3. **icons.js** : table `SM_TYPES` mappant `type_if` → nature FR + aspect/châssis, ou
   panneau à texte (TIV, Z, chevron, ID, PN…).
4. **app.js** : affichage **nature** + **voie** + côté (badge `SNCF`, **sans n°** SigMap).
   Filtre **« Ma voie »/toutes voies** (bouton rapide), **regroupement au même PK**,
   sources cochables (SigMap/OSM/CODELI). `REPER VIT` → panneau blanc chiffré
   (vitesse suivante via `LineInfo.nextVmax`, sinon 30). `G` = Garage.
   Vérifié : 650000 filtré V1 ; 4 cadres multi ; RV = 140/160.

### Couverture PK nationale (fait)
La géométrie PK **n'est plus limitée à 640000/650000** : le dépôt
[olimil31/mon-pk](https://github.com/olimil31/mon-pk) publie un shard
`pks_<code>.js` par ligne (~29 Ko, 1005 lignes, ODbL 1.0).

- `js/shards.js` : chargeur `fetch()` + extraction du littéral JSON.
  **Pas de `<script src>`** : l'amont déclare `const pkData`, donc l'injection
  en balise plante au 2e chargement (SyntaxError sur redéclaration) — c'est le
  bug de l'amont. `raw.githubusercontent.com` et `olimil31.github.io` envoient
  tous deux `Access-Control-Allow-Origin: *`, `fetch()` suffit.
  Cache disque : 12 lignes en `localStorage` (clé `monpk.pk.<code>`, purge LRU).
- `PkStore.locate()` est désormais **asynchrone** : `zonesCovering()` (1005
  emprises) → chargement des 6 candidats max → projection.
- Repli hors-ligne : `data/pk_lines.js` pour 640000/650000.
- `PkStore.points(code)` = chargé sinon embarqué (utilisé par la simulation et
  les builders, pour ne pas dépendre du réseau).
- ⚠ **Bug corrigé au passage** : `var zones = (typeof zones !== 'undefined') ? zones : []`
  — le `var` hoisté masquait le global, donc `zonesCovering()` renvoyait
  **toujours une liste vide** depuis le début. Invisible tant qu'il n'y avait
  que 2 lignes (le repli `Object.keys(lines)` suffisait), bloquant pour le national.

### Reste optionnel
- Châssis exacts (aspects officiels) pour affiner les pictogrammes.
- **L'aspect d'un signal n'existe pas en source ouverte** : l'icône ne montre que la
  nature / le châssis. Ne pas faire evoluer l'icone vers un feu « vert » sans source.
- Le mappage lignes/régions est calculé dans le navigateur à partir des points PK
  chargés + `data/regions.js` (emprises approximatives, Nouvelle-Aquitaine incluse).
  Les anciens scripts Node (`regions.js` racine, `map_regions.js`,
  `data/line_regions.js`) ont été supprimés : non chargés, et `module.exports`
  aurait cassé le navigateur.

### Perf
- `Geo.projectOnPolyline` ne calcule plus `bearing()` que pour le segment gagnant
  (il l'évaluait sur les ~5000 itérations, ~7 transcendantes chacune).
- **Projection fenêtrée** : la polyligne étant triée par PK croissant, on ne
  projette que sur une fenêtre de ±80 segments (±8 km) autour du PK attendu au
  lieu des 4749 segments de la ligne. Vérifié **équivalent au balayage complet**
  sur les 3015 signaux (écart max 0,0 PK).
  `build()` 640000 : 310–430 ms → **14 ms** ; 650000 : 85–95 ms → **4 ms**.
  Ne jamais passer un `pkHint` non fiable : sans indice (`null`), la projection
  reste complète — c'est le cas de `PkStore.locate`.

### Semantique des filtres (validee)
- **Seul `dir` filtre** (Signals.dirOk). Le nom de voie ne filtre plus : SigMap
  contredit sa propre regle « V1 = croissant » sur 22 % de la 650000 et 38 % de la
  640000, hors gare (180/180 a plus de 1,5 km d'une gare sur la 650000).
  Un filtre voie masquerait 60 signaux `dir=C` en pleine ligne sur la 650000.
- **Voie unique** : `Signals.singleTrackRanges()` regroupe les signaux `UNIQUE`
  (seuil 3 km, exclut les runs < 50 m, élargi de 300 m). 4 sections sur la
  650000 (PK 270-273, 283-290, 302-307, 312-320), 0 sur la 640000.
- **Sens** : defaut = normal (croissant, voie 1), mesure par le deplacement du
  PK puis par le cap, imposable via `sel-sens`. `dirSource` = defaut | gps | manuel.
- `covers` : `coverageMessage()` remplace « rien a venir » par la limite reelle
  de la donnee (« aucun signal connu sur 8,5 km — jusqu'au PK 113,0 »).

### PWA / hors-ligne
- `sw.js` : `VERSION = 'v3'`. Precocoche le coquillage avec `cache.add` tolerant
  (**pas `addAll`**, qui fait echouer l'install des qu'une URL manque — c'est le
  bug du `mon-pk` amont). Lecture cache d'abord ; shards `pks_<code>.js` mis en
  cache a la premiere visite, jamais invalides.
- **A incrementer a chaque deploiement**, sinon les visiteurs gardent l'ancienne
  version.
- `manifest.json` : icones 192/512 ( reprises de `mon-pk`), `display: fullscreen`,
  `purpose: maskable`. Enregistre uniquement en `https:`.

### Trous de donnees 650000 (mesures, filtres actuels)
13 zones sans signal connu sur 5 km, jusqu'a 8,5 km (PK 105-113, 199,5-207,
271,5-277,5, 289-296,5, ...) ; plus grand intervalle entre 2 signaux **11,97 km**.
640000 : 3 zones de 1 km, max 3,97 km. A traiter si le ligne est reextraite.

### Filtres de sûreté (appliqués)
- **Sens** : `Signals.dirOk()` filtre sur le champ `dir` de SigMap (C / D / B).
  Un signal de sens inconnu reste affiché (fail-safe).
- **Voie** : `Signals.trackVoie()` normalise `V1`, `1`, `1A`, `1B`, `1C`, `1BIS`,
  `2BIS`, `4E`, `UNIQUE`… vers `1`/`2`/`unique`, et `null` pour tout le reste
  (faisceaux, gares, manœuvre). Le filtre « Ma voie » ne masque que la voie jumelle
  identifiée avec certitude.
  - Mesuré sur la ligne 640000 en sens croissant (fenêtre = ligne entière) :
    **avant 734 signaux affichés dont 230 de sens opposé** (504 utiles) →
    **après 735 affichés, 0 de sens opposé**. En sens décroissant : 675 affichés.
  - Vérifié : 17/17 assertions (Chrome headless) — voir `L.1` du filtre.

## 4. Rappel de l'état de l'app
- `data/pk_lines.js` (PK Wurtz), `signals_osm.js` (OSM), `pn_osm.js` (PN), `sncf_gares.js`,
  `sncf_vmax.js`, `sncf_cantonnement.js`, `stations_osm.js`.
- `js/geo.js`, `js/icons.js` (pictogrammes + schéma FR `railway:signal:main=FR:*` et
  `railway:position:exact`), `js/data.js` (PkStore, Signals, Crossings, Stations, LineInfo),
  `js/app.js` (HUD, GPS, simulation, rappels).
- Lancer : `powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8080`.
