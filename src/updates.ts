import { useSyncExternalStore } from 'react';
import { isNative } from './storage';

/**
 * État des mises à jour, partagé par la carte d'annonce et la page Paramètres.
 * Les commandes natives (src-tauri/src/updater.rs) vérifient la signature du paquet
 * avant toute installation ; ici on ne fait que piloter et afficher.
 */
export type UpdatePhase = 'idle' | 'checking' | 'uptodate' | 'available' | 'installing' | 'error';

export interface UpdateState {
  phase: UpdatePhase;
  available?: { version: string; notes?: string | null };
  /** Date de la dernière vérification réussie. */
  checkedAt?: Date;
  /** Message clair en cas d'échec. */
  error?: string;
  /** La carte d'annonce a été fermée pour cette session. */
  dismissed: boolean;
  /** La dernière vérification a été demandée depuis les paramètres. */
  manual: boolean;
}

let state: UpdateState = { phase: 'idle', dismissed: false, manual: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const useUpdates = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

const MESSAGES: Record<string, string> = {
  UPDATER_CHECK_FAILED: 'Impossible de joindre le serveur des mises à jour. Vérifie la connexion.',
  UPDATER_MANIFEST_INVALID: 'Le fichier des mises à jour est illisible pour le moment. Réessaie plus tard.',
  UPDATER_TARGET_MISSING: 'Cette version n’est pas encore publiée pour ce Mac.',
  UPDATER_UPDATE_EXPIRED: 'La mise à jour n’est plus disponible. Relance la recherche.',
  UPDATER_UPDATE_CHANGED: 'Une version plus récente est sortie entre-temps. Relance la recherche.',
  UPDATER_INSTALL_FAILED: 'Le téléchargement ou l’installation a échoué. Réessaie.',
};
const explain = (e: unknown) => MESSAGES[String(e)] ?? 'Une erreur inattendue est survenue.';

async function invoke<T>(cmd: string, args?: Record<string, unknown>) {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/** Cherche une mise à jour. En automatique, un échec reste silencieux (Mac hors ligne). */
export async function checkForUpdate(manual: boolean) {
  if (!isNative || state.phase === 'checking' || state.phase === 'installing') return;
  set({ phase: 'checking', manual, error: undefined });
  try {
    const found = await invoke<UpdateState['available'] | null>('check_for_app_update');
    set(found ? { phase: 'available', available: found, checkedAt: new Date(), dismissed: false } : { phase: 'uptodate', available: undefined, checkedAt: new Date() });
  } catch (e) {
    set(manual ? { phase: 'error', error: explain(e) } : { phase: state.available ? 'available' : 'idle' });
  }
}

export async function installUpdate() {
  if (!state.available) return;
  set({ phase: 'installing', error: undefined });
  try {
    await invoke('install_app_update', { version: state.available.version });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    set({ phase: 'available', error: explain(e) });
  }
}

export const dismissUpdate = () => set({ dismissed: true });

export async function appVersion(): Promise<string | undefined> {
  if (!isNative) return undefined;
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}
