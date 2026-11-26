#!/usr/bin/env node
/**
 * Les mesures dans un vrai navigateur : premier rendu, changement de page,
 * recherche de recette, ouverture du composeur, recherche d’aliment, et un
 * recalcul du stock déclenché par une vraie modification.
 *
 * L’app est servie depuis son build de production (dist/) par un petit serveur
 * qui répond à /api/data depuis un dossier de données choisi, en lecture seule :
 * les écritures sont acquittées et jetées. Rien n’est écrit dans data/ ni dans
 * le dossier de l’application installée.
 *
 * Chrome tourne sans interface, en 1440 × 900, piloté par le protocole DevTools.
 * Chaque série ouvre un onglet neuf ; on répète et on garde la médiane.
 *
 * Usage :
 *   npx vite build
 *   node scripts/mesure-navigateur.mjs --dossier=<jeu de charge> [--demo=data] [--runs=5] [--json]
 */

import { existsSync, promises as fs } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEYS = ['foods', 'stock', 'recipes', 'plan', 'journal', 'settings', 'snackIdeas'];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const json = args.includes('--json');
const runs = Number(flag('runs', '5'));
const today = flag('today', '2026-11-26');
const chargeDir = path.resolve(flag('dossier', path.join(os.tmpdir(), 'sitos-charge')));
const demoDir = path.resolve(flag('demo', path.join(ROOT, 'data')));
const distDir = path.resolve(flag('dist', path.join(ROOT, 'dist')));

const CHROME =
  process.env.CHROME_PATH ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].find((p) => existsSync(p)) ??
  'google-chrome';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Serveur : le build, et l’API de données en lecture seule            */
/* ------------------------------------------------------------------ */

function startServer(dataDir) {
  const dirOf = typeof dataDir === 'function' ? dataDir : () => dataDir;
  const cache = new Map();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/data') {
        if (req.method === 'GET') {
          const out = {};
          for (const key of KEYS) {
            const body = await fs.readFile(path.join(dirOf(), `${key}.json`), 'utf8');
            out[key] = JSON.parse(body);
          }
          const payload = JSON.stringify(out);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(payload);
          return;
        }
        res.writeHead(405);
        res.end();
        return;
      }
      if (url.pathname.startsWith('/api/data/')) {
        for await (const _chunk of req) void _chunk;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      let file = path.join(distDir, decodeURIComponent(url.pathname));
      if (!file.startsWith(distDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let stat = await fs.stat(file).catch(() => null);
      if (!stat || stat.isDirectory()) {
        file = path.join(distDir, 'index.html');
        stat = await fs.stat(file).catch(() => null);
      }
      if (!stat) {
        res.writeHead(404);
        res.end('build absent : lance npx vite build');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const body = cache.get(file) ?? (await fs.readFile(file));
      if (ext !== '.html') cache.set(file, body);
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(e instanceof Error ? e.message : String(e));
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

/* ------------------------------------------------------------------ */
/* Chrome et le protocole DevTools                                     */
/* ------------------------------------------------------------------ */

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

async function launchChrome(debugPort, profile) {
  const { spawn } = await import('node:child_process');
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--hide-scrollbars',
      '--window-size=1440,900',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${debugPort}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const deadline = performance.now() + 20_000;
  while (performance.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (res.ok) return child;
    } catch {
      // pas encore prêt
    }
    await sleep(100);
  }
  child.kill('SIGTERM');
  throw new Error('Chrome n’a pas ouvert son port de débogage.');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let next = 0;
    const pending = new Map();
    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = (next += 1);
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          ws.close();
        },
        onEvent(fn) {
          ws.addEventListener('message', (event) => {
            const msg = JSON.parse(event.data);
            if (!msg.id && msg.method) fn(msg);
          });
        },
      }),
    );
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id) return;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(`${msg.error.message} (${msg.error.code})`));
      else p.res(msg.result);
    });
    ws.addEventListener('error', () => reject(new Error('WebSocket DevTools en erreur')));
  });
}

async function newTarget(debugPort) {
  const res = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  if (!res.ok) throw new Error(`Création d’onglet refusée : HTTP ${res.status}`);
  return res.json();
}

async function closeTarget(debugPort, id) {
  await fetch(`http://127.0.0.1:${debugPort}/json/close/${id}`).catch(() => undefined);
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
    timeout: 120_000,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'exception';
    throw new Error(detail);
  }
  return result.result.value;
}

/* ------------------------------------------------------------------ */
/* Le script de mesure, installé avant le chargement de l’app          */
/* ------------------------------------------------------------------ */

const INJECTED = String.raw`
(() => {
  const raf2 = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (el) => !!el && el.getClientRects().length > 0;
  const waitVisible = async (selector, timeout = 20000) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      if (visible(document.querySelector(selector))) return;
      await sleep(5);
    }
    throw new Error('élément absent : ' + selector);
  };
  const clickSel = (selector) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error('élément absent : ' + selector);
    el.click();
    return el;
  };
  const clickText = (text, selector = 'button') => {
    const el = [...document.querySelectorAll(selector)].find((node) => node.textContent.trim().includes(text));
    if (!el) throw new Error('bouton absent : ' + text);
    el.click();
    return el;
  };
  const setInput = (selector, value) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error('champ absent : ' + selector);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return el;
  };
  const waitUntil = async (ready, timeout = 20000, origin = performance.now()) => {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      if (ready()) return performance.now() - origin;
      await sleep(1);
    }
    throw new Error('état attendu jamais atteint');
  };
  // Le rendu s’arrête dès que le DOM porte le nouvel état, donc après le commit React
  // et avant la trame suivante : c’est le travail de l’app. La peinture ajoute l’attente
  // de la trame, utile comme borne haute mais dépendante du rythme d’affichage.
  const measure = async (action, ready) => {
    const start = performance.now();
    action();
    const rendu = ready ? await waitUntil(ready, 20000, start) : performance.now() - start;
    await raf2();
    return { rendu, peinture: performance.now() - start };
  };

  let first = null;
  const markFirst = () => {
    if (first !== null) return true;
    const title = document.querySelector('.s-page .s-title');
    if (!title) return false;
    requestAnimationFrame(() => requestAnimationFrame(() => { first = performance.now(); }));
    return true;
  };
  const observer = new MutationObserver(() => { if (markFirst()) observer.disconnect(); });
  observer.observe(document, { childList: true, subtree: true });
  requestAnimationFrame(function tick() { if (!markFirst()) requestAnimationFrame(tick); });

  let lcp = null;
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      if (entries.length) lcp = entries[entries.length - 1].startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}

  window.__bench = {
    get first() { return first; },
    get lcp() { return lcp; },
    timing() {
      const api = performance.getEntriesByType('resource').find((e) => e.name.endsWith('/api/data'));
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByName('first-contentful-paint')[0];
      return {
        api: api ? { duration: api.duration, transferSize: api.transferSize, encodedBodySize: api.encodedBodySize, decodedBodySize: api.decodedBodySize } : null,
        domInteractive: nav ? nav.domInteractive : null,
        domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
        firstContentfulPaint: paint ? paint.startTime : null,
        ressources: performance.getEntriesByType('resource').map((e) => e.name.split('/').pop()),
      };
    },
    async sequence() {
      const fatal = document.querySelector('.fatal');
      if (fatal) throw new Error('écran fatal : ' + fatal.innerText.slice(0, 300));
      const out = {};
      out.api = window.__bench.timing();
      // Le plancher de trame : deux rAF sans aucune action, pour lire ce que le
      // rythme d’affichage de Chrome sans interface ajoute à chaque mesure.
      out.trameVide = await measure(() => {}, null);

      out.pageRecettes = await measure(() => clickSel('a[href="#/recipes"]'), () => !!document.querySelector('.rc-page'));
      await sleep(60);
      out.recettesRendues = document.querySelectorAll('.rc-book').length;

      const beforeSearch = document.querySelectorAll('.rc-book').length;
      out.rechercheRecette = await measure(
        () => setInput('.rc-search input', 'poulet'),
        () => document.querySelectorAll('.rc-book').length !== beforeSearch,
      );
      out.rechercheRecetteCartes = document.querySelectorAll('.rc-book').length;
      setInput('.rc-search input', '');
      await waitUntil(() => document.querySelectorAll('.rc-book').length === beforeSearch);
      out.rechercheEffaceeCartes = document.querySelectorAll('.rc-book').length;

      const beforeAll = document.querySelectorAll('.rc-book').length;
      out.toutesRecettes = await measure(
        () => clickText('Prêtes avec ton stock'),
        () => document.querySelectorAll('.rc-book').length > beforeAll,
      );
      await sleep(30);
      out.toutesRecettesCartes = document.querySelectorAll('.rc-book').length;

      out.pageFrigo = await measure(() => clickSel('a[href="#/stock"]'), () => !!document.querySelector('.stock-page'));
      out.pageBilan = await measure(() => clickSel('a[href="#/nutrition"]'), () => !!document.querySelector('.bil-page'));
      out.pageSemaine = await measure(() => clickSel('a[href="#/week"]'), () => !!document.querySelector('.day-row.is-today'));

      // Ouvre un jour qui porte un repas, puis la feuille du composeur.
      // Le jeu de démonstration peut avoir son plan sur la semaine précédente.
      const rowWithMeal = () => {
        const rows = [...document.querySelectorAll('.day-row')];
        const unchecked = rows.find((r) => r.querySelector('.day-tick[aria-pressed="false"]'));
        if (unchecked) return unchecked;
        return rows.find((r) => {
          const head = r.querySelector('.day-head-btn');
          return head && !head.textContent.includes('Rien de prévu') && !head.textContent.includes('Dehors');
        });
      };
      let row = rowWithMeal();
      for (let week = 0; week < 4 && !row; week += 1) {
        clickSel('button[aria-label="Semaine précédente"]');
        await raf2();
        row = rowWithMeal();
      }
      if (!row) throw new Error('aucun jour avec un repas');
      const rowDate = row.getAttribute('data-drop-date');
      // La semaine ouvre le jour du jour : on ne le referme pas par un clic inutile.
      if (!row.querySelector('.day-open')) {
        row.querySelector('.day-head-btn').click();
        await waitUntil(() => !!document.querySelector('.day-row[data-drop-date="' + rowDate + '"] .day-open'));
      }
      out.composeur = await measure(() => {
        const openRow = document.querySelector('.day-row[data-drop-date="' + rowDate + '"]');
        const button = [...(openRow?.querySelectorAll('button') ?? [])].find((b) => b.textContent.includes('Modifier le plat'));
        if (!button) throw new Error('bouton Modifier le plat absent');
        button.click();
      }, () => !!document.querySelector('.sheet .mc'));
      out.composeurTitre = document.querySelector('.sheet-title')?.textContent ?? null;

      out.palette = await measure(() => clickSel('.mc-add'), () => !!document.querySelector('.food-picker .fp-row'));
      out.paletteLignes = document.querySelectorAll('.fp-row').length;
      const beforeFood = out.paletteLignes;
      out.rechercheAliment = await measure(
        () => setInput('.fp-input', 'tomate'),
        () => document.querySelectorAll('.fp-row').length !== beforeFood,
      );
      out.rechercheAlimentLignes = document.querySelectorAll('.fp-row').length;
      setInput('.fp-input', '');
      await waitUntil(() => document.querySelectorAll('.fp-row').length === beforeFood);
      out.rechercheAlimentVideLignes = document.querySelectorAll('.fp-row').length;

      clickSel('.mc-picker .s-btn.is-ghost');
      await raf2();
      clickSel('.sheet-close');
      await raf2();

      // Un vrai changement de données : cocher le repas du jour recalcule tout le stock.
      const selector = '.day-row[data-drop-date="' + rowDate + '"] .day-tick';
      const tick = document.querySelector(selector);
      if (!tick) throw new Error('aucune coche de repas');
      out.recalculStock = await measure(
        () => tick.click(),
        () => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true',
      );
      out.recalculStockCoche = document.querySelector(selector)?.getAttribute('aria-pressed') ?? null;
      return out;
    },
  };
})();
`;

/* ------------------------------------------------------------------ */
/* Une série complète                                                  */
/* ------------------------------------------------------------------ */

async function oneRun(debugPort, appPort) {
  const target = await newTarget(debugPort);
  const client = await connect(target.webSocketDebuggerUrl);
  const problems = [];
  client.onEvent((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      problems.push(d?.exception?.description ?? d?.text ?? 'exception');
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') problems.push(msg.params.entry.text);
  });
  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Log.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: INJECTED });
    await client.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/?jour=${today}#/week` });

    const deadline = performance.now() + 30_000;
    let first = null;
    while (performance.now() < deadline) {
      first = await evaluate(client, 'window.__bench ? window.__bench.first : null');
      if (typeof first === 'number') break;
      await sleep(20);
    }
    if (typeof first !== 'number') {
      const state = await evaluate(
        client,
        `({ bench: typeof window.__bench, title: document.title, url: location.href, ready: document.readyState, text: (document.body.innerText || '').slice(0, 240), root: (document.getElementById('root')?.innerHTML || '').slice(0, 240) })`,
      ).catch((e) => ({ erreur: String(e) }));
      throw new Error(`premier rendu jamais atteint : ${JSON.stringify({ state, problems })}`);
    }

    const lcp = await evaluate(client, 'window.__bench.lcp');
    const sequence = await evaluate(client, 'window.__bench.sequence()');
    return { first, lcp, ...sequence, problems };
  } finally {
    client.close();
    await closeTarget(debugPort, target.id);
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const stats = (values) => ({ median: median(values), min: Math.min(...values), max: Math.max(...values) });

const fmt = (n) => (n >= 10 ? n.toFixed(1) : n.toFixed(2));

/* ------------------------------------------------------------------ */
/* Programme                                                           */
/* ------------------------------------------------------------------ */

const chromeCheck = await fs.stat(CHROME).catch(() => null);
if (!chromeCheck) {
  console.error(`Chrome introuvable : ${CHROME}. Donne son chemin avec CHROME_PATH.`);
  process.exit(1);
}
const distCheck = await fs.stat(path.join(distDir, 'index.html')).catch(() => null);
if (!distCheck) {
  console.error(`Build absent dans ${distDir}. Lance npx vite build avant de mesurer.`);
  process.exit(1);
}

const debugPort = await freePort();
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'sitos-chrome-'));
const chrome = await launchChrome(debugPort, profile);

let dataDir = demoDir;
const { server, port } = await startServer(() => dataDir);
const report = {};
try {
  for (const [label, dir] of [
    ['démo', demoDir],
    ['charge', chargeDir],
  ]) {
    dataDir = dir;
    {
      const series = [];
      for (let i = 0; i < runs; i += 1) {
        let last;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            series.push(await oneRun(debugPort, port));
            last = undefined;
            break;
          } catch (e) {
            last = e;
            await sleep(300);
          }
        }
        if (last) throw last;
        await sleep(120);
      }
      const pick = (get) => stats(series.map(get));
      const reportOf = {
      dossier: path.relative(ROOT, dir) || dir,
      series: series.length,
      premierRendu: pick((s) => s.first),
      lcp: pick((s) => (s.lcp ?? s.first)),
      trameVide: pick((s) => s.trameVide.peinture),
      api: pick((s) => s.api?.api?.duration ?? 0),
      apiTaille: series[0].api?.api ?? null,
      ressources: series[0].api?.ressources ?? [],
      pageRecettes: pick((s) => s.pageRecettes.peinture),
      pageRecettesRendu: pick((s) => s.pageRecettes.rendu),
      rechercheRecette: pick((s) => s.rechercheRecette.peinture),
      rechercheRecetteRendu: pick((s) => s.rechercheRecette.rendu),
      toutesRecettes: pick((s) => s.toutesRecettes.peinture),
      toutesRecettesRendu: pick((s) => s.toutesRecettes.rendu),
      pageFrigo: pick((s) => s.pageFrigo.peinture),
      pageFrigoRendu: pick((s) => s.pageFrigo.rendu),
      pageBilan: pick((s) => s.pageBilan.peinture),
      pageBilanRendu: pick((s) => s.pageBilan.rendu),
      pageSemaine: pick((s) => s.pageSemaine.peinture),
      pageSemaineRendu: pick((s) => s.pageSemaine.rendu),
      composeur: pick((s) => s.composeur.peinture),
      composeurRendu: pick((s) => s.composeur.rendu),
      palette: pick((s) => s.palette.peinture),
      paletteRendu: pick((s) => s.palette.rendu),
      rechercheAliment: pick((s) => s.rechercheAliment.peinture),
      rechercheAlimentRendu: pick((s) => s.rechercheAliment.rendu),
      recalculStock: pick((s) => s.recalculStock.peinture),
      recalculStockRendu: pick((s) => s.recalculStock.rendu),
      cartes: {
        recettes: series[0].recettesRendues,
        rechercheRecette: series[0].rechercheRecetteCartes,
        toutes: series[0].toutesRecettesCartes,
        palette: series[0].paletteLignes,
        rechercheAliment: series[0].rechercheAlimentLignes,
        paletteVide: series[0].rechercheAlimentVideLignes,
      },
      problemes: [...new Set(series.flatMap((s) => s.problems))],
      };
      report[label] = reportOf;
    }
  }
} finally {
  chrome.kill('SIGTERM');
  server.close();
  await fs.rm(profile, { recursive: true, force: true }).catch(() => undefined);
}

if (json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

for (const [label, r] of Object.entries(report)) {
  console.log(`\n=== Jeu ${label} : ${r.dossier} (${r.series} séries)`);
  console.log(`    API /api/data   ${fmt(r.api.median)} ms · ${((r.apiTaille?.encodedBodySize ?? 0) / 1024 / 1024).toFixed(2)} Mo transférés`);
  console.log(`    premier rendu   ${fmt(r.premierRendu.median)} ms (min ${fmt(r.premierRendu.min)}, max ${fmt(r.premierRendu.max)})`);
  console.log(`    LCP             ${fmt(r.lcp.median)} ms · plancher de trame à vide ${fmt(r.trameVide.median)} ms`);
  const lines = [
    ['page Recettes', r.pageRecettes, r.pageRecettesRendu],
    ['page Frigo', r.pageFrigo, r.pageFrigoRendu],
    ['page Bilan', r.pageBilan, r.pageBilanRendu],
    ['page Semaine', r.pageSemaine, r.pageSemaineRendu],
    ['recherche recette', r.rechercheRecette, r.rechercheRecetteRendu],
    ['afficher toutes les recettes', r.toutesRecettes, r.toutesRecettesRendu],
    ['ouverture du composeur', r.composeur, r.composeurRendu],
    ['ouverture du catalogue', r.palette, r.paletteRendu],
    ['recherche d’aliment', r.rechercheAliment, r.rechercheAlimentRendu],
    ['recalcul du stock (coche)', r.recalculStock, r.recalculStockRendu],
  ];
  for (const [name, s, rendu] of lines)
    console.log(
      `    ${name.padEnd(30)} ${fmt(s.median).padStart(7)} ms à la trame · ${fmt(rendu.median).padStart(6)} ms de rendu (min ${fmt(s.min)}, max ${fmt(s.max)})`,
    );
  console.log(`    cartes : ${r.cartes.recettes} recettes · ${r.cartes.rechercheRecette} après recherche · ${r.cartes.toutes} toutes · ${r.cartes.palette} aliments au catalogue · ${r.cartes.rechercheAliment} après recherche`);
  if (r.problemes.length) console.log(`    problèmes : ${r.problemes.join(' | ')}`);
}
