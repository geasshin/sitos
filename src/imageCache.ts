import { isNative } from './storage';

/**
 * Les photos des recettes viennent du web, souvent de sites qui ne partagent rien
 * entre origines. L'application les télécharge donc une fois, côté natif
 * (commande `cover_cache`), et les sert ensuite depuis le disque : plus de requête
 * réseau à chaque ouverture, et les photos restent visibles hors connexion.
 *
 * Dans le navigateur (développement), il n'y a pas de dossier local : l'adresse
 * d'origine est utilisée telle quelle.
 */

const memory = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

async function cache(url: string): Promise<string | null> {
  const { invoke, convertFileSrc } = await import('@tauri-apps/api/core');
  const path = await invoke<string | null>('cover_cache', { url });
  return path ? convertFileSrc(path) : null;
}

/** Adresse locale de l'image si elle est déjà en cache (ou vient de l'être). */
export function cachedCover(url: string): Promise<string | null> {
  if (!isNative) return Promise.resolve(null);
  if (memory.has(url)) return Promise.resolve(memory.get(url) ?? null);
  const running = pending.get(url);
  if (running) return running;
  const p = cache(url)
    .catch(() => null)
    .then((local) => {
      memory.set(url, local);
      pending.delete(url);
      return local;
    });
  pending.set(url, p);
  return p;
}

/** Force la vérification (utile après avoir vidé le cache). */
export function forgetCovers(): void {
  memory.clear();
  pending.clear();
}

export async function coverCacheSize(): Promise<{ count: number; bytes: number }> {
  if (!isNative) return { count: 0, bytes: 0 };
  const { invoke } = await import('@tauri-apps/api/core');
  const [count, bytes] = await invoke<[number, number]>('cover_cache_info');
  return { count, bytes };
}

export async function clearCoverCache(): Promise<void> {
  forgetCovers();
  if (!isNative) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('clear_cover_cache');
}
