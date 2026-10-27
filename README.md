# Chrono-MCU

Suivi de visionnage du MCU (films et séries Disney+), façon Chronogeek. Application web statique : pas de compte, pas de serveur. Ta progression reste dans ton navigateur (`localStorage`).

## Fonctions

- Cocher films et épisodes ; cocher une série coche tous ses épisodes.
- Deux ordres : chronologique (ordre Disney+) ou date de sortie. Changer d'ordre ne touche pas à la progression.
- Progression globale et par phase, filtres par phase et type.
- « Prochain à voir » et « Je reprends » (suite de ta dernière coche).
- Notes (1 à 5 étoiles + commentaire) par titre.
- Statistiques : heures vues et restantes, rythme, date de fin estimée (disponible après 2 jours d'usage).
- Export / import JSON de la progression (sauvegarde, changement d'appareil).

## Lancer en local

```
python3 -m http.server 8000   # puis http://localhost:8000
npm test                      # tests unitaires (Node 22+)
npm run validate              # vérifie data/mcu.json
```

## Corriger ou compléter les données

Tout le catalogue est dans `data/mcu.json`. Chaque entrée a un champ `verified` : `false` signifie que je n'ai pas pu garantir la donnée (ordre chronologique après Endgame, titres et durées d'épisodes, séries récentes). Un badge « à vérifier » s'affiche dans l'app.

Pour corriger : éditer l'entrée, passer `verified` à `true`, puis lancer `npm run validate`. Règles :

- `id` unique et stable (la progression est stockée avec cet id : le changer perd les coches) ;
- `chronoOrder` unique par titre ;
- film : `runtimeMin` obligatoire ; série : `episodes` (`n` de 1 à N, `title`, `runtimeMin`).

Les sorties postérieures à ma dernière connaissance ne sont pas toutes listées : à ajouter à la main.

## Déploiement

Le workflow `.github/workflows/pages.yml` lance les tests, puis déploie sur GitHub Pages à chaque push sur `main`. À activer une fois dans Settings > Pages > Source : GitHub Actions.

## Spécification et plan

Voir `SPEC.md` et `tasks/`.
