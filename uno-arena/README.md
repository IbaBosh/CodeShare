# UNO Arena

UNO Arena est une application web responsive de jeu de cartes, en français, avec trois modes : solo contre des bots (facile, moyen, difficile), hot-seat sur un même appareil et salons privés multijoueurs en temps réel via Socket.IO.

> Projet indépendant de démonstration. Il n'est pas affilié à Mattel. Les cartes sont dessinées en CSS/SVG natif et le jeu n'utilise pas les illustrations officielles. Les règles de cumul des +2 et +4 sont une variante maison activée dans ce projet.

## Fonctionnalités

- 2 à 6 joueurs et paquet de 108 cartes.
- 7 cartes par joueur, pioche, défausse, changement de couleur, inversion, passe-tour, +2, joker et +4.
- Cumul des pénalités +2 / +4, annonce UNO et interception UNO (+2).
- Bots avec trois profils : aléatoire, stratégie de couleur et stratégie plus agressive.
- Mode local hot-seat avec affichage de la main du joueur actif.
- Salons en ligne avec code à 5 caractères, hôte, limite de joueurs et synchronisation temps réel.
- Les mains adverses ne sont jamais transmises au navigateur : le serveur ne renvoie que les compteurs de cartes des autres joueurs.
- Animations adaptées aux écrans mobiles, prise en charge de `prefers-reduced-motion`, retour sonore activable par l'utilisateur.
- Endpoint de santé `GET /health`.

## Lancer en local

Prérequis : Node.js 20 ou supérieur.

```bash
npm install
npm start
```

Ouvre ensuite `http://localhost:3000`.

Pour le développement avec redémarrage automatique :

```bash
npm run dev
```

Pour vérifier la syntaxe et les règles :

```bash
npm run check
npm test
```

## Déploiement Render

- Runtime : Node.
- Build command : `npm install`.
- Start command : `npm start`.
- Health check path : `/health`.
- Région recommandée : Frankfurt pour une audience principalement européenne.

Le serveur est sans état persistant : les salons vivent en mémoire et disparaissent lors d'un redémarrage ou d'un déploiement. Les joueurs doivent alors recréer ou rejoindre un salon. Pour un lancement à grande échelle, remplacer le stockage en mémoire par Redis et un adaptateur Socket.IO partagé.

## Structure

```text
uno-game/
├── assets/audio/       # six fichiers audio MP3
├── game/engine.js      # moteur de règles commun au serveur
├── public/
│   ├── index.html      # interface
│   ├── style.css       # design responsive
│   ├── app.js          # interface et client Socket.IO
│   └── engine.js       # moteur exposé au navigateur
├── tests/engine.test.js
├── server.js           # Express + Socket.IO
├── package.json
└── README.md
```

## Audio

Les six fichiers utilisés par l'application sont dans `assets/audio/`. Deux rendus ElevenLabs (musique de 45 s et son de pose de carte de 2 s) ont été générés. Les rendus restants et le transfert des MP3 signés vers ce runtime ont été bloqués par la saturation du quota gratuit et l'accès réseau aux URL temporaires ; les six chemins locaux sont donc fournis par des sons originaux de secours synthétisés et documentés dans `assets/audio/README.md`.

## Sécurité et limites

- Vérification des actions côté serveur : tour actif, identifiant de carte, couleur choisie, cumul de pénalité et joueur autorisé.
- Les IDs de joueurs sont ceux de la connexion Socket.IO ; le client ne peut pas sélectionner l'identité d'un joueur dans une action.
- Validation des codes de salon et nettoyage des pseudos.
- Taille maximale des messages Socket.IO limitée et limitation de fréquence par connexion.
- Origines Socket.IO same-origin par défaut ; définir `ALLOWED_ORIGIN` avec les origines autorisées, séparées par des virgules, en cas de frontend hébergé séparément.
- Pas de comptes utilisateurs, de persistance ou de protection anti-triche sophistiquée ; les salons sont privés par code mais pas chiffrés de bout en bout.
