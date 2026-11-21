# Chrono-MCU — règles du projet

## Règles communes (le même bloc dans tous les dépôts d'Antoni, existants et futurs : le modifier ici, c'est le modifier partout)

Décidées par Antoni le 16/11/2026, mises à jour le 21/11/2026. Les règles propres à ce dépôt suivent ce bloc ; en cas de conflit, ce bloc l'emporte.

- **Avec Antoni** : français, tutoiement, réponses courtes, franches, sans flatterie. Il est seul utilisateur (Galaxy S26 Ultra, PC Windows).
- **Proposer d'abord** : présenter un plan détaillé (étapes, fichiers touchés, approche) et ses propres suggestions d'amélioration, attendre un « ok » explicite avant de toucher quoi que ce soit, ne jamais régénérer un fichier de son propre chef. « Pose des questions » veut dire `AskUserQuestion`, avec des choix concrets et un recommandé. Pour une nouvelle fonctionnalité ou une modification de fonctionnalité ou de design : proposer sans coder, poser des questions si besoin et proposer des visuels (maquette HTML simple sans canvas, ou schéma ASCII).
- **Fusion** : PR en brouillon, fusion par squash **seulement sur le « go » d'Antoni**, CI verte. Jamais de fusion de sa propre initiative, même verte.
- **Branche** : celle que la session impose. Aucun nom de branche n'est écrit dans ce dépôt : l'environnement le change à chaque session.
- **Identité de commit** : `AntoniMan31 <268696974+antoniman31@users.noreply.github.com>`. Jamais l'adresse personnelle d'Antoni : GitHub refuse le push qui l'expose.
- **Noms de modèle** : autorisés (ligne de co-auteur des commits comprise).
- **Secrets** : jamais de clé, de jeton ni de mot de passe dans le dépôt ou la conversation ; ils se saisissent dans l'application ou dans les secrets GitHub/Cloudflare. Jamais d'export de données personnelles ni de `.env` commité.
- **Tests** : le lint et les tests du dépôt passent avant chaque commit. Un test ne compte qu'après l'avoir **vu échouer** sur le code d'avant. Jamais affaiblir un contrôle pour obtenir du vert (test sauté, seuil baissé, exception sans raison écrite).
- **CI, trois niveaux** : *rapide* (lint, tests unitaires, données) à chaque PR ; *lourd* (navigateur, e2e, Windows, compilation Android) seulement si la PR touche autre chose que des `.md`, sinon le job est marqué « sauté », jamais retiré ; *appareil réel* : une PR qui touche l'interface finit par une courte liste « à vérifier sur le S26 ou le PC ». Sur `main`, tout tourne toujours. Une seule CI par PR. Un test qui échoue au hasard a droit à une relance, puis on en cherche la cause.
- **Interface** : de vrais boutons (jamais un `div` cliquable) ; dans une appli utilisée au doigt, **zones tactiles d'au moins 48 px** (48 dp sous Android) ; contraste et focus vérifiés par l'outil du dépôt.
- **Robustesse** : une écriture qui peut échouer (stockage, réseau) se voit à l'écran ; toute donnée venue d'un fichier, du stockage ou du réseau est une entrée non fiable. Exporter les données avant toute opération destructive.
- **Versions et API** : vérifier dans la doc officielle les versions à jour avant d'utiliser une librairie ou une API ; jamais de code déprécié sans le signaler.
- **Contradiction** : si une demande contredit une règle de ce fichier, le signaler avant d'appliquer.
- **Écrit** : commentaires en français qui disent **pourquoi** ; aucun chiffre écrit sans l'avoir mesuré ; ne jamais écrire « ça marche » pour ce qui n'a pas tourné sur l'appareil réel.
- **Suivi, trois fichiers à la racine** : `README.md` dit l'**état actuel** ; `JOURNAL.md` garde l'**histoire** (chaque lot s'y ajoute en fin de fichier, sous `### Titre — jj/mm/aaaa`) ; `RESTE-A-FAIRE.md` dit **ce qui reste**, mis à jour à chaque lot. Un fichier de suivi retiré part en entier dans `JOURNAL.md`, sous « Ancien X.md ».

## Règles propres à ce dépôt

Suivi de visionnage du MCU : HTML, CSS et JavaScript en modules ES, **sans build ni dépendance d'exécution**, publié sur
GitHub Pages. Données dans `data/mcu.json` et `data/sagas.json`, progression dans le `localStorage` (`chrono-mcu:v1`).
Ce qui reste à faire : `RESTE-A-FAIRE.md` (l'audit, statut par point). L'état : `README.md` et `SPEC.md`. L'histoire : `JOURNAL.md`.

## Commandes (toutes avant un commit)

- `npm run lint` (oxlint, aucun avertissement toléré), `npm test`, `npm run validate`.
- `npm run e2e` : chaque écran dans 3 thèmes et 3 largeurs (axe-core, cibles tactiles, clavier), puis les parcours.
  Il faut le Chromium de la version de Playwright du `package.json` ; la CI le joue de toute façon, et `main` exige `test` et `e2e` (`e2e` est sauté, donc compté réussi, sur une PR qui ne
  touche que des `.md`).

## Pièges connus

- Tout fichier de `js/`, `css/` et `data/` se demande avec `?v=__BUILD__`, remplacé au déploiement par le commit. Un nouveau
  module va dans `VERSIONED` de `sw.js` **et** dans les `modulepreload` d'`index.html` ; `tests/sw.test.js` et
  `tests/preload.test.js` refusent l'oubli.
- La CSP d'`index.html` interdit tout style en attribut et tout script inline sauf celui du thème (empreinte SHA-256) :
  modifier ce script impose de recalculer l'empreinte (`tests/csp.test.js`).
- Les PR du robot de synchronisation du catalogue passent par la même CI ; ne jamais fusionner une donnée `verified: false` sans relecture.

## Conventions

- Textes de l'interface courts, en français.
- La reprise d'un état enregistré ou importé passe par `js/recovery.js` et `js/backup.js` (entrées non fiables).
