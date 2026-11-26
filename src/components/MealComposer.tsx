import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChefHat, Leaf, Package, Plus, RotateCcw, Search, Trash2, Utensils, X } from 'lucide-react';
import { useApp } from '../context';
import { formatDayMonth, formatShort } from '../domain/dates';
import {
  cookIngredients,
  dayTotalWith,
  entriesOn,
  ingredientNutrients,
  itemsNutrients,
  mealOfCook,
  plantGrams,
  scale,
} from '../domain/nutrition';
import { insertBlock, linkCookToRecipe, placeMeal, removeEntry, sameIngredients, type MealDraft } from '../domain/plan';
import { recipeFromMeal } from '../domain/recipes';
import { formatQty, fraction, splitAmount } from '../domain/stock';
import { isPlannable, type Food, type Ingredient, type ISODate, type PlanEntry, type Recipe } from '../domain/types';
import { FoodPicker } from './FoodPicker';
import { Cover } from './recipe';
import './meal-composer.css';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
const dec = (v: number) => (Math.round(v * 10) / 10).toLocaleString('fr-FR');
const ratio = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
/** « oeuf » trouve « Œuf » : accents et ligatures ne comptent pas dans une recherche. */
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
const parseQty = (s: string) => Number(s.replace(',', '.').trim());
const unitWord = (f?: Food) => (f?.unit === 'pièce' ? 'pc' : (f?.unit ?? ''));
const showQty = (f: Food | undefined, q: number) => (f?.unit === 'pièce' ? fraction(q) : String(Math.round(q * 10) / 10).replace('.', ','));
/** Une quantité de départ plausible : une pièce, un filet d’huile, 100 g sinon. */
const usualQty = (f: Food) => (f.unit === 'pièce' ? 1 : f.category === 'matières grasses' ? 10 : 100);

type Source = 'recipe' | 'custom' | 'stock';

function draftOf(recipes: Recipe[], cook: PlanEntry): MealDraft {
  const meal = mealOfCook(recipes, cook);
  return {
    ...(meal.recipe ? { recipeId: meal.recipe.id } : { title: meal.name }),
    portions: meal.portions,
    ingredients: meal.ingredients.map((i) => ({ ...i })),
  };
}

export interface ComposerTarget {
  /** La cuisson qui porte les ingrédients. */
  cookId: string;
  /** Le repas ouvert : la cuisson elle-même ou l’un de ses restes. */
  entryId: string;
}

/**
 * Composer la fournée d’un jour, dans la feuille fournie par le parent.
 * L’ordre ne change pas : le nombre de repas d’abord, puis la source, puis les ingrédients.
 * Chaque quantité est écrite pour la fournée entière, et le pied donne les deux lectures
 * (la fournée et une portion) sans jamais recalculer en silence.
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
  const { data, foods, store, today, targets } = app;

  const cook = target ? data.plan.entries.find((e) => e.id === target.cookId && e.kind === 'cook') : undefined;
  const entry = target ? (data.plan.entries.find((e) => e.id === target.entryId) ?? cook) : undefined;
  const meal = cook ? mealOfCook(data.recipes, cook) : undefined;

  const day = entry?.date ?? date;
  const retro = day < today;
  const leftover = entry?.kind === 'leftover';
  const cookDone = !!cook?.done;
  const sharedDay = cook ? entriesOn(data, cook.date).some((e) => e.id !== cook.id && e.kind !== 'out') : sameDay;
  const locked = retro || sharedDay;
  const initialCount = meal?.portions ?? (locked ? 1 : (data.settings.mealsPerCook ?? 2));

  const [count, setCount] = useState(initialCount);
  const [draft, setDraft] = useState<MealDraft | null>(() => (cook ? draftOf(data.recipes, cook) : null));
  /** Les portions et quantités d’avant un changement de nombre de repas, pour revenir en arrière. */
  const [base, setBase] = useState<{ portions: number; ingredients: Ingredient[] } | null>(null);
  const [source, setSource] = useState<Source | null>(cook ? (cook.recipeId ? 'recipe' : 'custom') : null);
  const [choosing, setChoosing] = useState(!cook);
  const [pendingSource, setPendingSource] = useState<Source | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focusFood, setFocusFood] = useState<string | null>(null);
  const [keep, setKeep] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);

  const recipe = draft?.recipeId ? data.recipes.find((r) => r.id === draft.recipeId) : undefined;
  const custom = !!draft && !draft.recipeId;
  const ingredients = draft?.ingredients ?? [];
  const fournee = useMemo(() => itemsNutrients(foods, ingredients), [foods, ingredients]);
  const portion = scale(fournee, 1 / Math.max(1, count));
  const plant = useMemo(() => plantGrams(foods, ingredients), [foods, ingredients]);
  const dayWith = dayTotalWith(data, foods, day, entry?.id, {
    nutrients: portion,
    plantG: plant / Math.max(1, count),
  });
  const mealTarget = Math.round((targets.kcal * targets.mealShare) / 25) * 25;
  const adjusted = !!draft && !!recipe && !!recipe.ingredients?.length && !sameIngredients(draft.ingredients, cookIngredients(recipe, count));
  const valid = !!draft && draft.ingredients.length > 0 && (custom || !!recipe);
  const canSwitch = !leftover && !cookDone && !retro && !sharedDay;
  const canRemove = !!entry && !entry.done;
  const dishName = recipe?.name ?? (draft?.title?.trim() || 'Plat maison');
  const unknown = ingredients
    .map((i) => foods.get(i.foodId))
    .filter((f): f is Food => !!f && !!f.custom && f.per100.kcal === 0)
    .map((f) => f.name);
  const counts = initialCount > 4 ? [1, 2, 3, 4, initialCount] : [1, 2, 3, 4];

  const changeCount = (n: number) => {
    if (n === count) return;
    if (!draft || draft.ingredients.length === 0) {
      setCount(n);
      setBase(null);
      setDraft((d) => (d ? { ...d, portions: n } : d));
      return;
    }
    const from = base ?? { portions: count, ingredients: draft.ingredients };
    setCount(n);
    setDraft({
      ...draft,
      portions: n,
      ingredients: from.ingredients.map((i) => ({ ...i, qty: (i.qty * n) / from.portions })),
    });
    // Revenir à la valeur de départ efface la référence : le changement est abandonné.
    setBase(n === from.portions ? null : from);
  };

  const revertCount = () => {
    if (!base) return;
    setCount(base.portions);
    setDraft((d) => (d ? { ...d, portions: base.portions, ingredients: base.ingredients } : d));
    setBase(null);
  };

  const startSource = (next: Source) => {
    setPendingSource(null);
    setSource(next);
    setBase(null);
    setChoosing(next === 'recipe');
    setDraft(next === 'recipe' ? null : { title: '', portions: count, ingredients: [] });
  };

  const pickSource = (next: Source) => {
    if (next === source) {
      if (next === 'recipe') setChoosing(true);
      return;
    }
    if (draft && draft.ingredients.length > 0) {
      setPendingSource(next);
      return;
    }
    startSource(next);
  };

  const pickRecipe = (r: Recipe) => {
    setDraft({ recipeId: r.id, portions: count, ingredients: cookIngredients(r, count) });
    setSource('recipe');
    setChoosing(false);
    setBase(null);
    setPendingSource(null);
  };

  const resetToRecipe = () => {
    if (!recipe) return;
    setBase(null);
    setDraft({ recipeId: recipe.id, portions: count, ingredients: cookIngredients(recipe, count) });
  };

  const addFood = (food: Food, qty: number) => {
    if (!draft) return;
    if (draft.ingredients.some((i) => i.foodId === food.id)) {
      setDuplicate(food.name);
      setFocusFood(food.id);
      return;
    }
    setDraft({ ...draft, ingredients: [...draft.ingredients, { foodId: food.id, qty }] });
    setFocusFood(food.id);
    setDuplicate(null);
  };

  const setQty = (index: number, qty: number) =>
    setDraft((d) => (d ? { ...d, ingredients: d.ingredients.map((x, j) => (j === index ? { ...x, qty } : x)) } : d));

  const removeAt = (index: number) =>
    setDraft((d) => (d ? { ...d, ingredients: d.ingredients.filter((_, j) => j !== index) } : d));

  const save = () => {
    if (!draft || !valid) return;
    let next: MealDraft = { ...draft, portions: count, ingredients: draft.ingredients.map((i) => ({ ...i })) };
    let created: Recipe | undefined;
    if (custom && keep) {
      created = recipeFromMeal({ title: next.title ?? '', portions: next.portions, ingredients: next.ingredients }, foods, data.recipes);
      const fresh = created;
      store.update('recipes', (list) => [...list, fresh]);
      // Un plat maison déjà au plan est mis à jour puis relié à sa fiche (restes et coche gardés).
      if (!cook || cook.recipeId) next = { recipeId: fresh.id, portions: next.portions, ingredients: next.ingredients };
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

  // Un aliment déjà présent ne s’ajoute pas en silence : on le dit et on met sa ligne en avant.
  useEffect(() => {
    if (!duplicate) return;
    const t = window.setTimeout(() => setDuplicate(null), 5000);
    return () => window.clearTimeout(t);
  }, [duplicate]);

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveRef.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  if (target && (!cook || !entry)) {
    return <p className="mc-missing">Ce repas n’est plus dans le plan.</p>;
  }

  const dayRows = [
    { label: 'Énergie', value: dayWith.nutrients.kcal, target: targets.kcal, unit: 'kcal' },
    { label: 'Protéines', value: dayWith.nutrients.protein, target: targets.protein, unit: 'g' },
    { label: 'Fibres', value: dayWith.nutrients.fiber, target: targets.fiber, unit: 'g' },
    { label: 'Légumes & fruits', value: dayWith.plantG, target: targets.plantG, unit: 'g' },
  ];

  return (
    <div className="mc">
      <div className="mc-grid">
        <div className="mc-main">
          <section className="mc-card mc-count" aria-labelledby="mc-count-title">
            <p className="mc-kicker">La fournée</p>
            <h3 className="mc-title" id="mc-count-title">
              Pour combien de repas ?
            </h3>
            <div className="mc-seg" role="group" aria-label="Pour combien de repas">
              {counts.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`mc-seg-btn ${n === count ? 'is-on' : ''}`}
                  aria-pressed={n === count}
                  disabled={locked && n !== count}
                  onClick={() => changeCount(n)}
                >
                  <b>{n}</b>
                  <small>repas</small>
                </button>
              ))}
            </div>
            <p className="mc-hint">
              Les quantités se lisent pour la fournée entière : {count > 1 ? `${count} portions, une par repas.` : 'une portion.'}
            </p>
            {locked && (
              <p className="mc-note">
                {retro
                  ? 'Ce jour est passé : le nombre de portions ne change plus, la suite du plan ne bouge pas.'
                  : 'Ce jour porte déjà un autre repas : le nombre de portions ne change plus.'}
              </p>
            )}
          </section>

          <section className="mc-card mc-sources" aria-labelledby="mc-source-title">
            <div className="mc-sec-head">
              <div>
                <p className="mc-kicker">La source</p>
                <h3 className="mc-title" id="mc-source-title">
                  {!draft || choosing ? 'D’où vient le repas ?' : dishName}
                </h3>
              </div>
              {draft && !choosing && canSwitch && (
                <button type="button" className="s-btn is-ghost is-sm" onClick={() => setChoosing(true)}>
                  <ArrowLeft size={14} aria-hidden /> Changer de plat
                </button>
              )}
            </div>

            {(!draft || choosing) && (
              <div className="mc-tiles">
                <SourceTile
                  icon={<ChefHat size={16} aria-hidden />}
                  tone="mint"
                  name="Une recette du carnet"
                  sub="Chercher dans les fiches"
                  on={source === 'recipe'}
                  onClick={() => pickSource('recipe')}
                />
                <SourceTile
                  icon={<Utensils size={16} aria-hidden />}
                  tone="peach"
                  name="Un plat maison"
                  sub="Un nom, tes ingrédients"
                  on={source === 'custom'}
                  onClick={() => pickSource('custom')}
                />
                <SourceTile
                  icon={<Package size={16} aria-hidden />}
                  tone="butter"
                  name="Avec ce que j’ai en stock"
                  sub="Partir du frigo et du placard"
                  on={source === 'stock'}
                  onClick={() => pickSource('stock')}
                />
              </div>
            )}

            {source === 'recipe' && (!draft || choosing) && <RecipeChooser onPick={pickRecipe} current={draft?.recipeId} />}

            {source === 'custom' && draft && (
              <label className="mc-name-field">
                <span>Nom du plat</span>
                <input
                  className="mc-name-input"
                  value={draft.title ?? ''}
                  onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                  placeholder="Plat maison"
                  autoFocus={!draft.title && draft.ingredients.length === 0}
                />
              </label>
            )}

            {source === 'stock' && draft && (
              <StockChooser onAdd={(food) => addFood(food, usualQty(food))} onSearch={() => setPickerOpen(true)} added={new Set(draft.ingredients.map((i) => i.foodId))} />
            )}

            {pendingSource && (
              <div className="mc-confirm">
                <p>
                  <b>Changer de source remplace les {draft?.ingredients.length ?? 0} ingrédients de la fournée.</b> Le plat actuel ne sera pas gardé.
                </p>
                <button type="button" className="s-btn is-ghost is-sm" onClick={() => setPendingSource(null)}>
                  Garder
                </button>
                <button type="button" className="s-btn is-sm" onClick={() => startSource(pendingSource)}>
                  Changer
                </button>
              </div>
            )}

            {draft && !choosing && (leftover || canRemove) && (
              <div className="mc-sources-foot">
                {leftover && cook && (
                  <p className="mc-note">Ce repas est une portion de la fournée du {formatShort(cook.date)} : les quantités valent pour la fournée entière.</p>
                )}
                {canRemove &&
                  (confirmRemove ? (
                    <div className="mc-confirm">
                      <p>Retirer ce repas du plan ?</p>
                      <button type="button" className="s-btn is-ghost is-sm" onClick={() => setConfirmRemove(false)}>
                        Non
                      </button>
                      <button type="button" className="s-btn is-sm" onClick={remove}>
                        Oui, retirer
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="mc-link" onClick={() => setConfirmRemove(true)}>
                      <Trash2 size={13} aria-hidden /> {leftover ? 'Retirer ce reste' : 'Retirer ce repas du plan'}
                    </button>
                  ))}
              </div>
            )}
          </section>

          {draft && (
            <section className="mc-card mc-fournee" aria-labelledby="mc-fournee-title">
              <div className="mc-sec-head">
                <div>
                  <p className="mc-kicker">Les ingrédients</p>
                  <h3 className="mc-title" id="mc-fournee-title">
                    Ce qui entre dans la fournée{' '}
                    <span className="mc-count-chip num">{draft.ingredients.length}</span>
                  </h3>
                </div>
                {adjusted && (
                  <button type="button" className="mc-link" onClick={resetToRecipe}>
                    <RotateCcw size={13} aria-hidden /> Revenir à la fiche
                  </button>
                )}
              </div>

              {!custom && !recipe && <p className="mc-note is-peach">Cette recette n’est plus dans le carnet : ce repas ne peut plus être enregistré.</p>}
              {cookDone && <p className="mc-note">Ce repas est déjà coché : une quantité modifiée change le stock.</p>}

              <div className="mc-banner" aria-live="polite">
                <span className="mc-banner-pill">Quantités pour {count} repas</span>
                <span className="mc-banner-note">Chaque ligne ci-dessous vaut pour {count > 1 ? `ces ${count} repas` : 'ce repas'}.</span>
              </div>

              {base && count !== base.portions && (
                <div className="mc-scale" role="status">
                  <p>
                    <b>
                      Les quantités passent de {base.portions} à {count} repas.
                    </b>{' '}
                    Chaque ligne est multipliée par {ratio(count / base.portions)} pour couvrir la fournée entière.
                  </p>
                  <div className="mc-scale-actions">
                    <button type="button" className="s-btn is-ghost is-sm" onClick={revertCount}>
                      Revenir à {base.portions} repas
                    </button>
                    <button type="button" className="s-btn is-sm" onClick={() => setBase(null)}>
                      Garder {count} repas
                    </button>
                  </div>
                </div>
              )}

              {duplicate && (
                <p className="mc-note is-peach" role="status">
                  {duplicate} est déjà dans la fournée : ajuste sa quantité dans la liste.
                </p>
              )}

              {!cook && <PortionPlacement date={date} portions={count} sameDay={sameDay} />}

              {draft.ingredients.length === 0 ? (
                <p className="mc-empty">Aucun ingrédient pour l’instant. Ajoute ce qui entre dans la fournée.</p>
              ) : (
                <ul className="mc-list">
                  {draft.ingredients.map((ing, i) => (
                    <IngredientRow
                      key={ing.foodId}
                      ing={ing}
                      count={count}
                      showStock={!cookDone}
                      autoFocus={focusFood === ing.foodId}
                      onQty={(q) => setQty(i, q)}
                      onRemove={() => removeAt(i)}
                    />
                  ))}
                </ul>
              )}

              {pickerOpen ? (
                <div className="mc-picker">
                  <div className="mc-picker-head">
                    <p className="mc-kicker">Ajouter un aliment</p>
                    <button type="button" className="s-btn is-ghost is-sm" onClick={() => setPickerOpen(false)}>
                      <X size={14} aria-hidden /> Fermer
                    </button>
                  </div>
                  <FoodPicker open onClose={() => setPickerOpen(false)} onPick={addFood} stock={app.stock} allowCreate />
                </div>
              ) : (
                <button type="button" className="mc-add" onClick={() => setPickerOpen(true)}>
                  <Plus size={16} aria-hidden /> Ajouter un aliment
                </button>
              )}

              {custom && (
                <label className="mc-keep">
                  <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
                  <span>
                    <b>Enregistrer aussi dans mes recettes</b>
                    Le plat sera proposé la prochaine fois, avec ces quantités.
                  </span>
                </label>
              )}

              {adjusted && <p className="mc-hint">La fiche de la recette ne change pas : cet ajustement vaut pour cette fournée.</p>}
            </section>
          )}
        </div>

        <aside className="mc-side">
          <section className="mc-card mc-preview" aria-label="Le repas et la journée">
            <p className="mc-kicker">{draft ? 'Ce repas' : 'Le repas à composer'}</p>
            <p className="mc-preview-kcal">
              <b className="num">{fr(portion.kcal)}</b>
              <span>kcal par portion</span>
            </p>
            <p className="mc-preview-target">cible du repas · {fr(mealTarget)} kcal</p>
            <dl className="mc-facts">
              <div>
                <dt>Protéines</dt>
                <dd className="num">{fr(portion.protein)} g</dd>
              </div>
              <div>
                <dt>Fibres</dt>
                <dd className="num">{fr(portion.fiber)} g</dd>
              </div>
              <div>
                <dt>Glucides</dt>
                <dd className="num">{fr(portion.carbs)} g</dd>
              </div>
              <div>
                <dt>Lipides</dt>
                <dd className="num">{fr(portion.fat)} g</dd>
              </div>
              <div>
                <dt>Graisses sat.</dt>
                <dd className="num">{fr(portion.satFat)} g</dd>
              </div>
              <div>
                <dt>Sel</dt>
                <dd className="num">{dec(portion.salt)} g</dd>
              </div>
            </dl>

            <div className="mc-day">
              <p className="mc-kicker">{draft ? 'La journée avec ce repas' : 'La journée pour l’instant'}</p>
              {dayRows.map((r) => (
                <div key={r.label} className="mc-day-row">
                  <span className="mc-day-label">{r.label}</span>
                  <span className="mc-day-val num">
                    <b>{fr(r.value)}</b> / {fr(r.target)} {r.unit}
                  </span>
                  <span className="s-jauge" aria-hidden>
                    <span style={{ width: `${r.target > 0 ? Math.min(100, (r.value / r.target) * 100) : 0}%` }} />
                  </span>
                </div>
              ))}
            </div>

            {unknown.length > 0 && <p className="mc-hint">Sans valeurs connues : {unknown.join(', ')}. Ils ne comptent pas dans le bilan.</p>}
          </section>
        </aside>
      </div>

      <footer className="mc-foot">
        {draft ? (
          <div className="mc-reads" role="group" aria-label="Les deux lectures de la fournée">
            <span className="mc-read">
              <span className="mc-read-label">Fournée :</span>
              <span className="mc-read-value">
                <b>{fr(fournee.kcal)}</b> kcal · <b>{fr(fournee.protein)}</b> g prot.
              </span>
            </span>
            <span className="mc-read is-per">
              <span className="mc-read-label">Par repas :</span>
              <span className="mc-read-value">
                <b>{fr(portion.kcal)}</b> kcal · <b>{fr(portion.protein)}</b> g prot.
              </span>
            </span>
          </div>
        ) : (
          <p className="mc-foot-hint">Choisis une source : les quantités s’écriront pour la fournée.</p>
        )}
        <div className="mc-foot-actions">
          <button type="button" className="s-btn is-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="s-btn is-primary" onClick={save} disabled={!valid}>
            Enregistrer le repas
          </button>
        </div>
      </footer>
    </div>
  );
}

/** Une des trois sources, à plat : un clic choisit, il n’y a pas de second bouton à trouver. */
function SourceTile({
  icon,
  tone,
  name,
  sub,
  on,
  onClick,
}: {
  icon: ReactNode;
  tone: 'mint' | 'peach' | 'butter';
  name: string;
  sub: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`mc-tile ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      <span className={`mc-tile-icon is-${tone}`}>{icon}</span>
      <span className="mc-tile-name">{name}</span>
      <span className="mc-tile-sub">{sub}</span>
    </button>
  );
}

/** La recherche du carnet, groupée : ce qui sauve le stock d’abord, puis les plats, puis le reste. */
function RecipeChooser({ onPick, current }: { onPick: (r: Recipe) => void; current?: string }) {
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

  const rescue = useMemo(() => {
    if (searching) return [];
    const atRisk = new Set(priorities.filter((p) => p.atRisk > 0).map((p) => p.food.id));
    return data.recipes
      .map((r) => ({ r, used: (r.ingredients ?? []).filter((i) => atRisk.has(i.foodId)).length }))
      .filter((x) => x.used > 0)
      .sort((a, b) => b.used - a.used)
      .slice(0, 3)
      .map((x) => x.r);
  }, [data.recipes, priorities, searching]);

  const rescued = new Set(rescue.map((r) => r.id));
  const groups = searching
    ? [{ key: 'found', title: `${all.length} recette${all.length > 1 ? 's' : ''}`, list: all }]
    : [
        { key: 'rescue', title: 'À faire vite avec ton stock', list: rescue },
        { key: 'mains', title: 'Plats', list: all.filter((r) => !rescued.has(r.id) && r.dish === 'Plat') },
        { key: 'sides', title: 'Accompagnements, sauces, desserts', list: all.filter((r) => !rescued.has(r.id) && r.dish !== 'Plat') },
      ];

  return (
    <div className="mc-recipes-wrap">
      <label className="mc-search">
        <Search size={15} aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher une recette"
          aria-label="Chercher une recette"
          autoFocus
        />
      </label>
      <div className="mc-recipes">
        {groups
          .filter((g) => g.list.length > 0)
          .map((g) => (
            <div key={g.key} className="mc-recipe-group">
              <p className="mc-recipe-group-title">
                {g.key === 'rescue' && <Leaf size={12} aria-hidden />} {g.title}
              </p>
              {g.list.map((r) => {
                const kcal = info.get(r.id)?.nutrients.kcal ?? 0;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`mc-recipe ${r.id === current ? 'is-on' : ''}`}
                    aria-pressed={r.id === current}
                    onClick={() => onPick(r)}
                  >
                    <span className="mc-recipe-thumb">{r.cover ? <Cover recipe={r} ratio="square" /> : <ChefHat size={16} aria-hidden />}</span>
                    <span className="mc-recipe-text">
                      <span className="mc-recipe-name">{r.name}</span>
                      <span className="mc-recipe-meta num">{isPlannable(r) ? `${fr(kcal)} kcal / portion` : 'quantités à compléter'}</span>
                    </span>
                    {r.dish !== 'Plat' && <span className="mc-recipe-dish">{r.dish}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        {searching && all.length === 0 && <p className="mc-empty">Aucune recette ne porte ce nom.</p>}
      </div>
    </div>
  );
}

/** Ce qu’il y a en stock, du plus urgent au moins urgent : un clic l’ajoute à la fournée. */
function StockChooser({ onAdd, onSearch, added }: { onAdd: (food: Food) => void; onSearch: () => void; added: Set<string> }) {
  const app = useApp();
  const rows = useMemo(
    () =>
      [...app.stock.values()]
        .filter((s) => s.remaining > 1e-6)
        .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999) || a.food.name.localeCompare(b.food.name, 'fr'))
        .slice(0, 8),
    [app.stock],
  );

  if (rows.length === 0) {
    return <p className="mc-empty">Le stock est vide. Cherche dans le catalogue pour ajouter un aliment.</p>;
  }

  return (
    <div className="mc-pantry">
      <p className="mc-hint">Du plus urgent au moins urgent, avec ce qui reste.</p>
      <div className="mc-pantry-list">
        {rows.map(({ food, remaining, daysLeft, nextExpiry }) => {
          const inDraft = added.has(food.id);
          return (
            <button
              key={food.id}
              type="button"
              className="mc-pantry-row"
              onClick={() => onAdd(food)}
              disabled={inDraft}
              aria-label={inDraft ? `${food.name}, déjà dans la fournée` : `Ajouter ${food.name}, ${formatQty(food, remaining)} en stock`}
            >
              <span className="mc-pantry-name">{food.name}</span>
              <span className="mc-pantry-qty num">{inDraft ? 'ajouté' : formatQty(food, remaining)}</span>
              {!inDraft && daysLeft !== undefined && daysLeft <= 2 && nextExpiry && (
                <span className="mc-pantry-when">à cuisiner avant le {formatDayMonth(nextExpiry)}</span>
              )}
            </button>
          );
        })}
      </div>
      <button type="button" className="mc-link" onClick={onSearch}>
        <Search size={13} aria-hidden /> Chercher dans le catalogue
      </button>
    </div>
  );
}

/** Où iront les portions d’une nouvelle fournée, avec le vrai décalage du plan. */
function PortionPlacement({ date, portions, sameDay }: { date: ISODate; portions: number; sameDay: boolean }) {
  const { data } = useApp();
  const block: PlanEntry[] = Array.from({ length: portions }, (_, i) => ({ id: `apercu-${i}`, date: '', kind: i ? 'leftover' : 'cook' }));
  const after = insertBlock(data.plan.entries, block, date);
  const placed = after.filter((e) => e.id.startsWith('apercu-')).map((e) => `le ${formatDayMonth(e.date)}`);
  const before = new Map(data.plan.entries.map((e) => [e.id, e.date]));
  const moved = after.filter((e) => before.has(e.id) && before.get(e.id) !== e.date).length;
  const list = placed.length <= 1 ? (placed[0] ?? '') : `${placed.slice(0, -1).join(', ')} et ${placed[placed.length - 1]}`;
  const shift = moved > 0 && !sameDay ? ` La suite du plan glisse de ${moved} repas.` : '';
  if (sameDay) return null;
  if (portions > 1) {
    return (
      <p className="mc-place">
        La fournée donne {portions} portions : {list}.{shift}
      </p>
    );
  }
  if (moved > 0) {
    return <p className="mc-place">Ce jour porte déjà un repas : la suite du plan glisse de {moved} repas pour lui faire place.</p>;
  }
  return null;
}

/** Une ligne d’ingrédient : la quantité pour la fournée, l’aliment, les kcal de cette quantité. */
function IngredientRow({
  ing,
  count,
  showStock,
  autoFocus,
  onQty,
  onRemove,
}: {
  ing: Ingredient;
  count: number;
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
  const short = showStock && have + 1e-6 < ing.qty;
  const kcal = ingredientNutrients(app.foods, ing).kcal;
  const name = food ? splitAmount(food, ing.qty).label : ing.foodId;

  const commit = () => {
    const n = parseQty(v);
    if (Number.isFinite(n) && n > 0 && Math.abs(n - ing.qty) > 1e-9) onQty(n);
    else setV(showQty(food, ing.qty));
  };

  return (
    <li className={`mc-row ${short ? 'is-short' : ''}`}>
      <span className="mc-qty">
        <input
          ref={ref}
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={`Quantité de ${food?.name ?? ing.foodId}, pour ${count} repas`}
        />
        <span className="mc-unit">{unitWord(food)}</span>
      </span>
      <span className="mc-row-name">
        <span className="mc-name">{name}</span>
        {showStock && (
          <span className={`mc-stock-chip ${short ? 'is-short' : ''}`}>
            {have > 0 ? `reste ${formatQty(food, have)}` : 'pas en stock'}
          </span>
        )}
      </span>
      <span className="mc-row-kcal">
        <span>
          <b className="num">{fr(kcal)}</b> kcal
        </span>
        <i>pour {count} repas</i>
      </span>
      <button type="button" className="mc-row-x" onClick={onRemove} aria-label={`Retirer ${food?.name ?? ing.foodId}`}>
        <X size={14} aria-hidden />
      </button>
    </li>
  );
}
