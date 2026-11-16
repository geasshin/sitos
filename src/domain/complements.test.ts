import { describe, expect, it } from 'vitest';
import { DEFAULT_COMPLEMENTS, mergeComplements, searchComplements } from './complements';

describe('compléments', () => {
  it('ne garde qu’une entrée par nom, celle de la personne gagnant', () => {
    const custom = { id: 'perso', name: 'Un skyr nature', items: [{ foodId: 'skyr', qty: 2 }] };
    const merged = mergeComplements([custom]);
    expect(merged.filter((c) => c.name === 'Un skyr nature')).toHaveLength(1);
    expect(merged.find((c) => c.name === 'Un skyr nature')!.items[0].qty).toBe(2);
    expect(merged.length).toBeGreaterThanOrEqual(DEFAULT_COMPLEMENTS.length);
  });

  it('cherche sans tenir compte des accents ni de la casse', () => {
    expect(searchComplements(DEFAULT_COMPLEMENTS, 'amande').some((c) => c.name.includes('amandes'))).toBe(true);
    expect(searchComplements(DEFAULT_COMPLEMENTS, 'EMMENTAL').some((c) => c.name.includes('emmental'))).toBe(true);
    expect(searchComplements(DEFAULT_COMPLEMENTS, 'introuvable')).toHaveLength(0);
  });
});
