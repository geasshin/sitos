import { useCallback, useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { isNative } from '../storage';

interface Available {
  version: string;
  notes?: string | null;
}

type Phase = 'idle' | 'installing' | 'failed';

const FIRST_CHECK_MS = 2_000;
const EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Annonce discrète d'une nouvelle version, en bas à droite. Rien ne s'installe
 * sans clic. Un échec de vérification (hors ligne, dépôt indisponible) reste
 * silencieux : c'est l'état normal d'un Mac sans réseau.
 */
export function UpdateNotice() {
  const [available, setAvailable] = useState<Available | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');

  const check = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const update = await invoke<Available | null>('check_for_app_update');
      if (update) setAvailable(update);
    } catch {
      // silencieux, voir plus haut
    }
  }, []);

  useEffect(() => {
    if (!isNative) return;
    const first = window.setTimeout(check, FIRST_CHECK_MS);
    const every = window.setInterval(check, EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [check]);

  if (!available || dismissed) return null;

  const install = async () => {
    setPhase('installing');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('install_app_update', { version: available.version });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      setPhase('failed');
    }
  };

  return (
    <aside className="update-card" role="status" aria-live="polite">
      <button type="button" className="icon-button update-close" onClick={() => setDismissed(true)} aria-label="Plus tard">
        <X size={15} aria-hidden />
      </button>
      <p className="update-title">Sitos {available.version} est disponible</p>
      <p className="update-text">
        {phase === 'failed'
          ? 'L’installation a échoué. Vérifie la connexion puis réessaie.'
          : phase === 'installing'
            ? 'Téléchargement et installation… Sitos va redémarrer.'
            : 'Tes données restent où elles sont.'}
      </p>
      <div className="update-actions">
        <button type="button" className="primary-button is-sm" onClick={install} disabled={phase === 'installing'}>
          <Download size={14} aria-hidden /> {phase === 'failed' ? 'Réessayer' : 'Installer'}
        </button>
        <button type="button" className="text-button is-sm" onClick={() => setDismissed(true)} disabled={phase === 'installing'}>
          Plus tard
        </button>
      </div>
    </aside>
  );
}
