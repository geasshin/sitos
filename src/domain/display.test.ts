import { describe, expect, it } from 'vitest';
import { indexFoods, ZERO } from './nutrition';
import { amount, computeStock, forecast, fraction, priorities, rescueSuggestions, splitAmount } from './stock';
import type { Data, Food } from './types';

const n = (kcal: number) => ({ ...ZERO, kcal });
const ail: Food = { id: 'ail', name: 'Ail (gousses)', piece: ["gousse d'ail", "gousses d'ail"], category: 'légumes', unit: 'pièce', gramsPerUnit: 5, per100: n(130), storage: 'placard', shelfLifeDays: 60 };
const huile: Food = { id: 'huile', name: "Huile d'olive", category: 'matières grasses', unit: 'g', per100: n(900), storage: 'placard', shelfLifeDays: 365 };
const banane: Food = { id: 'banane', name: 'Bananes', piece: ['banane', 'bananes'], category: 'fruits', unit: 'pièce', gramsPerUnit: 120, per100: n(90), storage: 'fruitier', shelfLifeDays: 6, dailyFruit: true };
const pomme: Food = { id: 'pomme', name: 'Pommes', piece: ['pomme', 'pommes'], category: 'fruits', unit: 'pièce', gramsPerUnit: 160, per100: n(54), storage: 'fruitier', shelfLifeDays: 30, dailyFruit: true };

describe('affichage des quantités', () => {
  it('écrit des fractions lisibles', () => {
    expect(fraction(0.5)).toBe('½');
    expect(fraction(1.5)).toBe('1 ½');
    expect(fraction(2)).toBe('2');
    expect(fraction(0.33)).toBe('0,3');
  });
  it('accorde et élide', () => {
    expect(amount(ail, 1)).toBe("1 gousse d'ail");
    expect(amount(ail, 4)).toBe("4 gousses d'ail");
    expect(amount(ail, 1.5)).toBe("1 ½ gousse d'ail");
    expect(amount(huile, 15)).toBe("15 g d'huile d'olive");
    expect(splitAmount(ail, 2)).toEqual({ qty: '2', label: "Gousses d'ail" });
  });
});

describe('fruits nature', () => {
  const data = (fruitsPerDay: number): Data => ({
    foods: [banane, pomme],
    recipes: [],
    stock: [
      { id: 'b', foodId: 'banane', qty: 5, receivedAt: '2026-11-14' },
      { id: 'p', foodId: 'pomme', qty: 6, receivedAt: '2026-11-14' },
    ],
    plan: { startDate: '2026-11-14', entries: [] },
    journal: { snacks: [], adjustments: [], weights: [] },
    settings: { kcalTarget: 2000, proteinTarget: 100, fiberTarget: 30, plantTargetG: 400, fruitsPerDay, demo: false },
    snackIdeas: [],
  });

  it('mange le plus mûr d’abord : 5 bananes en 6 jours, rien ne se perd', () => {
    const d = data(1);
    const st = computeStock(d, indexFoods(d.foods), '2026-11-14');
    expect(forecast(d, st, '2026-11-14').losses).toEqual([]);
  });

  it('sans fruit quotidien, les bananes sont signalées', () => {
    const d = data(0);
    const st = computeStock(d, indexFoods(d.foods), '2026-11-14');
    const fc = forecast(d, st, '2026-11-14');
    expect(fc.losses[0]).toEqual({ foodId: 'banane', qty: 5, expiry: '2026-11-20' });
    expect(priorities(d, st, fc, '2026-11-14')[0].food.id).toBe('banane');
  });
});

describe('suggestions anti-gaspi', () => {
  it('met en tête la recette qui sauve le plus de produits', () => {
    const r1 = { id: 'r1', name: 'Un', status: 'maîtrisée' as const, dish: 'Plat' } as never;
    const r2 = { id: 'r2', name: 'Deux', status: 'maîtrisée' as const, dish: 'Plat' } as never;
    const prio = [
      { food: banane, expiry: '2026-11-20', daysLeft: 6, atRisk: 1, recipes: [r1] },
      { food: pomme, expiry: '2026-11-20', daysLeft: 6, atRisk: 1, recipes: [r1, r2] },
    ];
    const out = rescueSuggestions(prio);
    expect(out[0].recipe).toBe(r1);
    expect(out[0].foods.map((f) => f.id)).toEqual(['banane', 'pomme']);
  });
});
