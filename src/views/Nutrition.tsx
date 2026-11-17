import { useState } from 'react';
import { ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { useApp } from '../context';
import { addDays, formatDayMonth, formatLong, formatShort, range, startOfWeek } from '../domain/dates';
import { average, dayNutrition, type DayNutrition } from '../domain/nutrition';
import { assessDay } from '../domain/balance';
import { PageHeader, Panel, PanelLink } from '../components/ui';
import { BalanceRows, DayBalanceCard, SplitBar } from '../components/Balance';
import { GoalsCard } from '../components/Goals';
import { applyTargets, computeTargets } from '../domain/targets';
import type { Targets } from '../domain/targets';
import type { ISODate } from '../domain/types';
import { WeightSection } from './Weight';
import { capitalize } from './Today';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');

export function NutritionView() {
  const app = useApp();
  const { data, today } = app;
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const [selected, setSelected] = useState<ISODate | null>(null);
  const days = range(weekStart, addDays(weekStart, 6)).map((d) => dayNutrition(data, app.foods, d));
  const avg = average(days);
  const planned = days.filter((d) => d.date > today && d.meals.length > 0).length;

  const thisWeek = startOfWeek(today);

  return (
    <div className="page">
      <PageHeader title="Nutrition" context={`${formatDayMonth(weekStart)} – ${formatDayMonth(addDays(weekStart, 6))}`}>
        <div className="step-nav" role="group" aria-label="Semaine">
          <button type="button" className="icon-action-button is-sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semaine précédente">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button type="button" className="icon-action-button is-sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semaine suivante">
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        {weekStart !== thisWeek && (
          <button type="button" className="secondary-button is-sm" onClick={() => setWeekStart(thisWeek)}>
            Cette semaine
          </button>
        )}
      </PageHeader>

      <WeekKpis avg={avg} targets={app.targets} count={avg.count} planned={planned} />

      <Panel title="Énergie par jour" meta="Touche un jour pour voir son bilan." aside={<Legend />}>
        <WeekChart days={days} target={app.targets.kcal} today={today} selected={selected} onSelect={(d) => setSelected((s) => (s === d ? null : d))} />
        {selected && (
          <div className="chart-day-detail">
            <div className="chart-day-head">
              <p className="panel-subtitle">{capitalize(formatLong(selected))}</p>
              <PanelLink onClick={() => app.goTo('calendar', selected)}>Ouvrir dans la semaine</PanelLink>
            </div>
            <DayBalanceCard date={selected} />
          </div>
        )}
      </Panel>

      <div className="panel-grid">
        <Panel title="Limites et répartition" meta="Moyenne de la semaine">
          {avg.count === 0 ? (
            <p className="muted">Aucun repas compté cette semaine.</p>
          ) : (
            <>
              <BalanceRows rows={assessDay(avg.nutrients, avg.plantG, app.targets).rows.filter((r) => r.kind === 'max')} />
              <SplitBar balance={assessDay(avg.nutrients, avg.plantG, app.targets)} targets={app.targets} />
            </>
          )}
        </Panel>
        <Panel title="À essayer" meta="Tiré de la semaine et du stock">
          <TryThisWeek avg={avg} days={days} />
        </Panel>
      </div>

      <WeightDrift />
      <GoalsCard />

      <Panel title="Poids" meta="La tendance lisse les écarts d’un jour à l’autre.">
        <WeightSection />
      </Panel>
    </div>
  );
}

/** Trois chiffres en tête : l'énergie, les protéines, les fibres, et une phrase qui dit l'essentiel. */
function WeekKpis({ avg, targets, count, planned }: { avg: ReturnType<typeof average>; targets: Targets; count: number; planned: number }) {
  const rows = assessDay(avg.nutrients, avg.plantG, targets).rows;
  const goals = rows.filter((r) => r.kind !== 'max');
  const missing = goals.filter((r) => r.status === 'bas').sort((a, b) => (b.target - b.value) / b.target - (a.target - a.value) / a.target);
  const over = rows.filter((r) => r.kind === 'max' && r.status === 'haut');
  const label = (key: string) =>
    key === 'protein' ? 'des protéines' : key === 'fiber' ? 'des fibres' : key === 'plant' ? 'des légumes et des fruits' : 'de l’énergie';
  const sentence =
    count === 0
      ? 'Rien de compté cette semaine pour l’instant.'
      : missing.length === 0 && over.length === 0
        ? 'Cette semaine tient les objectifs. Garde le rythme.'
        : `Il manque surtout ${label(missing[0]?.key ?? 'kcal')}${missing[1] ? ` et ${label(missing[1].key)}` : ''}${
            over.length ? ` ; au-dessus du plafond : ${over.map((r) => r.label.toLowerCase()).join(', ')}` : ''
          }.`;

  const tiles = [
    { key: 'kcal' as const, label: 'Énergie', unit: 'kcal', value: avg.nutrients.kcal },
    { key: 'protein' as const, label: 'Protéines', unit: 'g', value: avg.nutrients.protein },
    { key: 'fiber' as const, label: 'Fibres', unit: 'g', value: avg.nutrients.fiber },
  ];
  return (
    <Panel
      title="Moyenne de la semaine"
      meta={
        count === 0
          ? 'Aucun jour compté'
          : `${count} jour${count > 1 ? 's' : ''} compté${count > 1 ? 's' : ''}${planned ? `, dont ${planned} prévu${planned > 1 ? 's' : ''}` : ''}`
      }
      className="week-kpis"
    >
      <div className="kpi-row">
        {tiles.map((t) => {
          const target = targets[t.key];
          const pct = target > 0 ? Math.min(100, (t.value / target) * 100) : 0;
          return (
            <div key={t.key} className="kpi">
              <p className="kpi-label">{t.label}</p>
              <p className="kpi-value num">
                {fr(t.value)}{' '}
                <span className="kpi-target">
                  / {fr(target)} {t.unit}
                </span>
              </p>
              <span className="kpi-bar" aria-hidden>
                <span style={{ width: `${pct}%` }} />
              </span>
            </div>
          );
        })}
      </div>
      <p className="kpi-sentence">{sentence}</p>
    </Panel>
  );
}

function Legend() {
  return (
    <span className="legend small">
      <span>
        <i className="sw sw-meal" /> repas
      </span>
      <span>
        <i className="sw sw-snack" /> compléments
      </span>
      <span>
        <i className="sw sw-planned" /> prévu
      </span>
    </span>
  );
}

function WeekChart({
  days,
  target,
  today,
  selected,
  onSelect,
}: {
  days: DayNutrition[];
  target: number;
  today: ISODate;
  selected: ISODate | null;
  onSelect: (d: ISODate) => void;
}) {
  const max = Math.max(target * 1.25, ...days.map((d) => d.total.kcal));
  // Une largeur proche de l'affichage réel : les textes du graphique gardent la taille du reste de la page.
  const W = 1120;
  const H = 190;
  const col = W / 7;
  const y = (v: number) => H - (v / max) * H;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H + 34}`} className="chart-svg" role="group" aria-label={`Énergie par jour, cible ${target} kcal`}>
        <line x1="0" x2={W} y1={y(target)} y2={y(target)} className="chart-target" />
        <text x={W - 4} y={y(target) - 6} textAnchor="end" className="chart-label">
          cible {fr(target)}
        </text>
        {days.map((d, i) => {
          const w = 64;
          const x = i * col + (col - w) / 2;
          const meal = d.meal?.nutrients.kcal ?? 0;
          const snack = d.snacks.nutrients.kcal;
          const future = d.date > today;
          const empty = d.out || (!d.meal && snack === 0);
          const dayLabel = formatShort(d.date).split(' ').slice(0, 2).join(' ');
          return (
            <g
              key={d.date}
              className={`chart-col ${future ? 'is-planned' : ''} ${selected === d.date ? 'is-selected' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${formatLong(d.date)}${empty ? ', rien' : `, ${Math.round(meal + snack)} kcal`}`}
              aria-pressed={selected === d.date}
              onClick={() => onSelect(d.date)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  onSelect(d.date);
                }
              }}
            >
              <rect x={i * col + 6} y={0} width={col - 12} height={H + 30} className="chart-hit" rx="10" />
              {empty ? (
                <text x={x + w / 2} y={H - 8} textAnchor="middle" className="chart-label">
                  {d.out ? 'dehors' : 'rien de prévu'}
                </text>
              ) : (
                <>
                  <rect x={x} y={y(meal)} width={w} height={H - y(meal)} rx="5" className="bar-meal" />
                  {snack > 0 && <rect x={x} y={y(meal + snack)} width={w} height={H - y(snack)} rx="5" className="bar-snack" />}
                  <text x={x + w / 2} y={y(meal + snack) - 6} textAnchor="middle" className="chart-value">
                    {Math.round(meal + snack)}
                  </text>
                </>
              )}
              <text x={x + w / 2} y={H + 22} textAnchor="middle" className={`chart-day ${d.date === today ? 'is-today' : ''}`}>
                {dayLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Deux ou trois gestes concrets, tirés de la semaine réelle et du stock. */
function TryThisWeek({ avg, days }: { avg: ReturnType<typeof average>; days: DayNutrition[] }) {
  const app = useApp();
  const { targets: t } = app;
  if (avg.count === 0) return <p className="muted">Rien à proposer sans repas compté.</p>;
  const counted = days.filter((d) => d.meal);
  const ideas: { text: string; action?: { label: string; go: () => void } }[] = [];

  const proteinGap = t.protein - avg.nutrients.protein;
  if (proteinGap > t.protein * 0.1) {
    ideas.push({
      text: `Il manque ${fr(proteinGap)} g de protéines par jour. Un skyr en apporte 11, un œuf 6, une portion de lentilles 18.`,
      action: { label: 'Ajouter un complément', go: () => app.goTo('today') },
    });
  }

  const unused = app.priorities.filter((p) => p.atRisk > 0 && !p.nextUse).slice(0, 1);
  if (unused.length > 0) {
    const p = unused[0];
    ideas.push({
      text: `${fr(p.atRisk)} ${p.food.unit === 'pièce' ? 'pièce(s)' : p.food.unit === 'ml' ? 'ml' : 'g'} de ${p.food.name.toLowerCase()} ne sont dans aucun plat et se gardent ${p.daysLeft <= 0 ? 'plus longtemps' : `${p.daysLeft} jours`}.`,
      action: { label: 'Voir le stock', go: () => app.goTo('stock') },
    });
  }

  const highSat = counted.filter((d) => d.total.satFat > t.satFatMaxG).length;
  if (highSat > 0) {
    ideas.push({
      text: `${highSat} jour${highSat > 1 ? 's' : ''} au-dessus de ${fr(t.satFatMaxG)} g de graisses saturées. Le fromage et le lait de coco en sont la source la plus simple à réduire.`,
    });
  }

  const lowFiber = counted.filter((d) => d.total.fiber < t.fiber * 0.7).length;
  if (lowFiber > 0 && ideas.length < 3) {
    ideas.push({ text: `${lowFiber} jour${lowFiber > 1 ? 's' : ''} avec peu de fibres. Une portion de légumineuses en plus, et c’est couvert.` });
  }

  const dayWithoutMeal = days.filter((d) => d.date >= app.today && d.meals.length === 0).length;
  if (dayWithoutMeal > 0 && ideas.length < 3) {
    ideas.push({
      text: `${dayWithoutMeal} jour${dayWithoutMeal > 1 ? 's' : ''} sans repas cette semaine : le calendrier peut les remplir avec ce que le stock propose.`,
      action: { label: 'Ouvrir la semaine', go: () => app.goTo('calendar') },
    });
  }

  if (ideas.length === 0) return <p>Rien à corriger : les chiffres de la semaine tiennent. Continue comme ça.</p>;

  return (
    <ul className="try-list">
      {ideas.slice(0, 3).map((i) => (
        <li key={i.text}>
          <Lightbulb size={15} aria-hidden />
          <div className="try-body">
            <p>{i.text}</p>
            {i.action && <PanelLink onClick={i.action.go}>{i.action.label}</PanelLink>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Les pesées et le poids du profil sont deux choses : celle-ci propose de recalculer les
 * objectifs quand la dernière pesée s'écarte de 2 kg. Rien n'est appliqué sans le clic.
 */
function WeightDrift() {
  const app = useApp();
  const { data, store } = app;
  const profile = data.settings.profile;
  const last = [...data.journal.weights].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1);
  if (!profile || !last) return null;
  const diff = last.kg - profile.weightKg;
  if (Math.abs(diff) < 2) return null;
  const plan = computeTargets({ ...profile, weightKg: last.kg });
  return (
    <section className="settle" aria-label="Poids et objectifs">
      <div className="settle-head">
        <p className="settle-title">Ta dernière pesée ne correspond plus à ton profil</p>
        <p className="hint">
          Profil {profile.weightKg.toLocaleString('fr-FR')} kg, pesée du {formatShort(last.date)} {last.kg.toLocaleString('fr-FR')} kg. Avec ce poids,
          l’objectif passerait à {Math.round(plan.targets.kcal / 50) * 50} kcal et {plan.targets.protein} g de protéines.
        </p>
      </div>
      <div className="settle-actions">
        <button
          type="button"
          className="secondary-button is-sm"
          onClick={() => store.update('settings', (x) => applyTargets(x, { ...profile, weightKg: last.kg, updatedAt: app.today }, plan.targets))}
        >
          Recalculer avec cette pesée
        </button>
      </div>
    </section>
  );
}
