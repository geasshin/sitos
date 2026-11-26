import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { useApp } from '../context';
import { groupByFamily, searchFoods, stockOf, type StockMap } from '../domain/foodSearch';
import { ZERO, scale, toGrams } from '../domain/nutrition';
import { newId } from '../domain/plan';
import { formatQty } from '../domain/stock';
import type { Food } from '../domain/types';
import './food-picker.css';

export interface FoodPickerProps {
  /** Le sélecteur est monté dans une feuille : c’est l’appelant qui l’ouvre et le ferme. */
  open: boolean;
  onClose: () => void;
  /** Choisir un aliment le rend avec sa portion usuelle ; l’appelant décide de la suite. */
  onPick: (food: Food, qty: number) => void;
  /** Requête de départ, quand la feuille s’ouvre depuis un champ déjà rempli. */
  initialQuery?: string;
  /** Stocks disponibles : pastille sur chaque ligne et filtre « ce que j’ai en stock ». */
  stock?: StockMap;
  /** Propose de créer un aliment absent du catalogue, sans quitter la saisie. */
  allowCreate?: boolean;
}

const fr = (value: number, digits = 0) => value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
const parseNumber = (value: string) => Number(value.replace(',', '.').trim());

/** Portion usuelle : une pièce, un filet de matière grasse, 100 g ou 100 ml sinon. */
function usualQty(food: Food): number {
  if (food.unit === 'pièce') return 1;
  if (food.category === 'matières grasses') return 10;
  return 100;
}

function portionLabel(food: Food): string {
  if (food.unit === 'pièce') {
    const piece = food.piece?.[0] ?? 'pièce';
    return food.gramsPerUnit ? `1 ${piece} · ${fr(food.gramsPerUnit)} g` : `1 ${piece}`;
  }
  return `${usualQty(food)} ${food.unit}`;
}

function portionNutrients(food: Food): { kcal: number; protein: number } {
  const nutrients = scale(food.per100, toGrams(food, usualQty(food)) / 100);
  return { kcal: Math.round(nutrients.kcal), protein: nutrients.protein };
}

/**
 * Le sélecteur d’aliments unique : composer un repas, ajouter un complément, écrire une recette,
 * saisir un achat ou corriger une quantité passent tous par lui.
 *
 * Il ne dessine aucune fenêtre : il rend la recherche, la liste groupée par famille et la création
 * à la volée, à poser dans une `Sheet` par l’appelant. Le catalogue est lu dans le contexte de
 * l’application ; rien n’est modifié, sauf l’aliment créé quand `allowCreate` est vrai et que la
 * personne le demande explicitement.
 *
 * Clavier : flèches haut et bas pour parcourir, Entrée pour choisir, Échap pour fermer.
 */
export function FoodPicker({ open, ...props }: FoodPickerProps) {
  // Fermé, le corps est démonté : chaque ouverture repart de la requête demandée.
  if (!open) return null;
  return <FoodPickerBody {...props} />;
}

function FoodPickerBody({ onClose, onPick, initialQuery, stock, allowCreate = false }: Omit<FoodPickerProps, 'open'>) {
  const app = useApp();
  const foods = app.data.foods;
  const [query, setQuery] = useState(initialQuery ?? '');
  const [active, setActive] = useState(0);
  const [stockOnly, setStockOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-opt-${index}`;

  const matches = useMemo(
    () => searchFoods(foods, query, { stock, onlyInStock: stockOnly }),
    [foods, query, stock, stockOnly],
  );
  const groups = useMemo(() => groupByFamily(matches), [matches]);
  const rows = useMemo(() => groups.flatMap((group) => group.matches), [groups]);
  const positions = useMemo(() => new Map(rows.map((match, index) => [match.food.id, index])), [rows]);
  const activeIndex = rows.length === 0 ? -1 : Math.min(active, rows.length - 1);
  const activeMatch = activeIndex >= 0 ? rows[activeIndex] : undefined;

  // La ligne courante reste visible pendant la navigation au clavier.
  useEffect(() => {
    if (activeIndex < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const change = (value: string) => {
    setQuery(value);
    setActive(0);
    setCreating(false);
  };

  const pick = (food: Food, qty = usualQty(food)) => {
    onPick(food, qty);
    onClose();
  };

  const move = (delta: number) => {
    if (rows.length === 0) return;
    setActive((current) => Math.min(Math.max(current + delta, 0), rows.length - 1));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      if (rows.length > 0) setActive(rows.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (activeMatch) pick(activeMatch.food);
      else if (allowCreate && query.trim()) setCreating(true);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (creating) stopCreating();
      else onClose();
    }
  };

  const clear = () => {
    change('');
    inputRef.current?.focus();
  };

  const createFood = (food: Food) => {
    app.store.update('foods', (list) => [...list, food]);
    pick(food);
  };

  const stopCreating = () => {
    setCreating(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const filtering = query.trim().length > 0 || stockOnly;
  const countLabel =
    rows.length === 0
      ? 'Aucun aliment'
      : `${rows.length} ${rows.length > 1 ? 'aliments' : 'aliment'}${filtering ? '' : ' au catalogue'}`;
  const emptyTitle = query.trim()
    ? stockOnly
      ? `Rien en stock pour « ${query.trim()} ».`
      : `Aucun aliment pour « ${query.trim()} ».`
    : stockOnly
      ? 'Rien en stock.'
      : 'Aucun aliment dans le catalogue.';

  return (
    <div className="food-picker" role="group" aria-label="Choisir un aliment">
      <div className="fp-search">
        <label className="fp-search-pill">
          <Search size={16} aria-hidden />
          <input
            ref={inputRef}
            className="fp-input"
            type="search"
            value={query}
            onChange={(event) => change(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Chercher un aliment"
            aria-label="Chercher un aliment"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            disabled={creating}
          />
          {query && !creating && (
            <button type="button" className="fp-clear" onClick={clear} aria-label="Effacer la recherche">
              <X size={14} aria-hidden />
            </button>
          )}
        </label>

        {stock && (
          <button
            type="button"
            className={`fp-stock-filter ${stockOnly ? 'is-on' : ''}`}
            aria-pressed={stockOnly}
            onClick={() => {
              setStockOnly((value) => !value);
              setActive(0);
            }}
          >
            <Check size={13} aria-hidden /> Ce que j’ai en stock
          </button>
        )}
      </div>

      <div className="fp-meta">
        <span>{countLabel}</span>
        <span className="fp-keys" aria-hidden>
          <kbd>↑</kbd>
          <kbd>↓</kbd> parcourir · <kbd>Entrée</kbd> choisir · <kbd>Échap</kbd> fermer
        </span>
      </div>

      <div className="fp-list" id={listId} role="listbox" aria-label="Aliments" ref={listRef}>
        {groups.map((group, groupIndex) => (
          <div
            className="fp-family"
            role="group"
            aria-labelledby={`${listId}-fam-${groupIndex}`}
            key={group.category}
          >
            <p className="fp-family-name" id={`${listId}-fam-${groupIndex}`}>
              {group.label}
              <span className="num">{group.matches.length}</span>
            </p>
            {group.matches.map((match) => {
              const index = positions.get(match.food.id) ?? 0;
              const isActive = index === activeIndex;
              const { kcal, protein } = portionNutrients(match.food);
              const available = stock ? stockOf(stock, match.food.id) : 0;
              const stockLabel = available > 0 ? `${formatQty(match.food, available)} en stock` : 'pas en stock';
              const label = `${match.food.name}, ${portionLabel(match.food)}, ${fr(kcal)} kcal, ${fr(protein, 1)} g de protéines${stock ? `, ${stockLabel}` : ''}`;
              return (
                <button
                  key={match.food.id}
                  id={optionId(index)}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  aria-label={label}
                  tabIndex={-1}
                  data-index={index}
                  className={`fp-row ${isActive ? 'is-active' : ''} ${stock ? 'has-stock' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(match.food)}
                >
                  <span className="fp-name">
                    <span className="fp-name-text">{match.food.name}</span>
                    <span className="fp-portion">{portionLabel(match.food)}</span>
                  </span>
                  <span className="fp-facts num">
                    <b>{fr(kcal)}</b> kcal · <b>{fr(protein, 1)}</b> g prot.
                  </span>
                  {stock && (
                    <span className={`fp-stock ${available > 0 ? '' : 'is-empty'}`} title={stockLabel}>
                      {available > 0 ? formatQty(match.food, available) : 'épuisé'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="fp-empty" role="status">
          <b>{emptyTitle}</b>
          <span>{allowCreate && query.trim() ? 'Essaie un autre mot, ou crée-le plus bas.' : 'Essaie un autre mot.'}</span>
        </p>
      )}

      {allowCreate && query.trim() && (
        <div className="fp-create">
          {creating ? (
            <CreateFood
              initialName={query.trim()}
              onCreate={createFood}
              onCancel={stopCreating}
            />
          ) : (
            <button type="button" className="fp-create-btn" onClick={() => setCreating(true)}>
              <Plus size={15} aria-hidden /> Nouvel aliment « {query.trim()} »
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Création à la volée : les valeurs connues suffisent, le reste compte pour zéro. */
function CreateFood({
  initialName,
  onCreate,
  onCancel,
}: {
  initialName: string;
  onCreate: (food: Food) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState<'g' | 'ml'>('g');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');

  const create = () => {
    const clean = name.trim();
    if (!clean) return;
    onCreate({
      id: `perso-${newId('f').slice(2)}`,
      name: clean.charAt(0).toUpperCase() + clean.slice(1),
      category: 'épicerie',
      unit,
      per100: { ...ZERO, kcal: parseNumber(kcal) || 0, protein: parseNumber(protein) || 0 },
      source: 'saisi à la main',
      storage: 'placard',
      shelfLifeDays: 30,
      custom: true,
    });
  };

  return (
    <div
      className="fp-new"
      role="group"
      aria-label="Nouvel aliment"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <p className="fp-new-title">Nouvel aliment</p>
      <label className="fp-field">
        <span>Nom</span>
        <input className="fp-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </label>
      <div className="fp-new-row">
        <label className="fp-field">
          <span>Unité</span>
          <select className="fp-input" value={unit} onChange={(event) => setUnit(event.target.value as 'g' | 'ml')}>
            <option value="g">g</option>
            <option value="ml">ml</option>
          </select>
        </label>
        <label className="fp-field">
          <span>kcal pour 100 {unit}</span>
          <input className="fp-input" inputMode="decimal" value={kcal} onChange={(event) => setKcal(event.target.value)} placeholder="0" />
        </label>
        <label className="fp-field">
          <span>Protéines (g) pour 100 {unit}</span>
          <input className="fp-input" inputMode="decimal" value={protein} onChange={(event) => setProtein(event.target.value)} placeholder="0" />
        </label>
      </div>
      <p className="fp-new-hint">Les valeurs que tu connais ; le reste compte pour zéro.</p>
      <div className="fp-new-actions">
        <button type="button" className="s-btn is-ghost is-sm" onClick={onCancel}>
          Annuler
        </button>
        <button type="button" className="s-btn is-primary is-sm" onClick={create} disabled={!name.trim()}>
          Créer et choisir
        </button>
      </div>
    </div>
  );
}
