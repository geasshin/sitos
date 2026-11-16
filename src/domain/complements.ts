import type { Ingredient, SnackIdea } from './types';

/**
 * Catalogue livré avec l'app. Chaque entrée décrit une base ajustable : un œuf, une clémentine,
 * 100 g de fromage blanc, etc. L'utilisateur choisit le nombre de pièces ou de grammes avant l'ajout ;
 * `scaledItems` multiplie la base, sans jamais toucher à la fiche de recette.
 *
 * Valeurs : table Ciqual 2020 de l'ANSES reprise dans `starter/foods.json` (champ `source`).
 * Les aliments absents d'une installation ancienne sont ignorés à l'affichage.
 */
export const DEFAULT_COMPLEMENTS: SnackIdea[] = [
  { id: 'comp-skyr', name: 'Skyr nature', items: [{ foodId: 'skyr', qty: 1 }] },
  { id: 'comp-skyr-chocolat', name: 'Skyr au chocolat', items: [{ foodId: 'skyr', qty: 1 }, { foodId: 'chocolat-poudre', qty: 10 }] },
  { id: 'comp-banane', name: 'Banane', items: [{ foodId: 'banane', qty: 1 }] },
  { id: 'comp-pomme', name: 'Pomme', items: [{ foodId: 'pomme', qty: 1 }] },
  { id: 'comp-clementine', name: 'Clémentine', items: [{ foodId: 'clementine', qty: 1 }] },
  { id: 'comp-kiwi', name: 'Kiwi', items: [{ foodId: 'kiwi', qty: 1 }] },
  { id: 'comp-compote', name: 'Compote de pomme', items: [{ foodId: 'compote', qty: 1 }] },
  { id: 'comp-abricots', name: 'Abricots secs', items: [{ foodId: 'abricots-secs', qty: 10 }] },
  { id: 'comp-raisins-secs', name: 'Raisins secs', items: [{ foodId: 'raisins-secs', qty: 10 }] },
  { id: 'comp-lait', name: 'Verre de lait', items: [{ foodId: 'lait', qty: 250 }] },
  { id: 'comp-lait-chocolat', name: 'Lait chocolaté', items: [{ foodId: 'lait', qty: 250 }, { foodId: 'chocolat-poudre', qty: 15 }] },
  { id: 'comp-yaourt', name: 'Yaourt nature', items: [{ foodId: 'yaourt', qty: 1 }] },
  { id: 'comp-fromage-blanc', name: 'Fromage blanc', items: [{ foodId: 'fromage-blanc', qty: 100 }] },
  { id: 'comp-oeufs', name: 'Œuf dur', items: [{ foodId: 'oeuf', qty: 1 }] },
  { id: 'comp-poulet', name: 'Filet de poulet', items: [{ foodId: 'poulet', qty: 1 }] },
  { id: 'comp-soja', name: 'Protéines de soja texturées', items: [{ foodId: 'soja-texture', qty: 30 }] },
  { id: 'comp-lentilles', name: 'Lentilles vertes cuites', items: [{ foodId: 'lentilles-vertes', qty: 100 }] },
  { id: 'comp-haricots', name: 'Haricots rouges', items: [{ foodId: 'haricots-rouges', qty: 0.5 }] },
  { id: 'comp-pois-chiches', name: 'Pois chiches', items: [{ foodId: 'pois-chiches', qty: 1 }] },
  { id: 'comp-feta', name: 'Feta', items: [{ foodId: 'feta', qty: 50 }] },
  { id: 'comp-emmental', name: 'Emmental', items: [{ foodId: 'emmental', qty: 30 }] },
  { id: 'comp-cheddar', name: 'Cheddar', items: [{ foodId: 'cheddar', qty: 1 }] },
  { id: 'comp-mozzarella', name: 'Mozzarella', items: [{ foodId: 'mozzarella', qty: 0.5 }] },
  { id: 'comp-fromage-tartiner', name: 'Fromage à tartiner', items: [{ foodId: 'fromage-tartiner', qty: 20 }] },
  { id: 'comp-beurre-cacahuete', name: 'Beurre de cacahuète', items: [{ foodId: 'beurre-cacahuete', qty: 15 }] },
  { id: 'comp-amandes', name: 'Amandes', items: [{ foodId: 'amandes', qty: 10 }] },
  { id: 'comp-noix', name: 'Noix', items: [{ foodId: 'noix', qty: 10 }] },
  { id: 'comp-noisettes', name: 'Noisettes', items: [{ foodId: 'noisettes', qty: 10 }] },
  { id: 'comp-pain', name: 'Pain complet', items: [{ foodId: 'pain-complet', qty: 1 }] },
  { id: 'comp-houmous', name: 'Houmous', items: [{ foodId: 'houmous', qty: 30 }] },
  { id: 'comp-chocolat', name: 'Chocolat noir', items: [{ foodId: 'chocolat-noir', qty: 10 }] },
  { id: 'comp-cacao', name: 'Cacao non sucré', items: [{ foodId: 'cacao', qty: 10 }] },
  { id: 'comp-tomates', name: 'Tomates cerises', items: [{ foodId: 'tomates-cerises', qty: 100 }] },
  { id: 'comp-carottes', name: 'Carottes râpées', items: [{ foodId: 'carottes-rapees', qty: 100 }, { foodId: 'huile-olive', qty: 5 }] },
  { id: 'comp-carotte', name: 'Carotte', items: [{ foodId: 'carotte', qty: 100 }] },
  { id: 'comp-concombre', name: 'Concombre', items: [{ foodId: 'concombre', qty: 0.5 }] },
  { id: 'comp-betteraves', name: 'Betteraves', items: [{ foodId: 'betteraves', qty: 100 }, { foodId: 'huile-olive', qty: 5 }] },
  { id: 'comp-poivron', name: 'Poivron rouge', items: [{ foodId: 'poivron', qty: 0.5 }] },
  { id: 'comp-olives', name: 'Olives vertes', items: [{ foodId: 'olives', qty: 30 }] },
  { id: 'comp-veloute', name: 'Velouté de courgette', items: [{ foodId: 'veloute', qty: 0.3 }] },
  { id: 'comp-gaspacho', name: 'Gaspacho courgette-feta', items: [{ foodId: 'courgette', qty: 1 }, { foodId: 'feta', qty: 100 }, { foodId: 'huile-olive', qty: 10 }] },
  { id: 'comp-twix', name: 'Twix', items: [{ foodId: 'twix', qty: 1 }] },
  { id: 'comp-mms', name: 'M&M’s', items: [{ foodId: 'mms', qty: 30 }] },
  {
    id: 'comp-fondants',
    name: 'Mini-fondants au chocolat',
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

// Les idées enregistrées avant le passage aux bases ajustables gardent leur quantité,
// mais prennent le nom court du catalogue pour ne pas apparaître deux fois.
const LEGACY_NAMES: Record<string, string> = {
  'un skyr nature': 'Skyr nature',
  'skyr au chocolat': 'Skyr au chocolat',
  'une banane': 'Banane',
  'une pomme': 'Pomme',
  'deux clémentines': 'Clémentine',
  'un kiwi': 'Kiwi',
  'une compote': 'Compote de pomme',
  'trois abricots secs': 'Abricots secs',
  'un verre de lait': 'Verre de lait',
  'lait chocolaté': 'Lait chocolaté',
  'un yaourt nature': 'Yaourt nature',
  '100 g de fromage blanc': 'Fromage blanc',
  'deux œufs durs': 'Œuf dur',
  'un filet de poulet': 'Filet de poulet',
  'un morceau de feta': 'Feta',
  '30 g d’emmental': 'Emmental',
  'une demi-mozzarella': 'Mozzarella',
  'une cuillère de beurre de cacahuète': 'Beurre de cacahuète',
  '10 g d’amandes': 'Amandes',
  '10 g de noix': 'Noix',
  '10 g de noisettes': 'Noisettes',
  'une tranche de pain complet': 'Pain complet',
  'deux cuillères de houmous': 'Houmous',
  'un carré de chocolat noir': 'Chocolat noir',
  'des tomates cerises': 'Tomates cerises',
  'des carottes râpées': 'Carottes râpées',
  'un demi-concombre': 'Concombre',
  'betteraves en vinaigrette': 'Betteraves',
  'un bol de velouté': 'Velouté de courgette',
  'pois chiches grillés': 'Pois chiches',
  'gaspacho de courgette et feta': 'Gaspacho courgette-feta',
  'une barre de twix': 'Twix',
  'une poignée de m&m’s': 'M&M’s',
  'deux mini-fondants': 'Mini-fondants au chocolat',
};

/** Quantité de départ d'une entrée, prise sur son premier ingrédient. */
export const baseAmount = (idea: { items: Ingredient[] }) => idea.items[0]?.qty || 1;

/** Quantité d'une base multipliée par le nombre de pièces ou de grammes choisi. */
export function scaledItems(idea: { items: Ingredient[] }, amount: number): Ingredient[] {
  const factor = amount / baseAmount(idea);
  return idea.items.map((item) => ({ ...item, qty: Math.round(item.qty * factor * 100) / 100 }));
}

/**
 * Le catalogue personnel passe devant le catalogue livré : une entrée au même nom remplace
 * la version par défaut, sans la dupliquer.
 */
export function mergeComplements(ideas: SnackIdea[]): SnackIdea[] {
  const byName = new Map<string, SnackIdea>();
  for (const idea of DEFAULT_COMPLEMENTS) byName.set(norm(idea.name), idea);
  for (const idea of ideas) {
    const name = LEGACY_NAMES[norm(idea.name)] ?? idea.name;
    byName.set(norm(name), { ...idea, name });
  }
  return [...byName.values()];
}

export function searchComplements(ideas: SnackIdea[], query: string): SnackIdea[] {
  const q = norm(query);
  return q ? ideas.filter((idea) => norm(idea.name).includes(q)) : ideas;
}
