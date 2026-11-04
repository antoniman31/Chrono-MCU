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

- Robustesse : politique de sécurité du contenu en balise `<meta>` (scripts du site et hash du script de thème, jamais `unsafe-inline` ni `unsafe-eval` pour les scripts, `style-src-attr 'none'` (les styles dynamiques passent par l'API CSS dans `h()`, jamais par un attribut `style` écrit dans le HTML) ; images du site, de `image.tmdb.org` et `data:` ; connexions et manifeste au site seul ; pas de `<base>` ni de formulaire), contrôlée par `tests/csp.test.js` et par l'e2e (toute violation CSP échoue). CI : actions épinglées par SHA de commit (`tests/workflows.test.js`), `dependabot.yml` (actions et npm, chaque mise à jour passe par la CI), droits en lecture seule sauf le job de déploiement, concurrence corrigée (un run de PR ne peut plus interrompre un déploiement de main). Reflow : l'e2e vérifie à 320 px, avec et sans texte à 200 %, qu'aucun écran ne défile en horizontal, qu'aucune commande ne sort de l'écran et qu'aucun texte n'est coupé ; les boutons, badges et la barre de navigation passent à la ligne au lieu de déborder.

- Épisodes pas encore sortis : un épisode est sorti le jour de son `airDate` (date américaine, le jour même, choix assumé) ; `releasedView` retire les autres du catalogue servant à tous les comptes (progression, statistiques, « Prochain à voir », rattrapage), une série sans épisode sorti devient « à venir ». La liste affiche « 6/8 ép. (2 à venir) », la fiche garde les épisodes à venir grisés sans case (« Sort le 03/11/2026 »), la carte « Prochain à voir » ajoute « Prochainement » pour les séries commencées. L'écran se recalcule au retour sur l'onglet un nouveau jour.
- Catégories à ne pas suivre : état optionnel `skip` (liste d'identifiants parmi `series`, `shorts`, `altUniverse`, `multiverse`, définis dans `js/categories.js` d'après les données) et `included` (titres réintégrés malgré leur catégorie). Un titre est ignoré s'il l'est explicitement, ou si une de ses catégories est coupée sans réintégration ; « ignorer » explicite l'emporte. Suivre à nouveau une catégorie efface les réintégrations devenues inutiles. Réglages > « Ce que je suis » affiche le poids de chaque catégorie et le total suivi. Aucun changement de version d'état. Défilement : `scroll-padding-bottom` pour que le focus ne passe jamais sous la barre de navigation (WCAG 2.4.11).

- Deadpool (2016) et Deadpool 2 (2018) : films de la Fox, ajoutés à la demande d'Antoni qui les compte dans le MCU. Rangés selon leur date de sortie et la phase en cours à ce moment : Deadpool (12/02/2016, entre la fin de la phase 2 avec Ant-Man et le début de la phase 3 avec Civil War) en phase 2, Deadpool 2 (18/05/2018) en phase 3, donc dans l'Infinity Saga ; chronoOrder juste avant Deadpool & Wolverine (les suivants décalés de 2). Durées 108 et 119 min (Wikipedia), scènes : Deadpool « end », Deadpool 2 « mid » (le bonus de fin de Deadpool 2 est seulement sonore, non compté). Ils sont marqués « autre réalité » (`altUniverse`, univers Fox) : le badge s'affiche et couper la catégorie « Autres réalités » les retire.

- Titre d'en-tête : « Chrono-MCU » dans un bloc rouge au coin bas-droit chanfreiné (couleur du bouton principal, texte blanc, contraste AA) en capitales condensées, police Bebas Neue (SIL OFL) réduite et servie par le site ; CSP `font-src 'self'` ; repli sur les polices condensées du système. Mention « application non officielle » dans Réglages > À propos. Style seulement : ni le logo ni le nom Marvel ne sont repris.

## Livraison des données
Les données arrivent par paliers : d'abord films + séries de la saga Infinity et séries bien connues, puis le reste. Le code gère déjà le catalogue complet ; seule `mcu.json` avance. Toute entrée incertaine est `verified: false` et sera relue par Antoni avant d'être considérée comme fiable.

## Open Questions
- Ma connaissance des sorties récentes et des listes d'épisodes peut être incomplète : Antoni complète/corrige `mcu.json` pour les entrées `verified: false`.
- Faut-il regrouper les épisodes par saison dans l'UI (repli/dépli) ? Proposition : oui, simple repli par série, sans modèle de saison en v1.
- Barre des phases (À voir) : onglets défilants Toutes / Phase 1 à 6 sous la barre d'outils ; un appui filtre la liste. Dessous : « Infinity Saga / Saga du Multivers » plus années, titres, durée et % vu de la phase ; la phase sélectionnée est une pastille rouge « Phase N » avec une petite flèche vers cette phrase. Marvel ne nomme officiellement que les deux sagas (pas de nom par phase), donc aucun nom inventé. Titre Chrono-MCU + barre restent collés en haut (`position: sticky`, hauteur mesurée par ResizeObserver dans `--phasebar-h`, `scroll-padding-top` pour le focus), désactivé sous 560 px de haut. Les chips de phase ont quitté la feuille Filtres. En-tête de groupe (avec « Vu : phase N entière ») conservé quand une phase est choisie. Clavier : flèches, Début, Fin.
- Barre des phases, révision : plus d'onglet « Toutes » ni de filtre par phase. Un appui sur un onglet fait défiler la liste jusqu'au premier titre (ou à l'en-tête de groupe) de la phase, rien n'est masqué. Suivi du défilement : sur `scroll` (rAF), la phase du premier élément `[data-phase]` encore visible sous le bloc fixe met à jour l'onglet et la ligne d'info ; le suivi est suspendu ~0,9 s après un appui pour ne pas contredire le défilement lancé.
- La barre des phases n'est affichée qu'en ordre de sortie : en ordre chronologique les titres d'une phase sont dispersés, le suivi du défilement n'aurait pas de sens (barre cachée, suivi désactivé).
- Style de la barre des phases : frise (choix d'Antoni, variante D des maquettes). Un rond numéroté par phase, relié au suivant par un trait ; anneau `conic-gradient` vert pour la part vue, rouge sur la phase courante ; libellé « Phase N » sous la phase courante seulement (espace réservé pour éviter tout saut) ; nom accessible « Phase N, X % vu ». Onglets `flex: 1 0 44px` : la frise remplit la largeur et ne défile que si le texte est très agrandi. Ligne d'info centrée dessous.
- « Grouper par phase » n'existe qu'en ordre de sortie : en ordre chronologique la liste n'est jamais groupée et l'option est retirée de la feuille Filtres (la préférence reste mémorisée et se réapplique en repassant en ordre de sortie).
- Navigation du bas compacte (écran de moins de 600 px, choix d'Antoni, variante D) : 48 px au lieu de 80, icônes seules, le nom n'apparaît que sur la page active, dans une pilule rouge sombre. Zone tactile 44 px de haut ; `aria-label` et `title` sur chaque lien. Le menu latéral des écrans larges (≥ 600 px) est inchangé. `--nav-h` passe à 48 px sur écran étroit, la marge sous la liste, le défilement automatique et la position de la barre de message suivent cette variable.
- Écran Réglages en sections repliables (choix d'Antoni, variante D) : Apparence, Ce que je suis, Données, À propos. Une seule section ouverte à la fois (`<details name>`), chacune avec une icône ronde et un résumé de la valeur actuelle ; la section ouverte est mémorisée en mémoire de page et reste ouverte quand un réglage re-rend l'écran. Le thème est un choix à trois pilules (au lieu de trois boutons radio empilés) ; elles passent à la ligne si le texte est très agrandi. Les tests e2e ouvrent chaque section pour l'audit d'accessibilité.
- Bouton de thème dans le bandeau du haut, à droite, visible sur les trois écrans : un appui fait défiler Auto, Clair, Sombre, puis retour à Auto. L'icône montre le mode actuel (demi-disque, soleil, lune), le nom accessible dit le mode et le suivant (« Thème : Clair. Passer à Sombre »), et le changement est annoncé dans une zone `role=status`. Même préférence que dans Réglages (`view.theme`), donc les deux restent synchronisés.
- Versions d'un film (« Avengers : Endgame Encore », ressortie du 25/09/2026, 185 min au lieu de 181, nouvelle scène post-générique d'après la presse), choix d'Antoni : pas de titre à part (une seule case, pas de total gonflé de 3 h). `versions` dans `data/mcu.json` ; choix de l'utilisateur dans `state.versions` ({ idDuFilm: idDeLaVersion }, absent = originale, champ optionnel sans changement de `STATE_VERSION`, exporté et importé). `withVersions(titles, chosen)` applique la version avant `releasedView` : durée et `postCredits` effectifs pour tous les comptes. La liste signale « version Encore : nouvelle scène post-générique » tant que la version n'est pas choisie, puis « version Encore ». Fiche : sélecteur « Version regardée ». Les infos de l'Encore viennent de la presse (non vérifiées par Marvel) ; l'entrée du film reste `verified: true`, la note de la version le précise.
- Réglages : quatre ajouts (choix d'Antoni, une seule PR). Préférences d'appareil dans `chrono-mcu:view` : `spoilerFree`, `nudgeDays` (7, 14, 30 ou 0 = jamais ; `backupStatus` reçoit le délai), `goalDate` (Doomsday 2026-12-18 tant que rien n'est enregistré ; `null` = objectif retiré, pas de retour automatique).
- Sans spoiler : `js/spoilers.js`. Un titre est « commencé » dès qu'une unité est cochée ; avant cela, résumé et image paysage de la fiche masqués (« Afficher le résumé » valable jusqu'au rechargement) ; le titre d'un épisode est masqué tant que l'épisode n'est pas vu (fiche, « Prochain à voir », message d'annulation). Affiches portrait, recherche et pastilles de la liste ne changent pas.
- Objectif : `goalPlan` dans `js/logic.js` (heures restantes / jours restants x 7 ; statuts done, passed, unknown, on-track, behind) ; carte « Objectif » sur Progression ; date modifiable dans la section Objectif de Réglages.
- Effacer ma progression : feuille de confirmation ; `eraseProgress` télécharge la sauvegarde puis vide `seen`, `catchUp`, `lastSeenKey` et `versions`. Les titres ignorés, les catégories suivies, l'ordre et les préférences restent. Annulable 10 s via le message habituel.
- Affiches de la liste : taille fixe (72x108 px, 56x84 px sous 340 px de large) et `.item-text { flex: 1 1 0; min-width: 0 }`. Avant, l'affiche pouvait rétrécir (44 à 72 px) quand les badges d'un titre étaient longs, car le texte ne cédait pas de place ; maintenant le texte passe à la ligne. Un test e2e vérifie que toutes les affiches ont la même taille.
- Cartes de la liste (choix d'Antoni, variante D) : quand un titre a une affiche, la carte fait au moins 144 px et l'affiche (96 px de large, 72 px sous 340 px) en occupe toute la hauteur, collée au bord ; la case « vu » est posée sur son coin (fond sombre pour rester lisible) ; le menu ⋮ reste à droite. Le titre est coupé à 2 lignes avec « … » (titre complet dans la fiche), les badges passent en libellés courts (« post-générique », « mi-générique », « Encore : nouvelle scène »), les libellés complets restent dans la fiche. `min-height` et non `height` : si le texte est très agrandi, la carte grandit au lieu de couper le contenu. Sans affiche (option désactivée ou image absente), la mise en page d'avant est conservée (`:has(.poster)`). Les tests e2e servent une image de 1 pixel : ils auditent donc la mise en page avec affiche.
- Cartes de la liste, révision (choix d'Antoni, variante C) : la case « vu » ne recouvre plus l'affiche. Colonne de 48 px à droite de la carte : menu ⋮ en haut, case « vu » en bas (zones tactiles de 48 px, texte inchangé à environ 170 px de large). Le balayage de la ligne est inchangé.
- Fiche, résumé et spoilers (choix d'Antoni : A + C). Le résumé est limité à 3 lignes (`-webkit-line-clamp`) ; le bouton « Voir plus / Voir moins » (chevron) n'apparaît que si le texte déborde, mesuré par un `ResizeObserver` (la largeur change avec la feuille, le texte agrandi ou l'orientation) ; l'état déplié est gardé tant que la page reste ouverte. Mode sans spoiler : le résumé n'est plus remplacé mais flouté (`filter: blur`, `aria-hidden` pour les lecteurs d'écran), avec le bouton « Afficher les spoilers » posé dessus ; l'image paysage de la feuille est floutée (et agrandie de 15 % pour cacher les bords) ; dans la liste des épisodes seul le titre est flou (« Ép. 4 — » reste lisible, « titre masqué » pour les lecteurs d'écran). Un appui révèle tout dans la fiche ; un bouton « Masquer les spoilers » (œil barré) re-floute ; l'état n'est gardé que jusqu'au rechargement. Le bouton ne s'affiche que s'il reste quelque chose à révéler (`hasSpoilers` : titre pas commencé, ou épisodes pas tous vus). Un épisode que tu coches voit son titre se dévoiler.
- « Prochain à voir » (choix d'Antoni, variante D) : bandeau fin d'au moins 72 px (affiche 48 px collée à gauche, libellé, titre sur une ligne avec « … » dès 380 px de large et deux lignes en dessous, durée et phase) ; zone de gauche = bouton qui ouvre, rond à droite = coche (48 px de zone tactile). `ctx.goToNext` : vide la recherche, repasse sur l'onglet Tout, déplie le groupe de phase replié, défile jusqu'à la ligne (centrée sous les barres fixes), ouvre la fiche ; sur téléphone la ligne est mise en évidence à la fermeture de la fiche, en grand écran tout de suite ; pour un épisode, la fiche défile jusqu'à l'épisode et le surligne. Mise en évidence : halo qui s'éteint en 1,5 s, anneau fixe si `prefers-reduced-motion`. Les lignes « Prochainement : épisode X le JJ/MM » restent, en petit sous le bandeau, sans carte.

- Filtres (feuille unique) : statut (tous/à voir/en cours/terminés), titres ignorés (afficher par défaut/masquer/seulement), scène après le générique, durée (<1 h 30, 1 h 30 à 2 h, >2 h), bouton « Afficher N titres ». La recherche ne porte plus que sur les titres de films/séries ; les titres d'épisodes sur option (désactivée par défaut). Filtres non mémorisés entre sessions.

- Progression en trois sous-onglets (Bilan / Rythme / MCU) : stats perso issues des dates de coche (js/insights.js, fonctions pures testées) et stats du catalogue (records, post-générique, répartition, frise par année). Graphiques en HTML/CSS, avec alternative textuelle (role=img + aria-label).

- Succès (4e sous-onglet de Progression, js/achievements.js) : paliers bronze/argent/or, 17 succès cachés (masqués par `hideSecrets`, révélés par un bouton le temps de la visite, comme le mode sans spoiler), une médaille par phase et par saga générées depuis le catalogue et `data/sagas.json`, calcul depuis les coches et réglages, rattrapages exclus des succès de rythme. Les paliers obtenus sont mémorisés dans les préférences d'affichage (`achv`, propres à l'appareil, hors export) ; le premier calcul est silencieux pour ne pas annoncer l'existant. Bandeau discret avec « Voir ».

- Personnages et équipes : champ optionnel `heroes` dans data/mcu.json (identifiants de js/heroes.js, rôle principal ou co-principal seulement, validé par scripts/validate-data.mjs). 13 personnages et 2 équipes (Avengers, Gardiens), à compléter à la main. Servent au filtre « Personnage ou équipe » (feuille Filtres) et à un succès « Tout sur X » par héros (paliers 50 / 75 / 100 % des titres sortis).

- Accueil (feuille `welcome`, une fois, préférence `welcomed`), historique d'annulation en mémoire (20 actions, Réglages > Données), retour tactile à la coche (`feedback`, vibration + rebond, désactivable). « Tout marquer vu jusqu'ici » existait déjà (menu ⋮) : l'accueil le réutilise.

- Hors-ligne : service worker `sw.js` (cache `chrono-mcu-<build>`, fichiers ?v= en cache d'abord, navigation réseau d'abord avec repli, affiches TMDB jamais conservées pour ne pas stocker de réponses opaques). Enregistré seulement sur un build déployé. Précache de js/, css/, data/ vérifié par tests/sw.test.js ; test e2e hors ligne sur une copie « buildée ».

- Succès ajoutés : Heures de vol, Prévoyant et Sauvegarde à jour, Régulier (semaines), Chronologue et Fidèle à la sortie (suites d'unités vues dans l'ordre, rattrapages exclus), Phase et Saga express, Complétiste des scènes, Film fleuve et Film éclair, et trois cachés (Sélectif, Encore !, Dès la sortie). Les sauvegardes s'appuient sur `lastBackup` des préférences d'affichage.

- Synchronisation du catalogue (scripts/sync-catalog.mjs, workflow hebdomadaire) : promotion des titres « à venir » sortis (TMDB pour les films, TVmaze pour les séries), brouillons « à venir » pour les nouveautés Marvel Studios/Animation absentes, simple signalement des nouvelles saisons ; PR en brouillon à relire, jamais de fusion automatique ; ordre chronologique, post-générique et personnages restent manuels. Clé TMDB uniquement comme secret du dépôt.

- Synchronisation du catalogue : mensuelle (le 1er) et manuelle plutôt qu'hebdomadaire, pour limiter le bruit des PR ; le contrôle des durées TVmaze (data-check.yml) est lui aussi mensuel.

- Lancement de la synchronisation depuis Réglages (js/github.js) : lien vers la page Actions du workflow, et, si l'utilisateur colle un jeton fine-grained (Actions : lecture/écriture, ce dépôt seulement), vrai bouton qui appelle l'API `workflow_dispatch` puis suit le lancement. Jeton dans une clé localStorage séparée, jamais exporté ; CSP `connect-src` élargie à `https://api.github.com` ; sw.js ignore déjà les requêtes d'autres origines.

- Titres « à venir » : menu ⋮, glissement à gauche et bouton de la fiche pour ignorer / ne plus ignorer (sans case à cocher) ; l'état « ignoré » est conservé à la sortie ; cadre pointillé fin par pseudo-élément.

- Fiches voisines : pied de fiche épinglé en bas (sticky) « ‹ précédent · n / N · suivant › » avec le nom des voisins (masqué sous 360 px), glissement horizontal limité à l'en-tête de la fiche et à l'image paysage (la liste d'épisodes garde son glissement « vu »), flèches ← → (sauf dans un champ ou un onglet). Ordre = liste affichée (`ctx.navIds`), butoir aux bouts, ignorés et « à venir » inclus.
- Durées : une seule fonction `formatDuration` (js/duration.js) pour tout l'affichage : « 45 min », « 2 h 06 min », « 15 j 21 h 12 min » (unités à zéro omises, jours à partir de 24 h, pas de secondes : les données sont en minutes).
- Couleurs : une seule valeur par couleur, identique dans tous les thèmes (jetons `--red #d32f2f`, `--green #2e7d32`, `--amber #a85f00`, `--blue #1e6fd9`, `--violet #7b4fc9`, plus un gris `--gray #5f6368` pour « ignoré », texte blanc dessus, contraste AA). Les fonds teintés (`--tonal`) sont dérivés du rouge par `color-mix`. Le texte courant reste en `--fg` ; les liens sont soulignés de rouge, car une même teinte ne peut pas être lisible comme texte sur fond clair et sombre. Les médailles bronze / argent / or restent des métaux.
- Sagas : liste dans `data/sagas.json` (`id`, `name` ou `null`), chargée au démarrage (`ctx.sagas`), précachée par le service worker et validée par `validateSagas`. `sagaLabel(saga, sagas, titles)` renvoie le nom, ou « Phases a à b » (calculé sur le catalogue) pour une saga sans nom officiel. `sagaNames(saga, sagas, titles)` donne le nom court (sans article, pour les titres) et le nom de phrase (« la Saga de l'Infini ») : les succès de saga (un par saga, identifiant = id de la saga, générés par `catalogFor` ; `sagaFast` porte sur la première) et les catégories de Réglages (`categoriesFor(sagas)` : une par saga sauf la première, id = id de la saga, "s'arrêter à" la précédente) s'en servent ; `totalMedals(list)` remplace le total fixe. Les ids de `skip` sont des textes libres (`isCategoryId`), `matchesCategory` retombe sur `titre.saga === id`. Ajouter une saga = une ligne dans `data/sagas.json`.
- Données illisibles : `loadStateWithReport` (store.js) répare l'état (`repairState` retire les entrées invalides) ou, à défaut, repart de zéro ; dans les deux cas et pour une version plus récente, le contenu brut est copié une seule fois dans `chrono-mcu:v1:corrupt` (jamais écrasé) et `ctx.recovery` déclenche un bandeau (`recoveryText`, js/recovery.js) avec téléchargement et suppression dans Réglages > Données.
- Filet d'erreur : `js/boot.js` (script classique, avant le module) écoute `error` (erreurs JS, scripts et feuilles de style qui ne chargent pas ; les images sont ignorées) et `unhandledrejection`, et affiche un message dans `#message` ; un délai de 10 s signale un démarrage qui n'aboutit pas, sans écraser un message plus précis. `<noscript>` couvre JavaScript désactivé. Le message du catalogue indisponible est en français, le détail technique va dans la console.

## Annexe : référence détaillée (ex-README)

Texte déplacé du README lors de sa refonte, pour qu'il reste court. Les comportements décrits ici sont ceux de l'application actuelle.

### Écrans et gestes

L'interface suit Material 3 : une barre de navigation compacte en bas sur téléphone (48 px, nom visible seulement sur la page active ; rail latéral dès 600 px), et dès 840 px un panneau de détail fixe à droite de la liste.

- **Logo** : un appui sur « Chrono-MCU » remonte en haut de la liste (avec un défilement doux, direct si les animations sont réduites) ; depuis Progression ou Réglages, il ramène d'abord à la liste. La recherche et les filtres ne sont pas touchés.
- **À voir** : onglets Tout / Films / Séries, recherche (titres de films et séries, sans accents ; les titres d'épisodes sur option), bouton « Filtres » (statut, personnage ou équipe, afficher/masquer les ignorés, scène après le générique, durée, chercher dans les épisodes, grouper par phase proposé seulement en ordre de sortie), barre des phases (en ordre de sortie seulement, car en ordre chronologique les phases se mélangent ; frise de six ronds reliés (anneau vert = part vue ; la phase courante devient une pastille rouge « Phase N » avec une petite flèche vers la phrase) : un appui fait défiler la liste jusqu'à la phase sans rien masquer, et l'onglet suit les titres visibles quand tu défiles ; dessous, la saga et les chiffres de la phase (années, titres, durée, % vu) ; elle reste collée sous le titre, sauf sur un écran de moins de 560 px de haut), ordre chronologique ou de sortie. En haut, « Prochain à voir » (bandeau fin) : le titre (ou l'épisode) qui suit **le dernier que tu as coché** dans l'ordre choisi. Un appui sur le bandeau retire la recherche et l'onglet qui cacheraient la ligne, y défile, ouvre la fiche (pour un épisode, la fiche défile jusqu'à lui et le surligne) ; le rond à droite coche sans ouvrir. Ce que tu as sauté avant n'est jamais rappelé ; sans historique, il propose le tout premier titre.
- **Fiche d'un titre** (bottom sheet sur téléphone, panneau à droite sur grand écran) : détails, scènes après le générique, résumé, bouton « Ignorer », et pour une série la liste des épisodes à cocher. Les épisodes dont la date de diffusion (américaine, le jour même) n'est pas encore arrivée sont exclus des totaux et du « Prochain à voir », et affichés « Sort le JJ/MM/AAAA » dans la fiche. Le bouton « ⋮ » d'une ligne ouvre un menu d'actions, dont « Tout marquer vu jusqu'ici » (rattrapage d'historique en un geste, annulable ; ces unités comptent dans les heures vues mais pas dans le rythme). Sur écran tactile, glisser une ligne vers la droite la marque vue (non vue si elle l'est déjà), vers la gauche l'ignore (réactive si elle est ignorée) ; le geste se valide au-delà de 40 % de la largeur et reste annulable. Dans la fiche, glisser un épisode vers la droite le marque vu. Pour passer d'une fiche à l'autre : glisser l'en-tête (image paysage, titre, résumé) vers la gauche (suivant) ou la droite (précédent), appuyer sur le pied de fiche « ‹ titre précédent · n / N · titre suivant › » (épinglé en bas, noms des voisins masqués sous 360 px), ou utiliser les flèches ← → du clavier. Les fiches se feuillettent dans l'ordre de la liste affichée (filtres et recherche compris, phases repliées exclues) ; aux deux bouts, la fiche rebondit.
- Cocher un film, un épisode, une série entière ou une phase entière ; chaque coche propose « Annuler » pendant 10 secondes.
- **Hors-ligne** : après une première visite, l'application s'ouvre et se coche sans réseau (service worker `sw.js` ; quand une nouvelle version est prête, un bandeau propose de recharger ; cache renouvelé à chaque déploiement ; la page d'accueil passe par le réseau d'abord, donc une mise à jour apparaît dès que tu es en ligne). Les affiches TMDB ne sont pas conservées hors ligne. Elle s'installe sur l'écran d'accueil du téléphone via le menu du navigateur.
- **Accueil** : au premier lancement (rien de coché), une feuille explique les gestes et propose de commencer de zéro ou de rattraper l'historique (ordre, puis dernier titre vu : tout ce qui précède est marqué en rattrapage). Elle ne revient pas ; « Revoir l'accueil » est dans Réglages > À propos.
- **Annulation et retour tactile** : la snackbar annule la dernière action ; Réglages > Données annule les 20 dernières, une à une, jusqu'au rechargement. À la coche, le rond rebondit et l'appareil vibre un instant (réglage « Retour tactile » ; animations coupées si ton système les réduit).
- **Progression** (quatre sous-onglets) : **Bilan** (pourcentage global, barre par phase (avec case pour cocher la phase), heures vues et restantes, rythme et date de fin estimée après 2 jours d'usage) ; **Rythme** (série de jours, titres par semaine, histogramme des 12 dernières semaines, calendrier d'activité de 18 semaines, jalons 25/50/75/100 %) ; **MCU** (records, scènes post-générique, temps vu par phase, saga et format, frise des sorties) ; **Succès** (médailles bronze/argent/or : progression, une médaille par phase et par saga, heures de vol, sauvegardes, séries de jours, de semaines et de mois, week-ends entiers, marathons, journées fleuves, suites vues dans l'ordre, phases express, séries et films terminés, scènes de milieu et de fin de générique, jalons du MCU, records de durée, un « Tout sur… » par personnage ou équipe, et 17 succès cachés). Les succès cachés restent masqués tant qu'ils ne sont pas obtenus ; un bouton « Afficher les succès cachés » les montre le temps de la visite, et un réglage (Réglages > Apparence) les montre toujours. La page Succès affiche le détail par couleur, les trois succès les plus proches (« Bientôt »), des filtres (Tous, En cours, Obtenus, Verrouillés) et les paliers de chaque succès en petits ronds. Un bandeau avec la médaille du palier annonce chaque déblocage (bouton « Voir ») ; un grand succès (dernier palier, saga, objectif, tout voir) ouvre une feuille de célébration à la place, avec « Plus tard » et « Voir mes succès ». Un palier obtenu n'est jamais retiré. Tout est calculé sur ton appareil depuis les dates de coche ; les rattrapages ne comptent pas dans le rythme.
- **Objectif** : une date cible (Doomsday, le 18/12/2026, par défaut ; modifiable ou retirable dans Réglages) ; l'écran Progression dit combien d'heures regarder par semaine pour tout voir à temps, et si ton rythme actuel suffit.
- **Mode sans spoiler** (Réglages > Apparence) : tant que tu n'as pas commencé un titre, son résumé et l'image de sa fiche sont floutés et le titre d'un épisode reste flou tant que l'épisode n'est pas vu ; un bouton « Afficher les spoilers » les révèle dans la fiche, et « Masquer les spoilers » les re-floute. Dans « Prochain à voir », le titre de l'épisode est remplacé par son numéro. Le résumé d'une fiche tient sur 3 lignes, avec « Voir plus » seulement s'il est plus long.
- **Pannes visibles** : si l'application ne démarre pas (script introuvable, catalogue indisponible, JavaScript désactivé) ou si une erreur inattendue survient, un message en français s'affiche au lieu d'un écran blanc (`js/boot.js`, `<noscript>`) ; une affiche qui ne charge pas reste silencieuse.
- **Données illisibles** : si ce qui est enregistré dans le navigateur ne peut pas être lu tel quel (donnée corrompue, version plus récente), l'application répare ce qui peut l'être, garde une copie du contenu d'origine à part, le dit dans un bandeau et propose de la télécharger (aussi dans Réglages > Données) ; elle ne l'écrase jamais.
- **Données** (Réglages) : rappel de sauvegarde réglable (7, 14, 30 jours ou jamais) et « Effacer toute ma progression » (une sauvegarde est téléchargée d'abord, l'effacement est annulable 10 secondes).
- **Thème** : un bouton en haut à droite, visible sur tous les écrans, fait défiler Auto, Clair et Sombre.
- **Réglages** (sections repliables, une seule ouverte à la fois) : « Ce que je suis » (couper en bloc les séries, les courts formats, les autres réalités ou chaque saga après la première, avec le poids de chaque catégorie ; un titre précis se réintègre depuis son menu), « Réinitialiser les succès » (zone de danger : efface les médailles enregistrées, puis les recalcule d'après ta progression et les annonce de nouveau), thème Auto (suit le système), Clair ou Sombre, plus un interrupteur « Noir OLED » (noir pur) qui s'applique au mode sombre, y compris quand le thème est en Auto ; affiches, sauvegarde et restauration (export / import JSON : progression, thème, objectif de date, mode sans spoiler et succès débloqués ; le jeton GitHub, la date de dernière sauvegarde et le rappel restent sur l'appareil), sources et version.
- Durées affichées au même format partout : « 45 min », « 2 h 06 min », et au-delà de 24 h « 15 j 21 h 12 min » (les données sont en minutes).
- Couleurs : une seule valeur par couleur, identique dans les thèmes Clair, Sombre et OLED : rouge `#d32f2f` (celui de l'icône), vert `#2e7d32`, ambre `#a85f00`, bleu `#1e6fd9`, violet `#7b4fc9`, plus un gris `#5f6368`, avec du texte blanc dessus (contraste AA). Le texte courant reste en couleur normale ; les liens sont soulignés de rouge. Les médailles de succès gardent leurs couleurs bronze, argent et or.
- Badges (pastilles pleines à texte blanc) : « ignoré » (gris), « à venir » (bleu), scène post-générique (violet), « version » et « à vérifier » (ambre), « autre réalité » (vert) (What If, Marvel Zombies, Your Friendly Neighborhood Spider-Man), scènes mi-générique / post-générique par film (recoupées avec la [liste Wikipedia des scènes du MCU](https://en.wikipedia.org/wiki/Mid-credits_and_post-credits_scenes_in_the_Marvel_Cinematic_Universe)).
- Accessibilité : cibles tactiles de 44 px au minimum (48 px pour la plupart), mode contraste élevé de Windows et contraste renforcé pris en charge, contrastes WCAG AA dans les trois thèmes, navigation au clavier, feuilles modales natives (focus piégé, Échap), texte qui suit la taille choisie dans le système, `prefers-reduced-motion` respecté.

### Données du catalogue

## Corriger ou compléter les données

Tout le catalogue est dans `data/mcu.json` (phases 1 à 6, jusqu'à Avengers : Secret Wars). Chaque entrée a un champ `verified` : `true` quand dates, titres et durées sont recoupés avec des sources (TheTVDB, Apple TV, presse), `false` quand une partie reste estimée (durées d'épisodes approximatives, titres d'épisodes génériques « Épisode n », séries en cours). Un badge « à vérifier » s'affiche dans l'app.

Les sagas sont déclarées dans `data/sagas.json` (`{ "id", "name" }`) ; le champ `saga` de chaque titre doit y figurer (contrôlé par `npm run validate`). Pour une future saga sans nom officiel (phase 7 et suivantes), mets `"name": null` : l'application affiche « Phases 7 à 9 » d'après le catalogue, sans nom inventé. Les succès de saga (« Saga de l'Infini », « Saga du Multivers », « Saga express ») et l'interrupteur de Réglages prennent leur nom dans ce fichier (l'article « La » est retiré dans les titres et gardé dans les phrases) ; ajouter une saga dans le fichier suffit : son succès, son interrupteur de Réglages (« à couper pour s'arrêter à » la saga précédente) et son temps vu apparaissent seuls, et `npm run sync-catalog` range les nouveaux titres dans la saga de la dernière phase.

L'ordre chronologique suit la frise publiée par le jeu de données ouvert [Marvel Archive](https://github.com/les2/marvel-screen-archive) (`timelineOrder`, métadonnées sous licence CC BY 4.0), complété à la main pour les titres qu'il ne place pas (Loki 2, What If 2 et 3, Eyes of Wakanda, Marvel Zombies, titres 2025-2026). Ce n'est pas une copie vérifiée de l'ordre affiché sur Disney+ : corrige `chronoOrder` si le tien diffère. Les titres d'épisodes de Daredevil, What If, Loki 2 et WandaVision ont été recoupés avec le catalogue [mcu-completionist-watchlist](https://github.com/CinematicArchivesHQ/mcu-completionist-watchlist).

Les durées d'épisodes viennent de [TVmaze](https://www.tvmaze.com) (une seule source, donc cohérente, mais elles peuvent différer de quelques minutes de ce qu'affiche Disney+ selon que le générique est compté), et celles des films de l'infobox de Wikipedia. Seule VisionQuest reste « à vérifier » : quatre de ses épisodes ne sont pas encore sortis et leurs durées viennent de fuites.

Un film peut avoir des `versions` (ressortie avec des scènes en plus) : `{ id, label, badge, note, releaseDate, runtimeMin, postCredits? }`. Le film garde une seule case ; la fiche propose « Version regardée » (Originale par défaut) et la durée comptée et les scènes post-générique suivent le choix, enregistré dans l'état (`versions`, champ optionnel, présent dans l'export). Exemple : Endgame Encore.

Les titres pas encore sortis portent `"upcoming": true` (sans `runtimeMin` ni `episodes`). Ils s'affichent « à venir » (cadre pointillé) et ne comptent pas dans la progression ; ils peuvent s'ignorer (menu ⋮, fiche ou glissement vers la gauche) et le restent à leur sortie. À leur sortie : retirer `upcoming`, ajouter durée ou épisodes.

Pour corriger : éditer l'entrée, passer `verified` à `true`, puis lancer `npm run validate`. Règles :

- `id` unique et stable (la progression est stockée avec cet id : le changer perd les coches) ;
- `chronoOrder` unique par titre ;
- `altUniverse` : `true` pour un titre situé dans une autre réalité (absent sinon) ;
- `postCredits` (films) : tableau de `"mid"` / `"end"` ; `[]` = aucune scène après le générique ; champ absent = inconnu (aucun badge) ;
- `tvmazeId` (séries) : identifiant TVmaze pour le contrôle des durées ;
- film : `runtimeMin` obligatoire ; série : `episodes` (`n` de 1 à N, `title`, `runtimeMin`).

Les sorties annoncées après octobre 2026 ne sont pas listées : à ajouter à la main.

### Synchronisation automatique du catalogue

Le workflow `.github/workflows/catalog-sync.yml` tourne le 1er de chaque mois, et à la demande (onglet Actions > Synchronisation du catalogue > Run workflow) et lance `node scripts/sync-catalog.mjs --write`. Il prépare une pull request en brouillon, à relire ; rien n'est fusionné tout seul :

- un titre « à venir » dont la date est passée devient un titre sorti : durée et date France du film (TMDB), épisodes et durées de la série (TVmaze). Il reste « à vérifier » tant que tout n'est pas recoupé ;
- une annonce ou sortie Marvel Studios / Marvel Animation absente du catalogue est ajoutée comme brouillon « à venir » (phase la plus récente, ordre chronologique en dernier), avec affiche et résumé. Sont ignorés : documentaires, « making of », titres « Untitled », sorties à plus de 18 mois ou vieilles de plus de 60 jours ;
- une nouvelle saison d'une série suivie est seulement signalée dans le rapport : son ajout, comme l'ordre chronologique, les scènes post-générique (`postCredits`) et les personnages (`heroes`), reste manuel ;
- pour ne plus voir un titre proposé, ajouter son identifiant TMDB dans `data/sync-ignore.json` : `{ "tmdbIds": [123] }`.

Depuis l'application, Réglages > Données > Catalogue propose un lien vers la page GitHub du workflow (« Run workflow »). Avec un jeton personnel GitHub « fine-grained », limité à ce dépôt et au seul droit « Actions : lecture et écriture », collé dans la même section, l'application lance elle-même la synchronisation et suit son avancement (lien vers le journal à la fin). Le jeton reste dans ce navigateur, sous une clé à part : il n'est jamais exporté avec ta progression, et « Retirer le jeton » l'efface. La CSP autorise pour cela `api.github.com`.

La partie TMDB demande un secret de dépôt `TMDB_API_KEY` (Settings > Secrets and variables > Actions) ; sans lui, seul TVmaze est interrogé. Pour que le workflow ouvre la pull request, activer « Allow GitHub Actions to create and approve pull requests » (Settings > Actions > General) ; sinon il laisse la branche et ouvre une issue. Une PR ouverte par GitHub Actions ne lance pas la CI toute seule (règle de GitHub) : le workflow lance donc lui-même `pages.yml` sur la branche du robot (`gh workflow run`), et les contrôles `test` et `e2e`, exigés par la protection de `main`, s'affichent sur la PR (le déploiement, lui, ne tourne que sur `main`). En local : `NODE_USE_ENV_PROXY=1 TMDB_API_KEY=… node scripts/sync-catalog.mjs` affiche le rapport sans rien écrire.

### Contrôle automatique des durées

Chaque série porte un `tvmazeId`. `node scripts/check-data.mjs` compare les durées et le nombre d'épisodes de `data/mcu.json` à TVmaze et sort en erreur s'il y a un écart ; avec `--write`, il met à jour les durées et passe `verified` à `true` quand tous les épisodes ont une durée TVmaze. Le workflow `.github/workflows/data-check.yml` le lance le 1er de chaque mois (et à la demande dans l'onglet Actions) : un échec est signalé par GitHub. Il ne tourne pas sur les PR, pour qu'une panne de TVmaze ne bloque pas un merge.

### Installation, titre et police

Chrono-MCU est une application web installable (PWA) : sur Android (Chrome), menu ⋮ > « Installer l'application » ; sur iPhone (Safari), Partager > « Sur l'écran d'accueil » ; sur ordinateur (Chrome, Edge), icône d'installation dans la barre d'adresse. L'icône est le monogramme « CM » blanc sur rouge, dans la police du titre (source : `icons/icon.svg`, PNG générés par `npm run icons`). Un téléphone garde l'icône de l'installation : après un changement d'icône, désinstalle puis réinstalle l'application pour voir la nouvelle.

Le titre « Chrono-MCU » s'affiche en capitales condensées blanches sur un bloc rouge au coin chanfreiné, dans l'esprit d'un logo de franchise (un style, pas le logo Marvel ; l'application n'est pas officielle). La police est [Bebas Neue](https://github.com/dharmatype/Bebas-Neue) de Dharma Type (SIL Open Font License, texte dans `fonts/OFL.txt`), réduite aux caractères utiles et servie depuis le site (`fonts/bebas-neue-subset.woff2`, autorisée par la CSP `font-src 'self'`).

### Affiches

Le champ optionnel `poster` (chemin TMDB, ex. `/abc123.jpg`) ajoute une affiche à chaque titre ; `tmdbId` garde l'identifiant TMDB. Sans affiche, l'app s'affiche comme avant (la case « Afficher les affiches » et la mention TMDB n'apparaissent que s'il y en a). Une image qui ne charge pas disparaît sans casser la ligne.

Pour remplir les affiches (clé API v3 gratuite sur themoviedb.org, réseau ouvert vers `api.themoviedb.org`) :

```
TMDB_API_KEY=ta_clé node scripts/fetch-posters.mjs          # ajoute les affiches manquantes
TMDB_API_KEY=ta_clé node scripts/fetch-posters.mjs --dry    # essai à blanc
TMDB_API_KEY=ta_clé node scripts/fetch-posters.mjs --force  # refait toutes les affiches
TMDB_API_KEY=ta_clé node scripts/fetch-posters.mjs --details # ajoute images paysage, dates de sortie France des films, résumés et titres d'épisodes en français (`titleFr`)
```

Derrière un proxy d'entreprise ou de session cloud, ajoute `NODE_USE_ENV_PROXY=1` (Node 22.21+) devant la commande.

`backdrop` (image paysage TMDB) alimente l'en-tête des fiches en feuille ; `releaseDateFr` (films) est la sortie salle en France, affichée à la place de `releaseDate` (sortie d'origine, qui sert au tri « Sortie ») ; chaque épisode porte un `airDate` (date de diffusion d'origine, TVmaze), rempli et contrôlé par `node scripts/check-data.mjs --write`. Les saisons (« Loki (saison 2) ») prennent l'affiche de la saison quand TMDB en a une. Le script préfère le titre exact et écarte les making-of et podcasts, mais relis le résultat : une recherche par titre peut encore se tromper, corrige `poster` et `tmdbId` à la main si besoin. Les affiches restent la propriété de leurs ayants droit ; elles sont chargées depuis TMDB, jamais copiées dans le dépôt.

### Déploiement

GitHub Pages impose un cache navigateur de 10 minutes sur tous les fichiers. Pour que chaque déploiement soit vu tout de suite, le workflow remplace le marqueur `__BUILD__` (présent dans `index.html`, `js/app.js` et `js/store.js`) par l'identifiant du commit : les fichiers sont alors demandés avec `?v=<commit>`. La version déployée s'affiche en bas de la page. En local, le marqueur reste tel quel et la page indique « Version locale ».

Le workflow `.github/workflows/pages.yml` lance les tests, puis déploie sur GitHub Pages à chaque push sur `main`. À activer une fois dans Settings > Pages > Source : GitHub Actions.
