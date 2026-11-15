import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import type { Recipe } from '../domain/types';

/**
 * Les étapes en grand, une par écran, sans la liste d'ingrédients :
 * on a les mains occupées, l'écran est posé à côté.
 */
export function CookMode({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const steps = recipe.steps ?? [];
  const [i, setI] = useState(0);
  const last = steps.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setI((v) => Math.min(last, v + 1));
      }
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
    };
  }, [last, onClose]);

  if (steps.length === 0) return null;

  return (
    <div className="cook-overlay" role="dialog" aria-modal="true" aria-label={`Mode cuisine, ${recipe.name}`}>
      <header className="cook-head">
        <p className="cook-name">{recipe.name}</p>
        <p className="cook-count num">
          Étape {i + 1} sur {steps.length}
        </p>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Quitter le mode cuisine">
          <X size={20} aria-hidden />
        </button>
      </header>

      <button type="button" className="cook-step" onClick={() => setI((v) => Math.min(last, v + 1))} aria-label="Étape suivante">
        <span className="cook-num num">{String(i + 1).padStart(2, '0')}</span>
        <span className="cook-text">{steps[i]}</span>
      </button>

      <footer className="cook-foot">
        <button type="button" className="secondary-button" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>
          <ArrowLeft size={16} aria-hidden /> Précédent
        </button>
        <span className="cook-dots" aria-hidden>
          {steps.map((_, k) => (
            <i key={k} className={k === i ? 'on' : k < i ? 'done' : ''} />
          ))}
        </span>
        {i === last ? (
          <button type="button" className="primary-button" onClick={onClose}>
            <Check size={16} aria-hidden /> Terminé
          </button>
        ) : (
          <button type="button" className="primary-button" onClick={() => setI((v) => Math.min(last, v + 1))}>
            Suivant <ArrowRight size={16} aria-hidden />
          </button>
        )}
      </footer>
      <p className="cook-hint">Flèches du clavier pour avancer et reculer, Échap pour sortir.</p>
    </div>
  );
}
