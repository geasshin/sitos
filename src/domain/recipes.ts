import { parseOrder, type ParsedLine } from './order';
import { missingFor, type FoodStock } from './stock';
import { isPlannable, type Food, type Ingredient, type Recipe } from './types';

/**
 * Ce qu'on peut réellement cuisiner maintenant, et à quel point.
 * Un plat sans quantités chiffrées n'est jamais « réalisable » : il n'y a rien à comparer au stock.
 */
export function missingCount(recipe: Recipe, stock: Map<string, FoodStock>): number | undefined {
  if (!isPlannable(recipe)) return undefined;
  return missingFor(recipe, stock).length;
}

export const makeable = (recipe: Recipe, stock: Map<string, FoodStock>) => missingCount(recipe, stock) === 0;

/**
 * Proposer un rattachement au stock pour les ingrédients écrits en clair.
 * Chaque ligne garde son texte d'origine : l'écran montre la proposition, l'utilisateur corrige.
 */
export interface LinkRow extends ParsedLine {
  /** Ligne d'ingrédient déjà prête à enregistrer (absente si rien n'a été reconnu). */
  ingredient?: Ingredient;
}

export function linkProposal(lines: string[], foods: Food[]): LinkRow[] {
  const parsed = parseOrder(lines.join('\n'), foods);
  return parsed.map((p) => ({
    ...p,
    ingredient: p.foodId && p.qty !== undefined ? { foodId: p.foodId, qty: p.qty } : undefined,
  }));
}

/**
 * Changer de produit dans l'assistant de liaison : une quantité exprimée dans
 * l'unité de l'ancien produit n'a aucun sens dans celle du nouveau
 * (« 200 » grammes de bananes ne font pas 200 bananes). On convertit quand le
 * poids d'une pièce est connu, sinon on repart d'une quantité plausible.
 */
export function requantify(prev: Food | undefined, next: Food | undefined, qty: number): number {
  if (!next) return qty;
  if (!prev || prev.unit === next.unit) return qty > 0 ? qty : next.unit === 'pièce' ? 1 : 100;
  if (prev.unit === 'g' && next.unit === 'pièce' && next.gramsPerUnit) return Math.max(1, Math.round(qty / next.gramsPerUnit));
  if (prev.unit === 'ml' && next.unit === 'pièce' && next.gramsPerUnit) return Math.max(1, Math.round(qty / next.gramsPerUnit));
  if (prev.unit === 'pièce' && next.unit === 'g' && prev.gramsPerUnit) return Math.round(qty * prev.gramsPerUnit);
  if (prev.unit === 'pièce' && next.unit === 'ml' && prev.gramsPerUnit) return Math.round(qty * prev.gramsPerUnit);
  return next.unit === 'pièce' ? 1 : (next.pack?.size ?? 100);
}

/** Fusionne des propositions en ingrédients, en additionnant un aliment présent deux fois. */
export function mergeIngredients(rows: { foodId?: string; qty?: number }[]): Ingredient[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (!r.foodId || r.qty === undefined || r.qty <= 0) continue;
    by.set(r.foodId, (by.get(r.foodId) ?? 0) + r.qty);
  }
  return [...by.entries()].map(([foodId, qty]) => ({ foodId, qty: Math.round(qty * 100) / 100 }));
}
