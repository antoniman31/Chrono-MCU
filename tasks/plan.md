# Plan d'implémentation: Chrono-MCU

Référence: `SPEC.md`. Tranches verticales, chacune livrable et vérifiable. Aucune dépendance runtime.

## Graphe de dépendances
```
data (schéma + validation) ──> logic.js ──> store.js ──> UI (app.js, html, css)
                                   │            │
                                   └─> stats    └─> export/import, notes, reprise
```
Ordre: schéma de données -> logique pure -> persistance -> UI cœur -> v1.5 -> déploiement. La donnée MCU complète avance en parallèle (hors chemin critique du code).

## Phases et points de contrôle
1. **Fondations**: structure du repo, schéma `mcu.json`, `validate-data.mjs`, jeu de données de départ (6 titres dont 1 série) pour tester. Checkpoint: `node scripts/validate-data.mjs` passe.
2. **Logique pure (`logic.js`)**: dépliage en unités (film/épisode), tri chrono/sortie, progression globale/par phase, filtres, prochain à voir. Checkpoint: `node --test tests/` vert.
3. **Persistance (`store.js`)**: état, localStorage robuste, cocher film/épisode/série entière, export/import validé. Checkpoint: tests du store verts, import invalide sans écrasement.
4. **UI cœur (v1)**: liste, bascule d'ordre, cases à cocher, repli des séries, barres de progression, filtres, bandeau prochain, boutons export/import. Checkpoint: vérification manuelle mobile (360 px) + desktop.
5. **v1.5**: notes + étoiles, « je reprends », statistiques. Checkpoint: critères 7 à 9 de la spec.
6. **Données et livraison**: catalogue Infinity + séries connues, puis reste (`verified:false` pour l'incertain), README, GitHub Pages. Checkpoint: relecture de `mcu.json` par Antoni.

## Risques
- **Donnée MCU (principal)**: volume (centaines d'épisodes) et fiabilité de ma mémoire. Mitigation: `verified:false`, relecture par Antoni, livraison par paliers.
- **Ordre Disney+**: peut différer de ma mémoire. Mitigation: `chronoOrder` modifiable dans le JSON, validation d'unicité.
- **Schéma d'état**: toute évolution casse les sauvegardes. Mitigation: champ `version` et test de migration dès la phase 3.
- **localStorage indisponible**: app en mémoire seule avec avertissement.

## Parallélisable
Saisie des données (phase 6) en parallèle des phases 2 à 5. Tout le reste est séquentiel.
