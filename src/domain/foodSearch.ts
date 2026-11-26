import type { Category, Food } from './types';

/**
 * La recherche du catalogue unique d’aliments.
 *
 * Elle ne lit que le nom et la famille d’un aliment : aucune donnée n’est modifiée.
 * Les accents, la casse, les ligatures et l’apostrophe ne comptent pas, donc
 * « carotte rapee » trouve « Carottes râpées » et « crème » trouve « CREME ».
 *
 * Le score est volontairement simple, dans cet ordre :
 * nom entier, début du nom, mot entier, début d’un mot, milieu d’un mot, famille.
 * Une requête de plusieurs mots exige que chaque mot se retrouve dans l’aliment.
 * À score égal, ce qui est en stock passe devant, puis l’ordre du catalogue départage.
 */

/** Quantité disponible par aliment : un nombre, ou une fiche de stock qui porte `remaining`. */
export type StockMap = ReadonlyMap<string, number | { remaining: number }>;

export type FoodMatchKind = 'name' | 'prefix' | 'word' | 'middle' | 'family' | 'catalogue';

export interface FoodMatch {
  food: Food;
  score: number;
  /** La meilleure raison du rapprochement, utile pour expliquer un résultat. */
  kind: FoodMatchKind;
  /** Quantité restante, seulement quand un stock est fourni. */
  stock?: number;
}

export interface FoodSearchOptions {
  /** Stocks disponibles, pour la pastille et le tri. */
  stock?: StockMap;
  /** Ne garder que les aliments dont le stock est strictement positif. */
  onlyInStock?: boolean;
  /** Nombre maximum de résultats. */
  limit?: number;
}

const SCORE = {
  name: 140,
  namePrefix: 110,
  word: 100,
  wordPrefix: 70,
  middle: 35,
  family: 20,
  familyPrefix: 14,
} as const;

/** Ordre d’affichage des familles, celui du type `Category`. */
export const CATEGORY_ORDER: readonly Category[] = [
  'légumes',
  'fruits',
  'féculents',
  'légumineuses',
  'viandes & œufs',
  'laitiers',
  'matières grasses',
  'épicerie',
  'sucré',
  'boissons',
];

export interface FoodFamily {
  category: Category;
  /** Libellé prêt à afficher : « Légumes », « Viandes & œufs ». */
  label: string;
  matches: FoodMatch[];
}

/** Minuscules, sans accent, sans ligature, sans apostrophe : la forme comparable. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[’'`´]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Quantité restante d’un aliment, ramenée à zéro quand elle est absente ou négative. */
export function stockOf(stock: StockMap | undefined, foodId: string): number {
  const value = stock?.get(foodId);
  const qty = typeof value === 'number' ? value : value?.remaining;
  return typeof qty === 'number' && Number.isFinite(qty) && qty > 0 ? qty : 0;
}

interface TokenHit {
  score: number;
  kind: FoodMatchKind;
}

function scoreToken(
  token: string,
  name: string,
  words: readonly string[],
  familyWords: readonly string[],
): TokenHit | null {
  if (name === token) return { score: SCORE.name, kind: 'name' };
  if (name.startsWith(token)) return { score: SCORE.namePrefix, kind: 'prefix' };
  if (words.includes(token)) return { score: SCORE.word, kind: 'word' };
  if (words.some((word) => word.startsWith(token))) return { score: SCORE.wordPrefix, kind: 'prefix' };
  if (words.some((word) => word.includes(token))) return { score: SCORE.middle, kind: 'middle' };
  if (familyWords.includes(token)) return { score: SCORE.family, kind: 'family' };
  // Une famille ne se cherche pas avec deux lettres : « ep » ne doit pas ouvrir l’épicerie.
  if (token.length >= 3 && familyWords.some((word) => word.startsWith(token))) {
    return { score: SCORE.familyPrefix, kind: 'family' };
  }
  return null;
}

const wordsOf = (value: string) => normalizeSearch(value).split(' ').filter(Boolean);

interface RankedMatch extends FoodMatch {
  /** Position dans le catalogue, pour un tri stable. */
  index: number;
}

/**
 * Cherche dans le catalogue, sans le modifier.
 * Une requête vide rend tout le catalogue, dans son ordre d’origine.
 */
export function searchFoods(
  foods: readonly Food[],
  query: string,
  options: FoodSearchOptions = {},
): FoodMatch[] {
  const { stock, onlyInStock = false, limit } = options;
  const tokens = normalizeSearch(query).split(' ').filter(Boolean);
  const matches: RankedMatch[] = [];

  foods.forEach((food, index) => {
    const available = stock ? stockOf(stock, food.id) : undefined;
    if (onlyInStock && !(available && available > 0)) return;

    if (tokens.length === 0) {
      matches.push({ food, score: 0, kind: 'catalogue', stock: available, index });
      return;
    }

    const name = normalizeSearch(food.name);
    const words = name.split(' ').filter(Boolean);
    const familyWords = wordsOf(food.category);
    let total = 0;
    let best: TokenHit | null = null;

    for (const token of tokens) {
      const hit = scoreToken(token, name, words, familyWords);
      if (!hit) return;
      total += hit.score;
      if (!best || hit.score > best.score) best = hit;
    }

    matches.push({ food, score: total, kind: best?.kind ?? 'catalogue', stock: available, index });
  });

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const stockedA = a.stock !== undefined && a.stock > 0 ? 1 : 0;
    const stockedB = b.stock !== undefined && b.stock > 0 ? 1 : 0;
    if (stockedB !== stockedA) return stockedB - stockedA;
    return a.index - b.index;
  });

  const kept = limit !== undefined && limit >= 0 ? matches.slice(0, limit) : matches;
  return kept.map(({ food, score, kind, stock: qty }) => ({
    food,
    score,
    kind,
    ...(qty !== undefined ? { stock: qty } : {}),
  }));
}

/** Regroupe des résultats par famille, dans l’ordre du catalogue et sans casser le score. */
export function groupByFamily(matches: readonly FoodMatch[]): FoodFamily[] {
  const groups = new Map<Category, FoodMatch[]>();
  for (const match of matches) {
    const list = groups.get(match.food.category);
    if (list) list.push(match);
    else groups.set(match.food.category, [match]);
  }

  const rank = new Map(CATEGORY_ORDER.map((category, index) => [category, index] as const));
  return [...groups.entries()]
    .sort(([a], [b]) => {
      const rankA = rank.get(a) ?? CATEGORY_ORDER.length;
      const rankB = rank.get(b) ?? CATEGORY_ORDER.length;
      return rankA - rankB || a.localeCompare(b, 'fr');
    })
    .map(([category, list]) => ({
      category,
      label: category.charAt(0).toUpperCase() + category.slice(1),
      matches: list,
    }));
}
