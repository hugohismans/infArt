# Galerie Infinie

Un musée infini, explorable à la première personne sur PC et sur mobile. Le bâtiment se génère devant le visiteur et s'efface derrière lui : si l'on fait demi-tour, on ne retrouve jamais le chemin d'origine.

**Version en ligne** : https://hugohismans.github.io/infArt/

## État : phase 1, prototype du couloir infini

- Couloirs droits (trois longueurs), virages à gauche et à droite, impasses.
- Génération devant le visiteur et destruction derrière lui, étalées sur plusieurs frames, avec libération explicite de la mémoire GPU.
- Espace non euclidien : un nouveau module ne doit chevaucher aucun module *chargé*, mais il peut réoccuper l'espace d'un module déjà détruit.
- Œuvres factices : compositions abstraites générées sur canvas, cadres, halos de lumière.
- Contrôles PC (ZQSD/WASD, souris en pointer lock, Maj) et mobile (joystick virtuel, glisser pour regarder).
- Marche contemplative automatique, option « réduire les mouvements », panneau de debug.

## Commandes

| | PC | Mobile |
|---|---|---|
| Marcher | ZQSD (AZERTY) / WASD (QWERTY), ↑ ↓ | joystick (moitié gauche de l'écran) |
| Regarder | souris (cliquer pour capturer), ← → | glisser sur la moitié droite |
| Courir | Maj | pousser le joystick jusqu'au bout |
| Menu | Échap | bouton ☰ |
| Debug | F3 ou ² | menu → Panneau de debug |

Le clavier est lu par **position physique** des touches (`KeyboardEvent.code`) : ZQSD en AZERTY et WASD en QWERTY fonctionnent sans détection de disposition.

### Paramètres d'URL

- `?seed=abcd-1234` : visite reproductible et partageable.
- `&autostart=1` : entre directement sans passer par l'accueil.
- `&autowalk=1` : marche automatique.
- `&debug=1` : affiche le panneau de debug.
- `&timescale=3` : accélère la simulation (tests).

## Comment ça marche

### Graphe, pas grille
Chaque module ne connaît que ses voisins (`src/world/WorldModule.ts`). Le placement se fait en raccordant l'entrée d'un nouveau module à une ouverture libre (`src/world/World.ts`).

### Visibilité à 360°
Un module n'est détruit que s'il est **invisible depuis la position du joueur, dans toutes les directions**. Le calcul se fait par « portails », en vue de dessus (`src/world/visibility.ts`) :

- on part du module du joueur et on traverse les ouvertures en rétrécissant le cône de vision à chaque passage ;
- on teste aussi des points répartis sur deux anneaux autour du joueur, à condition qu'ils soient atteignables sans traverser de mur, pour anticiper ses prochains pas ;
- un module doit rester invisible plusieurs vérifications d'affilée avant d'être détruit.

Une ouverture vide qui devient potentiellement visible est comblée d'urgence, au-delà du brouillard. Le compteur `pop-in` du panneau de debug relève les apparitions perceptibles : il doit rester à 0.

### Mémoire
- Les géométries et les matériaux sont partagés par type de module, avec un compteur de références (`src/world/resources.ts`).
- Seules les textures et les matériaux propres aux œuvres sont détenus par le module, et libérés à sa destruction.
- L'origine du monde est recentrée régulièrement pour garder une bonne précision des coordonnées après des heures de marche.

### Réglages
Toutes les constantes de ressenti (vitesse, hauteur des yeux, balancement, rayons de génération, densité d'œuvres…) sont dans **`src/config.ts`**. Les ambiances sont des presets de données dans `src/ambiances/presets/`.

## Développement

```bash
npm install
npm run dev        # serveur de développement (accessible sur le réseau local)
npm run build      # vérification des types + build de production dans dist/
npm run test:leak  # test de fuite mémoire (après build), 10 min par défaut
```

Le test de fuite lance le build dans Chromium sans écran, active la marche automatique et relève régulièrement les géométries, les textures, le nombre de modules et le tas JS. Il échoue si ces valeurs dérivent ou si une apparition perceptible est détectée. Variables utiles : `LEAK_MINUTES`, `LEAK_TIMESCALE`, `LEAK_SEED`.

Le déploiement sur GitHub Pages se fait automatiquement à chaque push sur `main` (`.github/workflows/deploy.yml`).

## Feuille de route

1. ~~Prototype de couloir infini~~ (en cours de validation)
2. Vraies œuvres : Worker Cloudflare, adaptateurs de musées, cartels, fiche détaillée
3. Embranchements : T, carrefours, salles, escaliers
4. Ambiances et Directeur
5. Plus de sources : affiches, jaquettes, pochettes, livres
6. Décors procéduraux et son
7. Toutes les ambiances et étrangetés
8. Finitions
