# Spec: Chrono-MCU

## Objective
Application web de suivi de visionnage du MCU (films + séries Disney+), inspirée de Chronogeek. Utilisateur : Antoni, usage perso, mobile et desktop. Succès : cocher ce qui est vu, choisir l'ordre (chronologique ou sortie), voir sa progression, savoir quoi regarder ensuite, sans compte ni backend.

### Périmètre
- v1 (cœur) : case « vu », deux ordres, progression globale et par phase, filtres phase/type, « prochain à voir », export/import JSON.
- v1.5 : (1) notes perso + note étoilée par titre (retirées ensuite, voir Évolutions), (2) mode « je reprends », (5) statistiques (heures vues/restantes, rythme, date de fin estimée).
- Hors périmètre : comptes, synchro cloud, affiches TMDB, partage social, notifications, scènes post-générique, prérequis, parcours alternatifs.

## Hypothèses
Web statique, vanilla JS (ES modules), localStorage, mobile-first, navigateurs modernes, données MCU saisies à la main (à relire par Antoni), contenu : films + séries Disney+ sortis à ce jour, suivi par épisode pour les séries, ordre chronologique de référence : Disney+ officiel. Les entrées dont je ne suis pas sûr (sorties récentes, épisodes) sont marquées `"verified": false` et à compléter par Antoni.

## Tech Stack
HTML5, CSS3, JavaScript ES2022, aucune dépendance runtime. Tests : Node `node:test` (natif, sans dépendance). Déploiement : GitHub Pages.

## Commands
```
Dev:   python3 -m http.server 8000
Test:  node --test
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
{ "id": "iron-man", "title": "Iron Man", "type": "film",
  "phase": 1, "saga": "infinity", "releaseDate": "2008-05-02",
  "chronoOrder": 2, "runtimeMin": 126, "verified": true }
{ "id": "wandavision", "title": "WandaVision", "type": "serie",
  "phase": 4, "saga": "multiverse", "releaseDate": "2021-01-15",
  "chronoOrder": 31, "verified": true,
  "episodes": [ { "n": 1, "title": "Filmed Before a Live Studio Audience", "runtimeMin": 30 } ] }
```
Film : `runtimeMin` obligatoire, pas d'`episodes`. Série : `episodes` obligatoire (non vide), la durée totale est dérivée. `id` unique et stable, `chronoOrder` entier unique (une série = une position unique dans l'ordre, ses épisodes se suivent). Les saisons sont ignorées en v1 ; la clé d'épisode est `n` (numérotation continue). État utilisateur (localStorage, clé `chrono-mcu:v1`), clés unitaires = `id` pour un film, `id/n` pour un épisode :
```json
{ "version": 1, "order": "chrono|release",
  "seen": {"iron-man": "2026-10-27", "wandavision/1": "2026-10-28"},
  "ignored": {"iron-man": true}, "lastSeenKey": "wandavision/1" }
```
Une série est « vue » quand tous ses épisodes le sont (dérivé, jamais stocké). `ignored` liste les titres écartés du suivi (série entière, jamais par épisode).

## Code Style
Fonctions pures dans `logic.js`, sans accès au DOM ni au storage ; effets de bord confinés à `store.js` et `app.js`.
```js
export function nextToWatch(titles, seen, order) {
  return sortTitles(titles, order).find((t) => !seen[t.id]) ?? null;
}
```
Nommage camelCase, identifiants de données en kebab-case, pas de commentaires superflus, 2 espaces d'indentation.

## Testing Strategy
Tests unitaires `node --test` sur `logic.js` (tri, filtres, progression, prochain, stats) et `store.js` (sérialisation, import invalide, migration de version). Validation de `mcu.json` par script (ids uniques, chronoOrder unique, champs requis, dates valides, films avec `runtimeMin`, séries avec `episodes` non vide et `n` uniques/continus). Vérification manuelle de l'UI sur viewport mobile et desktop.

## Exigences fonctionnelles et critères de succès
1. **Vu/pas vu** : cocher/décocher un film ou un épisode persiste après rechargement. Cocher une série coche tous ses épisodes ; la décocher les décoche tous. Une série partiellement vue affiche « n/total ».
2. **Ordres** : bascule chrono/sortie ; changer d'ordre ne modifie jamais la progression.
3. **Progression** : % global et par phase calculé sur les unités (films + épisodes), affiché et exact (testé). Les titres `verified: false` sont comptés mais signalés visuellement.
4. **Filtres** : par phase et par type (film/série), combinables ; la progression globale reste sur l'ensemble.
5. **Prochain à voir** : première unité non vue (film ou épisode) dans l'ordre actif, les épisodes d'une série étant dans l'ordre `n` ; `null` quand tout est vu.
6. **Export/Import** : l'export produit un JSON ; l'import d'un export valide restitue l'état à l'identique ; un fichier invalide est rejeté avec message, sans écraser l'état existant.
7. **Ignorer un titre** : un film ou une série ignoré est exclu de la progression, des statistiques et du « Prochain à voir », reste visible grisé avec un badge « ignoré », se réactive en un tap ; l'état est inclus dans l'export (remplace les notes de la v1.5).
8. **Je reprends (v1.5)** : `lastSeenKey` mis à jour à chaque coche ; un bandeau propose l'unité suivante dans l'ordre actif ; indépendant de l'ordre choisi.
9. **Statistiques (v1.5)** : heures vues, heures restantes (somme des `runtimeMin` des unités, épisodes inclus), rythme = heures vues / jours écoulés depuis la première coche, date de fin estimée ; affichage « n/a » si moins de 2 jours de données.
10. **Robustesse** : localStorage indisponible ou corrompu = l'app démarre à vide sans crash.
11. **Responsive** : utilisable sans scroll horizontal dès 360 px de large.

## Boundaries
- Always : lancer `node --test` et `validate-data.mjs` avant commit ; garder les fonctions de logique pures ; valider tout JSON importé.
- Ask first : ajouter une dépendance, changer le schéma d'état (version), ajouter un backend ou une API externe, étendre le périmètre.
- Never : committer des secrets, écraser l'état utilisateur sur import invalide, supprimer un test en échec, inventer des données sans le signaler pour relecture.

## Décisions validées
Ordre chronologique : Disney+ officiel. Séries : suivi par épisode. Périmètre de sorties : tout ce qui est sorti à ce jour.

## Évolutions (v2)
- Périmètre étendu jusqu'à la fin de la phase 6 (Avengers : Secret Wars). Champ `upcoming: true` pour les titres non sortis : sans durée ni épisodes, exclus des unités, de la progression, des stats et du « prochain à voir », affichés « à venir ».
- Cocher une phase : coche/décoche tous les titres sortis de la phase (en conservant les dates déjà enregistrées). Case dans la barre de progression par phase et en-tête de groupe dans la liste ; regroupement par phase activable (préférence stockée à part, clé `chrono-mcu:view`).

- Scènes post-générique : champ optionnel `postCredits` sur les films (`mid`/`end`, `[]` = aucune, absent = inconnu), affiché en badges. Renseigné seulement quand c'est sûr.

- Affiches : champs optionnels `poster` et `tmdbId`, chargées à la volée depuis `image.tmdb.org` (jamais stockées dans le dépôt), script `scripts/fetch-posters.mjs` pour les renseigner, réglage « Afficher les affiches » et mention TMDB affichés seulement s'il y en a.

- Recherche (titre/épisode, sans accents), « Masquer les terminés » (titres entièrement vus), annulation de la dernière coche (8 s, un seul niveau), champ `altUniverse` + badge « autre réalité ». Idées inspirées de Chronologeek ; aucun contenu ni ordre éditorial repris.

- Scènes post-générique complétées et recoupées avec la liste Wikipedia (corrections : Thor n'a qu'une scène, L'Incroyable Hulk aucune). Champ `tvmazeId` + `scripts/check-data.mjs` + workflow hebdomadaire pour contrôler les durées de séries.

- Thèmes : jetons de couleur CSS en clair / sombre / OLED, réglage `theme` (`auto`|`light`|`dark`|`oled`) stocké avec les préférences d'affichage (`chrono-mcu:view`), appliqué par un script en tête de page avant le premier rendu ; `meta theme-color` mis à jour. Les lignes « à venir » n'utilisent plus d'opacité (contraste).

- Refonte Material 3 : navigation (barre du bas / rail), écrans À voir / Progression / Réglages, onglets Tout / Films / Séries, bottom sheets natives (`<dialog>`) pour les filtres, la fiche d'un titre, le menu d'une ligne et la sauvegarde ; panneau de détail fixe dès 840 px ; icônes Material en SVG intégré ; police Roboto avec repli sur la police système ; jetons de couleur en thèmes clair / sombre / OLED. Les contrôles ne sont jamais imbriqués (case, ouverture de la fiche et menu sont des boutons frères). Test de bout en bout `e2e/run.mjs` (axe-core + taille des cibles + clavier) dans la CI.

- « Prochain à voir » = première unité non vue **après le dernier coché** (`suggestNext`), jamais ce qui a été sauté ; sans historique, le premier titre de la liste ; fin de liste atteinte ou tout vu = message sans rappel. Remplace l'ancien « Je reprends ».

- Noir OLED indépendant du thème : `theme` ∈ `auto|light|dark` + `oled` (booléen) dans les préférences d'affichage. En Auto, `data-oled` sur `<html>` active le noir pur seulement quand le système est sombre (CSS `prefers-color-scheme`). L'ancien thème `oled` est migré en `dark` + `oled`.

- Affiches agrandies (liste 72x108, panneau latéral 160x240, carte « Prochain à voir » 64x96) ; en-tête image paysage (`backdrop`, 16:9, fixe en haut) dans la feuille de fiche d'un titre ; dates au format JJ/MM/AAAA : `releaseDateFr` pour les films (sortie salle France, repli sur `releaseDate`), `airDate` par épisode (TVmaze, diffusion d'origine), affichées dans la liste, la fiche et le menu d'une ligne.

- Notes et commentaires supprimés définitivement (retirés de l'UI, du stockage au chargement et de l'import/export ; les anciens fichiers restent importables, leurs notes sont ignorées). Ajout de `ignored` (état optionnel, absent = vide) ; `suggestNext` accepte les titres ignorés. Champ `overview` (résumé TMDB en français, 300 caractères max, `fetch-posters.mjs --details`) affiché dans la fiche ; l'affiche portrait n'apparaît plus dans la feuille de fiche (redondante avec l'image paysage), elle reste dans le panneau latéral.

- Swipe tactile (`js/ui/swipe.js`) sur les lignes de la liste À voir et les épisodes de la fiche : droite = vu / non vu, gauche = ignorer / réactiver (série entière pour « Vu »), validé au relâchement au-delà de 40 % de la largeur, verrou horizontal après 8 px, marge de 24 px aux bords de l'écran, pointeurs tactiles et stylet seulement. Raccourci : la case, le menu et la fiche restent la voie principale ; le fond (icône + libellé) est masqué aux lecteurs d'écran ; annulation par le snackbar habituel.

- Fiabilité du stockage : état en version 2 avec migrations (`migrate`, une étape par version ; l'ancien contenu est gardé une fois dans `chrono-mcu:v1:pre-v2`) ; un fichier d'une version plus récente que l'application est refusé avec un message clair. `navigator.storage.persist()` demandé à la première coche, état affiché dans Réglages. Rappel de sauvegarde (`js/backup.js`) au-delà de 20 éléments vus ou 30 jours avec changements depuis le dernier export ou import, reportable 14 jours ; la dernière sauvegarde et le report sont dans les préférences d'affichage, jamais exportés. PWA installable (`manifest.webmanifest`, icônes générées par `npm run icons`), sans service worker.
- Tests de comportement (`e2e/behavior.mjs`, lancés par `npm run e2e` après les audits d'accessibilité) : persistance, annulation, effet d'« ignorer » sur la progression et le « Prochain à voir », export / import (dont fichier invalide), noir OLED en Auto, migration v1 vers v2, rappel de sauvegarde.

- Rattrapage : action « Tout marquer vu jusqu'ici » (menu d'une ligne, ordre actif, titres ignorés et à venir exclus, affichée à partir de 2 titres concernés), annulable par le snackbar. État : champ optionnel `catchUp` (clés d'unités marquées d'un coup, `{clé: true}`) ; `stats` les compte dans les heures vues et restantes mais les exclut du rythme et de la date de fin estimée ; décocher une unité la sort du rattrapage.
- Titres d'épisodes en français : champ optionnel `titleFr` par épisode (TMDB `fr-FR`, uniquement quand il diffère de l'original et que les saisons TMDB et TVmaze ont le même nombre d'épisodes), affiché dans la fiche et le « Prochain à voir » ; la recherche trouve les deux titres. `scripts/shared.mjs` centralise l'ordre des clés de `data/mcu.json`.

- Robustesse : politique de sécurité du contenu en balise `<meta>` (scripts du site et hash du script de thème, jamais `unsafe-inline` ni `unsafe-eval` pour les scripts ; images du site, de `image.tmdb.org` et `data:` ; connexions et manifeste au site seul ; pas de `<base>` ni de formulaire), contrôlée par `tests/csp.test.js` et par l'e2e (toute violation CSP échoue). CI : actions épinglées par SHA de commit (`tests/workflows.test.js`), `dependabot.yml` (actions et npm, chaque mise à jour passe par la CI), droits en lecture seule sauf le job de déploiement, concurrence corrigée (un run de PR ne peut plus interrompre un déploiement de main). Reflow : l'e2e vérifie à 320 px, avec et sans texte à 200 %, qu'aucun écran ne défile en horizontal, qu'aucune commande ne sort de l'écran et qu'aucun texte n'est coupé ; les boutons, badges et la barre de navigation passent à la ligne au lieu de déborder.

- Épisodes pas encore sortis : un épisode est sorti le jour de son `airDate` (date américaine, le jour même, choix assumé) ; `releasedView` retire les autres du catalogue servant à tous les comptes (progression, statistiques, « Prochain à voir », rattrapage), une série sans épisode sorti devient « à venir ». La liste affiche « 6/8 ép. (2 à venir) », la fiche garde les épisodes à venir grisés sans case (« Sort le 03/11/2026 »), la carte « Prochain à voir » ajoute « Prochainement » pour les séries commencées. L'écran se recalcule au retour sur l'onglet un nouveau jour.
- Catégories à ne pas suivre : état optionnel `skip` (liste d'identifiants parmi `series`, `shorts`, `altUniverse`, `multiverse`, définis dans `js/categories.js` d'après les données) et `included` (titres réintégrés malgré leur catégorie). Un titre est ignoré s'il l'est explicitement, ou si une de ses catégories est coupée sans réintégration ; « ignorer » explicite l'emporte. Suivre à nouveau une catégorie efface les réintégrations devenues inutiles. Réglages > « Ce que je suis » affiche le poids de chaque catégorie et le total suivi. Aucun changement de version d'état. Défilement : `scroll-padding-bottom` pour que le focus ne passe jamais sous la barre de navigation (WCAG 2.4.11).

- Deadpool (2016) et Deadpool 2 (2018) : films de la Fox, ajoutés à la demande d'Antoni qui les compte dans le MCU. Rangés selon leur date de sortie et la phase en cours à ce moment : Deadpool (12/02/2016, entre la fin de la phase 2 avec Ant-Man et le début de la phase 3 avec Civil War) en phase 2, Deadpool 2 (18/05/2018) en phase 3, donc dans l'Infinity Saga ; chronoOrder juste avant Deadpool & Wolverine (les suivants décalés de 2). Durées 108 et 119 min (Wikipedia), scènes : Deadpool « end », Deadpool 2 « mid » (le bonus de fin de Deadpool 2 est seulement sonore, non compté). Ils sont marqués « autre réalité » (`altUniverse`, univers Fox) : le badge s'affiche et couper la catégorie « Autres réalités » les retire.

- Titre d'en-tête : « Chrono-MCU » dans un bloc rouge au coin bas-droit chanfreiné (couleur du bouton principal, texte blanc, contraste AA) en capitales condensées, police Bebas Neue (SIL OFL) réduite et servie par le site ; CSP `font-src 'self'` ; repli sur les polices condensées du système. Mention « application non officielle » dans Réglages > À propos. Style seulement : ni le logo ni le nom Marvel ne sont repris.

## Livraison des données
Les données arrivent par paliers : d'abord films + séries de la saga Infinity et séries bien connues, puis le reste. Le code gère déjà le catalogue complet ; seule `mcu.json` avance. Toute entrée incertaine est `verified: false` et sera relue par Antoni avant d'être considérée comme fiable.

## Open Questions
- Ma connaissance des sorties récentes et des listes d'épisodes peut être incomplète : Antoni complète/corrige `mcu.json` pour les entrées `verified: false`.
- Faut-il regrouper les épisodes par saison dans l'UI (repli/dépli) ? Proposition : oui, simple repli par série, sans modèle de saison en v1.
- Barre des phases (À voir) : onglets défilants Toutes / Phase 1 à 6 sous la barre d'outils ; un appui filtre la liste. Dessous : « Phase N · Infinity Saga / Saga du Multivers » plus années, titres suivis, heures et % vu de la phase. Marvel ne nomme officiellement que les deux sagas (pas de nom par phase), donc aucun nom inventé. Titre Chrono-MCU + barre restent collés en haut (`position: sticky`, hauteur mesurée par ResizeObserver dans `--phasebar-h`, `scroll-padding-top` pour le focus), désactivé sous 560 px de haut. Les chips de phase ont quitté la feuille Filtres. En-tête de groupe (avec « Vu : phase N entière ») conservé quand une phase est choisie. Clavier : flèches, Début, Fin.
