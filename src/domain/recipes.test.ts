import { describe, expect, it } from 'vitest';
import { linkProposal, makeable, mergeIngredients, missingCount, requantify } from './recipes';
import { ZERO } from './nutrition';
import type { FoodStock } from './stock';
import type { Food, Recipe } from './types';

const n = { ...ZERO, kcal: 100 };
const food = (id: string, name: string, unit: Food['unit'], extra: Partial<Food> = {}): Food => ({
  id,
  name,
  unit,
  category: 'légumes',
  per100: n,
  storage: 'frigo',
  shelfLifeDays: 5,
  ...extra,
});
const foods: Food[] = [
  food('courgette', 'Courgette', 'pièce', { gramsPerUnit: 200 }),
  food('riz', 'Riz blanc', 'g', { category: 'féculents', storage: 'placard' }),
  food('feta', 'Feta', 'g'),
  food('huile-olive', 'Huile d’olive', 'ml', { category: 'épicerie', storage: 'placard' }),
];

const recipe = (extra: Partial<Recipe> = {}): Recipe => ({
  id: 'r',
  name: 'Test',
  status: 'à découvrir',
  dish: 'Plat',
  favorite: false,
  steps: [],
  ...extra,
});

const stockOf = (entries: Record<string, number>) => {
  const m = new Map<string, FoodStock>();
  for (const [id, remaining] of Object.entries(entries)) m.set(id, { food: { id } as Food, remaining } as FoodStock);
  return m;
};

describe('ce que je peux cuisiner maintenant', () => {
  it('est réalisable quand tout y est', () => {
    const r = recipe({ ingredients: [{ foodId: 'riz', qty: 100 }] });
    expect(makeable(r, stockOf({ riz: 150 }))).toBe(true);
    expect(missingCount(r, stockOf({ riz: 150 }))).toBe(0);
  });

  it('compte les produits manquants', () => {
    const r = recipe({ ingredients: [{ foodId: 'riz', qty: 100 }, { foodId: 'feta', qty: 100 }] });
    expect(makeable(r, stockOf({ riz: 150 }))).toBe(false);
    expect(missingCount(r, stockOf({ riz: 150 }))).toBe(1);
  });

  it('ne dit rien d’un plat sans quantités', () => {
    const r = recipe({ ingredientsText: ['200 g de riz'] });
    expect(missingCount(r, stockOf({ riz: 500 }))).toBeUndefined();
    expect(makeable(r, stockOf({ riz: 500 }))).toBe(false);
  });
});

describe('relier des ingrédients écrits en clair', () => {
  it('reconnaît les quantités et les produits', () => {
    const rows = linkProposal(['1 courgette', '200 g de riz blanc', '100 g de feta', 'sel et poivre'], foods);
    expect(rows[0].ingredient).toEqual({ foodId: 'courgette', qty: 1 });
    expect(rows[1].ingredient).toEqual({ foodId: 'riz', qty: 200 });
    expect(rows[2].ingredient).toEqual({ foodId: 'feta', qty: 100 });
    expect(rows[3].ingredient).toBeUndefined();
  });

  it('laisse la ligne d’origine, même quand le produit est reconnu', () => {
    const rows = linkProposal(['200 g de riz basmati'], foods);
    expect(rows[0].line).toBe('200 g de riz basmati');
    expect(rows[0].foodId).toBe('riz');
  });

  it('convertit la quantité quand l’unité change', () => {
    const banane = food('banane', 'Bananes', 'pièce', { gramsPerUnit: 120 });
    const farine = food('farine', 'Farine', 'g');
    // 200 g de bananes, ce n'est pas 200 bananes.
    expect(requantify(farine, banane, 200)).toBe(2);
    expect(requantify(banane, farine, 2)).toBe(240);
    // Un produit choisi sans quantité part d'une base plausible.
    expect(requantify(undefined, banane, 0)).toBe(1);
    expect(requantify(undefined, farine, 0)).toBe(100);
    // Même unité : la quantité est gardée.
    expect(requantify(farine, food('riz', 'Riz', 'g'), 150)).toBe(150);
  });

  it('additionne un aliment écrit deux fois', () => {
    expect(mergeIngredients([{ foodId: 'riz', qty: 100 }, { foodId: 'riz', qty: 50 }, { foodId: 'feta', qty: 100 }])).toEqual([
      { foodId: 'riz', qty: 150 },
      { foodId: 'feta', qty: 100 },
    ]);
  });

  it('ignore les lignes vides ou sans quantité', () => {
    expect(mergeIngredients([{ foodId: 'riz', qty: 0 }, { foodId: undefined, qty: 10 }, { foodId: 'feta' }])).toEqual([]);
  });
});
