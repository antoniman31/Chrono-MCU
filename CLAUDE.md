# Chrono-MCU — règles du projet

Suivi de visionnage du MCU : HTML, CSS et JavaScript en modules ES, **sans build ni dépendance d'exécution**, publié sur
GitHub Pages. Données dans `data/mcu.json` et `data/sagas.json`, progression dans le `localStorage` (`chrono-mcu:v1`).
Ce qui reste à faire : `docs/AUDIT.md` (statut par point). L'état des fonctions : `README.md`.

## Commandes (toutes avant un commit)

- `npm run lint` (oxlint, aucun avertissement toléré), `npm test`, `npm run validate`.
- `npm run e2e` : chaque écran dans 3 thèmes et 3 largeurs (axe-core, cibles tactiles, clavier), puis les parcours.
  Il faut le Chromium de la version de Playwright du `package.json` ; la CI le joue de toute façon, et `main` exige `test` et `e2e`.

## Pièges connus

- Tout fichier de `js/`, `css/` et `data/` se demande avec `?v=__BUILD__`, remplacé au déploiement par le commit. Un nouveau
  module va dans `VERSIONED` de `sw.js` **et** dans les `modulepreload` d'`index.html` ; `tests/sw.test.js` et
  `tests/preload.test.js` refusent l'oubli.
- La CSP d'`index.html` interdit tout style en attribut et tout script inline sauf celui du thème (empreinte SHA-256) :
  modifier ce script impose de recalculer l'empreinte (`tests/csp.test.js`).
- Les PR du robot de synchronisation du catalogue passent par la même CI ; ne jamais fusionner une donnée `verified: false` sans relecture.

## Conventions

- Commentaires en français qui disent **pourquoi**. Textes de l'interface courts, en français.
- Une écriture qui peut échouer (stockage, réseau) se voit à l'écran.
- Toute donnée venue d'un fichier importé ou du stockage est une entrée non fiable (`js/recovery.js`, `js/backup.js`).
- Proposer d'abord, attendre un « ok » explicite d'Antoni avant de modifier quoi que ce soit.
- Jamais de clé (TMDB, jeton GitHub) dans le dépôt ni dans une conversation.
