import type { Data } from './domain/types';
import { starterData } from './starter';

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
  return {
    data: { ...data, recipes: data.recipes.map((r) => ({ ...r, steps: r.steps ?? [], favorite: !!r.favorite })) },
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
