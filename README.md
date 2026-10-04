# Mon PK — HUD Conducteur (v3)

Aide à la **situation du conducteur** : PK à l'hectomètre, vitesse, sens, voie (V1/V2),
**vitesse limite (VL)** et **cantonnement** de la ligne, et un bandeau défilant de
**signaux, passages à niveau, gares et rappels** à venir — avec les éléments passés.

> ⚠️ **Données indicatives, non garanties.** Ne remplace pas les documents réglementaires
> (CODELI, signalisation, consignes).

---

## 1. Lancer

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8080
```
Ouvrir <http://localhost:8080/> (GPS : `localhost` ou https).

### Sur un téléphone

Le GPS n'est disponible qu'en **contexte sécurisé**. Sur `http://192.168.x.x`
le navigateur refuse la géolocalisation : passer par GitHub Pages (HTTPS) ou un
tunnel HTTPS. En dépannage, Chrome accepte
`--unsafely-treat-insecure-origin-as-secure=http://192.168.x.x:8080`.

---

## 1 ter. Déployer sur GitHub Pages

Le dépôt est **100 % statique** : aucune étape de build.

```powershell
git init
git add -A
git commit -m "Mon PK — HUD conducteur"
git branch -M main
git remote add origin https://github.com/<vous>/<depot>.git
git push -u origin main
```

Puis **Settings → Pages → Source : branche `main`, dossier `/ (root)`**.
L'application est servie sur `https://<vous>.github.io/<depot>/`.

Après **chaque** déploiement : incrémenter `VERSION` dans `sw.js`, sinon les
visiteurs garderont l'ancienne version depuis le cache du service worker.

> Le service worker n'est enregistré qu'en `https:`. En local, `localhost` est
> déjà un contexte sécurisé mais l'enregistrement est ignoré : le hors-ligne
> se teste donc sur l'URL GitHub Pages.

---

## 1 quater. Ce qui a été vérifié

- **Projection fenêtrée** : identique au balayage complet sur les 3015 signaux
  (écart max 0,0 PK), pour un coût divisé par ~30 (`build()` : 640000
  310–430 ms → **14 ms**, 650000 85–95 ms → **4 ms**).
- **Filtre de sens** : 0 signal de sens opposé sur les 470 affichés en
  croissant et 449 en décroissant (650000).
- **Voie unique** : 4 sections détectées sur la 650000 (PK 270-273, 283-290,
  302-307, 312-320), 0 sur la 640000.
- Tests exécutés dans Chrome headless, assertions Suh.

---

## 1 bis. Couverture : PK national, signaux limités

| Couche | Couverture | Origine |
|---|---|---|
| **PK / position sur la voie** | **les ~1000 lignes du RFN** | shards `pks_<code>.js` du dépôt [mon-pk](https://github.com/olimil31/mon-pk), chargés **à la demande** (~29 Ko par ligne) |
| Signaux, PN, gares, VL, cantonnement | **640000 et 650000 seulement** | données embarquées dans `data/` |

La géométrie PK n'est pas embarquée pour toute la France : `zones.js` donne
l'emprise des lignes, puis **seule la ligne détectée est téléchargée** depuis
`mon-pk` (`js/shards.js`), mise en cache 12 lignes dans le navigateur. Les lignes
640000 et 650000 restent utilisables **hors-ligne** grâce à `data/pk_lines.js`.

> Quand une ligne est localisée mais n'a aucune donnée d'enrichissement,
> l'interface l'affiche explicitement : **« PK seul »**, bandeau orange
> « VL -- non couvert », et le bloc « Prochain » le dit. Ne jamais lire
> l'absence d'affichage comme une absence de signal.

Quand le réseau est disponible, la ligne est rafraîchie depuis `mon-pk` ; en cas
d'échec on retombe sur la copie embarquée. Le premier affichage d'une ligne
nécessite donc le réseau, les suivants non.

### Trous dans les signaux (à connaître avant de rouler)

Les données SigMap extraites ont des trous. Ce ne sont pas des zones sans
signalisation, ce sont des zones **non extraites** :

| Ligne | Zones sans signal connu sur 5 km | Plus grand intervalle entre 2 signaux |
|---|---|---|
| **650000** Toulouse–Bayonne | **13 zones**, jusqu'à **8,5 km** (PK 105–113, 199,5–207, 271,5–277,5, 289–296,5) | **11,97 km** (PK 118) |
| **640000** Bordeaux–Sète | 3 zones de 1 km | 3,97 km |

Le bloc **Prochain** ne dit jamais « rien à venir » sans préciser la limite de
la donnée : il affiche « Aucun signal connu sur 8,5 km — donnée disponible
seulement jusqu'au PK 113,0 ». Un bandeau vide se lirait sinon comme une voie libre.

---

## 2. Tester sans rouler

**⚙ Réglages → Mode simulation** : itinéraire, sens, PK, vitesse → **▶ Lancer**.

| Ligne | Sens | PK conseillé | À voir |
|---|---|---|---|
| 650000 Toulouse ↔ Bayonne | croissant | **10** | PN, signaux, gare de Portet-St-Simon |
| 650000 Toulouse ↔ Bayonne | croissant | **103,4** | « GARE À 1000 m : Montréjeau… » + BV |
| 640000 Toulouse ↔ Montauban | décroissant | **210** | Voie 2, VL/BAL, approche Montauban |
| 640000 Toulouse ↔ Montauban | croissant | **252** | approche Toulouse |

Raccourcis : `Espace` · `L` disposition · `N` thème · `F` plein écran · `+` pas.

---

## 3. Fonctions

- **PK à l'hectomètre** (tronqué, ex. 18,8) · **vitesse** lissée.
- **Sens** : PK croissant/décroissant, **sens normal par défaut**, mesuré sur le
  déplacement du PK puis sur le cap GPS ; imposable à la main (manœuvres, arrêt à
  l'arrière, réception en gare). L'origine du sens est affichée (« par défaut »,
  « mesuré », « imposé »).
- **Voie** : déduite du sens — **PK croissant → voie 1, PK décroissant → voie 2** ;
  **« Voie unique »** détecté sur les données (signaux `UNIQUE`), pas sur la fiche
  de ligne ; **« Gare · plusieurs voies »** à proximité d'une gare. Forçable.
- **Bloc « Prochain »** : les 3 éléments les plus imminents en grand, non
  défilants — c'est la seule information qui doit sauter aux yeux en conduite.
- **Info ligne** (bandeau haut) : **VL** (vitesse max nominale) et **cantonnement** (BAL, BAPR DV, BM DV, BMVU…) au PK courant.
- **Bandeau « À venir »** (trié par distance) :
  - **signaux** — avec **pictogramme** (forme : carré, sémaphore, avertissement, disque, TIV, repère de vitesse chiffré… ou générique), **PK, nature, voie** ;
  - **filtre sens** : un signal qui ne s'adresse pas au train (champ `sens` C/D/B de
    SNCF-SigMap) n'est **pas** affiché ;
  - **filtre voie** : « Ma voie » (par défaut) ou **toutes voies** (bouton rapide dans le
    bandeau). Le filtre ne masque que la voie jumelle identifiée avec certitude
    (`V1`/`1`/`1A`/`2BIS`…) : une nomenclature inconnue (gare, faisceau, manœuvre)
    reste affichée ;
  - les signaux **au même PK sont regroupés dans un même cadre** ;
  - **sources cochables** (SNCF-SigMap / OpenStreetMap / CODELI) pour tester sans l'une d'elles ;
  - **passages à niveau (PN)** — avec pictogramme et n° ;
  - **gares/haltes** (PK officiel + UIC, mention **BV**) ;
  - **rappels** personnels.
- **Bandeau « Derrière »** (0/1/3/5 km) : éléments passés, grisés.
- **Barre gare** : « GARE À 1000 m : … », « BV : … » à quai, sinon « Prochaine gare : … ».
- **Légende** des couleurs · **dispositions** (Complet, PK géant, Vitesse géante, Signaux dominants) · jour/nuit · plein écran.
- **Rappels** enregistrables (gares, PK, « Z 120 », PN…) par ligne + sens + rayon, persistés.
- **Hors-ligne** (service worker) et installable (PWA) : le coquillage et les
  données embarquées sont mis en cache à l'installation, les shards PK des lignes
  visitées au premier passage.
- **Avertissement permanent** en bas de l'écran : données non garanties.

---

## 4. Sources de données

| Donnée | Source | Licence | Fichier |
|---|---|---|---|
| **Points PK (national)** | dépôt [mon-pk](https://github.com/olimil31/mon-pk) — Nicolas Wurtz | ODbL 1.0 | `pks_<code>.js` *(chargé à la demande)* |
| Points PK (repli hors-ligne) | Nicolas Wurtz | ODbL 1.0 | `pk_lines.js` |
| BBox des lignes | dépôt mon-pk (crédité Wurtz) | ODbL 1.0 | `zones.js` |
| Emprises des régions | approximation, sans valeur cartographique | — | `regions.js` |
| Signaux | **OpenStreetMap** (`railway=signal`) | ODbL 1.0 | `signals_osm.js` |
| **Signaux (nature + n°, toute la ligne)** | **SNCF-SigMap** (Noël Danjou) | ODbL / SNCF Open Data | `sigmap_signals.js` |
| Passages à niveau | **OpenStreetMap** (`railway=level_crossing`) | ODbL 1.0 | `pn_osm.js` |
| Gares/haltes (repli) | OpenStreetMap | ODbL 1.0 | `stations_osm.js` |
| **Gares (PK officiel + UIC)** | **SNCF Open Data — « Liste des gares »** | Open Data SNCF | `sncf_gares.js` |
| **Vitesse max nominale** | **SNCF Open Data** | Open Data SNCF | `sncf_vmax.js` |
| **Cantonnement** | **SNCF Open Data** | Open Data SNCF | `sncf_cantonnement.js` |
| CODELI fournis | scans image | — | saisie manuelle |

> ** redistribution.** Toutes ces données sont sous ODbL 1.0 ou licence ouverte
> SNCF. Voir **[`LICENSE.md`](LICENSE.md)** pour l'attribution complète et les
> obligations (ODbL 1.0 : attribution, partage sous la même licence, mention des
> modifications). L'attribution est aussi affichée dans l'application
> (*Réglages → Sources et licences*).

> **Signaux — ce qui existe / n'existe pas en open data :**
> - **Emplacement** : pas de base SNCF ouverte géolocalisée (donnée opérationnelle non publiée).
>   Seules sources : **OpenStreetMap** (`railway=signal`, couverture partielle) ou **CODELI** (saisie/OCR).
> - **Forme** : le jeu SNCF/IRT SystemX **`images-des-feux-de-circulation-ferroviaire-en-france`**
>   fournit une **taxonomie des châssis** (A, C, F, H, ID2, ID3, R) et des **aspects**, mais
>   **sans coordonnées** (images de caméra embarquée). Elle sert de référence aux pictogrammes
>   (`js/icons.js`).

Jeux SNCF via `data.sncf.com` (API Explore v2.1), filtrés sur les lignes **640000** et **650000**.

---

## 5. Ajouter des signaux CODELI (prioritaires)

Les CODELI sont des **scans/vecteurs illustrés** : pas d'extraction automatique fiable
sans OCR. Saisir dans `data/signals_local.js` :

```js
const localSignals = [
  { line: "650000", pk: 103.900, side: "left", track: "V1",
    direction: "increasing", type: "Carré", name: "C123",
    speedLimit: null, source: "CODELI" }
];
```
Types reconnus pour le pictogramme : `Carré`, `Sémaphore`, `Avertissement`, `Disque`,
`Ralentissement`, `TIV` (+ `speedLimit`), `Manœuvre`. Un signal local retire les signaux
OSM à moins de 0,05 PK.

---

## 6. Limites connues (v3)

- **Signaux** : la base **SNCF-SigMap** couvre désormais **toute la ligne** (640000 et
  650000) avec **nature** (`type_if`) et **n°** (idreseau) — prioritaire sur OSM. Les
  signaux OSM restent en complément, les CODELI en surcharge locale.
- **Aspect des signaux inconnu** : aucune source ouverte ne publie l'état d'un signal
  (vert / rouge / avertissement). Les pictogrammes ne représentent que la nature et le
  châssis. **Ne pas lire un feu dans l'icône.**
- Le **type** des signaux OSM est souvent absent → pictogramme générique. Les formes et
  natures précises s'affichent pour les signaux SNCF-SigMap et CODELI typés.
- **PK** : données Wurtz indicatives ; les gares utilisent le **PK officiel SNCF**
  (Toulouse 256,412 / Montauban 205,934 / Montréjeau 103,877), écart possible avec la géométrie.
- **Voie** : règle directionnelle ; le champ `trackConvention` de `routes.js` reste prévu.
  Les noms de voie SigMap ne sont pas normalisés en amont (58 variantes) : le filtre
  « Ma voie » ne masque donc que ce qu'il identifie avec certitude.
  Mesuré sur la 640000 en croissant : **734 signaux affichés dont 230 de sens opposé
  avant → 735 affichés, 0 de sens opposé** après les deux filtres.
- **Région** : emprises rectangulaires approximatives (`data/regions.js`) ; une ligne peut
  être rattachée à plusieurs régions. Les DOM ne sont pas couvertes.
- **Signaux / VL / gares** : seules les lignes **640000** et **650000** en sont dotées.
  Sur les autres lignes, l'application affiche « PK seul » et « VL -- non couvert ».

---

## 7. Structure

```
index.html   interface + chargement
css/app.css  styles (HUD, dispositions, légende)
js/geo.js    distance, cap, projection, interpolation
js/shards.js chargement à la demande des points PK (dépôt mon-pk)
js/icons.js  pictogrammes SVG (châssis, aspects, panneaux)
js/data.js   PkStore, Signals, Crossings, Stations, LineInfo
js/app.js    état, GPS, simulation, rendu, rappels
data/*       données (voir §4)
serve.ps1    serveur statique local
LICENSE.md   licences : ODbL 1.0 (données) + licence du code
```

---

## 8. Idées suivantes

- **Extraire signaux / VL / cantonnement / gares pour d'autres lignes** : c'est le seul
  frein restant à la couverture nationale. SigMap publie 123 870 signaux ; l'extraction
  se fait par ligne, comme celle déjà faite pour 640000 et 650000.
- **Combler les trous de signaux** de la 650000 (13 zones, jusqu'à 8,5 km) en
  ré-extrait SigMap, ou en complétant par le CODELI.
- Pictogrammes enrichis (châssis exacts) ; géométrie des voies (`railway=rail`) pour V1/V2.
- Profil en long (déclivité), ouvrages d'art (ponts/tunnels).
- Import/export des rappels.
- OCR des CODELI → import semi-automatique des signaux (Portet–Montréjeau–Lannemezan–Tarbes…).