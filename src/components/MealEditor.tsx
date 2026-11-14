import { useEffect, useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { useApp } from '../context';
import { mealOfCook, mealPortion } from '../domain/nutrition';
import { newId, renameCook, setIngredients, setPortions } from '../domain/plan';
import { amount, fraction, splitAmount } from '../domain/stock';
import type { Food, Ingredient, PlanEntry, Unit } from '../domain/types';
import { PortionStepper } from './MealPlanner';

const unitWord = (f?: Food) => (f?.unit === 'pièce' ? 'pc' : f?.unit ?? '');
const parse = (s: string) => Number(s.replace(',', '.').trim());
const showQty = (f: Food | undefined, q: number) => (f?.unit === 'pièce' ? fraction(q) : String(Math.round(q * 10) / 10).replace('.', ','));

/**
 * Les ingrédients d'UNE cuisson du calendrier. Toute modification reste sur ce repas :
 * la fiche de la bibliothèque ne bouge pas, et « Revenir à la fiche » efface l'ajustement.
 */
export function MealEditor({ cook, editable }: { cook: PlanEntry; editable: boolean }) {
  const app = useApp();
  const { data, store } = app;
  const meal = mealOfCook(data.recipes, cook);
  const p = mealPortion(app.foods, meal);
  const setEntries = (fn: (e: PlanEntry[]) => PlanEntry[]) => store.update('plan', (pl) => ({ ...pl, entries: fn(pl.entries) }));
  const commit = (list: Ingredient[] | undefined) => setEntries((e) => setIngredients(e, cook.id, list));

  return (
    <div className="meal-editor">
      {meal.custom && editable && <TitleField cook={cook} onRename={(t) => setEntries((e) => renameCook(e, cook.id, t))} />}
      <div className="editor-head">
        {editable ? (
          <>
            <span className="small">Pour</span>
            <PortionStepper value={meal.portions} onChange={(n) => setEntries((e) => setPortions(e, data.recipes, cook.id, n))} />
            <span className="small">repas</span>
          </>
        ) : (
          <span className="small">Pour {meal.portions} repas</span>
        )}
      </div>

      {meal.ingredients.length === 0 ? (
        <p className="hint">Pas encore d’ingrédients. Ajoute ceux du plat : ils sortiront du stock une fois coché.</p>
      ) : (
        <ul className="ing-list">
          {meal.ingredients.map((ing, i) => (
            <IngredientRow
              key={`${ing.foodId}-${i}`}
              ing={ing}
              editable={editable}
              done={!!cook.done}
              onQty={(q) => commit(meal.ingredients.map((x, j) => (j === i ? { ...x, qty: q } : x)))}
              onRemove={() => commit(meal.ingredients.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}

      <div className="editor-foot">
        {editable && <AddIngredient onAdd={(ing) => commit([...meal.ingredients, ing])} />}
        {meal.ingredients.length > 0 && (
          <span className="editor-kcal num" title="Par repas, estimation">
            {Math.round(p.nutrients.kcal)} kcal · {Math.round(p.nutrients.protein)} g prot. par repas
          </span>
        )}
      </div>

      {meal.adjusted && (
        <p className="adjusted">
          <span>Quantités propres à ce repas, ta fiche n’a pas changé.</span>
          {editable && (
            <button type="button" className="text-button is-sm" onClick={() => commit(undefined)}>
              <RotateCcw size={14} aria-hidden /> Revenir à la fiche
            </button>
          )}
        </p>
      )}
    </div>
  );
}

function TitleField({ cook, onRename }: { cook: PlanEntry; onRename: (t: string) => void }) {
  const [v, setV] = useState(cook.title ?? '');
  useEffect(() => setV(cook.title ?? ''), [cook.title]);
  return (
    <label className="field">
      <span>Nom du plat</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() !== (cook.title ?? '') && onRename(v)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  );
}

function IngredientRow({ ing, editable, done, onQty, onRemove }: { ing: Ingredient; editable: boolean; done: boolean; onQty: (q: number) => void; onRemove: () => void }) {
  const app = useApp();
  const food = app.foods.get(ing.foodId);
  const [v, setV] = useState(showQty(food, ing.qty));
  useEffect(() => setV(showQty(food, ing.qty)), [food, ing.qty]);
  const have = app.stock.get(ing.foodId)?.remaining ?? 0;
  const ok = done || have + 1e-6 >= ing.qty;
  const a = splitAmount(food, ing.qty);
  const save = () => {
    const n = parse(v);
    if (Number.isFinite(n) && n > 0 && Math.abs(n - ing.qty) > 1e-9) onQty(n);
    else setV(showQty(food, ing.qty));
  };
  return (
    <li className={`ing-row ${ok ? '' : 'is-missing'}`}>
      {editable ? (
        <span className="qty-input">
          <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label={`Quantité de ${food?.name ?? ing.foodId}`} />
          <span className="unit">{unitWord(food)}</span>
        </span>
      ) : (
        <span className="qty num">{a.qty}</span>
      )}
      <span className="ing-name">{a.label}</span>
      <span className="ing-state">{ok ? '' : have > 0 ? `reste ${amount(food, have)}` : 'pas en stock'}</span>
      {editable && (
        <button type="button" className="icon-button" onClick={onRemove} aria-label={`Retirer ${food?.name ?? 'l’ingrédient'}`}>
          <X size={14} aria-hidden />
        </button>
      )}
    </li>
  );
}

const NEW = '__nouveau__';

function AddIngredient({ onAdd }: { onAdd: (ing: Ingredient) => void }) {
  const app = useApp();
  const { data, store } = app;
  const [open, setOpen] = useState(false);
  const [foodId, setFoodId] = useState('');
  const [qty, setQty] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const byName = (a: Food, b: Food) => a.name.localeCompare(b.name, 'fr');
  const inStock = data.foods.filter((f) => (app.stock.get(f.id)?.remaining ?? 0) > 1e-6).sort(byName);
  const others = data.foods.filter((f) => !((app.stock.get(f.id)?.remaining ?? 0) > 1e-6)).sort(byName);
  const food = data.foods.find((f) => f.id === foodId);

  if (!open) {
    return (
      <button type="button" className="secondary-button is-sm add-ing" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden /> Ajouter un ingrédient
      </button>
    );
  }
  const reset = () => {
    setFoodId('');
    setQty('');
    setName('');
    setOpen(false);
  };
  return (
    <form
      className="add-form"
      onSubmit={(e) => {
        e.preventDefault();
        const n = parse(qty);
        if (!(n > 0)) return;
        if (foodId === NEW) {
          if (!name.trim()) return;
          const id = `perso-${newId('f').slice(2)}`;
          const created: Food = {
            id,
            name: name.trim().charAt(0).toUpperCase() + name.trim().slice(1),
            category: 'épicerie',
            unit,
            per100: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
            storage: 'placard',
            shelfLifeDays: 30,
            custom: true,
          };
          store.update('foods', (fs) => [...fs, created]);
          onAdd({ foodId: id, qty: n });
        } else if (food) {
          onAdd({ foodId, qty: n });
        }
        reset();
      }}
    >
      <select value={foodId} onChange={(e) => setFoodId(e.target.value)} aria-label="Ingrédient" autoFocus required>
        <option value="" disabled>Ingrédient…</option>
        <optgroup label="En stock">
          {inStock.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </optgroup>
        <optgroup label="Pas en stock">
          {others.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </optgroup>
        <option value={NEW}>Autre ingrédient…</option>
      </select>
      {foodId === NEW && (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" aria-label="Nom de l’ingrédient" required />
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unité">
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="pièce">pièce</option>
          </select>
        </>
      )}
      <span className="qty-input">
        <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={food?.unit === 'pièce' || unit === 'pièce' ? '1' : '100'} aria-label="Quantité" required />
        <span className="unit">{foodId === NEW ? (unit === 'pièce' ? 'pc' : unit) : unitWord(food)}</span>
      </span>
      <button type="submit" className="primary-button is-sm">Ajouter</button>
      <button type="button" className="icon-button" onClick={reset} aria-label="Annuler">
        <X size={14} aria-hidden />
      </button>
    </form>
  );
}
