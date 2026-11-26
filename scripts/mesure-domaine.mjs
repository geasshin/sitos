#!/usr/bin/env node
/**
 * Les mesures du domaine, hors navigateur : le recalcul du stock, la projection,
 * les priorités, la validation du plan, la recherche d’aliment et la liste de courses.
 *
 * Les modules TypeScript du dépôt sont chargés par Vite en mode SSR : on mesure
 * exactement le code de l’application, pas une copie.
 *
 * Usage :
 *   node scripts/mesure-domaine.mjs --dossier=<jeu de charge> [--demo=data] [--json]
 *
 * Chaque mesure est répétée : trois passages à blanc, puis sept passages chronométrés.
 * On affiche la médiane, le minimum et le maximum, en millisecondes.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEYWORDS = ['foods', 'stock', 'recipes', 'plan', 'journal', 'settings', 'snackIdeas'];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const json = args.includes('--json');
const chargeDir = flag('dossier', path.join(process.env.TMPDIR ?? '/tmp', 'sitos-charge'));
const demoDir = flag('demo', path.join(ROOT, 'data'));

async function readData(dir) {
  const out = {};
  for (const key of KEYWORDS) {
    const file = path.join(dir, `${key}.json`);
    out[key] = JSON.parse(await fs.readFile(file, 'utf8'));
  }
  // Comme loadData au démarrage : les aliments du catalogue livré rejoignent la
  // collection, pour comparer les deux jeux sur le même catalogue réel.
  const starter = JSON.parse(await fs.readFile(path.join(ROOT, 'starter', 'foods.json'), 'utf8'));
  const known = new Set(out.foods.map((f) => f.id));
  out.foods = [...out.foods, ...starter.filter((f) => !known.has(f.id))];
  return out;
}

/** Médiane, minimum, maximum d’une série de durées. */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { median, min: sorted[0], max: sorted[sorted.length - 1] };
}

function bench(fn, { warmup = 3, runs = 7 } = {}) {
  for (let i = 0; i < warmup; i += 1) fn();
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const t = performance.now();
    fn();
    samples.push(performance.now() - t);
  }
  return stats(samples);
}

const fmt = (n) => (n >= 10 ? n.toFixed(1) : n.toFixed(2));

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});

const context = await server.ssrLoadModule('/src/context.ts');
const stockMod = await server.ssrLoadModule('/src/domain/stock.ts');
const nutrition = await server.ssrLoadModule('/src/domain/nutrition.ts');
const foodSearch = await server.ssrLoadModule('/src/domain/foodSearch.ts');
const planMod = await server.ssrLoadModule('/src/domain/plan.ts');
const shopping = await server.ssrLoadModule('/src/domain/shopping.ts');
const recipesMod = await server.ssrLoadModule('/src/domain/recipes.ts');

const today = flag('today', '2026-11-26');
const result = {};

for (const [label, dir] of [
  ['démo', demoDir],
  ['charge', chargeDir],
]) {
  const data = await readData(dir);
  const foods = nutrition.indexFoods(data.foods);
  const stock = stockMod.computeStock(data, foods, today);
  const forecast = stockMod.forecast(data, stock, today);

  const portions = new Map(data.recipes.map((r) => [r.id, nutrition.recipePortion(foods, r)]));
  const makeableCount = data.recipes.filter((r) => recipesMod.makeable(r, stock)).length;
  const missingPerCard = data.recipes.map((r) => recipesMod.missingCount(r, stock));

  const measure = () => ({
    indexFoods: bench(() => nutrition.indexFoods(data.foods)),
    computeStock: bench(() => stockMod.computeStock(data, foods, today)),
    forecast: bench(() => stockMod.forecast(data, stock, today)),
    priorities: bench(() => stockMod.priorities(data, stock, forecast, today, 14)),
    validatePlan: bench(() => planMod.validatePlan(data.plan.entries, data.recipes, today, data.settings.mealsPerDay ?? 1)),
    portionsCarnet: bench(() => new Map(data.recipes.map((r) => [r.id, nutrition.recipePortion(foods, r)]))),
    deriveComplet: bench(() => context.derive(data, today)),
    dayNutrition: bench(() => nutrition.dayNutrition(data, foods, today)),
    shoppingList: bench(() => shopping.shoppingList(data, stock, forecast, foods)),
    filtreRecettesPrêtes: bench(() => data.recipes.filter((r) => recipesMod.makeable(r, stock))),
    cartesRecettesManquants: bench(() => data.recipes.map((r) => recipesMod.missingCount(r, stock))),
  });

  const search = {};
  for (const query of ['', 'to', 'tomate', 'creme', 'poulet', 'pois chiches', 'introuvable']) {
    const one = bench(() => foodSearch.searchFoods(data.foods, query, { stock }), { warmup: 5, runs: 11 });
    search[query || '(vide)'] = one;
  }

  result[label] = {
    dossier: path.relative(ROOT, dir) || dir,
    volumétrie: {
      aliments: data.foods.length,
      recettes: data.recipes.length,
      achats: data.stock.length,
      plan: data.plan.entries.length,
      cuissonsCochées: data.plan.entries.filter((e) => e.kind === 'cook' && e.done).length,
      compléments: data.journal.snacks.length,
      corrections: data.journal.adjustments.length,
      pesées: data.journal.weights.length,
      recettesPrêtes: makeableCount,
      cartesAvecManquants: missingPerCard.filter((n) => n !== undefined).length,
    },
    mesures: measure(),
    recherche: search,
  };
}

await server.close();

if (json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

for (const [label, r] of Object.entries(result)) {
  console.log(`\n=== Jeu ${label} : ${r.dossier}`);
  console.log(
    `    ${r.volumétrie.aliments} aliments · ${r.volumétrie.recettes} recettes (${r.volumétrie.recettesPrêtes} prêtes) · ` +
      `${r.volumétrie.achats} achats · ${r.volumétrie.plan} entrées de plan (${r.volumétrie.cuissonsCochées} cuissons cochées) · ` +
      `${r.volumétrie.compléments} compléments · ${r.volumétrie.corrections} corrections · ${r.volumétrie.pesées} pesées`,
  );
  console.log('    mesure                          médiane      min      max');
  for (const [name, s] of Object.entries(r.mesures)) {
    console.log(`    ${name.padEnd(30)} ${fmt(s.median).padStart(8)} ${fmt(s.min).padStart(8)} ${fmt(s.max).padStart(8)}`);
  }
  console.log('    recherche d’aliment              médiane      min      max');
  for (const [query, s] of Object.entries(r.recherche)) {
    console.log(`    « ${query} »`.padEnd(34) + `${fmt(s.median).padStart(8)} ${fmt(s.min).padStart(8)} ${fmt(s.max).padStart(8)}`);
  }
}
