import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useApp } from '../context';
import { recommendSides, sideCandidates, type Gap } from '../domain/balance';
import { baseAmount, scaledItems, snackAmount, snackItems } from '../domain/complements';
import { dayNutrition, itemsNutrients, type FoodIndex } from '../domain/nutrition';
import { newId } from '../domain/plan';
import { availableOn } from '../domain/stock';
import type { Food, Ingredient, ISODate, Snack, SnackIdea } from '../domain/types';
import { FoodPicker } from './FoodPicker';
import './complements.css';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
type PortionIdea = { id: string; items: Ingredient[]; name?: string; label?: string };
const ideaName = (idea: PortionIdea) => idea.name ?? idea.label ?? '';

const unitOfFood = (food: Food | undefined) => (food?.unit === 'pièce' ? 'pièce' : food?.unit === 'ml' ? 'ml' : 'g');
const stepOfFood = (food: Food | undefined) => (food?.unit === 'pièce' ? 0.5 : 10);

function facts(foodIndex: FoodIndex, items: Ingredient[]) {
  const n = itemsNutrients(foodIndex, items);
  return `${fr(n.kcal)} kcal · ${fr(n.protein)} g prot.`;
}

const GAP_LABEL: Record<Gap['key'], (v: number) => string> = {
  kcal: (v) => `${fr(v)} kcal`,
  protein: (v) => `${fr(v)} g de protéines`,
  fiber: (v) => `${fr(v)} g de fibres`,
  plant: (v) => `${fr(v)} g de légumes et fruits`,
};

/**
 * Les compléments d’une journée : les portions déjà choisies, les suggestions qui comblent le
 * mieux les manques, puis le catalogue complet par le sélecteur unique. Un aliment absent des
 * suggestions se cherche ou se crée dans le sélecteur, sans quitter la journée.
 */
export function Complements({ date }: { date: ISODate }) {
  const app = useApp();
  const { data, foods, store, targets, today } = app;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<{ food: Food; qty: number } | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const amountOf = (idea: PortionIdea) => amounts[idea.id] ?? baseAmount(idea);
  const stepOf = (idea: PortionIdea) => stepOfFood(foods.get(idea.items[0]?.foodId ?? ''));
  const unitOf = (idea: PortionIdea) => unitOfFood(foods.get(idea.items[0]?.foodId ?? ''));
  const setAmountFor = (idea: PortionIdea, value: number) => {
    const step = stepOf(idea);
    const safe = Number.isFinite(value) ? Math.max(step, Math.round(value * 100) / 100) : baseAmount(idea);
    setAmounts((prev) => ({ ...prev, [idea.id]: safe }));
  };

  const ideas = data.snackIdeas;
  const avail = useMemo(() => availableOn(data, app.stock, today, date), [data, app.stock, today, date]);
  const chosen = data.journal.snacks.filter((s) => s.date === date);
  const chosenLabels = new Set(chosen.map((s) => s.label));
  const chosenFoods = new Set(chosen.flatMap((s) => s.items.filter((i) => i.foodId !== 'huile-olive').map((i) => i.foodId)));
  const total = chosen.reduce((sum, s) => sum + itemsNutrients(foods, s.items).kcal, 0);

  const day = dayNutrition(data, foods, date);
  const candidates = useMemo(
    () =>
      sideCandidates(ideas, foods, avail).filter(
        (c) => !chosenLabels.has(c.label) && !c.items.some((i) => i.foodId !== 'huile-olive' && chosenFoods.has(i.foodId)),
      ),
    [ideas, foods, avail, chosenLabels, chosenFoods],
  );
  const reco = recommendSides({ nutrients: day.total, plantG: day.plantG }, targets, candidates, foods, 2);
  const picks = reco.picks;

  const add = (label: string, items: Ingredient[], base?: { id?: string; amount?: number }) =>
    store.update('journal', (j) => ({
      ...j,
      snacks: [
        ...j.snacks,
        {
          id: newId('s'),
          date,
          label,
          items,
          ...(base?.id ? { ideaId: base.id } : {}),
          ...(base?.amount !== undefined ? { amount: base.amount } : {}),
        },
      ],
    }));
  const remove = (id: string) => store.update('journal', (j) => ({ ...j, snacks: j.snacks.filter((s) => s.id !== id) }));

  const addIdea = (idea: PortionIdea) => {
    const value = amountOf(idea);
    add(ideaName(idea), scaledItems(idea, value), { id: idea.id, amount: value });
  };

  // Un aliment du catalogue, avec sa quantité : la portion est figée au moment de l’ajout.
  const addFood = (food: Food, qty: number) => {
    add(food.name, [{ foodId: food.id, qty }], { amount: qty });
    setPicked(null);
    setPickerOpen(false);
  };

  const openPicker = () => {
    setPicked(null);
    setPickerOpen(true);
  };
  const closePicker = () => {
    setPicked(null);
    setPickerOpen(false);
  };
  const panelVisible = pickerOpen || picked !== null;

  return (
    <div className="complements-body complete" aria-labelledby="complements-title">
      <div className="day-subhead">
        <h2 id="complements-title" className="complete-title">
          <Plus size={14} className="module-title-icon" aria-hidden /> Pour compléter
        </h2>
        {total > 0 && <span className="day-submeta num">+{fr(total)} kcal</span>}
      </div>

      {chosen.length > 0 && (
        <ul className="snack-list" aria-label="Compléments choisis">
          {chosen.map((s) => (
            <SnackRow key={s.id} snack={s} ideas={ideas} onRemove={() => remove(s.id)} />
          ))}
        </ul>
      )}

      {picks.length > 0 ? (
        <ul className="complete-list">
          {picks.map((p) => {
            const idea = p.candidate;
            const value = amountOf(idea);
            const scaled = scaledItems(idea, value);
            const n = itemsNutrients(foods, scaled);
            return (
              <li key={idea.id} className={`complete-row has-qty ${avail(idea.items[0].foodId) + 1e-6 >= value ? '' : 'is-off'}`}>
                <span className="complete-name">{ideaName(idea)}</span>
                <span className="complete-facts num">
                  +{fr(n.protein)} g prot. · {fr(n.kcal)} kcal
                </span>
                <span className="comp-add">
                  <input
                    className="comp-qty-input num"
                    type="number"
                    min={stepOf(idea)}
                    step={stepOf(idea)}
                    value={value}
                    onChange={(e) => setAmountFor(idea, Number(e.target.value))}
                    aria-label={`Quantité de ${ideaName(idea)} en ${unitOf(idea)}`}
                    title="Nombre de pièces ou grammes à ajouter"
                  />
                  <span className="comp-unit">{unitOf(idea)}</span>
                  <button type="button" className="complete-add" onClick={() => addIdea(idea)} aria-label={`Ajouter ${ideaName(idea)}`}>
                    <Plus size={15} aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="complete-done">{reco.missing.length === 0 ? 'La journée est complète.' : 'Rien dans le stock ne comble ce qui manque.'}</p>
      )}

      {picks.length > 0 && reco.missing.length > 0 && (
        <div className="complete-left">
          <span className="complete-left-label">Il te manque encore</span>
          <ul className="complete-gaps">
            {reco.missing.map((g) => (
              <li key={g.key} className="complete-gap num">
                {GAP_LABEL[g.key](g.amount)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {panelVisible ? (
        <div className="compl-picker">
          <div className="compl-picker-head">
            <span className="comp-sub">{picked ? 'Sa quantité' : 'Tout le catalogue'}</span>
            <button type="button" className="s-btn is-ghost is-sm" onClick={closePicker}>
              <X size={14} aria-hidden /> Fermer
            </button>
          </div>
          {picked ? (
            <PortionStep
              food={picked.food}
              initialQty={picked.qty}
              onCancel={() => {
                setPicked(null);
                setPickerOpen(true);
              }}
              onAdd={(qty) => addFood(picked.food, qty)}
            />
          ) : (
            <FoodPicker
              open
              onClose={() => setPickerOpen(false)}
              onPick={(food, qty) => setPicked({ food, qty })}
              stock={app.stock}
              allowCreate
            />
          )}
        </div>
      ) : (
        <button type="button" className="s-btn is-primary compl-open" onClick={openPicker}>
          <Plus size={15} aria-hidden /> Ajouter un complément
          <span className="comp-catalog-count num">{data.foods.length} aliments</span>
        </button>
      )}
    </div>
  );
}

/** Une portion choisie dans le catalogue : sa quantité, ses valeurs en direct, puis l’ajout. */
function PortionStep({
  food,
  initialQty,
  onCancel,
  onAdd,
}: {
  food: Food;
  initialQty: number;
  onCancel: () => void;
  onAdd: (qty: number) => void;
}) {
  const { foods } = useApp();
  const [raw, setRaw] = useState(String(initialQty));
  const qty = Number(raw.replace(',', '.').trim());
  const valid = Number.isFinite(qty) && qty > 0;
  const n = itemsNutrients(foods, [{ foodId: food.id, qty: valid ? qty : 0 }]);
  const unit = unitOfFood(food);
  const step = stepOfFood(food);
  const submit = () => {
    if (valid) onAdd(qty);
  };

  return (
    <div className="compl-portion">
      <div className="compl-portion-head">
        <p className="compl-portion-name">{food.name}</p>
        <p className="compl-portion-sub">
          {valid ? `${qty.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${unit === 'pièce' && qty > 1 ? 'pièces' : unit}` : 'Choisis une quantité'}
        </p>
      </div>

      <label className="compl-field">
        <span>Quantité</span>
        <span className="compl-qty">
          <input
            inputMode="decimal"
            min={step}
            step={step}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              submit();
            }}
            aria-label={`Quantité de ${food.name} en ${unit}`}
            autoFocus
          />
          <span className="compl-qty-unit">{unit}</span>
        </span>
      </label>

      <p className="compl-portion-facts num" aria-live="polite">
        <b>{fr(n.kcal)}</b> kcal · <b>{fr(n.protein)}</b> g de protéines · {fr(n.fiber)} g de fibres
      </p>

      <div className="compl-portion-actions">
        <button type="button" className="s-btn is-ghost is-sm" onClick={onCancel}>
          Changer d’aliment
        </button>
        <button type="button" className="s-btn is-primary is-sm" onClick={submit} disabled={!valid}>
          Ajouter
        </button>
      </div>
    </div>
  );
}

/** Une portion déjà ajoutée : son nom, sa quantité ajustable, ses valeurs, et le retrait. */
function SnackRow({ snack, ideas, onRemove }: { snack: Snack; ideas: SnackIdea[]; onRemove: () => void }) {
  const { foods, store } = useApp();
  const current = snackAmount(snack);
  const first = foods.get(snack.items[0]?.foodId ?? '');
  const unit = unitOfFood(first);
  const step = stepOfFood(first);
  const [value, setValue] = useState(String(current));
  useEffect(() => setValue(String(current)), [current]);

  const commit = (raw: string) => {
    const next = Number(raw.replace(',', '.'));
    if (!Number.isFinite(next) || next <= 0) {
      setValue(String(current));
      return;
    }
    const items = snackItems(snack, ideas, next);
    store.update('journal', (j) => ({
      ...j,
      snacks: j.snacks.map((s) => (s.id === snack.id ? { ...s, items, amount: next } : s)),
    }));
  };

  return (
    <li className="snack-row">
      <span className="snack-row-name">{snack.label}</span>
      <span className="comp-add">
        <input
          className="comp-qty-input num"
          type="number"
          min={step}
          step={step}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={`Quantité de ${snack.label} en ${unit}`}
          title="Ajuster la quantité"
        />
        <span className="comp-unit">{unit}</span>
      </span>
      <span className="snack-row-facts num">{facts(foods, snack.items)}</span>
      <button type="button" className="icon-button is-sm" onClick={onRemove} aria-label={`Retirer ${snack.label}`}>
        <X size={13} aria-hidden />
      </button>
    </li>
  );
}
