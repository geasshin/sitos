import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../context';
import { addDays, formatDayMonth, formatShort, range, startOfWeek } from '../domain/dates';
import { average, dayNutrition, mealOf, type DayNutrition } from '../domain/nutrition';
import { NutrientRows, Section } from '../components/ui';
import { capitalize } from './Today';

export function NutritionView() {
  const app = useApp();
  const { data, today } = app;
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const days = range(weekStart, addDays(weekStart, 6)).map((d) => dayNutrition(data, app.foods, d));
  const avg = average(days);
  const planned = days.filter((d) => d.date > today && d.meal).length;

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1 className="display-title">Nutrition</h1>
          <p className="page-subtitle">Estimations par jour : le repas et le soir. Les jours à venir suivent le plan.</p>
        </div>
        <div className="week-nav" role="group" aria-label="Semaine">
          <button type="button" className="icon-button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semaine précédente"><ChevronLeft size={18} aria-hidden /></button>
          <span className="week-label">
            {formatDayMonth(weekStart)} – {formatDayMonth(addDays(weekStart, 6))}
          </span>
          <button type="button" className="icon-button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semaine suivante"><ChevronRight size={18} aria-hidden /></button>
        </div>
      </header>

      <Section title="Énergie par jour" aside={<Legend />}>
        <WeekChart days={days} target={data.settings.kcalTarget} today={today} />
      </Section>

      <div className="two-col">
        <Section title={`Moyenne de la semaine`} aside={<span className="muted small">{avg.count} jour{avg.count > 1 ? 's' : ''} comptés{planned ? `, dont ${planned} prévus` : ''}</span>}>
          {avg.count === 0 ? <p className="muted">Aucun repas compté cette semaine.</p> : <NutrientRows n={avg.nutrients} plantG={avg.plantG} settings={data.settings} />}
        </Section>
        <Section title="Ce que ça dit">
          <Insights days={days} avg={avg} />
        </Section>
      </div>

      <Section title="Détail">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Jour</th>
                <th scope="col">Repas</th>
                <th scope="col" className="r">kcal</th>
                <th scope="col" className="r">Protéines</th>
                <th scope="col" className="r">Fibres</th>
                <th scope="col" className="r">Légumes & fruits</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const entry = data.plan.entries.find((e) => e.date === d.date);
                const meal = mealOf(data, entry);
                const snacks = data.journal.snacks.filter((s) => s.date === d.date);
                return (
                  <tr key={d.date} className={d.date > today ? 'is-planned' : ''}>
                    <th scope="row">{capitalize(formatShort(d.date))}</th>
                    <td>
                      {d.out ? <span className="muted">Dehors</span> : meal ? meal.name : <span className="muted">—</span>}
                      {snacks.length > 0 && <span className="muted small"> + {snacks.map((s) => s.label.toLowerCase()).join(', ')}</span>}
                    </td>
                    <td className="r num">{d.meal || snacks.length ? Math.round(d.total.kcal) : '—'}</td>
                    <td className="r num">{d.meal || snacks.length ? `${Math.round(d.total.protein)} g` : '—'}</td>
                    <td className="r num">{d.meal || snacks.length ? `${Math.round(d.total.fiber)} g` : '—'}</td>
                    <td className="r num">{d.meal || snacks.length ? `${Math.round(d.plantG)} g` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint">Valeurs moyennes type Ciqual ; épices, bouillon et sauces non comptés. Cibles : {data.settings.kcalTarget} kcal, {data.settings.proteinTarget} g de protéines, {data.settings.fiberTarget} g de fibres, {data.settings.plantTargetG} g de légumes et fruits.</p>
      </Section>
    </div>
  );
}

function Legend() {
  return (
    <span className="legend small">
      <span><i className="sw sw-meal" /> repas</span>
      <span><i className="sw sw-snack" /> soir</span>
      <span><i className="sw sw-planned" /> prévu</span>
    </span>
  );
}

function WeekChart({ days, target, today }: { days: DayNutrition[]; target: number; today: string }) {
  const max = Math.max(target * 1.25, ...days.map((d) => d.total.kcal));
  const H = 200;
  const y = (v: number) => H - (v / max) * H;
  return (
    <div className="chart" role="img" aria-label={`Énergie par jour, cible ${target} kcal`}>
      <svg viewBox={`0 0 700 ${H + 34}`} className="chart-svg">
        <line x1="0" x2="700" y1={y(target)} y2={y(target)} className="chart-target" />
        <text x="696" y={y(target) - 6} textAnchor="end" className="chart-label">cible {target}</text>
        {days.map((d, i) => {
          const x = i * 100 + 22;
          const w = 56;
          const meal = d.meal?.nutrients.kcal ?? 0;
          const snack = d.snacks.nutrients.kcal;
          const future = d.date > today;
          return (
            <g key={d.date} className={future ? 'is-planned' : ''}>
              {d.out || (!d.meal && d.snacks.nutrients.kcal === 0) ? (
                <text x={x + w / 2} y={H - 8} textAnchor="middle" className="chart-label">{d.out ? 'dehors' : 'hors plan'}</text>
              ) : (
                <>
                  <rect x={x} y={y(meal)} width={w} height={H - y(meal)} rx="5" className="bar-meal" />
                  {snack > 0 && <rect x={x} y={y(meal + snack)} width={w} height={H - y(snack)} rx="5" className="bar-snack" />}
                  {meal + snack > 0 && (
                    <text x={x + w / 2} y={y(meal + snack) - 6} textAnchor="middle" className="chart-value">{Math.round(meal + snack)}</text>
                  )}
                </>
              )}
              <text x={x + w / 2} y={H + 22} textAnchor="middle" className={`chart-day ${d.date === today ? 'is-today' : ''}`}>
                {formatShort(d.date).split(' ').slice(0, 2).join(' ')}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Insights({ days, avg }: { days: DayNutrition[]; avg: ReturnType<typeof average> }) {
  const { data } = useApp();
  const s = data.settings;
  if (avg.count === 0) return <p className="muted">Rien à analyser cette semaine.</p>;
  const counted = days.filter((d) => d.meal);
  const lowProtein = counted.filter((d) => d.total.protein < s.proteinTarget * 0.7).length;
  const lowPlant = counted.filter((d) => d.plantG < s.plantTargetG * 0.6).length;
  const mealAvg = counted.reduce((a, d) => a + (d.meal?.nutrients.kcal ?? 0), 0) / counted.length;
  const gap = s.kcalTarget - avg.nutrients.kcal;
  const lines: string[] = [];
  if (gap > 500) {
    lines.push(
      `Le repas fait en moyenne ${Math.round(mealAvg)} kcal. Pour approcher ${s.kcalTarget} kcal, il faudrait ${Math.round(gap)} kcal de plus le soir, ce qui est beaucoup. Si tes vraies portions sont plus grosses que prévu, corrige le nombre de repas par recette.`,
    );
  } else if (gap < -200) {
    lines.push(`Au-dessus de la cible d’environ ${Math.round(-gap)} kcal par jour : regarde les grignotages du soir en premier.`);
  } else {
    lines.push('L’énergie est proche de la cible, avec un léger déficit : c’est le rythme visé.');
  }
  if (lowProtein > 0) lines.push(`${lowProtein} jour${lowProtein > 1 ? 's' : ''} sous ${Math.round(s.proteinTarget * 0.7)} g de protéines. Le soir, un skyr ou deux œufs comblent une bonne partie de l’écart.`);
  if (lowPlant > 0) lines.push(`${lowPlant} jour${lowPlant > 1 ? 's' : ''} avec peu de légumes et fruits : un fruit de plus ou une salade en entrée suffit.`);
  if (avg.nutrients.fiber >= s.fiberTarget * 0.9) lines.push('Les fibres sont bien couvertes, merci les légumineuses.');
  return (
    <ul className="insights">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
