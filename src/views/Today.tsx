import { useState } from 'react';
import { AlertTriangle, ArrowRight, BookOpen, Check, ChevronDown, CookingPot, Plus, Refrigerator, Utensils, X } from 'lucide-react';
import { useApp } from '../context';
import { addDays, diffDays, formatDayMonth, formatLong, formatShort } from '../domain/dates';
import { itemsNutrients, mealOf, mealPortion } from '../domain/nutrition';
import { leftoversInFridge, markOut, newId, nextSlot, planCustom, planRecipe, toggleDone, unmarkOut } from '../domain/plan';
import { amount, rescueSuggestions } from '../domain/stock';
import type { PlanEntry, Recipe } from '../domain/types';
import { MealPlanner } from '../components/MealPlanner';
import { DayBalanceCard } from '../components/Balance';
import { MealEditor } from '../components/MealEditor';
import { Cover } from '../components/recipe';
import { Section, kcal } from '../components/ui';

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Teinte d'urgence partagée : ≤ 2 j danger, ≤ 7 j avertissement, au-delà neutre. */
export const urgencyTone = (days: number) => (days <= 2 ? 'tomato' : days <= 7 ? 'saffron' : 'neutral');

const shortDay = (d: string) => capitalize(formatShort(d).split(' ')[0]);

export function TodayView() {
  const app = useApp();
  const { data, today, store } = app;
  const entry = data.plan.entries.find((e) => e.date === today);
  const dayIndex = diffDays(data.plan.startDate, today) + 1;
  const planDays = diffDays(data.plan.startDate, app.planEnd) + 1;
  const setEntries = (fn: (e: PlanEntry[]) => PlanEntry[]) => store.update('plan', (p) => ({ ...p, entries: fn(p.entries) }));

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <h1 className="display-title is-date">{formatLong(today)}</h1>
        {data.plan.entries.length > 0 && dayIndex >= 1 && dayIndex <= planDays && (
          <button type="button" className="secondary-button" onClick={() => app.goTo('calendar', today)}>
            Jour <span className="num">{dayIndex}</span> sur <span className="num">{planDays}</span>
            <ArrowRight size={14} aria-hidden />
          </button>
        )}
        {data.plan.entries.length > 0 && dayIndex < 1 && (
          <button type="button" className="secondary-button" onClick={() => app.goTo('calendar', data.plan.startDate)}>
            Le plan commence {formatShort(data.plan.startDate)} <ArrowRight size={14} aria-hidden />
          </button>
        )}
      </header>

      <div className="today-grid">
        <div className="today-main">
          <Section title="Au menu">
            <MealHero entry={entry} setEntries={setEntries} />
          </Section>
          <NextDays />
        </div>
        <div className="today-side">
          <Section title="Bilan du jour" aside={entry && entry.kind !== 'out' ? <span className="muted small">{entry.done ? 'mangé' : 'prévu'}</span> : undefined}>
            <DayBalanceCard date={today} compact />
          </Section>
          <Priorities setEntries={setEntries} />
          <Fridge />
          <Attention />
        </div>
      </div>

      <Snacks />
    </div>
  );
}

function MealHero({ entry, setEntries }: { entry?: PlanEntry; setEntries: (fn: (e: PlanEntry[]) => PlanEntry[]) => void }) {
  const app = useApp();
  const { data, today } = app;
  const [open, setOpen] = useState(false);
  const meal = mealOf(data, entry);

  if (!entry) {
    return (
      <section className="hero hero-empty" aria-label="Repas du jour">
        <p className="hero-title">Rien de prévu</p>
        <MealPlanner
          submitLabel="Cuisiner aujourd’hui"
          onRecipe={(r, n) => setEntries((e) => planRecipe(e, today, r, n))}
          onCustom={(t, n) => setEntries((e) => planCustom(e, today, t, n))}
        />
        <button type="button" className="text-button" onClick={() => setEntries((e) => markOut(e, today))}>
          <Utensils size={15} aria-hidden /> Je mange dehors
        </button>
      </section>
    );
  }
  if (entry.kind === 'out' || !meal) {
    return (
      <section className="hero hero-empty" aria-label="Repas du jour">
        <span className="tag tag-out"><Utensils size={13} aria-hidden /> Dehors</span>
        <p className="hero-title">Repas dehors</p>
        <button type="button" className="secondary-button" onClick={() => setEntries((e) => unmarkOut(e, entry.id))}>
          <X size={15} aria-hidden /> Finalement à la maison
        </button>
      </section>
    );
  }
  const p = mealPortion(app.foods, meal);
  const rests = data.plan.entries.filter((e) => e.kind === 'leftover' && e.batchId === meal.cook.id && e.date > today);
  const cover = meal.recipe ?? ({ id: 'maison', name: meal.name, dish: 'Plat', status: 'à découvrir', favorite: false, steps: [] } as Recipe);

  return (
    <section className={`hero ${entry.done ? 'is-done' : ''}`} aria-label="Repas du jour">
      <div className={`hero-body ${meal.recipe?.cover ? 'has-cover' : ''}`}>
        {meal.recipe?.cover && <Cover recipe={cover} ratio="photo" className="hero-cover" />}
        <div className="hero-text">
          <span className={`tag ${entry.kind === 'cook' ? 'tag-cook' : 'tag-left'}`}>
            {entry.kind === 'cook' ? (
              <>
                <CookingPot size={13} aria-hidden /> {meal.portions > 1 ? `Cuisson · ${meal.portions} repas` : 'Cuisson'}
              </>
            ) : (
              <>
                <Refrigerator size={13} aria-hidden /> Reste du {formatShort(meal.cook.date)}
              </>
            )}
          </span>
          <h2 className="hero-title">{meal.name}</h2>
          <p className="hero-facts num">
            {meal.ingredients.length ? (
              <>
                {Math.round(p.nutrients.kcal)} kcal · {Math.round(p.nutrients.protein)} g de protéines · {Math.round(p.nutrients.fiber)} g de fibres
              </>
            ) : (
              <span className="muted">Ingrédients à compléter</span>
            )}
          </p>
          {rests.length > 0 && <p className="muted small">Reste {rests.map((r) => formatShort(r.date)).join(', ')}</p>}
          <div className="hero-actions">
            <button type="button" className={entry.done ? 'done-button' : 'primary-button'} onClick={() => setEntries((e) => toggleDone(e, entry.id))} aria-pressed={!!entry.done}>
              <Check size={16} aria-hidden /> {entry.done ? 'Fait' : entry.kind === 'cook' ? 'C’est fait' : 'Mangé'}
            </button>
            {entry.kind === 'cook' && (
              <button type="button" className="secondary-button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
                Ingrédients <ChevronDown size={15} className={`chev ${open ? 'up' : ''}`} aria-hidden />
              </button>
            )}
            {meal.recipe && (
              <button type="button" className="secondary-button" onClick={() => app.openRecipe(meal.recipe!.id)}>
                <BookOpen size={15} aria-hidden /> Recette
              </button>
            )}
            {!entry.done && (
              <button type="button" className="text-button" onClick={() => setEntries((e) => markOut(e, today))} title="Le plan glisse d’un jour">
                <Utensils size={15} aria-hidden /> Dehors
              </button>
            )}
          </div>
        </div>
      </div>
      {open && entry.kind === 'cook' && (
        <div className="hero-ingredients">
          <MealEditor cook={entry} editable={!entry.done} />
        </div>
      )}
    </section>
  );
}

function NextDays() {
  const app = useApp();
  const { data, today } = app;
  const days = [1, 2, 3, 4].map((i) => addDays(today, i));
  if (!days.some((d) => data.plan.entries.some((e) => e.date === d))) return null;
  return (
    <Section title="Les prochains jours">
      <ul className="next-days">
        {days.map((d) => {
          const e = data.plan.entries.find((x) => x.date === d);
          const meal = mealOf(data, e);
          return (
            <li key={d}>
              <button type="button" className="next-day" onClick={() => app.goTo('calendar', d)}>
                <span className="next-date">{shortDay(d)} <span className="num">{Number(d.slice(8))}</span></span>
                <span className="next-name">{e?.kind === 'out' ? 'Dehors' : meal?.name ?? 'Libre'}</span>
                <span className="next-kind">
                  {e?.kind === 'cook' && (
                    <>
                      <CookingPot size={12} aria-hidden /> cuisson
                    </>
                  )}
                  {e?.kind === 'leftover' && (
                    <>
                      <Refrigerator size={12} aria-hidden /> reste
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Priorities({ setEntries }: { setEntries: (fn: (e: PlanEntry[]) => PlanEntry[]) => void }) {
  const app = useApp();
  const { data, today } = app;
  const list = app.priorities.slice(0, 5);
  if (list.length === 0) return null;
  const soon = new Set(data.plan.entries.filter((e) => e.kind === 'cook' && e.date >= today && e.date <= addDays(today, 2)).map((e) => e.recipeId));
  const idea = rescueSuggestions(app.priorities, 4).find((x) => !soon.has(x.recipe.id));
  const slot = nextSlot(data.plan.entries, addDays(today, 1));
  return (
    <Section title="À utiliser vite" aside={<button type="button" className="link small" onClick={() => app.goTo('stock')}>Stock</button>}>
      <ul className="prio">
        {list.map((p) => (
          <li key={p.food.id} className="prio-row" title={p.nextUse ? `Prochain plat : ${formatShort(p.nextUse)}` : 'Aucun plat prévu'}>
            <span className="prio-name">{p.food.name}</span>
            <span className="prio-qty muted small num">{p.atRisk > 0 ? `${amount(p.food, p.atRisk)} en trop` : 'prévu bientôt'}</span>
            <span className={`pill pill-${urgencyTone(p.daysLeft)}`} title={`Se garde jusqu’au ${formatDayMonth(p.expiry)}`}>
              {p.daysLeft < 0 ? 'dépassé' : p.daysLeft === 0 ? 'auj.' : `${p.daysLeft} j`}
            </span>
          </li>
        ))}
      </ul>
      {idea && (
        <div className="idea-line">
          <button type="button" className="link" onClick={() => app.openRecipe(idea.recipe.id)}>{idea.recipe.name}</button>
          <button type="button" className="secondary-button is-sm" onClick={() => setEntries((e) => planRecipe(e, slot, idea.recipe))} title="La suite du plan glisse d’autant">
            Planifier {formatShort(slot)}
          </button>
        </div>
      )}
    </Section>
  );
}

function Fridge() {
  const { data, today } = useApp();
  const items = leftoversInFridge(data.plan.entries, data.recipes, today);
  if (items.length === 0) return null;
  return (
    <Section title="Au frigo">
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
    </Section>
  );
}

function Attention() {
  const app = useApp();
  const { today } = app;
  const horizon = addDays(today, 14);
  const items = [
    ...app.warnings.filter((w) => w.message.startsWith('Pas encore coché')).slice(0, 3).map((w) => ({ key: w.entryId, date: w.date, text: 'pas coché' })),
    ...app.forecast.shortages.filter((s) => s.date <= horizon).slice(0, 4).map((s) => ({ key: s.entryId + s.foodId, date: s.date, text: `manque ${amount(app.foods.get(s.foodId), s.missing)}` })),
    ...app.warnings.filter((w) => w.level === 'alerte' && w.date >= today && w.date <= horizon).slice(0, 3).map((w) => ({ key: w.entryId + w.message, date: w.date, text: w.message.toLowerCase() })),
  ];
  if (items.length === 0) return null;
  return (
    <Section title="À vérifier">
      <ul className="attention">
        {items.map((it) => (
          <li key={it.key}>
            <AlertTriangle size={14} aria-hidden />
            <span>
              <button type="button" className="link" onClick={() => app.goTo('calendar', it.date)}>{capitalize(formatShort(it.date))}</button> · {it.text}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Snacks() {
  const app = useApp();
  const { data, today, store } = app;
  const snacks = data.journal.snacks.filter((s) => s.date === today);
  const ideas = data.snackIdeas
    .filter((idea) => idea.items.every((i) => (app.stock.get(i.foodId)?.remaining ?? 0) + 1e-6 >= i.qty))
    .map((idea) => ({ idea, n: itemsNutrients(app.foods, idea.items) }));
  const total = snacks.reduce((a, s) => a + itemsNutrients(app.foods, s.items).kcal, 0);

  return (
    <Section title="Le soir" aside={<span className="muted small num">{snacks.length > 0 ? kcal(total) : 'en kcal'}</span>}>
      {snacks.length > 0 && (
        <ul className="chips">
          {snacks.map((s) => (
            <li key={s.id}>
              <span className="chip chip-on">
                {s.label}
                <span className="num chip-meta">{Math.round(itemsNutrients(app.foods, s.items).kcal)}</span>
                <button type="button" className="chip-x" aria-label={`Retirer ${s.label}`} onClick={() => store.update('journal', (j) => ({ ...j, snacks: j.snacks.filter((x) => x.id !== s.id) }))}>
                  <X size={13} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {ideas.length === 0 && snacks.length === 0 && <p className="hint">Les idées pour le soir apparaissent avec ce que tu as en stock.</p>}
      <ul className="chips">
        {ideas.map(({ idea, n }) => (
          <li key={idea.id}>
            <button
              type="button"
              className="chip"
              title={[idea.note, `${Math.round(n.protein)} g de protéines`].filter(Boolean).join(' · ')}
              onClick={() => store.update('journal', (j) => ({ ...j, snacks: [...j.snacks, { id: newId('s'), date: today, label: idea.name, items: idea.items }] }))}
            >
              <Plus size={13} aria-hidden /> {idea.name}
              <span className="num chip-meta">{Math.round(n.kcal)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
