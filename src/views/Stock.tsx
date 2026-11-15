import { useState } from 'react';
import { ClipboardPaste, Minus, Plus, Search, ShoppingBasket } from 'lucide-react';
import { useApp } from '../context';
import { OrderImport } from '../components/OrderImport';
import { ShoppingList } from '../components/ShoppingList';
import { formatDayMonth, formatShort, relative } from '../domain/dates';
import { newId } from '../domain/plan';
import { amount, formatQty, shortQty, type FoodStock } from '../domain/stock';
import { urgencyTone } from './Today';
import type { Adjustment, Storage } from '../domain/types';
import { Empty } from '../components/ui';

type Filter = Storage | 'all' | 'watch';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'frigo', label: 'Frigo' },
  { id: 'fruitier', label: 'Fruitier' },
  { id: 'placard', label: 'Placard' },
  { id: 'watch', label: 'À surveiller' },
];

const FRESH_LABEL: Record<FoodStock['freshness'], string> = {
  périmé: 'Dépassé',
  urgent: 'Urgent',
  bientôt: 'Bientôt',
  ok: 'Large',
  épuisé: 'Épuisé',
};

export function StockView() {
  const app = useApp();
  const { data, today, store } = app;
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'stock' | 'courses'>('stock');
  const [adding, setAdding] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const risk = new Map<string, number>();
  for (const l of app.forecast.losses) risk.set(l.foodId, (risk.get(l.foodId) ?? 0) + l.qty);

  const all = [...app.stock.values()];
  const watchIds = new Set(app.priorities.map((p) => p.food.id));
  const watched = (s: FoodStock) => watchIds.has(s.food.id) || s.freshness === 'périmé';
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((s) => (filter === 'all' ? true : filter === 'watch' ? watched(s) : s.food.storage === filter))
    .filter((s) => !needle || s.food.name.toLowerCase().includes(needle))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.food.name.localeCompare(b.food.name, 'fr'));
  const live = all.filter((s) => s.remaining > 1e-6);

  const adjust = (foodId: string, qty: number, reason: Adjustment['reason']) =>
    store.update('journal', (j) => ({ ...j, adjustments: [...j.adjustments, { id: newId('a'), date: today, foodId, qty, reason }] }));

  return (
    <div className="page">
      <header className="page-head page-head-row">
        <div>
          <h1 className="display-title">Stock</h1>
          <p className="page-subtitle">
            <span className="num">{live.length}</span> produits<span className="subtitle-sep">·</span><span className="num">{all.filter(watched).length}</span> à surveiller
          </p>
        </div>
        <div className="head-actions">
          <button type="button" className="primary-button" onClick={() => { setMode('stock'); setOrdering((v) => !v); setAdding(false); }} aria-expanded={ordering}>
            <ClipboardPaste size={16} aria-hidden /> Saisir une commande
          </button>
          <button type="button" className="secondary-button" onClick={() => { setMode('stock'); setAdding((v) => !v); setOrdering(false); }} aria-expanded={adding}>
            <Plus size={16} aria-hidden /> Un achat
          </button>
        </div>
      </header>

      <div className="seg-group" role="tablist" aria-label="Vue">
        <button type="button" role="tab" aria-selected={mode === 'stock'} className={`seg-pill ${mode === 'stock' ? 'on' : ''}`} onClick={() => setMode('stock')}>
          Mon stock
        </button>
        <button type="button" role="tab" aria-selected={mode === 'courses'} className={`seg-pill ${mode === 'courses' ? 'on' : ''}`} onClick={() => { setMode('courses'); setOrdering(false); setAdding(false); }}>
          <ShoppingBasket size={14} aria-hidden /> Liste de courses
        </button>
      </div>

      {mode === 'courses' && <ShoppingList />}

      {mode === 'stock' && ordering && <OrderImport onDone={() => setOrdering(false)} />}
      {mode === 'stock' && adding && <PurchaseForm onDone={() => setAdding(false)} />}

      {mode === 'stock' && (
        <div className="stock-toolbar">
          <label className="search-pill">
            <Search size={15} aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un produit" aria-label="Chercher un produit" />
          </label>
          <div className="seg-group" role="tablist" aria-label="Filtrer le stock">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`seg-pill ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'stock' && (rows.length === 0 ? (
        <Empty title={filter === 'watch' ? 'Rien à surveiller' : 'Rien ici'}>{filter === 'watch' ? 'Tout ce qui est frais sera cuisiné à temps avec le plan actuel.' : undefined}</Empty>
      ) : (
        <ul className="stock-list">
          <li className="stock-row stock-head" aria-hidden>
            <span>Produit</span>
            <span>Reste</span>
            <span>Se garde</span>
            <span>Utilisation</span>
            <span />
          </li>
          {rows.map((s) => (
            <StockRow key={s.food.id} s={s} risk={risk.get(s.food.id) ?? 0} onAdjust={adjust} />
          ))}
        </ul>
      ))}
      {mode === 'stock' && (
        <p className="hint">
          Durées de conservation estimées depuis la réception, sauf date limite saisie. Fruits nature comptés à {data.settings.fruitsPerDay} par jour,
          réglage qui vit dans la liste de courses. Un repas ne sort du stock qu’une fois coché : un plat passé non coché apparaît ici comme non prévu.
        </p>
      )}
    </div>
  );
}

function StockRow({ s, risk, onAdjust }: { s: FoodStock; risk: number; onAdjust: (foodId: string, qty: number, reason: Adjustment['reason']) => void }) {
  const app = useApp();
  const { today } = app;
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const next = app.forecast.nextUse.get(s.food.id);
  const pct = s.initial > 0 ? Math.min(100, (s.remaining / s.initial) * 100) : 0;
  const unitLabel = s.food.unit === 'pièce' ? 'pièce(s)' : s.food.unit;
  return (
    <li className={`stock-row fresh-${s.freshness}`}>
      <div className="stock-name">
        <strong>{s.food.name}</strong>
        {s.food.pack && <span className="muted small">{s.food.pack.label}</span>}
      </div>
      <div className="stock-qty">
        <span className="num">{formatQty(s.food, s.remaining)}</span>
        <span className="muted num small">&nbsp;/ {formatQty(s.food, s.initial)}</span>
        <span className="level" aria-hidden><span style={{ width: `${pct}%` }} /></span>
      </div>
      <div className="stock-fresh">
        {s.nextExpiry && s.remaining > 1e-6 ? (
          <>
            <span className={`pill pill-${s.daysLeft! < 0 ? 'tomato' : urgencyTone(s.daysLeft!)}`}>{s.daysLeft! < 0 ? 'dépassé' : `${s.daysLeft} j`}</span>
            <span className="small">
              {s.daysLeft! < 0 ? `depuis le ${formatDayMonth(s.nextExpiry)}` : `jusqu’au ${formatDayMonth(s.nextExpiry)}`}
              {s.lots.length > 1 && <span className="muted"> · {s.lots.length} lots</span>}
            </span>
          </>
        ) : (
          <span className="pill pill-épuisé">{FRESH_LABEL[s.freshness]}</span>
        )}
      </div>
      <div className="stock-use small">
        <span className={next || s.food.dailyFruit ? '' : 'muted'}>
          {next ? <>Plat {relative(today, next) === "aujourd'hui" ? "aujourd'hui" : `le ${formatShort(next)}`}</> : s.food.dailyFruit ? <>Fruit nature</> : <>Aucun plat prévu</>}
        </span>
        {risk > 0.01 && (
          <span className="risk" title="Ni dans un plat prévu, ni dans un à-côté : ça reste en stock">
            {shortQty(s.food, risk)} non prévu
          </span>
        )}
        {s.overdrawn > 0.01 && <span className="risk">{amount(s.food, s.overdrawn)} utilisé en plus du stock</span>}
      </div>
      <div className="stock-actions">
        <button type="button" className="secondary-button is-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Minus size={14} aria-hidden /> Corriger
        </button>
      </div>
      {open && (
        <form
          className="adjust"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(qty.replace(',', '.'));
            if (!n || n <= 0) return;
            const reason = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') as Adjustment['reason'];
            onAdjust(s.food.id, n, reason ?? 'jeté');
            setOpen(false);
          }}
        >
          <label className="field field-inline">
            <span>Quantité ({unitLabel})</span>
            <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={s.food.unit === 'pièce' ? '1' : '100'} autoFocus />
          </label>
          <button type="submit" value="mangé hors plan" className="secondary-button is-sm">Mangé hors plan</button>
          <button type="submit" value="jeté" className="secondary-button is-sm">Jeté</button>
          <button type="submit" value="correction" className="secondary-button is-sm">Correction</button>
        </form>
      )}
    </li>
  );
}

function PurchaseForm({ onDone }: { onDone: () => void }) {
  const { data, today, store } = useApp();
  const [foodId, setFoodId] = useState(data.foods[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const [receivedAt, setReceivedAt] = useState(today);
  const [expiresAt, setExpiresAt] = useState('');
  const food = data.foods.find((f) => f.id === foodId);
  const foods = [...data.foods].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return (
    <form
      className="panel-form"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(qty.replace(',', '.'));
        if (!food || !n || n <= 0) return;
        store.update('stock', (s) => [...s, { id: newId('p'), foodId, qty: n, receivedAt, ...(expiresAt ? { expiresAt } : {}) }]);
        onDone();
      }}
    >
      <label className="field">
        <span>Produit</span>
        <select value={foodId} onChange={(e) => setFoodId(e.target.value)}>
          {foods.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Quantité ({food?.unit === 'pièce' ? 'pièces' : food?.unit}){food?.pack ? ` · ${food.pack.label}` : ''}</span>
        <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} required />
      </label>
      <label className="field">
        <span>Reçu le</span>
        <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} required />
      </label>
      <label className="field">
        <span>Date limite (si indiquée)</span>
        <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </label>
      <div className="panel-actions">
        <button type="submit" className="primary-button">Ajouter au stock</button>
        <button type="button" className="secondary-button" onClick={onDone}>Annuler</button>
      </div>
      <p className="hint">Un produit absent de la liste : demande à Hermès de l’ajouter, avec ses valeurs nutritionnelles.</p>
    </form>
  );
}
