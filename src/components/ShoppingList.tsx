import { useState } from 'react';
import { Check, Copy, PackageOpen } from 'lucide-react';
import { useApp } from '../context';
import { shoppingList, shoppingText, type ShoppingLine } from '../domain/shopping';
import { formatQty } from '../domain/stock';
import { formatShort } from '../domain/dates';
import type { Food } from '../domain/types';

const SECTION: Record<ShoppingLine['reason'], { title: string; empty: string }> = {
  manque: { title: 'Il manque pour le plan', empty: 'Tout ce que les plats à venir demandent est en stock.' },
  'bientôt fini': { title: 'Presque fini', empty: 'Rien ne va s’épuiser avant le prochain plat.' },
  base: { title: 'Produits de base', empty: 'Les produits de base sont là.' },
};

/** La liste de courses : ce qui manque, ce qui va finir, les bases. Se coche et se copie. */
export function ShoppingList() {
  const app = useApp();
  const { data, store, today } = app;
  const list = shoppingList(data, app.stock, app.forecast, app.foods);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [fruits, setFruits] = useState(data.settings.fruitsPerDay);
  const total = list.missing.length + list.low.length + list.basics.length;

  const text = shoppingText(list, (food: Food, qty) => formatQty(food, qty));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Courses Sitos, ${formatShort(today)}\n${text}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Le presse-papiers peut refuser : le texte reste lisible à l'écran.
    }
  };

  const rows = (lines: ShoppingLine[], reason: ShoppingLine['reason']) =>
    lines.map((l) => {
      const key = `${reason}-${l.food.id}`;
      const isDone = done.has(key);
      return (
        <li key={key} className={`shop-row ${isDone ? 'is-done' : ''}`}>
          <button
            type="button"
            className="shop-check"
            aria-pressed={isDone}
            aria-label={`${isDone ? 'Décocher' : 'Cocher'} ${l.food.name}`}
            onClick={() =>
              setDone((d) => {
                const next = new Set(d);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          >
            {isDone && <Check size={13} aria-hidden />}
          </button>
          <span className="shop-name">{l.food.name}</span>
          <span className="shop-qty num">{formatQty(l.food, l.qty)}</span>
          {l.date && <span className="muted small">{reason === 'manque' ? `dès le ${formatShort(l.date)}` : `pour le ${formatShort(l.date)}`}</span>}
        </li>
      );
    });

  return (
    <div className="shopping">
      <div className="shopping-head">
        <p className="page-subtitle">
          <span className="num">{total}</span> produit{total > 1 ? 's' : ''} à prendre
        </p>
        <div className="setting-actions">
          <div className="stepper" role="group" aria-label="Fruits mangés nature par jour">
            <button type="button" className="icon-button" aria-label="Un fruit de moins" disabled={fruits <= 0} onClick={() => { const n = Math.max(0, fruits - 1); setFruits(n); store.update('settings', (x) => ({ ...x, fruitsPerDay: n })); }}>
              <span aria-hidden>−</span>
            </button>
            <span className="num">{fruits}</span>
            <button type="button" className="icon-button" aria-label="Un fruit de plus" disabled={fruits >= 4} onClick={() => { const n = Math.min(4, fruits + 1); setFruits(n); store.update('settings', (x) => ({ ...x, fruitsPerDay: n })); }}>
              <span aria-hidden>+</span>
            </button>
          </div>
          <span className="muted small">fruits par jour</span>
          <button type="button" className="secondary-button is-sm" onClick={() => void copy()} disabled={total === 0}>
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? 'Copié' : 'Copier la liste'}
          </button>
        </div>
      </div>

      {total === 0 ? (
        <p className="empty-inline">
          <PackageOpen size={18} aria-hidden /> Rien à acheter : le plan tient avec le stock actuel.
        </p>
      ) : (
        <>
          {(['manque', 'bientôt fini', 'base'] as const).map((reason) => {
            const lines = reason === 'manque' ? list.missing : reason === 'bientôt fini' ? list.low : list.basics;
            return (
              <section key={reason} className="shop-section">
                <p className="balance-sub">
                  {SECTION[reason].title}
                  {lines.length > 0 && <span className="muted"> · {lines.length}</span>}
                </p>
                {lines.length === 0 ? <p className="hint">{SECTION[reason].empty}</p> : <ul className="shop-list">{rows(lines, reason)}</ul>}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
