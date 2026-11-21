# Chrono-MCU — Journal

L'histoire du projet. L'état actuel est dans `README.md` (et le détail dans `SPEC.md`), ce qui reste dans
`RESTE-A-FAIRE.md` (l'audit du 28/10/2026, avec le statut de chaque point). Chaque lot s'ajoute en fin de fichier, sous
`### Titre — jj/mm/aaaa`.

## Ancien tasks/plan.md (plan de départ, retiré le 16/11/2026)

### Plan d'implémentation: Chrono-MCU

Référence: `SPEC.md`. Tranches verticales, chacune livrable et vérifiable. Aucune dépendance runtime.

#### Graphe de dépendances
```
data (schéma + validation) ──> logic.js ──> store.js ──> UI (app.js, html, css)
                                   │            │
                                   └─> stats    └─> export/import, notes, reprise
```
Ordre: schéma de données -> logique pure -> persistance -> UI cœur -> v1.5 -> déploiement. La donnée MCU complète avance en parallèle (hors chemin critique du code).

#### Phases et points de contrôle
1. **Fondations**: structure du repo, schéma `mcu.json`, `validate-data.mjs`, jeu de données de départ (6 titres dont 1 série) pour tester. Checkpoint: `node scripts/validate-data.mjs` passe.
2. **Logique pure (`logic.js`)**: dépliage en unités (film/épisode), tri chrono/sortie, progression globale/par phase, filtres, prochain à voir. Checkpoint: `node --test` vert.
3. **Persistance (`store.js`)**: état, localStorage robuste, cocher film/épisode/série entière, export/import validé. Checkpoint: tests du store verts, import invalide sans écrasement.
4. **UI cœur (v1)**: liste, bascule d'ordre, cases à cocher, repli des séries, barres de progression, filtres, bandeau prochain, boutons export/import. Checkpoint: vérification manuelle mobile (360 px) + desktop.
5. **v1.5**: notes + étoiles, « je reprends », statistiques. Checkpoint: critères 7 à 9 de la spec.
6. **Données et livraison**: catalogue Infinity + séries connues, puis reste (`verified:false` pour l'incertain), README, GitHub Pages. Checkpoint: relecture de `mcu.json` par Antoni.

#### Risques
- **Donnée MCU (principal)**: volume (centaines d'épisodes) et fiabilité de ma mémoire. Mitigation: `verified:false`, relecture par Antoni, livraison par paliers.
- **Ordre Disney+**: peut différer de ma mémoire. Mitigation: `chronoOrder` modifiable dans le JSON, validation d'unicité.
- **Schéma d'état**: toute évolution casse les sauvegardes. Mitigation: champ `version` et test de migration dès la phase 3.
- **localStorage indisponible**: app en mémoire seule avec avertissement.

#### Parallélisable
Saisie des données (phase 6) en parallèle des phases 2 à 5. Tout le reste est séquentiel.

## Ancien tasks/todo.md (tâches de départ, toutes faites, retiré le 16/11/2026)

> **Archive** : le plan de départ, terminé. Ce qui reste à faire vit dans `docs/AUDIT.md`.

### Tâches

Format: Acceptation / Vérif / Fichiers. Chaque tâche touche au plus ~5 fichiers.

#### Phase 1: Fondations
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

#### Phase 2: Logique pure
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

#### Phase 3: Persistance
- [x] T7 Store et localStorage robuste
  - Acceptation: état par défaut, chargement/sauvegarde clé `chrono-mcu:v1`; storage indisponible ou corrompu = démarrage à vide sans crash
  - Vérif: tests avec storage factice (absent, JSON invalide)
  - Fichiers: js/store.js, tests/store.test.js
- [x] T8 Cocher film, épisode, série entière
  - Acceptation: cocher/décocher met à jour `seen` et `lastSeenKey`; cocher une série coche tous ses épisodes et inversement
  - Vérif: tests
  - Fichiers: js/store.js, tests/store.test.js
- [x] T9 Export/import
  - Acceptation: export JSON; import d'un export valide restitue l'état; import invalide rejeté avec message, état existant intact; champ `version` vérifié
  - Vérif: tests aller-retour et cas invalides
  - Fichiers: js/store.js, tests/store.test.js

#### Phase 4: UI cœur
- [x] T10 Liste et cases à cocher
  - Acceptation: affichage de la liste dans l'ordre actif, cocher films/épisodes, séries repliables avec « n/total »
  - Vérif: manuel, rechargement conserve l'état
  - Fichiers: js/app.js, index.html, css/style.css
- [x] T11 Bascule d'ordre et filtres
  - Acceptation: bascule chrono/sortie sans changer la progression; filtres phase/type
  - Vérif: manuel
  - Fichiers: js/app.js, index.html, css/style.css
- [x] T12 Progression et prochain à voir
  - Acceptation: barre globale et par phase; bandeau « prochain à voir » cliquable
  - Vérif: manuel + valeurs égales aux tests de logique
  - Fichiers: js/app.js, css/style.css
- [x] T13 Export/import dans l'UI
  - Acceptation: boutons export (téléchargement) et import (fichier) avec message d'erreur lisible
  - Vérif: aller-retour manuel
  - Fichiers: js/app.js, index.html
- [x] T14 Responsive et thème sombre
  - Acceptation: pas de scroll horizontal dès 360 px; thème sombre lisible
  - Vérif: Playwright (viewports 360 et 1280) captures
  - Fichiers: css/style.css

#### Phase 5: v1.5
- [x] T15 Notes et étoiles (retirées ensuite)
  - Acceptation: texte + note 1 à 5 par titre, persistés, inclus dans l'export
  - Vérif: tests store + manuel
  - Fichiers: js/store.js, js/app.js, css/style.css, tests/store.test.js
- [x] T16 Je reprends
  - Acceptation: bandeau de reprise basé sur `lastSeenKey`, indépendant de l'ordre
  - Vérif: tests logique + manuel
  - Fichiers: js/logic.js, js/app.js, tests/logic.test.js
- [x] T17 Statistiques
  - Acceptation: heures vues/restantes, rythme, date de fin estimée; « n/a » sous 2 jours de données
  - Vérif: tests avec dates fixes
  - Fichiers: js/logic.js, js/app.js, tests/logic.test.js, css/style.css

#### Phase 6: Données et livraison
- [x] T18 Catalogue Infinity + séries connues
  - Acceptation: titres et épisodes saisis, incertains en `verified:false`
  - Vérif: `node scripts/validate-data.mjs`; relecture Antoni
  - Fichiers: data/mcu.json
- [x] T19 Catalogue restant
  - Acceptation: tout ce qui est sorti à ce jour, incertains marqués
  - Vérif: validation + relecture Antoni
  - Fichiers: data/mcu.json
- [x] T20 README et GitHub Pages
  - Acceptation: README (usage, commandes, comment corriger les données), déploiement Pages
  - Vérif: site accessible, parcours complet manuel
  - Fichiers: README.md, workflow Pages

## Lots

### Règles communes et suivi unifié — 16/11/2026

Bloc commun des 8 dépôts en tête de `CLAUDE.md` (décisions d'Antoni : fusion sur « go » seulement, noms de modèle
autorisés, zones tactiles de 48 px). `docs/AUDIT.md` devient `RESTE-A-FAIRE.md` ; `tasks/plan.md` et `tasks/todo.md`
entrent ici en entier.

### CI, trois niveaux ; test e2e instable — 16/11/2026

- Bloc commun : règle « CI, trois niveaux ». Ici, `e2e` dépend d'un job `changements` et se saute sur une PR qui ne touche
  que des `.md` ; un job sauté compte comme réussi pour le ruleset, qui exige toujours `test` et `e2e`. Sur `main`, tout tourne.
- Le 16/11, juste après la fusion de la #87 (documentation seule), `e2e` a échoué sur `main` : l'onglet Phase 4 est resté
  invisible 30 s après le clic sur « Sortie ». La relance est passée. 108 essais locaux de la même séquence (normal,
  processeur ralenti 8 fois, police Bebas Neue retardée de 0 à 800 ms) n'ont rien reproduit. Le délai dépassé arrêtait toute la
  suite sans rien dire : `openPhase4` (dans `e2e/run.mjs`) attend l'onglet 5 s, puis note l'ordre affiché, l'état de la barre
  des phases et les dialogues ouverts, et la suite continue. Vu échouer : avec le bouton d'ordre rendu inopérant, les
  14 passages (12 combinaisons et 2 reflows) le signalent et la suite va jusqu'au bout (code restauré ensuite).
- Qualité : 211 tests, 284 contrôles d'accessibilité, 50 scénarios de comportement.

### Mises à jour Dependabot — 21/11/2026

- #89 : oxlint 1.93 et Playwright 1.65.1 (outils de développement seulement, rien ne change dans le site).
- Qualité : lint, 211 tests, validation des données ; e2e : 284 contrôles d'accessibilité et 50 scénarios, rejoués en
  local après fusion.

### Règles communes : trois changements — 21/11/2026

Bloc commun de `CLAUDE.md` mis à jour (décision d'Antoni) : deux règles en plus et une règle précisée, « Versions et API » (vérifier les
versions dans la doc officielle, signaler tout code déprécié) et « Contradiction » (signaler une demande qui contredit une
règle avant de l'appliquer) ; « Proposer d'abord » demande désormais un plan détaillé et des suggestions avant tout code, et un visuel (maquette HTML ou schéma ASCII) pour une fonctionnalité ou un design ; « les 8 dépôts » devient « tous les dépôts d'Antoni, existants et futurs », avec l'arrivée de game_timer.

### Règles communes : « Proposer d'abord » reformulée — 21/11/2026

Formulation d'Antoni : un plan détaillé (étapes, fichiers touchés, approche) et des suggestions d'amélioration avant tout changement, puis l'« ok » ; pour une fonctionnalité ou un design, proposer sans coder, avec questions et visuel (maquette HTML sans canvas ou schéma ASCII). Le bloc est identique dans tous les dépôts et dans le skill `regles-communes-depots`.

### Règles communes mises à jour — 21/11/2026

Bloc commun de `CLAUDE.md` aligné sur `regles-communes` (BLOC.md, commit 98885d3), par la propagation automatique.

### Règles communes mises à jour — 21/11/2026

Bloc commun de `CLAUDE.md` aligné sur `regles-communes` (BLOC.md, commit 400626b), par la propagation automatique.

### CI : deux runs rouges sur `main` — 21/11/2026

Aucune PR ouverte ; les deux échecs sont des exécutions sur `main` après des fusions de documentation seule. Déploiement de #91 : `deploy-pages` a répondu « No artifacts named "github-pages" were found » alors que l'envoi venait de réussir (panne passagère de GitHub, tous les tests verts) ; le déploiement suivant a réussi. E2e de #93 : le clic sur « Sortie » n'a pas changé l'ordre dans le test « reflow 320 px, texte à 200 % » (même symptôme que le 16/11, point 26 de `RESTE-A-FAIRE.md`).

Correctifs : `pages.yml` relance `deploy-pages` une fois après 20 s, la seconde tentative fait échouer le job si elle échoue aussi (`tests/workflows.test.js`, vu échouer avant le changement) ; `e2e/run.mjs` relève les clics reçus, reclique une fois si l'ordre n'a pas changé et l'écrit dans le journal du job. Vérifié en avalant le premier clic sur « Sortie » dans chaque page : l'ancien test échoue comme en CI, le nouveau passe en listant 14 clics relancés. Cause du clic perdu toujours inconnue (132 essais locaux sans échec).

