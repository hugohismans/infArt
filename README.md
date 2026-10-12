# Galerie Infinie

Un musée infini, explorable à la première personne sur PC et sur mobile. Le bâtiment se génère devant le visiteur et s'efface derrière lui : si l'on fait demi-tour, on ne retrouve jamais le chemin d'origine.

**Version en ligne** : https://hugohismans.github.io/infArt/

## État : phase 4, ambiances et Directeur

### Ambiances
Chaque ambiance est un preset de données (`src/ambiances/presets/`) : dimensions, couleurs, motifs (murs, plafond, sol), brouillard, lumière, mobilier, style de cadres, types d'œuvres préférés, poids des modules, rareté, tension et affinités. Ajouter une ambiance = écrire un preset et l'inscrire dans `src/ambiances/index.ts`.

- **Musée des beaux-arts** (départ) : parquet, murs bordeaux, cadres dorés, halos.
- **Galerie contemporaine** (white cube) : béton ciré, blanc, lumière uniforme, toiles nues, grandes salles.
- **Back rooms** (liminale, sans nom affiché) : papier peint jaune, moquette tachée, faux plafond, néons qui grésillent, couloirs trop longs, presque aucune œuvre.
- **Jardin d'hiver** (serre) : verrière, carrelage en terre cuite, jardinières.

### Le Directeur (`src/director/Director.ts`)
- **Zones** : le musée est découpé en zones de 3 à 15 modules. Chaque module hérite de la zone de son parent, si bien que deux branches peuvent diverger.
- **Choix de l'ambiance suivante** : il est pondéré par la rareté, les affinités, l'historique (pas de répétition immédiate) et une courbe de tension qui monte et redescend.
- **Départ** : toujours dans un musée classique, assez long pour que la dérive soit sentie.
- **Transitions** :
  - **progressive** : couleurs, lumière, brouillard, hauteur et largeur sont interpolés sur 2 à 4 modules ;
  - **seuil** : un sas étroit et sombre, avec des portes ;
  - **rupture** : fondu au noir ou faux glitch, rare.
- **Raccords** : aux jonctions entre ambiances de tailles différentes, des jambages et des linteaux referment automatiquement l'écart.
- **Nom de l'aile** : il s'affiche brièvement à l'arrivée (pas dans les zones liminales).
- **Réglages** : `CONFIG.director`.

## Phase 3, embranchements

- **Intersections** : en T (gauche et droite, tout droit et gauche, tout droit et droite) et carrefour en croix. Chaque direction mène à un chemin différent, généré à la demande.
- **Salles**, plus hautes de plafond, avec un linteau au-dessus des portes :
  - petite salle avec un banc de velours (sortie au fond, ou sur les côtés) ;
  - grande salle à trois sorties, avec une cimaise centrale accrochée des deux côtés.
- **Escaliers** montants et descendants (±2,4 m) :
  - le monde a désormais des étages, et deux modules peuvent se superposer s'ils ne se recoupent pas verticalement ;
  - collisions et visibilité tiennent compte de l'étage.
- **Impasses** : un couloir court avec une seule œuvre au fond. L'auto-marche s'y arrête quelques secondes avant de repartir.
- **Auto-marche** : elle calcule un itinéraire dans chaque module (graphe de points libres) pour contourner bancs et cimaises.
- Les poids de tirage des modules sont dans `CONFIG.world.moduleWeights`.

## Phase 2, vraies œuvres

- **Phase 1** : couloir infini (couloirs, virages, impasses), génération devant et destruction derrière, visibilité à 360°, contrôles PC et mobile.
- **Phase 2** : vraies œuvres tirées de quatre musées, cadres selon le type et l'époque, échelle réelle, cartels, fiche détaillée zoomable.

### Sources

| Source | Clé | Images | Licence | Remarques |
|---|---|---|---|---|
| [Art Institute of Chicago](https://api.artic.edu/docs/) | non | IIIF, CORS | CC0 (descriptions CC BY 4.0) | 60 requêtes/min par IP ; pagination limitée à 1 000 résultats, on tire des fenêtres d'identifiants |
| [Cleveland Museum of Art](https://openaccess-api.clevelandart.org/) | non | sans CORS : via le Worker | CC0 | |
| [The Met](https://metmuseum.github.io/) | non | sans CORS : via le Worker | CC0 | recherche `v1.1` paginée (la `v1` a été retirée le 01/10/2026), plafonnée à 10 000 résultats : fenêtres de dates aléatoires |
| [SMK – Statens Museum for Kunst](https://open.smk.dk/) | non | IIIF, CORS | domaine public | |

Chaque source est un adaptateur indépendant dans `shared/adapters/`, avec la même interface. Ajouter une source = ajouter un fichier et l'inscrire dans `shared/adapters/index.ts`. Seules les œuvres du domaine public sont retenues. Le crédit et la licence apparaissent sur le cartel et dans la fiche.

### Deux modes
- **Avec le Worker** (`worker/`, Cloudflare) : toutes les sources, réponses mises en cache, et relais des images sans CORS (indispensable pour en faire des textures WebGL).
- **Mode direct** : sans Worker, ou s'il ne répond pas, le navigateur interroge lui-même les sources qui le permettent (AIC et SMK).

Une source dont les images échouent systématiquement est écartée pour le reste de la visite.

### Présentation
- **Cadres** (`src/art/frames.ts`) :
  - peinture ancienne : grand cadre doré mouluré ;
  - XIXᵉ siècle : cadre doré ou bois ;
  - moderne : baguette noire, ou toile nue sur châssis ;
  - papier (estampes, dessins, photos) : passe-partout et baguette fine.
- **Échelle réelle** : les dimensions de la source sont respectées. Une œuvre trop grande pour le mur est réduite ; une miniature reste petite.
- **Image en retard** : toile drapée et cartel « Œuvre en restauration ». À l'arrivée de l'image, l'œuvre est raccrochée à la bonne taille si personne ne regarde ; sinon, elle apparaît en fondu sur un passe-partout.
- **Niveaux de détail** : le texte du cartel n'est généré qu'à l'approche (moins de 7 m). La haute définition est chargée à moins de 3,2 m, pour les sources IIIF uniquement.
- **Fiche détaillée** : clic sur une œuvre (PC, au centre du viseur) ou toucher (mobile). Zoom à la molette ou au pincement, glisser pour se déplacer, double-clic. Fermeture par Échap, la croix, un clic à côté ou un glissement vers le bas.
- **Filtre de contenu** (activé par défaut, menu ☰) : mots-clés visant la sexualité explicite et la violence graphique, pas les nus académiques. C'est imparfait par nature.

## Mise en place du Worker Cloudflare

Le déploiement est automatique (GitHub Actions) dès que deux secrets sont présents dans le dépôt :

1. **Jeton d'API** : sur dash.cloudflare.com, aller dans *My Profile → API Tokens → Create Token*, choisir le modèle **« Edit Cloudflare Workers »**, puis *Account Resources* : ton compte. Créer et copier le jeton.
2. **Identifiant de compte** : *Workers & Pages* dans le tableau de bord, colonne de droite, *Account ID*.
3. **Sous-domaine workers.dev** : si tu n'as jamais utilisé Workers, ouvre *Workers & Pages* une fois pour choisir ton sous-domaine (`xxx.workers.dev`).
4. **Secrets GitHub** : sur le dépôt, *Settings → Secrets and variables → Actions → New repository secret* :
   - `CLOUDFLARE_API_TOKEN` : le jeton ;
   - `CLOUDFLARE_ACCOUNT_ID` : l'identifiant.
5. **Relancer le déploiement** : *Actions → Déploiement → Run workflow*, ou simplement pousser un commit.

Le workflow déploie le Worker (`galerie-infinie-api`), récupère son URL et construit le site avec (`VITE_API_URL`). Sans les secrets, ou si le déploiement du Worker échoue, le site est quand même publié, en mode direct.

Pour tester : `https://galerie-infinie-api.<sous-domaine>.workers.dev/health`, puis `/artworks?count=5`.

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
- `&api=https://…` : utilise un autre Worker (par exemple `http://localhost:8787` en local).

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
npm run worker:dev # Worker local sous Node (http://localhost:8787), sans compte Cloudflare
npm run try:adapters -- met peinture   # essai direct d'un adaptateur
```

En local, `npx wrangler dev --config worker/wrangler.jsonc` lance le Worker avec le vrai moteur Cloudflare. `npm run worker:deploy` le déploie à la main (après `npx wrangler login`).

Le test de fuite lance le build dans Chromium sans écran, active la marche automatique et relève régulièrement les géométries, les textures (dont celles des œuvres), le nombre de modules et le tas JS. Il échoue si ces valeurs dérivent ou si une apparition perceptible est détectée. Variables utiles : `LEAK_MINUTES`, `LEAK_TIMESCALE`, `LEAK_SEED`, `LEAK_API` (pour tester avec un Worker).

Le déploiement sur GitHub Pages se fait automatiquement à chaque push sur `main` (`.github/workflows/deploy.yml`).

## Feuille de route

1. ~~Prototype de couloir infini~~
2. ~~Vraies œuvres : Worker Cloudflare, adaptateurs de musées, cartels, fiche détaillée~~
3. ~~Embranchements : T, carrefours, salles, escaliers, impasses~~
4. ~~Ambiances et Directeur~~
5. Plus de sources : affiches, jaquettes, pochettes, livres
6. Décors procéduraux et son
7. Toutes les ambiances et étrangetés
8. Finitions
