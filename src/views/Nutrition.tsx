import { useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context';
import { addDays, diffDays, formatDayMonth, formatLong, formatShort, range, startOfWeek, weekday } from '../domain/dates';
import { dayNutrition, type DayNutrition } from '../domain/nutrition';
import { assessDay, type BalanceRow, type DayBalance } from '../domain/balance';
import { applyTargets, computeTargets, type Targets } from '../domain/targets';
import type { ISODate, WeightEntry } from '../domain/types';
import { capitalize } from '../domain/text';
import { MealComposer } from '../components/MealComposer';
import { Sheet } from '../components/Sheet';
import './nutrition-v3.css';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
const dec = (v: number) => (Math.round(v * 10) / 10).toLocaleString('fr-FR');
const fmtKg = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signedKg = (v: number) => {
  const n = Math.abs(v) < 0.05 ? 0 : v;
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtKg(Math.abs(n))}`;
};
const round1 = (v: number) => Math.round(v * 10) / 10;
/** Le sel s’affiche au dixième, le reste en entier. */
const show = (r: BalanceRow, v = r.value) => (r.key === 'salt' ? dec(v) : fr(v));

const WEEK_LETTERS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

const GOAL_TONE: Record<BalanceRow['key'], string> = {
  kcal: 'is-butter',
  protein: 'is-peach',
  fiber: 'is-mint',
  plant: 'is-mint',
  satFat: 'is-lilac',
  sugars: 'is-lilac',
  salt: 'is-lilac',
};

const SPLIT_PARTS = [
  { key: 'protein' as const, label: 'Protéines' },
  { key: 'fat' as const, label: 'Lipides' },
  { key: 'carbs' as const, label: 'Glucides' },
];

/** Chaque repère pèse le même quart du score : 25 points sur 100. */
const POINTS_PER_GOAL = 25;

/** Le qualificatif du score, selon le nombre de repères tenus (0 à 4). */
const QUALIFIERS = [
  'Aucun des quatre repères n’est tenu',
  'Un repère sur quatre tenu',
  'Deux repères sur quatre tenus',
  'Trois repères sur quatre tenus',
  'Les quatre repères tenus',
] as const;

/** Score du jour : moyenne de min(1, valeur / cible) sur les repères, plafonds exclus. */
function scoreOf(day: DayNutrition, targets: Targets): number | undefined {
  if (day.out || day.total.kcal <= 0) return undefined;
  const rows = assessDay(day.total, day.plantG, targets).rows.filter((r) => r.kind !== 'max');
  if (rows.length === 0) return undefined;
  return rows.reduce((sum, r) => sum + Math.min(1, r.target > 0 ? r.value / r.target : 0), 0) / rows.length;
}

/** La part d’un repère dans le score, en points : sa valeur sur sa cible, plafonnée à 25. */
const pointsOf = (r: BalanceRow) => (r.target > 0 ? Math.min(1, r.value / r.target) * POINTS_PER_GOAL : 0);
const showPoints = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? fr(v) : dec(v));

const scorePct = (s: number) => (s >= 0.999 ? 100 : Math.min(99, Math.round(s * 100)));

const joinFr = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;

/** Un dépassement n’est réel que s’il s’écrit autrement que « 0 » à la précision affichée. */
const overrunOf = (r: BalanceRow) => Math.max(0, r.value - r.target);
const capOver = (r: BalanceRow) => r.status === 'haut' && show(r, overrunOf(r)) !== '0';
const capAtLimit = (r: BalanceRow) => !capOver(r) && show(r, Math.max(0, r.target - r.value)) === '0';

function capStatus(r: BalanceRow): string {
  if (capOver(r)) return `dépassé de ${show(r, overrunOf(r))} ${r.unit}`;
  if (capAtLimit(r)) return 'à la limite';
  return `reste ${show(r, Math.max(0, r.target - r.value))} ${r.unit}`;
}

/** La référence de chaque plafond, rappelée sous son nom. */
function capSource(r: BalanceRow): string {
  if (r.key === 'satFat') return 'ANSES · 12 % de l’énergie';
  if (r.key === 'sugars') return 'ANSES · hors lactose du lait';
  return 'OMS · moins de 5 g';
}

function goalStatus(r: BalanceRow): string {
  const gap = r.target - r.value;
  if (r.kind === 'band') {
    if (r.status === 'haut') return `${show(r, Math.abs(gap))} ${r.unit} au-dessus du repère`;
    if (r.status === 'bas') return `reste ${show(r, Math.max(0, gap))} ${r.unit}`;
    return 'repère tenu';
  }
  return r.status === 'bas' ? `reste ${show(r, Math.max(0, gap))} ${r.unit}` : 'repère tenu';
}

function gapText(r: BalanceRow): string {
  const amount = fr(Math.max(0, r.target - r.value));
  if (r.key === 'kcal') return `${amount} kcal`;
  if (r.key === 'protein') return `${amount} g de protéines`;
  if (r.key === 'fiber') return `${amount} g de fibres`;
  return `${amount} g de légumes et de fruits`;
}

const SCORE_DEFINITION =
  'Le score du jour se lit sur 100 points : quatre repères, 25 points chacun (énergie, protéines, fibres, légumes et fruits). Les plafonds n’entrent pas dans le calcul.';

/** Un jour est compté quand il est passé ou aujourd’hui, rempli et hors bilan. */
const isRecorded = (d: DayNutrition, today: ISODate) => d.date <= today && !d.out && d.total.kcal > 0;
/** Un jour à venir rempli ne compte pas encore : il est prévu. */
const isPlanned = (d: DayNutrition, today: ISODate) => d.date > today && !d.out && d.total.kcal > 0;

const countLabelOf = (n: number) => (n === 0 ? 'aucun jour compté' : `${n} jour${n > 1 ? 's' : ''} compté${n > 1 ? 's' : ''}`);
const countShort = (n: number) => (n === 0 ? 'aucun jour' : `${n} jour${n > 1 ? 's' : ''}`);

/** Moyenne des jours comptés, hors jours dehors et jours vides. */
function meanOf(days: DayNutrition[], today: ISODate) {
  const counted = days.filter((d) => isRecorded(d, today));
  if (counted.length === 0) return { count: 0, kcal: 0, protein: 0, fiber: 0 };
  const sum = counted.reduce(
    (acc, d) => ({ kcal: acc.kcal + d.total.kcal, protein: acc.protein + d.total.protein, fiber: acc.fiber + d.total.fiber }),
    { kcal: 0, protein: 0, fiber: 0 },
  );
  return { count: counted.length, kcal: sum.kcal / counted.length, protein: sum.protein / counted.length, fiber: sum.fiber / counted.length };
}

function averageScore(days: DayNutrition[], targets: Targets, today: ISODate): number | undefined {
  const scores = days
    .filter((d) => isRecorded(d, today))
    .map((d) => scoreOf(d, targets))
    .filter((s): s is number => s !== undefined);
  if (scores.length === 0) return undefined;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** La comparaison à la semaine précédente, en une phrase factuelle. */
function compareWeeks(days: DayNutrition[], prevDays: DayNutrition[], targets: Targets, today: ISODate): string {
  const now = days.filter((d) => isRecorded(d, today)).length;
  const before = prevDays.filter((d) => isRecorded(d, today)).length;
  const planned = days.filter((d) => isPlanned(d, today)).length;
  const plannedNote = planned > 0 ? ` ; ${countShort(planned)} prévu${planned > 1 ? 's' : ''}` : '';

  if (now === 0 && before === 0) {
    return planned > 0
      ? `Aucun jour compté cette semaine ; ${countShort(planned)} prévu${planned > 1 ? 's' : ''}.`
      : 'Aucun jour compté cette semaine, aucun la semaine précédente.';
  }
  if (now === 0) return `Aucun jour compté cette semaine, contre ${countShort(before)} la semaine précédente${plannedNote}.`;
  if (before === 0) return `${capitalize(countShort(now))} compté${now > 1 ? 's' : ''} cette semaine, aucun la semaine précédente.`;

  const a = averageScore(days, targets, today);
  const b = averageScore(prevDays, targets, today);
  const score = a !== undefined && b !== undefined ? ` ; score moyen ${scorePct(a)} %, contre ${scorePct(b)} %` : '';
  return `${capitalize(countShort(now))} compté${now > 1 ? 's' : ''} cette semaine, contre ${countShort(before)} la semaine précédente${score}.`;
}

/**
 * Le bilan : le jour d’abord, avec son score en anneau, sa lecture et les quatre parts qui le composent,
 * puis les plafonds, la semaine en sept barres et le poids. La même page sert à lire et à corriger :
 * choisir un jour de la semaine ramène son bilan sous l’anneau.
 */
export function NutritionView({ focusDate }: { focusDate?: ISODate }) {
  const app = useApp();
  const { data, today, targets } = app;
  const anchor = focusDate ?? today;
  const [weekStart, setWeekStart] = useState<ISODate>(startOfWeek(anchor));
  const [selected, setSelected] = useState<ISODate>(anchor);
  const [composer, setComposer] = useState<ISODate | null>(null);

  const days = range(weekStart, addDays(weekStart, 6)).map((d) => dayNutrition(data, app.foods, d));
  const prevStart = addDays(weekStart, -7);
  const prevDays = range(prevStart, addDays(prevStart, 6)).map((d) => dayNutrition(data, app.foods, d));
  const day = days.find((d) => d.date === selected) ?? dayNutrition(data, app.foods, selected);
  const thisWeek = startOfWeek(today);
  const recorded = days.filter((d) => isRecorded(d, today)).length;
  const planned = days.filter((d) => isPlanned(d, today)).length;
  const countLabel = `${countLabelOf(recorded)}${planned > 0 ? ` · ${countShort(planned)} prévu${planned > 1 ? 's' : ''}` : ''}`;
  const away = weekStart !== thisWeek || selected !== today;

  const goToday = () => {
    setWeekStart(thisWeek);
    setSelected(today);
  };

  // Toucher un jour de la semaine ramène son bilan sous l’anneau ; au clavier, on ne bouge pas la page.
  const openDay = (date: ISODate, scroll: boolean) => {
    setSelected(date);
    if (scroll) document.querySelector('.bil-hero')?.scrollIntoView({ block: 'start' });
  };

  // En changeant de semaine, on ouvre aujourd’hui, sinon le dernier jour rempli (passé)
  // ou le premier jour rempli (à venir) : jamais une case vide par défaut.
  const pickDay = (start: ISODate): ISODate => {
    const week = range(start, addDays(start, 6));
    if (start === thisWeek) return today;
    const filled = week.filter((d) => {
      const n = dayNutrition(data, app.foods, d);
      return n.total.kcal > 0 && !n.out;
    });
    if (start < thisWeek) return filled[filled.length - 1] ?? addDays(start, 6);
    return filled[0] ?? start;
  };

  const move = (delta: number) => {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    setSelected(pickDay(next));
  };

  const balance = assessDay(day.total, day.plantG, targets);
  const goals = balance.rows.filter((r) => r.kind !== 'max');
  const caps = balance.rows.filter((r) => r.kind === 'max');
  const dayEmpty = !day.out && day.total.kcal <= 0;
  const short = dayEmpty || day.out;

  return (
    <div className="s-page bil-page">
      <header className="s-pagehead">
        <div>
          <h1 className="s-title">Bilan</h1>
          <p className="s-subtitle">
            Du {formatDayMonth(weekStart)} au {formatDayMonth(addDays(weekStart, 6))} · {countLabel}
          </p>
          <p className="bil-open-day">Jour ouvert : {formatLong(selected)}</p>
        </div>
        <div className="bil-nav">
          <button type="button" className="s-btn is-ghost is-sm" onClick={() => move(-1)} aria-label="Semaine précédente">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button type="button" className="s-btn is-ghost is-sm" onClick={() => move(1)} aria-label="Semaine suivante">
            <ChevronRight size={16} aria-hidden />
          </button>
          {away ? (
            <button type="button" className="s-btn is-sm" onClick={goToday}>
              Revenir à aujourd’hui
            </button>
          ) : (
            <span className="s-chip is-butter">Aujourd’hui</span>
          )}
        </div>
      </header>

      <DayHero
        day={day}
        targets={targets}
        today={today}
        onToday={() => setSelected(today)}
        onCompose={() => setComposer(day.date)}
      />

      <div className={`bil-grid ${short ? 'is-short' : ''}`}>
        <section className="s-card" aria-labelledby="bil-reperes">
          <div className="bil-head">
            <h2 id="bil-reperes">Les repères du jour</h2>
            <span className="s-meta">{capitalize(formatLong(day.date))}</span>
          </div>
          {day.out ? (
            <EmptyNote title="Journée hors bilan">
              Repas pris dehors : aucun repère n’est compté pour ce jour.
            </EmptyNote>
          ) : dayEmpty ? (
            <>
              <EmptyNote title="Aucun repas noté">
                Les quatre repères s’affichent dès le premier repas : énergie, protéines, fibres, légumes et fruits.
              </EmptyNote>
              <ul className="bil-empty-goals" aria-label="Repères du jour et leur valeur visée">
                {goals.map((r) => (
                  <li key={r.key}>
                    <span>{r.label}</span>
                    <b className="num">{show(r, r.target)} {r.unit}</b>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="bil-nuts">
              {goals.map((r) => {
                const pct = r.target > 0 ? Math.min(100, (r.value / r.target) * 100) : 0;
                const over = r.status === 'haut' && r.kind !== 'min';
                return (
                  <div key={r.key} className={`bil-nut is-${r.status}`}>
                    <div className="bil-nut-head">
                      <span className="bil-nut-name">{r.label}</span>
                      {r.status === 'ok' && (
                        <span className="bil-nut-check" aria-hidden>
                          <Check size={13} strokeWidth={3} />
                        </span>
                      )}
                      <span className={`bil-nut-status ${over ? 'is-over' : ''}`}>{goalStatus(r)}</span>
                    </div>
                    <p className="bil-nut-val">
                      <b className="num">{show(r)}</b> <span>{r.unit}</span> <i>/ {show(r, r.target)} {r.unit}</i>
                    </p>
                    <div className={`s-jauge ${GOAL_TONE[r.key]}`} aria-hidden>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="bil-note">
            Chaque repère vaut 25 points du score : sa part est la valeur du jour divisée par la valeur du repère, sans dépasser 25.
          </p>
        </section>

        <section className="s-card" aria-labelledby="bil-plafonds">
          <div className="bil-head">
            <h2 id="bil-plafonds">Les plafonds</h2>
            <span className="s-meta">à ne pas dépasser</span>
          </div>
          {day.out ? (
            <EmptyNote title="Journée hors bilan">
              Repas pris dehors : aucun plafond n’est compté pour ce jour.
            </EmptyNote>
          ) : dayEmpty ? (
            <>
              <EmptyNote title="Aucun repas noté">
                Les trois plafonds se lisent dès le premier repas.
              </EmptyNote>
              <ul className="bil-empty-goals" aria-label="Plafonds du jour et leur valeur">
                {caps.map((r) => (
                  <li key={r.key}>
                    <span>{r.label}</span>
                    <b className="num">{show(r, r.target)} {r.unit}</b>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="bil-caps">
                {caps.map((r) => {
                  const pct = r.target > 0 ? Math.min(100, (r.value / r.target) * 100) : 0;
                  const over = capOver(r);
                  const near = capAtLimit(r);
                  return (
                    <div key={r.key} className={`bil-cap ${over ? 'is-over' : ''} ${near ? 'is-near' : ''}`}>
                      <div className="bil-cap-head">
                        <span className="bil-cap-label">
                          <span className="bil-cap-name">{r.label}</span>
                          <span className="bil-cap-src">{capSource(r)}</span>
                        </span>
                        <span className="bil-cap-val">
                          <b className="num">{show(r)}</b>
                          <i> / {show(r, r.target)} {r.unit}</i>
                        </span>
                      </div>
                      <div className={`s-jauge ${GOAL_TONE[r.key]} ${over ? 'is-over' : ''}`} aria-hidden>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <p className="bil-cap-note">{capStatus(r)}</p>
                    </div>
                  );
                })}
              </div>
              <SplitRead balance={balance} kcal={day.total.kcal} onCompose={() => setComposer(day.date)} />
              <p className="bil-note">Le sel ajouté en cuisine n’est pas compté.</p>
            </>
          )}
        </section>
      </div>

      <WeekReading
        days={days}
        prevDays={prevDays}
        targets={targets}
        today={today}
        selected={selected}
        onSelect={openDay}
        onCompose={() => setComposer(selected)}
      />

      <WeightCard />

      <Sheet
        open={composer !== null}
        onClose={() => setComposer(null)}
        title={composer ? `Repas du ${formatShort(composer)}` : 'Repas'}
        subtitle="Une recette du carnet, un plat maison, ou ce que tu as déjà"
        size="lg"
      >
        {composer && <MealComposer date={composer} onClose={() => setComposer(null)} />}
      </Sheet>
    </div>
  );
}

/** Un état vide court, avec son titre et ce qui manque. */
function EmptyNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bil-empty">
      <p className="bil-empty-title">{title}</p>
      <p>{children}</p>
    </div>
  );
}

/* ---------- L’anneau du jour et sa lecture ---------- */

function ScoreRing({ score, out, qualifier }: { score?: number; out: boolean; qualifier: string }) {
  const R = 84;
  const C = 2 * Math.PI * R;
  const v = score ?? 0;
  return (
    <div
      className="bil-ring"
      role="img"
      aria-label={
        score === undefined
          ? out
            ? 'Repas pris dehors : journée hors bilan, pas de score.'
            : 'Aucun repas compté : pas encore de score.'
          : `Score du jour : ${scorePct(score)} sur 100. ${qualifier}.`
      }
    >
      <svg viewBox="0 0 200 200" aria-hidden>
        <circle className="bil-ring-track" cx="100" cy="100" r={R} />
        <circle
          className="bil-ring-fill"
          cx="100"
          cy="100"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - v)}
        />
      </svg>
      <div className="bil-ring-center">
        <span className={`bil-ring-num num ${score === undefined ? 'is-empty' : ''}`}>
          {score === undefined ? '–' : <>{scorePct(score)}<span>%</span></>}
        </span>
        <span className="bil-ring-label">{out ? 'hors bilan' : score === undefined ? 'pas de score' : 'score du jour'}</span>
      </div>
    </div>
  );
}

function DayHero({
  day,
  targets,
  today,
  onToday,
  onCompose,
}: {
  day: DayNutrition;
  targets: Targets;
  today: ISODate;
  onToday: () => void;
  onCompose: () => void;
}) {
  const balance = assessDay(day.total, day.plantG, targets);
  const score = scoreOf(day, targets);
  const goals = balance.rows.filter((r) => r.kind !== 'max');
  const caps = balance.rows.filter((r) => r.kind === 'max');
  const missing = goals
    .filter((r) => r.status === 'bas')
    .sort((a, b) => (b.target - b.value) / b.target - (a.target - a.value) / a.target);
  const overGoals = goals.filter((r) => r.status === 'haut');
  const over = caps.filter((r) => capOver(r));
  const met = goals.filter((r) => r.status === 'ok').length;
  const qualifier = QUALIFIERS[met];
  const planned = day.date > today;

  let verdict: string;
  let say: string;
  if (day.out) {
    verdict = 'Repas pris dehors';
    say = 'Cette journée ne compte pas dans le bilan : elle est marquée comme prise à l’extérieur.';
  } else if (score === undefined) {
    if (planned) {
      verdict = 'Journée à préparer';
      say = 'Aucun repas prévu ce jour-là. Composer le repas le remplira, et le score se calculera sur ce qui est posé.';
    } else if (day.date === today) {
      verdict = 'Pas encore de repas';
      say = 'Aucun repas noté aujourd’hui, donc pas de score. Composer le repas ouvre le bilan.';
    } else {
      verdict = 'Journée non comptée';
      say = 'Aucun repas noté ce jour-là : la journée n’est pas comptée.';
    }
  } else {
    verdict = qualifier;
    const parts: string[] = [];
    if (missing.length) parts.push(`Il reste surtout ${joinFr(missing.slice(0, 2).map(gapText))}.`);
    if (overGoals.length) {
      parts.push(
        `${capitalize(joinFr(overGoals.map((r) => r.label.toLowerCase())))} au-dessus ${overGoals.length > 1 ? 'des repères' : 'du repère'}.`,
      );
    }
    if (!missing.length && !overGoals.length) parts.push('Les quatre repères sont couverts.');
    if (over.length) {
      parts.push(
        `${capitalize(joinFr(over.map((r) => r.label.toLowerCase())))} au-dessus ${over.length > 1 ? 'des plafonds' : 'du plafond'}.`,
      );
    }
    say = parts.join(' ');
  }

  const chip = day.out
    ? null
    : over.length > 0
      ? { tone: 'is-berry', text: over.length > 1 ? 'Plafonds dépassés' : 'Plafond dépassé' }
      : planned && score !== undefined
        ? { tone: 'is-butter', text: 'Journée prévue' }
        : null;

  return (
    <section className="s-card is-pop bil-hero">
      <div className="bil-ring-wrap">
        <ScoreRing score={score} out={day.out} qualifier={qualifier} />
        <p className="bil-ring-foot">quatre repères, 25 points chacun</p>
      </div>

      <div className="bil-hero-body">
        <div className="bil-hero-top">
          <span className="bil-eyebrow">
            {day.date === today ? 'Aujourd’hui' : planned ? 'Jour prévu' : 'Jour choisi'} · {capitalize(formatLong(day.date))}
          </span>
          {day.date !== today && (
            <button type="button" className="s-btn is-ghost is-sm" onClick={onToday}>
              Revenir à aujourd’hui
            </button>
          )}
        </div>

        {!day.out && <p className="bil-score-def">{SCORE_DEFINITION}</p>}

        <div className="bil-verdict-row">
          <h2 className="bil-verdict">{verdict}</h2>
          {chip && <span className={`s-chip ${chip.tone}`}>{chip.text}</span>}
        </div>
        <p className="bil-say">{say}</p>

        {score !== undefined && (
          <div className="bil-shares-wrap">
            <p className="bil-shares-title">D’où vient le score</p>
            <ul className="bil-shares" aria-label="Part de chaque repère dans le score du jour">
              {goals.map((r) => {
                const pts = pointsOf(r);
                const ok = r.status === 'ok';
                const overGoal = r.status === 'haut';
                return (
                  <li key={r.key} className={`bil-share ${ok ? 'is-ok' : ''} ${overGoal ? 'is-over' : ''}`}>
                    <span className="bil-share-name">{r.label}</span>
                    <span className="bil-share-pts num">
                      <b>{showPoints(pts)}</b>
                      <i> / {POINTS_PER_GOAL} points</i>
                    </span>
                    <div className={`s-jauge ${GOAL_TONE[r.key]}`} aria-hidden>
                      <span style={{ width: `${(pts / POINTS_PER_GOAL) * 100}%` }} />
                    </div>
                    <span className={`bil-share-state ${overGoal ? 'is-over' : ''}`}>
                      {ok && <Check size={12} strokeWidth={3} aria-hidden />}
                      {goalStatus(r)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {score === undefined && !day.out && (
          <button type="button" className="s-btn is-primary is-sm bil-hero-cta" onClick={onCompose}>
            <Plus size={15} aria-hidden /> Composer le repas
          </button>
        )}
      </div>
    </section>
  );
}

/** La répartition de l’énergie, avec les fourchettes ANSES de chaque famille. */
function SplitRead({ balance, kcal, onCompose }: { balance: DayBalance; kcal: number; onCompose: () => void }) {
  if (!balance.split || !balance.splitStatus) {
    const missing = Math.max(0, Math.ceil(300 - kcal));
    return (
      <div className="bil-split is-empty">
        <p className="bil-split-title">Répartition de l’énergie</p>
        <div className="bil-split-bar is-empty" aria-hidden />
        <p className="bil-split-empty">
          Elle demande au moins 300 kcal dans la journée{missing > 0 ? ` ; il en manque ${fr(missing)}` : ''}.
        </p>
        <button type="button" className="s-btn is-ghost is-sm" onClick={onCompose}>
          Composer le repas
        </button>
      </div>
    );
  }
  return (
    <div className="bil-split">
      <p className="bil-split-title">Répartition de l’énergie</p>
      <div className="bil-split-bar" role="img" aria-label="Répartition de l’énergie">
        {SPLIT_PARTS.map((p) => (
          <span key={p.key} className={`bil-seg is-${p.key}`} style={{ width: `${balance.split![p.key]}%` }} />
        ))}
      </div>
      <ul className="bil-split-legend">
        {SPLIT_PARTS.map((p) => (
          <li key={p.key}>
            <i className={`bil-sw is-${p.key}`} aria-hidden />
            {p.label} <b className="num">{Math.round(balance.split![p.key])} %</b>
            {balance.splitStatus![p.key] !== 'ok' && <em>hors fourchette</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- La semaine, sept barres à lire et à choisir ---------- */

function WeekReading({
  days,
  prevDays,
  targets,
  today,
  selected,
  onSelect,
  onCompose,
}: {
  days: DayNutrition[];
  prevDays: DayNutrition[];
  targets: Targets;
  today: ISODate;
  selected: ISODate;
  onSelect: (d: ISODate, scroll: boolean) => void;
  onCompose: () => void;
}) {
  const stats = meanOf(days, today);
  const planned = days.filter((d) => isPlanned(d, today)).length;
  const fillMax = Math.max(targets.kcal * 1.2, ...days.map((d) => d.total.kcal), 1);
  const targetPct = Math.min(100, (targets.kcal / fillMax) * 100);
  const compare = compareWeeks(days, prevDays, targets, today);

  return (
    <section className="s-card bil-weekcard" aria-labelledby="bil-semaine">
      <div className="bil-head">
        <h2 id="bil-semaine">La semaine</h2>
        <span className="s-meta">objectif du jour : {fr(targets.kcal)} kcal</span>
      </div>

      <div className="bil-week">
        {days.map((d) => {
          const score = scoreOf(d, targets);
          const plannedDay = isPlanned(d, today);
          const recordedDay = isRecorded(d, today);
          const filled = recordedDay || plannedDay;
          const empty = !d.out && !filled;
          const pct = Math.min(100, (d.total.kcal / fillMax) * 100);
          const isToday = d.date === today;
          const on = d.date === selected;
          const label = capitalize(formatLong(d.date));
          const aria = d.out
            ? `${label}, repas pris dehors, hors bilan`
            : filled
              ? `${label}, ${fr(d.total.kcal)} kcal${plannedDay ? ', prévu' : ''}${score !== undefined ? `, score ${scorePct(score)} pour cent` : ''}`
              : `${label}, jour vide, non compté`;
          return (
            <button
              key={d.date}
              type="button"
              className={`bil-day ${on ? 'is-on' : ''} ${isToday ? 'is-today' : ''} ${empty ? 'is-empty' : ''}`}
              onClick={(e) => onSelect(d.date, e.detail > 0)}
              aria-pressed={on}
              aria-current={on ? 'date' : undefined}
              aria-label={aria}
            >
              <span className="bil-day-head">
                <span className="bil-day-wd">{WEEK_LETTERS[weekday(d.date)]}</span>
                <span className="bil-day-num num">{Number(d.date.slice(8))}</span>
                {isToday && <span className="bil-today-dot" aria-hidden />}
              </span>
              <span
                className={`bil-track ${d.out ? 'is-out' : ''} ${empty ? 'is-empty' : ''}`}
                style={{ ['--target' as string]: `${targetPct}%` } as CSSProperties}
                aria-hidden
              >
                {filled && <span className={`bil-fill ${plannedDay ? 'is-planned' : ''}`} style={{ height: `${pct}%` }} />}
                {d.out && <span className="bil-outword">dehors</span>}
              </span>
              <span className="bil-day-kcal num">{d.out || empty ? '–' : fr(d.total.kcal)}</span>
              <span className={`bil-day-score ${plannedDay ? 'is-planned' : ''}`}>
                {d.out ? 'hors bilan' : filled && score !== undefined ? `${scorePct(score)} %` : 'jour vide'}
              </span>
            </button>
          );
        })}
      </div>

      <p className="bil-note">
        Chaque barre : les kcal du jour, avec le trait pointillé à {fr(targets.kcal)} kcal. Les barres en pointillé sont des jours prévus, leur score vient du plan. Choisir un jour ouvre son bilan.
      </p>

      <div className="bil-week-foot">
        <p className="bil-week-compare">{compare}</p>
        {stats.count === 0 ? (
          planned === 0 ? (
            <button type="button" className="s-btn is-sm" onClick={onCompose}>
              <Plus size={15} aria-hidden /> Composer le repas
            </button>
          ) : null
        ) : (
          <div className="bil-week-avg">
            <div>
              <b className="num">{fr(stats.kcal)}</b>
              <span>kcal par jour</span>
            </div>
            <div>
              <b className="num">{fr(stats.protein)}</b>
              <span>g de protéines</span>
            </div>
            <div>
              <b className="num">{fr(stats.fiber)}</b>
              <span>g de fibres</span>
            </div>
            <div>
              <b className="num">{stats.count}</b>
              <span>jour{stats.count > 1 ? 's' : ''} compté{stats.count > 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Le poids : la moyenne sur sept jours, une pesée, la courbe ---------- */

interface SmoothedPoint {
  date: ISODate;
  kg: number;
  avg: number;
}

/** Moyenne des pesées des sept derniers jours, calculée à chaque pesée. */
function sevenDayAverage(entries: WeightEntry[]): SmoothedPoint[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  return sorted.map((e) => {
    const window = sorted.filter((p) => p.date <= e.date && diffDays(p.date, e.date) <= 6);
    return { date: e.date, kg: e.kg, avg: window.reduce((sum, p) => sum + p.kg, 0) / window.length };
  });
}

interface Pace {
  rate: number;
  from: ISODate;
  days: number;
}

/** Rythme réel : écart des moyennes sur sept jours, ramené à la semaine. */
function weeklyPace(points: SmoothedPoint[]): Pace | undefined {
  if (points.length < 2) return undefined;
  const last = points[points.length - 1];
  const older = points.filter((p) => diffDays(p.date, last.date) >= 21).pop();
  const ref = older ?? points.find((p) => diffDays(p.date, last.date) >= 7);
  if (!ref) return undefined;
  const days = diffDays(ref.date, last.date);
  if (days < 7) return undefined;
  return { rate: ((last.avg - ref.avg) / days) * 7, from: ref.date, days };
}

function WeightCard() {
  const { data, today, store } = useApp();
  const [date, setDate] = useState<ISODate>(today);
  const [kg, setKg] = useState('');
  const [saved, setSaved] = useState<ISODate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [recalcNote, setRecalcNote] = useState<string | null>(null);
  const kgRef = useRef<HTMLInputElement>(null);
  const points = sevenDayAverage(data.journal.weights);
  const last = points[points.length - 1];
  const pace = weeklyPace(points);
  const profile = data.settings.profile;
  const delta = profile && last ? last.avg - profile.weightKg : 0;
  const proposal =
    profile && last && Math.abs(delta) > 2 && !dismissed
      ? computeTargets({ ...profile, weightKg: round1(last.avg), updatedAt: today })
      : undefined;

  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(kg.replace(',', '.'));
    if (!date || !Number.isFinite(n) || n < 30 || n > 250) {
      setError('Un poids entre 30 et 250 kg.');
      return;
    }
    const value = Math.round(n * 10) / 10;
    store.update('journal', (j) => ({
      ...j,
      weights: [...j.weights.filter((w) => w.date !== date), { date, kg: value }],
    }));
    setKg('');
    setError(null);
    setSaved(date);
    setRecalcNote(null);
    setDismissed(false);
    kgRef.current?.focus();
  };

  const remove = (d: ISODate) => {
    store.update('journal', (j) => ({ ...j, weights: j.weights.filter((w) => w.date !== d) }));
    if (saved === d) setSaved(null);
    setRecalcNote(null);
  };

  const focusWeight = () => {
    kgRef.current?.focus();
    kgRef.current?.scrollIntoView({ block: 'center' });
  };

  const recalc = () => {
    if (!profile || !last) return;
    const nextProfile = { ...profile, weightKg: round1(last.avg), updatedAt: today };
    const plan = computeTargets(nextProfile);
    store.update('settings', (s) => applyTargets(s, nextProfile, plan.targets));
    setRecalcNote(
      `Objectifs recalculés : ${fr(plan.targets.kcal)} kcal, ${fr(plan.targets.protein)} g de protéines et ${fr(plan.targets.fiber)} g de fibres par jour.`,
    );
  };

  // Une phrase de tendance neutre : elle décrit le mouvement, sans conseil ni jugement.
  let trendSay: string | undefined;
  if (last && points.length === 1) {
    trendSay = `Une pesée notée le ${formatLong(last.date)}. La tendance est la moyenne des pesées sur sept jours ; le rythme se dessine à la deuxième.`;
  } else if (last && pace === undefined) {
    trendSay = 'Deux pesées à moins de sept jours d’écart : le rythme s’affiche à la prochaine, une semaine plus tard.';
  } else if (pace) {
    const period =
      pace.days >= 21 && pace.days <= 35 ? 'sur les quatre dernières semaines' : `depuis le ${formatShort(pace.from)}`;
    trendSay =
      Math.abs(pace.rate) < 0.05
        ? `La tendance est stable ${period}.`
        : `Le rythme est de ${fmtKg(Math.abs(pace.rate))} kg par semaine, ${pace.rate > 0 ? 'à la hausse' : 'à la baisse'}, ${period}.`;
  }

  return (
    <section className="s-card bil-weight" aria-labelledby="bil-poids">
      <div className="bil-head">
        <h2 id="bil-poids">Le poids</h2>
        <span className="s-meta">La tendance est la moyenne des pesées sur sept jours.</span>
      </div>

      {proposal && profile && last && (
        <div className="bil-recalc" role="group" aria-label="Recalcul des objectifs">
          <div className="bil-recalc-body">
            <p className="bil-recalc-title">Le poids a bougé de plus de deux kilos</p>
            <p className="bil-recalc-say">
              La tendance est à {fmtKg(last.avg)} kg, {fmtKg(Math.abs(delta))} kg {delta < 0 ? 'sous le' : 'au-dessus du'} poids retenu pour tes objectifs ({fmtKg(profile.weightKg)} kg). Les nouveaux objectifs proposés sont {fr(proposal.targets.kcal)} kcal et {fr(proposal.targets.protein)} g de protéines par jour.
            </p>
          </div>
          <div className="bil-recalc-actions">
            <button type="button" className="s-btn is-primary is-sm" onClick={recalc}>
              Recalculer les objectifs
            </button>
            <button type="button" className="s-btn is-ghost is-sm" onClick={() => setDismissed(true)}>
              Plus tard
            </button>
          </div>
        </div>
      )}

      {recalcNote && (
        <p className="bil-wsaved" role="status">
          {recalcNote}
        </p>
      )}

      <div className="bil-weight-grid">
        <div>
          {points.length === 0 ? (
            <div className="bil-empty">
              <p className="bil-empty-title">Aucune pesée notée</p>
              <p>La courbe s’ouvre à la première pesée. Le rythme demande deux pesées espacées d’au moins une semaine.</p>
              <button type="button" className="s-btn is-sm" onClick={focusWeight}>
                Noter une pesée
              </button>
            </div>
          ) : (
            <>
              <dl className="bil-facts bil-wfacts">
                <div className="bil-fact">
                  <dt>Tendance</dt>
                  <dd>
                    <b className="num">{fmtKg(last.avg)}</b> <span>kg</span>
                  </dd>
                  <dd className="bil-fact-target">au {formatDayMonth(last.date)}</dd>
                </div>
                <div className="bil-fact">
                  <dt>Par semaine</dt>
                  <dd>
                    <b className="num">{pace === undefined ? '–' : signedKg(pace.rate)}</b>
                    {pace !== undefined && <span> kg</span>}
                  </dd>
                  <dd className="bil-fact-target">
                    {pace === undefined
                      ? 'à venir'
                      : pace.days >= 21 && pace.days <= 35
                        ? 'sur 4 semaines'
                        : `depuis le ${formatShort(pace.from)}`}
                  </dd>
                </div>
                <div className="bil-fact">
                  <dt>Dernière pesée</dt>
                  <dd>
                    <b className="num">{fmtKg(last.kg)}</b> <span>kg</span>
                  </dd>
                  <dd className="bil-fact-target">{capitalize(formatShort(last.date))}</dd>
                </div>
              </dl>

              {points.length >= 2 && <WeightChart points={points} />}
              {trendSay && <p className="bil-wread">{trendSay}</p>}
            </>
          )}
        </div>

        <div>
          <h3 className="bil-form-title">Noter une pesée</h3>
          <form className="bil-wform" onSubmit={save}>
            <label className="bil-field">
              <span>Poids</span>
              <span className="bil-qty">
                <input
                  ref={kgRef}
                  inputMode="decimal"
                  placeholder={last ? fmtKg(last.kg) : '–'}
                  aria-label="Poids en kilogrammes"
                  value={kg}
                  onChange={(e) => {
                    setKg(e.target.value);
                    setError(null);
                    setSaved(null);
                  }}
                  required
                />
                <i>kg</i>
              </span>
            </label>
            <label className="bil-field">
              <span>Date</span>
              <input
                type="date"
                value={date}
                max={today}
                required
                onChange={(e) => {
                  setDate(e.target.value);
                  setSaved(null);
                }}
              />
            </label>
            <button type="submit" className="s-btn is-primary">
              Enregistrer
            </button>
          </form>
          <p className="bil-note">Le matin, à jeun, deux ou trois fois par semaine. La virgule est acceptée.</p>
          {error && (
            <p className="bil-werror" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="bil-wsaved" role="status">
              Pesée du {formatLong(saved)} enregistrée.
            </p>
          )}

          {points.length > 0 && (
            <ul className="bil-wlist">
              {[...points]
                .reverse()
                .slice(0, 5)
                .map((p) => (
                  <li key={p.date}>
                    <span className="bil-wdate">{capitalize(formatShort(p.date))}</span>
                    <span className="bil-wkg num">{fmtKg(p.kg)} kg</span>
                    <span className="bil-wtrend">moyenne {fmtKg(p.avg)}</span>
                    <button
                      type="button"
                      className="bil-wdel"
                      onClick={() => remove(p.date)}
                      aria-label={`Supprimer la pesée du ${formatShort(p.date)}`}
                      title="Supprimer cette pesée"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function WeightChart({ points }: { points: SmoothedPoint[] }) {
  const W = 620;
  const H = 132;
  const pad = 22;
  const first = points[0].date;
  const span = Math.max(1, diffDays(first, points[points.length - 1].date));
  const values = points.flatMap((p) => [p.kg, p.avg]);
  const lo = Math.floor(Math.min(...values) - 0.4);
  const hi = Math.ceil(Math.max(...values) + 0.4);
  const x = (d: ISODate) => pad + (diffDays(first, d) / span) * (W - pad * 2);
  const y = (v: number) => 10 + (1 - (v - lo) / (hi - lo)) * (H - 20);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)}`).join(' ');
  const ticks = [lo, Math.round((lo + hi) / 2), hi].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="bil-wchart">
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Courbe de poids et moyenne sur sept jours">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} className="bil-wgrid" />
            <text x={pad - 5} y={y(t) + 4} textAnchor="end" className="bil-wlabel">
              {t}
            </text>
          </g>
        ))}
        <path d={line} className="bil-wline" />
        {points.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r="3" className="bil-wdot" />
        ))}
        <text x={pad} y={H + 14} className="bil-wlabel">
          {formatDayMonth(first)}
        </text>
        <text x={W - pad} y={H + 14} textAnchor="end" className="bil-wlabel">
          {formatDayMonth(points[points.length - 1].date)}
        </text>
      </svg>
      <p className="bil-wlegend">
        <i className="is-dot" aria-hidden /> pesée <i className="is-line" aria-hidden /> moyenne sur 7 jours
      </p>
    </div>
  );
}
