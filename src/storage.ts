import type { Data } from './domain/types';
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

export const isNative = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export interface Loaded {
  data: Data;
  /** Collections absentes du disque, complétées par les valeurs de départ : à écrire. */
  missing: Key[];
}

export async function loadData(today: string): Promise<Loaded> {
  let raw: Partial<Data>;
  if (isNative) {
    raw = await invoke<Partial<Data>>('load_data');
  } else {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  }
  const start = starterData(today);
  const missing = KEYS.filter((k) => raw[k] === undefined || raw[k] === null);
  const data = { ...start, ...raw } as Data;
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
}

export async function saveCollection<K extends Key>(key: K, value: Data[K]): Promise<void> {
  if (isNative) {
    await invoke('save_collection', { name: key, value });
    return;
  }
  const res = await fetch(`/api/data/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

/** Copie toutes les données dans un dossier de sauvegarde daté. Renvoie son nom. */
export async function createBackup(now = new Date()): Promise<string> {
  const p = (n: number) => String(n).padStart(2, '0');
  const label = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return invoke<string>('create_backup', { label });
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
