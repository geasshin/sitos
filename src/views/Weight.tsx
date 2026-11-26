import { useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useApp } from '../context';
import { diffDays, formatDayMonth, formatShort } from '../domain/dates';
import { weeklyRate, weightTrend, type TrendPoint } from '../domain/weight';
import { capitalize } from '../domain/text';
import './weight-v3.css';

const fmtKg = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtKg(Math.abs(n))}`;

/**
 * Le carnet de pesées : la tendance en grand, la saisie, la courbe et les lignes.
 * Une pesée isolée bouge de ±1 kg ; la tendance lissée est le seul chiffre à suivre.
 */
export function WeightSection() {
  const { data, today, store } = useApp();
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const points = weightTrend(data.journal.weights);
  const rate = weeklyRate(points);
  const last = points[points.length - 1];

  const save = () => {
    const n = Number(kg.replace(',', '.'));
    if (!n || n < 30 || n > 250) return;
    store.update('journal', (j) => ({ ...j, weights: [...j.weights.filter((w) => w.date !== date), { date, kg: n }] }));
    setKg('');
    setSaved(date);
  };

  return (
    <>
      <section className="wt-board" aria-label="Où tu en es">
        <div className="wt-trend">
          <span className="wt-trend-label">Tendance</span>
          <span className="wt-trend-value num">
            {last ? fmtKg(last.trend) : '–'}
            {last && <span className="wt-trend-unit">kg</span>}
          </span>
          <span className="wt-trend-date">{last ? `au ${formatShort(last.date)}` : 'Aucune pesée pour l’instant'}</span>
        </div>

        <dl className="wt-facts">
          <div>
            <dt>Par semaine</dt>
            <dd className={`num ${rate !== undefined && rate < -0.8 ? 'is-alert' : ''}`}>
              {rate === undefined ? 'à venir' : `${signed(rate)} kg`}
            </dd>
          </div>
          <div>
            <dt>Dernière pesée</dt>
            <dd className="num">{last ? `${fmtKg(last.kg)} kg` : 'à noter'}</dd>
          </div>
          <div>
            <dt>Pesées notées</dt>
            <dd className="num">{points.length}</dd>
          </div>
        </dl>
      </section>

      {rate !== undefined && rate < -0.8 && (
        <p className="wt-warn">Plus de 0,8 kg par semaine, c’est rapide : mange un peu plus.</p>
      )}

      <div className="wt-work">
        <section className="s-card wt-entry" aria-labelledby="wt-entry-titre">
          <div className="s-section-title">
            <h2 id="wt-entry-titre">Nouvelle pesée</h2>
            <span className="s-meta">Le matin, à jeun</span>
          </div>
          <form
            className="wt-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label className="wt-field">
              <span>Date</span>
              <input type="date" value={date} max={today} onChange={(e) => { setDate(e.target.value); setSaved(null); }} />
            </label>
            <label className="wt-field">
              <span>Poids</span>
              <span className="wt-qty">
                <input
                  inputMode="decimal"
                  placeholder={last ? fmtKg(last.kg) : '00,0'}
                  aria-label="Poids en kilogrammes"
                  value={kg}
                  onChange={(e) => {
                    setKg(e.target.value);
                    setSaved(null);
                  }}
                  required
                />
                <span className="wt-unit">kg</span>
              </span>
            </label>
            <button type="submit" className="s-btn is-primary wt-submit">
              Enregistrer
            </button>
          </form>
          <p className="wt-hint">Deux ou trois pesées par semaine suffisent. La virgule est acceptée.</p>
          {saved && (
            <p className="wt-saved" role="status">
              Pesée du {formatShort(saved)} enregistrée.
            </p>
          )}
        </section>

        <section className="s-card wt-figure" aria-labelledby="wt-courbe-titre">
          <div className="s-section-title">
            <h2 id="wt-courbe-titre">La courbe</h2>
            <span className="s-meta">{points.length >= 2 ? 'poids et tendance' : 'à partir de deux pesées'}</span>
          </div>
          {points.length >= 2 ? (
            <WeightChart points={points} />
          ) : (
            <p className="wt-empty">
              La courbe apparaît à la deuxième pesée. La tendance, elle, demande au moins sept jours entre deux
              relevés.
            </p>
          )}
        </section>
      </div>

      <section className="s-card wt-log" aria-labelledby="wt-log-titre">
        <div className="s-section-title">
          <h2 id="wt-log-titre">Les pesées</h2>
          <span className="s-meta">
            {points.length === 0 ? 'aucune pour l’instant' : `${points.length} ligne${points.length > 1 ? 's' : ''}, de la plus récente`}
          </span>
        </div>
        {points.length === 0 ? (
          <p className="wt-empty">Rien de noté. La première pesée s’écrit justement au-dessus.</p>
        ) : (
          <ul className="wt-rows">
            {[...points].reverse().map((p) => (
              <li key={p.date}>
                <span className="wt-date">{capitalize(formatShort(p.date))}</span>
                <span className="wt-values">
                  <b className="num">{fmtKg(p.kg)} kg</b>
                  <span className="wt-sub num">tendance {fmtKg(p.trend)}</span>
                </span>
                <button
                  type="button"
                  className="wt-del"
                  aria-label={`Supprimer la pesée du ${formatShort(p.date)}`}
                  title="Supprimer la pesée"
                  onClick={() => {
                    store.update('journal', (j) => ({ ...j, weights: j.weights.filter((w) => w.date !== p.date) }));
                    if (saved === p.date) setSaved(null);
                  }}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/** La page Poids, gardée pour les liens directs. La navigation passe par Bilan. */
export function WeightView() {
  const app = useApp();
  return (
    <div className="s-page wt-page">
      <header className="s-pagehead">
        <div>
          <h1 className="s-title">Poids</h1>
          <p className="s-subtitle">La tendance lisse les écarts d’un jour à l’autre.</p>
        </div>
        <div className="s-pagehead-actions">
          <button type="button" className="s-btn is-ghost" onClick={() => app.goTo('nutrition')}>
            <ArrowLeft size={16} aria-hidden /> Bilan
          </button>
        </div>
      </header>
      <WeightSection />
    </div>
  );
}

function WeightChart({ points }: { points: TrendPoint[] }) {
  const W = 1100;
  const H = 210;
  const pad = 34;
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
    <div className="wt-chart">
      <div className="wt-chart-frame" role="img" aria-label="Courbe de poids et tendance">
        <svg viewBox={`0 0 ${W} ${H + 22}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} className="wt-grid" />
              <text x={pad - 7} y={y(t) + 4} textAnchor="end" className="wt-label">
                {t}
              </text>
            </g>
          ))}
          <path d={trendPath} className="wt-line" />
          {points.map((p) => (
            <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r="3.5" className="wt-dot" />
          ))}
          <text x={pad} y={H + 18} className="wt-label">
            {formatDayMonth(first)}
          </text>
          <text x={W - pad} y={H + 18} textAnchor="end" className="wt-label">
            {formatDayMonth(points[points.length - 1].date)}
          </text>
        </svg>
      </div>
      <p className="wt-legend">
        <i className="wt-legend-dot" aria-hidden /> pesée
        <i className="wt-legend-line" aria-hidden /> tendance
      </p>
    </div>
  );
}
