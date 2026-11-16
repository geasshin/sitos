import { describe, expect, it } from 'vitest';
import { biggestContributor } from './balance';
import { indexFoods, ZERO } from './nutrition';
import type { Data, Food, Recipe } from './types';

const n = (kcal: number, satFat = 0) => ({ ...ZERO, kcal, satFat });

const foods: Food[] = [
  { id: 'beurre', name: 'Beurre', category: 'matières grasses', unit: 'g', per100: n(750, 50), storage: 'frigo', shelfLifeDays: 30 },
  { id: 'fromage', name: 'Fromage', category: 'laitiers', unit: 'g', per100: n(350, 30), storage: 'frigo', shelfLifeDays: 10 },
];

const recipe: Recipe = {
  id: 'r',
  name: 'Plat au beurre',
  status: 'maîtrisée',
  dish: 'Plat',
  favorite: false,
  portions: 2,
  ingredients: [
    { foodId: 'beurre', qty: 20 },
    { foodId: 'fromage', qty: 10 },
  ],
  steps: [],
};

const data: Data = {
  foods,
  stock: [],
  recipes: [recipe],
  plan: { startDate: '2026-11-16', entries: [{ id: 'c', date: '2026-11-16', kind: 'cook', recipeId: 'r', portions: 2 }] },
  journal: { snacks: [{ id: 's', date: '2026-11-16', label: 'Un carré de chocolat', items: [{ foodId: 'fromage', qty: 40 }] }], adjustments: [], weights: [] },
  settings: { kcalTarget: 2000, proteinTarget: 100, fiberTarget: 30, plantTargetG: 400, fruitsPerDay: 1, demo: true },
  snackIdeas: [],
};

describe('biggestContributor', () => {
  it('ramène la recette à la portion mangée et garde le plus gros contributeur', () => {
    const c = biggestContributor(data, indexFoods(foods), '2026-11-16', 'satFat');
    expect(c?.foodName).toBe('Fromage');
    expect(c?.value).toBeCloseTo(12);
    expect(c?.cookId).toBeUndefined();
  });

  it('cherche aussi dans les compléments et nomme le repas', () => {
    const c = biggestContributor(
      { ...data, journal: { snacks: [], adjustments: [], weights: [] } },
      indexFoods(foods),
      '2026-11-16',
      'satFat',
    );
    expect(c?.foodName).toBe('Beurre');
    expect(c?.value).toBeCloseTo(5);
    expect(c?.cookId).toBe('c');
  });
});
