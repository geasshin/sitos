import type { FoodIndex } from './nutrition';
import { cookIngredients } from './nutrition';
import type { Data, Food, ISODate } from './types';
import type { FoodStock, Forecast } from './stock';

/**
 * La liste de courses, en trois tas :
 * - ce qui manque pour les plats du plan (manques projetés) ;
 * - ce qui va finir avant la prochaine utilisation (presque fini) ;
 * - les produits de base dont il ne reste rien (épicerie, matières grasses).
 * Rien n'est commandé : la liste se copie et se lit.
 */

export type ShoppingReason = 'manque' | 'bientôt fini' | 'base';

export interface ShoppingLine {
  food: Food;
  qty: number;
  reason: ShoppingReason;
  /** Premier jour où ça manque, ou prochaine utilisation. */
  date?: ISODate;
}

export interface ShoppingList {
  missing: ShoppingLine[];
  low: ShoppingLine[];
  basics: ShoppingLine[];
}

const roundQty = (food: Food, qty: number) => {
  if (food.unit === 'pièce') return Math.max(1, Math.ceil(qty));
  return Math.max(1, Math.round(qty / 10) * 10);
};

const packSize = (food: Food) => (food.pack?.size && food.pack.size > 0 ? food.pack.size : food.unit === 'pièce' ? 1 : 100);

export function shoppingList(data: Data, stock: Map<string, FoodStock>, forecast: Forecast, foods: FoodIndex): ShoppingList {
  const byId = new Map(foods);
  const missing = new Map<string, ShoppingLine>();
  for (const s of forecast.shortages) {
    const food = byId.get(s.foodId);
    if (!food) continue;
    const prev = missing.get(s.foodId);
    missing.set(s.foodId, {
      food,
      qty: roundQty(food, (prev?.qty ?? 0) + s.missing),
      reason: 'manque',
      date: prev?.date && prev.date < s.date ? prev.date : s.date,
    });
  }

  // Ce qui va finir : un plat l'utilise avant qu'il en reste assez.
  const low: ShoppingLine[] = [];
  for (const s of stock.values()) {
    if (s.remaining <= 1e-6 || missing.has(s.food.id)) continue;
    const next = forecast.nextUse.get(s.food.id);
    if (!next) continue;
    const need = data.plan.entries
      .filter((e) => e.kind === 'cook' && !e.done && e.date === next)
      .flatMap((e) => {
        const recipe = e.recipeId ? data.recipes.find((r) => r.id === e.recipeId) : undefined;
        const items = e.ingredients ?? (recipe ? cookIngredients(recipe, e.portions ?? 1) : []);
        return items.filter((i) => i.foodId === s.food.id).map((i) => i.qty);
      })
      .reduce((a, b) => a + b, 0);
    if (need > 0 && s.remaining < need) {
      low.push({ food: s.food, qty: roundQty(s.food, need - s.remaining), reason: 'bientôt fini', date: next });
    }
  }

  // Les produits de base : rien en stock, et pas déjà comptés comme manque.
  const basics: ShoppingLine[] = [];
  for (const food of data.foods) {
    if (food.category !== 'épicerie' && food.category !== 'matières grasses') continue;
    if (missing.has(food.id) || low.some((l) => l.food.id === food.id)) continue;
    const s = stock.get(food.id);
    if (s && s.remaining > 1e-6) continue;
    basics.push({ food, qty: packSize(food), reason: 'base' });
  }

  const byDate = (a: ShoppingLine, b: ShoppingLine) => ((a.date ?? '9999') < (b.date ?? '9999') ? -1 : 1);
  return {
    missing: [...missing.values()].sort(byDate),
    low: low.sort(byDate),
    basics: basics.sort((a, b) => a.food.name.localeCompare(b.food.name, 'fr')),
  };
}

/** Texte prêt à coller dans une note ou un message. */
export function shoppingText(list: ShoppingList, qty: (food: Food, n: number) => string): string {
  const section = (title: string, lines: ShoppingLine[]) =>
    lines.length === 0 ? [] : [title, ...lines.map((l) => `- ${qty(l.food, l.qty)}`)];
  return [...section('Il manque', list.missing), ...section('Presque fini', list.low), ...section('Produits de base', list.basics)].join('\n');
}
