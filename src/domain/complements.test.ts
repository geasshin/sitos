import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPLEMENTS, mergeComplements, scaledItems, searchComplements, snackAmount, snackItems } from './complements';

describe('compléments', () => {
  it('ne garde qu’une entrée par nom, celle de la personne gagnant', () => {
    const custom = { id: 'perso', name: 'Skyr nature', items: [{ foodId: 'skyr', qty: 2 }] };
    const merged = mergeComplements([custom]);
    const skyr = merged.filter((c) => c.name === 'Skyr nature');
    expect(skyr).toHaveLength(1);
    expect(skyr[0].items[0].qty).toBe(2);
    expect(merged.length).toBeGreaterThanOrEqual(DEFAULT_COMPLEMENTS.length);
  });

  it('cherche sans tenir compte des accents ni de la casse', () => {
    expect(searchComplements(DEFAULT_COMPLEMENTS, 'amande').some((c) => c.name.toLowerCase().includes('amandes'))).toBe(true);
    expect(searchComplements(DEFAULT_COMPLEMENTS, 'EMMENTAL').some((c) => c.name.toLowerCase().includes('emmental'))).toBe(true);
    expect(searchComplements(DEFAULT_COMPLEMENTS, 'introuvable')).toHaveLength(0);
  });

  it('multiplie toute la base quand la quantité change', () => {
    const combo = DEFAULT_COMPLEMENTS.find((c) => c.id === 'comp-lait-chocolat')!;
    const items = scaledItems(combo, 500);
    expect(items[0].qty).toBe(500);
    expect(items[1].qty).toBe(30);
  });

  it('ajuste la quantité d’un complément depuis sa base, sans dérive', () => {
    const combo = DEFAULT_COMPLEMENTS.find((c) => c.id === 'comp-lait-chocolat')!;
    const snack = { id: 's', date: '2026-11-19', label: combo.name, items: scaledItems(combo, 250), ideaId: combo.id, amount: 250 };
    expect(snackAmount(snack)).toBe(250);
    const twice = snackItems(snack, DEFAULT_COMPLEMENTS, 500);
    expect(twice[0].qty).toBe(500);
    expect(twice[1].qty).toBe(30);
    const back = snackItems({ ...snack, items: twice, amount: 500 }, DEFAULT_COMPLEMENTS, 250);
    expect(back[0].qty).toBe(250);
    expect(back[1].qty).toBe(15);
  });

  it('ajuste un complément saisi à la main en gardant ses proportions', () => {
    const snack = { id: 's2', date: '2026-11-19', label: 'Ma mixture', items: [{ foodId: 'skyr', qty: 100 }, { foodId: 'amandes', qty: 10 }] };
    expect(snackAmount(snack)).toBe(100);
    expect(snackItems(snack, [], 200)).toEqual([
      { foodId: 'skyr', qty: 200 },
      { foodId: 'amandes', qty: 20 },
    ]);
  });
});
