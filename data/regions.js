/* =====================================================================
   regions.js — emprises approximatives des régions de France métropolitaine
   ---------------------------------------------------------------------
   Utilisé pour le filtre « Région » des réglages : une ligne est rattachée
   à une région si au moins un de ses points PK tombe dans l'emprise.

   ⚠ Emprises volontairement grossières (rectangles englobants), pas des
     limites administratives. Une ligne peut donc être rattachée à plusieurs
     régions : c'est le comportement attendu pour une ligne qui en traverse
     plusieurs. Les DOM ne sont pas listées (aucune donnée embarquée).
   ===================================================================== */

const frenchRegions = [
  { code: "AR", name: "Auvergne-Rhône-Alpes",       latMin: 44.0, latMax: 48.5, lonMin: 2.5,  lonMax: 7.8 },
  { code: "BF", name: "Bourgogne-Franche-Comté",    latMin: 46.2, latMax: 48.5, lonMin: 4.0,  lonMax: 6.6 },
  { code: "BR", name: "Bretagne",                   latMin: 47.0, latMax: 49.6, lonMin: -5.8, lonMax: -1.2 },
  { code: "CO", name: "Corse",                      latMin: 41.3, latMax: 43.1, lonMin: 8.5,  lonMax: 9.6 },
  { code: "CV", name: "Centre-Val de Loire",        latMin: 46.4, latMax: 48.7, lonMin: 0.0,  lonMax: 2.6 },
  { code: "GE", name: "Grand Est",                  latMin: 47.4, latMax: 49.6, lonMin: 4.8,  lonMax: 8.3 },
  { code: "HDF", name: "Hauts-de-France",           latMin: 49.4, latMax: 51.2, lonMin: 1.4,  lonMax: 4.3 },
  { code: "IDF", name: "Île-de-France",             latMin: 48.3, latMax: 49.2, lonMin: 2.0,  lonMax: 3.7 },
  { code: "NA", name: "Nouvelle-Aquitaine",         latMin: 42.8, latMax: 47.2, lonMin: -1.9, lonMax: 2.7 },
  { code: "NO", name: "Normandie",                  latMin: 48.3, latMax: 49.8, lonMin: -1.8, lonMax: 1.8 },
  { code: "OC", name: "Occitanie",                 latMin: 42.3, latMax: 45.1, lonMin: -0.5, lonMax: 4.9 },
  { code: "PACA", name: "Provence-Alpes-Côte d'Azur", latMin: 42.9, latMax: 45.2, lonMin: 4.8, lonMax: 7.8 },
  { code: "PL", name: "Pays de la Loire",           latMin: 46.2, latMax: 48.7, lonMin: -2.7, lonMax: 1.3 }
];
