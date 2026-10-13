import type { ArtType, Artwork } from './artwork';

/**
 * Thèmes d'œuvres : le Directeur ouvre parfois une « aile » où les œuvres
 * suivent un sujet (les chats, la mer…), annoncée à l'entrée.
 *
 * `q` est cherché dans les titres (en anglais : toutes les sources l'indexent) ;
 * `match` vérifie ensuite la pertinence sur le titre et les étiquettes,
 * car certaines recherches restent floues.
 */
export interface ArtTheme {
  id: string;
  /** Titre annoncé. */
  title: string;
  /** Mot-clé cherché dans les titres ('' : pas de recherche, seulement types et années). */
  q: string;
  match: RegExp;
  types?: ArtType[];
  /** Période (années incluses) : les sources qui savent filtrer par date l'appliquent. */
  years?: [number, number];
  /** Thème « autour d'un artiste » : seules les sources qui savent chercher par auteur répondent. */
  creator?: string;
  /** Thème « dans la lignée de » : œuvres apparentées selon la source (films recommandés, jeux similaires). */
  like?: { source: string; id: string };
}

/**
 * Un des mots (fragments d'expression régulière) en entier, accents et lettres danoises
 * compris (`\b` ne connaît que l'ASCII ; pas de lookbehind : vieux Safari).
 */
function words(...list: string[]): RegExp {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${list.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
}

export const THEMES: ArtTheme[] = [
  { id: 'portraits', title: 'Les portraits', q: 'portrait', match: /portrait|portræt|bildnis/i },
  { id: 'autoportraits', title: 'Autoportraits', q: 'self-portrait', match: /self[- ]?portrait|selvportræt|autoportrait/i },
  { id: 'mer', title: 'La mer', q: 'sea', match: /\b(sea|seas|seascape|ocean|marine|surf|waves?|coast|shore|beach|havet|kyst|strand)\b/i },
  { id: 'chats', title: 'Les chats', q: 'cat', match: /\b(cats?|kittens?|kat|katten|katte)\b/i },
  { id: 'chiens', title: 'Les chiens', q: 'dog', match: /\b(dogs?|hounds?|pupp(y|ies)|spaniels?|poodles?|terriers?|hund|hunden|hunde)\b/i },
  { id: 'chevaux', title: 'Les chevaux', q: 'horse', match: /\b(horses?|horseman|horsemen|mares?|stallions?|pon(y|ies)|hest|hesten|heste|rytter)\b/i },
  { id: 'fleurs', title: 'Les fleurs', q: 'flowers', match: /\b(flowers?|bouquets?|roses|tulips?|peon(y|ies)|lil(y|ies)|irises|blomst|blomster|blomsterne)\b/i },
  { id: 'natures-mortes', title: 'Natures mortes', q: 'still life', match: /still[- ]?life|stilleben|opstilling|nature morte/i },
  { id: 'hiver', title: 'L’hiver', q: 'winter', match: /\b(winter|snow|snowy|frost|skating|sne)|vinter/i },
  { id: 'nuit', title: 'La nuit', q: 'night', match: /\b(night|nocturne|moon|moonlight|moonlit|nat|natten|måne)\b/i },
  { id: 'oiseaux', title: 'Les oiseaux', q: 'bird', match: /\b(birds?|owls?|herons?|parrots?|swans?|ducks?|eagles?|roosters?|peacocks?|sparrows?|crows?|fugl\w*)\b/i },
  { id: 'bateaux', title: 'Les bateaux', q: 'ship', match: /\b(ships?|boats?|sail\w*|vessels?|frigates?|schooners?|skib\w*|båd\w*)/i },
  { id: 'montagnes', title: 'Les montagnes', q: 'mountain', match: /\b(mountains?|mount|alps|alpine|peaks?|bjerg\w*)\b/i },
  { id: 'foret', title: 'La forêt', q: 'forest', match: /\b(forests?|woods|woodland|trees?|skov\w*|træer)\b/i },
  { id: 'musique', title: 'La musique', q: 'music', match: /\b(music\w*|violin\w*|lutes?|guitar\w*|piano|flutes?|singers?|concert|musik\w*)\b/i },
  { id: 'anges', title: 'Les anges', q: 'angel', match: /\b(angels?|cherubs?|putti|putto|engel|englen|engle)\b/i },
  { id: 'enfance', title: 'L’enfance', q: 'child', match: /\b(child|children|infant|baby|barn|barnet|børn)\b/i },
  { id: 'lecture', title: 'La lecture', q: 'reading', match: /\b(reading|reader|books?|letters?|læs\w*)\b/i },
  // Paysages et lieux.
  { id: 'rivieres', title: 'Les rivières', q: 'river', match: words('rivers?', 'streams?', 'brooks?', 'riverbanks?', 'flod(en|er)?') },
  { id: 'jardins', title: 'Les jardins', q: 'garden', match: words('gardens?', 'parks?', 'orchards?', 'haver?', 'haven') },
  { id: 'ponts', title: 'Les ponts', q: 'bridge', match: words('bridges?', 'bro(en|er)?', 'pont') },
  { id: 'eglises', title: 'Les églises', q: 'church', match: words('church(es)?', 'chapels?', 'cathedrals?', 'abbey', 'kirke(n|r|rne)?', 'kapel(let)?') },
  { id: 'chateaux', title: 'Les châteaux', q: 'castle', match: words('castles?', 'palaces?', 'fortress', 'slottet', 'château(x)?') },
  { id: 'moulins', title: 'Les moulins', q: 'mill', match: words('mills?', 'windmills?', 'watermills?', 'mølle(n|r)?') },
  { id: 'phares', title: 'Les phares', q: 'lighthouse', match: words('lighthouses?', 'beacons?', 'fyrtårn(et)?') },
  { id: 'ruines', title: 'Les ruines', q: 'ruins', match: words('ruins?', 'ruined', 'ruin(en|er)?') },
  { id: 'rues', title: 'La rue', q: 'street', match: words('streets?', 'avenue', 'boulevard', 'alley', 'gade(n|r)?', 'rue') },
  { id: 'ports', title: 'Les ports', q: 'harbor', match: words('harbou?rs?', 'docks?', 'quay', 'wharf', 'havn(en|e)?') },
  { id: 'villages', title: 'Les villages', q: 'village', match: words('villages?', 'hamlet', 'landsby(en)?') },
  { id: 'fermes', title: 'La ferme', q: 'farm', match: words('farms?', 'farmyard', 'barns?', 'farmhouse', 'gård(en)?') },
  { id: 'marches', title: 'Les marchés', q: 'market', match: words('markets?', 'marketplace', 'torv(et)?', 'marked(et)?') },
  { id: 'lacs', title: 'Les lacs', q: 'lake', match: words('lakes?', 'ponds?', 'sø(en|er)?') },
  { id: 'cascades', title: 'Les cascades', q: 'waterfall', match: words('waterfalls?', 'cascades?', 'vandfald(et)?') },
  { id: 'iles', title: 'Les îles', q: 'island', match: words('islands?', 'isle') },
  { id: 'desert', title: 'Le désert', q: 'desert', match: words('deserts?', 'dunes?', 'sahara', 'oasis', 'ørken(en)?') },
  { id: 'venise', title: 'Venise', q: 'venice', match: words('venice', 'venetian', 'venezia', 'venedig', 'venise') },
  { id: 'paris', title: 'Paris', q: 'paris', match: words('paris', 'parisian', 'seine', 'montmartre') },
  { id: 'rome', title: 'Rome', q: 'rome', match: words('rome', 'roman', 'roma', 'tiber', 'colosseum', 'vatican') },
  { id: 'londres', title: 'Londres', q: 'london', match: words('london', 'thames', 'westminster') },
  { id: 'japon', title: 'Le Japon', q: 'japanese', match: words('japan', 'japanese', 'japon(ais|aise)?', 'edo', 'kyoto', 'tokyo', 'fuji') },
  { id: 'egypte', title: 'L’Égypte', q: 'egypt', match: words('egypt(ian)?', 'pyramids?', 'nile', 'sphinx', 'cairo', 'pharaohs?', 'ægypt(en|isk)?') },
  { id: 'copenhague', title: 'Copenhague', q: 'copenhagen', match: words('copenhagen', 'københavn(s)?', 'christianshavn', 'amager') },
  { id: 'interieurs', title: 'Intérieurs', q: 'interior', match: words('interiors?', 'stue(n|r)?', 'interiør(et)?') },
  { id: 'fenetres', title: 'Les fenêtres', q: 'window', match: words('windows?', 'vindue(t|r)?') },
  { id: 'portes', title: 'Les portes', q: 'door', match: words('doors?', 'doorways?', 'gates?', 'dør(en|e)?') },
  { id: 'escaliers', title: 'Les escaliers', q: 'staircase', match: words('stairs?', 'staircases?', 'trappe(n|r)?') },
  { id: 'maisons', title: 'Les maisons', q: 'house', match: words('houses?', 'cottages?', 'huts?', 'huset') },
  // Le temps qu'il fait, les saisons, les heures.
  { id: 'tempetes', title: 'La tempête', q: 'storm', match: words('storms?', 'stormy', 'tempest', 'thunder(storm)?', 'lightning', 'uvejr') },
  { id: 'couchants', title: 'Le soleil couchant', q: 'sunset', match: words('sunsets?', 'sundown', 'dusk', 'twilight', 'solnedgang(en)?', 'tusmørke') },
  { id: 'pluie', title: 'La pluie', q: 'rain', match: words('rain', 'rainy', 'rainstorm', 'showers?', 'umbrellas?', 'regn(vejr)?') },
  { id: 'nuages', title: 'Les nuages', q: 'clouds', match: words('clouds?', 'cloudy', 'sky', 'skies', 'skyer(ne)?') },
  { id: 'printemps', title: 'Le printemps', q: 'spring', match: words('spring', 'springtime', 'blossoms?', 'forår(et)?') },
  { id: 'ete', title: 'L’été', q: 'summer', match: words('summer', 'sommer(en)?') },
  { id: 'automne', title: 'L’automne', q: 'autumn', match: words('autumn', 'autumnal', 'efterår(et)?') },
  { id: 'matin', title: 'Le matin', q: 'morning', match: words('morning', 'dawn', 'sunrise', 'daybreak', 'morgen(en)?', 'solopgang') },
  { id: 'soir', title: 'Le soir', q: 'evening', match: words('evening', 'eventide', 'aften(en)?') },
  { id: 'vent', title: 'Le vent', q: 'wind', match: words('wind', 'windy', 'gale', 'breeze', 'blæst', 'blæsevejr') },
  { id: 'eau', title: 'L’eau', q: 'water', match: words('water', 'waters', 'vand(et)?') },
  { id: 'feu', title: 'Le feu', q: 'fire', match: words('fires?', 'flames?', 'burning', 'blaze', 'ild(en)?', 'brand(en)?') },
  { id: 'soleil', title: 'Le soleil', q: 'sun', match: words('sun', 'sunny', 'sunlight', 'sunshine', 'sol(en|skin)?') },
  { id: 'etoiles', title: 'Les étoiles', q: 'star', match: words('stars?', 'starry', 'constellations?', 'stjerne(n|r|rne)?') },
  // Animaux.
  { id: 'lions', title: 'Les lions', q: 'lion', match: words('lions?', 'lioness', 'løve(n|r)?') },
  { id: 'vaches', title: 'Les vaches', q: 'cow', match: words('cows?', 'cattle', 'oxen', 'ox', 'bulls?', 'calf', 'calves', 'køer', 'koen', 'kvæg') },
  { id: 'moutons', title: 'Les moutons', q: 'sheep', match: words('sheep', 'lambs?', 'shepherd(s|ess)?', 'ewes?', 'lammet') },
  { id: 'cerfs', title: 'Les cerfs', q: 'deer', match: words('deer', 'stags?', 'fawns?', 'hjort(en|e)?', 'rådyr') },
  { id: 'poissons', title: 'Les poissons', q: 'fish', match: words('fish', 'fishes', 'carp', 'trout', 'salmon', 'herring', 'fisk(en|e)?') },
  { id: 'papillons', title: 'Les papillons', q: 'butterfly', match: words('butterfl(y|ies)', 'moths?', 'sommerfugl(e|en)?') },
  { id: 'insectes', title: 'Les insectes', q: 'insect', match: words('insects?', 'beetles?', 'bees?', 'dragonfl(y|ies)', 'grasshoppers?', 'spiders?', 'insekt(er)?') },
  { id: 'singes', title: 'Les singes', q: 'monkey', match: words('monkeys?', 'apes?', 'chimpanzees?', 'baboons?', 'abe(n|r)?') },
  { id: 'elephants', title: 'Les éléphants', q: 'elephant', match: words('elephants?', 'elefant(en|er)?') },
  { id: 'tigres', title: 'Les fauves', q: 'tiger', match: words('tigers?', 'tigress', 'leopards?', 'panthers?', 'tiger(en|e)?') },
  { id: 'ours', title: 'Les ours', q: 'bear', match: words('bears?', 'bjørn(en|e)?') },
  { id: 'dragons', title: 'Les dragons', q: 'dragon', match: words('dragons?', 'drage(n|r)?', 'serpents?', 'monsters?') },
  // Objets et tables.
  { id: 'fruits', title: 'Les fruits', q: 'fruit', match: words('fruits?', 'apples?', 'pears?', 'grapes?', 'oranges', 'lemons?', 'peach(es)?', 'cherr(y|ies)', 'frugt(er)?', 'æble(r)?') },
  { id: 'vin', title: 'Le vin', q: 'wine', match: words('wine', 'vineyards?', 'vintage', 'bacchus', 'vin(en)?') },
  { id: 'the-cafe', title: 'Thé et café', q: 'tea', match: words('tea', 'teapots?', 'teacups?', 'coffee', 'café', 'cafe', 'kaffe(n)?') },
  { id: 'repas', title: 'À table', q: 'dinner', match: words('dinner', 'supper', 'breakfast', 'lunch', 'meal', 'feast', 'banquet', 'måltid(et)?', 'middag(en)?') },
  { id: 'vases', title: 'Les vases', q: 'vase', match: words('vases?', 'urns?', 'jars?', 'jugs?', 'pitchers?', 'krukke(n|r)?') },
  { id: 'horloges', title: 'Les horloges', q: 'clock', match: words('clocks?', 'hourglass', 'sundial') },
  { id: 'miroirs', title: 'Les miroirs', q: 'mirror', match: words('mirrors?', 'reflections?', 'spejl(et)?') },
  { id: 'chapeaux', title: 'Les chapeaux', q: 'hat', match: words('hats?', 'bonnets?', 'hatte(n)?') },
  { id: 'masques', title: 'Les masques', q: 'mask', match: words('masks?', 'masked', 'masquerade', 'maske(n|r)?') },
  { id: 'armures', title: 'Armes et armures', q: 'armor', match: words('armou?rs?', 'helmets?', 'swords?', 'shields?', 'rustning(en|er)?', 'sværd(et)?') },
  { id: 'bougies', title: 'À la bougie', q: 'candle', match: words('candles?', 'candlelight', 'candlesticks?', 'lamps?', 'lanterns?', 'lampe(n|r)?') },
  { id: 'vanites', title: 'Vanités', q: 'skull', match: words('skulls?', 'vanitas', 'memento mori', 'skeletons?', 'kranie(t)?', 'skelet(tet)?') },
  { id: 'mains', title: 'Les mains', q: 'hand', match: words('hands?', 'fingers?', 'hånd(en)?', 'hænder') },
  { id: 'cartes', title: 'Les cartes', q: 'map', match: words('maps?', 'atlas') },
  { id: 'jouets', title: 'Les jouets', q: 'toy', match: words('toys?', 'dolls?', 'puppets?', 'legetøj', 'dukke(n|r)?') },
  { id: 'echecs', title: 'Les jeux', q: 'chess', match: words('chess', 'card players?', 'dice', 'backgammon', 'skak(spil)?') },
  { id: 'trains', title: 'Les trains', q: 'train', match: words('trains?', 'railways?', 'railroads?', 'locomotives?', 'jernbane(n)?', 'lokomotiv(et)?') },
  { id: 'voitures', title: 'Automobiles', q: 'car', match: words('cars?', 'automobiles?', 'motorcars?') },
  { id: 'caleches', title: 'Les calèches', q: 'carriage', match: words('carriages?', 'coach(es)?', 'wagons?', 'carts?', 'sleighs?', 'sledges?', 'vogn(en|e)?', 'kane(n)?') },
  { id: 'velos', title: 'À bicyclette', q: 'bicycle', match: words('bicycles?', 'bikes?', 'cycling', 'cyclists?', 'cykel', 'cykler') },
  // Les gens, ce qu'ils font.
  { id: 'danse', title: 'La danse', q: 'dance', match: words('dance', 'dances', 'dancers?', 'dancing', 'ballet', 'ballerinas?', 'waltz', 'dans(en|er|erinde)?') },
  { id: 'theatre', title: 'Le théâtre', q: 'theatre', match: words('theat(re|er)s?', 'actors?', 'actress(es)?', 'opera', 'comedy', 'harlequin', 'teater(et)?') },
  { id: 'cirque', title: 'Le cirque', q: 'circus', match: words('circus', 'clowns?', 'acrobats?', 'jugglers?', 'pierrot', 'cirkus', 'klovn(en|e)?') },
  { id: 'chasse', title: 'La chasse', q: 'hunt', match: words('hunt', 'hunts', 'hunters?', 'hunting', 'huntsm[ae]n', 'hounds', 'falconry', 'jagt(en)?', 'jæger(e|en)?') },
  { id: 'peche', title: 'La pêche', q: 'fishing', match: words('fishing', 'fisherm[ae]n', 'fisherwom[ae]n', 'anglers?', 'fisker(e|en)?') },
  { id: 'baigneurs', title: 'Les baigneurs', q: 'bathers', match: words('bath', 'bathing', 'bathers?', 'swimmers?', 'swimming', 'badende') },
  { id: 'batailles', title: 'Les batailles', q: 'battle', match: words('battles?', 'war', 'wars', 'siege', 'combat', 'krig(en)?') },
  { id: 'soldats', title: 'Les soldats', q: 'soldier', match: words('soldiers?', 'officers?', 'guards?', 'troops', 'army', 'cavalry', 'soldat(en|er)?') },
  { id: 'rois', title: 'Rois et reines', q: 'king', match: words('kings?', 'queens?', 'princes?', 'princess(es)?', 'emperors?', 'empress', 'konge(n|r)?', 'dronning(en)?') },
  { id: 'meres', title: 'Mère et enfant', q: 'mother', match: words('mothers?', 'maternity', 'moder(en)?') },
  { id: 'familles', title: 'En famille', q: 'family', match: words('famil(y|ies)', 'parents', 'father', 'familie(n)?') },
  { id: 'amoureux', title: 'Les amoureux', q: 'lovers', match: words('lovers?', 'love', 'kiss', 'kisses', 'kissing', 'courtship', 'elskende', 'kys') },
  { id: 'paysans', title: 'Les paysans', q: 'peasant', match: words('peasants?', 'harvest(ers?)?', 'reapers?', 'gleaners?', 'ploughing', 'plowing', 'bonde', 'bønder', 'høst(en)?') },
  { id: 'marins', title: 'Les marins', q: 'sailor', match: words('sailors?', 'seam[ae]n', 'mariners?', 'sømand', 'sømænd') },
  { id: 'femmes', title: 'Figures de femmes', q: 'woman', match: words('wom[ae]n', 'lady', 'ladies', 'girls?', 'kvinde(n|r)?', 'pige(n|r)?', 'dame(n|r)?') },
  { id: 'tetes', title: 'Études de têtes', q: 'head', match: words('heads?', 'faces?', 'profile', 'hoved(et)?') },
  { id: 'mariages', title: 'Les noces', q: 'wedding', match: words('weddings?', 'marriage', 'brides?', 'bridal', 'bryllup(et)?', 'brud(en)?') },
  { id: 'fetes', title: 'La fête', q: 'festival', match: words('festivals?', 'carnival', 'party', 'parties', 'celebration', 'fête', 'fêtes', 'fest(en)?') },
  { id: 'travail', title: 'Au travail', q: 'workers', match: words('workers?', 'workshop', 'laborers?', 'labourers?', 'factory', 'forge', 'blacksmiths?', 'smithy', 'arbejdere', 'smedje(n)?') },
  // Mythes, croyances, rêves.
  { id: 'saints', title: 'Les saints', q: 'saint', match: words('saints?', 'martyr(s|dom)?', 'helgen(en|er)?', 'sankt') },
  { id: 'vierge', title: 'La Vierge', q: 'virgin', match: words('virgin', 'madonna', 'annunciation', 'jomfru', 'maria') },
  { id: 'demons', title: 'Diables et démons', q: 'devil', match: words('devils?', 'demons?', 'satan', 'hell', 'temptation', 'djævel(en|e)?', 'helvede') },
  { id: 'venus', title: 'Vénus', q: 'venus', match: words('venus', 'aphrodite', 'cupid', 'amor', 'eros') },
  { id: 'mythes', title: 'Les dieux de l’Olympe', q: 'jupiter', match: words('jupiter', 'zeus', 'apollo', 'diana', 'minerva', 'neptune', 'juno', 'hercules', 'bacchus', 'olympus') },
  { id: 'nymphes', title: 'Nymphes et sirènes', q: 'nymph', match: words('nymphs?', 'mermaids?', 'sirens?', 'naiads?', 'nymfe(n|r)?', 'havfrue(n|r)?') },
  { id: 'reves', title: 'Les rêves', q: 'dream', match: words('dreams?', 'dreaming', 'sleep', 'sleeping', 'reverie', 'drøm(men)?', 'søvn') },
  { id: 'ombres', title: 'Les ombres', q: 'shadow', match: words('shadows?', 'shade', 'silhouettes?', 'skygge(n|r)?') },
  // Couleurs, ateliers.
  { id: 'bleu', title: 'En bleu', q: 'blue', match: words('blue', 'azure', 'indigo', 'ultramarine', 'blå(t)?') },
  { id: 'rouge', title: 'En rouge', q: 'red', match: words('red', 'scarlet', 'crimson', 'vermilion', 'rød(t|e)?') },
  { id: 'vert', title: 'En vert', q: 'green', match: words('green', 'emerald', 'grøn(t|ne)?') },
  { id: 'jaune', title: 'En jaune', q: 'yellow', match: words('yellow', 'ochre', 'gul(t|e)?') },
  { id: 'blanc', title: 'En blanc', q: 'white', match: words('white', 'ivory', 'hvid(t|e)?') },
  { id: 'or', title: 'L’or', q: 'gold', match: words('gold', 'golden', 'gilt', 'gilded', 'guld') },
  { id: 'compositions', title: 'Compositions', q: 'composition', match: words('compositions?', 'abstract', 'abstraction', 'komposition(en)?') },
  { id: 'etudes', title: 'Études et esquisses', q: 'study', match: words('study', 'studies', 'sketch(es)?', 'étude(s)?', 'studie(r)?', 'skitse(r)?') },
  { id: 'ateliers', title: 'L’atelier de l’artiste', q: 'studio', match: words('studio', 'atelier', 'easel', 'painters?', 'maler(en|e)?', 'kunstner(en|e)?') },
  // Culture populaire : une décennie, un médium.
  { id: 'cinema-50', title: 'Le cinéma des années 50', q: '', match: /./, types: ['affiche-film'], years: [1950, 1959] },
  { id: 'cinema-60', title: 'Le cinéma des années 60', q: '', match: /./, types: ['affiche-film'], years: [1960, 1969] },
  { id: 'cinema-70', title: 'Le cinéma des années 70', q: '', match: /./, types: ['affiche-film'], years: [1970, 1979] },
  { id: 'cinema-80', title: 'Le cinéma des années 80', q: '', match: /./, types: ['affiche-film'], years: [1980, 1989] },
  { id: 'cinema-90', title: 'Le cinéma des années 90', q: '', match: /./, types: ['affiche-film'], years: [1990, 1999] },
  { id: 'cinema-2000', title: 'Le cinéma des années 2000', q: '', match: /./, types: ['affiche-film'], years: [2000, 2009] },
  { id: 'cinema-2010', title: 'Le cinéma des années 2010', q: '', match: /./, types: ['affiche-film'], years: [2010, 2019] },
  { id: 'jeux-80', title: 'Jeux vidéo des années 80', q: '', match: /./, types: ['jaquette-jeu'], years: [1980, 1989] },
  { id: 'jeux-90', title: 'Jeux vidéo des années 90', q: '', match: /./, types: ['jaquette-jeu'], years: [1990, 1999] },
  { id: 'jeux-2000', title: 'Jeux vidéo des années 2000', q: '', match: /./, types: ['jaquette-jeu'], years: [2000, 2009] },
  { id: 'jeux-2010', title: 'Jeux vidéo des années 2010', q: '', match: /./, types: ['jaquette-jeu'], years: [2010, 2019] },
  { id: 'disques-60', title: 'Les années 60 en musique', q: '', match: /./, types: ['pochette-disque'], years: [1960, 1969] },
  { id: 'disques-70', title: 'Les années 70 en musique', q: '', match: /./, types: ['pochette-disque'], years: [1970, 1979] },
  { id: 'disques-80', title: 'Les années 80 en musique', q: '', match: /./, types: ['pochette-disque'], years: [1980, 1989] },
  { id: 'disques-90', title: 'Les années 90 en musique', q: '', match: /./, types: ['pochette-disque'], years: [1990, 1999] },
  { id: 'disques-2000', title: 'Les années 2000 en musique', q: '', match: /./, types: ['pochette-disque'], years: [2000, 2009] },
  { id: 'photographie', title: 'La photographie', q: '', match: /./, types: ['photographie'] },
  { id: 'estampes', title: 'Gravures et estampes', q: '', match: /./, types: ['estampe'] },
  { id: 'dessins', title: 'Le dessin', q: '', match: /./, types: ['dessin'] },
  { id: 'affiches', title: 'Affiches', q: '', match: /./, types: ['affiche'] },
  { id: 'bibliotheque', title: 'La bibliothèque', q: '', match: /./, types: ['couverture-livre'] },
];

export const THEMES_BY_ID: Record<string, ArtTheme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));

/** L'œuvre correspond-elle au thème (titre et étiquettes, artiste, source) ? */
export function matchesTheme(art: Artwork, theme: ArtTheme): boolean {
  if (theme.years && art.year !== undefined && (art.year < theme.years[0] || art.year > theme.years[1])) return false;
  if (theme.types && !theme.types.includes(art.type)) return false;
  if (theme.like) return art.source === theme.like.source && art.id !== `${theme.like.source}:${theme.like.id}`;
  if (theme.creator) return !!art.creator && norm(art.creator).includes(norm(theme.creator));
  return theme.match.test(art.title) || art.tags.some((t) => theme.match.test(t));
}

// --- Thèmes dynamiques -------------------------------------------------------
// Nés d'une œuvre qui a retenu le visiteur. Leur identifiant décrit le thème en entier
// (le Worker le reconstruit sans table) : `genre~paramètres…`.

const SEP = '~';
/** Types « beaux-arts » : un artiste de musée est cherché dans tous. */
const FINE_ARTS: ArtType[] = ['peinture', 'estampe', 'dessin', 'photographie'];
const DECADE_TYPES: Partial<Record<ArtType, (d: string) => string>> = {
  'affiche-film': (d) => `Le cinéma des années ${d}`,
  'jaquette-jeu': (d) => `Jeux vidéo des années ${d}`,
  'pochette-disque': (d) => `Les années ${d} en musique`,
};
const CREATOR_TITLES: Partial<Record<ArtType, (n: string) => string>> = {
  'pochette-disque': (n) => `Discographie : ${n}`,
  'couverture-livre': (n) => `Les livres de ${n}`,
};
/** Sources qui savent proposer des œuvres apparentées. */
const LIKE_SOURCES: Record<string, ArtType> = { tmdb: 'affiche-film', igdb: 'jaquette-jeu' };

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function short(s: string, n = 60): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Reconstruit un thème (fixe ou dynamique) à partir de son identifiant ; null s'il est invalide. */
export function resolveTheme(id: string): ArtTheme | null {
  if (THEMES_BY_ID[id]) return THEMES_BY_ID[id]!;
  if (id.length > 160) return null;
  const [kind, a, b, c] = id.split(SEP);
  if (kind === 'artiste' && a && b) {
    const type = a as ArtType;
    const types = type === 'peinture' ? FINE_ARTS : [type];
    const title = CREATOR_TITLES[type]?.(b) ?? `Autour de ${b}`;
    return { id, title, q: '', match: /./, types, creator: b };
  }
  if (kind === 'lignee' && a && b && LIKE_SOURCES[a]) {
    return { id, title: `Dans la lignée de « ${c ?? '…'} »`, q: '', match: /./, types: [LIKE_SOURCES[a]], like: { source: a, id: b } };
  }
  if (kind === 'decennie' && a && b) {
    const label = DECADE_TYPES[a as ArtType];
    const y = Number(b);
    if (!label || !Number.isInteger(y) || y % 10 !== 0) return null;
    return { id, title: label(y < 2000 ? String(y % 100).padStart(2, '0') : String(y)), q: '', match: /./, types: [a as ArtType], years: [y, y + 9] };
  }
  return null;
}

/**
 * Thèmes apparentés à une œuvre, avec un poids relatif : le même artiste, des œuvres
 * dans sa lignée (films, jeux), sa décennie (culture populaire), les sujets qu'elle illustre.
 */
export function themesFor(art: Artwork): Array<{ theme: ArtTheme; weight: number }> {
  const out: Array<{ theme: ArtTheme; weight: number }> = [];
  const add = (id: string, weight: number) => {
    const theme = resolveTheme(id);
    if (theme && !out.some((o) => o.theme.id === theme.id)) out.push({ theme, weight });
  };
  const native = art.id.slice(art.source.length + 1);
  if (LIKE_SOURCES[art.source] && native) add(['lignee', art.source, native, short(art.title, 40).replaceAll(SEP, ' ')].join(SEP), 1.6);
  // Artiste : « Claude Monet (French, 1840–1926) » → « Claude Monet » ; « A, B » → « A ».
  const creator = art.creator?.replace(/\s*[([].*$/, '').split(/,\s*/)[0]?.trim();
  const group: ArtType | null = FINE_ARTS.includes(art.type) ? 'peinture' : art.type === 'pochette-disque' || art.type === 'couverture-livre' ? art.type : null;
  if (group && creator && creator.length >= 3 && !/unknown|anonym|anónimo|unidentified|inconnu|ukendt|unbekannt|onbekend|various/i.test(creator)) {
    add(['artiste', group, short(creator, 50).replaceAll(SEP, ' ')].join(SEP), 1.5);
  }
  if (art.year !== undefined && DECADE_TYPES[art.type]) add(['decennie', art.type, String(10 * Math.floor(art.year / 10))].join(SEP), 0.8);
  for (const t of THEMES) if (t.q && matchesTheme(art, t)) add(t.id, 1);
  return out;
}
