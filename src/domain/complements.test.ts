import { describe, expect, it } from 'vitest';
import { scaledItems, snackAmount, snackItems } from './complements';

const laitChocolat = {
  id: 'perso-lait-chocolat',
  name: 'Lait chocolaté',
  items: [
    { foodId: 'lait', qty: 250 },
    { foodId: 'chocolat-poudre', qty: 15 },
  ],
};

describe('compléments', () => {
  it('multiplie toute la portion quand la quantité change', () => {
    const items = scaledItems(laitChocolat, 500);
    expect(items[0].qty).toBe(500);
    expect(items[1].qty).toBe(30);
  });

  it('ajuste la quantité depuis sa portion mémorisée, sans dérive', () => {
    const snack = {
      id: 's',
      date: '2026-11-19',
      label: laitChocolat.name,
      items: scaledItems(laitChocolat, 250),
      ideaId: laitChocolat.id,
      amount: 250,
    };
    expect(snackAmount(snack)).toBe(250);
    const twice = snackItems(snack, [laitChocolat], 500);
    expect(twice[0].qty).toBe(500);
    expect(twice[1].qty).toBe(30);
    const back = snackItems({ ...snack, items: twice, amount: 500 }, [laitChocolat], 250);
    expect(back[0].qty).toBe(250);
    expect(back[1].qty).toBe(15);
  });

  it('ajuste une portion choisie dans le catalogue en gardant ses proportions', () => {
    const snack = { id: 's2', date: '2026-11-19', label: 'Skyr nature', items: [{ foodId: 'skyr', qty: 1 }], amount: 1 };
    expect(snackAmount(snack)).toBe(1);
    expect(snackItems(snack, [], 2)).toEqual([{ foodId: 'skyr', qty: 2 }]);
  });

  it('retombe sur les proportions quand la portion mémorisée a disparu', () => {
    const snack = {
      id: 's3',
      date: '2026-11-19',
      label: 'Skyr nature',
      items: [{ foodId: 'skyr', qty: 2 }],
      ideaId: 'portion-disparue',
      amount: 2,
    };
    expect(snackItems(snack, [], 1)).toEqual([{ foodId: 'skyr', qty: 1 }]);
  });
});
