import { portionsOf, type Data, type Food, type Ingredient, type ISODate, type Nutrients, type PlanEntry, type Recipe } from './types';

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

export function add(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: a.fiber + b.fiber,
  };
}

export function scale(a: Nutrients, k: number): Nutrients {
  return {
    kcal: a.kcal * k,
    protein: a.protein * k,
    carbs: a.carbs * k,
    fat: a.fat * k,
    fiber: a.fiber * k,
  };
}

/** Quantité exprimée en grammes (ou ml, assimilés à des grammes). */
export function toGrams(food: Food, qty: number): number {
  return food.unit === 'pièce' ? qty * (food.gramsPerUnit ?? 100) : qty;
}

export type FoodIndex = Map<string, Food>;

export function indexFoods(foods: Food[]): FoodIndex {
  return new Map(foods.map((f) => [f.id, f]));
}

export function ingredientNutrients(foods: FoodIndex, ing: Ingredient): Nutrients {
  const food = foods.get(ing.foodId);
  if (!food) return ZERO;
  return scale(food.per100, toGrams(food, ing.qty) / 100);
}

export function itemsNutrients(foods: FoodIndex, items: Ingredient[]): Nutrients {
  return items.reduce((acc, ing) => add(acc, ingredientNutrients(foods, ing)), ZERO);
}

/** Grammes de légumes et fruits dans une liste d'ingrédients. */
export function plantGrams(foods: FoodIndex, items: Ingredient[]): number {
  return items.reduce((acc, ing) => {
    const food = foods.get(ing.foodId);
    if (!food || (food.category !== 'légumes' && food.category !== 'fruits')) return acc;
    return acc + toGrams(food, ing.qty);
  }, 0);
}

export interface PortionInfo {
  nutrients: Nutrients;
  plantG: number;
}

export function recipePortion(foods: FoodIndex, recipe: Recipe): PortionInfo {
  const items = recipe.ingredients ?? [];
  const n = portionsOf(recipe);
  return {
    nutrients: scale(itemsNutrients(foods, items), 1 / n),
    plantG: plantGrams(foods, items) / n,
  };
}

/** Ingrédients d'une cuisson, mis à l'échelle du nombre de portions préparées. */
export function cookIngredients(recipe: Recipe, portions: number): Ingredient[] {
  const k = portions / portionsOf(recipe);
  return (recipe.ingredients ?? []).map((i) => ({ ...i, qty: i.qty * k }));
}

/** Recette de la bibliothèque mangée ce jour-là (cuisson ou reste), ou undefined. */
export function recipeOfEntry(data: Pick<Data, 'plan' | 'recipes'>, entry: PlanEntry | undefined): Recipe | undefined {
  return mealOf(data, entry)?.recipe;
}

/** Un repas tel qu'il est cuisiné : la fiche éventuelle, et surtout les ingrédients de cette cuisson. */
export interface Meal {
  cook: PlanEntry;
  recipe?: Recipe;
  name: string;
  portions: number;
  ingredients: Ingredient[];
  fridgeDays: number;
  /** Plat composé sans fiche. */
  custom: boolean;
  /** Quantités modifiées pour ce repas (la fiche n'a pas bougé). */
  adjusted: boolean;
}

export function mealOfCook(recipes: Recipe[], cook: PlanEntry): Meal {
  const recipe = cook.recipeId ? recipes.find((r) => r.id === cook.recipeId) : undefined;
  const portions = cook.portions ?? (recipe ? portionsOf(recipe) : 1);
  return {
    cook,
    recipe,
    name: cook.title ?? recipe?.name ?? 'Plat maison',
    portions,
    ingredients: cook.ingredients ?? (recipe ? cookIngredients(recipe, portions) : []),
    fridgeDays: recipe?.fridgeDays ?? 3,
    custom: !recipe,
    adjusted: !!recipe && !!cook.ingredients,
  };
}

/** Le repas d'une case du plan (cuisson ou reste), ou undefined pour un jour dehors ou libre. */
export function mealOf(data: Pick<Data, 'plan' | 'recipes'>, entry: PlanEntry | undefined): Meal | undefined {
  if (!entry || entry.kind === 'out') return undefined;
  const cook = entry.kind === 'cook' ? entry : data.plan.entries.find((e) => e.id === entry.batchId);
  return cook ? mealOfCook(data.recipes, cook) : undefined;
}

/** Valeurs d'un repas : les ingrédients de la cuisson divisés par le nombre de repas. */
export function mealPortion(foods: FoodIndex, meal: Meal): PortionInfo {
  const n = Math.max(1, meal.portions);
  return {
    nutrients: scale(itemsNutrients(foods, meal.ingredients), 1 / n),
    plantG: plantGrams(foods, meal.ingredients) / n,
  };
}

export interface DayNutrition {
  date: ISODate;
  meal?: PortionInfo;
  snacks: PortionInfo;
  total: Nutrients;
  plantG: number;
  /** Repas pris dehors : non compté. */
  out: boolean;
  /** Aucun repas prévu. */
  empty: boolean;
}

export function dayNutrition(data: Data, foods: FoodIndex, date: ISODate): DayNutrition {
  const entry = data.plan.entries.find((e) => e.date === date);
  const m = mealOf(data, entry);
  const meal = m && m.ingredients.length > 0 ? mealPortion(foods, m) : undefined;
  const snackItems = data.journal.snacks.filter((s) => s.date === date).flatMap((s) => s.items);
  const snacks = { nutrients: itemsNutrients(foods, snackItems), plantG: plantGrams(foods, snackItems) };
  return {
    date,
    meal,
    snacks,
    total: add(meal?.nutrients ?? ZERO, snacks.nutrients),
    plantG: (meal?.plantG ?? 0) + snacks.plantG,
    out: entry?.kind === 'out',
    empty: !entry,
  };
}

export function average(days: DayNutrition[]): { nutrients: Nutrients; plantG: number; count: number } {
  const counted = days.filter((d) => d.meal);
  if (counted.length === 0) return { nutrients: ZERO, plantG: 0, count: 0 };
  const sum = counted.reduce((acc, d) => add(acc, d.total), ZERO);
  const plant = counted.reduce((acc, d) => acc + d.plantG, 0);
  return { nutrients: scale(sum, 1 / counted.length), plantG: plant / counted.length, count: counted.length };
}
