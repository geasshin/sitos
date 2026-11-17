import { describe, expect, it } from 'vitest';
import { assessDay, recommendSides, sideCandidates, type Candidate } from './balance';
import { indexFoods, sugarsExLactose, ZERO } from './nutrition';
import { applyTargets, computeTargets, henryBMR, mealTargets, targetsOf } from './targets';
import type { Food, Profile, Settings } from './types';

const aurelien: Profile = {
  sex: 'homme',
  age: 27,
  heightCm: 188,
  weightKg: 80,
  activity: 'faible',
  goal: 'doucement',
  diet: 'flexitarien',
  rhythm: 'un-repas',
  updatedAt: '2026-11-14',
};

describe('objectifs', () => {
  it('suit l’équation de Henry (2005), homme de 18 à 30 ans', () => {
    // 14,4 × 80 + 3,13 × 188 + 113
    expect(henryBMR(aurelien)).toBeCloseTo(1853.44, 1);
    expect(henryBMR({ ...aurelien, sex: 'femme', age: 45, weightKg: 60, heightCm: 165 })).toBeCloseTo(8.18 * 60 + 5.02 * 165 - 11.6, 5);
  });

  it('applique le niveau d’activité, un déficit modéré et les repères ANSES', () => {
    const plan = computeTargets(aurelien);
    expect(plan.tdee).toBeCloseTo(1853.44 * 1.4, 1);
    // 0,25 kg par semaine ≈ 275 kcal par jour, arrondi à 50 kcal
    expect(plan.targets.kcal).toBe(2300);
    expect(plan.targets.protein).toBe(80);
    expect(plan.proteinRef).toBeCloseTo(66.4, 1);
    expect(plan.targets.fiber).toBe(30);
    expect(plan.targets.sugarsMaxG).toBe(100);
    expect(plan.targets.saltMaxG).toBe(5);
    expect(plan.targets.satFatMaxG).toBe(Math.round((2300 * 0.12) / 9));
    expect(plan.targets.mealShare).toBe(0.75);
  });

  it('plafonne le déficit à 20 % de la dépense et ne descend jamais sous le métabolisme de base', () => {
    const plan = computeTargets({ ...aurelien, goal: 'perdre' });
    expect(plan.deficit).toBeLessThanOrEqual(plan.tdee * 0.2 + 25);
    const petit = computeTargets({ ...aurelien, sex: 'femme', weightKg: 48, heightCm: 155, goal: 'perdre' });
    expect(petit.targets.kcal).toBeGreaterThanOrEqual(Math.round(petit.bmr / 50) * 50);
  });

  it('garde la référence 0,83 g/kg pour maintenir son poids', () => {
    expect(computeTargets({ ...aurelien, goal: 'maintenir' }).targets.protein).toBe(65);
  });

  it('enregistre les objectifs validés dans les réglages et les relit', () => {
    const base: Settings = { kcalTarget: 2000, proteinTarget: 100, fiberTarget: 30, plantTargetG: 400, fruitsPerDay: 1, demo: false };
    const t = { ...computeTargets(aurelien).targets, protein: 85 };
    const saved = applyTargets(base, aurelien, t);
    expect(saved.profile).toEqual(aurelien);
    expect(targetsOf(saved)).toEqual(t);
    // anciens réglages sans plafonds : repères calculés
    expect(targetsOf(base).satFatMaxG).toBe(27);
  });
});

const n = (v: Partial<typeof ZERO>) => ({ ...ZERO, ...v });
const foods: Food[] = [
  { id: 'skyr', name: 'Skyr', category: 'laitiers', unit: 'pièce', gramsPerUnit: 100, per100: n({ kcal: 63, protein: 11, carbs: 4, sugars: 4, lactose: 3.5 }), storage: 'frigo', shelfLifeDays: 20 },
  { id: 'pomme', name: 'Pomme', category: 'fruits', unit: 'pièce', gramsPerUnit: 160, per100: n({ kcal: 52, carbs: 11.6, sugars: 9.4, fiber: 1.4 }), storage: 'fruitier', shelfLifeDays: 30 },
  { id: 'twix', name: 'Twix', category: 'sucré', unit: 'pièce', gramsPerUnit: 25, per100: n({ kcal: 523, protein: 6, carbs: 63, sugars: 47, fat: 28, satFat: 16 }), storage: 'placard', shelfLifeDays: 200 },
  { id: 'tomates-cerises', name: 'Tomates cerises', category: 'légumes', unit: 'g', per100: n({ kcal: 34, protein: 1.3, carbs: 5, sugars: 4.8, fiber: 1.2 }), storage: 'frigo', shelfLifeDays: 7 },
];
const fx = indexFoods(foods);
const t = computeTargets(aurelien).targets;

describe('bilan du jour', () => {
  it('compte les sucres hors lactose, comme l’ANSES', () => {
    expect(sugarsExLactose(n({ sugars: 10, lactose: 4 }))).toBe(6);
    const b = assessDay(n({ kcal: 1000, sugars: 120, lactose: 30 }), 0, t);
    expect(b.rows.find((r) => r.key === 'sugars')!.value).toBe(90);
    expect(b.rows.find((r) => r.key === 'sugars')!.status).toBe('ok');
  });

  it('signale les manques et les excès', () => {
    const b = assessDay(n({ kcal: 2300, protein: 40, carbs: 300, fat: 80, fiber: 31, satFat: 40, salt: 6 }), 450, t);
    const status = Object.fromEntries(b.rows.map((r) => [r.key, r.status]));
    expect(status).toMatchObject({ kcal: 'ok', protein: 'bas', fiber: 'ok', plant: 'ok', satFat: 'haut', salt: 'haut' });
    expect(b.split!.protein + b.split!.fat + b.split!.carbs).toBeCloseTo(100, 5);
  });
});

describe('à-côtés', () => {
  const all: Candidate[] = [
    { id: 'skyr', label: 'Un skyr', items: [{ foodId: 'skyr', qty: 1 }] },
    { id: 'pomme', label: 'Une pomme', items: [{ foodId: 'pomme', qty: 1 }] },
    { id: 'twix', label: 'Un Twix', items: [{ foodId: 'twix', qty: 1 }] },
  ];

  it('propose d’abord ce qui comble le plus gros manque : les protéines, puis un fruit', () => {
    const r = recommendSides({ nutrients: n({ kcal: 1500, protein: 40, fiber: 25 }), plantG: 380 }, t, all, fx);
    expect(r.picks.map((p) => p.candidate.id).slice(0, 2)).toEqual(['skyr', 'pomme']);
    expect(r.picks[0].brings[0]).toBe('+11 g de protéines');
  });

  it('préfère un fruit quand ce sont les légumes et fruits qui manquent le plus', () => {
    const r = recommendSides({ nutrients: n({ kcal: 1500, protein: 70, fiber: 25 }), plantG: 150 }, t, all, fx);
    expect(r.picks[0].candidate.id).toBe('pomme');
  });

  it('ne propose pas deux fois le même aliment le même soir', () => {
    const withSkyr = [...all, { id: 'skyr-pomme', label: 'Skyr et pomme', items: [{ foodId: 'skyr', qty: 1 }, { foodId: 'pomme', qty: 1 }] }];
    const r = recommendSides({ nutrients: n({ kcal: 900, protein: 20, fiber: 10 }), plantG: 100 }, t, withSkyr, fx);
    const used = r.picks.flatMap((p) => p.candidate.items.map((i) => i.foodId));
    expect(new Set(used).size).toBe(used.length);
  });

  it('ne propose rien de calorique quand la journée est déjà pleine', () => {
    const r = recommendSides({ nutrients: n({ kcal: 2400, protein: 90, fiber: 30 }), plantG: 450 }, t, all, fx);
    expect(r.picks.map((p) => p.candidate.id)).not.toContain('twix');
  });

  it('ne garde que les à-côtés réellement en stock', () => {
    const ideas = [{ id: 'skyr-pomme', name: 'Skyr et pomme', items: [{ foodId: 'skyr', qty: 1 }, { foodId: 'pomme', qty: 1 }] }];
    const stock: Record<string, number> = { skyr: 3, pomme: 0, 'tomates-cerises': 250 };
    const c = sideCandidates(ideas, fx, (id) => stock[id] ?? 0);
    expect(c.map((x) => x.id)).toEqual(['side-skyr', 'side-tomates']);
  });

  it('dit ce qui manquera encore', () => {
    const r = recommendSides({ nutrients: n({ kcal: 700, protein: 20, fiber: 8 }), plantG: 100 }, t, [], fx);
    expect(r.stillMissing[0]).toBe('1600 kcal');
    expect(r.missing.map((g) => g.key)).toEqual(['kcal', 'protein', 'fiber', 'plant']);
    expect(r.missing[1].amount).toBe(t.protein - 20);
  });

  it('ne signale pas un manque dans la marge (énergie à 90 %, protéines à 95 %)', () => {
    const r = recommendSides({ nutrients: n({ kcal: t.kcal * 0.9, protein: t.protein * 0.95, fiber: t.fiber }), plantG: t.plantG }, t, [], fx);
    expect(r.missing).toEqual([]);
  });
});

describe('nombre de repas par jour', () => {
  it('deux repas : un repas pèse 45 % de la journée, et le réglage est prioritaire', () => {
    const t = targetsOf({ kcalTarget: 2000, proteinTarget: 100, fiberTarget: 30, plantTargetG: 400, fruitsPerDay: 1, demo: true, mealsPerDay: 2 });
    expect(t.mealsPerDay).toBe(2);
    expect(t.mealShare).toBe(0.45);
    expect(mealTargets(t).kcal).toBeCloseTo(900);
  });

  it('un seul repas par défaut', () => {
    const t = targetsOf({ kcalTarget: 2000, proteinTarget: 100, fiberTarget: 30, plantTargetG: 400, fruitsPerDay: 1, demo: true });
    expect(t.mealsPerDay).toBe(1);
    expect(t.mealShare).toBe(0.75);
  });
});
