import { useState } from 'react';
import { AlertTriangle, Check, Plus, Utensils, X } from 'lucide-react';
import { useApp } from '../context';
import { addDays, formatDayMonth, formatNumeric, formatShort, todayISO } from '../domain/dates';
import { entriesOn, mealOf } from '../domain/nutrition';
import { addCustomOn, addMealOn, leftoversInFridge, markOut, nextSlot, pendingPast, planCustom, planRecipe, setSkipped, toggleDone, unmarkOut } from '../domain/plan';
import { amount, shortQty, rescueSuggestions } from '../domain/stock';
import type { PlanEntry } from '../domain/types';
import { MealPlanner } from '../components/MealPlanner';
import { NutritionPanel } from '../components/NutritionPanel';
import { MealCard, MealIngredientsDialog } from '../components/MealCard';
import { ExpensePanel, TomorrowPanel, WeightPanel } from '../components/TodayExtras';
import { Modal } from '../components/Modal';
import { MiniPanel } from '../components/ui';

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Teinte d'urgence partagée : ≤ 2 j danger, ≤ 7 j avertissement, au-delà neutre. */
export const urgencyTone = (days: number) => (days <= 2 ? 'tomato' : days <= 7 ? 'saffron' : 'neutral');

const shortDay = (d: string) => capitalize(formatShort(d).split(' ')[0]);

export function TodayView() {
  const app = useApp();
  const { data, today, store, targets } = app;
  const planned = entriesOn(data, today);
  const out = planned.find((e) => e.kind === 'out');
  const meals = planned.filter((e) => e.kind !== 'out');
  const slots = Math.max(targets.mealsPerDay, meals.length);
  const simulated = today !== todayISO();
  const [addOpen, setAddOpen] = useState(false);
  const [ingredients, setIngredients] = useState<{ cookId: string; entryId: string } | null>(null);
  const setEntries = (fn: (e: PlanEntry[]) => PlanEntry[]) => store.update('plan', (p) => ({ ...p, entries: fn(p.entries) }));

  // La modale suit les entrées vivantes du plan : une quantité modifiée s'y reflète tout de suite.
  const liveCook = ingredients ? data.plan.entries.find((e) => e.id === ingredients.cookId) : undefined;
  const liveEntry = ingredients ? data.plan.entries.find((e) => e.id === ingredients.entryId) ?? liveCook : undefined;

  const addMeal = (recipe?: Parameters<typeof planRecipe>[2], portions = 1, title?: string) => {
    if (title !== undefined) {
      setEntries((e) => (planned.length > 0 ? addCustomOn(e, today, title) : planCustom(e, today, title, portions)));
      return;
    }
    if (!recipe) return;
    setEntries((e) => (planned.length > 0 ? addMealOn(e, today, recipe) : planRecipe(e, today, recipe, portions)));
  };

  const resetSimulation = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('jour');
    window.location.href = url.toString();
  };

  return (
    <div className="page today">
      <header className="today-head">
        <div className="today-headline">
          <h1 className="today-title">Aujourd’hui</h1>
          <span className="today-date num">{formatNumeric(today)}</span>
        </div>
        <div className="today-head-actions">
          {simulated && (
            <span className="sim-chip">
              Date simulée
              <button type="button" onClick={resetSimulation}>
                Revenir à aujourd’hui
              </button>
            </span>
          )}
        </div>
      </header>

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
            <div className="meal-action-bar">
              <button type="button" className="secondary-button is-sm" onClick={() => setEntries((e) => unmarkOut(e, out.id))}>
                <X size={14} aria-hidden /> Finalement à la maison
              </button>
            </div>
          </article>
        ) : (
          <div className={`meal-grid is-${Math.min(slots, 3)}`}>
            {Array.from({ length: slots }, (_, i) => (
              <MealCard
                key={meals[i]?.id ?? `slot-${i}`}
                entry={meals[i]}
                index={i}
                single={slots === 1}
                onAdd={() => setAddOpen(true)}
                onIngredients={(cook, entry) => setIngredients({ cookId: cook.id, entryId: entry.id })}
                onRecipe={app.openRecipe}
                onOut={() => setEntries((e) => markOut(e, today))}
                showOut={i === 0}
              />
            ))}
          </div>
        )}
      </section>

      {!out && (
        <>
          <NutritionPanel />
          <div className="mini-grid">
            <Priorities setEntries={setEntries} />
            <TomorrowPanel />
            <Fridge />
            <WeightPanel />
            <ExpensePanel />
            <Attention />
          </div>
        </>
      )}

      <PendingToast setEntries={setEntries} />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajouter un repas" size="md">
        {addOpen && (
          <MealPlanner
            submitLabel={planned.length > 0 ? 'Ajouter ce repas' : 'Planifier ce repas'}
            date={today}
            fixedPortions={planned.length > 0 ? 1 : undefined}
            onRecipe={(r, n) => {
              addMeal(r, n);
              setAddOpen(false);
            }}
            onCustom={(t, n) => {
              addMeal(undefined, n, t);
              setAddOpen(false);
            }}
          />
        )}
      </Modal>

      <Modal open={!!ingredients} onClose={() => setIngredients(null)} title="Ingrédients" size="lg">
        {liveCook && liveEntry && (
          <MealIngredientsDialog
            cook={liveCook}
            entry={liveEntry}
            onOpenCook={(date) => {
              setIngredients(null);
              app.goTo('calendar', date);
            }}
            onDone={() => setIngredients(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * Les repas passés qui attendent une réponse, en bas à droite.
 * La notification ne prend aucune place dans la page et traite un repas à la fois ;
 * « Pas mangé » clôt le repas sans toucher au stock.
 */
function PendingToast({ setEntries }: { setEntries: (fn: (e: PlanEntry[]) => PlanEntry[]) => void }) {
  const app = useApp();
  const { data, today } = app;
  const [later, setLater] = useState<string[]>([]);
  const pending = pendingPast(data.plan.entries, today, 7).filter((e) => !later.includes(e.id));
  const entry = pending[0];
  if (!entry) return null;

  const meal = mealOf(data, entry);
  const when = entry.date === addDays(today, -1) ? 'Hier' : `${shortDay(entry.date)} ${Number(entry.date.slice(8))}`;
  const name = entry.kind === 'leftover' ? `Reste · ${meal?.name ?? 'Repas'}` : meal?.name ?? 'Repas';

  return (
    <aside className="pending-card" role="status" aria-live="polite" aria-label="Repas en attente">
      <div className="pending-head">
        <p className="pending-kicker">{pending.length > 1 ? `${pending.length} repas en attente` : 'Repas en attente'}</p>
        <button
          type="button"
          className="icon-button pending-close"
          onClick={() => setLater((x) => [...x, entry.id])}
          aria-label="Plus tard"
          title="Plus tard"
        >
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
    .map((s) => ({ food: s.food, daysLeft: s.daysLeft ?? 99, expiry: s.nextExpiry ?? today, atRisk: s.remaining, nextUse: undefined, opened: true }));
  const list = [...base.map((p) => ({ ...p, opened: false })), ...opened].slice(0, 6);
  if (list.length === 0) return null;
  const soon = new Set(data.plan.entries.filter((e) => e.kind === 'cook' && e.date >= today && e.date <= addDays(today, 2)).map((e) => e.recipeId));
  const idea = rescueSuggestions(app.priorities, 4).find((x) => !soon.has(x.recipe.id));
  const slot = nextSlot(data.plan.entries, addDays(today, 1));
  return (
    <MiniPanel
      title="À utiliser vite"
      aside={
        <button type="button" className="link small" onClick={() => app.goTo('stock')}>
          Stock
        </button>
      }
    >
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
          <button type="button" className="secondary-button is-sm" onClick={() => setEntries((e) => planRecipe(e, slot, idea.recipe))} title="La suite du plan glisse d’autant">
            <Plus size={13} aria-hidden /> Planifier {formatShort(slot)}
          </button>
        </div>
      )}
    </MiniPanel>
  );
}

function Fridge() {
  const { data, today } = useApp();
  const items = leftoversInFridge(data.plan.entries, data.recipes, today);
  if (items.length === 0) return null;
  return (
    <MiniPanel title="Au frigo">
      <ul className="plain">
        {items.map((it) => (
          <li key={it.cook.id} className="fridge-row">
            <span>{it.name}</span>
            <span className="muted small num">
              {it.portionsLeft} repas · avant {formatShort(it.eatBefore)}
            </span>
          </li>
        ))}
      </ul>
    </MiniPanel>
  );
}

function Attention() {
  const app = useApp();
  const { today } = app;
  const horizon = addDays(today, 14);
  const items = [
    // Les repas non cochés ont leur propre bloc en haut de la page : pas de doublon ici.
    ...app.forecast.shortages.filter((s) => s.date <= horizon).slice(0, 4).map((s) => ({ key: s.entryId + s.foodId, date: s.date, text: `manque ${amount(app.foods.get(s.foodId), s.missing)}` })),
    ...app.warnings.filter((w) => w.level === 'alerte' && w.date >= today && w.date <= horizon).slice(0, 3).map((w) => ({ key: w.entryId + w.message, date: w.date, text: w.message.toLowerCase() })),
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
