# Licences — Mon PK (HUD conducteur)

Ce dépôt contient deux choses de natures juridiques différentes : **du code**
et **des données**. Elles ne sont pas sous la même licence, et il faut comprendre
pourquoi.

---

## 1. Code — GNU Affero General Public License v3.0

Sont couverts par l'AGPL-3.0 :

```
index.html   manifest.json   sw.js   serve.ps1
css/app.css
js/geo.js  js/shards.js  js/icons.js  js/data.js  js/app.js
```

> **Attention au raisonnement.** Le fait d'utiliser des sources ouvertes
> n'impose **rien** sur la licence du code. L'ODbL porte sur la **base de
> données**, pas sur le programme qui la lit ; un programme qui *utilise* des
> données ODbL peut être propriétaire, il a seulement une obligation
> d'attribution. Le choix ci-dessous ne vient donc pas des données : il vient
> du fait que cet outil alimente un affichage utilisé en conduite, où une
> erreur de données a des conséquences concrètes. L'AGPL interdit de reprendre
> la chaîne de traitement et de la publier fermée — c'est délibérément plus
> contraignant qu'un MIT.

AGPL-3.0 est aussi la licence du code de **[mon-pk](https://github.com/olimil31/mon-pk)**
dont proviennent les points PK : les deux projets restent cohérents.

Texte intégral : <https://www.gnu.org/licenses/agpl-3.0.html>

> **À faire avant publication :** coller le texte intégral dans un fichier
> `AGPL-3.0.txt` à la racine. GitHub ne détecte pas la licence sans fichier
> `LICENSE` à la racine.

Pour changer de licence, c'est la ligne `AGPL-3.0` ci-dessus qu'on modifie —
rien d'autre dans le dépôt ne dépend du choix.

---

## 2. Données — Open Database License (ODbL) 1.0

Les fichiers de `data/` sont dérivés de sources ouvertes. Ils sont **répartis
sous les mêmes conditions** (ODbL 1.0 — *Open Database License*), ce qui oblige
à :

1. citer les sources ci-dessous ;
2. joindre le texte de la licence ;
3. partager toute base dérivée sous la même licence ;
4. signaler les modifications apportées.

Ce qui reste vrai **quelle que soit la licence du code** : l'AGPL s'applique au
programme, l'ODbL aux données. Une application AGPL n'hérite pas de l'ODbL, et
inversement.

### Texte de la licence

Le texte intégral et faisant foi de l'ODbL 1.0 est publié ici :
<https://opendatacommons.org/licenses/odbl/1-0/>

> **À faire avant publication :** coller le texte intégral de l'ODbL 1.0
> dans un fichier `ODBL-1.0.txt` à la racine du dépôt, et l'afficher dans
> l'application (section « Réglages → Sources et licences »). Les liens ne
> satisfont pas l'exigence d'attribution : l'attribution doit être présente dans
> l'objet lui-même.

### Sources et attribution

| Donnée | Source | Fichier |
|---|---|---|
| **Points PK — toutes lignes** | dépôt [mon-pk](https://github.com/olimil31/mon-pk) — Nicolas Wurtz — ODbL 1.0 | `pks_<code>.js`, chargé à la demande |
| Points PK — repli hors-ligne | Nicolas Wurtz — ODbL 1.0 | `data/pk_lines.js` |
| Signaux (positions, nature, n°, voie, sens) | **SNCF-SigMap** — Noël Danjou — https://sncf-sigmap.netlify.app/ | `data/sigmap_signals.js` |
| Signaux (complément) | **OpenStreetMap** — `railway=signal` — © les contributeurs OSM | `data/signals_osm.js` |
| Passages à niveau | **OpenStreetMap** — `railway=level_crossing` — © les contributeurs OSM | `data/pn_osm.js` |
| Gares / haltes (repli) | **OpenStreetMap** — `railway=station\|halt` — © les contributeurs OSM | `data/stations_osm.js` |
| Gares (PK officiel, UIC) | **SNCF Open Data** — *Liste des gares* — licence ouverte SNCF | `data/sncf_gares.js` |
| Vitesse maximale nominale | **SNCF Open Data** | `data/sncf_vmax.js` |
| Cantonnement | **SNCF Open Data** | `data/sncf_cantonnement.js` |
| Emprises des lignes | dépôt *mon-pk* (crédité Wurtz) — ODbL 1.0 | `data/zones.js` |
| Emprises des régions | approximation, aucune valeur cartographique | `data/regions.js` |
| Icônes PWA | dépôt *mon-pk* (même auteur) | `icon-192.png`, `icon-512.png` |
| Signaux saisis à la main | CODELI / documents de ligne — usage personnel | `data/signals_local.js` |

**Dépendance réseau.** L'application télécharge la géométrie PK des lignes
détectées depuis <https://github.com/olimil31/mon-pk> (Pages ou `raw.githubusercontent`),
via `js/shards.js`. Ces données sont sous ODbL 1.0 et restent attribuées à Nicolas
Wurtz. Modifier cette source ou la mettre en cache ne change pas la licence.

**SNCF-SigMap** : les données publiées sur ce site sont dérivées d'OpenStreetMap
(ODbL) et de SNCF Open Data. Le **code** de l'application SNCF-SigMap est distribué
sous **AGPL-3.0** — ce dépôt ne contient **aucun** de ce code, uniquement les
données extraites, qui restent sous ODbL / licence ouverte SNCF.

**SNCF Open Data** : les jeux sont accessibles via l'API Explore
(`data.sncf.com`). Vérifier les conditions d'utilisation en vigueur avant
toute redistribution.

### Artefacts non redistribuables

`data/sncf_gares.js`, `data/sncf_vmax.js` et `data/sncf_cantonnement.js` sont
extraits d'API **sans garantie de fraîcheur**. Ils ne doivent pas être présentés
comme la référence : la référence reste le document de ligne et le CODELI.

---

## 3. Avertissement

Cet outil est une **aide à la situation**, alimentée par des sources ouvertes
non garanties. Il ne remplace ni le CODELI, ni les documents de ligne, ni les
consignes. Ne pas utiliser en conduite sans validation des données par une
personne habilitée.
