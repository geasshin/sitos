import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Moon,
  Plus,
  Refrigerator,
  Repeat,
  Rows3,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { useApp } from '../context';
import { addDays, formatDayMonth, formatLong, formatShort, range, startOfWeek } from '../domain/dates';
import { dayNutrition, entriesOn, mealOf, type Meal } from '../domain/nutrition';
import {
  addCustomOn,
  addMealOn,
  closeGaps,
  markOut,
  moveBlock,
  planCustom,
  planRecipe,
  removeEntry,
  setEaten,
  setSkipped,
  swapBlock,
  toggleDone,
  unmarkOut,
} from '../domain/plan';
import { amount } from '../domain/stock';
import type { ISODate, PlanEntry } from '../domain/types';
import { MealPlanner } from '../components/MealPlanner';
import { MealEditor } from '../components/MealEditor';
import { DayBalanceCard } from '../components/Balance';
import { PortionPrompt } from '../components/PortionPrompt';
import { capitalize } from './Today';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const SPAN = 14;

export function CalendarView({ focusDate }: { focusDate?: ISODate }) {
  const app = useApp();
  const { data, today, store } = app;
  const [anchor, setAnchor] = useState<ISODate>(startOfWeek(focusDate ?? today));
  const [selected, setSelected] = useState<ISODate>(focusDate ?? today);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<ISODate | null>(null);
  useEffect(() => {
    if (!focusDate) return;
    setSelected(focusDate);
    setAnchor(startOfWeek(focusDate));
  }, [focusDate]);

  const setEntries = (fn: (e: PlanEntry[]) => PlanEntry[]) => store.update('plan', (p) => ({ ...p, entries: fn(p.entries) }));
  const days = range(anchor, addDays(anchor, SPAN - 1));
  const entriesByDate = new Map<ISODate, PlanEntry[]>();
  for (const e of data.plan.entries) entriesByDate.set(e.date, [...(entriesByDate.get(e.date) ?? []), e]);
  const eveningDates = new Set(data.journal.snacks.map((s) => s.date));

  const issues = new Map<ISODate, string[]>();
  for (const s of app.forecast.shortages) {
    issues.set(s.date, [...(issues.get(s.date) ?? []), `Il manquera ${amount(app.foods.get(s.foodId), s.missing)}`]);
  }
  for (const w of app.warnings) {
    if (w.level === 'alerte') issues.set(w.date, [...(issues.get(w.date) ?? []), w.message]);
  }

  const planFrom = data.plan.startDate > today ? data.plan.startDate : today;
  // Un trou, c'est un jour vide AVANT le dernier plat prévu : la fin du plan n'en est pas un.
  const lastPlanned = data.plan.entries.reduce((m, e) => (e.date > m ? e.date : m), '');
  const gaps = days.filter((d) => d >= planFrom && d < lastPlanned && !entriesByDate.has(d)).length;
  const label = `${formatDayMonth(anchor)} – ${formatDayMonth(addDays(anchor, SPAN - 1))}`;
  const thisWeek = startOfWeek(today);

  return (
    <div className="page page-wide">
      <header className="page-head page-head-row">
        <div>
          <h1 className="display-title">Semaine</h1>
          <p className="page-subtitle">Glisse un plat pour le déplacer avec ses restes.</p>
        </div>
        <div className="week-nav" role="group" aria-label="Semaines">
          <button type="button" className="icon-button" onClick={() => setAnchor(addDays(anchor, -7))} aria-label="Deux semaines plus tôt">
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span className="week-label">{label}</span>
          <button type="button" className="icon-button" onClick={() => setAnchor(addDays(anchor, 7))} aria-label="Deux semaines plus tard">
            <ChevronRight size={18} aria-hidden />
          </button>
          {anchor !== thisWeek && (
            <button type="button" className="text-button is-sm" onClick={() => { setAnchor(thisWeek); setSelected(today); }}>
              Aujourd’hui
            </button>
          )}
          {gaps > 0 && (
            <button type="button" className="secondary-button is-sm" onClick={() => setEntries((e) => closeGaps(e, planFrom))} title="Supprime les jours vides du plan">
              <Rows3 size={15} aria-hidden /> Resserrer ({gaps} jour{gaps > 1 ? 's' : ''} vide{gaps > 1 ? 's' : ''})
            </button>
          )}
        </div>
      </header>

      <div className="cal-layout">
        <div className="cal" role="grid" aria-label="Plan des repas">
          <div className="cal-row cal-head" role="row">
            {WEEKDAYS.map((w) => (
              <div key={w} role="columnheader" className="cal-wd">{w}</div>
            ))}
          </div>
          {chunk(days, 7).map((week, wi) => (
            <div className="cal-row" role="row" key={week[0]}>
              {week.map((d, i) => {
                const list = [...(entriesByDate.get(d) ?? [])].sort((a, b) => (a.kind === 'cook' ? -1 : b.kind === 'cook' ? 1 : 0));
                const first = list[0];
                const meal = mealOf(data, first);
                const extra = list.length - 1;
                const movable = !!first && !first.done && d >= today;
                const problems = issues.get(d) ?? [];
                const out = first?.kind === 'out';
                // Une cuisson et ses restes forment un seul ruban qui traverse les jours.
                const leftover = first?.kind === 'leftover';
                const sameBefore = leftover && i > 0 && (entriesByDate.get(week[i - 1]) ?? []).some((e) => e.kind === 'leftover' && e.batchId === first.batchId);
                const sameAfter = leftover && i < week.length - 1 && (entriesByDate.get(week[i + 1]) ?? []).some((e) => e.kind === 'leftover' && e.batchId === first.batchId);
                const idle = !first;
                const cls = [
                  'cal-day',
                  d < today && 'is-past',
                  d === today && 'is-today',
                  d === selected && 'is-selected',
                  first?.done && 'is-done',
                  first && `kind-${first.kind}`,
                  leftover && 'is-leftover',
                  sameBefore && 'run-mid',
                  leftover && !sameBefore && sameAfter && 'run-start',
                  leftover && sameBefore && !sameAfter && 'run-end',
                  over === d && dragId && 'is-over',
                  idle && d >= planFrom && d < lastPlanned && 'is-gap',
                  idle && d >= today && 'is-free',
                ]
                  .filter(Boolean)
                  .join(' ');
                const aria = `${formatLong(d)}${meal ? `, ${meal.name}` : out ? ', dehors' : ', libre'}${extra > 0 ? `, ${extra} autre${extra > 1 ? 's' : ''} repas` : ''}`;
                return (
                  <div
                    key={d}
                    role="gridcell"
                    className={cls}
                    tabIndex={0}
                    aria-selected={d === selected}
                    aria-label={aria}
                    onClick={() => setSelected(d)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        setSelected(d);
                      }
                    }}
                    draggable={movable}
                    onDragStart={(ev) => {
                      if (!first) return;
                      setDragId(first.id);
                      ev.dataTransfer.effectAllowed = 'move';
                      ev.dataTransfer.setData('text/plain', first.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                    onDragOver={(ev) => {
                      if (!dragId || d < today) return;
                      ev.preventDefault();
                      setOver(d);
                    }}
                    onDragLeave={() => setOver((o) => (o === d ? null : o))}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      const id = ev.dataTransfer.getData('text/plain') || dragId;
                      if (id && d >= today) {
                        setEntries((all) => moveBlock(all, id, d));
                        setSelected(d);
                      }
                      setDragId(null);
                      setOver(null);
                    }}
                  >
                    <div className="cal-date">
                      <span className="num">{Number(d.slice(8))}</span>
                      {(d.slice(8) === '01' || (wi === 0 && i === 0)) && <span className="cal-month">{formatDayMonth(d).split(' ')[1]}</span>}
                      {first?.done && <Check size={13} className="cal-check" aria-label="fait" />}
                      {eveningDates.has(d) && <Moon size={11} className="cal-evening" aria-label="à-côté prévu le soir" />}
                      {problems.length > 0 && (
                        <span className="cal-alert" title={problems.join('\n')}>
                          <AlertTriangle size={12} aria-label={problems.join(' ; ')} />
                        </span>
                      )}
                    </div>
                    {out && (
                      <div className="cal-meal">
                        <Utensils size={13} aria-hidden /> Dehors
                      </div>
                    )}
                    {meal && (
                      <div className={`cal-meal ${leftover ? 'is-left' : ''}`}>
                        {leftover && <Refrigerator size={11} aria-hidden className="cal-left-icon" />}
                        {meal.name}
                      </div>
                    )}
                    {extra > 0 && <span className="cal-more">+{extra}</span>}
                    {subtitleOf(entryKindOf(first), meal) && <div className="cal-sub">{subtitleOf(entryKindOf(first), meal)}</div>}
                    {movable && <GripVertical size={14} className="cal-grip" aria-hidden />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <DayPanel key={selected} date={selected} issues={[...new Set(issues.get(selected) ?? [])]} setEntries={setEntries} onSelect={setSelected} />
      </div>

      <WeekSummary days={days} />
    </div>
  );
}

const entryKindOf = (e: PlanEntry | undefined) => (e?.kind === 'cook' ? 'cook' : e?.kind === 'leftover' ? 'leftover' : undefined);

/** Sous-titre d'une case : le nombre de repas ou « reste », jamais les calories. */
function subtitleOf(kind: 'cook' | 'leftover' | undefined, meal: Meal | undefined): string | null {
  if (kind === 'cook') return meal && meal.portions > 1 ? `${meal.portions} repas` : null;
  if (kind === 'leftover') return 'reste';
  return null;
}

/** Ligne de fin de quinzaine : ce que ça donne, ce qui reste à remplir, ce qui va se perdre. */
function WeekSummary({ days }: { days: ISODate[] }) {
  const app = useApp();
  const { data, today } = app;
  const planned = days.map((d) => dayNutrition(data, app.foods, d)).filter((d) => d.meals.length > 0);
  const empties = days.filter((d) => d >= today && !data.plan.entries.some((e) => e.date === d)).length;
  const losses = app.forecast.losses.filter((l) => l.expiry >= days[0] && l.expiry <= days[days.length - 1]);
  const avgKcal = planned.length ? planned.reduce((s, d) => s + d.total.kcal, 0) / planned.length : 0;
  const avgProtein = planned.length ? planned.reduce((s, d) => s + d.total.protein, 0) / planned.length : 0;
  const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
  return (
    <div className="week-summary">
      <div>
        <p className="balance-sub">Ces deux semaines</p>
        <p>
          {planned.length} jour{planned.length > 1 ? 's' : ''} prévu{planned.length > 1 ? 's' : ''}
          {planned.length > 0 && (
            <>
              {' · '}
              <span className="num">{fr(avgKcal)}</span> kcal et <span className="num">{fr(avgProtein)}</span> g de protéines par jour en moyenne
            </>
          )}
        </p>
      </div>
      <div>
        <p className="balance-sub">Reste à remplir</p>
        <p>{empties === 0 ? 'Aucun jour vide.' : `${empties} jour${empties > 1 ? 's' : ''} sans repas.`}</p>
      </div>
      <div>
        <p className="balance-sub">Risque de perte</p>
        <p>
          {losses.length === 0 ? (
            'Rien ne se perd.'
          ) : (
            <>
              {losses.length} produit{losses.length > 1 ? 's' : ''} :{' '}
              {losses
                .slice(0, 3)
                .map((l) => app.foods.get(l.foodId)?.name ?? l.foodId)
                .join(', ')}
              {losses.length > 3 && ` et ${losses.length - 3} autre${losses.length - 3 > 1 ? 's' : ''}`}
              {' · '}
              <button type="button" className="link small" onClick={() => app.goTo('stock')}>
                voir le stock
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function DayPanel({
  date,
  issues,
  setEntries,
  onSelect,
}: {
  date: ISODate;
  issues: string[];
  setEntries: (fn: (e: PlanEntry[]) => PlanEntry[]) => void;
  onSelect: (d: ISODate) => void;
}) {
  const app = useApp();
  const { data, today } = app;
  const [tab, setTab] = useState<'repas' | 'bilan'>('repas');
  const [replacing, setReplacing] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const [adding, setAdding] = useState(false);
  const editable = date >= today;
  const dayEntries = entriesOn(data, date);
  const entry = dayEntries[0];
  const others = dayEntries.slice(1);
  const meals = app.targets.mealsPerDay;
  const canAddMeal = editable && dayEntries.filter((e) => e.kind !== 'out').length < meals;
  const meal = mealOf(data, entry);
  const rests = meal ? data.plan.entries.filter((e) => e.kind === 'leftover' && e.batchId === meal.cook.id).sort((a, b) => (a.date < b.date ? -1 : 1)) : [];
  const age = meal ? Math.max(0, Math.round((Date.parse(date) - Date.parse(meal.cook.date)) / 86400000)) : 0;

  return (
    <aside className="day-panel" aria-label={`Détail du ${formatLong(date)}`}>
      <header className="day-panel-head">
        <button type="button" className="icon-button" onClick={() => onSelect(addDays(date, -1))} aria-label="Jour précédent">
          <ChevronLeft size={18} aria-hidden />
        </button>
        <h2>{capitalize(formatLong(date))}</h2>
        <button type="button" className="icon-button" onClick={() => onSelect(addDays(date, 1))} aria-label="Jour suivant">
          <ChevronRight size={18} aria-hidden />
        </button>
      </header>

      <div className="seg-group panel-tabs" role="tablist" aria-label="Vue du jour">
        <button type="button" role="tab" aria-selected={tab === 'repas'} className={`seg-pill ${tab === 'repas' ? 'on' : ''}`} onClick={() => setTab('repas')}>
          Repas
        </button>
        <button type="button" role="tab" aria-selected={tab === 'bilan'} className={`seg-pill ${tab === 'bilan' ? 'on' : ''}`} onClick={() => setTab('bilan')}>
          Bilan
        </button>
      </div>

      {issues.length > 0 && (
        <ul className="attention">
          {issues.map((i) => (
            <li key={i}>
              <AlertTriangle size={14} aria-hidden /> {i}
            </li>
          ))}
        </ul>
      )}

      {tab === 'bilan' ? (
        <>
          <EveningList date={date} />
          <section className="panel-balance" aria-label="Bilan de la journée">
            <p className="balance-title">Bilan de la journée</p>
            <DayBalanceCard date={date} />
          </section>
        </>
      ) : (
        <>
          {others.length > 0 && (
            <div>
              <p className="balance-sub">Aussi ce jour-là</p>
              <ul className="picks">
                {others.map((o) => {
                  const om = mealOf(data, o);
                  return (
                    <li key={o.id} className="pick-row">
                      <span className="pick-label">
                        {o.kind === 'out' ? (
                          <>
                            <Utensils size={13} aria-hidden /> Dehors
                          </>
                        ) : (
                          <>
                            {om?.name ?? 'Repas'}
                            {o.done ? ' · mangé' : ''}
                          </>
                        )}
                      </span>
                      <span className="pick-actions">
                        {o.kind !== 'out' && (
                          <button
                            type="button"
                            className={o.done ? 'icon-button is-done' : 'icon-button'}
                            aria-label={o.done ? 'Décocher' : 'Marquer mangé'}
                            aria-pressed={!!o.done}
                            onClick={() => setEntries((e) => toggleDone(e, o.id))}
                            disabled={date > today}
                          >
                            <Check size={14} aria-hidden />
                          </button>
                        )}
                        <button type="button" className="icon-button" aria-label="Retirer ce repas" onClick={() => setEntries((e) => removeEntry(e, o.id))} disabled={!editable}>
                          <X size={14} aria-hidden />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {canAddMeal && !adding && (
            <button type="button" className="secondary-button is-sm" onClick={() => setAdding(true)}>
              <Plus size={15} aria-hidden /> Ajouter un repas ce jour-là
            </button>
          )}
          {adding && (
            <MealPlanner
              submitLabel="Ajouter"
              date={date}
              onRecipe={(r) => {
                setEntries((e) => addMealOn(e, date, r));
                setAdding(false);
              }}
              onCustom={(t) => {
                setEntries((e) => addCustomOn(e, date, t));
                setAdding(false);
              }}
            />
          )}

          {!entry &&
            (editable ? (
              <>
                <MealPlanner submitLabel="Planifier" date={date} onRecipe={(r, n) => setEntries((e) => planRecipe(e, date, r, n))} onCustom={(t, n) => setEntries((e) => planCustom(e, date, t, n))} />
                <button type="button" className="text-button" onClick={() => setEntries((e) => markOut(e, date))}>
                  <Utensils size={15} aria-hidden /> Je mange dehors ce jour-là
                </button>
              </>
            ) : (
              <p className="muted">Rien de noté.</p>
            ))}

          {entry?.kind === 'out' && (
            <>
              <p className="panel-title">Repas dehors</p>
              {editable && (
                <button type="button" className="secondary-button" onClick={() => setEntries((e) => unmarkOut(e, entry.id))}>
                  <X size={15} aria-hidden /> Finalement à la maison
                </button>
              )}
            </>
          )}

          {entry && meal && (
            <>
              <div>
                {others.length > 0 && <p className="balance-sub">Repas principal</p>}
                <p className="panel-title">{meal.name}</p>
                <p className="muted small">
                  {entry.kind === 'cook'
                    ? rests.length
                      ? `Cuisson, restes jusqu’au ${formatShort(rests[rests.length - 1].date)}`
                      : 'Cuisson du jour'
                    : `Reste du ${formatShort(meal.cook.date)} · J+${age} sur ${meal.fridgeDays}`}
                </p>
              </div>

              <div className="panel-actions">
                <button
                  type="button"
                  className={entry.done ? 'done-button' : 'primary-button'}
                  aria-pressed={!!entry.done}
                  onClick={() => setEntries((e) => toggleDone(e, entry.id))}
                  disabled={date > today}
                  title={entry.done ? 'Décocher : le stock remonte' : 'Cocher sort les ingrédients du stock'}
                >
                  <Check size={15} aria-hidden /> {entry.done ? 'Fait' : entry.kind === 'cook' ? 'C’est fait' : 'Mangé'}
                </button>
                {date < today && !entry.done && !entry.skipped && (
                  <button type="button" className="text-button is-sm" onClick={() => setEntries((e) => setSkipped(e, entry.id))} title="Ne sort rien du stock et ne redemande plus">
                    Pas mangé
                  </button>
                )}
                {entry.kind === 'cook' && (
                  <button type="button" className="secondary-button" onClick={() => setShowIngredients((v) => !v)} aria-expanded={showIngredients}>
                    Ingrédients <span className="num muted">{meal.ingredients.length}</span>
                    <ChevronDown size={15} className={`chev ${showIngredients ? 'up' : ''}`} aria-hidden />
                  </button>
                )}
                {meal.recipe && (
                  <button type="button" className="secondary-button" onClick={() => app.openRecipe(meal.recipe!.id)}>
                    <BookOpen size={15} aria-hidden /> Recette
                  </button>
                )}
              </div>

              <PortionPrompt entry={entry} onPick={(k) => setEntries((e) => setEaten(e, entry.id, k))} />
              {date < today && !entry.done && !entry.skipped && <p className="hint">Tant qu’il n’est pas coché, ce repas ne sort rien du stock.</p>}

              {entry.kind === 'cook' ? (
                showIngredients && <MealEditor cook={entry} editable={!entry.done} />
              ) : (
                <button type="button" className="text-button" onClick={() => onSelect(meal.cook.date)}>
                  Voir la cuisson du {formatShort(meal.cook.date)} <ArrowRight size={14} aria-hidden />
                </button>
              )}

              {editable && !entry.done && (
                <div className="panel-tools" role="group" aria-label="Organiser">
                  <button type="button" className="tool" onClick={() => setEntries((e) => swapBlock(e, entry.id, -1, today))} title="Échanger avec le plat d’avant">
                    <ArrowLeft size={15} aria-hidden /> Plus tôt
                  </button>
                  <button type="button" className="tool" onClick={() => setEntries((e) => swapBlock(e, entry.id, 1, today))} title="Échanger avec le plat suivant">
                    Plus tard <ArrowRight size={15} aria-hidden />
                  </button>
                  <button type="button" className="tool" onClick={() => setEntries((e) => markOut(e, date))} title="La suite glisse d’un jour">
                    <Utensils size={15} aria-hidden /> Dehors
                  </button>
                  {entry.kind === 'cook' && (
                    <button type="button" className={`tool ${replacing ? 'on' : ''}`} onClick={() => setReplacing((v) => !v)} aria-expanded={replacing}>
                      <Repeat size={15} aria-hidden /> Changer
                    </button>
                  )}
                  <button type="button" className="tool danger" onClick={() => setEntries((e) => removeEntry(e, entry.id))} title={entry.kind === 'cook' && rests.length ? 'Retire aussi ses restes' : 'Retirer'}>
                    <Trash2 size={15} aria-hidden /> Retirer
                  </button>
                </div>
              )}
              {replacing && entry.kind === 'cook' && (
                <MealPlanner
                  submitLabel="Remplacer"
                  date={date}
                  onRecipe={(r, n) => {
                    setEntries((e) => planRecipe(removeEntry(e, entry.id), date, r, n));
                    setReplacing(false);
                  }}
                  onCustom={(t, n) => {
                    setEntries((e) => planCustom(removeEntry(e, entry.id), date, t, n));
                    setReplacing(false);
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Ce qui est noté ou prévu pour le soir de ce jour-là. */
function EveningList({ date }: { date: ISODate }) {
  const { data, store, today } = useApp();
  const items = data.journal.snacks.filter((s) => s.date === date);
  if (items.length === 0) return <p className="hint">Aucun complément pour l’instant.</p>;
  return (
    <div className="evening">
      <p className="balance-sub">{date > today ? 'Compléments prévus' : 'Compléments'}</p>
      <ul className="picks">
        {items.map((s) => (
          <li key={s.id} className="pick-row">
            <span className="pick-label">{s.label}</span>
            <button
              type="button"
              className="icon-button"
              aria-label={`Retirer ${s.label}`}
              onClick={() => store.update('journal', (j) => ({ ...j, snacks: j.snacks.filter((x) => x.id !== s.id) }))}
            >
              <X size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
