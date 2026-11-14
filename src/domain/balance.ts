import { add, itemsNutrients, plantGrams, sugarsExLactose, type FoodIndex } from './nutrition';
import type { Targets } from './targets';
import type { Ingredient, Nutrients, SnackIdea } from './types';

/**
 * Bilan d'une journée face aux objectifs, et ce qu'il faudrait ajouter pour la compléter.
 * Tout est pur : l'interface fournit les valeurs du jour, les objectifs et les à-côtés disponibles.
 */

export type Status = 'bas' | 'ok' | 'haut';

export interface BalanceRow {
  key: 'kcal' | 'protein' | 'fiber' | 'plant' | 'satFat' | 'sugars' | 'salt';
  label: string;
  value: number;
  target: number;
  unit: string;
  /** min : à atteindre ; max : à ne pas dépasser ; band : à approcher sans dépasser. */
  kind: 'min' | 'max' | 'band';
  status: Status;
}

export interface Split {
  protein: number;
  fat: number;
  carbs: number;
}

export interface DayBalance {
  rows: BalanceRow[];
  /** Part de l'énergie apportée par chaque macronutriment, en % (absente sous 300 kcal). */
  split?: Split;
  splitStatus?: Record<keyof Split, Status>;
}

const rangeStatus = (v: number, [lo, hi]: [number, number]): Status => (v < lo ? 'bas' : v > hi ? 'haut' : 'ok');

export function assessDay(n: Nutrients, plantG: number, t: Targets): DayBalance {
  const min = (value: number, target: number): Status => (value >= target * 0.9 ? 'ok' : 'bas');
  const max = (value: number, target: number): Status => (value > target ? 'haut' : 'ok');
  const kcalStatus: Status = n.kcal > t.kcal * 1.05 ? 'haut' : n.kcal < t.kcal * 0.9 ? 'bas' : 'ok';
  const sugars = sugarsExLactose(n);
  const rows: BalanceRow[] = [
    { key: 'kcal', label: 'Énergie', value: n.kcal, target: t.kcal, unit: 'kcal', kind: 'band', status: kcalStatus },
    { key: 'protein', label: 'Protéines', value: n.protein, target: t.protein, unit: 'g', kind: 'min', status: min(n.protein, t.protein) },
    { key: 'fiber', label: 'Fibres', value: n.fiber, target: t.fiber, unit: 'g', kind: 'min', status: min(n.fiber, t.fiber) },
    { key: 'plant', label: 'Légumes & fruits', value: plantG, target: t.plantG, unit: 'g', kind: 'min', status: min(plantG, t.plantG) },
    { key: 'satFat', label: 'Graisses saturées', value: n.satFat, target: t.satFatMaxG, unit: 'g', kind: 'max', status: max(n.satFat, t.satFatMaxG) },
    { key: 'sugars', label: 'Sucres', value: sugars, target: t.sugarsMaxG, unit: 'g', kind: 'max', status: max(sugars, t.sugarsMaxG) },
    { key: 'salt', label: 'Sel', value: n.salt, target: t.saltMaxG, unit: 'g', kind: 'max', status: max(n.salt, t.saltMaxG) },
  ];
  if (n.kcal < 300) return { rows };
  // Répartition calculée sur l'énergie des trois macronutriments (4, 9 et 4 kcal par gramme).
  const e = n.protein * 4 + n.fat * 9 + n.carbs * 4;
  const split = { protein: (n.protein * 4 * 100) / e, fat: (n.fat * 9 * 100) / e, carbs: (n.carbs * 4 * 100) / e };
  return {
    rows,
    split,
    splitStatus: { protein: rangeStatus(split.protein, t.proteinPct), fat: rangeStatus(split.fat, t.fatPct), carbs: rangeStatus(split.carbs, t.carbsPct) },
  };
}

/* ---------- à-côtés ---------- */

export interface Candidate {
  id: string;
  label: string;
  items: Ingredient[];
  note?: string;
}

/** À-côtés simples, proposés quand l'aliment est en stock (les idées du soir s'y ajoutent). */
export const SIMPLE_SIDES: Candidate[] = [
  { id: 'side-skyr', label: 'Un skyr nature', items: [{ foodId: 'skyr', qty: 1 }] },
  { id: 'side-banane', label: 'Une banane', items: [{ foodId: 'banane', qty: 1 }] },
  { id: 'side-tomates', label: 'Des tomates cerises', items: [{ foodId: 'tomates-cerises', qty: 100 }] },
  { id: 'side-carottes', label: 'Des carottes râpées', items: [{ foodId: 'carottes-rapees', qty: 100 }, { foodId: 'huile-olive', qty: 5 }] },
  { id: 'side-concombre', label: 'Un demi-concombre', items: [{ foodId: 'concombre', qty: 0.5 }] },
  { id: 'side-lait', label: 'Un verre de lait', items: [{ foodId: 'lait', qty: 250 }] },
  { id: 'side-veloute', label: 'Un bol de velouté', items: [{ foodId: 'veloute', qty: 0.3 }] },
];

/** Les à-côtés possibles avec ce qui reste : idées du soir puis à-côtés simples, sans doublon. */
export function sideCandidates(ideas: SnackIdea[], foods: FoodIndex, available: (foodId: string) => number): Candidate[] {
  const ok = (c: Candidate) => c.items.every((i) => foods.has(i.foodId) && available(i.foodId) + 1e-6 >= i.qty);
  const out: Candidate[] = ideas.map((i) => ({ id: i.id, label: i.name, items: i.items, note: i.note })).filter(ok);
  const single = new Set(out.filter((c) => c.items.length === 1).map((c) => c.items[0].foodId));
  for (const s of SIMPLE_SIDES) if (ok(s) && !single.has(s.items[0].foodId)) out.push(s);
  return out;
}

export interface Pick {
  candidate: Candidate;
  nutrients: Nutrients;
  plantG: number;
  /** Ce que l'à-côté apporte, en clair : « +11 g de protéines ». */
  brings: string[];
}

export interface Recommendation {
  picks: Pick[];
  /** Valeurs de la journée une fois les à-côtés ajoutés. */
  after: { nutrients: Nutrients; plantG: number };
  /** Ce qui manquera encore, en clair. */
  stillMissing: string[];
}

const WEIGHTS = { protein: 1.2, fiber: 0.8, plant: 1.0, kcal: 0.6 };

/** Gain d'un à-côté : ce qu'il comble des manques, moins ce qu'il fait dépasser. */
export function scoreSide(n: Nutrients, plantG: number, add_: { n: Nutrients; plantG: number }, t: Targets, sweet: boolean): number {
  const fill = (before: number, after: number, target: number) => (Math.min(after, target) - Math.min(before, target)) / target;
  const next = add(n, add_.n);
  let score =
    WEIGHTS.protein * fill(n.protein, next.protein, t.protein) +
    WEIGHTS.fiber * fill(n.fiber, next.fiber, t.fiber) +
    WEIGHTS.plant * fill(plantG, plantG + add_.plantG, t.plantG) +
    WEIGHTS.kcal * fill(n.kcal, next.kcal, t.kcal * 0.98);
  const over = (before: number, after: number, cap: number) => (Math.max(0, after - cap) - Math.max(0, before - cap)) / cap;
  score -= 4 * over(n.kcal, next.kcal, t.kcal * 1.03);
  score -= 1.5 * over(n.satFat, next.satFat, t.satFatMaxG);
  score -= 1.0 * over(sugarsExLactose(n), sugarsExLactose(next), t.sugarsMaxG);
  score -= 1.0 * over(n.salt, next.salt, t.saltMaxG);
  if (sweet) score -= 0.05;
  return score;
}

function brings(n: Nutrients, plantG: number): string[] {
  const out: string[] = [];
  if (n.protein >= 3) out.push(`+${Math.round(n.protein)} g de protéines`);
  if (n.fiber >= 1.5) out.push(`+${Math.round(n.fiber)} g de fibres`);
  if (plantG >= 40) out.push(`+${Math.round(plantG)} g de fruits et légumes`);
  out.push(`${Math.round(n.kcal)} kcal`);
  return out;
}

/** Choisit au plus `max` à-côtés, un par un, tant qu'ils améliorent la journée. */
export function recommendSides(
  day: { nutrients: Nutrients; plantG: number },
  t: Targets,
  candidates: Candidate[],
  foods: FoodIndex,
  max = 3,
): Recommendation {
  let n = day.nutrients;
  let plant = day.plantG;
  const picks: Pick[] = [];
  const pool = candidates.map((c) => ({
    c,
    n: itemsNutrients(foods, c.items),
    plantG: plantGrams(foods, c.items),
    sweet: c.items.some((i) => foods.get(i.foodId)?.category === 'sucré'),
  }));
  while (picks.length < max) {
    let best: (typeof pool)[number] | undefined;
    let bestScore = 0.03;
    for (const p of pool) {
      if (picks.some((x) => x.candidate.id === p.c.id)) continue;
      const s = scoreSide(n, plant, { n: p.n, plantG: p.plantG }, t, p.sweet);
      if (s > bestScore) {
        best = p;
        bestScore = s;
      }
    }
    if (!best) break;
    picks.push({ candidate: best.c, nutrients: best.n, plantG: best.plantG, brings: brings(best.n, best.plantG) });
    n = add(n, best.n);
    plant += best.plantG;
  }

  const stillMissing: string[] = [];
  if (n.kcal < t.kcal * 0.85) stillMissing.push(`${Math.round(t.kcal - n.kcal)} kcal`);
  if (n.protein < t.protein * 0.9) stillMissing.push(`${Math.round(t.protein - n.protein)} g de protéines`);
  if (n.fiber < t.fiber * 0.9) stillMissing.push(`${Math.round(t.fiber - n.fiber)} g de fibres`);
  if (plant < t.plantG * 0.9) stillMissing.push(`${Math.round(t.plantG - plant)} g de légumes et fruits`);
  return { picks, after: { nutrients: n, plantG: plant }, stillMissing };
}
