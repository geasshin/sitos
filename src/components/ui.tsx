import type { ReactNode } from 'react';
import type { Nutrients, Settings } from '../domain/types';

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

export function NutrientRows({ n, plantG, settings, compact }: { n: Nutrients; plantG: number; settings: Settings; compact?: boolean }) {
  const rows: { label: string; value: number; target: number; fmt: (v: number) => string; unit: string }[] = [
    { label: 'Énergie', value: n.kcal, target: settings.kcalTarget, fmt: (v) => Math.round(v).toLocaleString('fr-FR'), unit: 'kcal' },
    { label: 'Protéines', value: n.protein, target: settings.proteinTarget, fmt: (v) => String(Math.round(v)), unit: 'g' },
    { label: 'Fibres', value: n.fiber, target: settings.fiberTarget, fmt: (v) => String(Math.round(v)), unit: 'g' },
    { label: 'Légumes & fruits', value: plantG, target: settings.plantTargetG, fmt: (v) => String(Math.round(v)), unit: 'g' },
  ];
  return (
    <dl className={`nutrients ${compact ? 'nutrients-compact' : ''}`}>
      {rows.map((r) => {
        const ratio = r.target ? r.value / r.target : 0;
        const tone = r.label === 'Énergie' ? (ratio > 1.08 ? 'saffron' : 'ink') : ratio >= 0.5 ? 'ink' : 'saffron';
        return (
          <div className="nutrient" key={r.label}>
            <dt>{r.label}</dt>
            <dd>
              <span className="num">{r.fmt(r.value)}</span>
              <span className="muted"> / {r.fmt(r.target)} {r.unit}</span>
            </dd>
            <Meter value={r.value} target={r.target} tone={tone} label={r.label} />
          </div>
        );
      })}
    </dl>
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
