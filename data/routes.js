/* =====================================================================
   Itinéraires de test / lignes connues
   ---------------------------------------------------------------------
   Les bornes PK sont issues des données PK (Nicolas Wurtz, ODbL).
   Elles servent au mode Simulation et à l'affichage du sens.
   ===================================================================== */

const routes = {
  "640000": {
    code: "640000",
    name: "Ligne de Bordeaux-Saint-Jean à Sète-Ville",
    label: "Toulouse ↔ Montauban",
    doubleTrack: true,
    // Position de démonstration (proche de signaux OSM) et sens par défaut.
    demoPk: 210,
    demoDir: -1,
    // Convention de voie (indicative) : à renseigner si connue.
    // null = non affirmé, l'appli affiche gauche/droite/centre.
    trackConvention: null,
    endpoints: [
      { name: "Toulouse Matabiau", pk: 256.8, lat: 43.611242, lon: 1.453402, short: "Toulouse" },
      { name: "Montauban Villebourbon", pk: 206.2, lat: 44.017657, lon: 1.353489, short: "Montauban" }
    ]
  },
  "650000": {
    code: "650000",
    name: "Ligne de Toulouse à Bayonne",
    label: "Toulouse ↔ Bayonne",
    doubleTrack: true,
    demoPk: 10,
    demoDir: 1,
    trackConvention: null,
    endpoints: [
      { name: "Toulouse Matabiau", pk: 0.4, lat: 43.608221, lon: 1.455997, short: "Toulouse" },
      { name: "Bayonne", pk: 319.4, lat: 43.486291, lon: -1.468628, short: "Bayonne" }
    ]
  }
};
