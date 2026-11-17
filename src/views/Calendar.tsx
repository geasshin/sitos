import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Moon,
  MoreHorizontal,
  PencilLine,
  Plus,
  Refrigerator,
  Rows3,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { useApp } from '../context';
import { addDays, formatLong, formatMonth, formatShort, range, startOfMonth, startOfWeek } from '../domain/dates';
import { entriesOn, mealOf, mealPortion, type Meal } from '../domain/nutrition';
import { closeGaps, markOut, moveBlock, removeEntry, setEaten, setSkipped, swapBlock, toggleDone, unmarkOut } from '../domain/plan';
import { amount } from '../domain/stock';
import type { ISODate, PlanEntry } from '../domain/types';
import { MealComposer, type ComposerTarget } from '../components/MealComposer';
import { Modal } from '../components/Modal';
import { DayBalanceCard } from '../components/Balance';
import { PortionPrompt } from '../components/PortionPrompt';
import { capitalize } from './Today';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
/** Le calendrier défile d'un seul tenant : deux mois en arrière, quatre devant, et tout le plan. */
const WEEKS_BACK = 8;
const WEEKS_AHEAD = 16;
const MAX_WEEKS_BACK = 26;

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
const minDate = (a: ISODate, b: ISODate) => (a < b ? a : b);
const maxDate = (a: ISODate, b: ISODate) => (a > b ? a : b);
const monthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });

type SetEntries = (fn: (e: PlanEntry[]) => PlanEntry[]) => void;
interface ComposerState {
  date: ISODate;
  target?: ComposerTarget;
  sameDay?: boolean;
}

export function CalendarView({ focusDate }: { focusDate?: ISODate }) {
  const app = useApp();
  const { data, today, store, targets } = app;
  const [selected, setSelected] = useState<ISODate>(focusDate ?? today);
  const [visibleMonth, setVisibleMonth] = useState<ISODate>(startOfMonth(focusDate ?? today));
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<ISODate | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const frame = useRef<number | undefined>(undefined);

  const setEntries: SetEntries = (fn) => store.update('plan', (p) => ({ ...p, entries: fn(p.entries) }));

  const planDates = data.plan.entries.map((e) => e.date).sort();
  const firstPlanned = planDates[0] ?? today;
  const lastPlanned = planDates[planDates.length - 1] ?? '';
  const from = startOfWeek(minDate(selected, maxDate(minDate(addDays(today, -7 * WEEKS_BACK), firstPlanned), addDays(today, -7 * MAX_WEEKS_BACK))));
  const to = addDays(startOfWeek(maxDate(selected, maxDate(addDays(today, 7 * WEEKS_AHEAD), addDays(lastPlanned || today, 28)))), 6);
  const weeks = chunk(range(from, to), 7);

  const entriesByDate = new Map<ISODate, PlanEntry[]>();
  for (const e of data.plan.entries) entriesByDate.set(e.date, [...(entriesByDate.get(e.date) ?? []), e]);
  const snackDates = new Set(data.journal.snacks.map((s) => s.date));

  const issues = new Map<ISODate, string[]>();
  for (const s of app.forecast.shortages) {
    issues.set(s.date, [...(issues.get(s.date) ?? []), `Il manquera ${amount(app.foods.get(s.foodId), s.missing)}`]);
  }
  for (const w of app.warnings) {
    if (w.level === 'alerte') issues.set(w.date, [...(issues.get(w.date) ?? []), w.message]);
  }

  const planFrom = data.plan.startDate > today ? data.plan.startDate : today;
  // Un trou, c'est un jour vide AVANT le dernier plat prévu : la fin du plan n'en est pas un.
  const gaps = lastPlanned > planFrom ? range(planFrom, lastPlanned).filter((d) => d < lastPlanned && !entriesByDate.has(d)).length : 0;

  /** Amène une semaine en vue, avec la précédente au-dessus pour garder le contexte. */
  const scrollToDate = useCallback((d: ISODate, behavior: ScrollBehavior = 'smooth') => {
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>(`[data-week="${startOfWeek(d)}"]`);
    if (!box || !row) return;
    const headH = head.current?.offsetHeight ?? 0;
    const prev = row.previousElementSibling as HTMLElement | null;
    const anchor = prev?.dataset.week ? prev : row;
    box.scrollTo({ top: anchor.offsetTop - headH, behavior });
  }, []);

  /** Le mois du titre suit le défilement : celui de la semaine au premier tiers de la vue. */
  const readMonth = useCallback(() => {
    const box = scroller.current;
    if (!box) return;
    const headH = head.current?.offsetHeight ?? 0;
    const probe = box.scrollTop + headH + (box.clientHeight - headH) * 0.33;
    for (const row of box.querySelectorAll<HTMLElement>('[data-week]')) {
      if (row.offsetTop + row.offsetHeight > probe) {
        setVisibleMonth(startOfMonth(addDays(row.dataset.week!, 3)));
        return;
      }
    }
  }, []);

  // À l'ouverture seulement : ensuite, le défilement appartient à la personne.
  useLayoutEffect(() => {
    const place = () => {
      scrollToDate(selected, 'auto');
      readMonth();
    };
    place();
    // Au premier chargement, la mise en page n'est pas toujours finie : on recale à l'image suivante.
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusDate) return;
    setSelected(focusDate);
    scrollToDate(focusDate);
  }, [focusDate, scrollToDate]);

  // Un jour choisi depuis le panneau (flèches) reste visible dans la grille.
  useEffect(() => {
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>(`[data-week="${startOfWeek(selected)}"]`);
    if (!box || !row) return;
    const headH = head.current?.offsetHeight ?? 0;
    const top = row.offsetTop - headH;
    const bottom = row.offsetTop + row.offsetHeight;
    if (top < box.scrollTop) box.scrollTo({ top, behavior: 'smooth' });
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTo({ top: bottom - box.clientHeight, behavior: 'smooth' });
  }, [selected]);

  const onScroll = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(readMonth);
  };

  const goToday = () => {
    setSelected(today);
    scrollToDate(today);
  };

  const openAdd = (d: ISODate) => {
    const meals = (entriesByDate.get(d) ?? []).filter((e) => e.kind !== 'out');
    setComposer({ date: d, sameDay: meals.length > 0 });
  };

  return (
    <div className="page page-wide week-page">
      <header className="week-head">
        <div className="week-headline">
          <h1 className="display-title">Semaine</h1>
          <span className="week-month" aria-live="polite">
            {capitalize(formatMonth(visibleMonth))}
          </span>
        </div>
        <div className="week-head-actions">
          {gaps > 0 && (
            <button type="button" className="text-button is-sm" onClick={() => setEntries((e) => closeGaps(e, planFrom))} title="Supprime les jours vides du plan">
              <Rows3 size={15} aria-hidden /> Resserrer ({gaps} jour{gaps > 1 ? 's' : ''} vide{gaps > 1 ? 's' : ''})
            </button>
          )}
          <button type="button" className="secondary-button is-sm" onClick={goToday}>
            Aujourd’hui
          </button>
        </div>
      </header>

      <div className="week-layout">
        <div className="week-cal" ref={scroller} onScroll={onScroll} role="grid" aria-label="Plan des repas">
          <div className="cal-row cal-head" role="row" ref={head}>
            {WEEKDAYS.map((w) => (
              <div key={w} role="columnheader" className="cal-wd">
                {w}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div className="cal-row" role="row" key={week[0]} data-week={week[0]}>
              {week.map((d, i) => {
                const list = [...(entriesByDate.get(d) ?? [])].sort((a, b) => kindRank(a) - kindRank(b));
                const meals = list.filter((e) => e.kind !== 'out');
                const out = list.some((e) => e.kind === 'out');
                const first = list[0];
                const movable = !!first && !first.done && d >= today;
                const problems = issues.get(d) ?? [];
                const done = meals.length > 0 && meals.every((e) => e.done);
                // Une cuisson et ses restes forment un seul ruban qui traverse les jours.
                const leftover = first?.kind === 'leftover';
                const sameBefore = leftover && i > 0 && (entriesByDate.get(week[i - 1]) ?? []).some((e) => e.kind === 'leftover' && e.batchId === first.batchId);
                const sameAfter = leftover && i < 6 && (entriesByDate.get(week[i + 1]) ?? []).some((e) => e.kind === 'leftover' && e.batchId === first.batchId);
                const idle = list.length === 0;
                const canAdd = d >= today && !out && meals.length < targets.mealsPerDay;
                const cls = [
                  'cal-day',
                  d.slice(0, 7) !== visibleMonth.slice(0, 7) && 'is-outside',
                  d < today && 'is-past',
                  d === today && 'is-today',
                  d === selected && 'is-selected',
                  done && 'is-done',
                  first && `kind-${first.kind}`,
                  leftover && 'is-leftover',
                  sameBefore && 'run-mid',
                  leftover && !sameBefore && sameAfter && 'run-start',
                  leftover && sameBefore && !sameAfter && 'run-end',
                  over === d && dragId && 'is-over',
                  idle && d >= planFrom && d < lastPlanned && 'is-gap',
                ]
                  .filter(Boolean)
                  .join(' ');
                const names = meals.map((e) => mealOf(data, e)?.name ?? 'Repas');
                const sub = meals.length === 1 ? subtitleOf(meals[0], mealOf(data, meals[0])) : null;
                const aria = `${formatLong(d)}${out ? ', dehors' : names.length ? `, ${names.join(', ')}` : ', libre'}`;
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
                      if (ev.target !== ev.currentTarget) return;
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
                      {d.slice(8) === '01' && <span className="cal-month">{monthShort.format(new Date(`${d}T00:00:00Z`)).replace('.', '')}</span>}
                      {done && <Check size={13} className="cal-check" aria-label="mangé" />}
                      {snackDates.has(d) && <Moon size={11} className="cal-evening" aria-label="compléments prévus" />}
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
                    {meals.length > 0 && (
                      <div className={`cal-meals is-${Math.min(meals.length, 3)}`}>
                        {meals.slice(0, 3).map((e, k) => (
                          <div key={e.id} className={`cal-meal ${e.kind === 'leftover' ? 'is-left' : ''}`}>
                            {e.kind === 'leftover' && <Refrigerator size={11} aria-hidden className="cal-left-icon" />}
                            {names[k]}
                          </div>
                        ))}
                      </div>
                    )}
                    {sub && <div className="cal-sub">{sub}</div>}
                    {canAdd && (
                      <button
                        type="button"
                        className="cal-add"
                        aria-label={`Ajouter un plat le ${formatLong(d)}`}
                        title="Ajouter un plat"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelected(d);
                          openAdd(d);
                        }}
                      >
                        <Plus size={14} aria-hidden />
                      </button>
                    )}
                    {movable && <GripVertical size={14} className="cal-grip" aria-hidden />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <DayPanel
          key={selected}
          date={selected}
          issues={[...new Set(issues.get(selected) ?? [])]}
          setEntries={setEntries}
          onSelect={setSelected}
          onAdd={() => openAdd(selected)}
          onEdit={(target) => setComposer({ date: selected, target })}
        />
      </div>

      <Modal
        open={!!composer}
        onClose={() => setComposer(null)}
        title={composer ? `${composer.target ? 'Repas du' : 'Ajouter un repas ·'} ${formatLong(composer.date)}` : 'Repas'}
        size="lg"
      >
        {composer && <MealComposer date={composer.date} target={composer.target} sameDay={composer.sameDay} onClose={() => setComposer(null)} />}
      </Modal>
    </div>
  );
}

const kindRank = (e: PlanEntry) => (e.kind === 'cook' ? 0 : e.kind === 'leftover' ? 1 : 2);

/** Sous-titre d'une case : le nombre de repas d'une cuisson ou « reste », jamais les calories. */
function subtitleOf(entry: PlanEntry, meal: Meal | undefined): string | null {
  if (entry.kind === 'cook') return meal && meal.portions > 1 ? `${meal.portions} repas` : null;
  if (entry.kind === 'leftover') return 'reste';
  return null;
}

function DayPanel({
  date,
  issues,
  setEntries,
  onSelect,
  onAdd,
  onEdit,
}: {
  date: ISODate;
  issues: string[];
  setEntries: SetEntries;
  onSelect: (d: ISODate) => void;
  onAdd: () => void;
  onEdit: (target: ComposerTarget) => void;
}) {
  const app = useApp();
  const { data, today, targets } = app;
  const editable = date >= today;
  const dayEntries = entriesOn(data, date);
  const out = dayEntries.find((e) => e.kind === 'out');
  const meals = dayEntries.filter((e) => e.kind !== 'out');
  const slots = out ? 0 : Math.max(targets.mealsPerDay, meals.length);
  const when = date === today ? 'Aujourd’hui' : date === addDays(today, 1) ? 'Demain' : date === addDays(today, -1) ? 'Hier' : null;

  return (
    <aside className="day-panel week-panel" aria-label={`Détail du ${formatLong(date)}`}>
      <header className="day-panel-head">
        <button type="button" className="icon-button" onClick={() => onSelect(addDays(date, -1))} aria-label="Jour précédent">
          <ChevronLeft size={18} aria-hidden />
        </button>
        <div className="week-panel-title">
          <h2>{capitalize(formatLong(date))}</h2>
          {when && <span className="week-panel-when">{when}</span>}
        </div>
        <button type="button" className="icon-button" onClick={() => onSelect(addDays(date, 1))} aria-label="Jour suivant">
          <ChevronRight size={18} aria-hidden />
        </button>
      </header>

      {issues.length > 0 && (
        <ul className="attention">
          {issues.map((i) => (
            <li key={i}>
              <AlertTriangle size={14} aria-hidden /> {i}
            </li>
          ))}
        </ul>
      )}

      <section className="week-meals" aria-label="Repas du jour">
        {out ? (
          <article className="week-meal is-out">
            <p className="week-meal-kicker">Repas dehors</p>
            <h3 className="week-meal-name">Dehors</h3>
            <p className="hint">La journée ne compte pas dans le bilan.</p>
            {editable && (
              <div className="week-meal-actions">
                <button type="button" className="secondary-button is-sm" onClick={() => setEntries((e) => unmarkOut(e, out.id))}>
                  <X size={14} aria-hidden /> Finalement à la maison
                </button>
              </div>
            )}
          </article>
        ) : (
          Array.from({ length: slots }, (_, i) =>
            meals[i] ? (
              <DayMeal
                key={meals[i].id}
                entry={meals[i]}
                index={i}
                numbered={slots > 1}
                date={date}
                setEntries={setEntries}
                onSelect={onSelect}
                onEdit={onEdit}
              />
            ) : editable ? (
              <button key={`slot-${i}`} type="button" className="week-add" onClick={onAdd}>
                <span className="week-add-plus" aria-hidden>
                  <Plus size={18} strokeWidth={1.8} />
                </span>
                <span className="week-add-text">
                  <span className="week-add-title">{slots > 1 ? `Ajouter le repas ${i + 1}` : 'Choisir le plat du jour'}</span>
                  <span className="week-add-sub">Une recette ou un plat maison</span>
                </span>
              </button>
            ) : i === 0 ? (
              <p key="none" className="muted small">
                Rien de noté ce jour-là.
              </p>
            ) : null,
          )
        )}
        {editable && !out && meals.length === 0 && (
          <button type="button" className="text-button is-sm week-out" onClick={() => setEntries((e) => markOut(e, date))}>
            <Utensils size={14} aria-hidden /> Je mange dehors ce jour-là
          </button>
        )}
      </section>

      {!out && (
        <section className="panel-balance" aria-label="Bilan de la journée">
          <p className="balance-title">Bilan de la journée</p>
          <DayBalanceCard date={date} />
        </section>
      )}
      <SnackList date={date} />
    </aside>
  );
}

function DayMeal({
  entry,
  index,
  numbered,
  date,
  setEntries,
  onSelect,
  onEdit,
}: {
  entry: PlanEntry;
  index: number;
  numbered: boolean;
  date: ISODate;
  setEntries: SetEntries;
  onSelect: (d: ISODate) => void;
  onEdit: (target: ComposerTarget) => void;
}) {
  const app = useApp();
  const { data, today, foods } = app;
  const meal = mealOf(data, entry);
  if (!meal) return null;
  const portion = mealPortion(foods, meal, entry.eaten ?? 1);
  const empty = meal.ingredients.length === 0;
  const editable = date >= today && !entry.done;
  const rests = data.plan.entries.filter((e) => e.kind === 'leftover' && e.batchId === meal.cook.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const kind =
    entry.kind === 'leftover'
      ? `Reste du ${formatShort(meal.cook.date)}`
      : `${meal.recipe ? 'Recette' : 'Plat maison'}${rests.length ? ` · restes jusqu’au ${formatShort(rests[rests.length - 1].date)}` : ''}`;

  const menu: MenuItem[] = [
    ...(meal.recipe ? [{ label: 'Voir la recette', icon: BookOpen, run: () => app.openRecipe(meal.recipe!.id) }] : []),
    ...(entry.kind === 'leftover' ? [{ label: `Aller à la cuisson du ${formatShort(meal.cook.date)}`, icon: ArrowRight, run: () => onSelect(meal.cook.date) }] : []),
    ...(editable
      ? [
          { label: 'Échanger avec le plat d’avant', icon: ArrowLeft, run: () => setEntries((e) => swapBlock(e, entry.id, -1, today)) },
          { label: 'Échanger avec le plat suivant', icon: ArrowRight, run: () => setEntries((e) => swapBlock(e, entry.id, 1, today)) },
          ...(index === 0 ? [{ label: 'Je mange dehors ce jour-là', icon: Utensils, run: () => setEntries((e) => markOut(e, date)) }] : []),
          {
            label: entry.kind === 'cook' && rests.length ? 'Retirer, avec ses restes' : 'Retirer du plan',
            icon: Trash2,
            danger: true,
            run: () => setEntries((e) => removeEntry(e, entry.id)),
          },
        ]
      : []),
  ];

  return (
    <article className={`week-meal ${entry.done ? 'is-done' : ''}`}>
      <div className="week-meal-top">
        <p className="week-meal-kicker">
          {numbered && <span className="week-meal-index num">Repas {index + 1}</span>}
          {entry.kind === 'leftover' && <Refrigerator size={12} aria-hidden />}
          {kind}
        </p>
        {menu.length > 0 && <MoreMenu items={menu} label={`Autres actions pour ${meal.name}`} />}
      </div>
      <h3 className="week-meal-name">{meal.name}</h3>
      <p className="week-meal-facts num">
        {empty ? (
          'Ingrédients à compléter pour compter ce repas'
        ) : (
          <>
            <b>{fr(portion.nutrients.kcal)}</b> kcal · <b>{fr(portion.nutrients.protein)}</b> g prot. · <b>{fr(portion.nutrients.fiber)}</b> g fibres
          </>
        )}
      </p>
      <div className="week-meal-actions">
        <button type="button" className="secondary-button is-sm" onClick={() => onEdit({ cookId: meal.cook.id, entryId: entry.id })}>
          <PencilLine size={14} aria-hidden /> {empty ? 'Ajouter les ingrédients' : 'Modifier le repas'}
        </button>
        <EatAction entry={entry} date={date} empty={empty} setEntries={setEntries} />
      </div>
      <PortionPrompt entry={entry} onPick={(k) => setEntries((e) => setEaten(e, entry.id, k))} />
      {date < today && !entry.done && !entry.skipped && <p className="hint">Tant qu’il n’est pas coché, ce repas ne sort rien du stock.</p>}
    </article>
  );
}

/** Une seule action pour dire ce qui a été mangé ; rien avant le jour venu. */
function EatAction({ entry, date, empty, setEntries }: { entry: PlanEntry; date: ISODate; empty: boolean; setEntries: SetEntries }) {
  const { today } = useApp();
  if (date > today) return null;
  const toggle = () => setEntries((e) => toggleDone(e, entry.id));
  if (entry.done) {
    return (
      <span className="week-eat">
        <span className="meal-state is-done">
          <Check size={13} aria-hidden /> Mangé
        </span>
        <button type="button" className="text-button is-sm" onClick={toggle} title="Le stock remonte">
          Je n’ai pas mangé
        </button>
      </span>
    );
  }
  if (entry.skipped) {
    return (
      <span className="week-eat">
        <span className="meal-state">Pas mangé</span>
        <button type="button" className="text-button is-sm" onClick={toggle}>
          Finalement mangé
        </button>
      </span>
    );
  }
  return (
    <span className="week-eat">
      {date < today && (
        <button type="button" className="text-button is-sm" onClick={() => setEntries((e) => setSkipped(e, entry.id))} title="Ne sort rien du stock et ne redemande plus">
          Pas mangé
        </button>
      )}
      <button type="button" className="primary-button is-sm" onClick={toggle} disabled={empty} title="Ses ingrédients sortent du stock">
        <Check size={14} aria-hidden /> {date < today ? 'Mangé' : 'J’ai mangé'}
      </button>
    </span>
  );
}

interface MenuItem {
  label: string;
  icon: typeof Check;
  run: () => void;
  danger?: boolean;
}

/** Les actions rares d'un repas, rangées derrière « … » : la carte ne garde que l'essentiel. */
function MoreMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (ev: MouseEvent) => {
      if (!root.current?.contains(ev.target as Node)) setOpen(false);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="more-menu" ref={root}>
      <button type="button" className="icon-button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={17} aria-hidden />
      </button>
      {open && (
        <div className="more-menu-list" role="menu">
          {items.map(({ label: l, icon: Icon, run, danger }) => (
            <button
              key={l}
              type="button"
              role="menuitem"
              className={`more-menu-item ${danger ? 'danger' : ''}`}
              onClick={() => {
                setOpen(false);
                run();
              }}
            >
              <Icon size={15} aria-hidden /> {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Les compléments notés ou prévus ce jour-là, seulement s'il y en a. */
function SnackList({ date }: { date: ISODate }) {
  const { data, store, today } = useApp();
  const items = data.journal.snacks.filter((s) => s.date === date);
  if (items.length === 0) return null;
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
