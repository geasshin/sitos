import { Plus } from 'lucide-react';
import { useApp } from '../context';
import { assessDay, recommendSides, sideCandidates, type BalanceRow, type DayBalance } from '../domain/balance';
import { mergeComplements } from '../domain/complements';
import { dayNutrition, mealOf } from '../domain/nutrition';
import { newId } from '../domain/plan';
import { availableOn } from '../domain/stock';
import type { Targets } from '../domain/targets';
import type { ISODate } from '../domain/types';
import { Meter } from './ui';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
const dec = (v: number) => (Math.round(v * 10) / 10).toLocaleString('fr-FR');
const show = (r: BalanceRow, v: number) => (r.key === 'salt' ? dec(v) : fr(v));

/**
 * Un seul code de couleur : rouge quand un plafond est dépassé, neutre partout ailleurs.
 * Les mots (« reste », « dépassé de ») portent l'information ; la couleur ne fait que confirmer.
 */
function rowTone(r: BalanceRow): 'ink' | 'tomato' {
  return r.status === 'haut' && (r.kind === 'max' || r.kind === 'band') ? 'tomato' : 'ink';
}

/** La barre reste neutre ; seul un plafond dépassé la passe au rouge. */
function barTone(r: BalanceRow): 'ink' | 'tomato' {
  return r.status === 'haut' && (r.kind === 'max' || r.kind === 'band') ? 'tomato' : 'ink';
}

function statusText(r: BalanceRow): string {
  const gap = r.target - r.value;
  if (r.kind === 'max') {
    if (r.status === 'haut') return `dépassé de ${show(r, Math.abs(gap))} ${r.unit}`;
    return `reste ${show(r, Math.max(0, gap))} ${r.unit}`;
  }
  if (r.kind === 'band') {
    if (r.status === 'haut') return `dépassé de ${show(r, Math.abs(gap))} ${r.unit}`;
    if (r.status === 'bas') return `reste ${show(r, Math.max(0, gap))} ${r.unit}`;
    return 'dans la cible';
  }
  return r.status === 'bas' ? `reste ${show(r, Math.max(0, gap))} ${r.unit}` : 'objectif atteint';
}

function Row({ row }: { row: BalanceRow }) {
  const tone = rowTone(row);
  const near = row.kind === 'max' && row.status !== 'haut' && row.target > 0 && row.target - row.value <= row.target * 0.1;
  return (
    <div className={`nutrient tone-${tone} is-${row.status} ${near ? 'is-near' : ''}`}>
      <dt>
        <span>{row.label}</span>
        <span className="nutrient-status">{statusText(row)}</span>
      </dt>
      <dd>
        <b className="num">{show(row, row.value)}</b>
        <span className="nutrient-target">
          {' '}
          / {show(row, row.target)} {row.unit}
          {row.kind === 'max' ? ' max.' : row.kind === 'min' ? ' min.' : ''}
        </span>
      </dd>
      <Meter value={row.value} target={row.target} tone={barTone(row)} label={row.label} />
    </div>
  );
}

export function BalanceRows({ rows, compact }: { rows: BalanceRow[]; compact?: boolean }) {
  return (
    <dl className={`nutrients ${compact ? 'nutrients-compact' : ''}`}>
      {rows.map((row) => (
        <Row key={row.key} row={row} />
      ))}
    </dl>
  );
}

export function SplitBar({ balance, targets }: { balance: DayBalance; targets: Targets }) {
  if (!balance.split || !balance.splitStatus) return null;
  const parts = [
    { key: 'protein' as const, label: 'Protéines', range: targets.proteinPct },
    { key: 'fat' as const, label: 'Lipides', range: targets.fatPct },
    { key: 'carbs' as const, label: 'Glucides', range: targets.carbsPct },
  ];
  return (
    <div className="split">
      <div className="split-bar" role="img" aria-label="Répartition de l’énergie">
        {parts.map((p) => (
          <span key={p.key} className={`split-seg seg-${p.key}`} style={{ width: `${balance.split![p.key]}%` }} />
        ))}
      </div>
      <ul className="split-legend">
        <li className="split-label">Répartition</li>
        {parts.map((p) => (
          <li key={p.key} className={`is-${balance.splitStatus![p.key]}`}>
            <i className={`sw seg-${p.key}`} aria-hidden />
            {p.label} <b className="num">{Math.round(balance.split![p.key])} %</b>
            <span className="muted"> ({p.range[0]}–{p.range[1]})</span>
            {balance.splitStatus![p.key] !== 'ok' && <span className="split-out">hors cible</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Le bilan d'une journée hors Aujourd'hui : repas + compléments face aux objectifs,
 * la répartition, et ce qu'on peut encore ajouter avec le stock de ce jour-là.
 */
export function DayBalanceCard({ date, compact }: { date: ISODate; compact?: boolean }) {
  const app = useApp();
  const { data, foods, targets, store, today } = app;
  const day = dayNutrition(data, foods, date);
  if (day.out) return <p className="muted">Repas dehors : pas de bilan ce jour-là.</p>;
  const meal = mealOf(data, data.plan.entries.find((e) => e.date === date));
  if (!day.meal && day.snacks.nutrients.kcal === 0) {
    return <p className="muted">{meal ? 'Ajoute les ingrédients du plat pour voir son bilan.' : 'Rien de prévu ce jour-là.'}</p>;
  }

  const balance = assessDay(day.total, day.plantG, targets);
  const goals = balance.rows.filter((r) => r.kind !== 'max');
  const caps = balance.rows.filter((r) => r.kind === 'max');
  const candidates = sideCandidates(mergeComplements(data.snackIdeas), foods, availableOn(data, app.stock, today, date));
  const reco = recommendSides({ nutrients: day.total, plantG: day.plantG }, targets, candidates, foods);
  const mealKcal = day.meal?.nutrients.kcal ?? 0;
  const mealGoal = targets.kcal * targets.mealShare;
  const smallMeal = day.meal && mealKcal < mealGoal * 0.75;
  const future = date > today;

  return (
    <div className="day-balance">
      {day.meal && (
        <p className={`meal-vs ${smallMeal ? 'is-low' : ''}`}>
          {targets.mealsPerDay > 1 ? 'Repas du jour' : 'Repas'} <span className="num">{fr(mealKcal)}</span> kcal
          <span className="muted">
            {' '}
            · {targets.mealsPerDay > 1 ? 'par repas visé' : 'repas principal visé'} ≈ {fr(Math.round(mealGoal / 25) * 25)}
          </span>
        </p>
      )}
      <div className="balance-columns is-single">
        <div className="balance-group">
          <p className="balance-sub">À atteindre</p>
          <BalanceRows rows={goals} compact={compact} />
        </div>
        <div className="balance-group">
          <p className="balance-sub">À limiter</p>
          <BalanceRows rows={caps} compact={compact} />
        </div>
      </div>
      {!compact && <SplitBar balance={balance} targets={targets} />}

      <div className="complete">
        <p className="balance-sub">{date < today ? 'Il aurait fallu' : 'Pour compléter'}</p>
        {reco.picks.length === 0 ? (
          <p className="hint">La journée est complète, rien à ajouter.</p>
        ) : (
          <ul className="picks">
            {reco.picks.map((p) => (
              <li key={p.candidate.id} className="pick-row">
                <span className="pick-label">{p.candidate.label}</span>
                <span className="pick-brings small muted">{p.brings.join(' · ')}</span>
                {date >= today && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${future ? 'Prévoir' : 'Ajouter'} « ${p.candidate.label} »`}
                    title={future ? 'Prévoir pour ce jour-là (sort du stock ce jour-là)' : 'Ajouter à cette journée'}
                    onClick={() =>
                      store.update('journal', (j) => ({ ...j, snacks: [...j.snacks, { id: newId('s'), date, label: p.candidate.label, items: p.candidate.items }] }))
                    }
                  >
                    <Plus size={15} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {reco.stillMissing.length > 0 && (
          <p className="hint">
            Même ainsi, il manquera {reco.stillMissing.join(', ')}.
            {smallMeal && targets.mealsPerDay === 1 && ' Le plat est petit pour un repas principal : une portion plus grosse (plus de féculents) règle l’essentiel.'}
          </p>
        )}
      </div>
    </div>
  );
}
