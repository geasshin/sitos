import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ArrowRight, Check, Minus, Plus, Search, Unlink } from 'lucide-react';
import { useApp } from '../context';
import { linkProposal, mergeIngredients, requantify } from '../domain/recipes';
import { formatQty } from '../domain/stock';
import { normalizeSearch } from '../domain/foodSearch';
import type { Food, Ingredient, Recipe } from '../domain/types';
import { FoodPicker } from './FoodPicker';
import { Sheet, SheetActions } from './Sheet';
import './link-sheet.css';

/** Les fiches viennent parfois avec des apostrophes droites : à l’écran, on compose. */
const typo = (s: string) => s.replace(/'/g, '’');

/** Une ligne de la fiche, l’aliment choisi et sa quantité. */
interface Row {
  line: string;
  /** Nom de l’aliment proposé par la lecture de la ligne, même quand rien n’est reconnu. */
  label: string;
  foodId: string;
  qty: number;
}

const rowsOf = (recipe: Recipe, foods: Food[]): Row[] =>
  linkProposal(recipe.ingredientsText ?? [], foods).map((r) => ({
    line: r.line,
    label: r.label,
    foodId: r.foodId ?? '',
    qty: r.qty ?? 0,
  }));

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/** Quantité écrite en tête de ligne, avec son unité, quand l’aliment n’a pas été reconnu. */
const lineQty = (line: string): { qty: number; unit: 'g' | 'ml' | 'pcs' } | undefined => {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogrammes?|g|gr|grammes?|l|litres?|cl|centilitres?|ml|millilitres?|pi[eè]ces?|unit[eé]s?|u)?\b/i.exec(
    line,
  );
  if (!match) return undefined;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = (match[2] ?? '').toLowerCase();
  if (/^(kg|kilos?|kilogrammes?)$/.test(unit)) return { qty: value * 1000, unit: 'g' };
  if (/^(l|litres?)$/.test(unit)) return { qty: value * 1000, unit: 'ml' };
  if (/^(cl|centilitres?)$/.test(unit)) return { qty: value * 10, unit: 'ml' };
  if (/^(ml|millilitres?)$/.test(unit)) return { qty: value, unit: 'ml' };
  if (/^(pi[eè]ces?|unit[eé]s?|u)$/.test(unit)) return { qty: value, unit: 'pcs' };
  return { qty: value, unit: 'g' };
};

/** La quantité de la ligne, ramenée dans l’unité de l’aliment choisi. */
const qtyInFoodUnit = (from: { qty: number; unit: 'g' | 'ml' | 'pcs' }, food: Food) => {
  if (food.unit === 'pièce') {
    if (from.unit === 'pcs') return from.qty;
    return food.gramsPerUnit ? Math.max(1, Math.round(from.qty / food.gramsPerUnit)) : Math.max(1, Math.round(from.qty));
  }
  if (from.unit === 'pcs') return food.gramsPerUnit ? Math.round(from.qty * food.gramsPerUnit) : from.qty;
  return from.qty;
};

const seedOf = (row: Row, food: Food | undefined, foods: Food[]) => {
  if (food) return food.name;
  const rest = row.line
    .replace(/^\s*\d+(?:[.,]\d+)?\s*(kg|g|gr|grammes?|l|cl|ml|pi[eè]ces?|unit[eé]s?)?\b\.?\s*/i, '')
    .replace(/^(?:d[’']|l[’']|de\s+|du\s+|des\s+|la\s+|le\s+|les\s+|un\s+|une\s+)/i, '')
    .split(/[,;(]/)[0]
    .trim();
  const words = rest.split(/\s+/).filter((word) => word.length > 2);
  const known = words.find((word) => {
    const token = normalizeSearch(word);
    return foods.some((candidate) => normalizeSearch(candidate.name).split(' ').some((part) => part.startsWith(token)));
  });
  return known ?? words[0] ?? row.label;
};

/**
 * Relier une fiche écrite en clair au stock : chaque ligne de la fiche devient un aliment
 * et une quantité. La proposition vient de la même lecture que les listes de courses.
 *
 * La feuille se lit en deux temps : on choisit les liaisons, puis on relit la fiche telle
 * qu’elle sera enregistrée. Rien n’est écrit dans la recette avant la confirmation ; le
 * catalogue s’ouvre en panneau latéral dans la même feuille, jamais par-dessus.
 */
export function LinkIngredients({
  recipe,
  onClose,
  onApplied,
}: {
  recipe: Recipe;
  onClose: () => void;
  /** Appelé après l’écriture, pour poser le focus sur la fiche mise à jour. */
  onApplied?: () => void;
}) {
  const app = useApp();
  const { data, store } = app;
  const foods = data.foods;
  const byId = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const [rows, setRows] = useState<Row[]>(() => rowsOf(recipe, foods));
  const [portions, setPortions] = useState(recipe.portions ?? data.settings.mealsPerCook ?? 2);
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [picking, setPicking] = useState<number | null>(null);
  const pickTarget = useRef<number | null>(null);
  const rowButtons = useRef<(HTMLButtonElement | null)[]>([]);

  const kept = useMemo(() => rows.filter((r) => r.foodId && byId.has(r.foodId) && r.qty > 0), [rows, byId]);
  const ingredients = useMemo(() => mergeIngredients(kept), [kept]);
  const ignored = rows.filter((r) => !r.foodId || !byId.has(r.foodId) || r.qty <= 0);
  const duplicates = useMemo(() => {
    const count = new Map<string, number>();
    kept.forEach((r) => count.set(r.foodId, (count.get(r.foodId) ?? 0) + 1));
    return [...count.entries()]
      .filter(([, n]) => n > 1)
      .map(([id]) => byId.get(id)?.name)
      .filter((name): name is string => Boolean(name));
  }, [kept, byId]);

  const before = recipe.ingredients ?? [];
  const beforePortions = recipe.portions ?? data.settings.mealsPerCook ?? 2;

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const closePicker = useCallback(() => {
    const index = pickTarget.current;
    pickTarget.current = null;
    setPicking(null);
    if (index !== null) window.setTimeout(() => rowButtons.current[index]?.focus({ preventScroll: true }), 0);
  }, []);

  const openPicker = (index: number) => {
    pickTarget.current = index;
    setPicking(index);
  };

  // Échap ferme d’abord le catalogue, la feuille ensuite : rien ne se perd d’un coup.
  useEffect(() => {
    if (picking === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      // Dans la création d’un aliment, Échap annule la saisie, pas le catalogue.
      const form = event.target instanceof Element ? event.target.closest('.fp-new') : null;
      if (form) {
        form.querySelector<HTMLButtonElement>('.fp-new-actions .s-btn.is-ghost')?.click();
        return;
      }
      closePicker();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [picking, closePicker]);

  const choose = (food: Food, qty: number) => {
    const index = pickTarget.current;
    if (index === null) return;
    setRows((list) =>
      list.map((r, i) => {
        if (i !== index) return r;
        const previous = byId.get(r.foodId);
        const fromLine = previous ? undefined : lineQty(r.line);
        const next = r.qty > 0 ? r.qty : fromLine ? qtyInFoodUnit(fromLine, food) : qty;
        // La quantité déjà lue dans la fiche reste vraie quand l’unité ne change pas.
        return { ...r, foodId: food.id, qty: requantify(previous, food, next) };
      }),
    );
    closePicker();
  };

  const drop = (index: number) => setRow(index, { foodId: '', qty: 0 });

  const submit = () => {
    if (ingredients.length === 0) return;
    if (step === 'edit') {
      setStep('review');
      return;
    }
    store.update('recipes', (list) =>
      list.map((x) =>
        x.id === recipe.id ? { ...x, ingredients, portions: Math.max(1, portions), updatedAt: app.today } : x,
      ),
    );
    onClose();
    if (onApplied) window.setTimeout(onApplied, 0);
  };

  const count = ingredients.length;
  const keptCount = kept.length;
  const active = picking !== null ? rows[picking] : undefined;

  return (
    <Sheet
      open
      onClose={onClose}
      title={step === 'edit' ? 'Relier les ingrédients' : 'Ce qui sera enregistré'}
      subtitle={
        step === 'edit'
          ? `${typo(recipe.name)} · ${rows.length} ${plural(rows.length, 'ligne', 'lignes')} dans la fiche`
          : 'Rien n’est encore écrit. Vérifie, puis confirme.'
      }
      size="lg"
      onSubmit={submit}
      side={
        active ? (
          <>
            <div className="ls-pick-head">
              <div>
                <p className="ls-pick-kicker">Aliment pour cette ligne</p>
                <p className="ls-pick-line">{typo(active.line)}</p>
              </div>
              <button type="button" className="s-btn is-ghost is-sm" onClick={closePicker}>
                Fermer
              </button>
            </div>
            <FoodPicker
              open
              onClose={closePicker}
              onPick={choose}
              initialQuery={seedOf(active, byId.get(active.foodId), foods)}
              stock={app.stock}
              allowCreate
            />
          </>
        ) : undefined
      }
      sideLabel={active ? 'Catalogue des aliments' : undefined}
      footer={
        <SheetActions
          onCancel={step === 'edit' ? onClose : () => setStep('edit')}
          cancelLabel={step === 'edit' ? 'Annuler' : 'Modifier'}
          onConfirm={submit}
          confirmLabel={step === 'edit' ? 'Relire' : `Relier ${count} ${plural(count, 'ingrédient', 'ingrédients')}`}
          disabled={count === 0}
          hint={
            step === 'edit'
              ? keptCount > 0
                ? `${keptCount} ${plural(keptCount, 'ligne reliée', 'lignes reliées')} sur ${rows.length}`
                : 'Choisis au moins un aliment pour continuer.'
              : 'Rien n’est écrit avant de relier.'
          }
        />
      }
    >
      {step === 'edit' ? (
        <EditStep
          rows={rows}
          byId={byId}
          portions={portions}
          duplicates={duplicates}
          rowButtons={rowButtons}
          onOpen={openPicker}
          onQty={(index, qty) => setRow(index, { qty })}
          onDrop={drop}
          onPortions={setPortions}
          onSubmit={submit}
        />
      ) : (
        <ReviewStep
          ingredients={ingredients}
          ignored={ignored}
          byId={byId}
          stock={app.stock}
          portions={Math.max(1, portions)}
          beforeCount={before.length}
          beforePortions={beforePortions}
        />
      )}
    </Sheet>
  );
}

/** Les lignes de la fiche, l’aliment choisi et sa quantité. */
function EditStep({
  rows,
  byId,
  portions,
  duplicates,
  rowButtons,
  onOpen,
  onQty,
  onDrop,
  onPortions,
  onSubmit,
}: {
  rows: Row[];
  byId: Map<string, Food>;
  portions: number;
  duplicates: string[];
  rowButtons: RefObject<(HTMLButtonElement | null)[]>;
  onOpen: (index: number) => void;
  onQty: (index: number, qty: number) => void;
  onDrop: (index: number) => void;
  onPortions: (update: (value: number) => number) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <p className="ls-intro">
        Chaque ligne reliée à un aliment sortira du stock quand tu cocheras le repas, et entrera dans le calcul des
        calories. Ce qui reste sans aliment est ignoré : épices, herbes, bouillon.
      </p>

      <div className="ls-table">
        <div className="ls-head" aria-hidden>
          <span>Dans la fiche</span>
          <span>Aliment</span>
          <span>Quantité</span>
          <span />
        </div>
        <ul className="ls-rows">
          {rows.map((row, index) => {
            const food = byId.get(row.foodId);
            return (
              <li key={index} className={`ls-row ${food ? '' : 'is-off'}`}>
                <span className="ls-line" title={row.line}>
                  {typo(row.line)}
                </span>
                <button
                  ref={(node) => {
                    rowButtons.current[index] = node;
                  }}
                  type="button"
                  className={`ls-food ${food ? '' : 'is-empty'}`}
                  onClick={() => onOpen(index)}
                  aria-label={
                    food ? `Aliment pour « ${row.line} » : ${food.name}. Changer` : `Choisir un aliment pour « ${row.line} »`
                  }
                >
                  <span className="ls-food-name">{food ? typo(food.name) : 'Choisir un aliment'}</span>
                  <Search size={14} aria-hidden />
                </button>
                <span className="ls-qty">
                  {food ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        step={food.unit === 'pièce' ? 1 : 10}
                        value={row.qty || ''}
                        aria-label={`Quantité pour « ${row.line} »`}
                        onChange={(event) => onQty(index, Number(event.target.value))}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' || event.metaKey || event.ctrlKey) return;
                          event.preventDefault();
                          onSubmit();
                        }}
                      />
                      <span className="ls-unit">{food.unit === 'pièce' ? plural(row.qty, 'pièce', 'pièces') : food.unit}</span>
                    </>
                  ) : (
                    <span className="ls-qty-off">Non comptée</span>
                  )}
                </span>
                <button
                  type="button"
                  className="ls-drop"
                  onClick={() => onDrop(index)}
                  disabled={!food}
                  aria-label={`Ne pas compter « ${row.line} »`}
                  title="Ne pas compter cette ligne"
                >
                  <Unlink size={15} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {duplicates.length > 0 && (
        <p className="ls-note" role="status">
          {duplicates.join(' et ')} {plural(duplicates.length, 'revient', 'reviennent')} sur plusieurs lignes : les
          quantités s’additionnent à l’enregistrement.
        </p>
      )}

      <div className="ls-portions">
        <span className="ls-portions-label">Cette recette donne</span>
        <span className="ls-stepper">
          <button type="button" onClick={() => onPortions((value) => Math.max(1, value - 1))} aria-label="Un repas de moins">
            <Minus size={14} aria-hidden />
          </button>
          <span className="num">{portions}</span>
          <button type="button" onClick={() => onPortions((value) => Math.min(6, value + 1))} aria-label="Un repas de plus">
            <Plus size={14} aria-hidden />
          </button>
        </span>
        <span className="ls-portions-unit">repas</span>
      </div>
    </>
  );
}

/** La fiche telle qu’elle sera enregistrée, avec ce qui entre au stock. */
function ReviewStep({
  ingredients,
  ignored,
  byId,
  stock,
  portions,
  beforeCount,
  beforePortions,
}: {
  ingredients: Ingredient[];
  ignored: Row[];
  byId: Map<string, Food>;
  stock: ReadonlyMap<string, { remaining: number }>;
  portions: number;
  beforeCount: number;
  beforePortions: number;
}) {
  const count = ingredients.length;
  return (
    <>
      <p className="ls-lead">
        <b>
          {count} {plural(count, 'ingrédient', 'ingrédients')}
        </b>{' '}
        {plural(count, 'sera relié', 'seront reliés')} et la recette donnera{' '}
        <b>
          {portions} repas
        </b>
        . Le stock ne bouge pas maintenant : il sortira quand tu cocheras le repas. Une fois reliée, la fiche pourra
        être planifiée.
      </p>

      <dl className="ls-diff">
        <div>
          <dt>Ingrédients reliés</dt>
          <dd>
            <span className="ls-diff-from num">{beforeCount}</span>
            <ArrowRight size={13} aria-label="devient" />
            <b className="num">{count}</b>
          </dd>
        </div>
        <div>
          <dt>Repas</dt>
          <dd>
            <span className="ls-diff-from num">{beforePortions}</span>
            <ArrowRight size={13} aria-label="devient" />
            <b className="num">{portions}</b>
          </dd>
        </div>
      </dl>

      <ul className="ls-review" aria-label="Ingrédients qui seront enregistrés">
        {ingredients.map((ing) => {
          const food = byId.get(ing.foodId);
          const have = stock.get(ing.foodId)?.remaining ?? 0;
          const missing = have + 1e-6 < ing.qty;
          return (
            <li key={ing.foodId}>
              <span className="ls-review-qty">{formatQty(food, ing.qty)}</span>
              <span className="ls-review-name">{typo(food?.name ?? ing.foodId)}</span>
              <span className={`ls-review-state ${missing ? 'is-missing' : ''}`}>
                {missing ? (
                  have > 0 ? (
                    `manque ${formatQty(food, ing.qty - have)}`
                  ) : (
                    'pas en stock'
                  )
                ) : (
                  <>
                    <Check size={12} aria-hidden /> en stock
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {ignored.length > 0 && (
        <section className="ls-ignored" aria-labelledby="ls-ignored-titre">
          <h3 id="ls-ignored-titre">
            {ignored.length} {plural(ignored.length, 'ligne ignorée', 'lignes ignorées')}
          </h3>
          <p>
            {ignored.length > 1
              ? 'Sans aliment, elles ne comptent ni dans le stock ni dans les calories :'
              : 'Sans aliment, elle ne compte ni dans le stock ni dans les calories :'}
          </p>
          <ul>
            {ignored.map((row, index) => (
              <li key={index}>
                {typo(row.line)}
                {row.foodId && byId.has(row.foodId) && <span className="ls-ignored-why">quantité à zéro</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
