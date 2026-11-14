import { createContext, useContext, useMemo } from 'react';
import { addDays } from './domain/dates';
import { indexFoods, recipePortion, type FoodIndex, type PortionInfo } from './domain/nutrition';
import { validatePlan, type PlanWarning } from './domain/plan';
import { computeStock, forecast, priorities, type FoodStock, type Forecast, type Priority } from './domain/stock';
import type { Data, ISODate, Recipe } from './domain/types';
import { targetsOf, type Targets } from './domain/targets';
import type { Store } from './store';

export interface Derived {
  today: ISODate;
  foods: FoodIndex;
  stock: Map<string, FoodStock>;
  forecast: Forecast;
  priorities: Priority[];
  warnings: PlanWarning[];
  portions: Map<string, PortionInfo>;
  recipe: (id: string | undefined) => Recipe | undefined;
  planEnd: ISODate;
  /** Objectifs nutritionnels en vigueur. */
  targets: Targets;
}

export function derive(data: Data, today: ISODate): Derived {
  const foods = indexFoods(data.foods);
  const stock = computeStock(data, foods, today);
  const fc = forecast(data, stock, today);
  const recipesById = new Map(data.recipes.map((r) => [r.id, r]));
  const lastEntry = data.plan.entries.reduce((m, e) => (e.date > m ? e.date : m), data.plan.startDate);
  return {
    today,
    foods,
    stock,
    forecast: fc,
    priorities: priorities(data, stock, fc, today, 14),
    warnings: validatePlan(data.plan.entries, data.recipes, today),
    portions: new Map(data.recipes.map((r) => [r.id, recipePortion(foods, r)])),
    recipe: (id) => (id ? recipesById.get(id) : undefined),
    planEnd: lastEntry < addDays(today, 6) ? addDays(today, 6) : lastEntry,
    targets: targetsOf(data.settings),
  };
}

export function useDerived(data: Data, today: ISODate) {
  return useMemo(() => derive(data, today), [data, today]);
}

export type View = 'today' | 'calendar' | 'stock' | 'nutrition' | 'recipes' | 'weight';

/** Adresse interne : #/recipes, #/recipes/<id>, #/recipes/<id>/modifier, #/recipes/nouvelle */
export interface Route {
  view: View;
  recipeId?: string;
  edit?: boolean;
}

export interface AppContextValue extends Derived {
  data: Data;
  store: Store;
  route: Route;
  openRecipe: (id: string) => void;
  editRecipe: (id: string) => void;
  goTo: (view: View, date?: ISODate) => void;
  back: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext manquant');
  return ctx;
}
