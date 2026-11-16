import { BookOpen, Check, CookingPot, Plus, Refrigerator } from 'lucide-react';
import { useApp } from '../context';
import { formatShort } from '../domain/dates';
import { mealOf, mealOfCook, mealPortion } from '../domain/nutrition';
import { toggleDone } from '../domain/plan';
import { splitAmount } from '../domain/stock';
import type { PlanEntry } from '../domain/types';
import { MealEditor } from './MealEditor';
import { MealPlate } from './MealPlate';
import { Meter } from './ui';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
const targetLabel = (kcal: number) => Math.round(kcal / 25) * 25;

function statusLabel(entry: PlanEntry) {
  if (entry.skipped) return 'Pas mangé';
  return entry.done ? 'Mangé' : 'Prévu';
}

/**
 * Un repas du jour : le plat, ses chiffres pour une portion, et une seule action claire.
 * Une cuisson et un reste se ressemblent, seul le libellé du haut les distingue.
 */
export function MealCard({
  entry,
  index,
  single,
  onAdd,
  onIngredients,
  onRecipe,
}: {
  entry?: PlanEntry;
  index: number;
  single: boolean;
  onAdd: () => void;
  onIngredients: (cook: PlanEntry, entry: PlanEntry, editable: boolean) => void;
  onRecipe: (id: string) => void;
}) {
  const app = useApp();
  const { data, store, foods, targets } = app;

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
  const visibleIngredients = knownIngredients.slice(0, 4).map(({ item, food }) => ({
    key: food.id,
    ...splitAmount(food, item.qty),
  }));
  const hiddenIngredients = knownIngredients.length - visibleIngredients.length;

  return (
    <article className={`meal-card ${single ? 'is-single' : ''} ${done ? 'is-done' : ''}`}>
      <div className="meal-card-main">
        <div className="meal-main-body">
          <div className="meal-card-top">
            <span className="meal-slot num">{String(index + 1).padStart(2, '0')}</span>
            <span className={`tag ${entry.kind === 'cook' ? 'tag-cook' : 'tag-left'}`}>
              {entry.kind === 'cook' ? (
                <>
                  <CookingPot size={12} aria-hidden /> Cuisson{meal.portions > 1 ? ` · ${meal.portions} repas` : ''}
                </>
              ) : (
                <>
                  <Refrigerator size={12} aria-hidden /> Reste du {formatShort(meal.cook.date)}
                </>
              )}
            </span>
            <span className={`meal-state ${done ? 'is-done' : ''}`}>
              {done && <Check size={13} aria-hidden />}
              {statusLabel(entry)}
            </span>
          </div>

          <h2 className="meal-title">{meal.name}</h2>

          {empty ? (
            <p className="meal-note">
              Ingrédients à compléter pour compter ce repas dans le bilan.{' '}
              <button type="button" className="link" onClick={() => onIngredients(meal.cook, entry, editable)}>
                Ajouter les ingrédients
              </button>
            </p>
          ) : (
            <p className="meal-note">
              {meal.portions > 1 ? `Une portion sur ${meal.portions}` : 'La portion du jour'}
              {meal.adjusted ? ' · quantités ajustées' : ''}
            </p>
          )}

          {single && !empty && knownIngredients.length > 0 && (
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

        {!empty && (
          <div className="meal-recipe-actions">
            <button type="button" className="secondary-button is-sm" onClick={() => onIngredients(meal.cook, entry, editable)}>
              Ingrédients
            </button>
            {meal.recipe && (
              <button type="button" className="text-button is-sm" onClick={() => onRecipe(meal.recipe!.id)}>
                <BookOpen size={14} aria-hidden /> Recette
              </button>
            )}
          </div>
        )}
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

        <div className="meal-actions">
          {done ? (
            <div className="meal-done-row">
              <button type="button" className="text-button is-sm" onClick={() => setEntries((e) => toggleDone(e, entry.id))}>
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="primary-button meal-eat"
              onClick={() => setEntries((e) => toggleDone(e, entry.id))}
              title="Marquer ce repas comme mangé : ses ingrédients sortent du stock"
            >
              <Check size={16} aria-hidden /> Marquer comme mangé
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * La fiche d'ingrédients d'un repas : à gauche les quantités, à droite les valeurs qui suivent
 * en direct. Les modifications restent sur ce repas, jamais sur la fiche de la bibliothèque.
 */
export function MealIngredientsDialog({
  cook,
  entry,
  onOpenCook,
  onDone,
}: {
  cook: PlanEntry;
  entry: PlanEntry;
  onOpenCook: (date: string) => void;
  onDone: () => void;
}) {
  const app = useApp();
  const { data, targets, foods } = app;
  const meal = mealOfCook(data.recipes, cook);
  const portion = mealPortion(foods, meal, entry.eaten ?? 1);
  const perMeal = targets.kcal * targets.mealShare;
  const editable = entry.kind === 'cook';
  const n = portion.nutrients;

  return (
    <div className="ingredients-dialog">
      <div className="ingredients-main">
        <div className="dialog-headline">
          <p className="dialog-kicker">{meal.recipe ? 'Recette' : 'Plat maison'}</p>
          <h3 className="dialog-dish">{meal.name}</h3>
          {entry.done && <p className="hint">Repas déjà validé : modifier les quantités ajuste le stock.</p>}
          {entry.kind === 'leftover' && (
            <p className="hint">
              Ce reste vient de la cuisson du {formatShort(meal.cook.date)}. Les quantités se modifient sur la cuisson d’origine.{' '}
              <button type="button" className="link" onClick={() => onOpenCook(meal.cook.date)}>
                Voir la cuisson
              </button>
            </p>
          )}
        </div>
        <MealEditor cook={cook} editable={editable} />
      </div>

      <aside className="ingredients-preview" aria-label="Valeurs nutritionnelles du repas">
        <p className="dialog-kicker">Ce repas</p>
        <p className="preview-kcal">
          <b className="num">{fr(n.kcal)}</b> <span>kcal</span>
        </p>
        <p className="preview-target num">cible repas · {fr(targetLabel(perMeal))} kcal</p>

        <dl className="preview-grid">
          <div>
            <dt>Protéines</dt>
            <dd className="num">{fr(n.protein)} g</dd>
          </div>
          <div>
            <dt>Fibres</dt>
            <dd className="num">{fr(n.fiber)} g</dd>
          </div>
          <div>
            <dt>Glucides</dt>
            <dd className="num">{fr(n.carbs)} g</dd>
          </div>
          <div>
            <dt>Lipides</dt>
            <dd className="num">{fr(n.fat)} g</dd>
          </div>
          <div>
            <dt>Graisses sat.</dt>
            <dd className="num">{fr(n.satFat)} g</dd>
          </div>
          <div>
            <dt>Sel</dt>
            <dd className="num">{Math.round(n.salt * 10) / 10} g</dd>
          </div>
        </dl>

        <div className="preview-bars">
          <div>
            <span>Énergie</span>
            <Meter value={n.kcal} target={perMeal} tone="ink" label="Énergie du repas" />
          </div>
          <div>
            <span>Protéines</span>
            <Meter value={n.protein} target={targets.protein * targets.mealShare} tone="ink" label="Protéines du repas" />
          </div>
          <div>
            <span>Fibres</span>
            <Meter value={n.fiber} target={targets.fiber * targets.mealShare} tone="ink" label="Fibres du repas" />
          </div>
        </div>

        <p className="hint">Le bilan du jour se met à jour à chaque modification.</p>
      </aside>

      <div className="modal-foot">
        <button type="button" className="primary-button" onClick={onDone}>
          Terminé
        </button>
      </div>
    </div>
  );
}
