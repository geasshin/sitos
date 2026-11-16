import { useApp } from '../context';
import { assessDay, biggestContributor, type BalanceRow } from '../domain/balance';
import { dayNutrition } from '../domain/nutrition';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');

function missingText(row: BalanceRow): string {
  const missing = Math.max(0, row.target - row.value);
  if (row.key === 'kcal') return `${fr(missing)} kcal`;
  if (row.key === 'plant') return `${fr(missing)} g de légumes et fruits`;
  if (row.key === 'protein') return `${fr(missing)} g de protéines`;
  if (row.key === 'fiber') return `${fr(missing)} g de fibres`;
  return `${fr(missing)} ${row.unit} de ${row.label.toLowerCase()}`;
}

type Tone = 'good' | 'low' | 'over' | 'empty';

/**
 * La note du jour : la lecture qualitative de la journée.
 * Les compléments qui la complètent vivent juste en dessous, dans le même module.
 */
export function DayScore() {
  const app = useApp();
  const { data, foods, targets, today } = app;
  const day = dayNutrition(data, foods, today);
  if (day.out) return null;

  const balance = assessDay(day.total, day.plantG, targets);
  const goals = balance.rows.filter((r) => r.kind !== 'max');
  const energy = balance.rows.find((r) => r.key === 'kcal')!;
  const missing = goals
    .filter((r) => r.status === 'bas')
    .sort((a, b) => (b.target - b.value) / b.target - (a.target - a.value) / a.target);
  const caps = balance.rows.filter((r) => r.kind === 'max' && r.status === 'haut');
  const coverage = goals.reduce((sum, r) => sum + Math.min(1, r.value / Math.max(1, r.target)), 0) / goals.length;
  const percent = Math.round(coverage * 100);

  let tone: Tone = 'good';
  let title = 'Très bien.';
  let detail = 'Les objectifs du jour sont atteints.';

  if (!day.meal && day.snacks.nutrients.kcal === 0) {
    tone = 'empty';
    title = 'Rien de prévu.';
    detail = 'Ajoute un repas pour voir la note du jour.';
  } else if (energy.status === 'haut') {
    tone = 'over';
    title = 'Trop d’énergie.';
    detail = `${fr(energy.value)} kcal pour ${fr(energy.target)} visées. Réduis les quantités ou allège le repas.`;
    if (caps.length > 0) detail += ` ${caps[0].label} au-dessus du plafond.`;
  } else if (caps.length > 0) {
    tone = 'over';
    const cap = caps[0];
    const key = cap.key === 'satFat' || cap.key === 'sugars' || cap.key === 'salt' ? cap.key : undefined;
    const contributor = key ? biggestContributor(data, foods, today, key) : undefined;
    title = `Trop de ${cap.label.toLowerCase()}.`;
    detail = contributor
      ? `La plus grosse part vient de ${contributor.foodName}. Réduis les quantités du repas.`
      : 'Réduis les quantités du repas.';
  } else if (missing.length > 0) {
    tone = 'low';
    title = percent < 60 ? 'À compléter.' : 'Encore un peu juste.';
    detail = `Il manque ${missingText(missing[0])}${missing[1] ? ` et ${missingText(missing[1])}` : ''}.`;
  }

  return (
    <section className={`day-score is-${tone}`} aria-label="Note du jour">
      <div className="day-score-head">
        <p className="day-score-kicker">Note du jour</p>
        <span className="day-score-percent num">{percent} %</span>
      </div>
      <p className="day-score-title">{title}</p>
      <div className="day-score-gauge" role="img" aria-label={`Objectifs couverts à ${percent} %`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="day-score-text">{detail}</p>
    </section>
  );
}
