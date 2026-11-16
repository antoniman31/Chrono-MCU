# Sécurité

Application personnelle, sans serveur ni compte : la progression reste dans le `localStorage` de l'appareil.

**Signaler un problème** : ouvrir une issue sans détail exploitable, ou passer par « Report a vulnerability » (onglet Security du dépôt).

**Le jeton GitHub** (Réglages > Catalogue, facultatif) sert seulement à lancer la synchronisation du catalogue. Il est gardé
dans le `localStorage`, hors export. Ce stockage est lisible par tout script de la page : c'est acceptable ici parce que la
politique de sécurité du contenu (CSP) n'autorise que les scripts du site, et parce que le jeton doit être un jeton
« fine-grained » limité à ce dépôt, avec le seul droit « Actions : lecture et écriture ». Un jeton plus large ne doit jamais
y être collé. « Retirer le jeton » l'efface de l'appareil ; le révoquer se fait sur GitHub.
