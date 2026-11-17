import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useApp } from '../context';
import { diffDays, formatDayMonth, formatShort } from '../domain/dates';
import { weeklyRate, weightTrend, type TrendPoint } from '../domain/weight';
import { PageHeader, Panel } from '../components/ui';
import { capitalize } from './Today';

const fmtKg = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function WeightSection() {
  const { data, today, store } = useApp();
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState('');
  const points = weightTrend(data.journal.weights);
  const rate = weeklyRate(points);
  const last = points[points.length - 1];

  return (
    <div className="weight">
      <div className="weight-top">
        <div className="weight-block">
          <p className="balance-sub">Nouvelle pesée</p>
          <form
            className="weight-form"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(kg.replace(',', '.'));
              if (!n || n < 30 || n > 250) return;
              store.update('journal', (j) => ({ ...j, weights: [...j.weights.filter((w) => w.date !== date), { date, kg: n }] }));
              setKg('');
            }}
          >
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Poids</span>
              <span className="qty-input">
                <input inputMode="decimal" placeholder={last ? fmtKg(last.kg) : ''} value={kg} onChange={(e) => setKg(e.target.value)} required />
                <span className="unit">kg</span>
              </span>
            </label>
            <button type="submit" className="primary-button">
              Enregistrer
            </button>
          </form>
          <p className="hint">Le matin, à jeun, deux ou trois fois par semaine.</p>
        </div>
        <div className="weight-block">
          <p className="balance-sub">Où tu en es</p>
          {last ? (
            <dl className="stats">
              <div>
                <dt>Tendance</dt>
                <dd className="num big">{fmtKg(last.trend)} kg</dd>
              </div>
              <div>
                <dt>Par semaine</dt>
                <dd className="num big">{rate === undefined ? '—' : `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${fmtKg(Math.abs(rate))} kg`}</dd>
              </div>
              <div>
                <dt>Dernière pesée</dt>
                <dd className="num">
                  {fmtKg(last.kg)} kg, {formatShort(last.date)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="hint">Pas encore de pesée. La courbe apparaît à la deuxième.</p>
          )}
          {rate === undefined && points.length > 0 && <p className="hint">La vitesse s’affiche après une semaine de pesées.</p>}
          {rate !== undefined && rate < -0.8 && <p className="small warn">Plus de 0,8 kg par semaine : c’est rapide, mange un peu plus.</p>}
        </div>
      </div>

      {points.length >= 2 && (
        <div className="weight-block">
          <p className="balance-sub">Courbe</p>
          <WeightChart points={points} />
        </div>
      )}

      {points.length > 0 && (
        <div className="weight-block">
          <p className="balance-sub">Pesées</p>
          <ul className="logged">
            {[...points].reverse().map((p) => (
              <li key={p.date}>
                <span>{capitalize(formatShort(p.date))}</span>
                <span className="num">
                  {fmtKg(p.kg)} kg <span className="muted">· tendance {fmtKg(p.trend)}</span>
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Supprimer la pesée du ${formatShort(p.date)}`}
                  onClick={() => store.update('journal', (j) => ({ ...j, weights: j.weights.filter((w) => w.date !== p.date) }))}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** La page Poids, gardée pour les liens directs. La navigation passe par Nutrition. */
export function WeightView() {
  return (
    <div className="page">
      <PageHeader title="Poids" />
      <Panel title="Poids" meta="La tendance lisse les écarts d’un jour à l’autre.">
        <WeightSection />
      </Panel>
    </div>
  );
}

function WeightChart({ points }: { points: TrendPoint[] }) {
  const W = 1100;
  const H = 200;
  const pad = 30;
  const first = points[0].date;
  const span = Math.max(1, diffDays(first, points[points.length - 1].date));
  const values = points.flatMap((p) => [p.kg, p.trend]);
  const lo = Math.floor(Math.min(...values) - 0.5);
  const hi = Math.ceil(Math.max(...values) + 0.5);
  const x = (d: string) => pad + (diffDays(first, d) / span) * (W - pad * 2);
  const y = (v: number) => pad / 2 + (1 - (v - lo) / (hi - lo)) * (H - pad * 1.5);
  const trendPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' ');
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((_, i, a) => a.length < 8 || i % 2 === 0);
  return (
    <div className="chart" role="img" aria-label="Courbe de poids et tendance">
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="chart-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad - 6} y={y(t) + 4} textAnchor="end" className="chart-label">
              {t}
            </text>
          </g>
        ))}
        <path d={trendPath} className="trend-line" />
        {points.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r="3.5" className="weight-dot" />
        ))}
        <text x={pad} y={H + 16} className="chart-label">
          {formatDayMonth(first)}
        </text>
        <text x={W - pad} y={H + 16} textAnchor="end" className="chart-label">
          {formatDayMonth(points[points.length - 1].date)}
        </text>
      </svg>
    </div>
  );
}
