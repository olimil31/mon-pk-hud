/* =====================================================================
   Signaux locaux (surcharge prioritaire sur OpenStreetMap)
   ---------------------------------------------------------------------
   À remplir depuis les documents CODELI / documents de ligne.
   Ces signaux sont prioritaires : un signal local retire les signaux
   OSM situés à moins de 0,05 PK (50 m) du même point.

   Format d'une entrée :
   {
     line: "650000",          // code ligne OBLIGATOIRE pour l'affichage
     pk: 12.345,              // PK du signal (obligatoire)
     side: "left" | "right" | "center",  // côté par rapport au sens croissant
     track: "V1" | "V2" | null,          // voie desservie si connue
     direction: "increasing" | "decreasing" | "both",
     type: "Sémaphore" | "Carré" | "Avertissement" | "Disque" | "Ralentissement" | "TIV" | "Manœuvre",
     name: "C123",
     // Pour un pictogramme fidèle (d'après les documents de ligne) :
     chassis: "A" | "C" | "F" | "H" | "ID2" | "ID3" | "R",
     aspect: "carre" | "carre_violet" | "semaphore" | "avertissement" | "rappel30" | "rappel60" | "ralentissement30" | "ralentissement60" | "feu_vert" | "feu_blanc" | "feu_jaune",
     speedLimit: null,        // ex: 80 (km/h) si pertinent
     lat: null, lon: null,    // optionnel
     source: "CODELI"
   }

   Châssis (formes officielles SNCF/IRT - jeu "images des feux") :
     A = 3 feux verticaux ; C = 5 feux verticaux ; ID2 = 2 feux horizontaux ;
     ID3 = 3 feux horizontaux ; F = 6+1 en L inversé ; H = 6+3 en S ; R = 6 feux dans un disque.

   ATTENTION : ne pas inventer de données de sécurité. Les positions
   doivent être saisies depuis la documentation officielle et vérifiées.
   ===================================================================== */

const localSignals = [];
