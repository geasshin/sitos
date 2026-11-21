import { useState } from 'react';
import { AlertTriangle, Check, Plus, Utensils, X } from 'lucide-react';
import { useApp } from '../context';
import { addDays, formatDayMonth, formatLong, formatShort, range, startOfWeek, todayISO, weekday } from '../domain/dates';
import { entriesOn, mealOf } from '../domain/nutrition';
import { markOut, nextSlot, pendingPast, planRecipe, setSkipped, toggleDone, unmarkOut } from '../domain/plan';
import { amount, shortQty, rescueSuggestions } from '../domain/stock';
import type { ISODate, PlanEntry } from '../domain/types';
import { NutritionPanel } from '../components/NutritionPanel';
import { MealCard } from '../components/MealCard';
import { MealComposer } from '../components/MealComposer';
import { ExpensePanel, TomorrowPanel, WeightPanel } from '../components/TodayExtras';
import { Modal } from '../components/Modal';
import { MiniPanel, PageHeader, PanelLink } from '../components/ui';

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Teinte d'urgence partagée : ≤ 2 j danger, ≤ 7 j avertissement, au-delà neutre. */
export const urgencyTone = (days: number) => (days <= 2 ? 'tomato' : days <= 7 ? 'saffron' : 'neutral');

const shortDay = (d: string) => capitalize(formatShort(d).split(' ')[0]);
const WEEK_LETTERS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function TodayView() {
  const app = useApp();
  const { data, today, store, targets } = app;
  // La page montre le jour choisi ; « aujourd'hui » reste la référence du stock et des rappels.
  const [viewDate, setViewDate] = useState<ISODate>(today);
  const planned = entriesOn(data, viewDate);
  const out = planned.find((e) => e.kind === 'out');
  const meals = planned.filter((e) => e.kind !== 'out');
  const slots = Math.max(targets.mealsPerDay, meals.length);
  const simulated = today !== todayISO();
  const isToday = viewDate === today;
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<{
    cookId: string;
    entryId: string;
  } | null>(null);
  const setEntries = (fn: (e: PlanEntry[]) => PlanEntry[]) => store.update('plan', (p) => ({ ...p, entries: fn(p.entries) }));

  const resetSimulation = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('jour');
    window.location.href = url.toString();
  };

  const pickDate = (d: ISODate) => {
    setViewDate(d);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="page today">
      <div className="today-head">
        <PageHeader title="Aujourd’hui" context={capitalize(formatLong(viewDate))}>
          {!isToday && (
            <button type="button" className="text-button is-sm" onClick={() => pickDate(today)}>
              Revenir à aujourd’hui
            </button>
          )}
          {simulated && (
            <span className="sim-chip">
              Date simulée
              <button type="button" onClick={resetSimulation}>
                Revenir à aujourd’hui
              </button>
            </span>
          )}
        </PageHeader>
        <WeekStrip date={viewDate} today={today} onPick={pickDate} />
      </div>

      <section className="today-block" aria-labelledby="today-meals-title">
        <h2 id="today-meals-title" className="sr-only">
          Repas
        </h2>

        {out ? (
          <article className="meal-card out-card">
            <div className="meal-card-main">
              <div className="meal-main-body">
                <div className="meal-card-label-row">
                  <span className="meal-card-label">
                    <Utensils size={14} className="module-title-icon" aria-hidden /> Repas principal
                  </span>
                </div>
                <div className="meal-heading-row">
                  <span className="meal-slot num">01</span>
                  <h2 className="meal-title">Repas dehors</h2>
                </div>
                <div className="meal-card-top">
                  <span className="tag tag-out">
                    <Utensils size={12} aria-hidden /> Dehors
                  </span>
                </div>
                <p className="meal-note">La journée ne compte pas dans le bilan.</p>
              </div>
            </div>
            {viewDate >= today && (
              <div className="meal-action-bar">
                <button type="button" className="secondary-button is-sm" onClick={() => setEntries((e) => unmarkOut(e, out.id))}>
                  <X size={14} aria-hidden /> Finalement à la maison
                </button>
              </div>
            )}
          </article>
        ) : (
          <div className={`meal-grid is-${Math.min(slots, 3)}`}>
            {Array.from({ length: slots }, (_, i) => (
              <MealCard
                key={meals[i]?.id ?? `slot-${i}`}
                entry={meals[i]}
                index={i}
                single={slots === 1}
                date={viewDate}
                onAdd={() => setAddOpen(true)}
                onIngredients={(cook, entry) => setEditing({ cookId: cook.id, entryId: entry.id })}
                onRecipe={app.openRecipe}
                onOut={() => setEntries((e) => markOut(e, viewDate))}
                showOut={i === 0 && viewDate >= today}
              />
            ))}
          </div>
        )}
      </section>

      {!out && <NutritionPanel date={viewDate} />}

      {isToday && !out && (
        <div className="mini-grid">
          <Priorities setEntries={setEntries} />
          <TomorrowPanel />
          <WeightPanel />
          <ExpensePanel />
          <Attention />
        </div>
      )}

      {isToday && <PendingToast setEntries={setEntries} onOpen={pickDate} />}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={isToday ? 'Ajouter un repas' : `Ajouter un repas · ${formatShort(viewDate)}`}
        size="lg"
      >
        {addOpen && (
          <MealComposer date={viewDate} sameDay={planned.length > 0 || viewDate < today} onClose={() => setAddOpen(false)} />
        )}
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Modifier le repas" size="lg">
        {editing && <MealComposer date={viewDate} target={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

/**
 * Les sept jours de la semaine autour d'aujourd'hui. Un clic ouvre le jour dans la page :
 * on complète un jour passé comme on prépare un jour à venir.
 */
function WeekStrip({ date, today, onPick }: { date: ISODate; today: ISODate; onPick: (d: ISODate) => void }) {
  const { data } = useApp();
  const start = startOfWeek(today);
  const days = range(start, addDays(start, 6));

  return (
    <div className="week-strip" role="group" aria-label="Jours de la semaine">
      {days.map((d) => {
        const entries = entriesOn(data, d);
        const meals = entries.filter((e) => e.kind !== 'out');
        const isOut = entries.some((e) => e.kind === 'out');
        const done = meals.length > 0 && meals.every((e) => e.done);
        const pending = d < today && meals.length > 0 && !done;
        const missing = d < today && meals.length === 0 && !isOut;
        const state = isOut ? 'out' : done ? 'done' : pending ? 'pending' : missing ? 'missing' : meals.length > 0 ? 'planned' : 'empty';
        const stateText =
          state === 'done'
            ? ', mangé'
            : state === 'pending'
              ? ', repas à cocher'
              : state === 'missing'
                ? ', rien de noté'
                : state === 'out'
                  ? ', dehors'
                  : state === 'planned'
                    ? ', prévu'
                    : ', libre';
        return (
          <button
            key={d}
            type="button"
            aria-pressed={d === date}
            aria-label={`${capitalize(formatLong(d))}${stateText}`}
            title={`${capitalize(formatLong(d))}${stateText}`}
            className={`week-cell is-${state} ${d === today ? 'is-today' : ''}`}
            onClick={() => onPick(d)}
          >
            <span className="week-cell-wd" aria-hidden>
              {WEEK_LETTERS[weekday(d)]}
            </span>
            <span className="week-cell-num num" aria-hidden>
              {Number(d.slice(8))}
            </span>
            <span className="week-cell-mark" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Les repas passés qui attendent une réponse, en bas à droite.
 * La notification ne prend aucune place dans la page et traite un repas à la fois ;
 * « Pas mangé » clôt le repas sans toucher au stock, « Voir le jour » ouvre la journée.
 */
function PendingToast({ setEntries, onOpen }: { setEntries: (fn: (e: PlanEntry[]) => PlanEntry[]) => void; onOpen: (d: ISODate) => void }) {
  const app = useApp();
  const { data, today } = app;
  const [later, setLater] = useState<string[]>([]);
  const pending = pendingPast(data.plan.entries, today, 7).filter((e) => !later.includes(e.id));
  const entry = pending[0];
  if (!entry) return null;

  const meal = mealOf(data, entry);
  const when = entry.date === addDays(today, -1) ? 'Hier' : `${shortDay(entry.date)} ${Number(entry.date.slice(8))}`;
  const name = entry.kind === 'leftover' ? `Reste · ${meal?.name ?? 'Repas'}` : (meal?.name ?? 'Repas');

  return (
    <aside className="pending-card" role="status" aria-live="polite" aria-label="Repas en attente">
      <div className="pending-head">
        <p className="pending-kicker">{pending.length > 1 ? `${pending.length} repas en attente` : 'Repas en attente'}</p>
        <button type="button" className="icon-button pending-close" onClick={() => setLater((x) => [...x, entry.id])} aria-label="Plus tard" title="Plus tard">
          <X size={14} aria-hidden />
        </button>
      </div>
      <p className="pending-title">
        <span className="pending-when">{when}</span> {name}
      </p>
      <p className="pending-question">Tu l’as mangé ?</p>
      <div className="pending-actions">
        <button type="button" className="primary-button is-sm" onClick={() => setEntries((x) => toggleDone(x, entry.id))}>
          <Check size={14} aria-hidden /> Mangé
        </button>
        <button type="button" className="secondary-button is-sm" onClick={() => setEntries((x) => setSkipped(x, entry.id))}>
          Pas mangé
        </button>
        <button type="button" className="text-button is-sm" onClick={() => onOpen(entry.date)}>
          Voir le jour
        </button>
      </div>
    </aside>
  );
}

function Priorities({ setEntries }: { setEntries: (fn: (e: PlanEntry[]) => PlanEntry[]) => void }) {
  const app = useApp();
  const { data, today } = app;
  const base = app.priorities.slice(0, 5);
  const opened = [...app.stock.values()]
    .filter((s) => s.food.storage !== 'placard' && s.lots.some((l) => l.qty < l.initial - 1e-6) && !base.some((p) => p.food.id === s.food.id))
    .sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99))
    .slice(0, 3)
    .map((s) => ({
      food: s.food,
      daysLeft: s.daysLeft ?? 99,
      expiry: s.nextExpiry ?? today,
      atRisk: s.remaining,
      nextUse: undefined,
      opened: true,
    }));
  const list = [...base.map((p) => ({ ...p, opened: false })), ...opened].slice(0, 6);
  if (list.length === 0) return null;
  const soon = new Set(data.plan.entries.filter((e) => e.kind === 'cook' && e.date >= today && e.date <= addDays(today, 2)).map((e) => e.recipeId));
  const idea = rescueSuggestions(app.priorities, 4).find((x) => !soon.has(x.recipe.id));
  const slot = nextSlot(data.plan.entries, addDays(today, 1));
  return (
    <MiniPanel title="À utiliser vite" aside={<PanelLink onClick={() => app.goTo('stock')}>Stock</PanelLink>}>
      <ul className="prio">
        {list.map((p) => (
          <li key={p.food.id} className="prio-row" title={p.nextUse ? `Prochain plat : ${formatShort(p.nextUse)}` : 'Aucun plat prévu'}>
            <span className="prio-name">{p.food.name}</span>
            <span className="prio-qty muted small num">
              {p.opened ? `${shortQty(p.food, p.atRisk)} entamé` : p.atRisk > 0 ? `${shortQty(p.food, p.atRisk)} hors plat prévu` : 'prévu bientôt'}
            </span>
            <span className={`pill pill-${urgencyTone(p.daysLeft)}`} title={`Se garde jusqu’au ${formatDayMonth(p.expiry)}`}>
              {p.opened && p.daysLeft === 99 ? '—' : p.daysLeft < 0 ? 'dépassé' : p.daysLeft === 0 ? 'auj.' : `${p.daysLeft} j`}
            </span>
          </li>
        ))}
      </ul>
      {idea && (
        <div className="idea-line">
          <button type="button" className="link" onClick={() => app.openRecipe(idea.recipe.id)}>
            {idea.recipe.name}
          </button>
          <button
            type="button"
            className="secondary-button is-sm"
            onClick={() => setEntries((e) => planRecipe(e, slot, idea.recipe))}
            title="La suite du plan glisse d’autant"
          >
            <Plus size={13} aria-hidden /> Planifier {formatShort(slot)}
          </button>
        </div>
      )}
    </MiniPanel>
  );
}

function Attention() {
  const app = useApp();
  const { today } = app;
  const horizon = addDays(today, 14);
  const items = [
    // Les repas non cochés ont leur propre bloc en haut de la page : pas de doublon ici.
    ...app.forecast.shortages
      .filter((s) => s.date <= horizon)
      .slice(0, 4)
      .map((s) => ({
        key: s.entryId + s.foodId,
        date: s.date,
        text: `manque ${amount(app.foods.get(s.foodId), s.missing)}`,
      })),
    ...app.warnings
      .filter((w) => w.level === 'alerte' && w.date >= today && w.date <= horizon)
      .slice(0, 3)
      .map((w) => ({
        key: w.entryId + w.message,
        date: w.date,
        text: w.message.toLowerCase(),
      })),
  ];
  if (items.length === 0) return null;
  return (
    <MiniPanel title="À vérifier">
      <ul className="attention">
        {items.map((it) => (
          <li key={it.key}>
            <AlertTriangle size={14} aria-hidden />
            <span>
              <button type="button" className="link" onClick={() => app.goTo('calendar', it.date)}>
                {capitalize(formatShort(it.date))}
              </button>{' '}
              · {it.text}
            </span>
          </li>
        ))}
      </ul>
    </MiniPanel>
  );
}
