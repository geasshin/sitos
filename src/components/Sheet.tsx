import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './sheet.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Une seule façon d'ouvrir un panneau, quelle que soit la tâche.
 * En-tête collant, corps qui défile, pied d'actions. Le catalogue s'ouvre en panneau
 * latéral dans la même feuille : jamais deux fenêtres l'une sur l'autre.
 * Échap ferme, ⌘Entrée valide, le focus reste dedans et revient à son point de départ.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  footer,
  onSubmit,
  dismissible = true,
  children,
  side,
  sideLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
  onSubmit?: () => void;
  dismissible?: boolean;
  children: ReactNode;
  side?: ReactNode;
  sideLabel?: string;
}) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  // Le focus entre dans la feuille, puis revient d'où il venait.
  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const node = sheetRef.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus({ preventScroll: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      returnTo.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  // Clavier : Échap ferme, ⌘Entrée valide, Tab reste dans la feuille.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
        e.preventDefault();
        onSubmit();
        return;
      }
      if (e.key !== 'Tab') return;
      const node = sheetRef.current;
      if (!node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close, onSubmit]);

  if (!open) return null;

  return createPortal(
    <div className="sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={sheetRef}
        className={`sheet sheet-${size} ${side ? 'has-side' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="sheet-head">
          <div className="sheet-heading">
            <h2 id={titleId} className="sheet-title">
              {title}
            </h2>
            {subtitle && <p className="sheet-sub">{subtitle}</p>}
          </div>
          <button type="button" className="sheet-close" onClick={close} aria-label="Fermer" disabled={!dismissible}>
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="sheet-main">
          <div className="sheet-body">{children}</div>
          {side && (
            <aside className="sheet-side" aria-label={sideLabel ?? 'Catalogue'}>
              {side}
            </aside>
          )}
        </div>

        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Le pied standard : une action secondaire, une action principale. Jamais deux boutons noirs. */
export function SheetActions({
  onCancel,
  onConfirm,
  confirmLabel,
  cancelLabel = 'Annuler',
  busy,
  disabled,
  hint,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <>
      {hint && <span className="sheet-hint">{hint}</span>}
      <span className="sheet-foot-gap" />
      <button type="button" className="s-btn is-ghost" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button type="button" className="s-btn is-primary" onClick={onConfirm} disabled={disabled || busy}>
        {busy ? 'Un instant…' : confirmLabel}
      </button>
    </>
  );
}
