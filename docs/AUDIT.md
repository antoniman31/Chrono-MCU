# Audit de Chrono-MCU

Audit complet du 28/10/2026 (tests, couverture, données comparées à TVmaze, relecture du code et de la CI, scénarios reproduits dans un navigateur). Classé par priorité : gravité × probabilité. Effort : S = moins d'une heure, M = une PR moyenne, L = plusieurs PR.

Statuts : **à faire**, **en cours**, **fait** (avec la PR).

## Hyper urgent

| # | Sujet | Effort | Statut |
|---|---|---|---|
| 1 | **Perte silencieuse de la progression** (corrigé) si l'état enregistré est invalide : l'application repartait de zéro sans prévenir et la 1re coche écrasait tout, sans copie. À faire : réparer ce qui peut l'être, garder une copie brute, prévenir et permettre de la télécharger ; idem pour des données d'une version plus récente. | M | fait (#63) |

## Urgent

| # | Sujet | Effort | Statut |
|---|---|---|---|
| 2 | **Aucun filet d'erreur global** : pas de `onerror` ni `unhandledrejection`, pas de `<noscript>` ; un module qui plante donne une page blanche. | S | fait (#64) |
| 3 | **Message d'erreur du catalogue** mêlant français et anglais (« Failed to fetch »). | S | fait (#64) |
| 4 | **Clé TMDB** collée en clair dans une conversation : à régénérer par précaution (action de Antoni). Elle n'est pas dans le dépôt. | S | fait (Antoni, 28/10/2026) |
| 5 | **PR du robot de synchronisation** : la CI ne se lance pas, donc avec la protection de `main` elles sont bloquées (contournement : fermer puis rouvrir la PR). À automatiser dans le workflow. | S | fait (#65) |

## Important

| # | Sujet | Effort | Statut |
|---|---|---|---|
| 6 | **Sagas** : `sync-catalog.mjs` met `saga: 'multiverse'` en dur sur les brouillons ; succès et catégories de saga codés pour deux sagas. À faire avant la phase 7. | M | fait (#66) |
| 7 | **Les audits ne couvrent pas tous les états** (le contraste raté de « Dans les temps » n'a été vu que par hasard) : objectif en bonne voie, import en erreur, synchronisation, bandeaux, états vides. | M | fait (#67) |
| 8 | **Tests e2e instables** : 2 échecs en une journée (clics forcés dépendant du défilement). Surveiller et fiabiliser. Fiabilisé : attentes sur l'état, plus de clics forcés ; un vrai défaut de resynchronisation de l'onglet de phase corrigé. | S–M | fait (#69) |
| 9 | **Sauvegarde incomplète** : l'export oublie l'objectif de date, le thème, les dates de déblocage des succès (le jeton GitHub en est exclu volontairement). | M | fait (#69) |
| 10 | **Accessibilité** : rien pour le mode contraste élevé de Windows (`forced-colors`, `prefers-contrast`), états sélectionnés uniquement par la couleur ; cibles tactiles de 44 px alors que le README annonce 48 px. | M | fait (#69) |
| 11 | **Données** : 27 titres sur 67 sans personnages ; 26 épisodes sans titre français ; The Punisher sans info sur les scènes post-générique ; VisionQuest à vérifier (tâche planifiée le 11/11). Résultat : les 27 titres sans personnage sont presque tous normaux (la liste de `heroes.js` ne couvre que 13 personnages et 2 équipes) ; seul Captain America : Brave New World recevait un personnage. Titres français d'épisodes : aucune source fiable trouvée, ils restent affichés en anglais. The Punisher : One Last Kill n'a aucune scène post-générique (3 sources concordantes). | M | fait (#69) |

## Moyen

| # | Sujet | Effort | Statut |
|---|---|---|---|
| 12 | **Couverture** : l'interface (`app.js`, `ui/*`) n'est vérifiée que par les e2e, non mesurés ; scripts réseau à 33–59 %. | M | à faire |
| 13 | **CSP** : `style-src-attr 'unsafe-inline'` ne sert qu'à 3 attributs `style`, remplaçables. | S | fait (#71) |
| 14 | **Vie privée** : affiches TMDB chargées par défaut (l'IP part chez TMDB) ; un réglage permet de les couper. | S | à faire |
| 15 | **Performance de 1re visite** : chaîne d'imports de 7 niveaux, sans `modulepreload` (le total est petit : 82 Ko gzip). | S | à faire |
| 16 | **Mise à jour du service worker silencieuse** : pas d'annonce « nouvelle version ». | S | fait (#71) |
| 17 | **Jeton GitHub** en `localStorage` : limité au dépôt et protégé par la CSP stricte, acceptable ; à documenter. | S | à faire |

## Faible

| # | Sujet | Effort | Statut |
|---|---|---|---|
| 18 | **PWA** : manifest minimal (pas d'`id`, `categories`, `shortcuts`, `screenshots`) ; icône maskable identique à l'icône normale. | S | à faire |
| 19 | **Dépôt** : pas de `LICENSE` ni `SECURITY.md` ; `tasks/todo.md` périmé ; branches mortes (`bot/catalog-sync-20261028-1117`, une branche Dependabot). | S | à faire |
| 20 | **Docs** : le `SPEC.md` liste encore affiches et scènes post-générique en « hors périmètre » ; 180 lignes de journal difficiles à maintenir. | M | à faire |
| 21 | **Code mort** : `heroLabel`, classes CSS `backup-actions`, `card-tonal`, `chips`, `t-label-lg`, `t-label-md`, `t-title-lg`, `t-title-md`, `settings-section` ; pas de linter. | S | à faire |
| 22 | **CSS** : jetons de couleur de thème dupliqués sur 6 blocs, risque d'oubli. | M | à faire |
| 23 | **Petits détails** : suivi du défilement actif sur les écrans Progression et Réglages ; `latestRun` compare l'horloge du navigateur à celle de GitHub ; `saveToken` échoue sans le dire ; dépôt écrit en dur dans `github.js`. | S | à faire |

## Fait

| # | Sujet | Statut |
|---|---|---|
| 24 | **Protection de `main`** : ruleset actif (PR obligatoire, `test` et `e2e` requis, pas de force push, personne n'est exempté). | fait |
| 25 | **Corrigés en cours de route** : contraste de « Dans les temps », test du mode sans spoiler instable, tests recopiant les noms de sagas. | fait |

## Non audité

Vrais iPhone et Android, lecteurs d'écran, Lighthouse, exactitude des dates et durées des films contre TMDB (seules les séries ont été comparées à TVmaze).

## Ordre retenu

1, puis 2 et 3 ensemble, puis 5, 6 et 7 ; terminé (PR #63 à #68), puis 8 à 11 (PR #69). Puis 13 et 16 (PR #71) et les personnages (PR #70). Restent les points 12, 14, 15, 17 à 23.
