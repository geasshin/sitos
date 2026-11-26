import { describe, expect, it } from 'vitest';
import { groupByFamily, normalizeSearch, searchFoods, stockOf, type StockMap } from './foodSearch';
import type { Category, Food, Nutrients } from './types';

const ZERO: Nutrients = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  sugars: 0,
  lactose: 0,
  fat: 0,
  satFat: 0,
  fiber: 0,
  salt: 0,
};

function food(id: string, name: string, category: Category, extra: Partial<Food> = {}): Food {
  return {
    id,
    name,
    category,
    unit: 'g',
    per100: { ...ZERO, kcal: 100, protein: 5 },
    storage: 'frigo',
    shelfLifeDays: 7,
    ...extra,
  };
}

const foods: Food[] = [
  food('carottes-rapees', 'Carottes râpées', 'légumes'),
  food('carotte', 'Carotte', 'légumes'),
  food('courgette', 'Courgette', 'légumes', { unit: 'pièce', gramsPerUnit: 300 }),
  food('tomate', 'Tomate', 'légumes'),
  food('aneth', 'Aneth', 'légumes'),
  food('tomate-cerise', 'Tomate cerise', 'légumes'),
  food('tomate-ronde', 'Tomate ronde', 'légumes'),
  food('banane', 'Banane', 'fruits', { unit: 'pièce', gramsPerUnit: 120 }),
  food('creme-fraiche', 'Crème fraîche', 'laitiers', { unit: 'ml' }),
  food('creme', 'CREME', 'laitiers', { unit: 'ml' }),
  food('lait', 'Lait demi-écrémé', 'laitiers', { unit: 'ml' }),
  food('yaourt', 'Yaourt nature', 'laitiers'),
  food('oeuf', 'Œuf', 'viandes & œufs', { unit: 'pièce', gramsPerUnit: 50 }),
  food('poulet', 'Filet de poulet', 'viandes & œufs'),
  food('amandes', 'Amandes', 'épicerie'),
  food('huile', 'Huile d’olive', 'matières grasses', { unit: 'ml' }),
  food('riz', 'Riz basmati', 'féculents'),
  food('pain', 'Pain complet', 'féculents'),
  food('chocolat', 'Chocolat noir', 'sucré'),
];

describe('recherche du catalogue d’aliments', () => {
  it('met la forme comparable en minuscules, sans accent, sans ligature ni apostrophe', () => {
    expect(normalizeSearch('  CRÈME  fraîche ')).toBe('creme fraiche');
    expect(normalizeSearch('Œufs d’olive')).toBe('oeufs d olive');
    expect(normalizeSearch('M&M’s')).toBe('m m s');
  });

  it('trouve « Carottes râpées » avec « carotte rapee », sans accent ni terminaison', () => {
    const results = searchFoods(foods, 'carotte rapee');
    expect(results).toHaveLength(1);
    expect(results[0].food.name).toBe('Carottes râpées');
    expect(results[0].kind).toBe('prefix');
  });

  it('trouve « CREME » avec « crème », accent et casse indifférents', () => {
    const results = searchFoods(foods, 'crème');
    expect(results.some((match) => match.food.id === 'creme')).toBe(true);
    expect(results[0].food.id).toBe('creme');
  });

  it('trouve « Crème fraîche » avec « CREME » écrit en capitales', () => {
    const results = searchFoods(foods, 'CREME');
    expect(results.some((match) => match.food.id === 'creme-fraiche')).toBe(true);
  });

  it('trouve « Œuf » avec « oeuf » et avec « œuf »', () => {
    expect(searchFoods(foods, 'oeuf')[0]?.food.id).toBe('oeuf');
    expect(searchFoods(foods, 'œuf')[0]?.food.id).toBe('oeuf');
  });

  it('classe le début d’un mot avant le milieu du mot', () => {
    const results = searchFoods(foods, 'ane');
    expect(results.map((match) => match.food.id)).toEqual(['aneth', 'banane']);
    expect(results[0].kind).toBe('prefix');
    expect(results[1].kind).toBe('middle');
  });

  it('classe le nom entier avant le début du nom', () => {
    const results = searchFoods(foods, 'tomate');
    expect(results.map((match) => match.food.id)).toEqual(['tomate', 'tomate-cerise', 'tomate-ronde']);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('garde l’ordre du catalogue quand deux résultats ont le même score', () => {
    const results = searchFoods(foods, 'tomate');
    expect(results[1].food.id).toBe('tomate-cerise');
    expect(results[2].food.id).toBe('tomate-ronde');
    expect(results[1].score).toBe(results[2].score);
  });

  it('exige que chaque mot de la requête se retrouve dans l’aliment', () => {
    const results = searchFoods(foods, 'creme fraiche');
    expect(results.map((match) => match.food.id)).toEqual(['creme-fraiche']);
  });

  it('cherche par famille, avec ou sans accent', () => {
    const results = searchFoods(foods, 'legumes');
    expect(results).toHaveLength(7);
    expect(results.every((match) => match.food.category === 'légumes')).toBe(true);
    expect(results.every((match) => match.kind === 'family')).toBe(true);
    expect(searchFoods(foods, 'legum').map((match) => match.food.id)).toEqual(
      results.map((match) => match.food.id),
    );
  });

  it('cherche une famille dont le nom porte une esperluette et une ligature', () => {
    const results = searchFoods(foods, 'viandes');
    expect(results.map((match) => match.food.id)).toEqual(['oeuf', 'poulet']);
    expect(searchFoods(foods, 'oeufs').map((match) => match.food.id)).toEqual(['oeuf', 'poulet']);
  });

  it('ignore l’apostrophe dans la requête comme dans le nom', () => {
    expect(searchFoods(foods, "d'olive").map((match) => match.food.id)).toEqual(['huile']);
    expect(searchFoods(foods, 'd’olive').map((match) => match.food.id)).toEqual(['huile']);
  });

  it('filtre sur ce qui est en stock', () => {
    const stock: StockMap = new Map([['carotte', 200]]);
    const results = searchFoods(foods, 'legumes', { stock, onlyInStock: true });
    expect(results.map((match) => match.food.id)).toEqual(['carotte']);
    expect(results[0].stock).toBe(200);
  });

  it('met ce qui est en stock devant, à score égal', () => {
    const stock: StockMap = new Map([
      ['tomate-ronde', 500],
      ['tomate-cerise', 0],
    ]);
    const results = searchFoods(foods, 'tomate', { stock });
    expect(results.map((match) => match.food.id)).toEqual(['tomate', 'tomate-ronde', 'tomate-cerise']);
  });

  it('lit un stock numérique ou une fiche qui porte remaining', () => {
    const stock: StockMap = new Map<string, number | { remaining: number }>([
      ['a', 120],
      ['b', { remaining: 3.5 }],
      ['c', -4],
      ['d', 0],
    ]);
    expect(stockOf(stock, 'a')).toBe(120);
    expect(stockOf(stock, 'b')).toBe(3.5);
    expect(stockOf(stock, 'c')).toBe(0);
    expect(stockOf(stock, 'd')).toBe(0);
    expect(stockOf(stock, 'absent')).toBe(0);
    expect(stockOf(undefined, 'a')).toBe(0);
  });

  it('rend tout le catalogue, dans son ordre, pour une requête vide', () => {
    const results = searchFoods(foods, '   ');
    expect(results).toHaveLength(foods.length);
    expect(results.map((match) => match.food.id)).toEqual(foods.map((item) => item.id));
    expect(results.every((match) => match.score === 0 && match.kind === 'catalogue')).toBe(true);
  });

  it('combine la requête vide et le filtre de stock', () => {
    const stock: StockMap = new Map([['carotte', 200]]);
    const results = searchFoods(foods, '', { stock, onlyInStock: true });
    expect(results.map((match) => match.food.id)).toEqual(['carotte']);
  });

  it('rend une liste vide quand rien ne correspond', () => {
    expect(searchFoods(foods, 'sushi')).toEqual([]);
    expect(searchFoods(foods, 'sushi', { limit: 5 })).toEqual([]);
  });

  it('respecte la limite demandée', () => {
    expect(searchFoods(foods, 'tomate', { limit: 2 }).map((match) => match.food.id)).toEqual([
      'tomate',
      'tomate-cerise',
    ]);
    expect(searchFoods(foods, 'tomate', { limit: 0 })).toEqual([]);
  });

  it('ne modifie ni le catalogue ni l’ordre des aliments', () => {
    const before = foods.map((item) => item.id);
    searchFoods(foods, 'creme');
    expect(foods.map((item) => item.id)).toEqual(before);
    expect(foods[0].name).toBe('Carottes râpées');
  });

  it('groupe par famille dans l’ordre de la charte, sans casser l’ordre interne', () => {
    const groups = groupByFamily(searchFoods(foods, ''));
    expect(groups.map((group) => group.category)).toEqual([
      'légumes',
      'fruits',
      'féculents',
      'viandes & œufs',
      'laitiers',
      'matières grasses',
      'épicerie',
      'sucré',
    ]);
    expect(groups[0].label).toBe('Légumes');
    expect(groups[3].label).toBe('Viandes & œufs');
    expect(groups[0].matches.map((match) => match.food.id)).toEqual([
      'carottes-rapees',
      'carotte',
      'courgette',
      'tomate',
      'aneth',
      'tomate-cerise',
      'tomate-ronde',
    ]);
  });
});
