# Spec: Chrono-MCU

## Objective
Application web de suivi de visionnage du MCU (films + séries Disney+), inspirée de Chronogeek. Utilisateur : Antoni, usage perso, mobile et desktop. Succès : cocher ce qui est vu, choisir l'ordre (chronologique ou sortie), voir sa progression, savoir quoi regarder ensuite, sans compte ni backend.

### Périmètre
- v1 (cœur) : case « vu », deux ordres, progression globale et par phase, filtres phase/type, « prochain à voir », export/import JSON.
- v1.5 : (1) notes perso + note étoilée par titre, (2) mode « je reprends », (5) statistiques (heures vues/restantes, rythme, date de fin estimée).
- Hors périmètre : comptes, synchro cloud, affiches TMDB, partage social, notifications, scènes post-générique, prérequis, parcours alternatifs.

## Hypothèses
Web statique, vanilla JS (ES modules), localStorage, mobile-first, navigateurs modernes, données MCU saisies à la main (à relire par Antoni), contenu : films + séries Disney+.

## Tech Stack
HTML5, CSS3, JavaScript ES2022, aucune dépendance runtime. Tests : Node `node:test` (natif, sans dépendance). Déploiement : GitHub Pages.

## Commands
```
Dev:   python3 -m http.server 8000
Test:  node --test tests/
Check: node scripts/validate-data.mjs
```

## Project Structure
```
index.html         → page unique
css/style.css      → styles (thème sombre, mobile-first)
js/app.js          → point d'entrée, rendu UI
js/store.js        → état + persistance localStorage + export/import
js/logic.js        → fonctions pures : tri, filtres, progression, prochain, stats
data/mcu.json      → catalogue des titres
scripts/validate-data.mjs → vérifie la cohérence de mcu.json
tests/             → tests des fonctions pures et du store
SPEC.md, README.md
```

## Modèle de données
`mcu.json` : tableau d'objets
```json
{ "id": "iron-man", "title": "Iron Man", "type": "film|serie",
  "phase": 1, "saga": "infinity", "releaseDate": "2008-05-02",
  "chronoOrder": 2, "runtimeMin": 126 }
```
Pour une série, `runtimeMin` = durée totale (somme des épisodes). `id` unique et stable. `chronoOrder` entier unique. État utilisateur (localStorage, clé `chrono-mcu:v1`) :
```json
{ "version": 1, "order": "chrono|release", "seen": {"iron-man": "2026-10-27"},
  "notes": {"iron-man": {"rating": 4, "text": "..."}}, "lastSeenId": "iron-man" }
```

## Code Style
Fonctions pures dans `logic.js`, sans accès au DOM ni au storage ; effets de bord confinés à `store.js` et `app.js`.
```js
export function nextToWatch(titles, seen, order) {
  return sortTitles(titles, order).find((t) => !seen[t.id]) ?? null;
}
```
Nommage camelCase, identifiants de données en kebab-case, pas de commentaires superflus, 2 espaces d'indentation.

## Testing Strategy
Tests unitaires `node --test` sur `logic.js` (tri, filtres, progression, prochain, stats) et `store.js` (sérialisation, import invalide, migration de version). Validation de `mcu.json` par script (ids uniques, chronoOrder unique, champs requis, dates valides). Vérification manuelle de l'UI sur viewport mobile et desktop.

## Exigences fonctionnelles et critères de succès
1. **Vu/pas vu** : cocher/décocher un titre persiste après rechargement.
2. **Ordres** : bascule chrono/sortie ; changer d'ordre ne modifie jamais la progression.
3. **Progression** : % global et par phase (titres vus / total) affiché et exact (testé).
4. **Filtres** : par phase et par type (film/série), combinables ; la progression globale reste sur l'ensemble.
5. **Prochain à voir** : premier titre non vu dans l'ordre actif ; `null` quand tout est vu.
6. **Export/Import** : l'export produit un JSON ; l'import d'un export valide restitue l'état à l'identique ; un fichier invalide est rejeté avec message, sans écraser l'état existant.
7. **Notes (v1.5)** : texte libre + note 1 à 5 par titre, persistés, modifiables, incluses dans l'export.
8. **Je reprends (v1.5)** : `lastSeenId` mis à jour à chaque coche ; un bandeau propose le titre suivant dans l'ordre actif ; indépendant de l'ordre choisi.
9. **Statistiques (v1.5)** : heures vues, heures restantes (via `runtimeMin`), rythme = heures vues / jours écoulés depuis la première coche, date de fin estimée ; affichage « n/a » si moins de 2 jours de données.
10. **Robustesse** : localStorage indisponible ou corrompu = l'app démarre à vide sans crash.
11. **Responsive** : utilisable sans scroll horizontal dès 360 px de large.

## Boundaries
- Always : lancer `node --test tests/` et `validate-data.mjs` avant commit ; garder les fonctions de logique pures ; valider tout JSON importé.
- Ask first : ajouter une dépendance, changer le schéma d'état (version), ajouter un backend ou une API externe, étendre le périmètre.
- Never : committer des secrets, écraser l'état utilisateur sur import invalide, supprimer un test en échec, inventer des données sans le signaler pour relecture.

## Open Questions
- L'ordre chronologique de référence : ordre Disney+ « Chronologique » officiel, ou autre ? (je propose Disney+).
- Les séries comptent-elles comme un titre unique « vu », ou faut-il un suivi par épisode ? (je propose titre unique en v1.)
- Les titres ultérieurs à 2025 (sorties récentes) : inclus jusqu'à quelle date ? À fixer à la relecture de `mcu.json`.
