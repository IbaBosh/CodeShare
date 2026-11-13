# Sécurité — UNO Arena

## Mesures appliquées

- Le serveur est l'autorité pour les salons en ligne et applique les règles de tour, la validité de la carte, les effets de pénalité et les choix de couleur.
- Les actions identifient le joueur à partir du socket connecté, jamais à partir d'un identifiant de joueur transmis par le navigateur.
- `publicState()` transmet la main uniquement au joueur destinataire ; les autres joueurs ne reçoivent que leur nombre de cartes et les informations publiques.
- Les pseudos sont bornés à 18 caractères et les caractères de contrôle / chevrons sont supprimés. Les pseudos sont injectés côté navigateur avec `textContent`.
- Les codes de salon sont validés et les salons sont plafonnés à six joueurs.
- Taille maximale des messages Socket.IO : 16 Kio (16 384 octets). Limitation de fréquence par connexion.
- Les connexions Socket.IO sont limitées à l'origine du service, sauf origines explicitement ajoutées dans `ALLOWED_ORIGIN`.
- Aucun secret ou jeton n'est stocké dans le code client.

## Limites résiduelles avant une mise en production ouverte

- Pas de compte ni d'authentification : le code du salon sert de secret d'invitation. Ne partage-le qu'avec les personnes invitées.
- La limitation de fréquence est locale à chaque socket ; une défense robuste contre les attaques distribuées nécessiterait un limiteur partagé et une surveillance au niveau de la plateforme.
- Les salons et les parties sont conservés en mémoire. Un redémarrage détruit les sessions ; plusieurs instances exigeraient Redis et l'adaptateur Socket.IO correspondant.
- Pas de mécanisme anti-triche sophistiqué, de reprise après déconnexion ou de modération des pseudos.
- L'audit des dépendances npm en ligne n'a pas pu être exécuté dans l'environnement de construction, car l'accès au registre npm a échoué par résolution DNS (`EAI_AGAIN`). Exécuter `npm audit` dans un environnement réseau avant un lancement public.

## Configuration recommandée

- Héberger uniquement derrière HTTPS.
- Définir `ALLOWED_ORIGIN` avec les origines exactes du site, séparées par des virgules, si le frontend est hébergé séparément.
- Ajouter une authentification, un limiteur de tentatives de codes partagé et une politique de rétention si le jeu est ouvert au public.
