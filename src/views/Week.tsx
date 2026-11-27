import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  Check,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  Clock,
  GripVertical,
  Minus,
  Plus,
  Sparkles,
  Utensils,
} from 'lucide-react';
import { useApp } from '../context';
import { Cover } from '../components/recipe';
import { MealComposer } from '../components/MealComposer';
import { Complements } from '../components/Complements';
import { Sheet } from '../components/Sheet';
import { addDays, diffDays, formatShort, range, startOfWeek, weekday } from '../domain/dates';
import { dayNutrition, entriesOn, mealOf, mealOfCook } from '../domain/nutrition';
import {
  blockOf,
  closeGaps,
  insertBlock,
  markOut,
  moveBlock,
  planRecipe,
  removeEntry,
  setSkipped,
  toggleDone,
  unmarkOut,
} from '../domain/plan';
import { makeable } from '../domain/recipes';
import { formatQty } from '../domain/stock';
import type { ISODate, PlanEntry, Recipe } from '../domain/types';
import { WeekProposal, type Proposal } from './week-proposal';
import './week-v3.css';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const shortDate = (d: ISODate) => `${Number(d.slice(8))} ${MONTH_SHORT[Number(d.slice(5, 7)) - 1]}`;
const dayLabel = (d: ISODate) => `${WEEKDAYS[weekday(d)]} ${shortDate(d)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/* ---------- la fournée : un bloc, ses restes, son ruban ---------- */

/* ---------- ce qu’un dépôt a le droit de faire ---------- */

type DropCheck = { ok: true; conflict: false } | { ok: true; conflict: true; blocker: ISODate } | { ok: false; reason: string };

/**
 * Trois règles, jamais contournées : une cuisson emporte ses restes, une portion part seule,
 * et un jour occupé demande un choix. Un jour passé ou marqué dehors ne reçoit rien.
 * Une fournée de deux repas occupe deux jours : si le second est pris, le choix s’ouvre aussi.
 */
function checkDrop(entries: PlanEntry[], today: ISODate, sourceId: string, to: ISODate): DropCheck {
  const source = entries.find((e) => e.id === sourceId);
  if (!source || source.kind === 'out') return { ok: false, reason: 'Ce repas ne se déplace pas.' };
  if (source.done) return { ok: false, reason: 'Ce repas est déjà mangé.' };
  if (to === source.date) return { ok: false, reason: 'C’est déjà ce jour-là.' };
  if (to < today) return { ok: false, reason: 'Ce jour est passé.' };

  const block = source.kind === 'cook' ? blockOf(entries, sourceId).filter((e) => !e.done) : [source];
  const span = Math.max(1, block.length);
  const moving = new Set(block.map((e) => e.id));
  const days = Array.from({ length: span }, (_, i) => addDays(to, i));
  const onTarget = entries.filter((e) => e.date === to);

  if (source.kind === 'cook') {
    if (onTarget.some((e) => e.id === source.id || (e.kind === 'leftover' && e.batchId === source.id))) {
      return { ok: false, reason: 'Ce jour porte déjà une portion de cette fournée.' };
    }
  } else {
    const cook = entries.find((e) => e.id === source.batchId && e.kind === 'cook');
    if (cook && to === cook.date) return { ok: false, reason: 'Ce jour porte la fournée.' };
    if (cook && to < cook.date) return { ok: false, reason: 'Une portion ne se place pas avant sa fournée.' };
    if (onTarget.some((e) => e.kind === 'leftover' && e.batchId === source.batchId)) {
      return { ok: false, reason: 'Ce jour porte déjà une portion de cette fournée.' };
    }
  }

  for (const d of days) {
    const out = entries.find((e) => e.date === d && e.kind === 'out' && !moving.has(e.id));
    if (out) return { ok: false, reason: d === to ? 'Ce jour est marqué dehors.' : `${dayLabel(d)} est marqué dehors.` };
  }

  const busy = days.find((d) => entries.some((e) => e.date === d && e.kind !== 'out' && !moving.has(e.id)));
  if (busy) return { ok: true, conflict: true, blocker: busy };
  return { ok: true, conflict: false };
}

/** Remplacer n’est possible que si rien de mangé ne part et si toute la fournée tient sur place. */
function canReplace(entries: PlanEntry[], sourceId: string, at: ISODate): { ok: true } | { ok: false; reason: string } {
  const source = entries.find((e) => e.id === sourceId);
  if (!source) return { ok: false, reason: 'Ce repas n’existe plus.' };
  const victims = entries.filter((e) => e.date === at && e.kind !== 'out');
  for (const v of victims) {
    if (v.done) return { ok: false, reason: 'Le repas de ce jour est déjà mangé.' };
    if (v.kind === 'cook' && entries.some((x) => x.kind === 'leftover' && x.batchId === v.id && !x.done)) {
      return { ok: false, reason: 'Ce repas a des restes plus loin ; décaler les garde.' };
    }
    if (v.kind === 'cook' && entries.some((x) => x.kind === 'leftover' && x.batchId === v.id && x.done)) {
      return { ok: false, reason: 'Une portion de ce repas est déjà mangée.' };
    }
  }
  let rest = entries;
  for (const v of victims) rest = removeEntry(rest, v.id);
  const block = source.kind === 'cook' ? blockOf(entries, sourceId).filter((e) => !e.done) : [source];
  const ids = new Set(block.map((e) => e.id));
  const dates = new Set(block.map((_, i) => addDays(at, i)));
  if (rest.some((e) => !ids.has(e.id) && dates.has(e.date))) {
    return { ok: false, reason: 'La suite du jour est occupée.' };
  }
  return { ok: true };
}

function replaceBlockAt(entries: PlanEntry[], sourceId: string, at: ISODate): PlanEntry[] {
  const source = entries.find((e) => e.id === sourceId);
  if (!source) return entries;
  const block = source.kind === 'cook' ? blockOf(entries, sourceId).filter((e) => !e.done) : [source];
  let out = entries;
  for (const v of entries.filter((e) => e.date === at && e.kind !== 'out')) out = removeEntry(out, v.id);
  const ids = new Set(block.map((e) => e.id));
  out = out.filter((e) => !ids.has(e.id));
  const placed = block.map((e, i) => ({ ...e, date: addDays(at, i) }));
  return [...out, ...placed].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/* ---------- resserrer : le décalage se calcule avant d’appliquer ---------- */

interface GapGroup {
  from: ISODate;
  to: ISODate;
  meals: number;
  out: number;
}

interface GapPlan {
  moved: { entry: PlanEntry; to: ISODate }[];
  shifts: number[];
  groups: GapGroup[];
  emptyDays: ISODate[];
}

function gapPlan(entries: PlanEntry[], from: ISODate): GapPlan {
  const preview = closeGaps(entries, from);
  const nextDate = new Map(preview.map((e) => [e.id, e.date]));
  const moved = entries
    .filter((e) => !e.done && e.date >= from)
    .map((e) => ({ entry: e, to: nextDate.get(e.id) ?? e.date }))
    .filter((m) => m.to !== m.entry.date);
  const shifts = [...new Set(moved.map((m) => diffDays(m.to, m.entry.date)))].sort((a, b) => a - b);
  const groups = new Map<string, GapGroup>();
  for (const m of moved) {
    const g = groups.get(m.entry.date) ?? { from: m.entry.date, to: m.to, meals: 0, out: 0 };
    if (m.entry.kind === 'out') g.out++;
    else g.meals++;
    groups.set(m.entry.date, g);
  }
  const planned = [...new Set(entries.filter((e) => e.date >= from).map((e) => e.date))].sort();
  const last = planned[planned.length - 1];
  const emptyDays = last ? range(from, last).filter((d) => !planned.includes(d)) : [];
  return { moved, shifts, groups: [...groups.values()].sort((a, b) => (a.from < b.from ? -1 : 1)), emptyDays };
}

/* ---------- la semaine ---------- */

interface MoveState {
  id: string;
  to?: ISODate;
  /** Le premier jour déjà pris par un autre repas, sur le jour visé ou sa suite. */
  blocker?: ISODate;
  step: 'day' | 'conflict';
}

interface DragState {
  id: string;
  name: string;
  label: string;
}

/**
 * La semaine est la page d’accueil : sept lignes, une par jour, qu’on remplit.
 * Le jour ouvert montre le plat, ses ingrédients et les trois gestes utiles ;
 * les autres jours se lisent d’un coup d’œil. Rien d’autre à ouvrir pour planifier.
 */
export function WeekView() {
  const app = useApp();
  const { data, today, store, targets } = app;
  const [weekStart, setWeekStart] = useState<ISODate>(startOfWeek(today));
  const [openDate, setOpenDate] = useState<ISODate | null>(today);
  const [composer, setComposer] = useState<{ date: ISODate; target?: { cookId: string; entryId: string } } | null>(null);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [move, setMove] = useState<MoveState | null>(null);
  const [gapOpen, setGapOpen] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [hoverDate, setHoverDate] = useState<ISODate | null>(null);
  const suppressClick = useRef(false);

  // Un glissement interrompu par un changement de page ne laisse pas la page en mode « attrapé ».
  useEffect(() => () => document.body.classList.remove('is-week-drag'), []);

  const entries = data.plan.entries;
  const days = useMemo(() => range(weekStart, addDays(weekStart, 6)), [weekStart]);
  const thisWeek = startOfWeek(today);
  const setEntries = (fn: (e: PlanEntry[]) => PlanEntry[]) => store.update('plan', (p) => ({ ...p, entries: fn(p.entries) }));

  const filled = days.filter((d) => entriesOn(data, d).length > 0).length;
  const isFutureWeek = weekStart > thisWeek;
  const blankDays = days.filter((d) => d >= today && entriesOn(data, d).length === 0).length;

  const hoverCheck = useMemo(
    () => (drag && hoverDate ? checkDrop(entries, today, drag.id, hoverDate) : null),
    [drag, hoverDate, entries, today],
  );

  // Les trois recettes réalisables les plus utiles : le stock d’abord, les produits à sauver ensuite.
  const suggestions = useMemo(() => {
    const atRisk = new Set(app.priorities.filter((p) => p.atRisk > 0).map((p) => p.food.id));
    const planned = new Set(
      entries.filter((e) => e.date >= days[0] && e.date <= days[6] && e.kind === 'cook' && e.recipeId).map((e) => e.recipeId as string),
    );
    return data.recipes
      .filter((r) => !planned.has(r.id) && makeable(r, app.stock))
      .map((r) => {
        const ings = r.ingredients ?? [];
        const saves = ings.filter((i) => atRisk.has(i.foodId)).length;
        const score = saves * 6 + (r.dish === 'Plat' ? 3 : 0) + (r.status === 'maîtrisée' ? 2 : 0) + (r.favorite ? 1 : 0);
        return { recipe: r, score };
      })
      .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name, 'fr'))
      .slice(0, 3)
      .map((x) => x.recipe);
  }, [entries, data.recipes, app.stock, app.priorities, days]);

  const gap = useMemo(() => {
    const from = days.find((d) => entries.some((e) => e.date === d));
    return from ? gapPlan(entries, from) : null;
  }, [days, entries]);

  const applyMove = (id: string, to: ISODate, mode: 'shift' | 'replace') => {
    setEntries((list) => {
      const source = list.find((e) => e.id === id);
      if (!source) return list;
      if (mode === 'replace') return replaceBlockAt(list, id, to);
      // Une cuisson déplace le lot entier ; un reste part seul, avec ses quantités par portion.
      if (source.kind === 'cook') return moveBlock(list, id, to);
      return insertBlock(list.filter((e) => e.id !== id), [source], to);
    });
    setMove(null);
  };

  const chooseDay = (to: ISODate) => {
    if (!move) return;
    const check = checkDrop(entries, today, move.id, to);
    if (!check.ok) return;
    if (check.conflict) setMove({ ...move, to, blocker: check.blocker, step: 'conflict' });
    else applyMove(move.id, to, 'shift');
  };

  const resolveMove = (mode: 'shift' | 'replace') => {
    if (!move?.to) return;
    applyMove(move.id, move.to, mode);
  };

  /**
   * Glisser commence après six pixels : un simple appui reste un clic, et ouvre le choix de jour.
   * Pendant le geste, la ligne visée dit oui ou non ; rien ne bouge au relâchement sans accord.
   */
  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, entry: PlanEntry) => {
    if (event.button !== 0 || entry.done) return;
    const block = entry.kind === 'cook' ? blockOf(entries, entry.id).filter((e) => !e.done) : [entry];
    if (block.length === 0) return;
    const name = mealOf(data, entry)?.name ?? 'Repas';
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;

    function stop() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      document.body.classList.remove('is-week-drag');
    }

    function onMove(ev: PointerEvent) {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        active = true;
        document.body.classList.add('is-week-drag');
        setDrag({
          id: entry.id,
          name,
          label: entry.kind === 'cook' ? `Fournée · ${plural(block.length, 'repas', 'repas')}` : 'Une portion de reste',
        });
      }
      setDragPos({ x: ev.clientX, y: ev.clientY });
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      setHoverDate((el?.closest<HTMLElement>('[data-drop-date]')?.dataset.dropDate as ISODate | undefined) ?? null);
    }

    function onUp(ev: PointerEvent) {
      stop();
      if (!active) return;
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      setDrag(null);
      setHoverDate(null);
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const to = el?.closest<HTMLElement>('[data-drop-date]')?.dataset.dropDate as ISODate | undefined;
      if (!to) return;
      const check = checkDrop(entries, today, entry.id, to);
      if (!check.ok) return;
      if (check.conflict) setMove({ id: entry.id, to, blocker: check.blocker, step: 'conflict' });
      else applyMove(entry.id, to, 'shift');
    }

    function onCancel() {
      stop();
      setDrag(null);
      setHoverDate(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  return (
    <div className="s-page">
      <header className="s-pagehead">
        <div>
          <h1 className="s-title">Ma semaine</h1>
          <p className="s-subtitle">
            Du {Number(days[0].slice(8))} au {shortDate(days[6])}
          </p>
        </div>
        <div className="week-nav">
          <button type="button" className="s-btn is-sm is-mint" onClick={() => setProposalOpen(true)} disabled={blankDays === 0}>
            Proposer une semaine
          </button>
          <button
            type="button"
            className="s-btn is-ghost is-sm"
            onClick={() => setGapOpen(true)}
            disabled={!gap || gap.moved.length === 0}
            title={gap && gap.moved.length > 0 ? `${plural(gap.moved.length, 'repas', 'repas')} à rapprocher` : 'Aucun jour vide à resserrer'}
          >
            <ChevronsDownUp size={15} aria-hidden /> Resserrer
          </button>
          <button type="button" className="s-btn is-ghost is-sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semaine précédente">
            <ChevronLeft size={16} aria-hidden />
          </button>
          {weekStart !== thisWeek && (
            <button type="button" className="s-btn is-ghost is-sm" onClick={() => { setWeekStart(thisWeek); setOpenDate(today); }}>
              Cette semaine
            </button>
          )}
          <button type="button" className="s-btn is-ghost is-sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semaine suivante">
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </header>

      <div className="week-progress">
        <span className="week-progress-text">
          <b>
            {filled} jour{filled > 1 ? 's' : ''}
          </b>{' '}
          rempli{filled > 1 ? 's' : ''} sur 7
        </span>
        {isFutureWeek && <span className="s-chip is-butter">Semaine à préparer</span>}
        <div className="week-dots" aria-hidden>
          {days.map((d) => {
            const on = entriesOn(data, d).length > 0;
            return <span key={d} className={`week-dot ${on ? 'is-on' : ''} ${d === today ? 'is-today' : ''}`} />;
          })}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {drag && hoverDate && hoverCheck
          ? hoverCheck.ok
            ? `${dayLabel(hoverDate)} : dépôt possible${hoverCheck.conflict ? ', un choix s’ouvrira' : ''}.`
            : `${dayLabel(hoverDate)} : ${hoverCheck.reason}`
          : ''}
      </p>

      <div className={`week-ledger ${drag ? 'is-dragging' : ''}`}>
        {days.map((date) => {
          const onDay = entriesOn(data, date);
          const out = onDay.find((e) => e.kind === 'out');
          const meals = onDay.filter((e) => e.kind !== 'out');
          const entry = meals[0];
          const meal = mealOf(data, entry);
          const day = dayNutrition(data, app.foods, date);
          const open = date === openDate;
          const past = date < today;
          const isToday = date === today;
          const done = meals.length > 0 && meals.every((e) => e.done);
          const skipped = meals.length > 0 && meals.every((e) => e.skipped);
          const empty = !out && meals.length === 0;
          const pending = date < today ? meals.filter((e) => !e.done && !e.skipped) : [];
          const ready = drag ? checkDrop(entries, today, drag.id, date) : null;
          const dropClass = drag
            ? hoverDate === date
              ? ready?.ok
                ? 'is-drop-ok'
                : 'is-drop-no'
              : ready?.ok
                ? 'is-drop-ready'
                : ''
            : '';

          return (
            <section
              key={date}
              data-drop-date={date}
              className={`day-row ${isToday ? 'is-today' : ''} ${past && !isToday ? 'is-past' : ''} ${empty ? 'is-empty' : ''} ${
''
              } ${dropClass}`}
              aria-label={`${WEEKDAYS[weekday(date)]} ${shortDate(date)}`}
            >
              <div className="day-date">
                <span className="day-wd">{WEEKDAYS[weekday(date)]}</span>
                <span className="day-num num">{shortDate(date)}</span>
              </div>

              {/* La photo de la recette, dans la ligne même : la semaine se lit aussi
                  par l’image, sans ouvrir le jour. */}
              <div className="day-thumb" aria-hidden>
                {meal?.recipe?.cover ? (
                  <Cover recipe={meal.recipe} ratio="square" />
                ) : (
                  <span className="day-thumb-vide">{out ? <Utensils size={16} /> : <ChefHat size={16} />}</span>
                )}
              </div>

              <div className="day-main">
                <button type="button" className="day-head-btn" onClick={() => setOpenDate(open ? null : date)} aria-expanded={open}>
                  {out ? (
                    <span className="day-meal-line">
                      <span className="s-chip is-lilac">
                        <Utensils size={12} aria-hidden /> Dehors
                      </span>
                      <span className="day-meal-empty">{out.note || 'repas pris à l’extérieur'}</span>
                    </span>
                  ) : entry ? (
                    <span className="day-meal-line">
                      <span className="day-meal-name">{meal?.name ?? 'Mon plat'}</span>
                      {entry.kind === 'leftover' && <span className="s-chip">reste</span>}
                      {entry.kind === 'cook' && (entry.portions ?? 1) > 1 && (
                        <span className="s-chip is-butter">{entry.portions} portions</span>
                      )}
                    </span>
                  ) : (
                    <span className="day-meal-line">
                      <span className="day-meal-empty">Rien de prévu</span>
                    </span>
                  )}
                </button>

                {!empty && !out && (
                  <div className="day-facts">
                    <span className="s-chip is-mint">
                      <b className="num">{fr(day.total.kcal)}</b> kcal
                    </span>
                    <span className="s-chip is-peach">
                      <b className="num">{fr(day.total.protein)}</b> g prot.
                    </span>
                    <span className="s-chip is-butter">
                      <b className="num">{fr(day.total.fiber)}</b> g fibres
                    </span>
                    {meal && <span className="s-chip">cible {fr(targets.kcal)} kcal</span>}
                  </div>
                )}

                {pending.length > 0 && (
                  <div className="day-reminder" role="group" aria-label="Repas passé non coché">
                    <span className="day-reminder-kicker">
                      <Clock size={13} aria-hidden /> Repas passé, pas encore coché
                    </span>
                    {pending.map((p) => (
                      <span key={p.id} className="day-reminder-row">
                        {pending.length > 1 && <b>{mealOf(data, p)?.name ?? 'Repas'}</b>}
                        <button type="button" className="s-btn is-sm is-mint" onClick={() => setEntries((e) => toggleDone(e, p.id))}>
                          <Check size={14} aria-hidden /> Mangé
                        </button>
                        <button type="button" className="s-btn is-sm is-ghost" onClick={() => setEntries((e) => setSkipped(e, p.id))}>
                          Je n’ai pas mangé ce repas
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {empty && date >= today && suggestions.length > 0 && (
                  <div className="day-suggest">
                    <span className="day-suggest-label">
                      <Sparkles size={13} aria-hidden /> {suggestions.length === 1 ? '1 recette prête' : `${suggestions.length} recettes prêtes`} avec ton stock
                    </span>
                    {suggestions.map((recipe) => (
                      <button
                        key={recipe.id}
                        type="button"
                        className="day-suggest-btn"
                        title={`Prête avec ton stock · ${fr(app.portions.get(recipe.id)?.nutrients.kcal ?? 0)} kcal par portion`}
                        onClick={() => {
                          setEntries((e) => planRecipe(e, date, recipe, 1));
                          setOpenDate(date);
                        }}
                      >
                        {recipe.name}
                        <span className="num">{fr(app.portions.get(recipe.id)?.nutrients.kcal ?? 0)} kcal</span>
                      </button>
                    ))}
                  </div>
                )}

                {open && !out && !entry && (
                  <button type="button" className="s-btn is-primary" onClick={() => setComposer({ date })}>
                    <Plus size={16} aria-hidden /> Composer le repas
                  </button>
                )}

                {open && entry && (
                  <div className="day-open">
                    <div className="day-open-body">
                      {meal && meal.ingredients.length > 0 && (
                        <div className="day-ingredients">
                          {meal.ingredients.slice(0, 8).map((ing) => {
                            const food = app.foods.get(ing.foodId);
                            return (
                              <span key={ing.foodId} className="day-ing-chip">
                                <b className="num">{food ? formatQty(food, ing.qty) : ing.qty}</b> {food?.name ?? ing.foodId}
                              </span>
                            );
                          })}
                          {meal.ingredients.length > 8 && <span className="day-ing-chip">+{meal.ingredients.length - 8}</span>}
                        </div>
                      )}
                      <div className="day-open-actions">
                        <button
                          type="button"
                          className="s-btn is-sm"
                          onClick={() =>
                            setComposer({
                              date,
                              target: { cookId: entry.kind === 'leftover' ? entry.batchId! : entry.id, entryId: entry.id },
                            })
                          }
                        >
                          Modifier le plat
                        </button>
                        {meal?.recipe && (
                          <button type="button" className="s-btn is-sm is-ghost" onClick={() => app.openRecipe(meal.recipe!.id)}>
                            Voir la recette
                          </button>
                        )}
                        <button type="button" className="s-btn is-sm is-ghost" onClick={() => setEntries((e) => markOut(e, date))}>
                          <Utensils size={14} aria-hidden /> Je mange dehors
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {open && out && date >= today && (
                  <button type="button" className="s-btn is-sm is-ghost" onClick={() => setEntries((e) => unmarkOut(e, out.id))}>
                    Finalement à la maison
                  </button>
                )}

                {/* Les compléments vivent dans le jour ouvert : c’est le seul endroit où l’on
                    sait quel jour on est en train de raconter. */}
                {open && <Complements date={date} />}

                {drag && hoverDate === date && (
                  <span className={`day-drop-note ${hoverCheck?.ok ? 'is-ok' : 'is-no'}`}>
                    {hoverCheck?.ok ? (hoverCheck.conflict ? 'Un choix s’ouvrira' : 'Déposer ici') : hoverCheck?.reason}
                  </span>
                )}
              </div>

              <div className="day-actions">
                {entry && !entry.done && (
                  <button
                    type="button"
                    className="day-grip"
                    aria-label={`Déplacer ${meal?.name ?? 'le repas'} du ${dayLabel(date)}`}
                    aria-haspopup="dialog"
                    title="Glisser, ou appuyer pour choisir un jour"
                    onPointerDown={(e) => beginDrag(e, entry)}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onClick={() => {
                      if (suppressClick.current) return;
                      setMove({ id: entry.id, step: 'day' });
                    }}
                  >
                    <GripVertical size={16} aria-hidden />
                    <span className="day-grip-label">Déplacer</span>
                  </button>
                )}
                {!out && !empty && meals.length === 1 && (
                  <button
                    type="button"
                    className={`day-tick ${done ? 'is-on' : ''} ${skipped ? 'is-skip' : ''}`}
                    onClick={() => setEntries((e) => toggleDone(e, entry.id))}
                    aria-pressed={done}
                    aria-label={done ? 'Repas mangé, appuyer pour annuler' : 'Marquer le repas comme mangé'}
                    title={done ? 'Mangé' : 'Marquer comme mangé'}
                  >
                    {skipped ? <Minus size={18} /> : <Check size={20} strokeWidth={3} />}
                  </button>
                )}
                {empty && (
                  <button type="button" className="s-btn is-sm" onClick={() => { setOpenDate(date); setComposer({ date }); }}>
                    <Plus size={14} aria-hidden /> {isToday ? 'Le plat du jour' : 'Ajouter'}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <WeekProposal
        open={proposalOpen}
        days={days}
        onClose={() => setProposalOpen(false)}
        onApply={(rows: Proposal[]) => {
          setEntries((list) => rows.reduce((acc, row) => planRecipe(acc, row.date, row.recipe), list));
          setProposalOpen(false);
        }}
      />

      <MoveDialog
        move={move}
        entries={entries}
        days={days}
        today={today}
        recipes={data.recipes}
        onClose={() => setMove(null)}
        onChoose={chooseDay}
        onResolve={resolveMove}
      />

      <GapSheet
        open={gapOpen}
        plan={gap}
        onClose={() => setGapOpen(false)}
        onApply={() => {
          if (!gap) return;
          const from = days.find((d) => entries.some((e) => e.date === d));
          if (from) setEntries((list) => closeGaps(list, from));
          setGapOpen(false);
        }}
      />

      <Sheet
        open={!!composer}
        onClose={() => setComposer(null)}
        title={composer ? `Repas du ${formatShort(composer.date)}` : 'Repas'}
        subtitle="Une recette du carnet, ton plat composé, ou dehors"
        size="lg"
      >
        {composer && (
          <MealComposer
            date={composer.date}
            target={composer.target}
            onClose={() => setComposer(null)}
            onOut={(note) => {
              setEntries((e) => markOut(e, composer.date, note || undefined));
              setComposer(null);
            }}
          />
        )}
      </Sheet>

      {drag && (
        <div
          className={`week-drag-ghost ${hoverCheck && !hoverCheck.ok ? 'is-no' : ''}`}
          style={{ left: Math.max(8, Math.min(dragPos.x + 18, window.innerWidth - 300)), top: dragPos.y + 14 }}
          aria-hidden
        >
          <span className="week-drag-ghost-main">
            <GripVertical size={14} aria-hidden /> {drag.label}
          </span>
          <span className="week-drag-ghost-sub">
            {hoverCheck ? (hoverCheck.ok ? (hoverCheck.conflict ? 'Déposer : un choix s’ouvrira' : 'Déposer ici') : hoverCheck.reason) : drag.name}
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------- le choix du jour, au clavier comme à la souris ---------- */

function MoveDialog({
  move,
  entries,
  days,
  today,
  recipes,
  onClose,
  onChoose,
  onResolve,
}: {
  move: MoveState | null;
  entries: PlanEntry[];
  days: ISODate[];
  today: ISODate;
  recipes: Recipe[];
  onClose: () => void;
  onChoose: (to: ISODate) => void;
  onResolve: (mode: 'shift' | 'replace') => void;
}) {
  const source = move ? entries.find((e) => e.id === move.id) : undefined;
  if (!move || !source) return null;

  const cook = source.kind === 'cook' ? source : entries.find((e) => e.id === source.batchId);
  const name = cook ? mealOfCook(recipes, cook).name : 'Repas';
  const block = source.kind === 'cook' ? blockOf(entries, source.id).filter((e) => !e.done) : [source];
  const title =
    source.kind === 'cook' ? (block.length > 1 ? 'Déplacer la fournée' : 'Déplacer le repas') : 'Déplacer la portion';
  const subtitle =
    source.kind === 'cook'
      ? block.length > 1
        ? `${name} · ${plural(block.length, 'repas', 'repas')}, restes compris`
        : name
      : `${name} · une portion de la fournée du ${shortDate(cook?.date ?? source.date)}`;

  if (move.step === 'conflict' && move.to) {
    const target = move.to;
    const blocker = move.blocker ?? target;
    const atTarget = blocker === target;
    const targetMeals = entries.filter((e) => e.date === target && e.kind !== 'out');
    const blockerMeals = entries.filter((e) => e.date === blocker && e.kind !== 'out');
    const concerned = blockerMeals.length + block.length;
    const replace = canReplace(entries, move.id, target);
    return (
      <Sheet
        open
        onClose={onClose}
        title={atTarget ? 'Ce jour est déjà occupé' : 'La suite du jour est occupée'}
        subtitle={
          atTarget
            ? `${dayLabel(target)} porte déjà ${plural(blockerMeals.length, 'repas', 'repas')}`
            : `${dayLabel(target)} est libre, mais ${dayLabel(blocker)} porte déjà ${plural(blockerMeals.length, 'repas', 'repas')}`
        }
        size="sm"
        footer={
          <>
            <span className="sheet-hint">Rien ne bouge tant que tu n’as pas choisi.</span>
            <span className="sheet-foot-gap" />
            <button type="button" className="s-btn is-ghost" onClick={onClose}>
              Annuler
            </button>
          </>
        }
      >
        <p className="move-lead">
          {atTarget ? (
            <>
              <b>{dayLabel(target)}</b> porte déjà {plural(blockerMeals.length, 'repas', 'repas')}.
            </>
          ) : (
            <>
              <b>{dayLabel(target)}</b> est libre, mais <b>{dayLabel(blocker)}</b> porte déjà{' '}
              {plural(blockerMeals.length, 'repas', 'repas')}.
            </>
          )}
        </p>
        <p className="move-count">
          {plural(concerned, 'repas', 'repas')} concerné{concerned > 1 ? 's' : ''} : {blockerMeals.length} déjà prévu
          {blockerMeals.length > 1 ? 's' : ''}, {block.length} qui arrive{block.length > 1 ? 'nt' : ''}.
        </p>
        <div className="move-choices">
          <button type="button" className="move-choice is-primary" onClick={() => onResolve('shift')}>
            <b>Décaler</b>
            <span>
              Les repas à partir de ce jour reculent de {plural(block.length, 'jour')}. Rien ne disparaît.
            </span>
          </button>
          <button type="button" className="move-choice" onClick={() => onResolve('replace')} disabled={!replace.ok}>
            <b>Remplacer</b>
            <span>
              {replace.ok
                ? targetMeals.length > 1
                  ? `Les ${targetMeals.length} repas du jour sont retirés ; la fournée prend leur place.`
                  : 'Le repas du jour est retiré ; la fournée prend sa place.'
                : replace.reason}
            </span>
          </button>
          <button type="button" className="move-choice is-quiet" onClick={onClose}>
            <b>Annuler</b>
            <span>Le plan reste tel quel.</span>
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="sm"
      footer={
        <>
          <span className="sheet-hint">Choisis le jour d’arrivée.</span>
          <span className="sheet-foot-gap" />
          <button type="button" className="s-btn is-ghost" onClick={onClose}>
            Annuler
          </button>
        </>
      }
    >
      <ul className="move-days">
        {days.map((d) => {
          const check = checkDrop(entries, today, move.id, d);
          const onDay = entries.filter((e) => e.date === d);
          const out = onDay.some((e) => e.kind === 'out');
          const meals = onDay.filter((e) => e.kind !== 'out').length;
          return (
            <li key={d}>
              <button type="button" className="move-day" disabled={!check.ok} onClick={() => onChoose(d)}>
                <span className="move-day-date">
                  {dayLabel(d)}
                  {d === today ? ' · aujourd’hui' : ''}
                </span>
                <span className={`s-chip ${out ? 'is-lilac' : meals > 0 ? 'is-butter' : 'is-mint'}`}>
                  {out ? 'dehors' : meals > 0 ? plural(meals, 'repas', 'repas') : 'libre'}
                </span>
                {!check.ok && <span className="move-day-why">{check.reason}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/* ---------- resserrer la semaine ---------- */

function GapSheet({
  open,
  plan,
  onClose,
  onApply,
}: {
  open: boolean;
  plan: GapPlan | null;
  onClose: () => void;
  onApply: () => void;
}) {
  const meals = plan ? plan.moved.filter((m) => m.entry.kind !== 'out').length : 0;
  const outs = plan ? plan.moved.length - meals : 0;
  const shifts = plan?.shifts ?? [];
  const span =
    shifts.length === 0
      ? ''
      : shifts.length === 1
        ? `de ${plural(shifts[0], 'jour')}`
        : `de ${shifts[0]} à ${shifts[shifts.length - 1]} jours`;
  const headline =
    meals > 0
      ? `${plural(meals, 'repas', 'repas')} ${meals > 1 ? 'remontent' : 'remonte'} ${span}`
      : `${plural(outs, 'jour dehors', 'jours dehors')} ${outs > 1 ? 'remontent' : 'remonte'} ${span}`;
  const empty = plan?.emptyDays.length ?? 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Resserrer la semaine"
      subtitle="Les jours vides entre deux jours planifiés disparaissent. Rien n’est supprimé."
      size="sm"
      footer={
        <>
          <span className="sheet-hint">Le décalage est appliqué d’un coup, et s’annule avec ⌘Z.</span>
          <span className="sheet-foot-gap" />
          <button type="button" className="s-btn is-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="s-btn is-primary" onClick={onApply} disabled={!plan || plan.moved.length === 0}>
            Resserrer
          </button>
        </>
      }
    >
      {plan && plan.moved.length > 0 ? (
        <>
          <p className="gap-headline">{headline}</p>
          <p className="gap-sub">
            {plural(empty, 'jour vide', 'jours vides')} {empty > 1 ? 'disparaissent' : 'disparaît'}. Les repas se rapprochent dans
            l’ordre, les quantités ne changent pas.
          </p>
          <ul className="gap-list">
            {plan.groups.slice(0, 8).map((g) => (
              <li key={g.from} className="gap-row">
                <span>{dayLabel(g.from)}</span>
                <span className="gap-arrow" aria-hidden>→</span>
                <b>{dayLabel(g.to)}</b>
                <span className="s-chip is-butter">
                  {g.meals > 0 ? plural(g.meals, 'repas', 'repas') : plural(g.out, 'jour dehors', 'jours dehors')}
                </span>
              </li>
            ))}
          </ul>
          {plan.groups.length > 8 && <p className="gap-sub">Et {plural(plan.groups.length - 8, 'autre jour', 'autres jours')}.</p>}
        </>
      ) : (
        <p className="gap-sub">Aucun jour vide entre deux jours planifiés : il n’y a rien à resserrer.</p>
      )}
    </Sheet>
  );
}

/** Titre de la page, réutilisé par les autres vues de la nouvelle charte. */
export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="s-pagehead">
      <div>
        <h1 className="s-title">{title}</h1>
        {subtitle && <p className="s-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="s-pagehead-actions">{children}</div>}
    </header>
  );
}
