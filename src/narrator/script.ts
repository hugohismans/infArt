/**
 * Le texte de la voix off (le Conservateur), tel qu'enregistré : un identifiant par
 * réplique, qui est aussi le nom du fichier audio (voix/A01.mp3). Les « … » marquent les
 * silences. Les répliques T ne sont jamais enregistrées : sous-titres seulement.
 */
export const LINES = {
  // Acte I — l'arrivée.
  A01: 'Ah. Vous voilà… Bienvenue. Je ne vais pas vous faire de visite guidée, rassurez-vous. Le musée se construit tout seul, au fur et à mesure que vous avancez. Moi, je m’occupe juste… des détails.',
  A02: 'Tenez. J’ai préparé un couloir rien que pour vous. Celui où c’est écrit « La mer »… Je me suis dit que ça vous plairait. Je ne sais pas pourquoi. Une intuition.',
  A03: 'Vous pouvez avancer, hein. C’est le principe d’un musée : on marche, on regarde, on marche.',
  A04: 'Bon. Je vais considérer que vous admirez la salle. Elle est très bien, cette salle… C’est moi qui l’ai faite.',
  // Branche 1 : la mer.
  B01: 'Ahhh ! J’étais sûr que la mer vous plairait !',
  B02: 'Vous voyez ? Je vous connais à peine. Et pourtant.',
  B03: 'Vous faites demi-tour ?… La mer ne vous a rien fait.',
  B04: 'Voilà. C’était la mer… À partir d’ici, je ne prévois plus rien… Enfin, presque plus rien.',
  // Branche 2 : pas la mer.
  C01: 'Ah… Vous n’aimez pas la mer… J’avais préparé ce couloir spécialement pour vous…… Ce n’est pas grave. Je vais le ranger.',
  C02: 'Je l’ai remis, au cas où. Le couloir de la mer… Je dis ça, je dis rien.',
  C03: 'Je savais que vous reviendriez. Personne ne résiste à la mer.',
  C04: 'Très bien. Je retire la mer du musée… Pour vous, en tout cas… Je ne suis pas vexé.',
  C05: 'Celui-là ne compte pas. Il s’est glissé là tout seul.',
  C06: 'Ah ! Vous avez changé d’avis… Je n’avais pas encore rangé.',
  // Suite de la première visite.
  D01: 'Prenez votre temps. Il n’y a pas d’heure de fermeture, ici… Il n’y a pas de sortie non plus, d’ailleurs… Mais prenez votre temps.',
  D02: 'Vous l’avez gardé. C’est noté… Je note tout, vous savez.',
  D03: 'Ne faites pas attention aux murs. Ils changent quand ils s’ennuient.',
  D04: 'Ces panneaux-là, je les ai devinés tout seul. En vous regardant faire.',
  D05: 'Prévisible… Je dis ça avec affection.',
  D06: 'Ce n’était pas le chemin que j’avais prévu… Ce n’est pas grave… C’est un peu grave.',
  D07: 'Je commence à croire que vous ne lisez pas les murs.',
  D08: 'Bon. Je vais me faire discret. Vous avez l’air de savoir ce que vous faites… Je reste dans le coin.',
  // Retours.
  R01: 'Déjà de retour ? Je n’ai même pas eu le temps de ranger.',
  R02: 'Ah, vous revoilà… Je ne vous attendais pas… Enfin, si. Un peu.',
  R03: 'Bon retour. J’ai gardé vos tableaux préférés. Et j’ai changé tout le reste. Comme d’habitude.',
  R04: 'Re-bonjour. Les couloirs sont neufs, ne vous inquiétez pas… Ils sont toujours neufs.',
  R05: 'Vous m’aviez oublié… Moi non… Je n’ai rien d’autre à faire.',
  R06: 'Il est tard. Normalement, le musée est fermé… Pour vous, je laisse allumé.',
  // Événements rares.
  E01: 'Il y a des gens qui ont passé des années sur ces tableaux, vous savez… Vous, vous passez trois secondes… C’est un choix.',
  E02: 'Vous êtes toujours là ?… Je vais considérer que vous regardez ce mur très attentivement.',
  E03: 'Vous étiez où ?… Les tableaux vous ont attendu. Moi aussi, un peu.',
  E04: 'Il y avait des tableaux, ici. Je ne sais pas où ils sont passés… Ne me regardez pas comme ça.',
  E05: 'Vous êtes déjà passé par ici… Non, je plaisante… Quoique.',
  E06: 'Celle-là, je l’ai murée moi-même. Il y avait…… Non. Continuez.',
  E07: 'Levez la tête… Non, plus haut.',
  E08: 'Quelqu’un a oublié sa veste… Ce n’est pas la mienne. Je n’ai pas de corps.',
  E09: 'Rien d’anormal. Continuez.',
  E10: 'Une impasse. Je l’ai mise là pour voir si vous suiviez.',
  E11: 'Celui-là ne veut pas se montrer… Ça arrive aux meilleurs.',
  E12: 'Vous revenez en arrière ?… Les salles derrière vous n’existent plus vraiment, vous savez. Je les refais au fur et à mesure… Elles sont presque pareilles.',
  E13: 'Pas de plafond… Ne levez pas trop la tête. On ne sait pas très bien ce qu’il y a au-dessus.',
  E14: 'Ce mur n’est pas là pour rien… Enfin, si. Mais il est là.',
  E15: 'Une médaille… Elle n’existe pas vraiment. Mais je suis fier de vous.',
  E16: 'Trente minutes. Vous avez vu plus de tableaux aujourd’hui que la plupart des gens en un an… Je ne sais pas si c’est vrai. Mais ça sonne bien.',
  E17: 'Une heure. Vous devriez boire un verre d’eau… Moi, je ne peux pas. Mais vous, si.',
  E18: 'Votre ami est parti… On est de nouveau entre nous.',
  // Texte seul.
  T01: 'Vous m’avez coupé le son… Très bien. J’écrirai.',
  T02: 'Ah. Vous m’entendez de nouveau. Je n’ai rien dit d’important pendant ce temps… Si, un peu.',
} as const;

export type LineId = keyof typeof LINES;

/**
 * Familles de répliques : le scénario de la première visite s'enchaîne sans délai ; les
 * autres respectent un écart minimal (voir CONFIG.narrator).
 */
export function lineFamily(id: LineId): 'scenario' | 'debut' | 'evenement' | 'texte' {
  const c = id[0];
  if (c === 'A' || c === 'B' || c === 'C' || c === 'R') return 'scenario';
  if (c === 'D') return 'debut';
  if (c === 'T') return 'texte';
  return 'evenement';
}

/** Durée de lecture estimée (sous-titres sans audio) : ~2,6 mots/s, plus les silences. */
export function estimatedDuration(text: string): number {
  const words = text.split(/\s+/).length;
  const pauses = (text.match(/…/g) ?? []).length;
  return 1.2 + words / 2.6 + pauses * 0.8;
}
