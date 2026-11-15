import { describe, expect, it } from 'vitest';
import { parseOrder } from './order';
import { ZERO } from './nutrition';
import type { Food } from './types';

const n = { ...ZERO, kcal: 100 };
const food = (id: string, name: string, unit: Food['unit'], extra: Partial<Food> = {}): Food => ({
  id,
  name,
  unit,
  category: 'légumes',
  per100: n,
  storage: 'frigo',
  shelfLifeDays: 5,
  ...extra,
});

const foods: Food[] = [
  food('courgette', 'Courgette', 'pièce', { gramsPerUnit: 200, piece: ['courgette', 'courgettes'] }),
  food('riz', 'Riz blanc', 'g', { category: 'féculents', storage: 'placard', shelfLifeDays: 365 }),
  food('tomates-cerises', 'Tomates cerises', 'g'),
  food('oeuf', 'Œuf', 'pièce', { category: 'viandes & œufs', gramsPerUnit: 55 }),
  food('pois-chiches', 'Pois chiches', 'g', { category: 'légumineuses', storage: 'placard', pack: { size: 400, label: '1 boîte = 400 g' } }),
  food('lait-coco', 'Lait de coco', 'ml', { category: 'épicerie', storage: 'placard', pack: { size: 400, label: '1 brique = 400 ml' } }),
  food('semoule', 'Semoule', 'g', { category: 'féculents', storage: 'placard' }),
  food('farine', 'Farine T55', 'g', { category: 'épicerie', storage: 'placard' }),
];

const one = (text: string) => parseOrder(text, foods)[0];

describe('lire une commande', () => {
  it('reconnaît un produit décrit avec des précisions', () => {
    // Cas réel des fiches : « 100 g de semoule extra-fine, pas de semoule de couscous ».
    expect(one('100 g de semoule extra-fine, pas de semoule de couscous').foodId).toBe('semoule');
    expect(one('200 g de farine T55 ou T65').qty).toBe(200);
  });

  it('ne confond pas un produit avec un plat qui le contient', () => {
    const foodsWithSoup: Food[] = [...foods, food('veloutes', 'Veloutés (courgette, pomme de terre)', 'g')];
    const line = parseOrder('2 courgettes', foodsWithSoup)[0];
    expect(line.foodId).toBe('courgette');
  });

  it('comprend les pièces, les kilos et les grammes', () => {
    expect(one('2 courgettes')).toMatchObject({ foodId: 'courgette', qty: 2, ok: true });
    expect(one('1 kg de riz')).toMatchObject({ foodId: 'riz', qty: 1000, ok: true });
    expect(one('500 g de tomates cerises')).toMatchObject({ foodId: 'tomates-cerises', qty: 500, ok: true });
    expect(one('0,5 kg de riz')).toMatchObject({ foodId: 'riz', qty: 500, ok: true });
    expect(one('- 6 œufs')).toMatchObject({ foodId: 'oeuf', qty: 6, ok: true });
  });

  it('déduit le contenu d’un conditionnement quand le nombre est nu', () => {
    const l = one('1 boîte de pois chiches');
    expect(l).toMatchObject({ foodId: 'pois-chiches', qty: 400, guessed: true, ok: true });
    expect(one('2 lait de coco')).toMatchObject({ foodId: 'lait-coco', qty: 800, ok: true });
  });

  it('reconnaît un produit sans quantité, mais ne l’invente pas', () => {
    const l = one('Bananes');
    expect(l.ok).toBe(false);
    expect(l.foodId).toBeUndefined();
    const riz = one('Riz blanc');
    expect(riz).toMatchObject({ foodId: 'riz', ok: false });
    expect(riz.qty).toBeUndefined();
  });

  it('laisse de côté ce qu’il ne connaît pas, sans bloquer le reste', () => {
    const lines = parseOrder('2 courgettes\nfromage qui pue\n3 carottes', foods);
    expect(lines).toHaveLength(3);
    expect(lines[0].ok).toBe(true);
    expect(lines[1]).toMatchObject({ ok: false });
    expect(lines[1].foodId).toBeUndefined();
    expect(lines[2]).toMatchObject({ ok: false });
  });

  it('signale les aliments qui se disputaient la ligne', () => {
    const deux: Food[] = [food('a', 'Tomates cerises', 'g'), food('b', 'Tomates séchées', 'g')];
    const l = parseOrder('500 g de tomates', deux)[0];
    expect(l.ambiguous?.length).toBeGreaterThan(1);
  });
});
