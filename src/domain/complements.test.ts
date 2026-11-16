import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPLEMENTS, mergeComplements, scaledItems, searchComplements } from './complements';

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
});
