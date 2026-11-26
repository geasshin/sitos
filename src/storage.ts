import type { Data, Food, Ingredient, Recipe } from './domain/types';
import { starterData } from './starter';
import { completeNutrients } from './domain/nutrition';

/**
 * Où vivent les données.
 * - Dans l'application (Tauri) : un fichier JSON par collection dans le dossier de l'app,
 *   lus et écrits par les commandes natives `load_data` et `save_collection`.
 * - Dans le navigateur (`npm run dev`, pour développer) : le dossier data/ du dépôt,
 *   servi par le petit plugin Vite de server/dataPlugin.ts.
 * Une collection absente (premier lancement) part des valeurs de starter/.
 */
export type Key = keyof Data;
export const KEYS: Key[] = ['foods', 'stock', 'recipes', 'plan', 'journal', 'settings', 'snackIdeas'];

/**
 * Version du schéma des données. Elle vit dans `settings.json` (champ
 * `schemaVersion`) et dans l’en-tête de chaque export. À incrémenter dès qu’une
 * collection change de forme : une donnée plus récente est refusée, jamais
 * devinée ni écrasée.
 */
export const SCHEMA_VERSION = 1;

export const isNative = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export interface Loaded {
  data: Data;
  /** Collections absentes du disque, complétées par les valeurs de départ, ou à réécrire après migration : à écrire. */
  missing: Key[];
}

/* =====================================================================
   Journal local des erreurs
   ===================================================================== */

export type ErrorAction = 'écriture' | 'import' | 'sauvegarde' | 'restauration' | 'lecture';

export interface ErrorEntry {
  /** Date ISO de l’erreur. */
  at: string;
  action: ErrorAction;
  /** Phrase courte, sans chemin ni donnée personnelle. */
  message: string;
}

/** Le journal garde les 200 dernières erreurs, les plus récentes d’abord. */
export const ERROR_LOG_LIMIT = 200;
const ERROR_LOG_KEY = 'sitos.journal-erreurs.v1';
const ERROR_LOG_EVENT = 'sitos:journal-erreurs';

const ACTIONS: readonly ErrorAction[] = ['écriture', 'import', 'sauvegarde', 'restauration', 'lecture'];

const isAction = (value: unknown): value is ErrorAction =>
  typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);

/**
 * Un message court et sans donnée personnelle : les chemins de fichiers sont
 * remplacés, les espaces repris, la longueur bornée. Une erreur technique reste
 * lisible sans dire où vit le dossier de la personne.
 */
function shortMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const text = raw
    .replace(/https?:\/\/[^\s]+/g, '[lien]')
    .replace(/(?:file:\/\/)?(?:\/Users|\/home|\/Volumes|\/private|\/var|\/tmp)\/[^\s"'»]+/g, '[chemin]')
    .replace(/[A-Za-z]:\\[^\s"']+/g, '[chemin]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'Erreur sans message.';
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/** Le journal, du plus récent au plus ancien. Ne jette jamais. */
export function readErrorLog(): ErrorEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ERROR_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is ErrorEntry => {
        if (typeof entry !== 'object' || entry === null) return false;
        const e = entry as Record<string, unknown>;
        return typeof e.at === 'string' && isAction(e.action) && typeof e.message === 'string';
      })
      .slice(0, ERROR_LOG_LIMIT);
  } catch {
    return [];
  }
}

/** Vide le journal. Ne jette jamais. */
export function clearErrorLog(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ERROR_LOG_KEY);
  } catch {
    // un stockage plein ou refusé ne doit pas casser l’écran
  }
  window.dispatchEvent(new Event(ERROR_LOG_EVENT));
}

/**
 * S’abonne aux changements du journal : l’écran des paramètres se met à jour
 * quand une écriture échoue pendant qu’il est ouvert. Renvoie le désabonnement.
 */
export function onErrorLogChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(ERROR_LOG_EVENT, listener);
  return () => window.removeEventListener(ERROR_LOG_EVENT, listener);
}

function noteError(action: ErrorAction, error: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: ErrorEntry = { at: new Date().toISOString(), action, message: shortMessage(error) };
    const next = [entry, ...readErrorLog()].slice(0, ERROR_LOG_LIMIT);
    window.localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(ERROR_LOG_EVENT));
  } catch {
    // le journal ne doit jamais empêcher l’erreur d’origine de remonter
  }
}

/* =====================================================================
   Version du schéma et migrations
   ===================================================================== */

/** `settings.json` porte la version du jeu de données ; les fichiers d’avant l’ignorent. */
type VersionedSettings = Data['settings'] & { schemaVersion?: unknown };

/**
 * La version lue dans les fichiers locaux. Absente : c’est un jeu de données
 * d’avant la numérotation, donc la version 1. Plus récente que cette version de
 * Sitos : refus net, avant toute écriture.
 */
function readStoredVersion(raw: Partial<Data>): number {
  const settings = raw.settings as VersionedSettings | undefined;
  if (!settings || settings.schemaVersion === undefined) return 1;
  const version = settings.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    throw new Error(`La version du schéma est illisible : « ${String(version)} ». Rien n’a été modifié.`);
  if (version > SCHEMA_VERSION)
    throw new Error(
      `Ces données viennent d’une version plus récente de Sitos (schéma ${version}, cette version lit le schéma ${SCHEMA_VERSION}). Rien n’a été modifié : mets Sitos à jour pour les ouvrir.`,
    );
  return version;
}

type Migration = (data: Data) => Data;

/**
 * La table des migrations, une entrée par version quittée : l’entrée `1`
 * transforme un schéma 1 en schéma 2, l’entrée `2` un schéma 2 en schéma 3.
 * Elle est vide tant que `SCHEMA_VERSION` vaut 1 : `migrate` rend alors les
 * données telles quelles. Une version sans étape est une erreur, jamais un
 * passage silencieux. Chaque migration ajoutée vient avec son test.
 */
const MIGRATIONS: Record<number, Migration> = {};

/** Applique les migrations de `from` jusqu’à `to` (la version courante par défaut). */
export function migrate(data: Data, from: number, to: number = SCHEMA_VERSION): Data {
  if (!Number.isInteger(from) || from < 1)
    throw new Error(`Version de schéma de départ illisible : « ${String(from)} ».`);
  if (from > to) throw new Error(`Impossible de revenir du schéma ${from} au schéma ${to}.`);
  let current = data;
  for (let version = from; version < to; version += 1) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`Aucune migration n’est prévue du schéma ${version} au schéma ${version + 1}.`);
    current = step(current);
  }
  return current;
}

/** Écrit la version courante dans les réglages, sans toucher au reste. */
function stampVersion(data: Data): Data {
  return {
    ...data,
    settings: { ...data.settings, schemaVersion: SCHEMA_VERSION } as Data['settings'],
  };
}

export async function loadData(today: string): Promise<Loaded> {
  try {
    let raw: Partial<Data>;
    if (isNative) {
      raw = await invoke<Partial<Data>>('load_data');
    } else {
      // Pas de cache : après un import, la relecture doit rendre ce qui est sur le disque.
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = await res.json();
    }
    const from = readStoredVersion(raw);
    const start = starterData(today);
    const missing = KEYS.filter((k) => raw[k] === undefined || raw[k] === null);
    const merged = { ...start, ...raw } as Data;
    const migrated = migrate(merged, from, SCHEMA_VERSION);
    // Une migration qui change une collection la fait réécrire par le store.
    for (const key of KEYS) {
      if (JSON.stringify(migrated[key]) !== JSON.stringify(merged[key]) && !missing.includes(key)) missing.push(key);
    }
    // La version elle-même se pose au premier enregistrement des réglages.
    if (from < SCHEMA_VERSION && !missing.includes('settings')) missing.push('settings');
    const data = stampVersion(migrated);
    // Les aliments ajoutés au catalogue au fil des versions (oléagineux, yaourt, pain complet…)
    // rejoignent une installation existante sans toucher aux valeurs déjà présentes.
    const known = new Set(data.foods.map((f) => f.id));
    const addedFoods = start.foods.filter((f) => !known.has(f.id));
    if (addedFoods.length && !missing.includes('foods')) missing.push('foods');
    return {
      data: {
        ...data,
        foods: [...data.foods, ...addedFoods].map((f) => ({ ...f, per100: completeNutrients(f.per100) })),
        recipes: data.recipes.map((r) => ({ ...r, steps: r.steps ?? [], favorite: !!r.favorite })),
      },
      missing,
    };
  } catch (error) {
    noteError('lecture', error);
    throw error;
  }
}

export async function saveCollection<K extends Key>(key: K, value: Data[K]): Promise<void> {
  // La version accompagne toujours les réglages : un fichier écrit par cette
  // version dit ce qu’il lit, même si l’objet en mémoire vient d’ailleurs.
  const payload = (key === 'settings'
    ? { ...(value as Data['settings']), schemaVersion: SCHEMA_VERSION }
    : value) as Data[K];
  try {
    if (isNative) {
      await invoke('save_collection', { name: key, value: payload });
      return;
    }
    const res = await fetch(`/api/data/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (error) {
    noteError('écriture', error);
    throw error;
  }
}

export async function openDataFolder(): Promise<void> {
  if (isNative) await invoke('open_data_folder');
}

export interface BackupInfo {
  automatic: number;
  manual: string[];
}

export async function getBackupInfo(): Promise<BackupInfo | undefined> {
  return isNative ? invoke<BackupInfo>('get_backup_info') : undefined;
}

/** Le libellé daté d’une sauvegarde, accepté par le natif : chiffres et tirets. */
function stampLabel(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/** Copie toutes les données dans un dossier de sauvegarde daté. Renvoie son nom. */
export async function createBackup(now = new Date()): Promise<string> {
  try {
    return await invoke<string>('create_backup', { label: stampLabel(now) });
  } catch (error) {
    noteError('sauvegarde', error);
    throw error;
  }
}

/** Les noms français des collections, pour les sauvegardes et les comptes-rendus. */
export const COLLECTION_LABELS: Record<Key, string> = {
  foods: 'Aliments',
  stock: 'Achats',
  recipes: 'Recettes',
  plan: 'Plan',
  journal: 'Journal',
  settings: 'Réglages',
  snackIdeas: 'Idées de complément',
};

/** Une copie automatique d’une collection, telle qu’elle est sur le disque. */
export interface BackupEntry {
  /** Nom du fichier dans .sauvegardes. */
  name: string;
  collection: Key;
  /** Date du fichier, en millisecondes depuis 1970. */
  savedAt: number;
  bytes: number;
}

export interface RestoreResult {
  collection: Key;
  /** Nom de la copie de l’état d’avant, faite avant d’écrire. */
  backup: string | null;
  bytes: number;
}

/** Les copies automatiques, de la plus récente à la plus ancienne. */
export async function listBackups(): Promise<BackupEntry[]> {
  try {
    if (isNative) return await invoke<BackupEntry[]>('list_backups');
    const res = await fetch('/api/data/backups', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as BackupEntry[];
  } catch (error) {
    noteError('sauvegarde', error);
    throw error;
  }
}

/** Le contenu d’une copie, lu avant de demander confirmation. */
export async function readBackup(name: string): Promise<unknown> {
  try {
    if (isNative) return await invoke<unknown>('read_backup', { name });
    const res = await fetch(`/api/data/backups/file?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { value?: unknown };
    return body.value;
  } catch (error) {
    noteError('sauvegarde', error);
    throw error;
  }
}

/**
 * Remet une copie à la place de sa collection. Une sauvegarde de l’état courant
 * est écrite avant, côté natif comme dans le navigateur. L’appelant relit ensuite
 * les données pour afficher ce qui a été repris.
 */
export async function restoreBackup(name: string, now = new Date()): Promise<RestoreResult> {
  try {
    if (isNative)
      return await invoke<RestoreResult>('restore_backup', { name, label: stampLabel(now) });
    const res = await fetch('/api/data/backups/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as RestoreResult;
  } catch (error) {
    noteError('restauration', error);
    throw error;
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Ce que contient une copie, en phrases courtes : le contenu écrit de la
 * confirmation de restauration. Un fichier de sauvegarde porte la collection
 * elle-même (liste ou objet), pas une enveloppe. Ne jette jamais.
 */
export function describeBackup(collection: Key, value: unknown): string[] {
  if (Array.isArray(value)) {
    const n = value.length;
    switch (collection) {
      case 'foods':
        return [plural(n, 'aliment', 'aliments')];
      case 'stock':
        return [plural(n, 'achat', 'achats')];
      case 'recipes':
        return [plural(n, 'recette', 'recettes')];
      case 'snackIdeas':
        return [plural(n, 'idée de complément', 'idées de complément')];
      default:
        return [plural(n, 'entrée', 'entrées')];
    }
  }
  const object = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  if (!object) return ['La copie ne contient pas de données lisibles.'];
  switch (collection) {
    case 'plan': {
      const entries = Array.isArray(object.entries) ? object.entries.length : 0;
      const start = typeof object.startDate === 'string' ? ` à partir du ${object.startDate}` : '';
      return [`${plural(entries, 'repas planifié', 'repas planifiés')}${start}`];
    }
    case 'journal': {
      const count = (key: string) => (Array.isArray(object[key]) ? (object[key] as unknown[]).length : 0);
      return [
        `${plural(count('weights'), 'pesée', 'pesées')}, ${plural(count('snacks'), 'complément', 'compléments')} et ${plural(count('adjustments'), 'correction de stock', 'corrections de stock')}`,
      ];
    }
    case 'settings': {
      const kcal = typeof object.kcalTarget === 'number' ? object.kcalTarget : null;
      const protein = typeof object.proteinTarget === 'number' ? object.proteinTarget : null;
      if (kcal === null && protein === null) return ['Réglages sans objectif chiffré.'];
      return [
        `Objectifs : ${kcal === null ? 'énergie non réglée' : `${kcal} kcal par jour`}, ${protein === null ? 'protéines non réglées' : `${protein} g de protéines`}`,
      ];
    }
    default:
      return ['La copie ne contient pas de données lisibles.'];
  }
}

export async function getDataFolder(): Promise<string | undefined> {
  return isNative ? invoke<string>('get_data_folder') : undefined;
}

export type Link = 'releases' | 'repo' | 'ciqual';
const LINKS: Record<Link, string> = {
  releases: 'https://github.com/geasshin/sitos/releases',
  repo: 'https://github.com/geasshin/sitos',
  ciqual: 'https://ciqual.anses.fr/',
};

/** Ouvre un lien connu dans le navigateur du système (liste fermée côté natif). */
export async function openLink(target: Link): Promise<void> {
  if (isNative) await invoke('open_link', { target });
  else window.open(LINKS[target], '_blank', 'noopener');
}

/** Applique l'apparence choisie à la page et à la fenêtre native. */
export async function applyTheme(theme: 'system' | 'light' | 'dark') {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  if (!isNative) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setTheme(theme === 'system' ? null : theme);
  } catch {
    // la barre de titre garde l'apparence du système
  }
}

/* =====================================================================
   Export et import
   ===================================================================== */

/**
 * L’en-tête des fichiers exportés. La version du schéma est celle de
 * `SCHEMA_VERSION` plus haut : un fichier plus récent est refusé, jamais deviné.
 * Les exports de la version 1 se relisent tels quels.
 */
const APP_NAME = 'Sitos';
const FORMATS = { complet: 'sitos-export', recettes: 'sitos-recettes' } as const;

export type ExportKind = keyof typeof FORMATS;

export interface ExportHeader {
  application: string;
  format: string;
  schemaVersion: number;
  exportedAt: string;
}

export interface DataCounts {
  recipes: number;
  purchases: number;
  weights: number;
  foods: number;
}

export function countData(data: Data): DataCounts {
  return {
    recipes: data.recipes.length,
    purchases: data.stock.length,
    weights: data.journal.weights.length,
    foods: data.foods.length,
  };
}

/** Le nom du fichier, daté du jour local : sitos-export-2026-11-25.json. */
export function exportFileName(kind: ExportKind, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  return `sitos-${kind === 'recettes' ? 'recettes' : 'export'}-${day}.json`;
}

/** L'export complet : un en-tête lisible, puis toutes les collections. */
export function buildExport(data: Data, now = new Date()) {
  return {
    application: APP_NAME,
    format: FORMATS.complet,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    counts: countData(data),
    data,
  };
}

/**
 * L'export des recettes seules : chaque ingrédient garde son identifiant et sa
 * quantité, et porte aussi le nom de l'aliment et son unité pour rester lisible.
 * Rien d'autre ne sort : ni stock, ni plan, ni pesées.
 */
export function buildRecipesExport(data: Data, now = new Date()) {
  const foods = new Map(data.foods.map((f) => [f.id, f]));
  return {
    application: APP_NAME,
    format: FORMATS.recettes,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    counts: { recipes: data.recipes.length },
    recipes: data.recipes.map((r) => ({
      ...r,
      ingredients: r.ingredients?.map((i) => {
        const food = foods.get(i.foodId);
        return {
          foodId: i.foodId,
          food: food?.name ?? null,
          unit: food?.unit ?? null,
          qty: i.qty,
          ...(i.note ? { note: i.note } : {}),
        };
      }),
    })),
  };
}

/** Télécharge un objet en JSON indenté, sous le nom donné. */
export function downloadJson(name: string, payload: unknown): void {
  const text = JSON.stringify(payload, null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface ImportPreview {
  kind: ExportKind;
  header: ExportHeader;
  /** Ce que le fichier annonce contenir. */
  counts: DataCounts;
  /** Export complet : les collections à écrire. */
  data?: Data;
  /** Export des recettes seules : les fiches à reprendre. */
  recipes?: Recipe[];
  /** Ingrédients dont l'aliment manque au catalogue disponible. */
  unknownIngredients: number;
}

export type ImportRead = { ok: true; preview: ImportPreview } | { ok: false; reason: string };

type Checked<T> = { ok: true; value: T } | { ok: false; reason: string };
const no = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const yes = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readHeader(raw: Record<string, unknown>): Checked<ExportHeader> {
  const { application, format, schemaVersion, exportedAt } = raw;
  if (!isText(application)) return no('Ce fichier n’a pas d’en-tête Sitos : le nom de l’application manque.');
  if (application !== APP_NAME) return no(`Ce fichier vient de « ${application} », pas de Sitos.`);
  if (!isText(format)) return no('Ce fichier n’a pas d’en-tête Sitos : le format manque.');
  if (format !== FORMATS.complet && format !== FORMATS.recettes)
    return no(`Format inconnu : « ${format} ». Sitos ne lit que ses propres exports.`);
  if (schemaVersion === undefined) return no('Ce fichier n’indique pas sa version de schéma.');
  if (!isNum(schemaVersion) || !Number.isInteger(schemaVersion) || schemaVersion < 1)
    return no(`Version de schéma illisible : « ${String(schemaVersion)} ».`);
  if (schemaVersion > SCHEMA_VERSION)
    return no(
      `Ce fichier vient d’une version plus récente de Sitos (schéma ${schemaVersion}, cette version lit le schéma ${SCHEMA_VERSION}).`,
    );
  if (!isText(exportedAt)) return no('Ce fichier ne dit pas quand il a été exporté.');
  if (Number.isNaN(Date.parse(exportedAt))) return no(`La date d’export est illisible : « ${exportedAt} ».`);
  return yes({ application, format, schemaVersion, exportedAt });
}

function recipeProblem(v: unknown, i: number): string | null {
  if (!isObject(v)) return `La recette n° ${i + 1} n’est pas un objet.`;
  if (!isText(v.id)) return `La recette n° ${i + 1} n’a pas d’identifiant.`;
  if (!isText(v.name)) return `La recette n° ${i + 1} n’a pas de nom.`;
  if (v.steps !== undefined && !Array.isArray(v.steps)) return `Les étapes de « ${v.name} » ne sont pas une liste.`;
  if (v.ingredients !== undefined) {
    if (!Array.isArray(v.ingredients)) return `Les ingrédients de « ${v.name} » ne sont pas une liste.`;
    for (const ing of v.ingredients) {
      if (!isObject(ing) || !isText(ing.foodId) || !isNum(ing.qty))
        return `Un ingrédient de « ${v.name} » n’a pas d’aliment ou de quantité.`;
    }
  }
  return null;
}

function foodProblem(v: unknown, i: number): string | null {
  if (!isObject(v)) return `L’aliment n° ${i + 1} n’est pas un objet.`;
  if (!isText(v.id)) return `L’aliment n° ${i + 1} n’a pas d’identifiant.`;
  if (!isText(v.name)) return `L’aliment n° ${i + 1} n’a pas de nom.`;
  if (!isObject(v.per100)) return `Les valeurs de « ${v.name} » manquent.`;
  if (v.unit !== 'g' && v.unit !== 'ml' && v.unit !== 'pièce') return `L’unité de « ${v.name} » est inconnue.`;
  if (!isText(v.category)) return `La famille de « ${v.name} » manque.`;
  if (!isNum(v.shelfLifeDays)) return `La durée de conservation de « ${v.name} » manque.`;
  return null;
}

function purchaseProblem(v: unknown, i: number): string | null {
  if (!isObject(v)) return `L’achat n° ${i + 1} n’est pas un objet.`;
  if (!isText(v.id) || !isText(v.foodId)) return `L’achat n° ${i + 1} n’a pas d’identifiant ou d’aliment.`;
  if (!isNum(v.qty)) return `L’achat n° ${i + 1} n’a pas de quantité.`;
  if (!isText(v.receivedAt)) return `L’achat n° ${i + 1} n’a pas de date de réception.`;
  return null;
}

function readFullData(raw: unknown): Checked<Data> {
  if (!isObject(raw)) return no('Le fichier complet n’a pas de bloc « data ».');
  if (!Array.isArray(raw.foods)) return no('Les aliments manquent dans ce fichier, ou ne sont pas une liste.');
  for (const [i, f] of raw.foods.entries()) {
    const problem = foodProblem(f, i);
    if (problem) return no(problem);
  }
  if (!Array.isArray(raw.stock)) return no('Les achats manquent dans ce fichier, ou ne sont pas une liste.');
  for (const [i, p] of raw.stock.entries()) {
    const problem = purchaseProblem(p, i);
    if (problem) return no(problem);
  }
  if (!Array.isArray(raw.recipes)) return no('Les recettes manquent dans ce fichier, ou ne sont pas une liste.');
  for (const [i, r] of raw.recipes.entries()) {
    const problem = recipeProblem(r, i);
    if (problem) return no(problem);
  }
  if (!isObject(raw.plan)) return no('Le plan de la semaine manque dans ce fichier.');
  if (!isText(raw.plan.startDate)) return no('Le plan n’a pas de date de départ.');
  if (!Array.isArray(raw.plan.entries)) return no('Les repas du plan ne sont pas une liste.');
  for (const [i, e] of raw.plan.entries.entries()) {
    if (!isObject(e) || !isText(e.id) || !isText(e.date) || (e.kind !== 'cook' && e.kind !== 'leftover' && e.kind !== 'out'))
      return no(`Le repas planifié n° ${i + 1} est incomplet (identifiant, date ou type).`);
  }
  if (!isObject(raw.journal)) return no('Le journal manque dans ce fichier.');
  for (const name of ['snacks', 'adjustments', 'weights'] as const) {
    if (!Array.isArray(raw.journal[name])) return no(`Le journal n’a pas sa liste « ${name} ».`);
  }
  for (const [i, w] of (raw.journal.weights as unknown[]).entries()) {
    if (!isObject(w) || !isText(w.date) || !isNum(w.kg)) return no(`La pesée n° ${i + 1} n’a pas de date ou de poids.`);
  }
  for (const [i, s] of (raw.journal.snacks as unknown[]).entries()) {
    if (!isObject(s) || !isText(s.id) || !isText(s.date) || !isText(s.label) || !Array.isArray(s.items))
      return no(`Le complément n° ${i + 1} est incomplet.`);
  }
  for (const [i, a] of (raw.journal.adjustments as unknown[]).entries()) {
    if (!isObject(a) || !isText(a.id) || !isText(a.date) || !isText(a.foodId) || !isNum(a.qty) || !isText(a.reason))
      return no(`La correction de stock n° ${i + 1} est incomplète.`);
  }
  if (!isObject(raw.settings)) return no('Les réglages manquent dans ce fichier.');
  for (const key of ['kcalTarget', 'proteinTarget', 'fiberTarget', 'plantTargetG', 'fruitsPerDay'] as const) {
    if (!isNum(raw.settings[key])) return no(`Les réglages sont incomplets : « ${key} » manque.`);
  }
  const version = raw.settings.schemaVersion;
  if (version !== undefined) {
    if (!isNum(version) || !Number.isInteger(version) || version < 1)
      return no(`La version de schéma des réglages est illisible : « ${String(version)} ».`);
    if (version > SCHEMA_VERSION)
      return no(
        `Le bloc des réglages vient d’une version plus récente de Sitos (schéma ${version}, cette version lit le schéma ${SCHEMA_VERSION}).`,
      );
  }
  if (!Array.isArray(raw.snackIdeas)) return no('Les idées de complément manquent dans ce fichier, ou ne sont pas une liste.');
  for (const [i, s] of raw.snackIdeas.entries()) {
    if (!isObject(s) || !isText(s.id) || !isText(s.name) || !Array.isArray(s.items))
      return no(`L’idée de complément n° ${i + 1} est incomplète.`);
  }

  const data = raw as unknown as Data;
  return yes({
    ...data,
    foods: data.foods.map((f) => ({ ...f, per100: completeNutrients(f.per100) })),
    recipes: data.recipes.map((r) => ({ ...r, steps: r.steps ?? [], favorite: !!r.favorite })),
  });
}

/** Un ingrédient d'export ne garde que ce que le domaine connaît. */
function cleanIngredients(list: Ingredient[] | undefined): Ingredient[] | undefined {
  return list?.map((i) => ({ foodId: i.foodId, qty: i.qty, ...(i.note ? { note: i.note } : {}) }));
}

function readRecipes(raw: Record<string, unknown>): Checked<Recipe[]> {
  if (!Array.isArray(raw.recipes)) return no('Les recettes manquent dans ce fichier, ou ne sont pas une liste.');
  if (raw.recipes.length === 0) return no('Ce fichier ne contient aucune recette : il n’y a rien à reprendre.');
  for (const [i, r] of raw.recipes.entries()) {
    const problem = recipeProblem(r, i);
    if (problem) return no(problem);
  }
  const recipes = (raw.recipes as Recipe[]).map((r) => ({
    ...r,
    steps: r.steps ?? [],
    favorite: !!r.favorite,
    ingredients: cleanIngredients(r.ingredients),
  }));
  return yes(recipes);
}

function countUnknown(recipes: Recipe[], foods: Food[]): number {
  const known = new Set(foods.map((f) => f.id));
  let count = 0;
  for (const r of recipes) for (const i of r.ingredients ?? []) if (!known.has(i.foodId)) count++;
  return count;
}

/**
 * Lit un fichier avant toute écriture. Ne jette jamais : un refus est une phrase
 * qui dit pourquoi, affichée telle quelle.
 */
export function readImport(source: string, catalogue: Food[]): ImportRead {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (e) {
    console.error('Import : JSON illisible', e);
    return no('Le fichier n’est pas du JSON lisible.');
  }
  if (!isObject(raw)) return no('Le fichier ne contient pas un objet JSON à la racine.');
  const header = readHeader(raw);
  if (!header.ok) return header;

  if (header.value.format === FORMATS.recettes) {
    const recipes = readRecipes(raw);
    if (!recipes.ok) return recipes;
    const preview: ImportPreview = {
      kind: 'recettes',
      header: header.value,
      counts: { recipes: recipes.value.length, purchases: 0, weights: 0, foods: 0 },
      recipes: recipes.value,
      unknownIngredients: countUnknown(recipes.value, catalogue),
    };
    return { ok: true, preview };
  }

  const data = readFullData(raw.data);
  if (!data.ok) return data;
  let migrated: Data;
  try {
    migrated = stampVersion(migrate(data.value, header.value.schemaVersion, SCHEMA_VERSION));
  } catch (e) {
    return no(e instanceof Error ? e.message : String(e));
  }
  const preview: ImportPreview = {
    kind: 'complet',
    header: header.value,
    counts: countData(migrated),
    data: migrated,
    unknownIngredients: countUnknown(migrated.recipes, migrated.foods),
  };
  return { ok: true, preview };
}

export interface MergeReport {
  recipes: Recipe[];
  added: number;
  updated: number;
  kept: number;
}

/** Reprend des recettes sans perdre celles du carnet : même identifiant, même fiche. */
export function mergeRecipes(current: Recipe[], incoming: Recipe[]): MergeReport {
  const next = current.slice();
  const at = new Map(next.map((r, i) => [r.id, i]));
  const incomingIds = new Set(incoming.map((r) => r.id));
  let added = 0;
  let updated = 0;
  for (const recipe of incoming) {
    const index = at.get(recipe.id);
    if (index === undefined) {
      at.set(recipe.id, next.length);
      next.push(recipe);
      added += 1;
    } else {
      next[index] = recipe;
      updated += 1;
    }
  }
  return { recipes: next, added, updated, kept: current.filter((r) => !incomingIds.has(r.id)).length };
}

export interface ImportWritten {
  /** Données relues depuis le disque après écriture. */
  data: Data;
  counts: DataCounts;
  /** Nom du dossier de sauvegarde (application installée), sinon null. */
  backup: string | null;
}


/**
 * Écrit un import collection par collection. Une sauvegarde précède toujours
 * l'écriture. Si une écriture ou la relecture échoue, les collections déjà
 * remplacées reviennent à leur valeur d'avant : un échec n'efface rien.
 */
export async function importData(next: Data, current: Data, today: string): Promise<ImportWritten> {
  let backup: string | null = null;
  if (isNative) {
    try {
      backup = await createBackup();
    } catch {
      const message = 'La sauvegarde avant import a échoué : rien n’a été écrit.';
      noteError('import', message);
      throw new Error(message);
    }
  }

  const written: Key[] = [];
  // Seules les collections qui changent sont écrites : un import de recettes ne
  // réécrit ni le stock, ni le journal, ni les réglages.
  const keys = KEYS.filter((key) => next[key] !== current[key]);
  const restore = async (): Promise<boolean> => {
    let ok = true;
    for (const key of written) {
      try {
        await saveCollection(key, current[key]);
      } catch {
        ok = false;
      }
    }
    return ok;
  };

  try {
    for (const key of keys) {
      await saveCollection(key, next[key]);
      written.push(key);
    }
  } catch (e) {
    console.error('Import : écriture impossible', e);
    const restored = written.length ? await restore() : true;
    const message = restored
      ? 'L’écriture a échoué. Les données d’avant ont été remises.'
      : 'L’écriture a échoué et la remise en état a échoué aussi. La sauvegarde faite avant l’import est intacte.';
    noteError('import', message);
    throw new Error(message);
  }

  const loaded = await loadData(today);
  const expected = countData(next);
  const got = countData(loaded.data);
  if (
    got.recipes !== expected.recipes ||
    got.purchases !== expected.purchases ||
    got.weights !== expected.weights ||
    got.foods < expected.foods
  ) {
    const restored = await restore();
    const message = restored
      ? 'Le disque ne rend pas ce qui vient d’être écrit (recettes, achats ou pesées différents). L’import a été annulé et les données d’avant sont revenues.'
      : 'Le disque ne rend pas ce qui vient d’être écrit, et la remise en état a échoué. La sauvegarde faite avant l’import est intacte.';
    noteError('import', message);
    throw new Error(message);
  }

  return { data: loaded.data, counts: got, backup };
}
