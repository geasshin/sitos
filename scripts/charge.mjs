#!/usr/bin/env node
/**
 * Le jeu de charge de Sitos, généré, jamais saisi à la main.
 *
 * Il écrit un dossier de données complet (les sept collections de l’app) :
 * 500 recettes, 2 000 achats, trois ans de plan et de journal, sur le catalogue
 * d’aliments livré dans starter/. Aucune donnée personnelle n’est lue : le script
 * ne touche ni à data/ ni au dossier de l’application installée, et refuse un
 * chemin qui tomberait dedans.
 *
 * Tout est déterministe : même graine, même jour de référence, mêmes fichiers.
 * L’empreinte SHA-256 affichée à la fin le prouve, et se compare d’une exécution
 * à l’autre.
 *
 * Usage :
 *   node scripts/charge.mjs [dossier] [--today=AAAA-MM-JJ] [--recettes=500] [--achats=2000]
 *                           [--catalogue=starter/foods.json]
 *
 * Sans dossier, il écrit dans <dossier temporaire>/sitos-charge.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STARTER = path.join(ROOT, 'starter');
const FORBIDDEN = [path.join(ROOT, 'data'), path.join(os.homedir(), 'Library', 'Application Support', 'com.aurelientrouble.sitos')];

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

/** PRNG à graine : mulberry32. Même graine, même suite, sur toute machine. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = prng(20261126);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const between = (min, max) => min + rnd() * (max - min);
const int = (min, max) => Math.floor(between(min, max + 1));
const chance = (p) => rnd() < p;
const round = (n, step = 1) => Math.round(n / step) * step;

const DAY = 86_400_000;
const toUTC = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => fromUTC(toUTC(d) + n * DAY);
const todayISO = () => {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

const fr = (n) => n.toLocaleString('fr-FR');

/* ------------------------------------------------------------------ */
/* Arguments                                                           */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const flags = new Map();
const rest = [];
for (const arg of args) {
  if (arg.startsWith('--')) {
    const [key, value = '1'] = arg.slice(2).split('=');
    flags.set(key, value);
  } else {
    rest.push(arg);
  }
}

const today = flags.get('today') ?? todayISO();
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
  console.error(`Jour de référence illisible : « ${today} ». Attendu : AAAA-MM-JJ.`);
  process.exit(1);
}

const target = path.resolve(rest[0] ?? path.join(os.tmpdir(), 'sitos-charge'));
const RECIPES = Number(flags.get('recettes') ?? 500);
const PURCHASES = Number(flags.get('achats') ?? 2000);
const YEARS = 3;
const START = addDays(today, -365 * YEARS - 1);
const END = addDays(today, 21);

/** Un dossier interdit : les vraies données, ou celles du dépôt. */
for (const forbidden of FORBIDDEN) {
  const a = path.resolve(forbidden);
  if (target === a || target.startsWith(a + path.sep)) {
    console.error(`Refusé : « ${target} » est dans ${a}, qui garde les vraies données.`);
    process.exit(1);
  }
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

// Le catalogue est une entrée du jeu de charge : on peut le figer pour rejouer
// exactement le même dossier même si starter/foods.json évolue entre deux essais.
const cataloguePath = path.resolve(flags.get('catalogue') ?? path.join(STARTER, 'foods.json'));
const catalogueRaw = await fs.readFile(cataloguePath, 'utf8');
const catalogueHash = createHash('sha256').update(catalogueRaw).digest('hex');
const foods = JSON.parse(catalogueRaw);
const snackIdeas = JSON.parse(await fs.readFile(path.join(STARTER, 'snackIdeas.json'), 'utf8'));
const byId = new Map(foods.map((f) => [f.id, f]));
const byCategory = (category) => foods.filter((f) => f.category === category);

const LÉGUMES = byCategory('légumes');
const FRUITS = byCategory('fruits');
const FÉCULENTS = byCategory('féculents');
const LÉGUMINEUSES = byCategory('légumineuses');
const VIANDES = byCategory('viandes & œufs');
const LAITIERS = byCategory('laitiers');
const MATIÈRES = byCategory('matières grasses');
const ÉPICERIE = byCategory('épicerie');
const SUCRÉ = byCategory('sucré');
const BOISSONS = byCategory('boissons');

/**
 * Le cœur du garde-manger : des aliments rachetés souvent, donc présents en stock.
 * Les recettes s’appuient dessus pour qu’une partie du carnet soit réellement
 * cuisinable, comme dans un frigo tenu.
 */
const CORE = [
  ...LÉGUMES.slice(0, 5),
  ...FRUITS.slice(0, 3),
  ...FÉCULENTS.slice(0, 3),
  ...LÉGUMINEUSES.slice(0, 2),
  ...VIANDES.slice(0, 3),
  ...LAITIERS.slice(0, 2),
  ...MATIÈRES.slice(0, 2),
  ...ÉPICERIE.slice(0, 3),
].map((f) => f.id);

const coreSet = new Set(CORE);
const coreFoods = CORE.map((id) => byId.get(id));

/* ------------------------------------------------------------------ */
/* Recettes                                                            */
/* ------------------------------------------------------------------ */

const DISHES = ['Plat', 'Entrée', 'Accompagnement', 'Sauce', 'Pain', 'Dessert', 'Apéritif', 'Boisson', 'Autre'];
const STATUSES = ['maîtrisée', 'terminé', 'à découvrir'];

const PLAT_NAMES = ['Rôti', 'Curry', 'Gratin', 'Poêlée', 'Ragoût', 'Tarte', 'Salade tiède', 'Bowl', 'Papillote', 'Mijoté'];
const ENTRÉE_NAMES = ['Salade', 'Velouté', 'Soupe', 'Carpaccio', 'Tartare', 'Bouchées'];
const ACCOMP_NAMES = ['Purée', 'Riz sauté', 'Gratin', 'Légumes rôtis', 'Semoule', 'Pommes de terre'];
const SAUCE_NAMES = ['Sauce', 'Vinaigrette', 'Pesto', 'Coulis', 'Marinade'];
const PAIN_NAMES = ['Pain', 'Focaccia', 'Brioche', 'Galette', 'Pancakes'];
const DESSERT_NAMES = ['Crumble', 'Compote', 'Gâteau', 'Clafoutis', 'Mousse', 'Salade de fruits'];
const APERO_NAMES = ['Tartinade', 'Houmous', 'Chips', 'Brochettes', 'Toasts'];
const BOISSON_NAMES = ['Smoothie', 'Jus', 'Infusion', 'Limonade', 'Lassi'];
const AUTRE_NAMES = ['Assiette', 'Sandwich', 'Wrap', 'Omelette', 'Risotto'];

const LISTS = {
  Plat: PLAT_NAMES,
  Entrée: ENTRÉE_NAMES,
  Accompagnement: ACCOMP_NAMES,
  Sauce: SAUCE_NAMES,
  Pain: PAIN_NAMES,
  Dessert: DESSERT_NAMES,
  Apéritif: APERO_NAMES,
  Boisson: BOISSON_NAMES,
  Autre: AUTRE_NAMES,
};

const QUALIFIERS = ['du jardin', 'au citron', 'aux herbes', 'à l’ail', 'au thym', 'façon maison', 'du dimanche', 'express', 'tout simple', 'de saison', 'au four', 'à la poêle'];

const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const typo = (s) => s.replace(/'/g, '’');

/** Un ingrédient plausible pour un aliment, à la quantité de la fournée. */
function ingredientFor(food) {
  if (food.unit === 'pièce') return { foodId: food.id, qty: int(1, 3) };
  const base = food.category === 'matières grasses' ? between(5, 30) : between(40, 400);
  return { foodId: food.id, qty: round(base, 5) };
}

function pickFood(pool, coreBias = 0.7) {
  if (chance(coreBias)) {
    const core = pool.filter((f) => coreSet.has(f.id));
    if (core.length) return pick(core);
  }
  return pick(pool);
}

/** Les ingrédients d’un plat, par famille, sans doublon. */
function ingredientsFor(dish) {
  const chosen = [];
  const add = (pool, n, bias = 0.7) => {
    for (let i = 0; i < n; i += 1) {
      const food = pickFood(pool, bias);
      if (food && !chosen.some((c) => c.foodId === food.id)) chosen.push(ingredientFor(food));
    }
  };
  switch (dish) {
    case 'Plat':
      add(LÉGUMES, 2);
      add(chance(0.35) ? LÉGUMINEUSES : VIANDES, 1);
      add(FÉCULENTS, 1);
      add(MATIÈRES, 1);
      add(ÉPICERIE, 1);
      break;
    case 'Entrée':
      add(LÉGUMES, 2);
      add(MATIÈRES, 1);
      if (chance(0.4)) add(FRUITS, 1);
      break;
    case 'Accompagnement':
      add(FÉCULENTS, 1);
      add(LÉGUMES, 1);
      add(MATIÈRES, 1);
      break;
    case 'Sauce':
      add(ÉPICERIE, 2);
      add(MATIÈRES, 1);
      if (chance(0.5)) add(LÉGUMES, 1);
      break;
    case 'Pain':
      add(FÉCULENTS, 2);
      add(ÉPICERIE, 1);
      if (chance(0.5)) add(MATIÈRES, 1);
      break;
    case 'Dessert':
      add(FRUITS, 1);
      add(SUCRÉ, 1);
      add(LAITIERS, 1);
      add(FÉCULENTS, 1);
      break;
    case 'Apéritif':
      add(ÉPICERIE, 2);
      add(LÉGUMES, 1);
      break;
    case 'Boisson':
      add(BOISSONS, 1);
      add(FRUITS, 1);
      break;
    default:
      add(LÉGUMES, 1);
      add(VIANDES, 1);
      add(FÉCULENTS, 1);
      add(MATIÈRES, 1);
  }
  return chosen;
}

function textOf(ing) {
  const food = byId.get(ing.foodId);
  if (!food) return '';
  if (food.unit === 'pièce') {
    const [, many] = food.piece ?? [food.name, food.name];
    return `${ing.qty} ${lower(many)}`;
  }
  return `${ing.qty} ${food.unit} ${/^[aeiouyhéèêàâîôû]/i.test(lower(food.name)) ? 'd’' : 'de '}${lower(food.name)}`;
}

function stepsFor(dish, ingredients) {
  const names = ingredients.slice(0, 3).map((i) => lower(byId.get(i.foodId)?.name ?? ''));
  const base = [
    `Préparer ${names[0] ?? 'les ingrédients'} : éplucher, laver, couper.`,
    `Faire revenir ${names[1] ?? 'le tout'} dans un peu de matière grasse, 5 min à feu vif.`,
    `Ajouter ${names.slice(1).join(' et ') || 'le reste'} , saler, poivrer, puis laisser cuire 20 min à couvert.`,
    'Goûter, ajuster l’assaisonnement, et servir tiède.',
  ];
  if (dish === 'Dessert') base[3] = 'Laisser tiédir avant de servir, avec une cuillère de yaourt.';
  if (dish === 'Boisson') base.splice(1, 2, 'Mixer les ingrédients avec un verre d’eau et quelques glaçons.', 'Servir aussitôt.');
  return base;
}

const recipes = [];
const usedNames = new Set();
for (let i = 0; i < RECIPES; i += 1) {
  const dish = DISHES[i % DISHES.length];
  const list = LISTS[dish];
  let name = '';
  for (let attempt = 0; attempt < 40 && !name; attempt += 1) {
    const main = pick(dish === 'Dessert' || dish === 'Boisson' ? FRUITS : [...LÉGUMES, ...FÉCULENTS, ...VIANDES]);
    const candidate = typo(`${pick(list)} ${lower(main.name)} ${pick(QUALIFIERS)}`);
    const clean = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    if (!usedNames.has(clean)) name = clean;
  }
  if (!name) name = `${pick(list)} ${i + 1}`;
  usedNames.add(name);

  const ingredients = ingredientsFor(dish);
  const portions = chance(0.55) ? 2 : chance(0.6) ? 1 : int(3, 4);
  const createdAt = new Date(toUTC(addDays(START, int(0, 365 * YEARS))) + int(0, 86_400_000)).toISOString();
  const status = STATUSES[chance(0.45) ? 0 : chance(0.6) ? 1 : 2];
  recipes.push({
    id: `charge-${String(i + 1).padStart(3, '0')}`,
    name,
    status,
    dish,
    favorite: chance(0.12),
    rating: chance(0.4) ? int(3, 5) : null,
    source: chance(0.5) ? 'Carnet de la maison' : 'https://exemple.local/recette',
    prepTime: chance(0.6) ? `${int(1, 4) * 5 + 5} min` : `1 h ${int(0, 5) * 10}`,
    servings: `${portions} repas`,
    ingredientsText: ingredients.map(textOf),
    steps: stepsFor(dish, ingredients),
    note: chance(0.3) ? 'Recette de semaine, à doubler pour les restes.' : undefined,
    summary: chance(0.5) ? `Une recette ${dish === 'Plat' ? 'complète' : 'simple'} pour ${portions} repas.` : undefined,
    createdAt,
    portions,
    ingredients,
    fridgeDays: int(2, 4),
    equipment: chance(0.5) ? ['plaque'] : ['plaque', 'air fryer'],
  });
}

/* ------------------------------------------------------------------ */
/* Achats                                                              */
/* ------------------------------------------------------------------ */

const purchases = [];
let purchaseNo = 0;
const nextId = () => `p-${String((purchaseNo += 1)).padStart(4, '0')}`;

function purchaseOf(food, date) {
  const qty = food.unit === 'pièce' ? int(2, 8) : round(between(250, 1200), 50);
  return {
    id: nextId(),
    foodId: food.id,
    qty,
    receivedAt: date,
    origin: chance(0.85) ? 'commande' : 'placard',
  };
}

// Le cœur du garde-manger : un rachat régulier, donc du stock réel aujourd’hui.
// On garde de la place pour les achats dispersés qui suivent.
const CORE_STEP = 16;
for (const food of coreFoods) {
  let date = addDays(START, int(0, CORE_STEP - 1));
  while (date < today && purchases.length < PURCHASES - 400) {
    purchases.push(purchaseOf(food, date));
    date = addDays(date, CORE_STEP + int(-2, 2));
  }
}

// Le reste : des achats plus espacés, sur tout le catalogue.
while (purchases.length < PURCHASES) {
  const food = pick(foods);
  const date = addDays(START, int(0, 365 * YEARS - 1));
  if (date >= today) continue;
  purchases.push(purchaseOf(food, date));
}
purchases.sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : a.id < b.id ? -1 : 1));
for (const [i, p] of purchases.entries()) p.id = `p-${String(i + 1).padStart(4, '0')}`;

/* ------------------------------------------------------------------ */
/* Plan : trois ans de repas, cuissons et restes                       */
/* ------------------------------------------------------------------ */

const entries = [];
let entryNo = 0;
const nextEntry = (prefix) => `${prefix}-${String((entryNo += 1)).padStart(4, '0')}`;

let date = START;
while (date <= END) {
  if (chance(0.08)) {
    entries.push({ id: nextEntry('o'), date, kind: 'out', ...(chance(0.5) ? { note: 'Repas pris dehors' } : {}) });
    date = addDays(date, 1);
    continue;
  }
  const recipe = pick(recipes);
  const portions = chance(0.55) ? 1 : chance(0.6) ? 2 : 3;
  const past = date < today;
  const recent = date >= addDays(today, -10) && past;
  const skipped = recent && chance(0.25);
  const cook = {
    id: nextEntry('c'),
    date,
    kind: 'cook',
    recipeId: recipe.id,
    portions,
    done: past && !skipped,
    ...(chance(0.1) ? { eaten: pick([0.75, 1, 1.25]) } : {}),
    ...(skipped ? { skipped: true } : {}),
    ...(chance(0.15) ? { note: 'Portion un peu plus grande que d’habitude.' } : {}),
  };
  entries.push(cook);
  for (let i = 1; i < portions; i += 1) {
    const restDate = addDays(date, i);
    if (restDate > END) break;
    entries.push({
      id: nextEntry('r'),
      date: restDate,
      kind: 'leftover',
      batchId: cook.id,
      done: restDate < today,
    });
  }
  date = addDays(date, portions + (chance(0.18) ? 1 : 0));
}

/* ------------------------------------------------------------------ */
/* Journal : compléments, corrections, pesées                          */
/* ------------------------------------------------------------------ */

const snacks = [];
const snackPool = [...FRUITS, ...LAITIERS, ...ÉPICERIE];
let snackNo = 0;
for (let d = START; d <= today; d = addDays(d, 1)) {
  if (chance(0.14)) continue;
  const items = [];
  const n = chance(0.7) ? 1 : 2;
  for (let i = 0; i < n; i += 1) {
    const food = pick(snackPool);
    if (!items.some((x) => x.foodId === food.id)) items.push(ingredientFor(food));
  }
  snacks.push({
    id: `s-${String((snackNo += 1)).padStart(4, '0')}`,
    date: d,
    label: chance(0.5) ? 'Complément du soir' : 'Petite faim',
    items,
  });
}

const adjustments = [];
const adjustmentReasons = ['jeté', 'mangé hors plan', 'correction'];
for (let i = 0; i < 400; i += 1) {
  const food = pick(foods);
  adjustments.push({
    id: `a-${String(i + 1).padStart(4, '0')}`,
    date: addDays(START, int(0, 365 * YEARS)),
    foodId: food.id,
    qty: food.unit === 'pièce' ? int(1, 2) : round(between(20, 200), 10),
    reason: pick(adjustmentReasons),
  });
}
adjustments.sort((a, b) => (a.date < b.date ? -1 : 1));

const weights = [];
let kg = 78.4;
for (let d = START; d <= today; d = addDays(d, 1)) {
  if (new Date(toUTC(d)).getUTCDay() !== 0) continue;
  kg = Math.round((kg + between(-0.35, 0.25)) * 10) / 10;
  weights.push({ date: d, kg });
}

/* ------------------------------------------------------------------ */
/* Réglages et écriture                                                */
/* ------------------------------------------------------------------ */

const settings = {
  kcalTarget: 2000,
  proteinTarget: 100,
  fiberTarget: 30,
  plantTargetG: 400,
  satFatMaxG: 22,
  sugarsMaxG: 50,
  saltMaxG: 6,
  mealShare: 0.75,
  fruitsPerDay: 1,
  mealsPerDay: 1,
  mealsPerCook: 2,
  demo: false,
  autoUpdate: false,
  theme: 'system',
};

const data = {
  foods,
  stock: purchases,
  recipes,
  plan: { startDate: START, entries },
  journal: { snacks, adjustments, weights },
  settings,
  snackIdeas,
};

await fs.mkdir(target, { recursive: true });
const files = [];
for (const [name, value] of Object.entries(data)) {
  const body = JSON.stringify(value, null, 2) + '\n';
  const file = path.join(target, `${name}.json`);
  await fs.writeFile(file, body, 'utf8');
  files.push({ name: `${name}.json`, bytes: Buffer.byteLength(body), hash: createHash('sha256').update(body).digest('hex') });
}

const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
const digest = createHash('sha256')
  .update(files.map((f) => `${f.name}:${f.hash}`).join('\n'))
  .digest('hex');

const cooks = entries.filter((e) => e.kind === 'cook').length;
const leftovers = entries.filter((e) => e.kind === 'leftover').length;
const outs = entries.filter((e) => e.kind === 'out').length;

console.log('Jeu de charge Sitos');
console.log(`  dossier       ${target}`);
console.log(`  aujourd’hui   ${today}`);
console.log(`  catalogue     ${path.basename(cataloguePath)} · ${catalogueHash.slice(0, 12)}`);
console.log(`  aliments      ${fr(foods.length)}`);
console.log(`  recettes      ${fr(recipes.length)}`);
console.log(`  achats        ${fr(purchases.length)}`);
console.log(`  plan          ${fr(entries.length)} entrées · ${fr(cooks)} cuissons · ${fr(leftovers)} restes · ${fr(outs)} repas dehors`);
console.log(`  plan du       ${START} au ${END}`);
console.log(`  journal       ${fr(snacks.length)} compléments · ${fr(adjustments.length)} corrections · ${fr(weights.length)} pesées`);
console.log(`  fichiers      ${files.map((f) => `${f.name} ${Math.round(f.bytes / 1024)} Ko`).join(' · ')}`);
console.log(`  total         ${(totalBytes / 1024 / 1024).toFixed(2)} Mo`);
console.log(`  empreinte     ${digest}`);
