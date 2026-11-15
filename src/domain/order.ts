import type { Food } from './types';

/**
 * Lire une commande de courses écrite à la main, une ligne par produit.
 * « 2 courgettes », « 1 kg de riz », « 500 g tomates cerises », « 6 œufs », « 1 boîte de pois chiches ».
 * Le résultat est une proposition : l'écran la montre et laisse corriger avant d'enregistrer.
 */

const STOP = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'les', 'un', 'une', 'au', 'aux', 'et', 'en', 'pour', 'avec', 'x', 'a']);

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[’']/g, ' ');

const singular = (t: string) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t);
const tokens = (s: string) =>
  normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(singular);

const UNITS: [RegExp, number, 'g' | 'ml' | 'pcs'][] = [
  [/^(kg|kilos?|kilogrammes?)$/, 1000, 'g'],
  [/^(g|gr|grammes?)$/, 1, 'g'],
  [/^(l|litres?)$/, 1000, 'ml'],
  [/^(cl|centilitres?)$/, 10, 'ml'],
  [/^(ml|millilitres?)$/, 1, 'ml'],
  [/^(pieces?|unites?|u)$/, 1, 'pcs'],
];

export interface ParsedLine {
  line: string;
  label: string;
  foodId?: string;
  /** Quantité dans l'unité de l'aliment (g, ml ou pièces). */
  qty?: number;
  /** Le nombre était écrit sans unité : la quantité est une proposition. */
  guessed?: boolean;
  ok: boolean;
  /** Deux aliments se disputaient la ligne. */
  ambiguous?: string[];
}

const quantityOf = (food: Food, n: number, unit: 'g' | 'ml' | 'pcs' | undefined, explicit: boolean): { qty: number; guessed: boolean } => {
  if (unit === 'g' || unit === 'ml' || unit === 'pcs') return { qty: n, guessed: false };
  // Pas d'unité : un compte pour les pièces, sinon le contenu d'un conditionnement.
  if (food.unit === 'pièce') return { qty: n, guessed: false };
  if (food.pack) return { qty: n * food.pack.size, guessed: true };
  return { qty: n, guessed: !explicit };
};

export function parseOrder(text: string, foods: Food[]): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-–*•]\s*/, '');
    if (!line) continue;

    const m = /^(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogrammes?|g|gr|grammes?|l|litres?|cl|centilitres?|ml|millilitres?|pi[eè]ces?|unit[eé]s?|u)?\b\.?\s*(?:x\s*)?(.*)$/i.exec(line);
    let n: number | undefined;
    let unit: 'g' | 'ml' | 'pcs' | undefined;
    let rest = line;
    if (m) {
      n = Number(m[1].replace(',', '.'));
      const u = m[2]?.toLowerCase();
      if (u) {
        const found = UNITS.find(([re]) => re.test(u));
        unit = found?.[2];
        if (found && found[2] !== 'pcs' && n) n = n * found[1];
      }
      rest = m[3] ?? '';
    }
    // « 100 g de semoule extra-fine, pas de semoule de couscous » : la première proposition suffit.
    const wanted = tokens(rest.split(/[,;(]/)[0]);
    if (wanted.length === 0) {
      out.push({ line, label: line, ok: false });
      continue;
    }

    const scored = foods
      .map((food) => {
        // Le nom entre parenthèses (« Riz (thaï ou reste) ») ne doit pas créer de fausses correspondances.
        const have = new Set(tokens(food.name.split('(')[0]));
        const hits = wanted.filter((t) => have.has(t));
        // Deux couvertures : ce que la ligne dit, et ce que le nom du produit contient.
        // « semoule extra-fine » trouve « Semoule » sans que « Veloutés (courgette) » ne trouve « courgette ».
        const line = hits.length / wanted.length;
        const name = hits.length / Math.max(1, have.size);
        const exact = have.size === wanted.length && hits.length === wanted.length ? 0.5 : 0;
        return { food, score: line + 0.6 * name + exact, hits: hits.length, line };
      })
      .filter((x) => x.line >= 1 / 3)
      .sort((a, b) => b.score - a.score || b.hits - a.hits);

    const best = scored[0];
    if (!best) {
      out.push({ line, label: rest || line, ok: false });
      continue;
    }
    const tied = scored.filter((x) => x.score === best.score && x.hits === best.hits).map((x) => x.food.name);
    if (!n) {
      out.push({ line, label: best.food.name, foodId: best.food.id, ok: false, ambiguous: tied.length > 1 ? tied : undefined });
      continue;
    }
    const { qty, guessed } = quantityOf(best.food, n, unit, !!m?.[2]);
    out.push({ line, label: best.food.name, foodId: best.food.id, qty, guessed, ok: true, ambiguous: tied.length > 1 ? tied : undefined });
  }
  return out;
}
