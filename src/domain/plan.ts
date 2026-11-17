import { addDays, diffDays } from './dates';
import { cookIngredients, mealOfCook } from './nutrition';
import { portionsOf, type Ingredient, type ISODate, type PlanEntry, type Recipe } from './types';

export const newId = (prefix = 'e') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const byDate = (a: PlanEntry, b: PlanEntry) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Un bloc = une cuisson et ses restes, ou un repas dehors. */
export function blockOf(entries: PlanEntry[], id: string): PlanEntry[] {
  const e = entries.find((x) => x.id === id);
  if (!e) return [];
  const rootId = e.kind === 'leftover' ? e.batchId : e.kind === 'cook' ? e.id : undefined;
  if (!rootId) return [e];
  return entries.filter((x) => x.id === rootId || (x.kind === 'leftover' && x.batchId === rootId)).sort(byDate);
}

/** Décale d'un cran tous les repas non faits à partir d'une date. */
export function shiftFrom(entries: PlanEntry[], from: ISODate, n: number): PlanEntry[] {
  return entries.map((e) => (!e.done && e.date >= from ? { ...e, date: addDays(e.date, n) } : e));
}

function freeRun(entries: PlanEntry[], from: ISODate, max: number): number {
  const taken = new Set(entries.map((e) => e.date));
  let n = 0;
  while (n < max && !taken.has(addDays(from, n))) n++;
  return n;
}

/**
 * Pose un bloc à partir de `at`. Si les jours sont libres, rien ne bouge ;
 * sinon la suite du plan est décalée juste ce qu'il faut.
 */
export function insertBlock(entries: PlanEntry[], block: PlanEntry[], at: ISODate): PlanEntry[] {
  const len = block.length;
  const free = freeRun(entries, at, len);
  const shifted = free >= len ? entries : shiftFrom(entries, at, len - free);
  const placed = block.map((e, i) => ({ ...e, date: addDays(at, i) }));
  return [...shifted, ...placed].sort(byDate);
}

const leftover = (batchId: string): PlanEntry => ({ id: newId('r'), date: '', kind: 'leftover', batchId });

function makeBlock(cook: Omit<PlanEntry, 'id' | 'date' | 'kind'>, portions: number): PlanEntry[] {
  const c: PlanEntry = { id: newId('c'), date: '', kind: 'cook', ...cook, portions };
  return [c, ...Array.from({ length: Math.max(0, portions - 1) }, () => leftover(c.id))];
}

export function makeCookBlock(recipe: Recipe, portions = portionsOf(recipe)): PlanEntry[] {
  // Une fiche sans quantités reliées au stock part avec une liste vide, à remplir pour ce repas.
  return makeBlock({ recipeId: recipe.id, ...(recipe.ingredients?.length ? {} : { ingredients: [] }) }, portions);
}

export function planRecipe(entries: PlanEntry[], at: ISODate, recipe: Recipe, portions = portionsOf(recipe)) {
  return insertBlock(entries, makeCookBlock(recipe, portions), at);
}

/** Un plat composé sans fiche : un nom, des ingrédients à ajouter. */
export function planCustom(entries: PlanEntry[], at: ISODate, title: string, portions = 1, ingredients: Ingredient[] = []) {
  return insertBlock(entries, makeBlock({ title, ingredients }, portions), at);
}

/** Ingrédients propres à une cuisson ; undefined revient à ceux de la fiche. La fiche n'est jamais modifiée. */
export function setIngredients(entries: PlanEntry[], cookId: string, ingredients: Ingredient[] | undefined): PlanEntry[] {
  return entries.map((e) => {
    if (e.id !== cookId) return e;
    const { ingredients: _old, ...rest } = e;
    return ingredients ? { ...rest, ingredients } : rest;
  });
}

/**
 * Change le nombre de repas d'une cuisson : les quantités suivent (celles de la fiche
 * ou celles déjà ajustées, à la même échelle) et les restes s'ajoutent ou se retirent.
 */
export function setPortions(entries: PlanEntry[], recipes: Recipe[], cookId: string, n: number): PlanEntry[] {
  const cook = entries.find((e) => e.id === cookId && e.kind === 'cook');
  if (!cook || n < 1) return entries;
  const old = mealOfCook(recipes, cook);
  if (n === old.portions) return entries;
  let out = entries.map((e) => {
    if (e.id !== cookId) return e;
    const next: PlanEntry = { ...e, portions: n };
    if (e.ingredients) next.ingredients = e.ingredients.map((i) => ({ ...i, qty: (i.qty * n) / old.portions }));
    return next;
  });
  const rests = out.filter((e) => e.kind === 'leftover' && e.batchId === cookId).sort(byDate);
  const wanted = n - 1;
  if (rests.length > wanted) {
    const dropped = rests.filter((r) => !r.done).slice(-(rests.length - wanted));
    const drop = new Set(dropped.map((r) => r.id));
    out = out.filter((e) => !drop.has(e.id));
    // Les jours libérés en fin de bloc se referment : la suite du plan revient d'autant.
    const dates = dropped.map((r) => r.date).sort();
    const contiguous = dates.every((d, i) => i === 0 || diffDays(dates[i - 1], d) === 1);
    if (dropped.length && contiguous && !out.some((e) => e.date >= dates[0] && e.date <= dates[dates.length - 1])) {
      out = shiftFrom(out, addDays(dates[dates.length - 1], 1), -dropped.length);
    }
  } else if (rests.length < wanted) {
    const after = addDays((rests[rests.length - 1] ?? cook).date, 1);
    const extra = Array.from({ length: wanted - rests.length }, () => leftover(cookId));
    out = insertBlock(out, extra, after);
  }
  return out.sort(byDate);
}

export function renameCook(entries: PlanEntry[], cookId: string, title: string): PlanEntry[] {
  return entries.map((e) => (e.id === cookId ? { ...e, title: title.trim() || undefined } : e));
}

/** Je mange dehors ce jour-là : le repas prévu et la suite glissent d'un jour. */
export function markOut(entries: PlanEntry[], at: ISODate, note?: string): PlanEntry[] {
  const existing = entries.find((e) => e.date === at);
  if (existing?.done) return entries;
  const shifted = existing ? shiftFrom(entries, at, 1) : entries;
  return [...shifted, { id: newId('o'), date: at, kind: 'out' as const, note }].sort(byDate);
}

/** Annule « je mange dehors » : retire le repas dehors et ramène la suite d'un jour. */
export function unmarkOut(entries: PlanEntry[], id: string): PlanEntry[] {
  const e = entries.find((x) => x.id === id);
  if (!e || e.kind !== 'out') return entries;
  const rest = entries.filter((x) => x.id !== id);
  return shiftFrom(rest, addDays(e.date, 1), -1).sort(byDate);
}

/** Premier jour à partir de `from` où l'on peut poser une cuisson sans couper des restes. */
export function nextSlot(entries: PlanEntry[], from: ISODate): ISODate {
  let d = from;
  for (let i = 0; i < 60; i++) {
    const e = entries.find((x) => x.date === d);
    if (!e || e.kind !== 'leftover') return d;
    d = addDays(d, 1);
  }
  return from;
}

/** Supprime un repas. Une cuisson emporte ses restes non mangés ; un reste part seul. */
export function removeEntry(entries: PlanEntry[], id: string): PlanEntry[] {
  const e = entries.find((x) => x.id === id);
  if (!e) return entries;
  if (e.kind === 'cook') {
    return entries.filter((x) => x.id !== id && !(x.kind === 'leftover' && x.batchId === id && !x.done));
  }
  return entries.filter((x) => x.id !== id);
}

/** Déplace un bloc (cuisson + restes non mangés) pour qu'il commence à `at`. */
export function moveBlock(entries: PlanEntry[], id: string, at: ISODate): PlanEntry[] {
  const block = blockOf(entries, id).filter((e) => !e.done);
  if (block.length === 0) return entries;
  const ids = new Set(block.map((e) => e.id));
  const rest = entries.filter((e) => !ids.has(e.id));
  return insertBlock(rest, block, at);
}

/** Échange un bloc avec le bloc suivant (dir = 1) ou précédent (dir = -1). */
export function swapBlock(entries: PlanEntry[], id: string, dir: 1 | -1, today: ISODate): PlanEntry[] {
  const a = blockOf(entries, id).filter((e) => !e.done);
  if (a.length === 0) return entries;
  const aIds = new Set(a.map((e) => e.id));
  const candidates = entries
    .filter((e) => !e.done && !aIds.has(e.id) && e.date >= today)
    .sort(byDate);
  const neighbour =
    dir === 1
      ? candidates.find((e) => e.date > a[a.length - 1].date)
      : [...candidates].reverse().find((e) => e.date < a[0].date);
  if (!neighbour) return entries;
  const b = blockOf(entries, neighbour.id).filter((e) => !e.done);
  const [first, second] = dir === 1 ? [a, b] : [b, a];
  const dates = [...first, ...second].map((e) => e.date).sort();
  const moved = new Map<string, ISODate>();
  second.forEach((e, i) => moved.set(e.id, dates[i]));
  first.forEach((e, i) => moved.set(e.id, dates[second.length + i]));
  return entries.map((e) => (moved.has(e.id) ? { ...e, date: moved.get(e.id)! } : e)).sort(byDate);
}

/** Supprime les jours vides entre `from` et la fin du plan. */
export function closeGaps(entries: PlanEntry[], from: ISODate): PlanEntry[] {
  const movable = entries.filter((e) => !e.done && e.date >= from).sort(byDate);
  const fixed = new Set(entries.filter((e) => e.done || e.date < from).map((e) => e.date));
  let cursor = from;
  const moved = new Map<string, ISODate>();
  for (const e of movable) {
    while (fixed.has(cursor)) cursor = addDays(cursor, 1);
    moved.set(e.id, cursor);
    cursor = addDays(cursor, 1);
  }
  return entries.map((e) => (moved.has(e.id) ? { ...e, date: moved.get(e.id)! } : e)).sort(byDate);
}

export function toggleDone(entries: PlanEntry[], id: string): PlanEntry[] {
  return entries.map((e) => (e.id === id ? { ...e, done: !e.done, skipped: false } : e));
}

/** Repas passé déclaré non mangé : il ne sort rien du stock et ne redemande plus. */
export function setSkipped(entries: PlanEntry[], id: string, skipped = true): PlanEntry[] {
  return entries.map((e) => (e.id === id ? { ...e, skipped, done: skipped ? false : e.done } : e));
}

/** Part de la portion réellement mangée : ne touche ni la fiche, ni le stock. */
export function setEaten(entries: PlanEntry[], id: string, eaten: number): PlanEntry[] {
  return entries.map((e) => (e.id === id ? { ...e, eaten } : e));
}

/**
 * Repas passés qui demandent une réponse : ni cochés, ni déclarés non mangés.
 * Tant qu'ils ne sont pas cochés, rien ne sort du stock : c'est voulu.
 */
export function pendingPast(entries: PlanEntry[], today: ISODate, back = 10): PlanEntry[] {
  const from = addDays(today, -back);
  return entries
    .filter((e) => e.date < today && e.date >= from && !e.done && !e.skipped && e.kind !== 'out')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface PlanWarning {
  entryId: string;
  date: ISODate;
  level: 'alerte' | 'info';
  message: string;
}

export function validatePlan(entries: PlanEntry[], recipes: Recipe[], today: ISODate, mealsPerDay = 1): PlanWarning[] {
  const out: PlanWarning[] = [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const perDate = new Map<ISODate, number>();
  const warnedDates = new Set<ISODate>();
  for (const e of entries) {
    if (e.kind === 'out') continue;
    perDate.set(e.date, (perDate.get(e.date) ?? 0) + 1);
  }

  for (const e of entries) {
    const count = perDate.get(e.date) ?? 0;
    // Plusieurs repas le même jour n'est une anomalie que si le réglage n'en prévoit pas autant.
    if (e.kind !== 'out' && count > mealsPerDay && !warnedDates.has(e.date)) {
      warnedDates.add(e.date);
      out.push({ entryId: e.id, date: e.date, level: 'alerte', message: `${count} repas prévus le même jour` });
    }
    if (e.date < today && !e.done && e.kind !== 'out') {
      out.push({ entryId: e.id, date: e.date, level: 'info', message: 'Pas encore coché comme fait' });
    }
    if (e.kind === 'leftover') {
      const cook = e.batchId ? byId.get(e.batchId) : undefined;
      if (!cook) {
        out.push({ entryId: e.id, date: e.date, level: 'alerte', message: 'Reste sans cuisson d’origine' });
        continue;
      }
      const fridge = recipes.find((r) => r.id === cook.recipeId)?.fridgeDays ?? 3;
      const age = diffDays(cook.date, e.date);
      if (age < 1) {
        out.push({ entryId: e.id, date: e.date, level: 'alerte', message: 'Reste placé avant la cuisson' });
      } else if (age > fridge) {
        out.push({ entryId: e.id, date: e.date, level: 'alerte', message: `Cuisiné il y a ${age} j, au-delà des ${fridge} j de frigo` });
      }
    }
    if (e.kind === 'cook') {
      const leftovers = entries.filter((x) => x.kind === 'leftover' && x.batchId === e.id).length;
      const portions = e.portions ?? 1;
      if (leftovers > portions - 1) {
        out.push({ entryId: e.id, date: e.date, level: 'alerte', message: 'Plus de restes prévus que de portions' });
      }
    }
  }
  return out;
}

/** Restes cuisinés encore au frigo à une date donnée. */
export function leftoversInFridge(entries: PlanEntry[], recipes: Recipe[], today: ISODate) {
  const out: { cook: PlanEntry; name: string; portionsLeft: number; eatBefore: ISODate }[] = [];
  for (const cook of entries) {
    if (cook.kind !== 'cook' || !cook.done || cook.date > today) continue;
    const meal = mealOfCook(recipes, cook);
    const eaten = 1 + entries.filter((x) => x.kind === 'leftover' && x.batchId === cook.id && x.done && x.date <= today).length;
    const left = meal.portions - eaten;
    const eatBefore = addDays(cook.date, meal.fridgeDays);
    if (left > 0 && eatBefore >= today) out.push({ cook, name: meal.name, portionsLeft: left, eatBefore });
  }
  return out;
}

/**
 * Un repas de plus le même jour, sans rien décaler : c'est ce que demandent deux ou trois
 * repas par jour. Réservé aux repas simples (une portion), pour ne pas empiler des restes.
 */
export function addMealOn(entries: PlanEntry[], at: ISODate, recipe: Recipe): PlanEntry[] {
  return [...entries, { id: newId('c'), date: at, kind: 'cook' as const, recipeId: recipe.id, portions: 1 }].sort(byDate);
}

/** Un plat maison de plus le même jour. */
export function addCustomOn(entries: PlanEntry[], at: ISODate, title: string): PlanEntry[] {
  return [...entries, { id: newId('c'), date: at, kind: 'cook' as const, title, portions: 1, ingredients: [] }].sort(byDate);
}

/**
 * Un repas tel qu'il sort de la fenêtre « Composer le repas » : une fiche de la bibliothèque
 * (recipeId) ou un plat maison (title), le nombre de repas cuisinés et les ingrédients de CE repas.
 */
export interface MealDraft {
  recipeId?: string;
  title?: string;
  portions: number;
  ingredients: Ingredient[];
}

/** Mêmes aliments, mêmes quantités (à un centième près), dans n'importe quel ordre. */
export function sameIngredients(a: Ingredient[], b: Ingredient[]): boolean {
  if (a.length !== b.length) return false;
  const key = (list: Ingredient[]) => {
    const m = new Map<string, number>();
    for (const i of list) m.set(i.foodId, (m.get(i.foodId) ?? 0) + i.qty);
    return m;
  };
  const ka = key(a);
  const kb = key(b);
  if (ka.size !== kb.size) return false;
  for (const [id, q] of ka) {
    const other = kb.get(id);
    if (other === undefined || Math.abs(other - q) > 0.01) return false;
  }
  return true;
}

/**
 * Ce que la cuisson garde en propre : rien quand les quantités sont celles de la fiche
 * (la fiche reste la référence), sinon la liste du repas. Un plat maison garde toujours la sienne.
 */
function ownIngredients(recipes: Recipe[], draft: MealDraft): Ingredient[] | undefined {
  const recipe = draft.recipeId ? recipes.find((r) => r.id === draft.recipeId) : undefined;
  if (recipe && recipe.ingredients?.length && sameIngredients(draft.ingredients, cookIngredients(recipe, draft.portions))) return undefined;
  return draft.ingredients.map((i) => ({ ...i }));
}

function cookFields(recipes: Recipe[], draft: MealDraft): Omit<PlanEntry, 'id' | 'date' | 'kind'> {
  const ingredients = ownIngredients(recipes, draft);
  return {
    ...(draft.recipeId ? { recipeId: draft.recipeId } : { title: draft.title?.trim() || 'Plat maison' }),
    ...(ingredients ? { ingredients } : {}),
  };
}

/**
 * Pose un repas composé.
 * - Sans `cookId` : nouveau repas. `sameDay` l'ajoute au jour sans rien décaler (deuxième ou
 *   troisième repas, une portion) ; sinon la cuisson et ses restes s'insèrent comme `planRecipe`.
 * - Avec `cookId` : la même fiche (ou le même plat maison) est mise à jour sur place, restes compris ;
 *   une autre fiche remplace la cuisson au même jour. La fiche de la bibliothèque n'est jamais touchée.
 */
export function placeMeal(
  entries: PlanEntry[],
  recipes: Recipe[],
  date: ISODate,
  draft: MealDraft,
  opts: { cookId?: string; sameDay?: boolean } = {},
): PlanEntry[] {
  const current = opts.cookId ? entries.find((e) => e.id === opts.cookId && e.kind === 'cook') : undefined;
  const at = current?.date ?? date;
  // Un repas ajouté à un jour qui en porte déjà un reste à une portion : il ne décale rien.
  const single = current
    ? entries.some((e) => e.date === at && e.id !== current.id && e.kind !== 'out')
    : !!opts.sameDay;
  const portions = single && !(current && sameCook(current, draft)) ? 1 : Math.max(1, Math.round(draft.portions));
  const fields = cookFields(recipes, { ...draft, portions });

  if (current && sameCook(current, draft)) {
    const out = setPortions(entries, recipes, current.id, portions).map((e) => {
      if (e.id !== current.id) return e;
      const { ingredients: _i, title: _t, recipeId: _r, ...rest } = e;
      return { ...rest, ...fields };
    });
    return out.sort(byDate);
  }
  // Une autre fiche remplace la cuisson (et ses restes non mangés) au même jour.
  const base = current ? removeEntry(entries, current.id) : entries;
  if (single) return [...base, { id: newId('c'), date: at, kind: 'cook' as const, ...fields, portions: 1 }].sort(byDate);
  return insertBlock(base, makeBlock(fields, portions), at);
}

/** Même fiche, ou plat maison des deux côtés : on met à jour au lieu de remplacer. */
function sameCook(cook: PlanEntry, draft: MealDraft): boolean {
  return draft.recipeId ? cook.recipeId === draft.recipeId : !cook.recipeId;
}

/**
 * Un plat maison enregistré dans la bibliothèque : la cuisson pointe désormais vers la fiche,
 * qui porte exactement ses ingrédients. Restes, coche et portion mangée ne bougent pas.
 */
export function linkCookToRecipe(entries: PlanEntry[], cookId: string, recipeId: string): PlanEntry[] {
  return entries.map((e) => {
    if (e.id !== cookId || e.kind !== 'cook') return e;
    const { title: _t, ingredients: _i, ...rest } = e;
    return { ...rest, recipeId };
  });
}
