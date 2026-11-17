import { useMemo, useState } from 'react';
import { BookOpen, Check, Plus, Search, X } from 'lucide-react';
import { useApp } from '../context';
import { recommendSides, sideCandidates } from '../domain/balance';
import { baseAmount, mergeComplements, scaledItems, searchComplements } from '../domain/complements';
import { dayNutrition, itemsNutrients, ZERO, type FoodIndex } from '../domain/nutrition';
import { newId } from '../domain/plan';
import { amount, availableOn } from '../domain/stock';
import type { Food, Ingredient, ISODate } from '../domain/types';
import { Modal } from './Modal';

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const byName = (a: Food, b: Food) => a.name.localeCompare(b.name, 'fr');
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .trim();
type PortionIdea = { id: string; items: Ingredient[]; name?: string; label?: string };
const ideaName = (idea: PortionIdea) => idea.name ?? idea.label ?? '';

function facts(foodIndex: FoodIndex, items: Ingredient[]) {
  const n = itemsNutrients(foodIndex, items);
  return `${fr(n.kcal)} kcal · ${fr(n.protein)} g prot.`;
}

/**
 * Le catalogue de compléments d'une journée : ce qui est déjà choisi, ce qui comble le mieux
 * les manques, puis tout le reste. Un clic ajoute au journal du jour, un autre retire.
 */
export function Complements({ date }: { date: ISODate }) {
  const app = useApp();
  const { data, foods, store, targets, today } = app;
  const [query, setQuery] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, number>>({});

  const amountOf = (idea: PortionIdea) => amounts[idea.id] ?? baseAmount(idea);
  const stepOf = (idea: PortionIdea) => {
    const food = foods.get(idea.items[0]?.foodId ?? '');
    return food?.unit === 'pièce' ? 0.5 : 10;
  };
  const unitOf = (idea: PortionIdea) => {
    const food = foods.get(idea.items[0]?.foodId ?? '');
    return food?.unit === 'pièce' ? 'pièce' : food?.unit === 'ml' ? 'ml' : 'g';
  };
  const setAmountFor = (idea: PortionIdea, value: number) => {
    const step = stepOf(idea);
    const safe = Number.isFinite(value) ? Math.max(step, Math.round(value * 100) / 100) : baseAmount(idea);
    setAmounts((prev) => ({ ...prev, [idea.id]: safe }));
  };
  const addIdea = (idea: PortionIdea) => add(ideaName(idea), scaledItems(idea, amountOf(idea)));

  const ideas = useMemo(() => mergeComplements(data.snackIdeas), [data.snackIdeas]);
  const known = useMemo(() => ideas.filter((c) => c.items.every((i) => foods.has(i.foodId))), [ideas, foods]);
  const avail = useMemo(() => availableOn(data, app.stock, today, date), [data, app.stock, today, date]);
  const chosen = data.journal.snacks.filter((s) => s.date === date);
  const chosenLabels = new Set(chosen.map((s) => s.label));
  const chosenFoods = new Set(chosen.flatMap((s) => s.items.filter((i) => i.foodId !== 'huile-olive').map((i) => i.foodId)));
  const total = chosen.reduce((sum, s) => sum + itemsNutrients(foods, s.items).kcal, 0);

  const day = dayNutrition(data, foods, date);
  const candidates = useMemo(
    () =>
      sideCandidates(mergeComplements(data.snackIdeas), foods, avail).filter(
        (c) => !chosenLabels.has(c.label) && !c.items.some((i) => i.foodId !== 'huile-olive' && chosenFoods.has(i.foodId)),
      ),
    [data.snackIdeas, foods, avail, chosenLabels, chosenFoods],
  );
  const reco = recommendSides({ nutrients: day.total, plantG: day.plantG }, targets, candidates, foods, 2);
  const picks = reco.picks;

  const catalogList = useMemo(() => {
    const list = searchComplements(known, query);
    return [...list].sort((a, b) => {
      const addedA = chosenLabels.has(a.name) ? 0 : 1;
      const addedB = chosenLabels.has(b.name) ? 0 : 1;
      const aa = a.items.every((i) => avail(i.foodId) + 1e-6 >= i.qty) ? 0 : 1;
      const bb = b.items.every((i) => avail(i.foodId) + 1e-6 >= i.qty) ? 0 : 1;
      return addedA - addedB || aa - bb || a.name.localeCompare(b.name, 'fr');
    });
  }, [known, query, avail, chosenLabels]);

  const add = (label: string, items: Ingredient[]) => store.update('journal', (j) => ({ ...j, snacks: [...j.snacks, { id: newId('s'), date, label, items }] }));
  const remove = (id: string) => store.update('journal', (j) => ({ ...j, snacks: j.snacks.filter((s) => s.id !== id) }));

  const create = (label: string, items: Ingredient[], keep: boolean) => {
    add(label, items);
    if (!keep) return;
    store.update('snackIdeas', (list) => {
      const key = norm(label);
      const found = list.findIndex((x) => norm(x.name) === key);
      if (found >= 0) return list.map((x, i) => (i === found ? { ...x, items } : x));
      return [...list, { id: newId('idea'), name: label, items }];
    });
  };

  const openCatalog = () => {
    setQuery('');
    setCatalogOpen(true);
  };
  const closeCatalog = () => setCatalogOpen(false);
  const openCreate = () => {
    setCatalogOpen(false);
    setCreateOpen(true);
  };

  return (
    <div className="complements-body complete" aria-labelledby="complements-title">
      <div className="day-subhead">
        <h2 id="complements-title" className="complete-title">
          <Plus size={14} className="module-title-icon" aria-hidden /> Pour compléter
        </h2>
        {total > 0 && <span className="day-submeta num">+{fr(total)} kcal</span>}
      </div>

      {chosen.length > 0 && (
        <ul className="complete-added" aria-label="Compléments choisis">
          {chosen.map((s) => (
            <li key={s.id} className="complete-chip" title={facts(foods, s.items)}>
              <Check size={13} aria-hidden /> {s.label}
              <button type="button" onClick={() => remove(s.id)} aria-label={`Retirer ${s.label}`}>
                <X size={13} aria-hidden />
              </button>
            </li>
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

      <button type="button" className="secondary-button comp-open-catalog" onClick={openCatalog}>
        <BookOpen size={14} aria-hidden /> Parcourir le catalogue
        <span className="comp-catalog-count num">{known.length}</span>
      </button>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau complément" size="sm">
        {createOpen && <CreateComplement initialName={query} onCreate={create} onClose={() => setCreateOpen(false)} />}
      </Modal>

      <Modal open={catalogOpen} onClose={closeCatalog} title="Catalogue de compléments" size="md">
        {catalogOpen && (
          <div className="catalog-dialog">
            <label className="search-pill comp-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher dans le catalogue"
                aria-label="Chercher dans le catalogue"
                autoFocus
              />
            </label>

            <div className="catalog-dialog-head">
              <span className="comp-sub">{query.trim() ? `Résultats · ${catalogList.length}` : `${catalogList.length} compléments`}</span>
              <span className="hint num">
                {chosen.length} complément{chosen.length > 1 ? 's' : ''} · {fr(total)} kcal
              </span>
            </div>

            <ul className="comp-list catalog-dialog-list" aria-label="Catalogue de compléments">
              {catalogList.map((c) => {
                const value = amountOf(c);
                const scaled = scaledItems(c, value);
                const ok = scaled.every((i) => avail(i.foodId) + 1e-6 >= i.qty);
                const added = chosenLabels.has(c.name);
                const n = itemsNutrients(foods, scaled);
                return (
                  <li key={c.id}>
                    {added ? (
                      <div className={`comp-row is-added ${ok ? '' : 'is-off'}`}>
                        <span className="comp-name">{c.name}</span>
                        <span className="comp-facts num">{facts(foods, c.items)}</span>
                        <span className="comp-check" title="Déjà ajouté" aria-label="Déjà ajouté">
                          <Check size={14} aria-hidden />
                        </span>
                      </div>
                    ) : (
                      <div className={`comp-row ${ok ? '' : 'is-off'}`}>
                        <span className="comp-name">{c.name}</span>
                        <span className="comp-facts num">
                          {fr(n.kcal)} kcal · {fr(n.protein)} g prot.
                          {!ok && <span className="comp-state"> · pas en stock</span>}
                        </span>
                        <span className="comp-add">
                          <input
                            className="comp-qty-input num"
                            type="number"
                            min={stepOf(c)}
                            step={stepOf(c)}
                            value={value}
                            onChange={(e) => setAmountFor(c, Number(e.target.value))}
                            aria-label={`Quantité de ${c.name} en ${unitOf(c)}`}
                            title="Nombre de pièces ou grammes à ajouter"
                          />
                          <span className="comp-unit">{unitOf(c)}</span>
                          <button type="button" className="comp-plus" onClick={() => addIdea(c)} aria-label={`Ajouter ${c.name}`}>
                            <Plus size={15} aria-hidden />
                          </button>
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {catalogList.length === 0 && <p className="hint">Aucun complément trouvé pour « {query.trim()} ».</p>}

            <div className="modal-foot">
              <button type="button" className="secondary-button is-sm" onClick={openCreate}>
                <Plus size={14} aria-hidden /> Créer un complément
              </button>
              <button type="button" className="primary-button" onClick={closeCatalog}>
                Terminé
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Une portion d'un aliment, nommée et gardée dans le catalogue si on le souhaite. */
function CreateComplement({
  initialName,
  onCreate,
  onClose,
}: {
  initialName: string;
  onCreate: (label: string, items: Ingredient[], keep: boolean) => void;
  onClose: () => void;
}) {
  const { data, foods, store } = useApp();
  const [query, setQuery] = useState('');
  const [foodId, setFoodId] = useState('');
  const [qty, setQty] = useState('');
  const [label, setLabel] = useState(initialName.trim());
  const [keep, setKeep] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKcal, setNewKcal] = useState('');
  const [newProtein, setNewProtein] = useState('');
  const [newFiber, setNewFiber] = useState('');

  const food = data.foods.find((f) => f.id === foodId);
  const n = food ? itemsNutrients(foods, [{ foodId: food.id, qty: Number(qty.replace(',', '.')) || 0 }]) : ZERO;
  const computed = food && Number(qty.replace(',', '.')) > 0 ? capitalize(amount(food, Number(qty.replace(',', '.')))).replace(/'/g, '’') : '';
  const list = useMemo(() => {
    const q = norm(query);
    return [...data.foods].filter((f) => !q || norm(f.name).includes(q)).sort(byName);
  }, [data.foods, query]);

  const pick = (f: Food) => {
    setFoodId(f.id);
    setQty(String(f.unit === 'pièce' ? 1 : 100));
    setLabel('');
  };

  const createFood = () => {
    const kcal = Number(newKcal.replace(',', '.'));
    if (!newName.trim() || !(kcal >= 0)) return;
    const id = `perso-${newId('f').slice(2)}`;
    const food: Food = {
      id,
      name: newName.trim().charAt(0).toUpperCase() + newName.trim().slice(1),
      category: 'épicerie',
      unit: 'g',
      per100: {
        ...ZERO,
        kcal,
        protein: Number(newProtein.replace(',', '.')) || 0,
        fiber: Number(newFiber.replace(',', '.')) || 0,
      },
      storage: 'placard',
      shelfLifeDays: 30,
      custom: true,
      source: 'saisi à la main',
    };
    store.update('foods', (list) => [...list, food]);
    setFoodId(id);
    setQty('100');
    setLabel('');
    setCreating(false);
    setQuery('');
    setNewName('');
    setNewKcal('');
    setNewProtein('');
    setNewFiber('');
  };

  return (
    <div className="create-complement">
      {!creating && (
        <>
          <label className="search-pill comp-search">
            <Search size={15} aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un aliment" aria-label="Chercher un aliment" />
          </label>

          <ul className="food-list" aria-label="Aliments">
            {list.map((f) => (
              <li key={f.id}>
                <button type="button" className={`food-row ${f.id === foodId ? 'on' : ''}`} onClick={() => pick(f)}>
                  <span>{f.name}</span>
                  <span className="num">
                    {fr(f.per100.kcal)} kcal / {f.unit === 'pièce' ? 'pièce' : '100 g'}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <button type="button" className="text-button is-sm create-food-toggle" onClick={() => setCreating(true)}>
            L’aliment n’est pas dans la liste
          </button>
        </>
      )}

      {creating && (
        <div className="create-food">
          <p className="balance-sub">Nouvel aliment</p>
          <div className="create-food-grid">
            <label className="field">
              <span>Nom</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Amandes grillées" />
            </label>
            <label className="field">
              <span>kcal / 100 g</span>
              <input inputMode="decimal" value={newKcal} onChange={(e) => setNewKcal(e.target.value)} placeholder="580" />
            </label>
            <label className="field">
              <span>Protéines (g)</span>
              <input inputMode="decimal" value={newProtein} onChange={(e) => setNewProtein(e.target.value)} placeholder="21" />
            </label>
            <label className="field">
              <span>Fibres (g)</span>
              <input inputMode="decimal" value={newFiber} onChange={(e) => setNewFiber(e.target.value)} placeholder="12" />
            </label>
          </div>
          <p className="hint">Les valeurs que tu connais ; les autres restent à zéro.</p>
          <div className="create-food-actions">
            <button type="button" className="secondary-button is-sm" onClick={createFood} disabled={!newName.trim()}>
              Créer l’aliment
            </button>
            <button type="button" className="text-button is-sm" onClick={() => setCreating(false)}>
              Retour à la liste
            </button>
          </div>
        </div>
      )}

      {!creating && food && (
        <div className="create-fields">
          <label className="field">
            <span>Quantité</span>
            <span className="qty-input">
              <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantité" />
              <span className="unit">{food.unit === 'pièce' ? 'pc' : food.unit}</span>
            </span>
          </label>
          <label className="field">
            <span>Nom dans la liste</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={computed} />
          </label>
        </div>
      )}

      {!creating && food && (
        <p className="create-preview">
          <span className="num">{computed || 'Choisis une quantité'}</span>
          <span className="num muted">
            {' '}
            · {fr(n.kcal)} kcal · {fr(n.protein)} g prot. · {fr(n.fiber)} g fibres
          </span>
        </p>
      )}

      <label className="toggle-row">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        <span>
          <span className="setting-label">Garder dans mes compléments</span>
          <span className="hint">Il sera proposé les prochaines fois.</span>
        </span>
      </label>

      <div className="modal-foot">
        <button type="button" className="text-button" onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={creating || !food || !(Number(qty.replace(',', '.')) > 0)}
          onClick={() => {
            if (!food) return;
            const value = Number(qty.replace(',', '.'));
            onCreate(label.trim() || computed, [{ foodId: food.id, qty: value }], keep);
            onClose();
          }}
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
