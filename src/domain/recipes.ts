import { parseOrder, type ParsedLine } from './order';
import { amount, missingFor, type FoodStock } from './stock';
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

const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'recette';

/** Identifiant lisible et libre pour une nouvelle fiche : « riz-saute », puis « riz-saute-2 »… */
export function newRecipeId(name: string, recipes: Recipe[]): string {
  const base = slugify(name);
  let id = base;
  for (let i = 2; recipes.some((r) => r.id === id); i++) id = `${base}-${i}`;
  return id;
}

/**
 * Un plat maison du calendrier devient une fiche de la bibliothèque : son nom, ses quantités
 * pour le nombre de repas cuisinés, et une liste écrite en clair pour la page de la recette.
 */
export function recipeFromMeal(
  meal: { title: string; portions: number; ingredients: Ingredient[] },
  foods: Map<string, Food>,
  recipes: Recipe[],
  now = new Date(),
): Recipe {
  const name = meal.title.trim() || 'Plat maison';
  const portions = Math.max(1, Math.round(meal.portions));
  return {
    id: newRecipeId(name, recipes),
    name,
    status: 'à découvrir',
    dish: 'Plat',
    favorite: false,
    steps: [],
    createdAt: now.toISOString(),
    portions,
    servings: `${portions} repas`,
    ingredients: meal.ingredients.map((i) => ({ ...i })),
    ingredientsText: meal.ingredients.map((i) => {
      const text = amount(foods.get(i.foodId), i.qty);
      return text.charAt(0).toUpperCase() + text.slice(1);
    }),
  };
}
