import { useState } from 'react';
import { Gauge, Info } from 'lucide-react';
import { useApp } from '../context';
import { assessDay, type BalanceRow } from '../domain/balance';
import { dayNutrition } from '../domain/nutrition';
import { BalanceRows, SplitBar } from './Balance';
import { Complements } from './Complements';
import { Modal } from './Modal';
import { Meter } from './ui';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');

type Tone = 'good' | 'low' | 'over' | 'empty';

/** La note est une lecture du bilan, pas une deuxième liste de manques. */
function scoreOf(
  balance: ReturnType<typeof assessDay>,
  emptyDay: boolean,
): { percent: number; tone: Tone; title: string } {
  const goals = balance.rows.filter((r) => r.kind !== 'max');
  const energy = balance.rows.find((r) => r.key === 'kcal')!;
  const missing = goals.filter((r) => r.status === 'bas');
  const caps = balance.rows.filter((r) => r.kind === 'max' && r.status === 'haut');
  const percent = Math.round((goals.reduce((sum, r) => sum + Math.min(1, r.value / Math.max(1, r.target)), 0) / goals.length) * 100);

  let tone: Tone = 'good';
  let title = 'Très bien.';
  if (emptyDay) {
    tone = 'empty';
    title = 'Rien de prévu.';
  } else if (energy.status === 'haut') {
    tone = 'over';
    title = 'Trop d’énergie.';
  } else if (caps.length > 0) {
    tone = 'over';
    title = `Trop de ${caps[0].label.toLowerCase()}.`;
  } else if (missing.length > 0) {
    tone = 'low';
    title = percent < 60 ? 'À compléter.' : 'Encore un peu juste.';
  }
  return { percent, tone, title };
}

const statusText = (row: BalanceRow): string => {
  const gap = row.target - row.value;
  if (row.kind === 'max') {
    if (row.status === 'haut') return Math.round(Math.abs(gap)) === 0 ? 'à la limite' : `dépassé de ${fr(Math.abs(gap))} ${row.unit}`;
    return `reste ${fr(Math.max(0, gap))} ${row.unit}`;
  }
  return row.status === 'bas' ? `reste ${fr(Math.max(0, gap))} ${row.unit}` : 'objectif atteint';
};

const gapText = (row: BalanceRow): string => {
  const gap = fr(Math.max(0, row.target - row.value));
  if (row.key === 'kcal') return `${gap} kcal`;
  if (row.key === 'plant') return `${gap} g de légumes et fruits`;
  return `${gap} ${row.unit} de ${row.label.toLowerCase()}`;
};

const RING = 2 * Math.PI * 42;

/**
 * Un seul module nutritionnel : la note et le bilan partagent le même header,
 * les chiffres à gauche, les compléments à droite. Les « reste X » des lignes
 * disent ce qui manque ; la note ne les répète pas.
 */
export function NutritionPanel() {
  const app = useApp();
  const [infoOpen, setInfoOpen] = useState(false);
  const { data, foods, targets, today } = app;
  const day = dayNutrition(data, foods, today);
  if (day.out) return null;

  const balance = assessDay(day.total, day.plantG, targets);
  const energy = balance.rows.find((r) => r.key === 'kcal')!;
  const goals = balance.rows.filter((r) => r.kind !== 'max' && r.key !== 'kcal');
  const caps = balance.rows.filter((r) => r.kind === 'max');
  const emptyDay = !day.meal && day.snacks.nutrients.kcal === 0;
  const score = scoreOf(balance, emptyDay);
  const energyTone = energy.status === 'haut' ? 'tomato' : 'ink';
  const missing = balance.rows
    .filter((r) => r.kind !== 'max' && r.status === 'bas')
    .sort((a, b) => (b.target - b.value) / b.target - (a.target - a.value) / a.target);
  const scoreDetail = emptyDay
    ? 'Ajoute un repas pour voir ton score.'
    : missing.length > 0
      ? `Il manque ${gapText(missing[0])}${missing[1] ? ` et ${gapText(missing[1])}` : ''}.`
      : score.tone === 'over'
        ? 'Un repère est au-dessus de sa limite.'
        : 'Tous les repères sont couverts.';

  return (
    <>
      <section className="panel nutrition-module" aria-labelledby="nutrition-title">
      <header className="nutrition-head">
        <div className="nutrition-heading">
          <div className="nutrition-title-row">
            <h2 id="nutrition-title" className="panel-title">
              <Gauge size={14} className="module-title-icon" aria-hidden /> Bilan du jour
            </h2>
            <button
              type="button"
              className="icon-button is-sm"
              onClick={() => setInfoOpen(true)}
              aria-label="Comprendre ces repères"
              title="Comprendre ces repères"
            >
              <Info size={14} aria-hidden />
            </button>
          </div>
          <p className="panel-meta num">Objectif {fr(targets.kcal)} kcal</p>
        </div>
        <div className={`nutrition-score is-${score.tone}`}>
          <div className="score-ring" role="img" aria-label={`Score nutrition : ${score.percent} %`}>
            <svg viewBox="0 0 100 100" aria-hidden>
              <circle className="score-ring-track" cx="50" cy="50" r="42" />
              <circle
                className="score-ring-fill"
                cx="50"
                cy="50"
                r="42"
                strokeDasharray={`${(score.percent / 100) * RING} ${RING}`}
                transform="rotate(-90 50 50)"
              />
            </svg>
            <b className="score-ring-num num">{score.percent} %</b>
          </div>
          <div className="score-copy">
            <p className="nutrition-score-kicker">Score nutrition</p>
            <p className="nutrition-score-title">{score.title}</p>
            <p className="score-detail">{scoreDetail}</p>
          </div>
        </div>
      </header>

      <div className="nutrition-grid">
        <div className="nutrition-primary">
          <div className={`balance-energy is-${energy.status}`}>
            <div className="balance-energy-line">
              <p className="balance-energy-value">
                <b className="num">{fr(energy.value)}</b>
                <span> / {fr(energy.target)} kcal</span>
              </p>
              <span className="balance-energy-note">{statusText(energy)}</span>
            </div>
            <Meter value={energy.value} target={energy.target} tone={energyTone} label="Énergie" />
          </div>

          <div className="balance-columns">
            <div className="balance-group">
              <p className="balance-sub">À atteindre</p>
              <BalanceRows rows={goals} compact />
            </div>
            <div className="balance-group">
              <p className="balance-sub">À limiter</p>
              <BalanceRows rows={caps} compact />
            </div>
          </div>

          <SplitBar balance={balance} targets={targets} />
        </div>

        <div className="nutrition-secondary">
          <Complements date={today} />
        </div>
      </div>
      </section>

      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} title="Comprendre ces repères" size="md">
        {infoOpen && (
          <div className="nutrition-explain">
            <p>
              Le score mesure la couverture des repères du jour : énergie, protéines, fibres, légumes et fruits,
              puis les limites à ne pas dépasser. 100 % veut dire que tous les repères sont tenus.
            </p>
            <dl>
              <dt>Macronutriments</dt>
              <dd>
                Protéines, lipides et glucides apportent de l'énergie. Leurs pourcentages sont la part de
                l'énergie totale, pas des grammes.
              </dd>
              <dt>Fibres</dt>
              <dd>Des glucides non digérés, comptés en grammes. Elles ne mesurent pas les vitamines.</dd>
              <dt>Légumes et fruits</dt>
              <dd>
                Un repère de groupe alimentaire : au moins 400 g par jour selon l'OMS et le PNNS. Il apporte une
                partie des fibres, des vitamines, des minéraux et des antioxydants. L'application compte les grammes
                d'ingrédients, elle ne dose pas les vitamines.
              </dd>
              <dt>À limiter</dt>
              <dd>Graisses saturées, sucres hors lactose et sel ont une valeur maximale, pas un objectif à atteindre.</dd>
            </dl>
            <p className="hint">Sources : ANSES, apports nutritionnels conseillés ; OMS et PNNS, 400 g de fruits et légumes par jour.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
