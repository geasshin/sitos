#!/usr/bin/env node
/**
 * Importe la table Ciqual 2020 de l’ANSES dans `starter/foods.json`.
 *
 * Source : ANSES, Table de composition nutritionnelle Ciqual 2020, licence CC BY 4.0.
 * Miroir utilisé : https://zenodo.org/records/4770600 (le site de l’ANSES répond 503 aux robots).
 *
 *   curl -sL -o /tmp/ciqual.zip "https://zenodo.org/api/records/4770600/files/XML_2020_07_07.zip/content"
 *   unzip -o /tmp/ciqual.zip -d /tmp/ciqual_xml
 *   node scripts/import-ciqual.mjs /tmp/ciqual_xml
 *
 * Le script est déterministe : à fichier source égal, il produit le même `starter/foods.json`.
 * Les aliments écrits à la main en tête du catalogue sont conservés tels quels ; un aliment Ciqual
 * dont le code figure déjà dans un `source` existant n’est pas dupliqué.
 *
 * Les fichiers XML de l’ANSES ne sont pas valides : des `&` et des `<` bruts traînent dans les noms
 * (« Panaché préemballé (<1° alc.) », « elle & Vire »). On les échappe avant de parser, sinon
 * ElementTree, DOMParser et tous les autres refusent le fichier.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGUE = join(ROOT, 'starter/foods.json');

/** Codes de la table de composition. Les noms sont ceux de la table 2020. */
const CODE = {
  kcal: '328', // Energie, règlement UE 1169/2011 (kcal/100 g)
  protein: '25003', // Protéines, N x 6.25
  proteinJones: '25000', // repli
  carbs: '31000', // Glucides
  sugars: '32000', // Sucres
  lactose: '32410', // Lactose
  fat: '40000', // Lipides
  satFat: '40302', // AG saturés
  fiber: '34100', // Fibres alimentaires
  salt: '10004', // Sel (chlorure de sodium)
};

/**
 * Les onze familles de la table (codes 01 à 11, sur deux chiffres), ramenées à nos dix catégories.
 * `storage` et `shelfLifeDays` n’existent pas chez l’ANSES : ce sont des valeurs de travail,
 * volontairement prudentes, qui ne servent qu’au rangement et à la projection du stock.
 */
const FAMILLES = {
  '01': { category: 'épicerie', storage: 'frigo', shelfLifeDays: 3, label: 'entrées et plats composés' },
  '02': { category: 'légumes', storage: 'fruitier', shelfLifeDays: 7, label: 'fruits, légumes, légumineuses et oléagineux' },
  '03': { category: 'féculents', storage: 'placard', shelfLifeDays: 365, label: 'produits céréaliers' },
  '04': { category: 'viandes & œufs', storage: 'frigo', shelfLifeDays: 3, label: 'viandes, œufs et poissons' },
  '05': { category: 'laitiers', storage: 'frigo', shelfLifeDays: 14, label: 'produits laitiers' },
  '06': { category: 'boissons', storage: 'placard', shelfLifeDays: 365, label: 'eaux et autres boissons', unit: 'ml' },
  '07': { category: 'sucré', storage: 'placard', shelfLifeDays: 180, label: 'produits sucrés' },
  '08': { category: 'sucré', storage: 'frigo', shelfLifeDays: 180, label: 'glaces et desserts glacés' },
  '09': { category: 'matières grasses', storage: 'placard', shelfLifeDays: 365, label: 'matières grasses' },
  '10': { category: 'épicerie', storage: 'placard', shelfLifeDays: 365, label: 'aides culinaires et ingrédients divers' },
  '11': { category: 'épicerie', storage: 'placard', shelfLifeDays: 365, label: 'aliments infantiles' },
};

/**
 * La famille 02 mélange légumes, fruits, légumineuses et oléagineux, et la famille 03
 * porte aussi les biscuits apéritifs : ces sous-familles écrasent la valeur par défaut.
 */
const SOUS_FAMILLES = {
  '0201': { category: 'légumes', storage: 'fruitier', shelfLifeDays: 7 },
  '0202': { category: 'féculents', storage: 'placard', shelfLifeDays: 30 },
  '0203': { category: 'légumineuses', storage: 'placard', shelfLifeDays: 365 },
  '0204': { category: 'fruits', storage: 'fruitier', shelfLifeDays: 7 },
  '0205': { category: 'épicerie', storage: 'placard', shelfLifeDays: 180 },
  '0303': { category: 'épicerie', storage: 'placard', shelfLifeDays: 180 },
};

/** Le fichier Ciqual n’est pas du XML valide : on répare les deux défauts connus. */
function reparer(texte) {
  return texte
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/<(?![A-Za-z_/?!])/g, '&lt;');
}

/** Lit un fichier XML réparé et rend ses éléments racine. */
function lireXml(chemin, balise) {
  const texte = reparer(readFileSync(chemin, 'latin1'));
  const out = [];
  const re = new RegExp(`<${balise}>([\\s\\S]*?)</${balise}>`, 'g');
  let m;
  while ((m = re.exec(texte))) out.push(m[1]);
  return out.map((bloc) => {
    const champs = {};
    const reChamp = /<([A-Za-z_][\w]*)>([\s\S]*?)<\/\1>/g;
    let c;
    while ((c = reChamp.exec(bloc))) {
      champs[c[1].toLowerCase()] = decoder(c[2]).trim();
    }
    return champs;
  });
}

const decoder = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

const nombre = (v) => {
  if (v === undefined || v === null) return undefined;
  const t = String(v).replace(',', '.').replace(/[^\d.\-]/g, '');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
};

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function main() {
  const dossier = process.argv[2] ?? '/tmp/ciqual_xml';
  if (!existsSync(join(dossier, 'alim_2020_07_07.xml'))) {
    console.error(`Table Ciqual absente de ${dossier}. Voir l’en-tête du script pour le téléchargement.`);
    process.exit(1);
  }

  const aliments = lireXml(join(dossier, 'alim_2020_07_07.xml'), 'ALIM');
  const groupes = lireXml(join(dossier, 'alim_grp_2020_07_07.xml'), 'ALIM_GRP');

  const libelleGroupe = new Map(groupes.map((g) => [g.alim_grp_code, g.alim_grp_nom_fr]));

  // Les valeurs sont dans un fichier séparé, une ligne par couple aliment × constituant.
  // 55 Mo : une seule passe par expression régulière, sans construire un objet par ligne.
  const texteCompo = reparer(readFileSync(join(dossier, 'compo_2020_07_07.xml'), 'latin1'));
  const valeurs = new Map();
  const reCompo =
    /<alim_code>\s*(\d+)\s*<\/alim_code>[\s\S]*?<const_code>\s*(\d+)\s*<\/const_code>[\s\S]*?<teneur>\s*([^<]*?)\s*<\/teneur>/g;
  let mCompo;
  while ((mCompo = reCompo.exec(texteCompo))) {
    const [, code, constCode, teneur] = mCompo;
    const valeur = nombre(teneur);
    if (valeur === undefined) continue;
    let ligne = valeurs.get(code);
    if (!ligne) valeurs.set(code, (ligne = {}));
    ligne[constCode] = valeur;
  }

  const existant = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
  const codesPris = new Set();
  const idsPris = new Set();
  for (const f of existant) {
    idsPris.add(f.id);
    const m = String(f.source ?? '').match(/Ciqual\s+\d{4}\s+(\d+)/);
    if (m) codesPris.add(m[1]);
  }

  const importes = [];
  const ecartes = { deja: 0, sansEnergie: 0, sansNom: 0 };

  for (const a of aliments) {
    const code = a.alim_code;
    const nom = (a.alim_nom_fr ?? '').replace(/\s+/g, ' ').trim();
    if (!nom) {
      ecartes.sansNom += 1;
      continue;
    }
    if (codesPris.has(code)) {
      ecartes.deja += 1;
      continue;
    }
    const v = valeurs.get(code) ?? {};
    // L’ANSES ne chiffre pas l’énergie de quelques centaines d’aliments, dont beaucoup de gâteaux
    // et de biscuits. Quand les macronutriments sont là, on la calcule avec la formule officielle
    // du règlement UE 1169/2011, annexe XIV : 4 kcal/g de glucides et de protéines, 9 de lipides,
    // 2 de fibres. Le calcul est signalé dans `source`, il ne se fait jamais passer pour une mesure.
    const kcalMesuree = v[CODE.kcal];
    const macros = [v[CODE.carbs], v[CODE.protein], v[CODE.fat], v[CODE.fiber] ?? 0];
    const kcalCalculee = macros.slice(0, 3).every((x) => x !== undefined)
      ? Math.round((4 * macros[0] + 4 * macros[1] + 9 * macros[2] + 2 * macros[3]) * 10) / 10
      : undefined;
    const kcal = kcalMesuree ?? kcalCalculee;
    if (kcal === undefined || kcal < 0) {
      ecartes.sansEnergie += 1;
      continue;
    }
    const energieCalculee = kcalMesuree === undefined;
    const famille = FAMILLES[a.alim_grp_code] ?? FAMILLES['10'];
    const groupe = { ...famille, ...(SOUS_FAMILLES[a.alim_ssgrp_code] ?? {}) };
    // Un total ne peut pas être plus petit que son composant : quand l’ANSES ne donne pas
    // les lipides mais donne les saturés (estragon frais), le total manquant se déduit.
    const per100 = {
      kcal,
      protein: v[CODE.protein] ?? v[CODE.proteinJones] ?? 0,
      carbs: v[CODE.carbs] ?? 0,
      sugars: v[CODE.sugars] ?? 0,
      lactose: v[CODE.lactose] ?? 0,
      fat: v[CODE.fat] ?? 0,
      satFat: v[CODE.satFat] ?? 0,
      fiber: v[CODE.fiber] ?? 0,
      salt: v[CODE.salt] ?? 0,
    };
    per100.fat = Math.max(per100.fat, per100.satFat);
    per100.carbs = Math.max(per100.carbs, per100.sugars);
    let id = `ciqual-${code}`;
    if (idsPris.has(id)) id = `${id}-${slug(nom).slice(0, 24)}`;
    idsPris.add(id);
    importes.push({
      id,
      name: nom,
      category: groupe.category,
      unit: groupe.unit ?? 'g',
      per100,
      source: `Ciqual 2020 ${code}${energieCalculee ? ' · énergie calculée' : ''}`,
      storage: groupe.storage,
      shelfLifeDays: groupe.shelfLifeDays,
    });
  }

  // Ordre stable : par code Ciqual croissant, donc identique à chaque exécution.
  importes.sort((x, y) => Number(x.source.split(' ').pop()) - Number(y.source.split(' ').pop()));

  const tous = [...existant, ...importes];
  const lignes = tous.map((f) => '  ' + JSON.stringify(f)).join(',\n');
  writeFileSync(CATALOGUE, `[\n${lignes}\n]\n`, 'utf8');

  const parCategorie = {};
  for (const f of importes) parCategorie[f.category] = (parCategorie[f.category] ?? 0) + 1;
  console.log(`catalogue : ${tous.length} aliments (${existant.length} écrits à la main, ${importes.length} importés)`);
  console.log(`écartés : ${ecartes.deja} déjà présents, ${ecartes.sansEnergie} sans valeur d’énergie, ${ecartes.sansNom} sans nom`);
  console.log('par catégorie :', parCategorie);
}

main();
