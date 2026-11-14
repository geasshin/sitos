import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CookingPot, GripVertical, Moon, Refrigerator, Repeat, Rows3, Trash2, Utensils, X } from 'lucide-react';
import { useApp } from '../context';
import { addDays, diffDays, formatDayMonth, formatLong, formatShort, range, startOfWeek } from '../domain/dates';
import { mealOf, mealPortion } from '../domain/nutrition';
import { closeGaps, markOut, moveBlock, planCustom, planRecipe, removeEntry, swapBlock, toggleDone, unmarkOut } from '../domain/plan';
import { amount } from '../domain/stock';
import type { ISODate, PlanEntry } from '../domain/types';
import { MealPlanner } from '../components/MealPlanner';
import { MealEditor } from '../components/MealEditor';
import { DayBalanceCard } from '../components/Balance';
import { capitalize } from './Today';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function CalendarView({ focusDate }: { focusDate?: ISODate }) {
  const app = useApp();
  const { data, today, store } = app;
  const [selected, setSelected] = useState<ISODate>(focusDate ?? today);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<ISODate | null>(null);
  useEffect(() => {
    if (focusDate) setSelected(focusDate);
  }, [focusDate]);

  const setEntries = (fn: (e: PlanEntry[]) => PlanEntry[]) => store.update('plan', (p) => ({ ...p, entries: fn(p.entries) }));
  const first = startOfWeek(data.plan.startDate < today ? data.plan.startDate : today);
  const last = addDays(startOfWeek(addDays(app.planEnd, 7)), 6);
  const days = range(first, last);
  const byDate = new Map(data.plan.entries.map((e) => [e.date, e]));
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
  const gaps = days.filter((d) => d >= planFrom && d < lastPlanned && !byDate.has(d)).length;

  return (
    <div className="page page-wide">
      <header className="page-head page-head-row">
        <div>
          <h1 className="display-title">Calendrier</h1>
          <p className="page-subtitle">Glisse un plat pour le déplacer avec ses restes.</p>
        </div>
        {gaps > 0 && (
          <button type="button" className="secondary-button" onClick={() => setEntries((e) => closeGaps(e, planFrom))} title="Supprime les jours vides du plan">
            <Rows3 size={15} aria-hidden /> Resserrer ({gaps} jour{gaps > 1 ? 's' : ''} vide{gaps > 1 ? 's' : ''})
          </button>
        )}
      </header>

      <div className="cal-layout">
        <div className="cal" role="grid" aria-label="Plan des repas">
          <div className="cal-row cal-head" role="row">
            {WEEKDAYS.map((w) => (
              <div key={w} role="columnheader" className="cal-wd">{w}</div>
            ))}
          </div>
          {chunk(days, 7).map((week) => (
            <div className="cal-row" role="row" key={week[0]}>
              {week.map((d) => {
                const e = byDate.get(d);
                const meal = mealOf(data, e);
                const movable = !!e && !e.done && d >= today;
                const problems = issues.get(d) ?? [];
                const kcal = meal && meal.ingredients.length ? mealPortion(app.foods, meal).nutrients.kcal : undefined;
                const cls = [
                  'cal-day',
                  d < today && 'is-past',
                  d === today && 'is-today',
                  d === selected && 'is-selected',
                  e?.done && 'is-done',
                  e && `kind-${e.kind}`,
                  over === d && dragId && 'is-over',
                  !e && d >= planFrom && d < lastPlanned && 'is-gap',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div
                    key={d}
                    role="gridcell"
                    className={cls}
                    tabIndex={0}
                    aria-selected={d === selected}
                    aria-label={`${formatLong(d)}${meal ? `, ${meal.name}` : e?.kind === 'out' ? ', dehors' : ', libre'}`}
                    onClick={() => setSelected(d)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        setSelected(d);
                      }
                    }}
                    draggable={movable}
                    onDragStart={(ev) => {
                      if (!e) return;
                      setDragId(e.id);
                      ev.dataTransfer.effectAllowed = 'move';
                      ev.dataTransfer.setData('text/plain', e.id);
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
                      {(d.slice(8) === '01' || d === first) && <span className="cal-month">{formatDayMonth(d).split(' ')[1]}</span>}
                      {e?.done && <Check size={13} className="cal-check" aria-label="fait" />}
                      {problems.length > 0 && (
                        <span className="cal-alert" title={problems.join('\n')}>
                          <AlertTriangle size={13} aria-label={problems.join(' ; ')} />
                        </span>
                      )}
                    </div>
                    {e?.kind === 'out' && <div className="cal-meal"><Utensils size={13} aria-hidden /> Dehors</div>}
                    {meal && (
                      <>
                        <div className="cal-meal">{meal.name}</div>
                        <div className="cal-sub">
                          {e?.kind === 'cook' ? (
                            <span className="cal-kind" title={`Cuisson pour ${meal.portions} repas`}>
                              <CookingPot size={12} aria-hidden /> {meal.portions > 1 ? `×${meal.portions}` : ''}
                            </span>
                          ) : (
                            <span className="cal-kind"><Refrigerator size={12} aria-hidden /> reste</span>
                          )}
                          {kcal !== undefined && <span className="num" title="kcal par repas">{Math.round(kcal)}</span>}
                          {eveningDates.has(d) && <Moon size={11} className="cal-evening" aria-label="à-côté prévu le soir" />}
                        </div>
                      </>
                    )}
                    {movable && <GripVertical size={14} className="cal-grip" aria-hidden />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <DayPanel key={selected} date={selected} issues={issues.get(selected) ?? []} setEntries={setEntries} onSelect={setSelected} />
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
  const [replacing, setReplacing] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const entry = data.plan.entries.find((e) => e.date === date);
  const meal = mealOf(data, entry);
  const editable = date >= today;
  const rests = meal ? data.plan.entries.filter((e) => e.kind === 'leftover' && e.batchId === meal.cook.id).sort((a, b) => (a.date < b.date ? -1 : 1)) : [];

  return (
    <aside className="day-panel" aria-label={`Détail du ${formatLong(date)}`}>
      <header className="day-panel-head">
        <button type="button" className="icon-button" onClick={() => onSelect(addDays(date, -1))} aria-label="Jour précédent"><ChevronLeft size={18} aria-hidden /></button>
        <h2>{capitalize(formatLong(date))}</h2>
        <button type="button" className="icon-button" onClick={() => onSelect(addDays(date, 1))} aria-label="Jour suivant"><ChevronRight size={18} aria-hidden /></button>
      </header>

      {issues.length > 0 && (
        <ul className="attention">
          {issues.map((i) => (
            <li key={i}><AlertTriangle size={14} aria-hidden /> {i}</li>
          ))}
        </ul>
      )}

      {!entry &&
        (editable ? (
          <>
            <MealPlanner
              submitLabel="Planifier"
              onRecipe={(r, n) => setEntries((e) => planRecipe(e, date, r, n))}
              onCustom={(t, n) => setEntries((e) => planCustom(e, date, t, n))}
            />
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
            <p className="panel-title">{meal.name}</p>
            <p className="muted small">
              {entry.kind === 'cook'
                ? rests.length
                  ? `Cuisson, restes jusqu’au ${formatShort(rests[rests.length - 1].date)}`
                  : 'Cuisson du jour'
                : `Reste du ${formatShort(meal.cook.date)} · J+${diffDays(meal.cook.date, date)} sur ${meal.fridgeDays}`}
            </p>
          </div>

          <div className="panel-actions">
            <button type="button" className={entry.done ? 'done-button' : 'primary-button'} aria-pressed={!!entry.done} onClick={() => setEntries((e) => toggleDone(e, entry.id))} disabled={date > today}>
              <Check size={15} aria-hidden /> {entry.done ? 'Fait' : entry.kind === 'cook' ? 'C’est fait' : 'Mangé'}
            </button>
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

          {entry.kind === 'cook' ? (
            showIngredients && <MealEditor cook={entry} editable={!entry.done} />
          ) : (
            <button type="button" className="text-button" onClick={() => onSelect(meal.cook.date)}>
              Voir la cuisson du {formatShort(meal.cook.date)} <ArrowRight size={14} aria-hidden />
            </button>
          )}

          <EveningList date={date} />

          <section className="panel-balance" aria-label="Bilan de la journée">
            <p className="balance-title">Bilan de la journée</p>
            <DayBalanceCard date={date} />
          </section>

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
  if (items.length === 0) return null;
  return (
    <div className="evening">
      <p className="balance-sub">{date > today ? 'Prévu le soir' : 'Le soir'}</p>
      <ul className="picks">
        {items.map((s) => (
          <li key={s.id} className="pick-row">
            <span className="pick-label">
              <Moon size={13} aria-hidden /> {s.label}
            </span>
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
