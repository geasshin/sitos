import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Link2, X } from 'lucide-react';
import { useApp } from '../context';
import { linkProposal, mergeIngredients, requantify } from '../domain/recipes';
import type { Recipe } from '../domain/types';
import { formatQty } from '../domain/stock';

/**
 * Relier une fiche écrite en clair au stock : chaque ligne d'ingrédient devient un produit
 * et une quantité. La proposition vient de la même lecture que les listes de courses,
 * et rien n'est enregistré avant la validation.
 */
export function LinkIngredients({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const app = useApp();
  const { data, store } = app;
  const foods = useMemo(() => [...data.foods].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [data.foods]);
  const byId = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const [rows, setRows] = useState(() =>
    linkProposal(recipe.ingredientsText ?? [], foods).map((r) => ({
      line: r.line,
      foodId: r.foodId ?? '',
      qty: r.qty ?? 0,
    })),
  );
  const [portions, setPortions] = useState(recipe.portions ?? data.settings.mealsPerCook ?? 2);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
    };
  }, [onClose]);

  const kept = rows.filter((r) => r.foodId && r.qty > 0);
  const ingredients = mergeIngredients(kept);

  const save = () => {
    if (kept.length === 0) return;
    store.update('recipes', (list) =>
      list.map((x) => (x.id === recipe.id ? { ...x, ingredients, portions: Math.max(1, portions), updatedAt: app.today } : x)),
    );
    onClose();
  };

  return (
    <div className="cook-overlay link-overlay" role="dialog" aria-modal="true" aria-label="Relier les ingrédients au stock">
      <header className="cook-head">
        <p className="cook-name">Relier au stock</p>
        <p className="cook-count">
          {kept.length} / {rows.length} lignes comptées
        </p>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
          <X size={20} aria-hidden />
        </button>
      </header>

      <div className="link-body">
        <p className="hint">
          Chaque ligne reconnue sortira du stock quand tu cocheras le repas, et entrera dans le calcul des calories.
          Ce qui reste sans produit est ignoré : épices, herbes, bouillon.
        </p>

        <div className="link-head">
          <span>Dans la fiche</span>
          <span>Produit du stock</span>
          <span>Quantité</span>
        </div>
        <ul className="link-rows">
          {rows.map((r, i) => {
            const food = byId.get(r.foodId);
            return (
              <li key={i} className={r.foodId ? '' : 'is-off'}>
                <span className="link-line" title={r.line}>{r.line}</span>
                <select
                  value={r.foodId}
                  aria-label={`Produit pour ${r.line}`}
                  onChange={(e) =>
                    setRows((list) =>
                      list.map((x, k) => (k === i ? { ...x, foodId: e.target.value, qty: requantify(byId.get(x.foodId), byId.get(e.target.value), x.qty) } : x)),
                    )
                  }
                >
                  <option value="">— ne pas compter —</option>
                  {foods.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <span className="link-qty">
                  <input
                    type="number"
                    min={0}
                    step={food?.unit === 'pièce' ? 1 : 10}
                    value={r.qty || ''}
                    aria-label={`Quantité pour ${r.line}`}
                    onChange={(e) => setRows((list) => list.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))}
                  />
                  <span className="muted small">{food ? (food.unit === 'pièce' ? 'pièce' : food.unit) : ''}</span>
                </span>
              </li>
            );
          })}
        </ul>

        {ingredients.length > 0 && (
          <p className="small">
            Au total : {ingredients.map((ing) => `${formatQty(byId.get(ing.foodId), ing.qty)} de ${byId.get(ing.foodId)?.name.toLowerCase() ?? ing.foodId}`).join(' · ')}
          </p>
        )}

        <div className="link-foot">
          <label className="field is-inline">
            <span>Cette recette donne</span>
            <span className="stepper">
              <button type="button" className="icon-button" onClick={() => setPortions((v) => Math.max(1, v - 1))} aria-label="Un repas de moins">−</button>
              <span className="num">{portions}</span>
              <button type="button" className="icon-button" onClick={() => setPortions((v) => Math.min(6, v + 1))} aria-label="Un repas de plus">+</button>
            </span>
            <span className="muted">repas</span>
          </label>
          <button type="button" className="primary-button" disabled={kept.length === 0} onClick={save}>
            <Link2 size={15} aria-hidden /> Relier {kept.length} ingrédient{kept.length > 1 ? 's' : ''}
            <ArrowRight size={15} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
