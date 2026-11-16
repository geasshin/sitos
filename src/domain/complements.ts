import type { SnackIdea } from './types';

/**
 * Le catalogue de compléments livré avec l'app. Il sert à combler la journée entre deux repas :
 * un laitage, un fruit, une poignée d'oléagineux, un reste, un dessert. Chaque entrée est chiffrée
 * (une portion précise) pour que l'ajout mette le bilan à jour sans avoir à peser quoi que ce soit.
 *
 * Les aliments absents du catalogue personnel sont simplement ignorés à l'affichage : les entrées
 * ci-dessous sont donc sans risque pour une installation plus ancienne.
 */
export const DEFAULT_COMPLEMENTS: SnackIdea[] = [
  { id: 'comp-skyr', name: 'Un skyr nature', items: [{ foodId: 'skyr', qty: 1 }] },
  { id: 'comp-skyr-chocolat', name: 'Skyr au chocolat', items: [{ foodId: 'skyr', qty: 1 }, { foodId: 'chocolat-poudre', qty: 10 }] },
  { id: 'comp-banane', name: 'Une banane', items: [{ foodId: 'banane', qty: 1 }] },
  { id: 'comp-pomme', name: 'Une pomme', items: [{ foodId: 'pomme', qty: 1 }] },
  { id: 'comp-clementines', name: 'Deux clémentines', items: [{ foodId: 'clementine', qty: 2 }] },
  { id: 'comp-kiwi', name: 'Un kiwi', items: [{ foodId: 'kiwi', qty: 1 }] },
  { id: 'comp-compote', name: 'Une compote', items: [{ foodId: 'compote', qty: 1 }] },
  { id: 'comp-abricots', name: 'Trois abricots secs', items: [{ foodId: 'abricots-secs', qty: 30 }] },
  { id: 'comp-lait', name: 'Un verre de lait', items: [{ foodId: 'lait', qty: 250 }] },
  { id: 'comp-lait-chocolat', name: 'Lait chocolaté', items: [{ foodId: 'lait', qty: 250 }, { foodId: 'chocolat-poudre', qty: 15 }] },
  { id: 'comp-yaourt', name: 'Un yaourt nature', items: [{ foodId: 'yaourt', qty: 1 }] },
  { id: 'comp-fromage-blanc', name: '100 g de fromage blanc', items: [{ foodId: 'fromage-blanc', qty: 100 }] },
  { id: 'comp-oeufs', name: 'Deux œufs durs', items: [{ foodId: 'oeuf', qty: 2 }] },
  { id: 'comp-poulet', name: 'Un filet de poulet', items: [{ foodId: 'poulet', qty: 1 }] },
  { id: 'comp-feta', name: 'Un morceau de feta', items: [{ foodId: 'feta', qty: 50 }] },
  { id: 'comp-emmental', name: '30 g d’emmental', items: [{ foodId: 'emmental', qty: 30 }] },
  { id: 'comp-mozzarella', name: 'Une demi-mozzarella', items: [{ foodId: 'mozzarella', qty: 0.5 }] },
  { id: 'comp-beurre-cacahuete', name: 'Une cuillère de beurre de cacahuète', items: [{ foodId: 'beurre-cacahuete', qty: 15 }] },
  { id: 'comp-amandes', name: '10 g d’amandes', items: [{ foodId: 'amandes', qty: 10 }] },
  { id: 'comp-noix', name: '10 g de noix', items: [{ foodId: 'noix', qty: 10 }] },
  { id: 'comp-noisettes', name: '10 g de noisettes', items: [{ foodId: 'noisettes', qty: 10 }] },
  { id: 'comp-pain', name: 'Une tranche de pain complet', items: [{ foodId: 'pain-complet', qty: 1 }] },
  { id: 'comp-houmous', name: 'Deux cuillères de houmous', items: [{ foodId: 'houmous', qty: 30 }] },
  { id: 'comp-chocolat', name: 'Un carré de chocolat noir', items: [{ foodId: 'chocolat-noir', qty: 10 }] },
  { id: 'comp-tomates', name: 'Des tomates cerises', items: [{ foodId: 'tomates-cerises', qty: 100 }] },
  { id: 'comp-carottes', name: 'Des carottes râpées', items: [{ foodId: 'carottes-rapees', qty: 100 }, { foodId: 'huile-olive', qty: 5 }] },
  { id: 'comp-concombre', name: 'Un demi-concombre', items: [{ foodId: 'concombre', qty: 0.5 }] },
  { id: 'comp-betteraves', name: 'Betteraves en vinaigrette', items: [{ foodId: 'betteraves', qty: 100 }, { foodId: 'huile-olive', qty: 5 }] },
  { id: 'comp-veloute', name: 'Un bol de velouté', items: [{ foodId: 'veloute', qty: 0.3 }] },
  { id: 'comp-pois-chiches', name: 'Pois chiches grillés', items: [{ foodId: 'pois-chiches', qty: 1 }, { foodId: 'huile-olive', qty: 5 }] },
  { id: 'comp-gaspacho', name: 'Gaspacho de courgette et feta', items: [{ foodId: 'courgette', qty: 1 }, { foodId: 'feta', qty: 100 }, { foodId: 'huile-olive', qty: 10 }] },
  { id: 'comp-twix', name: 'Une barre de Twix', items: [{ foodId: 'twix', qty: 1 }] },
  { id: 'comp-mms', name: 'Une poignée de M&M’s', items: [{ foodId: 'mms', qty: 30 }] },
  {
    id: 'comp-fondants',
    name: 'Deux mini-fondants',
    items: [
      { foodId: 'oeuf', qty: 0.5 },
      { foodId: 'farine', qty: 15 },
      { foodId: 'chocolat-poudre', qty: 12.5 },
      { foodId: 'cassonade', qty: 10 },
      { foodId: 'lait', qty: 37.5 },
      { foodId: 'beurre', qty: 15 },
    ],
  },
];

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Le catalogue personnel passe devant le catalogue livré : une entrée au même nom remplace
 * la version par défaut, sans la dupliquer.
 */
export function mergeComplements(ideas: SnackIdea[]): SnackIdea[] {
  const byName = new Map<string, SnackIdea>();
  for (const idea of DEFAULT_COMPLEMENTS) byName.set(norm(idea.name), idea);
  for (const idea of ideas) byName.set(norm(idea.name), idea);
  return [...byName.values()];
}

export function searchComplements(ideas: SnackIdea[], query: string): SnackIdea[] {
  const q = norm(query);
  return q ? ideas.filter((idea) => norm(idea.name).includes(q)) : ideas;
}
