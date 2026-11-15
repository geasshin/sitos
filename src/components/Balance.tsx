import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useApp } from '../context';
import { assessDay, recommendSides, sideCandidates, type BalanceRow, type DayBalance } from '../domain/balance';
import { dayNutrition, mealOf } from '../domain/nutrition';
import { newId } from '../domain/plan';
import { availableOn } from '../domain/stock';
import type { Targets } from '../domain/targets';
import type { ISODate } from '../domain/types';
import { Meter } from './ui';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
const dec = (v: number) => (Math.round(v * 10) / 10).toLocaleString('fr-FR');

/**
 * Un seul code de couleur partout : ce qui manque est ambre, ce qui est atteint est neutre,
 * ce qui dépasse une limite est rouge, et une limite à moins de 10 % du plafond est ambre.
 */
function rowTone(r: BalanceRow): 'ink' | 'saffron' | 'tomato' {
  if (r.kind === 'max') {
    if (r.status === 'haut') return 'tomato';
    return r.target > 0 && r.value >= r.target * 0.9 ? 'saffron' : 'ink';
  }
  if (r.kind === 'band') return r.status === 'haut' ? 'saffron' : 'ink';
  return r.status === 'bas' ? 'saffron' : 'ink';
}

export function BalanceRows({ rows, compact }: { rows: BalanceRow[]; compact?: boolean }) {
  const goals = rows.filter((r) => r.kind !== 'max');
  const caps = rows.filter((r) => r.kind === 'max');
  const one = (r: BalanceRow) => (
    <div className={`nutrient is-${r.status}`} key={r.key}>
      <dt>{r.label}</dt>
      <dd>
        <span className="num">{r.key === 'salt' ? dec(r.value) : fr(r.value)}</span>
        <span className="muted">
          {' '}
          {r.kind === 'max' ? 'max.' : '/'} {r.key === 'salt' ? dec(r.target) : fr(r.target)} {r.unit}
          {r.kind !== 'max' && r.target > 0 && r.value > r.target * 1.15 && (
            <span className="over-tag" title="Part de l’objectif atteinte"> · {Math.round((r.value / r.target) * 100)} %</span>
          )}
        </span>
      </dd>
      <Meter value={r.value} target={r.target} tone={rowTone(r)} label={r.label} />
    </div>
  );
  return (
    <div className={`balance ${compact ? 'balance-compact' : ''}`}>
      <dl className="nutrients">{goals.map(one)}</dl>
      {caps.length > 0 && (
        <>
          <p className="balance-sub">À limiter</p>
          <dl className="nutrients nutrients-caps">{caps.map(one)}</dl>
        </>
      )}
    </div>
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
        {parts.map((p) => (
          <li key={p.key} className={`is-${balance.splitStatus![p.key]}`}>
            <i className={`sw seg-${p.key}`} aria-hidden />
            {p.label} <span className="num">{Math.round(balance.split![p.key])} %</span>
            <span className="muted"> ({p.range[0]}–{p.range[1]})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Le bilan d'une journée : repas + soir face aux objectifs, la répartition, et ce qu'on peut
 * ajouter avec ce qui restera en stock ce jour-là.
 */
export function DayBalanceCard({ date, compact, mode = 'full' }: { date: ISODate; compact?: boolean; mode?: 'full' | 'today' }) {
  const [detail, setDetail] = useState(false);
  const app = useApp();
  const { data, today, targets, store } = app;
  const day = dayNutrition(data, app.foods, date);
  if (day.out) return <p className="muted">Repas dehors : pas de bilan ce jour-là.</p>;
  const meal = mealOf(data, data.plan.entries.find((e) => e.date === date));
  if (!day.meal && day.snacks.nutrients.kcal === 0) {
    return <p className="muted">{meal ? 'Ajoute les ingrédients du plat pour voir son bilan.' : 'Rien de prévu ce jour-là.'}</p>;
  }

  const balance = assessDay(day.total, day.plantG, targets);
  const candidates = sideCandidates(data.snackIdeas, app.foods, availableOn(data, app.stock, today, date));
  const reco = recommendSides({ nutrients: day.total, plantG: day.plantG }, targets, candidates, app.foods);
  const mealKcal = day.meal?.nutrients.kcal ?? 0;
  const mealGoal = targets.kcal * targets.mealShare;
  const smallMeal = day.meal && mealKcal < mealGoal * 0.75;
  const future = date > today;

  const goals = balance.rows.filter((r) => r.kind !== 'max');
  const caps = balance.rows.filter((r) => r.kind === 'max');
  const missing = goals
    .filter((r) => r.status === 'bas')
    .sort((a, b) => (b.target - b.value) / b.target - (a.target - a.value) / a.target);
  const over = caps.filter((r) => r.status === 'haut');
  const label = (key: BalanceRow['key']) =>
    key === 'protein' ? 'des protéines' : key === 'fiber' ? 'des fibres' : key === 'plant' ? 'des légumes et des fruits' : 'de l’énergie';
  const sentence = (() => {
    const parts: string[] = [];
    if (missing.length === 1) parts.push(`il manque surtout ${label(missing[0].key)}`);
    else if (missing.length > 1) parts.push(`il manque surtout ${label(missing[0].key)} et ${label(missing[1].key)}`);
    if (over.length) parts.push(`au-dessus du plafond : ${over.map((r) => r.label.toLowerCase()).join(', ')}`);
    if (parts.length === 0) return 'La journée est bien couverte.';
    return `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)}${parts[1] ? ` ; ${parts[1]}` : ''}.`;
  })();

  if (mode === 'today') {
    return (
      <div className="day-balance">
        <BalanceRows rows={goals} compact />
        <p className="balance-sentence">{sentence}</p>
        <button type="button" className="link small" aria-expanded={detail} onClick={() => setDetail((v) => !v)}>
          {detail ? 'Moins de détail' : 'Le détail'} <ChevronDown size={13} className={`chev ${detail ? 'up' : ''}`} aria-hidden />
        </button>
        {detail && (
          <>
            <BalanceRows rows={caps} compact />
            <SplitBar balance={balance} targets={targets} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="day-balance">
      {day.meal && (
        <p className={`meal-vs ${smallMeal ? 'is-low' : ''}`}>
          {targets.mealsPerDay > 1 ? 'Repas du jour' : 'Repas'} <span className="num">{fr(mealKcal)}</span> kcal
          <span className="muted">
            {' '}· {targets.mealsPerDay > 1 ? 'par repas visé' : 'repas principal visé'} ≈ {fr(Math.round(mealGoal / 25) * 25)}
          </span>
        </p>
      )}
      <BalanceRows rows={balance.rows} compact={compact} />
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
                    aria-label={`${future ? 'Prévoir' : 'Noter'} « ${p.candidate.label} » pour le soir`}
                    title={future ? 'Prévoir pour ce soir-là (sort du stock ce jour-là)' : 'Noter pour ce soir'}
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
