# Chrono-MCU

Suivi de visionnage du MCU (films et séries Disney+), façon Chronogeek. Application web statique : pas de compte, pas de serveur. Ta progression reste dans ton navigateur (`localStorage`).

## Fonctions

- Cocher films et épisodes ; cocher une série coche tous ses épisodes ; cocher une phase coche tous ses titres (case dans la barre de progression et en-tête de groupe dans la liste, option « Grouper par phase »).
- Deux ordres : chronologique (ordre Disney+) ou date de sortie. Changer d'ordre ne touche pas à la progression.
- Progression globale et par phase, filtres par phase et type.
- « Prochain à voir » et « Je reprends » (suite de ta dernière coche).
- Notes (1 à 5 étoiles + commentaire) par titre.
- Statistiques : heures vues et restantes, rythme, date de fin estimée (disponible après 2 jours d'usage).
- Indicateur de scènes mi-générique / post-générique par film (sans description, donc sans spoiler).
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

Les durées d'épisodes varient de quelques minutes selon les sources (avec ou sans générique) : elles sont indicatives. Encore à vérifier (durées issues de fuites ou estimées) : WandaVision, Falcon, Loki 2, What If 2 et 3, Daredevil 1 et 2, Wonder Man, VisionQuest, Your Friendly Neighborhood Spider-Man, I Am Groot 2, The Punisher: One Last Kill.

Les titres pas encore sortis portent `"upcoming": true` (sans `runtimeMin` ni `episodes`). Ils s'affichent « à venir » et ne comptent pas dans la progression. À leur sortie : retirer `upcoming`, ajouter durée ou épisodes.

Pour corriger : éditer l'entrée, passer `verified` à `true`, puis lancer `npm run validate`. Règles :

- `id` unique et stable (la progression est stockée avec cet id : le changer perd les coches) ;
- `chronoOrder` unique par titre ;
- `postCredits` (films) : tableau de `"mid"` / `"end"` ; `[]` = aucune scène ; champ absent = inconnu (aucun badge) ;
- film : `runtimeMin` obligatoire ; série : `episodes` (`n` de 1 à N, `title`, `runtimeMin`).

Les sorties annoncées après octobre 2026 ne sont pas listées : à ajouter à la main.

## Déploiement

Le workflow `.github/workflows/pages.yml` lance les tests, puis déploie sur GitHub Pages à chaque push sur `main`. À activer une fois dans Settings > Pages > Source : GitHub Actions.

## Spécification et plan

Voir `SPEC.md` et `tasks/`.
