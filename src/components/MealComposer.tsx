import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Leaf, Minus, Plus, RotateCcw, Search, Trash2, Utensils, X } from 'lucide-react';
import { useApp } from '../context';
import { formatShort } from '../domain/dates';
import { cookIngredients, dayTotalWith, entriesOn, itemsNutrients, mealOfCook, plantGrams, scale, ZERO } from '../domain/nutrition';
import { insertBlock, linkCookToRecipe, newId, placeMeal, removeEntry, sameIngredients, type MealDraft } from '../domain/plan';
import { recipeFromMeal } from '../domain/recipes';
import { fraction, shortQty, splitAmount } from '../domain/stock';
import { isPlannable, portionsOf, type Food, type Ingredient, type ISODate, type PlanEntry, type Recipe } from '../domain/types';
import { Cover } from './recipe';
import { Meter } from './ui';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
/** « oeuf » trouve « Œuf » : accents et ligatures ne comptent pas dans une recherche. */
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
const parse = (s: string) => Number(s.replace(',', '.').trim());
const unitWord = (f?: Food) => (f?.unit === 'pièce' ? 'pc' : f?.unit ?? '');
const showQty = (f: Food | undefined, q: number) => (f?.unit === 'pièce' ? fraction(q) : String(Math.round(q * 10) / 10).replace('.', ','));
/** Une quantité de départ plausible : une pièce, un filet d'huile, 100 g sinon. */
const defaultQty = (f: Food) => (f.unit === 'pièce' ? 1 : f.category === 'matières grasses' ? 10 : 100);

export function PortionStepper({ value, onChange, label = 'Repas' }: { value: number; onChange: (n: number) => void; label?: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="icon-button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Un repas de moins">
        <Minus size={15} aria-hidden />
      </button>
      <span className="num" aria-live="polite">{value}</span>
      <button type="button" className="icon-button" onClick={() => onChange(Math.min(8, value + 1))} aria-label="Un repas de plus">
        <Plus size={15} aria-hidden />
      </button>
    </div>
  );
}

export interface ComposerTarget {
  /** La cuisson qui porte les ingrédients. */
  cookId: string;
  /** Le repas ouvert : la cuisson elle-même ou l'un de ses restes. */
  entryId: string;
}

function draftOf(recipes: Recipe[], cook: PlanEntry): MealDraft {
  const meal = mealOfCook(recipes, cook);
  return {
    ...(meal.recipe ? { recipeId: meal.recipe.id } : { title: meal.name }),
    portions: meal.portions,
    ingredients: meal.ingredients.map((i) => ({ ...i })),
  };
}

/**
 * Composer le repas d'un jour, dans une seule fenêtre :
 * 1. choisir une recette de la bibliothèque ou partir d'un plat maison ;
 * 2. ajuster les ingrédients de CE repas (la fiche ne change jamais), avec les valeurs en direct
 *    et le bilan de la journée tel qu'il sera.
 * Rien n'est écrit avant « Ajouter au plan » / « Enregistrer » : « Annuler » ne laisse aucune trace.
 */
export function MealComposer({
  date,
  target,
  sameDay = false,
  onClose,
}: {
  date: ISODate;
  /** Repas existant à modifier ; absent pour un nouveau repas. */
  target?: ComposerTarget;
  /** Nouveau repas sur un jour qui en porte déjà un : une portion, rien ne se décale. */
  sameDay?: boolean;
  onClose: () => void;
}) {
  const app = useApp();
  const { data, foods, store, today } = app;
  const cook = target ? data.plan.entries.find((e) => e.id === target.cookId && e.kind === 'cook') : undefined;
  const entry = target ? (data.plan.entries.find((e) => e.id === target.entryId) ?? cook) : undefined;
  const [draft, setDraft] = useState<MealDraft | null>(() => (cook ? draftOf(data.recipes, cook) : null));
  const [previous, setPrevious] = useState<MealDraft | null>(null);
  const [keep, setKeep] = useState(false);
  const [focusFood, setFocusFood] = useState<string | null>(null);

  if (target && (!cook || !entry)) {
    return <p className="muted">Ce repas n’est plus dans le plan.</p>;
  }

  const leftover = entry?.kind === 'leftover';
  const cookDone = !!cook?.done;
  const day = entry?.date ?? date;
  /** Un jour passé se complète après coup : une portion, sans jamais décaler la suite du plan. */
  const retro = day < today;
  const single = retro || (cook ? entriesOn(data, cook.date).some((e) => e.id !== cook.id && e.kind !== 'out') : sameDay);
  const canSwitch = !leftover && !cookDone;
  const canRemove = !!entry && !entry.done;

  const pickRecipe = (r: Recipe) => {
    const portions = single ? 1 : portionsOf(r);
    setDraft({ recipeId: r.id, portions, ingredients: cookIngredients(r, portions) });
    setPrevious(null);
  };
  const startCustom = (title: string) => {
    setDraft({ title, portions: 1, ingredients: [] });
    setPrevious(null);
  };

  if (!draft) {
    return (
      <div className="composer-choose">
        <RecipeChooser onPick={pickRecipe} onCustom={startCustom} />
        <div className="modal-foot">
          {previous && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setDraft(previous);
                setPrevious(null);
              }}
            >
              <ArrowLeft size={15} aria-hidden /> Revenir au repas
            </button>
          )}
          <span className="composer-foot-gap" />
          <button type="button" className="secondary-button" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  const recipe = draft.recipeId ? data.recipes.find((r) => r.id === draft.recipeId) : undefined;
  const custom = !draft.recipeId;
  const fromRecipe = recipe && isPlannable(recipe) ? cookIngredients(recipe, draft.portions) : undefined;
  const adjusted = !!fromRecipe && !sameIngredients(draft.ingredients, fromRecipe);
  const valid = custom ? !!draft.title?.trim() : !!recipe;

  const setIngredients = (fn: (list: Ingredient[]) => Ingredient[]) => setDraft((d) => (d ? { ...d, ingredients: fn(d.ingredients) } : d));
  const setPortions = (n: number) =>
    setDraft((d) => (d ? { ...d, portions: n, ingredients: d.ingredients.map((i) => ({ ...i, qty: (i.qty * n) / d.portions })) } : d));
  const addFood = (food: Food) => {
    setIngredients((list) => (list.some((i) => i.foodId === food.id) ? list : [...list, { foodId: food.id, qty: defaultQty(food) }]));
    setFocusFood(food.id);
  };

  const save = () => {
    if (!valid) return;
    let next = draft;
    let created: Recipe | undefined;
    if (custom && keep) {
      created = recipeFromMeal({ title: draft.title ?? '', portions: draft.portions, ingredients: draft.ingredients }, foods, data.recipes);
      const fresh = created;
      store.update('recipes', (list) => [...list, fresh]);
      // Un plat maison déjà au plan est mis à jour puis relié à sa fiche (restes et coche gardés) ;
      // sinon le repas posé pointe directement vers la nouvelle fiche.
      if (!cook || cook.recipeId) next = { recipeId: fresh.id, portions: draft.portions, ingredients: draft.ingredients };
    }
    const recipes = created ? [...data.recipes, created] : data.recipes;
    const linkAfter = created && cook && !cook.recipeId ? { cookId: cook.id, recipeId: created.id } : undefined;
    store.update('plan', (p) => {
      let entries = placeMeal(p.entries, recipes, date, next, { cookId: cook?.id, sameDay, noShift: retro });
      if (linkAfter) entries = linkCookToRecipe(entries, linkAfter.cookId, linkAfter.recipeId);
      return { ...p, entries };
    });
    onClose();
  };

  const remove = () => {
    if (!entry) return;
    store.update('plan', (p) => ({ ...p, entries: removeEntry(p.entries, entry.id) }));
    onClose();
  };

  return (
    <div className="composer">
      <div className="composer-main">
        <header className="composer-dish">
          <div className="composer-dish-top">
            <p className="dialog-kicker">{custom ? 'Plat maison' : 'Recette'}</p>
            {canSwitch && (
              <button
                type="button"
                className="text-button is-sm composer-switch"
                onClick={() => {
                  setPrevious(draft);
                  setDraft(null);
                }}
              >
                <ArrowLeft size={14} aria-hidden /> Changer de plat
              </button>
            )}
          </div>
          {custom ? (
            <input
              className="composer-title"
              value={draft.title ?? ''}
              onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
              placeholder="Nom du plat"
              aria-label="Nom du plat"
              autoFocus={!draft.title}
            />
          ) : (
            <h3 className="dialog-dish">{recipe?.name ?? 'Recette introuvable'}</h3>
          )}
        </header>

        {leftover && cook && (
          <p className="hint composer-note">Ce repas est un reste de la cuisson du {formatShort(cook.date)} : les quantités valent pour toute la cuisson.</p>
        )}
        {retro && !cook && <p className="hint composer-note">Repas ajouté après coup : une portion, la suite du plan ne bouge pas.</p>}
        {cookDone && <p className="hint composer-note">Repas déjà validé : modifier les quantités ajuste le stock.</p>}

        {!single && !leftover && (
          <div className="composer-portions">
            <span className="small">Cuisiné pour</span>
            <PortionStepper value={draft.portions} onChange={setPortions} />
            <span className="small">repas</span>
            {!cook && <LeftoverHint date={date} portions={draft.portions} />}
          </div>
        )}

        <section className="composer-ingredients" aria-label="Ingrédients">
          <div className="composer-section-head">
            <p className="balance-sub">Ingrédients</p>
            {adjusted && fromRecipe && (
              <span className="composer-adjusted" title="La recette enregistrée ne change pas : l’ajustement vaut pour ce repas seulement.">
                <span className="hint">Ajusté pour ce repas</span>
                <button type="button" className="text-button is-sm" onClick={() => setIngredients(() => fromRecipe.map((i) => ({ ...i })))}>
                  <RotateCcw size={13} aria-hidden /> Revenir à la fiche
                </button>
              </span>
            )}
          </div>
          {draft.ingredients.length === 0 ? (
            <p className="hint composer-empty">
              {custom ? 'Ajoute ce qui entre dans le plat : les valeurs se calculent à chaque ingrédient.' : 'Cette fiche n’a pas de quantités : ajoute les ingrédients de ce repas.'}
            </p>
          ) : (
            <ul className="ing-list">
              {draft.ingredients.map((ing, i) => (
                <DraftRow
                  key={ing.foodId}
                  ing={ing}
                  showStock={!cookDone}
                  autoFocus={focusFood === ing.foodId}
                  onQty={(q) => setIngredients((list) => list.map((x, j) => (j === i ? { ...x, qty: q } : x)))}
                  onRemove={() => setIngredients((list) => list.filter((_, j) => j !== i))}
                />
              ))}
            </ul>
          )}
          <FoodSearch onAdd={addFood} />
        </section>

        {custom && (
          <label className="toggle-row composer-keep">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            <span>
              <span className="setting-label">Enregistrer aussi dans mes recettes</span>
              <span className="hint">Le plat sera proposé la prochaine fois, avec ces quantités.</span>
            </span>
          </label>
        )}
      </div>

      <MealPreview draft={draft} day={day} skipId={entry?.id} eaten={entry?.eaten ?? 1} />

      <div className="modal-foot composer-foot">
        {canRemove && (
          <button type="button" className="text-button danger" onClick={remove} title={entry?.kind === 'cook' ? 'Retire aussi ses restes non mangés' : undefined}>
            <Trash2 size={15} aria-hidden /> {leftover ? 'Retirer ce reste' : 'Retirer du plan'}
          </button>
        )}
        <span className="composer-foot-gap" />
        <button type="button" className="secondary-button" onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="primary-button" onClick={save} disabled={!valid}>
          {cook ? 'Enregistrer' : 'Ajouter au plan'}
        </button>
      </div>
    </div>
  );
}

/** Où iront les restes d'une nouvelle cuisson, avec le vrai placement. */
function LeftoverHint({ date, portions }: { date: ISODate; portions: number }) {
  const { data } = useApp();
  if (portions < 2) return null;
  const block: PlanEntry[] = Array.from({ length: portions }, (_, i) => ({ id: `apercu-${i}`, date: '', kind: i ? 'leftover' : 'cook' }));
  const after = insertBlock(data.plan.entries, block, date);
  const rests = after.filter((e) => e.id.startsWith('apercu-') && e.id !== 'apercu-0').map((e) => formatShort(e.date));
  const before = new Map(data.plan.entries.map((e) => [e.id, e.date]));
  const moved = after.filter((e) => before.has(e.id) && before.get(e.id) !== e.date).length;
  return (
    <span className="hint composer-rests">
      · restes {rests.join(', ')}
      {moved > 0 && ` · la suite glisse de ${moved} repas`}
    </span>
  );
}

function DraftRow({
  ing,
  showStock,
  autoFocus,
  onQty,
  onRemove,
}: {
  ing: Ingredient;
  showStock: boolean;
  autoFocus: boolean;
  onQty: (q: number) => void;
  onRemove: () => void;
}) {
  const app = useApp();
  const food = app.foods.get(ing.foodId);
  const [v, setV] = useState(showQty(food, ing.qty));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setV(showQty(food, ing.qty)), [food, ing.qty]);
  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.focus();
    ref.current?.select();
  }, [autoFocus]);
  const have = app.stock.get(ing.foodId)?.remaining ?? 0;
  const ok = !showStock || have + 1e-6 >= ing.qty;
  const save = () => {
    const n = parse(v);
    if (Number.isFinite(n) && n > 0 && Math.abs(n - ing.qty) > 1e-9) onQty(n);
    else setV(showQty(food, ing.qty));
  };
  const name = food?.name ?? ing.foodId;
  return (
    <li className={`ing-row ${ok ? '' : 'is-missing'}`}>
      <span className="qty-input">
        <input
          ref={ref}
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={`Quantité de ${name}`}
        />
        <span className="unit">{unitWord(food)}</span>
      </span>
      <span className="ing-name">{food ? splitAmount(food, ing.qty).label : name}</span>
      <span className="ing-state">{ok ? '' : have > 0 ? `reste ${shortQty(food, have)}` : 'pas en stock'}</span>
      <button type="button" className="icon-button" onClick={onRemove} aria-label={`Retirer ${name}`}>
        <X size={14} aria-hidden />
      </button>
    </li>
  );
}

/**
 * Ajouter un ingrédient en tapant son nom : les aliments en stock d'abord, Entrée pour le premier.
 * Un aliment absent du catalogue se crée sur place, avec les valeurs qu'on connaît.
 */
function FoodSearch({ onAdd }: { onAdd: (food: Food) => void }) {
  const app = useApp();
  const { data, store } = app;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState<string | null>(null);
  const have = (f: Food) => app.stock.get(f.id)?.remaining ?? 0;

  const results = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return [];
    return data.foods
      .filter((f) => norm(f.name).includes(n))
      .sort(
        (a, b) =>
          Number(have(b) > 1e-6) - Number(have(a) > 1e-6) ||
          Number(norm(b.name).startsWith(n)) - Number(norm(a.name).startsWith(n)) ||
          a.name.localeCompare(b.name, 'fr'),
      )
      .slice(0, 8);
  }, [data.foods, q, app.stock]);

  const pick = (f: Food) => {
    onAdd(f);
    setQ('');
    setActive(0);
  };

  if (creating !== null) {
    return (
      <NewFood
        initialName={creating}
        onCancel={() => setCreating(null)}
        onCreate={(food) => {
          store.update('foods', (list) => [...list, food]);
          setCreating(null);
          setQ('');
          onAdd(food);
        }}
      />
    );
  }

  const count = results.length + 1;
  return (
    <div className="food-search">
      <label className="search-pill">
        <Plus size={15} aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (!q.trim()) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % count);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a - 1 + count) % count);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (active < results.length) pick(results[active]);
              else setCreating(q.trim());
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              e.preventDefault();
              setQ('');
            }
          }}
          placeholder="Ajouter un ingrédient"
          aria-label="Ajouter un ingrédient"
          aria-expanded={!!q.trim()}
          aria-controls="food-results"
          role="combobox"
        />
      </label>
      {q.trim() && (
        <ul className="food-results" id="food-results" role="listbox" aria-label="Aliments">
          {results.map((f, i) => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`food-result ${i === active ? 'on' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(f)}
              >
                <span className="food-result-name">{f.name}</span>
                <span className="food-result-meta num">{have(f) > 1e-6 ? `en stock · ${shortQty(f, have(f))}` : `${fr(f.per100.kcal)} kcal / 100 ${f.unit === 'ml' ? 'ml' : 'g'}`}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              role="option"
              aria-selected={active === results.length}
              className={`food-result is-new ${active === results.length ? 'on' : ''}`}
              onMouseEnter={() => setActive(results.length)}
              onClick={() => setCreating(q.trim())}
            >
              <span className="food-result-name">
                <Plus size={13} aria-hidden /> Nouvel aliment « {q.trim()} »
              </span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function NewFood({ initialName, onCreate, onCancel }: { initialName: string; onCreate: (food: Food) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState<'g' | 'ml'>('g');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [fiber, setFiber] = useState('');
  const create = () => {
    const clean = name.trim();
    if (!clean) return;
    onCreate({
      id: `perso-${newId('f').slice(2)}`,
      name: clean.charAt(0).toUpperCase() + clean.slice(1),
      category: 'épicerie',
      unit,
      per100: { ...ZERO, kcal: parse(kcal) || 0, protein: parse(protein) || 0, fiber: parse(fiber) || 0 },
      source: 'saisi à la main',
      storage: 'placard',
      shelfLifeDays: 30,
      custom: true,
    });
  };
  return (
    <div className="new-food" role="group" aria-label="Nouvel aliment">
      <p className="balance-sub">Nouvel aliment</p>
      <div className="new-food-grid">
        <label className="field new-food-name">
          <span>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Unité</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as 'g' | 'ml')}>
            <option value="g">g</option>
            <option value="ml">ml</option>
          </select>
        </label>
        <label className="field">
          <span>kcal / 100 {unit}</span>
          <input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="—" />
        </label>
        <label className="field">
          <span>Protéines (g)</span>
          <input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="—" />
        </label>
        <label className="field">
          <span>Fibres (g)</span>
          <input inputMode="decimal" value={fiber} onChange={(e) => setFiber(e.target.value)} placeholder="—" />
        </label>
      </div>
      <p className="hint">Les valeurs que tu connais, pour 100 {unit} (étiquette) ; le reste compte pour zéro.</p>
      <div className="new-food-actions">
        <button type="button" className="primary-button is-sm" onClick={create} disabled={!name.trim()}>
          Créer et ajouter
        </button>
        <button type="button" className="text-button is-sm" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/** Les valeurs d'une portion du brouillon, et la journée telle qu'elle sera une fois enregistré. */
function MealPreview({ draft, day, skipId, eaten }: { draft: MealDraft; day: ISODate; skipId?: string; eaten: number }) {
  const app = useApp();
  const { data, foods, targets } = app;
  const k = 1 / Math.max(1, draft.portions);
  const n = scale(itemsNutrients(foods, draft.ingredients), k);
  const plant = plantGrams(foods, draft.ingredients) * k;
  const total = dayTotalWith(data, foods, day, skipId, { nutrients: scale(n, eaten), plantG: plant * eaten });
  const perMeal = targets.kcal * targets.mealShare;
  const unknown = draft.ingredients
    .map((i) => foods.get(i.foodId))
    .filter((f): f is Food => !!f && !!f.custom && f.per100.kcal === 0)
    .map((f) => f.name);
  const dayRows = [
    { label: 'Énergie', value: total.nutrients.kcal, target: targets.kcal, unit: 'kcal' },
    { label: 'Protéines', value: total.nutrients.protein, target: targets.protein, unit: 'g' },
    { label: 'Fibres', value: total.nutrients.fiber, target: targets.fiber, unit: 'g' },
    { label: 'Légumes & fruits', value: total.plantG, target: targets.plantG, unit: 'g' },
  ];

  return (
    <aside className="ingredients-preview composer-preview" aria-label="Valeurs nutritionnelles">
      <p className="dialog-kicker">{draft.portions > 1 ? 'Une portion' : 'Ce repas'}</p>
      <p className="preview-kcal">
        <b className="num">{fr(n.kcal)}</b> <span>kcal</span>
      </p>
      <p className="preview-target num">cible repas · {fr(Math.round(perMeal / 25) * 25)} kcal</p>
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
          <dd className="num">{(Math.round(n.salt * 10) / 10).toLocaleString('fr-FR')} g</dd>
        </div>
      </dl>

      <div className="composer-day">
        <p className="dialog-kicker">La journée avec ce repas</p>
        {dayRows.map((r) => (
          <div key={r.label} className="composer-day-row">
            <span className="composer-day-label">{r.label}</span>
            <span className="composer-day-value num">
              <b>{fr(r.value)}</b> / {fr(r.target)} {r.unit}
            </span>
            <Meter value={r.value} target={r.target} tone="ink" label={`${r.label} de la journée`} />
          </div>
        ))}
      </div>

      {unknown.length > 0 && <p className="hint">Sans valeurs connues : {unknown.join(', ')}. Ils ne comptent pas dans le bilan.</p>}
    </aside>
  );
}

/**
 * Le choix du plat : un plat maison en tête, puis ce qui sauve le stock, les plats,
 * les accompagnements. Un clic choisit, il n'y a pas de second bouton à trouver.
 */
function RecipeChooser({ onPick, onCustom }: { onPick: (r: Recipe) => void; onCustom: (title: string) => void }) {
  const { data, portions: info, priorities } = useApp();
  const [q, setQ] = useState('');
  const query = q.trim();
  const searching = query.length > 0;

  const all = useMemo(() => {
    const n = norm(query);
    return data.recipes
      .filter((r) => !n || norm(r.name).includes(n))
      .sort((a, b) => Number(isPlannable(b)) - Number(isPlannable(a)) || a.name.localeCompare(b.name, 'fr'));
  }, [data.recipes, query]);

  const rescueScore = useMemo(() => {
    const atRisk = new Set(priorities.filter((p) => p.atRisk > 0).map((p) => p.food.id));
    const score = new Map<string, number>();
    for (const r of data.recipes) {
      const used = (r.ingredients ?? []).filter((i) => atRisk.has(i.foodId)).length;
      if (used > 0) score.set(r.id, used);
    }
    return score;
  }, [data.recipes, priorities]);

  const rescue = searching ? [] : all.filter((r) => rescueScore.has(r.id)).sort((a, b) => rescueScore.get(b.id)! - rescueScore.get(a.id)!).slice(0, 3);
  const rescueIds = new Set(rescue.map((r) => r.id));
  const groups: { key: string; title: ReactNode; list: Recipe[] }[] = searching
    ? [{ key: 'found', title: `${all.length} recette${all.length > 1 ? 's' : ''}`, list: all }]
    : [
        {
          key: 'rescue',
          title: (
            <>
              <Leaf size={13} aria-hidden /> Avec ton stock, à faire vite
            </>
          ),
          list: rescue,
        },
        { key: 'mains', title: 'Plats', list: all.filter((r) => !rescueIds.has(r.id) && r.dish === 'Plat') },
        { key: 'sides', title: 'Accompagnements, sauces, desserts', list: all.filter((r) => !rescueIds.has(r.id) && r.dish !== 'Plat') },
      ];

  return (
    <div className="chooser">
      <label className="search-pill chooser-search">
        <Search size={15} aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une recette" aria-label="Chercher une recette" autoFocus />
      </label>

      <div className="chooser-grid">
        <button type="button" className="chooser-tile is-custom" onClick={() => onCustom(query)}>
          <span className="chooser-thumb is-plus" aria-hidden>
            <Plus size={20} strokeWidth={1.8} />
          </span>
          <span className="chooser-text">
            <span className="chooser-name">{searching ? `Créer « ${query} »` : 'Composer un plat maison'}</span>
            <span className="chooser-meta">Un nom, tes ingrédients : les valeurs se calculent</span>
          </span>
        </button>
      </div>

      {groups
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <section key={g.key} className="chooser-group" aria-label={typeof g.title === 'string' ? g.title : 'Avec ton stock'}>
            <p className="chooser-group-title">{g.title}</p>
            <div className="chooser-grid">
              {g.list.map((r) => (
                <button key={r.id} type="button" className="chooser-tile" onClick={() => onPick(r)}>
                  <span className="chooser-thumb">
                    {r.cover ? (
                      <Cover recipe={r} ratio="square" />
                    ) : (
                      <span className="chooser-thumb-icon" aria-hidden>
                        <Utensils size={18} strokeWidth={1.6} />
                      </span>
                    )}
                  </span>
                  <span className="chooser-text">
                    <span className="chooser-name">{r.name}</span>
                    <span className="chooser-meta num">
                      {isPlannable(r) ? `${fr(info.get(r.id)!.nutrients.kcal)} kcal / portion` : 'quantités à compléter'}
                      {r.dish !== 'Plat' ? ` · ${r.dish}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      {searching && all.length === 0 && <p className="hint">Aucune recette ne porte ce nom : crée-la comme plat maison.</p>}
    </div>
  );
}
