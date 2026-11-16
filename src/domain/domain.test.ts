import { describe, expect, it } from 'vitest';
import { addDays, diffDays, formatNumeric, startOfWeek, weekday } from './dates';
import { dayNutrition, indexFoods, mealOf, recipePortion, ZERO } from './nutrition';
import { closeGaps, markOut, moveBlock, pendingPast, planCustom, planRecipe, removeEntry, setEaten, setIngredients, setPortions, setSkipped, swapBlock, toggleDone, validatePlan } from './plan';
import { availableOn, computeStock, forecast, priorities } from './stock';
import type { Data, Food, PlanEntry, Recipe } from './types';
import { weeklyRate, weightTrend } from './weight';

const n = (kcal: number, protein = 0) => ({ ...ZERO, kcal, protein });

const foods: Food[] = [
  { id: 'riz', name: 'Riz', category: 'féculents', unit: 'g', per100: n(350, 8), storage: 'placard', shelfLifeDays: 365 },
  { id: 'courgette', name: 'Courgette', category: 'légumes', unit: 'pièce', gramsPerUnit: 200, per100: n(20, 1), storage: 'frigo', shelfLifeDays: 5 },
  { id: 'pomme', name: 'Pomme', category: 'fruits', unit: 'pièce', gramsPerUnit: 150, per100: n(50), storage: 'fruitier', shelfLifeDays: 30, dailyFruit: true },
];

const recipes: Recipe[] = [
  {
    id: 'riz-courgette', name: 'Riz courgette', source: 't', status: 'maîtrisée', dish: 'Plat', favorite: false, portions: 2,
    ingredients: [{ foodId: 'riz', qty: 200 }, { foodId: 'courgette', qty: 2 }],
    extras: [], steps: [], fridgeDays: 3, equipment: ['plaque'],
  },
  {
    id: 'riz-seul', name: 'Riz seul', source: 't', status: 'maîtrisée', dish: 'Plat', favorite: false, portions: 1,
    ingredients: [{ foodId: 'riz', qty: 100 }], extras: [], steps: [], fridgeDays: 1, equipment: ['plaque'],
  },
];

function makeData(entries: PlanEntry[], extra: Partial<Data> = {}): Data {
  return {
    foods,
    recipes,
    stock: [
      { id: 'p1', foodId: 'riz', qty: 1000, receivedAt: '2026-11-14' },
      { id: 'p2', foodId: 'courgette', qty: 4, receivedAt: '2026-11-14' },
      { id: 'p3', foodId: 'pomme', qty: 6, receivedAt: '2026-11-14' },
    ],
    plan: { startDate: '2026-11-14', entries },
    journal: { snacks: [], adjustments: [], weights: [] },
    settings: { kcalTarget: 2000, proteinTarget: 100, fiberTarget: 30, plantTargetG: 400, fruitsPerDay: 1, demo: true },
    snackIdeas: [],
    ...extra,
  };
}

const cook = (id: string, date: string, recipeId = 'riz-courgette', portions = 2, done = false): PlanEntry => ({
  id, date, kind: 'cook', recipeId, portions, done,
});
const left = (id: string, date: string, batchId: string, done = false): PlanEntry => ({ id, date, kind: 'leftover', batchId, done });

describe('dates', () => {
  it('compte les jours sans dériver au changement d’heure', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
    expect(weekday('2026-11-16')).toBe(0); // lundi
    expect(startOfWeek('2026-11-14')).toBe('2026-11-09');
    expect(formatNumeric('2026-11-16')).toBe('16/11/26');
  });
});

describe('nutrition', () => {
  it('divise la recette par ses portions et compte les légumes', () => {
    const p = recipePortion(indexFoods(foods), recipes[0]);
    expect(p.nutrients.kcal).toBeCloseTo((700 + 80) / 2);
    expect(p.plantG).toBe(200);
  });
  it('un reste a la même valeur qu’une portion de la cuisson, plus les grignotages', () => {
    const data = makeData([cook('c1', '2026-11-14'), left('r1', '2026-11-15', 'c1')], {
      journal: { snacks: [{ id: 's', date: '2026-11-15', label: 'pomme', items: [{ foodId: 'pomme', qty: 1 }] }], adjustments: [], weights: [] },
    });
    const d = dayNutrition(data, indexFoods(foods), '2026-11-15');
    expect(d.total.kcal).toBeCloseTo(390 + 75);
    expect(d.plantG).toBe(350);
  });
});

describe('stock', () => {
  it('ne déduit que les plats cochés, avec les quantités mises à l’échelle', () => {
    const data = makeData([cook('c1', '2026-11-14', 'riz-courgette', 2, true), cook('c2', '2026-11-16')]);
    const s = computeStock(data, indexFoods(foods), '2026-11-15');
    expect(s.get('riz')!.remaining).toBe(800);
    expect(s.get('courgette')!.remaining).toBe(2);
  });

  it('décocher un plat remet le stock', () => {
    const data = makeData([cook('c1', '2026-11-14', 'riz-courgette', 2, false)]);
    expect(computeStock(data, indexFoods(foods), '2026-11-15').get('riz')!.remaining).toBe(1000);
  });

  it('prévoit la perte d’un produit frais cuisiné trop tard', () => {
    // courgettes reçues le 14, gardées 5 j (19/11) ; un plat prévu le 25 ne pourra pas les utiliser
    const data = makeData([cook('c1', '2026-11-15'), cook('c2', '2026-11-25')]);
    const idx = indexFoods(foods);
    const stock = computeStock(data, idx, '2026-11-14');
    const fc = forecast(data, stock, '2026-11-14');
    expect(fc.shortages.map((s) => [s.date, s.foodId, s.missing])).toEqual([['2026-11-25', 'courgette', 2]]);
    expect(fc.losses).toEqual([{ foodId: 'courgette', qty: 2, expiry: '2026-11-19' }]);
    const prio = priorities(data, stock, fc, '2026-11-14');
    expect(prio[0].food.id).toBe('courgette');
    expect(prio[0].atRisk).toBe(2);
    expect(prio[0].recipes[0].id).toBe('riz-courgette');
  });
});

describe('disponible à une date', () => {
  it('réserve ce que les plats prévus vont utiliser, et écarte les lots qui auront passé leur date', () => {
    const data = makeData([cook('c1', '2026-11-16', 'riz-courgette', 1), cook('c2', '2026-11-25', 'riz-seul', 1)]);
    const stock = computeStock(data, indexFoods(foods), '2026-11-14');
    const at = (d: string) => availableOn(data, stock, '2026-11-14', d);
    // 4 courgettes, 1 réservée au plat du 16
    expect(at('2026-11-14')('courgette')).toBe(3);
    // 1000 g de riz, 100 g pour le 16 et 100 g pour le 25, même vu d'avant
    expect(at('2026-11-15')('riz')).toBe(800);
    // courgettes reçues le 14, gardées 5 jours : plus rien le 20
    expect(at('2026-11-20')('courgette')).toBe(0);
  });
});

describe('soirs prévus', () => {
  it('un à-côté noté pour un soir à venir compte dans la projection et n’est plus proposé ailleurs', () => {
    const data = makeData([cook('c1', '2026-11-17')], {
      journal: { snacks: [{ id: 's1', date: '2026-11-16', label: 'Gaspacho', items: [{ foodId: 'courgette', qty: 1 }] }], adjustments: [], weights: [] },
    });
    const stock = computeStock(data, indexFoods(foods), '2026-11-14');
    // Pas encore mangé : le stock du jour garde ses 4 courgettes
    expect(stock.get('courgette')!.remaining).toBe(4);
    // 1 pour le soir du 16, 2 pour le plat du 17 : il en reste 1 de libre
    expect(availableOn(data, stock, '2026-11-14', '2026-11-15')('courgette')).toBe(1);
    const fc = forecast(data, stock, '2026-11-14');
    expect(fc.shortages).toEqual([]);
    expect(fc.losses.find((l) => l.foodId === 'courgette')?.qty).toBe(1);
    expect(fc.nextUse.get('courgette')).toBe('2026-11-16');
  });
});

describe('plan', () => {
  const base = () => [
    cook('c1', '2026-11-14', 'riz-courgette', 2, true),
    left('r1', '2026-11-15', 'c1'),
    cook('c2', '2026-11-16', 'riz-seul', 1),
    cook('c3', '2026-11-17', 'riz-seul', 1),
  ];

  it('« je mange dehors » décale le repas prévu et la suite, pas ce qui est fait', () => {
    const out = markOut(base(), '2026-11-15');
    expect(out.find((e) => e.id === 'c1')!.date).toBe('2026-11-14');
    expect(out.find((e) => e.id === 'r1')!.date).toBe('2026-11-16');
    expect(out.find((e) => e.id === 'c3')!.date).toBe('2026-11-18');
    expect(out.find((e) => e.date === '2026-11-15')!.kind).toBe('out');
  });

  it('planifier sur des jours libres ne bouge rien', () => {
    const out = planRecipe(base(), '2026-11-18', recipes[0], 2);
    expect(out.find((e) => e.id === 'c3')!.date).toBe('2026-11-17');
    expect(out.filter((e) => e.date >= '2026-11-18')).toHaveLength(2);
  });

  it('planifier sur un jour occupé décale juste ce qu’il faut', () => {
    const out = planRecipe(base(), '2026-11-16', recipes[0], 2);
    expect(out.find((e) => e.id === 'c2')!.date).toBe('2026-11-18');
    expect(out.find((e) => e.id === 'c3')!.date).toBe('2026-11-19');
  });

  it('déplace un bloc entier avec ses restes', () => {
    const entries = [cook('a', '2026-11-16', 'riz-courgette', 2), left('a1', '2026-11-17', 'a'), cook('b', '2026-11-18', 'riz-seul', 1)];
    const out = moveBlock(entries, 'a1', '2026-11-20');
    expect(out.find((e) => e.id === 'a')!.date).toBe('2026-11-20');
    expect(out.find((e) => e.id === 'a1')!.date).toBe('2026-11-21');
    expect(out.find((e) => e.id === 'b')!.date).toBe('2026-11-18');
  });

  it('échange deux blocs de tailles différentes', () => {
    const entries = [cook('a', '2026-11-16', 'riz-courgette', 2), left('a1', '2026-11-17', 'a'), cook('b', '2026-11-18', 'riz-seul', 1)];
    const out = swapBlock(entries, 'a', 1, '2026-11-14');
    expect(out.find((e) => e.id === 'b')!.date).toBe('2026-11-16');
    expect(out.find((e) => e.id === 'a')!.date).toBe('2026-11-17');
    expect(out.find((e) => e.id === 'a1')!.date).toBe('2026-11-18');
  });

  it('supprimer une cuisson emporte ses restes', () => {
    const entries = [cook('a', '2026-11-16'), left('a1', '2026-11-17', 'a'), cook('b', '2026-11-18', 'riz-seul', 1)];
    expect(removeEntry(entries, 'a').map((e) => e.id)).toEqual(['b']);
  });

  it('resserre les trous', () => {
    const entries = [cook('a', '2026-11-16', 'riz-seul', 1), cook('b', '2026-11-19', 'riz-seul', 1)];
    expect(closeGaps(entries, '2026-11-15').map((e) => e.date)).toEqual(['2026-11-15', '2026-11-16']);
  });

  it('signale un reste qui dépasse la conservation', () => {
    const entries = [cook('a', '2026-11-14', 'riz-courgette', 2, true), left('a1', '2026-11-18', 'a')];
    const w = validatePlan(entries, recipes, '2026-11-14');
    expect(w.some((x) => x.entryId === 'a1' && x.level === 'alerte')).toBe(true);
  });
});

describe('repas du plan, indépendants de la fiche', () => {
  it('ajuster les quantités d’un repas change le stock et la nutrition, pas la fiche', () => {
    let entries: PlanEntry[] = [cook('c1', '2026-11-14', 'riz-courgette', 2, true), left('r1', '2026-11-15', 'c1')];
    entries = setIngredients(entries, 'c1', [{ foodId: 'riz', qty: 300 }]);
    const data = makeData(entries);
    const idx = indexFoods(foods);
    const s = computeStock(data, idx, '2026-11-15');
    expect(s.get('riz')!.remaining).toBe(700);
    expect(s.get('courgette')!.remaining).toBe(4);
    expect(dayNutrition(data, idx, '2026-11-15').total.kcal).toBeCloseTo(1050 / 2);
    expect(recipes[0].ingredients).toEqual([{ foodId: 'riz', qty: 200 }, { foodId: 'courgette', qty: 2 }]);
    expect(mealOf(data, entries[1])!.adjusted).toBe(true);
    expect(mealOf(data, entries[0])!.adjusted).toBe(true);
    expect(mealOf(data, entries[0])!.name).toBe('Riz courgette');
  });

  it('changer le nombre de repas met les quantités à l’échelle et ajoute ou retire des restes', () => {
    let entries: PlanEntry[] = [cook('c1', '2026-11-16', 'riz-courgette', 2), left('r1', '2026-11-17', 'c1'), cook('b', '2026-11-18', 'riz-seul', 1)];
    entries = setPortions(entries, recipes, 'c1', 3);
    expect(entries.filter((e) => e.batchId === 'c1').map((e) => e.date)).toEqual(['2026-11-17', '2026-11-18']);
    expect(entries.find((e) => e.id === 'b')!.date).toBe('2026-11-19');
    const data = makeData(entries);
    expect(mealOf(data, entries[0])!.ingredients).toEqual([{ foodId: 'riz', qty: 300 }, { foodId: 'courgette', qty: 3 }]);
    entries = setIngredients(entries, 'c1', [{ foodId: 'riz', qty: 300 }]);
    entries = setPortions(entries, recipes, 'c1', 1);
    expect(entries.filter((e) => e.batchId === 'c1')).toHaveLength(0);
    expect(entries.find((e) => e.id === 'b')!.date).toBe('2026-11-17');
    expect(entries.find((e) => e.id === 'c1')!.ingredients).toEqual([{ foodId: 'riz', qty: 100 }]);
  });

  it('un plat composé sans fiche sort du stock une fois coché', () => {
    let entries = planCustom([], '2026-11-14', 'Riz sauté', 1, [{ foodId: 'riz', qty: 150 }]);
    entries = entries.map((e) => ({ ...e, done: true }));
    const data = makeData(entries);
    const idx = indexFoods(foods);
    expect(computeStock(data, idx, '2026-11-14').get('riz')!.remaining).toBe(850);
    expect(mealOf(data, entries[0])!).toMatchObject({ name: 'Riz sauté', custom: true });
    expect(dayNutrition(data, idx, '2026-11-14').total.kcal).toBeCloseTo(525);
  });

  it('une fiche sans quantités part avec une liste vide à compléter', () => {
    const bare = { id: 'bare', name: 'Fiche texte', status: 'à découvrir', dish: 'Plat', favorite: false, steps: [] } as Recipe;
    const entries = planRecipe([], '2026-11-14', bare, 2);
    expect(entries[0].ingredients).toEqual([]);
    expect(entries).toHaveLength(2);
  });
});

describe('poids', () => {
  it('lisse les pesées et calcule une vitesse hebdomadaire', () => {
    const pts = weightTrend([
      { date: '2026-11-01', kg: 80 },
      { date: '2026-11-08', kg: 79.5 },
      { date: '2026-11-15', kg: 79 },
      { date: '2026-11-22', kg: 78.6 },
    ]);
    expect(pts[0].trend).toBe(80);
    expect(pts[3].trend).toBeLessThan(80);
    expect(pts[3].trend).toBeGreaterThan(78.6);
    expect(weeklyRate(pts)!).toBeLessThan(0);
  });
});

describe('plusieurs repas par jour', () => {
  it('additionne les repas posés le même jour', () => {
    const data = makeData([cook('c1', '2026-11-16', 'riz-courgette', 1), cook('c2', '2026-11-16', 'riz-seul', 1)]);
    const d = dayNutrition(data, indexFoods(foods), '2026-11-16');
    expect(d.meals).toHaveLength(2);
    expect(d.total.kcal).toBeCloseTo(390 + 350);
    expect(d.meal!.nutrients.kcal).toBeCloseTo(390);
  });

  it('la portion réellement mangée change le bilan, pas le stock', () => {
    const eaten = setEaten([cook('c1', '2026-11-16', 'riz-courgette', 2, true)], 'c1', 0.75);
    const d = dayNutrition(makeData(eaten), indexFoods(foods), '2026-11-16');
    expect(d.total.kcal).toBeCloseTo(390 * 0.75);
    // Le plat est cuit avec tous ses ingrédients : le stock baisse d'autant.
    const s = computeStock(makeData(eaten), indexFoods(foods), '2026-11-16');
    expect(s.get('riz')!.remaining).toBe(800);
    expect(s.get('courgette')!.remaining).toBe(2);
  });
});

describe('repas passés à régler', () => {
  it('ne retient que ce qui attend une réponse', () => {
    const entries = [
      cook('c1', '2026-11-13'),
      cook('c2', '2026-11-14', 'riz-courgette', 2, true),
      ...setSkipped([cook('c3', '2026-11-15')], 'c3'),
      left('r1', '2026-11-15', 'c4'),
      cook('c4', '2026-11-16'),
      { id: 'o1', date: '2026-11-12', kind: 'out' as const },
    ];
    expect(pendingPast(entries, '2026-11-16').map((e) => e.id)).toEqual(['r1', 'c1']);
  });

  it('un repas non coché ne sort rien du stock, un repas coché oui', () => {
    expect(computeStock(makeData([cook('c1', '2026-11-13')]), indexFoods(foods), '2026-11-14').get('riz')!.remaining).toBe(1000);
    const checked = toggleDone([cook('c1', '2026-11-13')], 'c1');
    expect(computeStock(makeData(checked), indexFoods(foods), '2026-11-14').get('riz')!.remaining).toBe(800);
  });

  it('cocher un repas efface « non mangé », et l’inverse', () => {
    const skipped = setSkipped([cook('c1', '2026-11-13')], 'c1');
    expect(skipped[0].skipped).toBe(true);
    const back = toggleDone(skipped, 'c1');
    expect(back[0].done).toBe(true);
    expect(back[0].skipped).toBe(false);
    expect(setSkipped(back, 'c1')[0].done).toBe(false);
  });
});

describe('validation du plan', () => {
  const entries = [cook('c1', '2026-11-16', 'riz-courgette', 1), cook('c2', '2026-11-16', 'riz-seul', 1)];
  it('deux repas le même jour : une anomalie seulement si le réglage en prévoit un', () => {
    const one = validatePlan(entries, recipes, '2026-11-16', 1);
    expect(one.filter((w) => w.message.includes('même jour'))).toHaveLength(1);
    expect(validatePlan(entries, recipes, '2026-11-16', 2).filter((w) => w.message.includes('même jour'))).toHaveLength(0);
  });
});
