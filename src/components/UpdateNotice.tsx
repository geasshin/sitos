import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { isNative } from '../storage';
import { checkForUpdate, dismissUpdate, installUpdate, useUpdates } from '../updates';

const FIRST_CHECK_MS = 2_000;
const EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Annonce discrète d'une nouvelle version, en bas à droite. Rien ne s'installe sans clic.
 * La recherche automatique se coupe dans Paramètres ; la recherche manuelle y reste toujours possible.
 * Un échec de recherche automatique reste silencieux : c'est l'état normal d'un Mac hors ligne.
 */
export function UpdateNotice({ auto, hidden, onOpenSettings }: { auto: boolean; hidden?: boolean; onOpenSettings: () => void }) {
  const u = useUpdates();

  useEffect(() => {
    if (!isNative || !auto) return;
    const first = window.setTimeout(() => void checkForUpdate(false), FIRST_CHECK_MS);
    const every = window.setInterval(() => void checkForUpdate(false), EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [auto]);

  if (hidden || !u.available || u.dismissed || (u.phase !== 'available' && u.phase !== 'installing')) return null;
  const installing = u.phase === 'installing';

  return (
    <aside className="update-card" role="status" aria-live="polite">
      <button type="button" className="icon-button update-close" onClick={dismissUpdate} aria-label="Plus tard" disabled={installing}>
        <X size={15} aria-hidden />
      </button>
      <p className="update-title">Sitos {u.available.version} est disponible</p>
      <p className="update-text">{installing ? 'Téléchargement et installation… Sitos va redémarrer.' : (u.error ?? 'Tes données restent où elles sont.')}</p>
      <div className="update-actions">
        <button type="button" className="primary-button is-sm" onClick={() => void installUpdate()} disabled={installing}>
          <Download size={14} aria-hidden /> {u.error ? 'Réessayer' : 'Installer'}
        </button>
        <button type="button" className="text-button is-sm" onClick={onOpenSettings} disabled={installing}>
          Détails
        </button>
      </div>
    </aside>
  );
}
