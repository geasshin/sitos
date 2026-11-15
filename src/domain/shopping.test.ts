import { describe, expect, it } from 'vitest';
import { indexFoods, ZERO } from './nutrition';
import { computeStock, forecast } from './stock';
import { shoppingList, shoppingText } from './shopping';
import type { Data, Food, Recipe } from './types';

const n = (kcal: number) => ({ ...ZERO, kcal });
const food = (id: string, name: string, unit: Food['unit'], extra: Partial<Food> = {}): Food => ({
  id,
  name,
  unit,
  category: 'légumes',
  per100: n(50),
  storage: 'frigo',
  shelfLifeDays: 10,
  ...extra,
});

const foods: Food[] = [
  food('courgette', 'Courgette', 'pièce', { gramsPerUnit: 200 }),
  food('riz', 'Riz', 'g', { category: 'féculents', storage: 'placard', shelfLifeDays: 300 }),
  food('sel', 'Sel', 'g', { category: 'épicerie', storage: 'placard', shelfLifeDays: 900, pack: { size: 1000, label: '1 kg' } }),
];

const recipe: Recipe = {
  id: 'r', name: 'Riz courgettes', status: 'maîtrisée', dish: 'Plat', favorite: false, portions: 1,
  ingredients: [{ foodId: 'riz', qty: 300 }, { foodId: 'courgette', qty: 2 }], steps: [],
};

const data: Data = {
  foods,
  recipes: [recipe],
  stock: [
    { id: 'p1', foodId: 'riz', qty: 100, receivedAt: '2026-11-14' },
    { id: 'p2', foodId: 'courgette', qty: 1, receivedAt: '2026-11-14' },
  ],
  plan: { startDate: '2026-11-14', entries: [{ id: 'c1', date: '2026-11-16', kind: 'cook', recipeId: 'r', portions: 1 }] },
  journal: { snacks: [], adjustments: [], weights: [] },
  settings: { kcalTarget: 2000, proteinTarget: 100, fiberTarget: 30, plantTargetG: 400, fruitsPerDay: 1, demo: true },
  snackIdeas: [],
};

describe('liste de courses', () => {
  const stock = computeStock(data, indexFoods(foods), '2026-11-14');
  const fc = forecast(data, stock, '2026-11-14');
  const list = shoppingList(data, stock, fc, indexFoods(foods));

  it('met en tête ce qui manque pour le plan', () => {
    expect(list.missing.map((l) => [l.food.id, l.qty])).toEqual([
      ['riz', 200],
      ['courgette', 1],
    ]);
    expect(list.missing[0].date).toBe('2026-11-16');
  });

  it('ne répète pas dans « presque fini » ce qui manque déjà', () => {
    expect(list.low).toEqual([]);
    expect(list.missing.every((m) => !list.low.some((l) => l.food.id === m.food.id))).toBe(true);
  });

  it('propose les produits de base absents du stock', () => {
    expect(list.basics.map((l) => l.food.id)).toContain('sel');
    expect(list.basics.find((l) => l.food.id === 'sel')!.qty).toBe(1000);
  });

  it('écrit une liste copiable, sans section vide', () => {
    const text = shoppingText(list, (f, q) => `${q} ${f.name}`);
    expect(text).toContain('Il manque');
    expect(text).toContain('- 200 Riz');
    expect(text).not.toContain('\n\n');
  });
});
