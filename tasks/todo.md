# Tâches

Format: Acceptation / Vérif / Fichiers. Chaque tâche touche au plus ~5 fichiers.

## Phase 1: Fondations
- [x] T1 Structure du repo et script de lancement
  - Acceptation: dossiers `css/ js/ data/ scripts/ tests/`, `index.html` minimal qui charge `js/app.js` en module
  - Vérif: `python3 -m http.server 8000` sert la page sans erreur console
  - Fichiers: index.html, css/style.css, js/app.js
- [x] T2 Schéma de données et jeu de départ
  - Acceptation: `data/mcu.json` avec 6 titres (5 films, 1 série à 3 épisodes) conformes à la spec
  - Vérif: relecture manuelle
  - Fichiers: data/mcu.json
- [x] T3 Script de validation des données
  - Acceptation: contrôle ids uniques, chronoOrder unique, films avec runtimeMin, séries avec episodes non vide et `n` continus, dates valides
  - Vérif: `node scripts/validate-data.mjs` passe sur T2 et échoue sur un fichier cassé (test)
  - Fichiers: scripts/validate-data.mjs, tests/validate-data.test.js

## Phase 2: Logique pure
- [x] T4 Dépliage en unités et tri
  - Acceptation: `toUnits(titles)` produit films + épisodes; `sortTitles(titles, order)` pour chrono et sortie
  - Vérif: `node --test`
  - Fichiers: js/logic.js, tests/logic.test.js
- [x] T5 Progression et filtres
  - Acceptation: `progress(titles, seen)` global et par phase; `filterTitles` par phase/type combinables; progression globale inchangée par les filtres
  - Vérif: tests dont cas limites (tout vu, rien vu, série partielle)
  - Fichiers: js/logic.js, tests/logic.test.js
- [x] T6 Prochain à voir
  - Acceptation: première unité non vue dans l'ordre actif; `null` si tout est vu; épisodes dans l'ordre `n`
  - Vérif: tests chrono et sortie
  - Fichiers: js/logic.js, tests/logic.test.js

## Phase 3: Persistance
- [ ] T7 Store et localStorage robuste
  - Acceptation: état par défaut, chargement/sauvegarde clé `chrono-mcu:v1`; storage indisponible ou corrompu = démarrage à vide sans crash
  - Vérif: tests avec storage factice (absent, JSON invalide)
  - Fichiers: js/store.js, tests/store.test.js
- [ ] T8 Cocher film, épisode, série entière
  - Acceptation: cocher/décocher met à jour `seen` et `lastSeenKey`; cocher une série coche tous ses épisodes et inversement
  - Vérif: tests
  - Fichiers: js/store.js, tests/store.test.js
- [ ] T9 Export/import
  - Acceptation: export JSON; import d'un export valide restitue l'état; import invalide rejeté avec message, état existant intact; champ `version` vérifié
  - Vérif: tests aller-retour et cas invalides
  - Fichiers: js/store.js, tests/store.test.js

## Phase 4: UI cœur
- [ ] T10 Liste et cases à cocher
  - Acceptation: affichage de la liste dans l'ordre actif, cocher films/épisodes, séries repliables avec « n/total »
  - Vérif: manuel, rechargement conserve l'état
  - Fichiers: js/app.js, index.html, css/style.css
- [ ] T11 Bascule d'ordre et filtres
  - Acceptation: bascule chrono/sortie sans changer la progression; filtres phase/type
  - Vérif: manuel
  - Fichiers: js/app.js, index.html, css/style.css
- [ ] T12 Progression et prochain à voir
  - Acceptation: barre globale et par phase; bandeau « prochain à voir » cliquable
  - Vérif: manuel + valeurs égales aux tests de logique
  - Fichiers: js/app.js, css/style.css
- [ ] T13 Export/import dans l'UI
  - Acceptation: boutons export (téléchargement) et import (fichier) avec message d'erreur lisible
  - Vérif: aller-retour manuel
  - Fichiers: js/app.js, index.html
- [ ] T14 Responsive et thème sombre
  - Acceptation: pas de scroll horizontal dès 360 px; thème sombre lisible
  - Vérif: Playwright (viewports 360 et 1280) captures
  - Fichiers: css/style.css

## Phase 5: v1.5
- [ ] T15 Notes et étoiles
  - Acceptation: texte + note 1 à 5 par titre, persistés, inclus dans l'export
  - Vérif: tests store + manuel
  - Fichiers: js/store.js, js/app.js, css/style.css, tests/store.test.js
- [ ] T16 Je reprends
  - Acceptation: bandeau de reprise basé sur `lastSeenKey`, indépendant de l'ordre
  - Vérif: tests logique + manuel
  - Fichiers: js/logic.js, js/app.js, tests/logic.test.js
- [ ] T17 Statistiques
  - Acceptation: heures vues/restantes, rythme, date de fin estimée; « n/a » sous 2 jours de données
  - Vérif: tests avec dates fixes
  - Fichiers: js/logic.js, js/app.js, tests/logic.test.js, css/style.css

## Phase 6: Données et livraison
- [ ] T18 Catalogue Infinity + séries connues
  - Acceptation: titres et épisodes saisis, incertains en `verified:false`
  - Vérif: `node scripts/validate-data.mjs`; relecture Antoni
  - Fichiers: data/mcu.json
- [ ] T19 Catalogue restant
  - Acceptation: tout ce qui est sorti à ce jour, incertains marqués
  - Vérif: validation + relecture Antoni
  - Fichiers: data/mcu.json
- [ ] T20 README et GitHub Pages
  - Acceptation: README (usage, commandes, comment corriger les données), déploiement Pages
  - Vérif: site accessible, parcours complet manuel
  - Fichiers: README.md, workflow Pages
