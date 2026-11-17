import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

export const kcal = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} kcal`;
export const grams = (n: number) => `${Math.round(n)} g`;

export function Meter({
  value,
  target,
  tone = 'herb',
  label,
}: {
  value: number;
  target: number;
  tone?: 'herb' | 'saffron' | 'tomato' | 'ink';
  label?: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <span
      className={`meter meter-${tone}`}
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(target)}
      aria-label={label}
    >
      <span className="meter-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`section ${className ?? ''}`}>
      <header className="section-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/**
 * L'en-tête commun à toutes les pages, sur une seule ligne : le titre, le contexte juste à côté
 * (date, mois, semaine, compte) avec sa commande éventuelle, puis les actions de la page à droite.
 */
export function PageHeader({ title, context, children, actions }: { title: string; context?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <h1 className="page-title">{title}</h1>
      {(context !== undefined || children) && (
        <div className="page-context">
          {context !== undefined && (
            <span className="page-context-label" aria-live="polite">
              {context}
            </span>
          )}
          {children}
        </div>
      )}
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/**
 * Le module de base de toutes les pages : une surface blanche, un titre en capitales (avec son
 * pictogramme éventuel), une méta courte dessous et, à droite, une seule action.
 */
export function Panel({
  title,
  icon,
  meta,
  aside,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className ?? ''}`} aria-label={title}>
      <header className="panel-head">
        <div className="panel-heading">
          <h2 className="panel-title">
            {icon}
            {title}
          </h2>
          {meta !== undefined && <p className="panel-meta">{meta}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Le lien discret d'un module vers une autre page : « Voir → ». */
export function PanelLink({ children, onClick, title }: { children: ReactNode; onClick: () => void; title?: string }) {
  return (
    <button type="button" className="panel-link" onClick={onClick} title={title}>
      {children} <ArrowRight size={13} aria-hidden />
    </button>
  );
}

/** Un module secondaire de la page Aujourd'hui : le même panneau, en plus dense. */
export function MiniPanel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Panel title={title} aside={aside} className="mini-panel">
      {children}
    </Panel>
  );
}
