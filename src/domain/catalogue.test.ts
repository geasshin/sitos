import { describe, expect, it } from 'vitest';
import catalogue from '../../starter/foods.json';
import { searchFoods } from './foodSearch';
import type { Food } from './types';

/**
 * Le catalogue livré : ce que l’app propose par défaut.
 *
 * Ces tests ne vérifient pas la table de l’ANSES, ils vérifient que ce qu’on en a importé
 * tient debout et que les mots qu’on tape vraiment au quotidien tombent sur le bon aliment.
 * Un import qui se casse se voit ici avant d’arriver dans l’app.
 */

const foods = catalogue as Food[];

describe('le catalogue livré', () => {
  it('porte des identifiants uniques', () => {
    const ids = new Set(foods.map((f) => f.id));
    expect(ids.size).toBe(foods.length);
  });

  it('donne à chaque aliment un nom et une famille connus', () => {
    for (const f of foods) {
      expect(f.name.trim().length, f.id).toBeGreaterThan(1);
      expect(['légumes', 'fruits', 'féculents', 'légumineuses', 'viandes & œufs', 'laitiers', 'matières grasses', 'épicerie', 'sucré', 'boissons']).toContain(f.category);
      expect(['g', 'ml', 'pièce']).toContain(f.unit);
    }
  });

  it('garde des valeurs plausibles, sans trou', () => {
    for (const f of foods) {
      const p = f.per100;
      expect(Number.isFinite(p.kcal), f.id).toBe(true);
      expect(p.kcal, f.id).toBeGreaterThanOrEqual(0);
      expect(p.kcal, f.id).toBeLessThanOrEqual(950);
      for (const k of ['protein', 'carbs', 'sugars', 'lactose', 'fat', 'satFat', 'fiber', 'salt'] as const) {
        expect(Number.isFinite(p[k]), `${f.id} ${k}`).toBe(true);
        expect(p[k], `${f.id} ${k}`).toBeGreaterThanOrEqual(0);
        expect(p[k], `${f.id} ${k}`).toBeLessThanOrEqual(100);
      }
      // Les sucres comptent dans les glucides, les saturés dans les lipides.
      expect(p.sugars, `${f.id} sucres`).toBeLessThanOrEqual(p.carbs + 0.5);
      expect(p.satFat, `${f.id} saturés`).toBeLessThanOrEqual(p.fat + 0.5);
    }
  });

  it('dépasse les trois mille aliments', () => {
    expect(foods.length).toBeGreaterThan(3000);
  });

  it('calcule l’énergie seulement quand l’ANSES ne la donne pas, et le dit', () => {
    const calculees = foods.filter((f) => (f.source ?? '').includes('énergie calculée'));
    expect(calculees.length).toBeGreaterThan(500);
    for (const f of calculees) {
      const p = f.per100;
      const attendu = 4 * p.carbs + 4 * p.protein + 9 * p.fat + 2 * p.fiber;
      expect(Math.abs(p.kcal - attendu), f.id).toBeLessThan(1);
    }
  });

  it('cite sa source', () => {
    const avecSource = foods.filter((f) => (f.source ?? '').includes('Ciqual'));
    expect(avecSource.length).toBeGreaterThan(2000);
  });
});

describe('les mots qu’on tape vraiment', () => {
  const premier = (q: string) => searchFoods(foods, q, { limit: 1 })[0]?.food.name ?? '';

  it.each([
    ['chips', /chips/i],
    ['brownie', /brownie/i],
    ['banane', /banane/i],
    ['yaourt', /yaourt/i],
    ['kebab', /kebab/i],
    ['pizza', /pizza/i],
    ['confiture', /confiture/i],
    ['courgette', /courgette/i],
    ['riz', /riz/i],
    ['saumon', /saumon/i],
  ])('« %s » tombe sur un aliment qui en parle', (mot, attendu) => {
    expect(premier(mot)).toMatch(attendu);
  });

  it('trouve malgré les accents et la casse', () => {
    expect(premier('creme')).toMatch(/cr[eè]me/i);
    expect(premier('PATES')).toMatch(/p[âa]tes/i);
  });

  it('ne rend rien pour un mot qui n’existe pas', () => {
    expect(searchFoods(foods, 'zzzzz', { limit: 3 })).toHaveLength(0);
  });
});
