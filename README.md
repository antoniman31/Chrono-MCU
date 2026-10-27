# Chrono-MCU

Suivi de visionnage du MCU (films et séries Disney+), façon Chronogeek. Application web statique : pas de compte, pas de serveur. Ta progression reste dans ton navigateur (`localStorage`).

## Fonctions

- Cocher films et épisodes ; cocher une série coche tous ses épisodes ; cocher une phase coche tous ses titres (case dans la barre de progression et en-tête de groupe dans la liste, option « Grouper par phase »). Chaque phase se replie / se déplie avec un chevron, et l'état est conservé ; une recherche déplie tout ce qui correspond.
- Deux ordres : chronologique (ordre Disney+) ou date de sortie. Changer d'ordre ne touche pas à la progression.
- Progression globale et par phase, filtres par phase et type.
- « Prochain à voir » et « Je reprends » (suite de ta dernière coche).
- Notes (1 à 5 étoiles + commentaire) par titre.
- Statistiques : heures vues et restantes, rythme, date de fin estimée (disponible après 2 jours d'usage).
- Recherche par titre ou par épisode (insensible aux accents), case « Masquer les terminés », bouton « Annuler » (8 secondes) après chaque coche.
- Badge « autre réalité » pour les titres hors de la timeline principale (What If, Marvel Zombies, Your Friendly Neighborhood Spider-Man).
- Indicateur de scènes mi-générique / post-générique par film (sans description, donc sans spoiler), recoupé avec la [liste Wikipedia des scènes du MCU](https://en.wikipedia.org/wiki/Mid-credits_and_post-credits_scenes_in_the_Marvel_Cinematic_Universe).
- Export / import JSON de la progression (sauvegarde, changement d'appareil).

## Lancer en local

```
python3 -m http.server 8000   # puis http://localhost:8000
npm test                      # tests unitaires (Node 22+)
npm run validate              # vérifie data/mcu.json
```

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

## Affiches

Le champ optionnel `poster` (chemin TMDB, ex. `/abc123.jpg`) ajoute une affiche à chaque titre ; `tmdbId` garde l'identifiant TMDB. Sans affiche, l'app s'affiche comme avant (la case « Afficher les affiches » et la mention TMDB n'apparaissent que s'il y en a). Une image qui ne charge pas disparaît sans casser la ligne.

Pour remplir les affiches (clé API v3 gratuite sur themoviedb.org, réseau ouvert vers `api.themoviedb.org`) :

```
TMDB_API_KEY=ta_clé node scripts/fetch-posters.mjs          # ajoute les affiches manquantes
TMDB_API_KEY=ta_clé node scripts/fetch-posters.mjs --dry    # essai à blanc
TMDB_API_KEY=ta_clé node scripts/fetch-posters.mjs --force  # refait toutes les affiches
```

Derrière un proxy d'entreprise ou de session cloud, ajoute `NODE_USE_ENV_PROXY=1` (Node 22.21+) devant la commande.

Les saisons (« Loki (saison 2) ») prennent l'affiche de la saison quand TMDB en a une. Le script préfère le titre exact et écarte les making-of et podcasts, mais relis le résultat : une recherche par titre peut encore se tromper, corrige `poster` et `tmdbId` à la main si besoin. Les affiches restent la propriété de leurs ayants droit ; elles sont chargées depuis TMDB, jamais copiées dans le dépôt.

## Déploiement

Le workflow `.github/workflows/pages.yml` lance les tests, puis déploie sur GitHub Pages à chaque push sur `main`. À activer une fois dans Settings > Pages > Source : GitHub Actions.

## Spécification et plan

Voir `SPEC.md` et `tasks/`.
