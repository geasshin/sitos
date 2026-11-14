import type { ReactNode } from 'react';

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
    <span className={`meter meter-${tone}`} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(target)} aria-label={label}>
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
