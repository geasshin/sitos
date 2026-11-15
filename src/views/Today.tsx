import { useState } from 'react';
import { AlertTriangle, ArrowRight, BookOpen, Check, ChevronDown, CookingPot, Refrigerator, Utensils, X } from 'lucide-react';
import { useApp } from '../context';
import { addDays, diffDays, formatDayMonth, formatLong, formatShort } from '../domain/dates';
import { dayNutrition, entriesOn, mealOf, mealPortion } from '../domain/nutrition';
import { leftoversInFridge, markOut, nextSlot, pendingPast, planCustom, planRecipe, setEaten, setSkipped, toggleDone, unmarkOut } from '../domain/plan';
import { amount, shortQty, rescueSuggestions } from '../domain/stock';
import type { PlanEntry, Recipe } from '../domain/types';
import { MealPlanner } from '../components/MealPlanner';
import { DayBalanceCard } from '../components/Balance';
import { MealEditor } from '../components/MealEditor';
import { EveningPicker } from '../components/EveningPicker';
import { PortionPrompt } from '../components/PortionPrompt';
import { Cover } from '../components/recipe';
import { Section } from '../components/ui';

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Teinte d'urgence partagée : ≤ 2 j danger, ≤ 7 j avertissement, au-delà neutre. */
export const urgencyTone = (days: number) => (days <= 2 ? 'tomato' : days <= 7 ? 'saffron' : 'neutral');

const shortDay = (d: string) => capitalize(formatShort(d).split(' ')[0]);

export function TodayView() {
  const app = useApp();
  const { data, today, store } = app;
  const entry = data.plan.entries.find((e) => e.date === today);
  const eveningKcal = dayNutrition(data, app.foods, today).snacks.nutrients.kcal;
  const dayIndex = diffDays(data.plan.startDate, today) + 1;
  const planDays = diffDays(data.plan.startDate, app.planEnd) + 1;
  const setEntries = (fn: (e: PlanEntry[]) => PlanEntry[]) => store.update('plan', (p) => ({ ...p, entries: fn(p.entries) }));

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <h1 className="display-title is-date">{formatLong(today)}</h1>
        {data.plan.entries.length > 0 && dayIndex >= 1 && dayIndex <= planDays && (
          <button type="button" className="secondary-button" onClick={() => app.goTo('calendar', app.planEnd)} title="Voir la fin du plan">
            Plan jusqu’au {formatShort(app.planEnd)}
            <ArrowRight size={14} aria-hidden />
          </button>
        )}
        {data.plan.entries.length > 0 && dayIndex < 1 && (
          <button type="button" className="secondary-button" onClick={() => app.goTo('calendar', data.plan.startDate)}>
            Le plan commence {formatShort(data.plan.startDate)} <ArrowRight size={14} aria-hidden />
          </button>
        )}
      </header>

      <ToSettle setEntries={setEntries} />

      <div className="today-grid">
        <div className="today-main">
          <Section title="Au menu">
            <MealHero entry={entry} setEntries={setEntries} />
          </Section>
          <Section
            title="Le soir"
            aside={
              <span className="muted small num">
                {eveningKcal > 0 ? `${Math.round(eveningKcal).toLocaleString('fr-FR')} kcal au total` : 'rien pour l’instant'}
              </span>
            }
          >
            <EveningPicker date={today} />
          </Section>
        </div>
        <div className="today-side">
          <Section title="Bilan du jour" aside={entry && entry.kind !== 'out' ? <span className="muted small">{entry.done ? 'mangé' : 'prévu'}</span> : undefined}>
            <DayBalanceCard date={today} mode="today" />
          </Section>
          <NextDays />
          <Priorities setEntries={setEntries} />
          <Fridge />
          <Attention />
        </div>
      </div>
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
  const p = mealPortion(app.foods, meal, entry.eaten ?? 1);
  const perMeal = app.targets.kcal * app.targets.mealShare;
  const small = p.nutrients.kcal > 0 && p.nutrients.kcal < perMeal * 0.75;
  const extra = entriesOn(data, today).filter((e) => e.id !== entry.id && e.kind !== 'out');
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
          {extra.length > 0 && (
            <p className="muted small">
              Aussi aujourd’hui : {extra.map((e) => mealOf(data, e)?.name ?? 'repas').join(', ')}
              {' · '}
              <button type="button" className="link small" onClick={() => app.goTo('calendar', today)}>voir</button>
            </p>
          )}
          {small && entry.kind === 'cook' && (
            <p className="hero-hint">
              Portion un peu juste pour un repas principal : {Math.round(perMeal).toLocaleString('fr-FR')} kcal visées, {Math.round(p.nutrients.kcal).toLocaleString('fr-FR')} ici.{' '}
              <button type="button" className="link small" onClick={() => setOpen(true)}>Ajuster la portion</button>
            </p>
          )}
          <div className="hero-actions">
            <button
              type="button"
              className={entry.done ? 'done-button' : 'primary-button'}
              onClick={() => setEntries((e) => toggleDone(e, entry.id))}
              aria-pressed={!!entry.done}
              title={entry.done ? 'Décocher : le stock remonte' : 'Cocher sort les ingrédients du stock'}
            >
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
          {entry.kind === 'cook' && (
            <PortionPrompt entry={entry} onPick={(k) => setEntries((e) => setEaten(e, entry.id, k))} />
          )}
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

/**
 * Les repas passés qui attendent une réponse. Tant qu'ils ne sont pas cochés, rien ne sort
 * du stock : c'est la règle, elle est dite ici en clair. « Pas mangé » les clôt sans toucher au stock.
 */
function ToSettle({ setEntries }: { setEntries: (fn: (e: PlanEntry[]) => PlanEntry[]) => void }) {
  const app = useApp();
  const { data, today } = app;
  const pending = pendingPast(data.plan.entries, today, 7);
  if (pending.length === 0) return null;
  return (
    <section className="settle" aria-label="Repas passés à régler">
      <div className="settle-head">
        <p className="settle-title">
          {pending.length} repas {pending.length > 1 ? 'attendent' : 'attend'} une réponse
        </p>
        <p className="hint">Tant qu’un repas n’est pas coché, il ne sort rien du stock.</p>
      </div>
      <ul className="settle-list">
        {pending.slice(0, 4).map((e) => {
          const meal = mealOf(data, e);
          return (
            <li key={e.id} className="settle-row">
              <span className="settle-when">
                {e.date === addDays(today, -1) ? 'Hier' : <>{shortDay(e.date)} <span className="num">{Number(e.date.slice(8))}</span></>}
              </span>
              <span className="settle-name">{e.kind === 'leftover' ? `Reste · ${meal?.name ?? ''}` : (meal?.name ?? 'Repas')}</span>
              <span className="settle-actions">
                <button type="button" className="secondary-button is-sm" onClick={() => setEntries((x) => toggleDone(x, e.id))}>
                  <Check size={14} aria-hidden /> Mangé
                </button>
                <button type="button" className="secondary-button is-sm" onClick={() => setEntries((x) => setSkipped(x, e.id))}>
                  Pas mangé
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {pending.length > 4 && (
        <button type="button" className="link small" onClick={() => app.goTo('calendar', pending[4].date)}>
          Voir les {pending.length - 4} autres
        </button>
      )}
    </section>
  );
}

function NextDays() {
  const app = useApp();
  const { data, today } = app;
  const days = [1, 2, 3].map((i) => addDays(today, i));
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
            <span className="prio-qty muted small num">{p.atRisk > 0 ? `${shortQty(p.food, p.atRisk)} non prévu` : 'prévu bientôt'}</span>
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
    // Les repas non cochés ont leur propre bloc en haut de la page : pas de doublon ici.
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
