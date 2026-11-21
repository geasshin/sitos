import { BookOpen, Check, Plus, Refrigerator, Utensils } from 'lucide-react';
import { useApp } from '../context';
import { formatShort } from '../domain/dates';
import { mealOf, mealPortion } from '../domain/nutrition';
import { toggleDone } from '../domain/plan';
import { splitAmount } from '../domain/stock';
import type { ISODate, PlanEntry } from '../domain/types';
import { MealPlate } from './MealPlate';
import { Cover } from './recipe';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
const targetLabel = (kcal: number) => Math.round(kcal / 25) * 25;

function statusLabel(entry: PlanEntry) {
  if (entry.skipped) return 'Pas mangé';
  return entry.done ? 'Mangé' : '';
}

/**
 * Un repas du jour : le plat, sa courte liste d'ingrédients, ses chiffres pour une portion
 * et une seule action claire. Une recette, un plat maison et un reste se lisent au premier regard.
 */
export function MealCard({
  entry,
  index,
  single,
  date,
  onAdd,
  onIngredients,
  onRecipe,
  onOut,
  showOut,
}: {
  entry?: PlanEntry;
  index: number;
  single: boolean;
  date: ISODate;
  onAdd: () => void;
  onIngredients: (cook: PlanEntry, entry: PlanEntry, editable: boolean) => void;
  onRecipe: (id: string) => void;
  onOut: () => void;
  showOut: boolean;
}) {
  const app = useApp();
  const { data, store, foods, targets, today } = app;
  const future = date > today;

  if (!entry) {
    return (
      <button type="button" className={`meal-card is-empty ${single ? 'is-single' : ''}`} onClick={onAdd}>
        <span className="meal-slot num">{String(index + 1).padStart(2, '0')}</span>
        <span className="meal-empty-plus" aria-hidden>
          <Plus size={20} strokeWidth={1.8} />
        </span>
        <span className="meal-empty-title">{single ? 'Ajouter le repas du jour' : `Ajouter le repas ${index + 1}`}</span>
        <span className="meal-empty-text">Une recette ou un plat maison</span>
      </button>
    );
  }

  const meal = mealOf(data, entry);
  if (!meal) return null;
  const portion = mealPortion(foods, meal, entry.eaten ?? 1);
  const perMeal = targets.kcal * targets.mealShare;
  const done = !!entry.done;
  const empty = meal.ingredients.length === 0;
  const setEntries = (fn: (e: PlanEntry[]) => PlanEntry[]) => store.update('plan', (p) => ({ ...p, entries: fn(p.entries) }));
  const editable = entry.kind === 'cook';
  const knownIngredients = meal.ingredients.flatMap((item) => {
    const food = foods.get(item.foodId);
    return food ? [{ item, food }] : [];
  });
  const visibleIngredients = knownIngredients.slice(0, 6).map(({ item, food }) => ({
    key: food.id,
    ...splitAmount(food, item.qty),
  }));
  const hiddenIngredients = knownIngredients.length - visibleIngredients.length;
  return (
    <article className={`meal-card ${single ? 'is-single' : ''} ${done ? 'is-done' : ''}`}>
      <div className="meal-card-main">
        <div className="meal-main-body">
          <div className="meal-card-label-row">
            <span className="meal-card-label">
              <Utensils size={14} className="module-title-icon" aria-hidden /> {single ? 'Repas principal' : `Repas ${index + 1}`}
            </span>
          </div>

          <div className="meal-heading-row">
            <span className="meal-slot num">{String(index + 1).padStart(2, '0')}</span>
            <h2 className="meal-title">{meal.name}</h2>
          </div>

          {(entry.kind === 'leftover' || statusLabel(entry)) && (
            <div className="meal-card-top">
              {entry.kind === 'leftover' && (
                <span className="tag tag-left">
                  <Refrigerator size={12} aria-hidden /> Reste du {formatShort(meal.cook.date)}
                </span>
              )}
              {statusLabel(entry) && (
                <span className="meal-state is-done">
                  <Check size={13} aria-hidden /> {statusLabel(entry)}
                </span>
              )}
            </div>
          )}

          {empty ? (
            <p className="meal-note">
              Ingrédients à compléter pour compter ce repas dans le bilan.{' '}
              <button type="button" className="link" onClick={() => onIngredients(meal.cook, entry, editable)}>
                Ajouter les ingrédients
              </button>
            </p>
          ) : (
            meal.portions > 1 && <p className="meal-note">Une portion sur {meal.portions}</p>
          )}

          {!empty && (
            <div className={`meal-content-row ${single && meal.recipe?.cover ? 'has-cover' : ''}`}>
              {single && meal.recipe?.cover && (
                <div className="meal-visual" role="img" aria-label="Photo de la recette">
                  <Cover recipe={meal.recipe} ratio="square" className="meal-visual-media" />
                </div>
              )}

              {knownIngredients.length > 0 && (
                <ul className="meal-ingredient-rail" aria-label="Ingrédients du repas">
                  {visibleIngredients.map((chip, i) => (
                    <li key={`${chip.key}-${i}`} className="meal-chip">
                      <span className="meal-chip-qty num">{chip.qty}</span>
                      <span className="meal-chip-name">{chip.label}</span>
                    </li>
                  ))}
                  {hiddenIngredients > 0 && <li className="meal-chip is-more num">+{hiddenIngredients}</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="meal-card-side">
        {single && <MealPlate ingredients={meal.ingredients} foods={foods} count={knownIngredients.length} />}

        <dl className="meal-stats">
          <div className="meal-stat">
            <dt>Énergie</dt>
            <dd>
              <b className="num">{empty ? '—' : fr(portion.nutrients.kcal)}</b>
              {!empty && <span> kcal</span>}
            </dd>
            <span className="meal-stat-note num">{empty ? 'à compléter' : `cible repas · ${fr(targetLabel(perMeal))} kcal`}</span>
          </div>
          <div className="meal-stat">
            <dt>Protéines</dt>
            <dd>
              <b className="num">{empty ? '—' : fr(portion.nutrients.protein)}</b>
              {!empty && <span> g</span>}
            </dd>
          </div>
          <div className="meal-stat">
            <dt>Fibres</dt>
            <dd>
              <b className="num">{empty ? '—' : fr(portion.nutrients.fiber)}</b>
              {!empty && <span> g</span>}
            </dd>
          </div>
        </dl>
      </div>

      <div className="meal-action-bar">
        <div className="meal-secondary-actions">
          <button type="button" className="secondary-button is-sm" onClick={() => onIngredients(meal.cook, entry, editable)}>
            Modifier les ingrédients
          </button>
          {meal.recipe && (
            <button type="button" className="secondary-button is-sm" onClick={() => onRecipe(meal.recipe!.id)}>
              <BookOpen size={14} aria-hidden /> Voir la recette
            </button>
          )}
          {showOut && (
            <button type="button" className="secondary-button is-sm" onClick={onOut}>
              <Utensils size={14} aria-hidden /> Je mange dehors
            </button>
          )}
        </div>
        {done ? (
          <button
            type="button"
            className="secondary-button is-sm meal-eat"
            onClick={() => setEntries((e) => toggleDone(e, entry.id))}
          >
            Je n’ai pas mangé
          </button>
        ) : future ? null : (
          <button
            type="button"
            className="primary-button is-sm meal-eat"
            disabled={empty}
            onClick={() => setEntries((e) => toggleDone(e, entry.id))}
            title="Ce repas sort du stock : ses ingrédients sont déduits et le bilan est validé"
          >
            <Check size={15} aria-hidden /> J’ai mangé
          </button>
        )}
      </div>
    </article>
  );
}
