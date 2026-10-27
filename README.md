# Chrono-MCU

Suivi de visionnage du MCU (films et séries Disney+), façon Chronogeek. Application web statique : pas de compte, pas de serveur. Ta progression reste dans ton navigateur (`localStorage`).

## Fonctions

L'interface suit Material 3 : une barre de navigation en bas sur téléphone (rail latéral dès 600 px), et dès 840 px un panneau de détail fixe à droite de la liste.

- **À voir** : onglets Tout / Films / Séries, recherche (titre ou épisode, sans accents), bouton « Filtres » (masquer les terminés, grouper par phase), barre des phases (onglets Toutes / Phase 1 à 6, défilants, avec le nom de la phase, sa saga et ses chiffres ; elle reste collée sous le titre, sauf sur un écran de moins de 560 px de haut), ordre chronologique ou de sortie. En haut, « Prochain à voir » : le titre (ou l'épisode) qui suit **le dernier que tu as coché** dans l'ordre choisi. Ce que tu as sauté avant n'est jamais rappelé ; sans historique, il propose le tout premier titre.
- **Fiche d'un titre** (bottom sheet sur téléphone, panneau à droite sur grand écran) : détails, scènes après le générique, résumé, bouton « Ignorer », et pour une série la liste des épisodes à cocher. Les épisodes dont la date de diffusion (américaine, le jour même) n'est pas encore arrivée sont exclus des totaux et du « Prochain à voir », et affichés « Sort le JJ/MM/AAAA » dans la fiche. Le bouton « ⋮ » d'une ligne ouvre un menu d'actions, dont « Tout marquer vu jusqu'ici » (rattrapage d'historique en un geste, annulable ; ces unités comptent dans les heures vues mais pas dans le rythme). Sur écran tactile, glisser une ligne vers la droite la marque vue (non vue si elle l'est déjà), vers la gauche l'ignore (réactive si elle est ignorée) ; le geste se valide au-delà de 40 % de la largeur et reste annulable. Dans la fiche, glisser un épisode vers la droite le marque vu.
- Cocher un film, un épisode, une série entière ou une phase entière ; chaque coche propose « Annuler » pendant 10 secondes.
- **Progression** : pourcentage global, barre par phase (avec case pour cocher la phase), heures vues et restantes, rythme et date de fin estimée (après 2 jours d'usage).
- **Réglages** : « Ce que je suis » (couper en bloc les séries, les courts formats, les autres réalités ou la saga du Multivers, avec le poids de chaque catégorie ; un titre précis se réintègre depuis son menu), thème Auto (suit le système), Clair ou Sombre, plus un interrupteur « Noir OLED » (noir pur) qui s'applique au mode sombre, y compris quand le thème est en Auto ; affiches, sauvegarde et restauration (export / import JSON), sources et version.
- Badges : « à vérifier », « autre réalité » (What If, Marvel Zombies, Your Friendly Neighborhood Spider-Man), scènes mi-générique / post-générique par film (recoupées avec la [liste Wikipedia des scènes du MCU](https://en.wikipedia.org/wiki/Mid-credits_and_post-credits_scenes_in_the_Marvel_Cinematic_Universe)).
- Accessibilité : cibles tactiles de 48 px, contrastes WCAG AA dans les trois thèmes, navigation au clavier, feuilles modales natives (focus piégé, Échap), texte qui suit la taille choisie dans le système, `prefers-reduced-motion` respecté.

## Lancer en local

```
python3 -m http.server 8000   # puis http://localhost:8000
npm test                      # tests unitaires (Node 22+)
npm run validate              # vérifie data/mcu.json
npm install && npx playwright install --only-shell chromium && npm run e2e   # accessibilité (axe-core), cibles tactiles, clavier, puis parcours de comportement
```

Le test `npm run e2e` (dépendances de développement seulement : `axe-core` et `playwright`) parcourt chaque écran et chaque feuille dans les 3 thèmes et 3 largeurs d'écran ; il tourne aussi dans la CI et bloque le déploiement en cas de régression.

## Corriger ou compléter les données

Tout le catalogue est dans `data/mcu.json` (phases 1 à 6, jusqu'à Avengers : Secret Wars). Chaque entrée a un champ `verified` : `true` quand dates, titres et durées sont recoupés avec des sources (TheTVDB, Apple TV, presse), `false` quand une partie reste estimée (durées d'épisodes approximatives, titres d'épisodes génériques « Épisode n », séries en cours). Un badge « à vérifier » s'affiche dans l'app.

L'ordre chronologique suit la frise publiée par le jeu de données ouvert [Marvel Archive](https://github.com/les2/marvel-screen-archive) (`timelineOrder`, métadonnées sous licence CC BY 4.0), complété à la main pour les titres qu'il ne place pas (Loki 2, What If 2 et 3, Eyes of Wakanda, Marvel Zombies, titres 2025-2026). Ce n'est pas une copie vérifiée de l'ordre affiché sur Disney+ : corrige `chronoOrder` si le tien diffère. Les titres d'épisodes de Daredevil, What If, Loki 2 et WandaVision ont été recoupés avec le catalogue [mcu-completionist-watchlist](https://github.com/CinematicArchivesHQ/mcu-completionist-watchlist).

Les durées d'épisodes viennent de [TVmaze](https://www.tvmaze.com) (une seule source, donc cohérente, mais elles peuvent différer de quelques minutes de ce qu'affiche Disney+ selon que le générique est compté), et celles des films de l'infobox de Wikipedia. Seule VisionQuest reste « à vérifier » : quatre de ses épisodes ne sont pas encore sortis et leurs durées viennent de fuites.

Les titres pas encore sortis portent `"upcoming": true` (sans `runtimeMin` ni `episodes`). Ils s'affichent « à venir » et ne comptent pas dans la progression. À leur sortie : retirer `upcoming`, ajouter durée ou épisodes.

Pour corriger : éditer l'entrée, passer `verified` à `true`, puis lancer `npm run validate`. Règles :

- `id` unique et stable (la progression est stockée avec cet id : le changer perd les coches) ;
- `chronoOrder` unique par titre ;
- `altUniverse` : `true` pour un titre situé dans une autre réalité (absent sinon) ;
- `postCredits` (films) : tableau de `"mid"` / `"end"` ; `[]` = aucune scène après le générique ; champ absent = inconnu (aucun badge) ;
- `tvmazeId` (séries) : identifiant TVmaze pour le contrôle des durées ;
- film : `runtimeMin` obligatoire ; série : `episodes` (`n` de 1 à N, `title`, `runtimeMin`).

Les sorties annoncées après octobre 2026 ne sont pas listées : à ajouter à la main.

## Contrôle automatique des durées

Chaque série porte un `tvmazeId`. `node scripts/check-data.mjs` compare les durées et le nombre d'épisodes de `data/mcu.json` à TVmaze et sort en erreur s'il y a un écart ; avec `--write`, il met à jour les durées et passe `verified` à `true` quand tous les épisodes ont une durée TVmaze. Le workflow `.github/workflows/data-check.yml` le lance chaque lundi (et à la demande dans l'onglet Actions) : un échec est signalé par GitHub. Il ne tourne pas sur les PR, pour qu'une panne de TVmaze ne bloque pas un merge.

## Titre et police
Le titre « Chrono-MCU » s'affiche en capitales condensées blanches sur un bloc rouge au coin chanfreiné, dans l'esprit d'un logo de franchise (un style, pas le logo Marvel ; l'application n'est pas officielle). La police est [Bebas Neue](https://github.com/dharmatype/Bebas-Neue) de Dharma Type (SIL Open Font License, texte dans `fonts/OFL.txt`), réduite aux caractères utiles et servie depuis le site (`fonts/bebas-neue-subset.woff2`, autorisée par la CSP `font-src 'self'`).

## Affiches

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

## Déploiement

GitHub Pages impose un cache navigateur de 10 minutes sur tous les fichiers. Pour que chaque déploiement soit vu tout de suite, le workflow remplace le marqueur `__BUILD__` (présent dans `index.html`, `js/app.js` et `js/store.js`) par l'identifiant du commit : les fichiers sont alors demandés avec `?v=<commit>`. La version déployée s'affiche en bas de la page. En local, le marqueur reste tel quel et la page indique « Version locale ».

Le workflow `.github/workflows/pages.yml` lance les tests, puis déploie sur GitHub Pages à chaque push sur `main`. À activer une fois dans Settings > Pages > Source : GitHub Actions.

## Spécification et plan

Voir `SPEC.md` et `tasks/`.
