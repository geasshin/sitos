import { addDays, diffDays } from './dates';
import { cookIngredients, mealOfCook, type FoodIndex } from './nutrition';
import { portionsOf, type Data, type Food, type ISODate, type Recipe } from './types';

const EPS = 1e-6;

export interface Lot {
  purchaseId: string;
  foodId: string;
  initial: number;
  qty: number;
  receivedAt: ISODate;
  expiry: ISODate;
}

export type Freshness = 'périmé' | 'urgent' | 'bientôt' | 'ok' | 'épuisé';

export interface FoodStock {
  food: Food;
  lots: Lot[];
  initial: number;
  remaining: number;
  nextExpiry?: ISODate;
  daysLeft?: number;
  freshness: Freshness;
  /** Consommé au-delà de ce qui était en stock (oubli d'achat, erreur de saisie). */
  overdrawn: number;
}

export function lotExpiry(food: Food, receivedAt: ISODate, expiresAt?: ISODate): ISODate {
  return expiresAt ?? addDays(receivedAt, food.shelfLifeDays);
}

/** Seuils de fraîcheur : les produits du frigo se surveillent de plus près. */
export function freshnessOf(food: Food, daysLeft: number | undefined, remaining: number): Freshness {
  if (remaining <= EPS || daysLeft === undefined) return 'épuisé';
  if (daysLeft < 0) return 'périmé';
  const urgent = food.storage === 'placard' ? 7 : 2;
  const soon = food.storage === 'placard' ? 30 : 5;
  if (daysLeft <= urgent) return 'urgent';
  if (daysLeft <= soon) return 'bientôt';
  return 'ok';
}

export interface Consumption {
  date: ISODate;
  foodId: string;
  qty: number;
  source: string;
}

/** Tout ce qui a réellement été consommé : plats cochés, grignotages, ajustements. */
export function consumptions(data: Data, upTo: ISODate): Consumption[] {
  const out: Consumption[] = [];
  for (const e of data.plan.entries) {
    if (e.kind !== 'cook' || !e.done || e.date > upTo) continue;
    const meal = mealOfCook(data.recipes, e);
    for (const ing of meal.ingredients) {
      out.push({ date: e.date, foodId: ing.foodId, qty: ing.qty, source: meal.name });
    }
  }
  for (const s of data.journal.snacks) {
    if (s.date > upTo) continue;
    for (const ing of s.items) out.push({ date: s.date, foodId: ing.foodId, qty: ing.qty, source: s.label });
  }
  for (const a of data.journal.adjustments) {
    if (a.date > upTo) continue;
    out.push({ date: a.date, foodId: a.foodId, qty: a.qty, source: a.reason });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Retire qty des lots, du plus proche de sa date limite au plus lointain. Renvoie ce qui manque. */
function takeFIFO(lots: Lot[], qty: number, notExpiredOn?: ISODate): number {
  let need = qty;
  const usable = lots
    .filter((l) => l.qty > EPS && (!notExpiredOn || l.expiry >= notExpiredOn))
    .sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0));
  for (const lot of usable) {
    if (need <= EPS) break;
    const t = Math.min(lot.qty, need);
    lot.qty -= t;
    need -= t;
  }
  return need > EPS ? need : 0;
}

export function computeStock(data: Data, foods: FoodIndex, today: ISODate): Map<string, FoodStock> {
  const lotsByFood = new Map<string, Lot[]>();
  for (const p of data.stock) {
    const food = foods.get(p.foodId);
    if (!food || p.receivedAt > today) continue;
    const lot: Lot = {
      purchaseId: p.id,
      foodId: p.foodId,
      initial: p.qty,
      qty: p.qty,
      receivedAt: p.receivedAt,
      expiry: lotExpiry(food, p.receivedAt, p.expiresAt),
    };
    lotsByFood.set(p.foodId, [...(lotsByFood.get(p.foodId) ?? []), lot]);
  }

  const overdrawn = new Map<string, number>();
  for (const c of consumptions(data, today)) {
    const lots = lotsByFood.get(c.foodId) ?? [];
    if (c.qty < 0) {
      // correction à la hausse : on remet dans le lot le plus récent
      const last = [...lots].sort((a, b) => (a.expiry < b.expiry ? 1 : -1))[0];
      if (last) last.qty -= c.qty;
      continue;
    }
    const missing = takeFIFO(lots, c.qty);
    if (missing > 0) overdrawn.set(c.foodId, (overdrawn.get(c.foodId) ?? 0) + missing);
  }

  const out = new Map<string, FoodStock>();
  for (const food of data.foods) {
    const lots = (lotsByFood.get(food.id) ?? []).sort((a, b) => (a.expiry < b.expiry ? -1 : 1));
    if (lots.length === 0) continue;
    const live = lots.filter((l) => l.qty > EPS);
    const remaining = live.reduce((s, l) => s + l.qty, 0);
    const nextExpiry = live[0]?.expiry;
    const daysLeft = nextExpiry ? diffDays(today, nextExpiry) : undefined;
    out.set(food.id, {
      food,
      lots: live,
      initial: lots.reduce((s, l) => s + l.initial, 0),
      remaining,
      nextExpiry,
      daysLeft,
      freshness: freshnessOf(food, daysLeft, remaining),
      overdrawn: overdrawn.get(food.id) ?? 0,
    });
  }
  return out;
}

export interface Shortage {
  date: ISODate;
  entryId: string;
  /** Nom du repas concerné. */
  name: string;
  foodId: string;
  missing: number;
}

export interface Loss {
  foodId: string;
  qty: number;
  expiry: ISODate;
}

export interface Forecast {
  shortages: Shortage[];
  losses: Loss[];
  /** Prochaine utilisation prévue de chaque aliment. */
  nextUse: Map<string, ISODate>;
}

/**
 * Projette le plan à venir sur le stock actuel, jour par jour : ce qui manquera,
 * ce qui risque de se périmer avant d'être cuisiné. Un lot périmé à la date d'un
 * plat ne sert pas. Les fruits « nature » partent au rythme de settings.fruitsPerDay,
 * le plus mûr d'abord.
 */
export function forecast(data: Data, stock: Map<string, FoodStock>, today: ISODate, horizonDays = 42): Forecast {
  const lots = new Map<string, Lot[]>();
  for (const [id, fs] of stock) lots.set(id, fs.lots.map((l) => ({ ...l })));

  const future = data.plan.entries
    .filter((e) => e.kind === 'cook' && !e.done && e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const horizon = addDays(today, horizonDays);
  const fruitIds = new Set(data.foods.filter((f) => f.dailyFruit).map((f) => f.id));
  const fruitToday = data.journal.snacks.some((s) => s.date === today && s.items.some((i) => fruitIds.has(i.foodId)));
  const perDay = data.settings.fruitsPerDay ?? 0;

  const shortages: Shortage[] = [];
  const nextUse = new Map<string, ISODate>();
  let fruitDebt = 0;
  for (let d = today; d <= horizon; d = addDays(d, 1)) {
    for (const e of future) {
      if (e.date !== d) continue;
      const meal = mealOfCook(data.recipes, e);
      for (const ing of meal.ingredients) {
        if (!nextUse.has(ing.foodId)) nextUse.set(ing.foodId, e.date);
        const missing = takeFIFO(lots.get(ing.foodId) ?? [], ing.qty, e.date);
        if (missing > 0) shortages.push({ date: e.date, entryId: e.id, name: meal.name, foodId: ing.foodId, missing });
      }
    }
    if (perDay > 0 && !(d === today && fruitToday)) {
      fruitDebt += perDay;
      while (fruitDebt >= 1) {
        const fruitLots = [...fruitIds].flatMap((id) => lots.get(id) ?? []);
        if (takeFIFO(fruitLots, 1, d) > 0) {
          fruitDebt = 0;
          break;
        }
        fruitDebt -= 1;
      }
    }
  }

  const losses: Loss[] = [];
  for (const [foodId, ls] of lots) {
    for (const l of ls) {
      if (l.qty > 0.01 && l.expiry <= horizon) losses.push({ foodId, qty: l.qty, expiry: l.expiry });
    }
  }
  losses.sort((a, b) => (a.expiry < b.expiry ? -1 : 1));
  return { shortages, losses, nextUse };
}

export interface Priority {
  food: Food;
  expiry: ISODate;
  daysLeft: number;
  /** Quantité qui risque d'être perdue si le plan ne change pas. */
  atRisk: number;
  nextUse?: ISODate;
  recipes: Recipe[];
}

/**
 * « À cuisiner en priorité » : ce qui va se perdre si rien ne change,
 * plus les produits frais qui arrivent au bout dans les deux jours.
 */
export function priorities(
  data: Data,
  stock: Map<string, FoodStock>,
  fc: Forecast,
  today: ISODate,
  windowDays = 10,
): Priority[] {
  const byFood = new Map<string, Priority>();
  const recipesUsing = (foodId: string) =>
    data.recipes
      .filter((r) => (r.ingredients ?? []).some((i) => i.foodId === foodId))
      .sort((a, b) => Number(b.status === 'maîtrisée') - Number(a.status === 'maîtrisée'));

  for (const loss of fc.losses) {
    const daysLeft = diffDays(today, loss.expiry);
    if (daysLeft > windowDays) continue;
    const fs = stock.get(loss.foodId);
    if (!fs) continue;
    const prev = byFood.get(loss.foodId);
    byFood.set(loss.foodId, {
      food: fs.food,
      expiry: prev && prev.expiry < loss.expiry ? prev.expiry : loss.expiry,
      daysLeft: prev ? Math.min(prev.daysLeft, daysLeft) : daysLeft,
      atRisk: (prev?.atRisk ?? 0) + loss.qty,
      nextUse: fc.nextUse.get(loss.foodId),
      recipes: recipesUsing(loss.foodId),
    });
  }
  for (const fs of stock.values()) {
    if (byFood.has(fs.food.id) || fs.food.storage === 'placard') continue;
    if (fs.daysLeft === undefined || fs.daysLeft > 2 || fs.remaining <= EPS) continue;
    byFood.set(fs.food.id, {
      food: fs.food,
      expiry: fs.nextExpiry!,
      daysLeft: fs.daysLeft,
      atRisk: 0,
      nextUse: fc.nextUse.get(fs.food.id),
      recipes: recipesUsing(fs.food.id),
    });
  }
  return [...byFood.values()].sort((a, b) => a.daysLeft - b.daysLeft || b.atRisk - a.atRisk);
}

/** Ce qu'il manque dans le stock actuel pour cuisiner une recette. */
export function missingFor(recipe: Recipe, stock: Map<string, FoodStock>, portions = portionsOf(recipe)) {
  return cookIngredients(recipe, portions)
    .map((ing) => ({ foodId: ing.foodId, missing: Math.max(0, ing.qty - (stock.get(ing.foodId)?.remaining ?? 0)) }))
    .filter((m) => m.missing > 0.01);
}

/** ¼, ½, ¾ plutôt que 0,25 ; 1 décimale sinon. */
export function fraction(qty: number): string {
  const q = Math.round(qty * 4) / 4;
  if (Math.abs(q - qty) > 0.02) return qty.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const whole = Math.floor(q);
  const frac = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' }[q - whole] ?? '';
  if (!whole) return frac || '0';
  return frac ? `${whole} ${frac}` : String(whole);
}

export function formatQty(food: Food | undefined, qty: number): string {
  if (!food) return `${Math.round(qty)}`;
  if (food.unit === 'pièce') return fraction(qty);
  if (food.unit === 'ml') return qty >= 1000 ? `${(qty / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L` : `${Math.round(qty)} ml`;
  return qty >= 1000 ? `${(qty / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg` : `${Math.round(qty)} g`;
}

/** Colonne quantité + libellé accordé : { qty: '4', label: "gousses d'ail" } ou { qty: '200 ml', label: 'Crème liquide 30 %' }. */
export function splitAmount(food: Food | undefined, qty: number): { qty: string; label: string } {
  if (!food) return { qty: String(qty), label: '?' };
  if (food.unit === 'pièce') {
    const [one, many] = food.piece ?? [food.name, food.name];
    const label = Math.round(qty * 4) / 4 >= 2 ? many : one;
    return { qty: fraction(qty), label: label.charAt(0).toUpperCase() + label.slice(1) };
  }
  return { qty: formatQty(food, qty), label: food.name };
}

/** Phrase courte et accordée : « ½ laitue », « 4 gousses d'ail », « 250 g de tomates cerises ». */
export function amount(food: Food | undefined, qty: number): string {
  if (!food) return String(qty);
  const { qty: q, label } = splitAmount(food, qty);
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  if (food.unit === 'pièce') return `${q} ${lower(label)}`;
  const name = lower(food.name);
  return `${q} ${/^[aeiouyhéèêàâîôû]/i.test(name) ? "d'" : 'de '}${name}`;
}

export interface Rescue {
  recipe: Recipe;
  foods: Food[];
}

/** Recettes qui sauvent le plus de produits à risque, la plus utile d'abord. */
export function rescueSuggestions(prio: Priority[], limit = 3): Rescue[] {
  const map = new Map<string, Rescue>();
  for (const p of prio) {
    if (p.atRisk <= 0) continue;
    for (const r of p.recipes) {
      const cur = map.get(r.id) ?? { recipe: r, foods: [] };
      cur.foods.push(p.food);
      map.set(r.id, cur);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.foods.length - a.foods.length || Number(b.recipe.dish === 'Plat') - Number(a.recipe.dish === 'Plat'))
    .slice(0, limit);
}

/**
 * Ce qu'on peut prendre d'un aliment pour un à-côté, un jour donné : les lots encore bons ce
 * jour-là, moins tout ce que les plats prévus vont utiliser. Un à-côté ne prive jamais un plat.
 */
export function availableOn(data: Data, stock: Map<string, FoodStock>, today: ISODate, date: ISODate): (foodId: string) => number {
  const planned = new Map<string, number>();
  {
    for (const e of data.plan.entries) {
      if (e.kind !== 'cook' || e.done || e.date < today) continue;
      for (const ing of mealOfCook(data.recipes, e).ingredients) planned.set(ing.foodId, (planned.get(ing.foodId) ?? 0) + ing.qty);
    }
  }
  return (foodId) => {
    const fs = stock.get(foodId);
    if (!fs) return 0;
    const good = fs.lots.filter((l) => l.expiry >= date).reduce((sum, l) => sum + l.qty, 0);
    return Math.max(0, good - (planned.get(foodId) ?? 0));
  };
}
