import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Apple,
  Archive,
  Check,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Flame,
  History,
  Minus,
  Package,
  PackageCheck,
  PackageOpen,
  Plus,
  Refrigerator,
  Repeat,
  Search,
  Share2,
  ShoppingBasket,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useApp } from '../context';
import { Modal } from '../components/Modal';
import { OrderImport } from '../components/OrderImport';
import { diffDays, formatDayMonth, formatShort } from '../domain/dates';
import { newId } from '../domain/plan';
import { shoppingList, shoppingText, type ShoppingLine } from '../domain/shopping';
import { formatQty, freshnessOf, type FoodStock, type Lot } from '../domain/stock';
import type { Adjustment, Food, ISODate, Purchase, Storage } from '../domain/types';
import './stock-v3.css';

type Filter = Storage | 'all' | 'watch';

/** Une ligne ajoutée à la main sur la liste de courses : elle ne vit que le temps des courses. */
interface ExtraLine {
  food: Food;
  qty: number;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'frigo', label: 'Frigo' },
  { id: 'fruitier', label: 'Fruitier' },
  { id: 'placard', label: 'Placard' },
  { id: 'watch', label: 'À surveiller' },
];

const ZONE_ORDER: Storage[] = ['frigo', 'fruitier', 'placard'];
const ZONE_TITLE: Record<Storage, string> = { frigo: 'Le frigo', fruitier: 'Le fruitier', placard: 'Le placard' };
const ZONE_SHORT: Record<Storage, string> = { frigo: 'Frigo', fruitier: 'Fruitier', placard: 'Placard' };
const ZONE_ICON = { frigo: Refrigerator, fruitier: Apple, placard: Archive };

/** La couleur dit la fraîcheur, jamais le décor. */
const FRESH_TONE: Record<FoodStock['freshness'], string> = {
  périmé: 'is-berry',
  urgent: 'is-peach',
  bientôt: 'is-butter',
  ok: 'is-mint',
  épuisé: '',
};

const FRESH_CLASS: Record<FoodStock['freshness'], string> = {
  périmé: 'is-late',
  urgent: 'is-now',
  bientôt: 'is-soon',
  ok: 'is-fine',
  épuisé: 'is-gone',
};

const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Un lot encore là, mais qui n’est plus plein : il a été ouvert. */
const isOpenLot = (l: Lot) => l.qty > 1e-6 && l.initial - l.qty > 1e-6;
const openLots = (s: FoodStock) => s.lots.filter(isOpenLot);

/** Le compte à rebours d’un lot, en jours, sans jargon. */
function lotCountdown(days: number): string {
  if (days < -1) return `périmé depuis ${-days} j`;
  if (days === -1) return 'périmé depuis hier';
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'demain';
  return `dans ${days} j`;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

/** « toutes les 2 semaines », « tous les 3 jours » : la fréquence telle qu’on la dit. */
function frequencyLabel(days: number): string {
  if (days < 2) return 'presque chaque jour';
  const weeks = Math.round(days / 7);
  if (days < 7) return `tous les ${days} jours`;
  if (weeks === 1) return 'toutes les semaines';
  if (weeks <= 8) return `toutes les ${weeks} semaines`;
  const months = Math.max(2, Math.round(days / 30));
  return `tous les ${months} mois`;
}

interface Recurring {
  food: Food;
  /** Nombre d’achats enregistrés. */
  times: number;
  /** Quantité habituelle, celle qu’on remet sur la liste. */
  qty: number;
  /** Écart médian entre deux achats, en jours. */
  everyDays: number;
  last: ISODate;
}

/**
 * Les aliments achetés au moins trois fois, avec l’écart réel entre deux achats.
 * La fréquence se lit dans l’historique des achats, jamais dans une moyenne inventée.
 */
function recurringBuys(purchases: Purchase[], foods: Map<string, Food>, today: ISODate): Recurring[] {
  const byFood = new Map<string, Purchase[]>();
  for (const p of purchases) {
    if (p.receivedAt > today) continue;
    byFood.set(p.foodId, [...(byFood.get(p.foodId) ?? []), p]);
  }
  const out: Recurring[] = [];
  for (const [foodId, ps] of byFood) {
    const food = foods.get(foodId);
    if (!food || ps.length < 3) continue;
    const dates = [...new Set(ps.map((p) => p.receivedAt))].sort();
    if (dates.length < 2) continue;
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i += 1) gaps.push(diffDays(dates[i - 1], dates[i]));
    const everyDays = Math.max(1, Math.round(median(gaps)));
    const usual = median(ps.map((p) => p.qty));
    const qty = food.unit === 'pièce' ? Math.max(1, Math.ceil(usual)) : Math.max(1, Math.round(usual / 10) * 10);
    out.push({ food, times: ps.length, qty, everyDays, last: dates[dates.length - 1] });
  }
  return out.sort((a, b) => b.times - a.times || a.food.name.localeCompare(b.food.name, 'fr'));
}

/** Une quantité courte pour une ligne de carte, sans répéter le nom de l’aliment. */
const compactQty = (food: FoodStock['food'], qty: number) =>
  food.unit === 'pièce' ? `${formatQty(food, qty)} pc` : formatQty(food, qty);

/**
 * Une date courte, avec l’année quand elle n’est pas celle en cours :
 * « 14 nov » se lit sinon comme une date passée alors qu’elle est à venir.
 */
function expiryDay(iso: ISODate, today: ISODate): string {
  const short = formatDayMonth(iso);
  return iso.slice(0, 4) === today.slice(0, 4) ? short : `${short} ${iso.slice(0, 4)}`;
}

/**
 * Chaque niveau de fraîcheur dit sa date, en toutes lettres.
 * Le rouge constate, le pêche presse, le beurre prévient, la menthe rassure.
 */
function freshnessLabel(s: FoodStock, today: ISODate): string {
  if (!s.nextExpiry) return 'Épuisé';
  const day = expiryDay(s.nextExpiry, today);
  switch (s.freshness) {
    case 'périmé':
      return s.lots.length > 1 ? `Un lot périmé depuis le ${day}` : `Périmé depuis le ${day}`;
    case 'urgent':
      if (s.daysLeft === 0) return `À cuisiner aujourd’hui, ${day}`;
      if (s.daysLeft === 1) return `Dernier jour le ${day}`;
      return `À cuisiner avant le ${day}`;
    case 'bientôt':
      return `À cuisiner avant le ${day}`;
    case 'ok':
      return `Bon jusqu’au ${day}`;
    default:
      return 'Épuisé';
  }
}

function zoneSummary(rows: FoodStock[]): string {
  const late = rows.filter((s) => s.freshness === 'périmé').length;
  const soon = rows.filter((s) => s.freshness === 'urgent' || s.freshness === 'bientôt').length;
  const bits = [`${rows.length} ${plural(rows.length, 'aliment')}`];
  if (late) bits.push(`${late} ${plural(late, 'périmé', 'périmés')}`);
  if (soon) bits.push(`${soon} à cuisiner`);
  return bits.join(' · ');
}

/** L’unité de saisie la plus lisible pour la quantité en stock : 1,46 kg plutôt que 1 460 g. */
function editUnit(food: Food, remaining: number): { factor: number; unit: string } {
  if (food.unit === 'pièce') return { factor: 1, unit: 'pc' };
  if (remaining >= 1000) return { factor: 1000, unit: food.unit === 'ml' ? 'L' : 'kg' };
  return { factor: 1, unit: food.unit };
}

function editValue(food: Food, remaining: number): string {
  const { factor } = editUnit(food, remaining);
  return (remaining / factor).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

/** Accepte « 1,5 » comme « 1.5 », refuse le reste. Zéro est une quantité valide : l’aliment quitte l’étagère. */
function parseQty(raw: string): number | null {
  const clean = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/**
 * Le stock se lit comme un meuble : le frigo et le fruitier sont des étagères d’aliments frais,
 * le placard un inventaire au sec. La liste de courses, elle, est une feuille à cocher.
 */
export function StockView() {
  const app = useApp();
  const { data, today, store } = app;
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'stock' | 'courses'>('stock');
  const [adding, setAdding] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [extra, setExtra] = useState<ExtraLine[]>([]);
  const [deleted, setDeleted] = useState<{ purchase: Purchase; label: string } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const undoTimer = useRef<number | undefined>(undefined);
  const correctFood = correcting ? app.stock.get(correcting) : undefined;

  const risk = new Map<string, number>();
  for (const l of app.forecast.losses) risk.set(l.foodId, (risk.get(l.foodId) ?? 0) + l.qty);

  // Les paquets vides ne tiennent plus sur l’étagère : le stock montre ce qu’on a.
  const all = [...app.stock.values()].filter((s) => s.remaining > 1e-6);
  const watchIds = new Set(app.priorities.map((p) => p.food.id));
  const watched = (s: FoodStock) => watchIds.has(s.food.id) || s.freshness === 'périmé';
  const watchCount = all.filter(watched).length;
  const needle = q.trim().toLowerCase();

  const rows = all
    .filter((s) => (filter === 'all' ? true : filter === 'watch' ? watched(s) : s.food.storage === filter))
    .filter((s) => !needle || s.food.name.toLowerCase().includes(needle))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.food.name.localeCompare(b.food.name, 'fr'));

  const presses = all
    .filter((s) => s.remaining > 1e-6 && (s.freshness === 'périmé' || s.freshness === 'urgent'))
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  const visibleZones: Storage[] = filter === 'watch' ? [] : filter === 'all' ? ZONE_ORDER : [filter];
  const countFor = (id: Filter) => (id === 'all' ? all.length : id === 'watch' ? watchCount : all.filter((s) => s.food.storage === id).length);

  const shopTotal = (() => {
    const list = shoppingList(data, app.stock, app.forecast, app.foods);
    return list.missing.length + list.low.length + list.basics.length + extra.length;
  })();

  const adjust = (foodId: string, qty: number, reason: Adjustment['reason']) =>
    store.update('journal', (j) => ({ ...j, adjustments: [...j.adjustments, { id: newId('a'), date: today, foodId, qty, reason }] }));

  const announce = (text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 6000);
  };

  const closeEditor = (foodId: string) => {
    setEditing(null);
    // Un délai d’un tour de boucle laisse React remettre le bouton en place avant de lui rendre le focus.
    window.setTimeout(() => document.getElementById(`qty-${foodId}`)?.focus(), 0);
  };

  /** Corrige en place : on note l’écart, le stock reste recalculé depuis les achats et le journal. */
  const setQty = (s: FoodStock, target: number) => {
    const delta = round3(s.remaining - target);
    closeEditor(s.food.id);
    if (Math.abs(delta) < 0.001) return;
    adjust(s.food.id, delta, 'correction');
    announce(`${s.food.name} : ${formatQty(s.food, target)} en stock.`);
  };

  const resetSearch = () => {
    setQ('');
    setFilter('all');
  };

  /** Ajoute un aliment à la liste de courses du moment, sans toucher au stock. */
  const addExtra = (food: Food, qty: number) => {
    setExtra((xs) =>
      xs.some((x) => x.food.id === food.id) ? xs.map((x) => (x.food.id === food.id ? { ...x, qty: round3(x.qty + qty) } : x)) : [...xs, { food, qty }],
    );
    announce(`${food.name} ajouté à la liste.`);
  };

  const dropExtra = (food: Food) => {
    setExtra((xs) => xs.filter((x) => x.food.id !== food.id));
    announce(`${food.name} retiré de la liste.`);
  };

  /** L’achat réel d’une ligne ajoutée passe par le store : le stock et le plan se recalculent. */
  const buyExtra = (line: ExtraLine) => {
    store.update('stock', (s) => [...s, { id: newId('p'), foodId: line.food.id, qty: line.qty, receivedAt: today, origin: 'commande' }]);
    setExtra((xs) => xs.filter((x) => x.food.id !== line.food.id));
    announce(`Achat enregistré : ${line.food.name} · ${formatQty(line.food, line.qty)}.`);
  };

  /** Supprime un achat saisi par erreur ; l’annulation le remet tel quel. */
  const removePurchase = (p: Purchase) => {
    const food = app.foods.get(p.foodId);
    const label = `${food?.name ?? 'Achat'} · ${food ? formatQty(food, p.qty) : String(p.qty)} · ${formatDayMonth(p.receivedAt)}`;
    store.update('stock', (s) => s.filter((x) => x.id !== p.id));
    setDeleted({ purchase: p, label });
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setDeleted(null), 12000);
  };

  const restorePurchase = () => {
    if (!deleted) return;
    const p = deleted.purchase;
    store.update('stock', (s) => (s.some((x) => x.id === p.id) ? s : [...s, p]));
    window.clearTimeout(undoTimer.current);
    setDeleted(null);
    announce(`Achat remis : ${deleted.label}.`);
  };

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const emptyState = () => {
    if (all.length === 0) {
      return (
        <EmptyState
          icon={<Refrigerator size={24} />}
          title="Le frigo est vide"
          text="Aucun achat n’est enregistré : le frigo, le fruitier et le placard sont vides. Colle une liste d’achats, ou ajoute un achat pour commencer."
        >
          <button type="button" className="s-btn is-primary" onClick={() => setOrdering(true)}>
            Coller une liste d’achats
          </button>
          <button type="button" className="s-btn" onClick={() => setAdding(true)}>
            Ajouter un achat
          </button>
        </EmptyState>
      );
    }
    if (needle) {
      const filtered = filter !== 'all';
      const stockWord = all.length === 1 ? 'l’aliment en stock' : `les ${all.length} aliments en stock`;
      return (
        <EmptyState
          icon={<Search size={24} />}
          title={`Aucun aliment ne correspond à « ${q.trim()} »`}
          text={
            filtered
              ? `Vérifie l’orthographe, ou efface la recherche et le filtre pour revoir ${stockWord}.`
              : `Vérifie l’orthographe, ou efface la recherche pour revoir ${stockWord}.`
          }
        >
          {filtered ? (
            <>
              <button type="button" className="s-btn is-primary" onClick={resetSearch}>
                Tout le stock
              </button>
              <button type="button" className="s-btn" onClick={() => setQ('')}>
                Effacer la recherche
              </button>
            </>
          ) : (
            <button type="button" className="s-btn is-primary" onClick={() => setQ('')}>
              Effacer la recherche
            </button>
          )}
        </EmptyState>
      );
    }
    if (filter === 'watch') {
      return (
        <EmptyState
          icon={<PackageOpen size={24} />}
          title="Rien à surveiller"
          text="Aucun aliment ne presse : tout ce qui est en stock a le temps d’être cuisiné ou planifié."
        >
          <button type="button" className="s-btn is-primary" onClick={() => setFilter('all')}>
            Voir toutes les étagères
          </button>
        </EmptyState>
      );
    }
    const zone = filter === 'all' ? undefined : filter;
    return (
      <EmptyState
        icon={<PackageOpen size={24} />}
        title={zone ? `Le ${ZONE_SHORT[zone].toLowerCase()} est vide` : 'Rien dans ce rayon'}
        text="Aucun achat de ce rayon n’est en stock. Ajoute un achat pour le remplir, ou regarde les autres étagères."
      >
        <button type="button" className="s-btn is-primary" onClick={() => setAdding(true)}>
          Ajouter un achat
        </button>
        <button type="button" className="s-btn" onClick={() => setFilter('all')}>
          Tout le stock
        </button>
      </EmptyState>
    );
  };

  return (
    <div className="s-page stock-page">
      <header className="s-pagehead">
        <div>
          <h1 className="s-title">Mon frigo</h1>
          <p className="s-subtitle">
            {all.length === 0
              ? 'Aucun aliment en stock'
              : `${all.length} ${plural(all.length, 'aliment')} en stock · ${watchCount ? `${watchCount} à surveiller` : 'rien ne presse'}`}
          </p>
        </div>
        <div className="s-pagehead-actions">
          <button type="button" className="s-btn" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden /> Ajouter un achat
          </button>
          <button type="button" className="s-btn is-primary" onClick={() => setOrdering(true)}>
            <ClipboardPaste size={16} aria-hidden /> Coller une liste d’achats
          </button>
        </div>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>

      {presses.length > 0 && (
        <button
          type="button"
          className="stock-press"
          onClick={() => {
            setMode('stock');
            setQ('');
            setFilter('watch');
          }}
        >
          <span className="stock-press-icon" aria-hidden>
            <Flame size={19} />
          </span>
          <span className="stock-press-text">
            <b>
              {presses.length} {plural(presses.length, 'aliment')} à sauver
            </b>
            <span className="stock-press-names">
              {' · '}
              {presses
                .slice(0, 2)
                .map((s) => s.food.name)
                .join(', ')}
              {presses.length > 2 ? `, et ${presses.length - 2} ${plural(presses.length - 2, 'autre')}` : ''}
            </span>
          </span>
          <span className="stock-press-go">
            Voir <ChevronRight size={14} aria-hidden />
          </span>
        </button>
      )}

      <div className="stock-switch" role="tablist" aria-label="Vue">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'stock'}
          className={`stock-door ${mode === 'stock' ? 'is-on' : ''}`}
          onClick={() => setMode('stock')}
        >
          <Package size={18} aria-hidden />
          Les étagères
          <span className="stock-door-count num">{all.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'courses'}
          className={`stock-door ${mode === 'courses' ? 'is-on' : ''}`}
          onClick={() => setMode('courses')}
        >
          <ShoppingBasket size={18} aria-hidden />
          La liste de courses
          <span className="stock-door-count num">{shopTotal}</span>
        </button>
      </div>

      {mode === 'courses' ? (
        <CoursesBoard
          onSeeShelves={() => setMode('stock')}
          extra={extra}
          onAdd={addExtra}
          onDrop={dropExtra}
          onBuy={buyExtra}
        />
      ) : (
        <>
          <div className="stock-tools">
            <label className="stock-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Chercher un aliment"
                aria-label="Chercher un aliment"
              />
            </label>
            <div className="stock-filters" role="tablist" aria-label="Filtrer le stock">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  className={`stock-filter ${filter === f.id ? 'is-on' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  <span className="stock-filter-count num">{countFor(f.id)}</span>
                </button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            emptyState()
          ) : filter === 'watch' ? (
            <WatchBoard
              rows={rows}
              risk={risk}
              editing={editing}
              onEdit={setEditing}
              onSetQty={setQty}
              onCancelEdit={closeEditor}
              onCorrect={setCorrecting}
            />
          ) : (
            <div className="stock-zones">
              {visibleZones.map((zone) => {
                const zoneRows = rows.filter((s) => s.food.storage === zone);
                if (zoneRows.length === 0) return null;
                return (
                  <StockZone
                    key={zone}
                    zone={zone}
                    rows={zoneRows}
                    risk={risk}
                    editing={editing}
                    onEdit={setEditing}
                    onSetQty={setQty}
                    onCancelEdit={closeEditor}
                    onCorrect={setCorrecting}
                  />
                );
              })}
            </div>
          )}

          {data.stock.length > 0 && <PurchasesLog onRemove={removePurchase} />}

          <p className="stock-note">
            La fraîcheur se compte depuis la réception, ou depuis la date limite saisie. Un lot entamé garde sa propre date.
            Un repas ne sort du stock qu’une fois coché.
          </p>
        </>
      )}

      <Modal open={ordering} onClose={() => setOrdering(false)} title="Coller une liste d’achats" size="lg">
        {ordering && (
          <div className="stock-form stock-order">
            <OrderImport onDone={() => setOrdering(false)} />
          </div>
        )}
      </Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title="Ajouter un achat" size="sm">
        {adding && <PurchaseForm onDone={() => setAdding(false)} />}
      </Modal>
      <Modal
        open={!!correctFood}
        onClose={() => setCorrecting(null)}
        title={correctFood ? `Retirer du stock · ${correctFood.food.name}` : 'Retirer du stock'}
        size="sm"
      >
        {correctFood && (
          <CorrectForm
            s={correctFood}
            onDone={(qty, reason) => {
              adjust(correctFood.food.id, qty, reason);
              setCorrecting(null);
            }}
            onCancel={() => setCorrecting(null)}
          />
        )}
      </Modal>

      {deleted && (
        <div className="stock-toast" role="status">
          <span className="stock-toast-text">
            <Trash2 size={15} aria-hidden />
            <span>
              Achat supprimé · <b>{deleted.label}</b>
            </span>
          </span>
          <button type="button" className="stock-toast-undo" onClick={restorePurchase}>
            <Undo2 size={14} aria-hidden /> Annuler
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="stock-empty">
      <span className="stock-empty-icon" aria-hidden>
        {icon}
      </span>
      <p className="stock-empty-title">{title}</p>
      <p className="stock-empty-text">{text}</p>
      {children && <div className="stock-empty-actions">{children}</div>}
    </div>
  );
}

function StockZone({
  zone,
  rows,
  risk,
  editing,
  onEdit,
  onSetQty,
  onCancelEdit,
  onCorrect,
}: {
  zone: Storage;
  rows: FoodStock[];
  risk: Map<string, number>;
  editing: string | null;
  onEdit: (id: string) => void;
  onSetQty: (s: FoodStock, qty: number) => void;
  onCancelEdit: (id: string) => void;
  onCorrect: (id: string) => void;
}) {
  const Icon = ZONE_ICON[zone];
  return (
    <section className={`stock-zone is-${zone}`} aria-label={ZONE_TITLE[zone]}>
      <header className="stock-zone-head">
        <span className="stock-zone-icon" aria-hidden>
          <Icon size={22} strokeWidth={2} />
        </span>
        <div className="stock-zone-title">
          <h2>{ZONE_TITLE[zone]}</h2>
          <p>{zoneSummary(rows)}</p>
        </div>
      </header>
      {zone === 'placard' ? (
        <div className="pantry-grid">
          {rows.map((s) => (
            <PantryRow
              key={s.food.id}
              s={s}
              editing={editing === s.food.id}
              onEdit={() => onEdit(s.food.id)}
              onSetQty={(qty) => onSetQty(s, qty)}
              onCancelEdit={() => onCancelEdit(s.food.id)}
              onCorrect={() => onCorrect(s.food.id)}
            />
          ))}
        </div>
      ) : (
        <div className="stock-shelves">
          {freshShelves(zone, rows).map((group) => (
            <Shelf
              key={group.key}
              title={group.title}
              rows={group.rows}
              risk={risk}
              editing={editing}
              onEdit={onEdit}
              onSetQty={onSetQty}
              onCancelEdit={onCancelEdit}
              onCorrect={onCorrect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Au frigo, deux étagères lisibles ; au fruitier, une seule. */
function freshShelves(zone: Storage, rows: FoodStock[]) {
  if (zone === 'frigo') {
    const veg = rows.filter((s) => s.food.category === 'légumes');
    const rest = rows.filter((s) => s.food.category !== 'légumes');
    return [
      { key: 'legumes', title: 'Légumes frais', rows: veg },
      { key: 'cremerie', title: 'Crémerie & œufs', rows: rest },
    ].filter((g) => g.rows.length > 0);
  }
  return [{ key: 'fruits', title: 'Fruits & tomates', rows }];
}

function Shelf({
  title,
  rows,
  risk,
  editing,
  onEdit,
  onSetQty,
  onCancelEdit,
  onCorrect,
  showZone = false,
}: {
  title?: string;
  rows: FoodStock[];
  risk: Map<string, number>;
  editing: string | null;
  onEdit: (id: string) => void;
  onSetQty: (s: FoodStock, qty: number) => void;
  onCancelEdit: (id: string) => void;
  onCorrect: (id: string) => void;
  showZone?: boolean;
}) {
  return (
    <section className="shelf" aria-label={title ?? 'Aliments à surveiller'}>
      {title && (
        <header className="shelf-head">
          <h3>{title}</h3>
          <span className="shelf-meta">
            {rows.length} {plural(rows.length, 'aliment')}
          </span>
        </header>
      )}
      <div className="shelf-rail">
        {rows.map((s) => (
          <ShelfCard
            key={s.food.id}
            s={s}
            risk={risk.get(s.food.id) ?? 0}
            showZone={showZone}
            editing={editing === s.food.id}
            onEdit={() => onEdit(s.food.id)}
            onSetQty={(qty) => onSetQty(s, qty)}
            onCancelEdit={() => onCancelEdit(s.food.id)}
            onCorrect={() => onCorrect(s.food.id)}
          />
        ))}
      </div>
      <div className="shelf-plank" aria-hidden />
    </section>
  );
}

function ShelfCard({
  s,
  risk,
  showZone,
  editing,
  onEdit,
  onSetQty,
  onCancelEdit,
  onCorrect,
}: {
  s: FoodStock;
  risk: number;
  showZone: boolean;
  editing: boolean;
  onEdit: () => void;
  onSetQty: (qty: number) => void;
  onCancelEdit: () => void;
  onCorrect: () => void;
}) {
  const app = useApp();
  const { today } = app;
  const opened = openLots(s);
  const next = app.forecast.nextUse.get(s.food.id);
  const pct = s.initial > 0 ? Math.min(100, (s.remaining / s.initial) * 100) : 0;
  const nextLabel = next ? `Prévu ${next === today ? 'aujourd’hui' : `le ${formatShort(next)}`}` : s.food.dailyFruit ? 'Fruit nature' : null;
  const bought = s.initial > 1 ? 'achetés' : 'acheté';
  const qtyLabel = `${formatQty(s.food, s.remaining)} sur ${formatQty(s.food, s.initial)} ${bought}`;

  return (
    <article className={`shelf-card ${FRESH_CLASS[s.freshness]}`} title={s.food.pack?.label}>
      <div className="shelf-card-top">
        <h4 className="shelf-name">{s.food.name}</h4>
        <button type="button" className="shelf-fix" onClick={onCorrect} aria-label={`Retirer du stock : ${s.food.name}`} title="Retirer du stock">
          <Minus size={13} aria-hidden />
        </button>
      </div>
      {editing ? (
        <QtyEditor s={s} onCommit={onSetQty} onCancel={onCancelEdit} />
      ) : (
        <button
          type="button"
          className="shelf-amount"
          id={`qty-${s.food.id}`}
          onClick={onEdit}
          title="Corriger la quantité"
          aria-label={`Corriger la quantité de ${s.food.name} : ${qtyLabel}`}
        >
          <span className="shelf-amount-label">Reste</span>{' '}
          <b className="num">{formatQty(s.food, s.remaining)}</b>{' '}
          <span className="shelf-of">sur {formatQty(s.food, s.initial)} {bought}</span>
        </button>
      )}
      <div
        className={`s-jauge shelf-jauge ${FRESH_TONE[s.freshness]}`}
        role="progressbar"
        aria-label={`Part restante de ${s.food.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={`Reste ${qtyLabel}`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className={`s-chip ${FRESH_TONE[s.freshness]} shelf-chip`}>{freshnessLabel(s, today)}</span>
      {opened.length > 0 && <LotList food={s.food} lots={opened} today={today} />}
      {(showZone || s.lots.length > 1) && (
        <p className="shelf-when">
          {showZone && <span className="shelf-zone-word">{ZONE_SHORT[s.food.storage]}</span>}
          {s.lots.length > 1
            ? `${s.lots.length} lots en stock${opened.length ? `, ${opened.length} entamé${opened.length > 1 ? 's' : ''}` : ''}`
            : null}
        </p>
      )}
      <div className="shelf-boot">
        {nextLabel && <span className="shelf-next">{nextLabel}</span>}
        {risk > 0.01 && s.freshness !== 'périmé' && (showZone || s.freshness === 'urgent' || s.freshness === 'bientôt') && (
          <span className="shelf-risk" title="Aucun repas du plan n’utilise cette quantité avant sa date limite : elle restera en stock.">
            {compactQty(s.food, risk)} de trop, aucun repas prévu
          </span>
        )}
        {s.overdrawn > 0.01 && (
          <span
            className="shelf-risk"
            title="Plus a été consommé que ce qui a été acheté. Corrige la quantité, ou ajoute l’achat manquant."
          >
            {compactQty(s.food, s.overdrawn)} de plus que les achats saisis
          </span>
        )}
      </div>
    </article>
  );
}

/** Un lot ouvert dit sa quantité restante, sa date et son compte à rebours, à part du stock total. */
function LotList({ food, lots, today, compact = false }: { food: Food; lots: Lot[]; today: ISODate; compact?: boolean }) {
  return (
    <ul className={`lot-list ${compact ? 'is-compact' : ''}`} aria-label={`Lots entamés de ${food.name}`}>
      {lots.map((l) => {
        const days = diffDays(today, l.expiry);
        const fresh = freshnessOf(food, days, l.qty);
        return (
          <li
            key={l.purchaseId}
            className={`lot-line ${FRESH_CLASS[fresh]}`}
            title={`Lot entamé : ${formatQty(food, l.qty)} restants, date limite le ${expiryDay(l.expiry, today)}`}
          >
            <span className="lot-tag">Entamé</span>
            <span className="lot-qty num">{compactQty(food, l.qty)}</span>
            <span className="lot-due">
              <span className="lot-date">limite {expiryDay(l.expiry, today)}</span>
              <span className="lot-left">{lotCountdown(days)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Un petit champ qui remplace la quantité : Entrée ou sortie du champ valide, Échap annule. */
function QtyEditor({
  s,
  onCommit,
  onCancel,
  compact = false,
}: {
  s: FoodStock;
  onCommit: (qty: number) => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const { factor, unit } = editUnit(s.food, s.remaining);
  const [value, setValue] = useState(() => editValue(s.food, s.remaining));
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const example = factor > 1 ? '1,5' : unit === 'pc' ? '2' : '250';
  const invalid = `Il faut un nombre en ${unit}, par exemple ${example}. Échap annule.`;

  // Le champ s’ouvre avec sa valeur sélectionnée : taper remplace, plutôt que d’allonger le nombre.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const commit = () => {
    if (settled.current) return;
    const n = parseQty(value);
    if (n === null) {
      setError(invalid);
      return;
    }
    settled.current = true;
    onCommit(round3(n * factor));
  };

  const leave = () => {
    if (settled.current) return;
    const n = parseQty(value);
    settled.current = true;
    if (n === null) onCancel();
    else onCommit(round3(n * factor));
  };

  return (
    <span className={`qty-edit ${compact ? 'is-compact' : ''}`}>
      <input
        ref={field}
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (settled.current) return;
            settled.current = true;
            onCancel();
          }
        }}
        onBlur={leave}
        aria-label={`Nouvelle quantité de ${s.food.name}, en ${unit}`}
        aria-invalid={!!error}
      />
      <span className="qty-edit-unit">{unit}</span>
      {error && (
        <span className="qty-edit-error" role="alert">
          {invalid}
        </span>
      )}
    </span>
  );
}

function WatchBoard({
  rows,
  risk,
  editing,
  onEdit,
  onSetQty,
  onCancelEdit,
  onCorrect,
}: {
  rows: FoodStock[];
  risk: Map<string, number>;
  editing: string | null;
  onEdit: (id: string) => void;
  onSetQty: (s: FoodStock, qty: number) => void;
  onCancelEdit: (id: string) => void;
  onCorrect: (id: string) => void;
}) {
  return (
    <section className="stock-watch" aria-label="À surveiller">
      <header className="stock-zone-head">
        <span className="stock-zone-icon is-watch" aria-hidden>
          <Flame size={22} strokeWidth={2} />
        </span>
        <div className="stock-zone-title">
          <h2>À surveiller</h2>
          <p>Les plus pressés d’abord, toutes étagères confondues</p>
        </div>
      </header>
      <Shelf
        rows={rows}
        risk={risk}
        editing={editing}
        onEdit={onEdit}
        onSetQty={onSetQty}
        onCancelEdit={onCancelEdit}
        onCorrect={onCorrect}
        showZone
      />
    </section>
  );
}

function PantryRow({
  s,
  editing,
  onEdit,
  onSetQty,
  onCancelEdit,
  onCorrect,
}: {
  s: FoodStock;
  editing: boolean;
  onEdit: () => void;
  onSetQty: (qty: number) => void;
  onCancelEdit: () => void;
  onCorrect: () => void;
}) {
  const { today } = useApp();
  const opened = openLots(s);
  return (
    <div className={`pantry-item ${FRESH_CLASS[s.freshness]}`}>
      <div className="pantry-row">
        <span className="pantry-name" title={s.food.name}>
          {s.food.name}
        </span>
        {editing ? (
          <QtyEditor s={s} onCommit={onSetQty} onCancel={onCancelEdit} compact />
        ) : (
          <button
            type="button"
            className="pantry-qty num"
            id={`qty-${s.food.id}`}
            onClick={onEdit}
            title="Corriger la quantité"
            aria-label={`Corriger la quantité de ${s.food.name} : ${formatQty(s.food, s.remaining)} en stock`}
          >
            {formatQty(s.food, s.remaining)}
          </button>
        )}
        <span className="pantry-state">
          <span className={`s-chip ${FRESH_TONE[s.freshness]} pantry-chip`}>{freshnessLabel(s, today)}</span>
        </span>
        <button type="button" className="pantry-fix" onClick={onCorrect} aria-label={`Retirer du stock : ${s.food.name}`} title="Retirer du stock">
          <Minus size={12} aria-hidden />
        </button>
      </div>
      {opened.length > 0 && <LotList food={s.food} lots={opened} today={today} compact />}
    </div>
  );
}

type ShopSection = { reason: ShoppingLine['reason']; title: string; tone: string; empty: string };

const SHOP_SECTIONS: ShopSection[] = [
  { reason: 'manque', title: 'Il manque pour le plan', tone: 'is-peach', empty: 'Tout ce que les repas à venir demandent est en stock.' },
  { reason: 'bientôt fini', title: 'À racheter bientôt', tone: 'is-butter', empty: 'Rien ne s’épuise avant le prochain repas prévu.' },
  { reason: 'base', title: 'Le fond du placard', tone: 'is-lilac', empty: 'Le placard a ce qu’il faut pour tenir.' },
];

/** La liste de courses : une feuille qu’on coche, qu’on copie, qu’on partage. */
function CoursesBoard({
  onSeeShelves,
  extra,
  onAdd,
  onDrop,
  onBuy,
}: {
  onSeeShelves: () => void;
  extra: ExtraLine[];
  onAdd: (food: Food, qty: number) => void;
  onDrop: (food: Food) => void;
  onBuy: (line: ExtraLine) => void;
}) {
  const app = useApp();
  const { data, store, today } = app;
  const list = shoppingList(data, app.stock, app.forecast, app.foods);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopy, setShareCopy] = useState<'idle' | 'done' | 'error'>('idle');
  const [fruits, setFruits] = useState(data.settings.fruitsPerDay);
  const recurring = recurringBuys(data.stock, app.foods, today);
  const total = list.missing.length + list.low.length + list.basics.length;
  const shopCount = total + extra.length;
  const extraIds = new Set(extra.map((x) => x.food.id));
  const listedIds = new Set([...list.missing, ...list.low, ...list.basics].map((l) => l.food.id));
  const presentKeys = new Set([
    ...list.missing.map((l) => `manque-${l.food.id}`),
    ...list.low.map((l) => `bientôt fini-${l.food.id}`),
    ...list.basics.map((l) => `base-${l.food.id}`),
    ...extra.map((x) => `extra-${x.food.id}`),
  ]);
  const doneCount = [...done].filter((k) => presentKeys.has(k)).length;
  const pct = shopCount > 0 ? (doneCount / shopCount) * 100 : 0;
  const allDone = shopCount > 0 && doneCount === shopCount;
  const plannedAhead = data.plan.entries.filter((e) => e.kind === 'cook' && !e.done && e.date >= today).length;
  /** Une ligne de liste dit toujours l’aliment, sa quantité et son rayon. */
  const qtyLine = (food: Food, qty: number) => `${food.name} · ${formatQty(food, qty)} · ${ZONE_SHORT[food.storage]}`;
  const extraText = extra.length
    ? ['Ajouté à la liste', ...extra.map((x) => `- ${qtyLine(x.food, x.qty)}`)].join('\n')
    : '';
  const text = [shoppingText(list, qtyLine), extraText].filter(Boolean).join('\n\n');
  const fullText = `Courses Sitos, ${formatShort(today)}\n${text}`;
  const nativeShare = (navigator as unknown as { share?: (d: { title: string; text: string }) => Promise<void> }).share;

  const copy = async (where: 'main' | 'share' = 'main') => {
    try {
      await navigator.clipboard.writeText(fullText);
      if (where === 'share') {
        setShareCopy('done');
        window.setTimeout(() => setShareCopy('idle'), 4000);
      } else {
        setCopyState('done');
        window.setTimeout(() => setCopyState('idle'), 4000);
      }
    } catch {
      if (where === 'share') setShareCopy('error');
      else setCopyState('error');
    }
  };

  const shareOut = async () => {
    try {
      await nativeShare?.call(navigator, { title: 'Liste de courses', text: fullText });
    } catch {
      // partage annulé : rien à dire
    }
  };

  const toggle = (key: string) =>
    setDone((d) => {
      const next = new Set(d);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setFruitsTo = (n: number) => {
    setFruits(n);
    store.update('settings', (x) => ({ ...x, fruitsPerDay: n }));
  };

  const lines = (section: ShopSection) => (section.reason === 'manque' ? list.missing : section.reason === 'bientôt fini' ? list.low : list.basics);

  return (
    <>
      <section className="shop-board" aria-label="Liste de courses">
        <header className="shop-board-head">
          <div>
            <h2 className="shop-board-title">La liste de courses</h2>
            <p className="shop-board-sub">
              {shopCount === 0 ? 'Rien à acheter' : `${shopCount} ${plural(shopCount, 'achat')} à faire`}
            </p>
          </div>
          <div className="shop-tools">
            <div className="fruit-stepper" role="group" aria-label="Fruits mangés nature par jour" title="Compte les fruits nature dans la projection du stock">
              <button type="button" aria-label="Un fruit de moins" disabled={fruits <= 0} onClick={() => setFruitsTo(Math.max(0, fruits - 1))}>
                <Minus size={13} aria-hidden />
              </button>
              <span className="num">{fruits}</span>
              <button type="button" aria-label="Un fruit de plus" disabled={fruits >= 4} onClick={() => setFruitsTo(Math.min(4, fruits + 1))}>
                <Plus size={13} aria-hidden />
              </button>
            </div>
            <span className="shop-fruit-label">fruit{fruits > 1 ? 's' : ''} nature par jour</span>
            <button type="button" className="s-btn is-sm" onClick={() => void copy()} disabled={shopCount === 0}>
              <Copy size={14} aria-hidden /> Copier la liste
            </button>
            <button type="button" className="s-btn is-sm" onClick={() => setShareOpen(true)} disabled={shopCount === 0}>
              <Share2 size={14} aria-hidden /> Partager
            </button>
          </div>
        </header>

        {copyState === 'done' && (
          <p className="shop-copied" role="status">
            <Check size={13} aria-hidden /> Liste copiée
          </p>
        )}

        {copyState === 'error' && (
          <p className="shop-copy-error" role="alert">
            La copie a échoué : le navigateur a refusé le presse-papiers. Ouvre « Partager » pour lire et copier le texte à la main.
          </p>
        )}

        {shopCount === 0 ? (
          <EmptyState
            icon={<PackageOpen size={24} />}
            title="Rien à acheter"
            text={
              plannedAhead > 0
                ? 'Le plan tient avec le stock actuel : aucun repas prévu ne manque d’ingrédient.'
                : 'Aucun repas n’est prévu. La liste se remplit dès que la semaine se planifie.'
            }
          >
            {plannedAhead > 0 ? (
              <button type="button" className="s-btn is-primary" onClick={onSeeShelves}>
                Voir les étagères
              </button>
            ) : (
              <button type="button" className="s-btn is-primary" onClick={() => app.goTo('week')}>
                Ouvrir la semaine
              </button>
            )}
          </EmptyState>
        ) : (
          <>
            <div className="shop-progress-row">
              <div
                className="s-jauge shop-progress"
                role="progressbar"
                aria-label="Avancement des courses"
                aria-valuemin={0}
                aria-valuemax={shopCount}
                aria-valuenow={doneCount}
                aria-valuetext={`${doneCount} sur ${shopCount} ${plural(shopCount, 'coché', 'cochés')}`}
              >
                <span className={allDone ? 'is-full' : ''} style={{ width: `${pct}%` }} />
              </div>
              <span className="shop-progress-label num">
                {doneCount} sur {shopCount} {plural(shopCount, 'coché', 'cochés')}
              </span>
            </div>

            {extra.length > 0 && (
              <section className="shop-extra" aria-label="Ajouté à la liste">
                <header className="shop-sec-head">
                  <span className="shop-sec-dot" aria-hidden />
                  <h3>Ajouté à la liste</h3>
                  <span className="shop-sec-count num">{extra.length}</span>
                </header>
                <ul className="shop-list">
                  {extra.map((x) => {
                    const key = `extra-${x.food.id}`;
                    const isDone = done.has(key);
                    return (
                      <li key={key} className={`shop-line shop-extra-line ${isDone ? 'is-done' : ''}`}>
                        <button
                          type="button"
                          className={`shop-tick ${isDone ? 'is-on' : ''}`}
                          aria-pressed={isDone}
                          aria-label={`${isDone ? 'Décocher' : 'Cocher'} ${x.food.name}`}
                          onClick={() => toggle(key)}
                        >
                          {isDone && <Check size={14} strokeWidth={3} aria-hidden />}
                        </button>
                        <span className="shop-name">{x.food.name}</span>
                        <span className="shop-leader" aria-hidden />
                        <span className="shop-qty num">{formatQty(x.food, x.qty)}</span>
                        <button
                          type="button"
                          className="shop-buy"
                          onClick={() => onBuy(x)}
                          title="Enregistrer cet achat dans le stock"
                        >
                          <PackageCheck size={13} aria-hidden /> Acheté
                        </button>
                        <button
                          type="button"
                          className="shop-drop"
                          onClick={() => onDrop(x.food)}
                          aria-label={`Retirer ${x.food.name} de la liste`}
                          title="Retirer de la liste"
                        >
                          <X size={13} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <div className="shop-sections">
              {SHOP_SECTIONS.map((section) => {
                const sectionLines = lines(section);
                return (
                  <section key={section.reason} className={`shop-section ${section.tone}`}>
                    <header className="shop-sec-head">
                      <span className="shop-sec-dot" aria-hidden />
                      <h3>{section.title}</h3>
                      <span className="shop-sec-count num">{sectionLines.length}</span>
                    </header>
                    {sectionLines.length === 0 ? (
                      <p className="shop-sec-empty">{section.empty}</p>
                    ) : (
                      <ul className="shop-list">
                        {sectionLines.map((l) => {
                          const key = `${section.reason}-${l.food.id}`;
                          const isDone = done.has(key);
                          return (
                            <li key={key} className={`shop-line ${isDone ? 'is-done' : ''}`}>
                              <button
                                type="button"
                                className={`shop-tick ${isDone ? 'is-on' : ''}`}
                                aria-pressed={isDone}
                                aria-label={`${isDone ? 'Décocher' : 'Cocher'} ${l.food.name}`}
                                onClick={() => toggle(key)}
                              >
                                {isDone && <Check size={14} strokeWidth={3} aria-hidden />}
                              </button>
                              <span className="shop-name">{l.food.name}</span>
                              <span className="shop-leader" aria-hidden />
                              <span className="shop-qty num">{formatQty(l.food, l.qty)}</span>
                              {l.date && (
                                <span className="shop-date">
                                  {section.reason === 'manque' ? `dès le ${formatShort(l.date)}` : `pour le ${formatShort(l.date)}`}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
            {allDone && <p className="shop-ready">Tout est coché : la liste est prête.</p>}
          </>
        )}
      </section>

      <section className="recurring-board" aria-label="Achats récurrents">
        <header className="recurring-head">
          <span className="recurring-icon" aria-hidden>
            <Repeat size={20} />
          </span>
          <div>
            <h3>Achats récurrents</h3>
            <p>Ce que tu rachètes souvent, avec la fréquence lue dans ton historique.</p>
          </div>
        </header>
        {recurring.length === 0 ? (
          <p className="recurring-empty">
            Rien à proposer pour l’instant. Un aliment acheté trois fois voit sa fréquence apparaître ici.
          </p>
        ) : (
          <ul className="recurring-list">
            {recurring.map((r) => {
              const added = extraIds.has(r.food.id);
              const onList = added || listedIds.has(r.food.id);
              return (
                <li key={r.food.id} className="recurring-item">
                  <div className="recurring-what">
                    <b>{r.food.name}</b>
                    <span className="recurring-freq" title={`Écart médian entre deux achats : ${r.everyDays} ${plural(r.everyDays, 'jour')}`}>
                      {frequencyLabel(r.everyDays)}
                    </span>
                  </div>
                  <span className="recurring-hist">
                    {formatQty(r.food, r.qty)} · {r.times} achats, dernier le {formatDayMonth(r.last)}
                  </span>
                  <button type="button" className="s-btn is-sm" disabled={onList} onClick={() => onAdd(r.food, r.qty)}>
                    {added ? (
                      <>
                        <Check size={13} aria-hidden /> Ajouté
                      </>
                    ) : onList ? (
                      'Déjà dans la liste'
                    ) : (
                      <>
                        <Plus size={13} aria-hidden /> Ajouter
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Partager la liste" size="md">
        <div className="shop-share">
          <p className="shop-share-hint">La liste en clair, avec les aliments, les quantités et le rayon. Elle se colle dans une note ou un message.</p>
          <textarea
            readOnly
            value={fullText}
            rows={12}
            aria-label="Liste de courses en texte"
            onFocus={(e) => e.currentTarget.select()}
          />
          {shareCopy === 'error' && (
            <p className="shop-copy-error" role="alert">
              La copie a échoué : sélectionne le texte à la main.
            </p>
          )}
          <div className="modal-foot">
            <button type="button" className="s-btn is-ghost" onClick={() => setShareOpen(false)}>
              Fermer
            </button>
            {nativeShare && (
              <button type="button" className="s-btn" onClick={() => void shareOut()}>
                <Share2 size={14} aria-hidden /> Partager…
              </button>
            )}
            <button type="button" className="s-btn is-primary" onClick={() => void copy('share')}>
              {shareCopy === 'done' ? (
                <>
                  <Check size={14} aria-hidden /> Texte copié
                </>
              ) : (
                <>
                  <Copy size={14} aria-hidden /> Copier le texte
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Les achats saisis, pour supprimer une erreur sans passer par le stock. */
function PurchasesLog({ onRemove }: { onRemove: (p: Purchase) => void }) {
  const { data } = useApp();
  const [all, setAll] = useState(false);
  const rows = [...data.stock].sort((a, b) =>
    a.receivedAt === b.receivedAt ? (a.id < b.id ? 1 : -1) : a.receivedAt < b.receivedAt ? 1 : -1,
  );
  const shown = all ? rows : rows.slice(0, 5);
  const foodOf = (p: Purchase) => data.foods.find((f) => f.id === p.foodId);

  return (
    <section className="purchases" aria-label="Les achats saisis">
      <header className="purchases-head">
        <span className="purchases-icon" aria-hidden>
          <History size={19} />
        </span>
        <div>
          <h2>Les achats saisis</h2>
          <p>
            {rows.length} {plural(rows.length, 'achat')} enregistré{rows.length > 1 ? 's' : ''}. Une erreur de saisie se supprime, avec annulation.
          </p>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="purchases-empty">Aucun achat enregistré. Colle une liste d’achats, ou ajoute un achat pour remplir le frigo.</p>
      ) : (
        <>
          <ul className="purchase-list">
            {shown.map((p) => {
              const food = foodOf(p);
              return (
                <li key={p.id} className="purchase-line">
                  <span className="purchase-date">{formatDayMonth(p.receivedAt)}</span>
                  <span className="purchase-name" title={p.note}>
                    {food?.name ?? 'Aliment inconnu'}
                  </span>
                  <span className="purchase-qty num">{food ? formatQty(food, p.qty) : String(p.qty)}</span>
                  <button
                    type="button"
                    className="purchase-del"
                    onClick={() => onRemove(p)}
                    aria-label={`Supprimer l’achat de ${food?.name ?? 'cet aliment'} du ${formatDayMonth(p.receivedAt)}`}
                    title="Supprimer cet achat"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length > 5 && (
            <button type="button" className="purchases-more" onClick={() => setAll((v) => !v)}>
              {all ? 'Réduire la liste' : `Voir les ${rows.length} achats`}
              <ChevronRight size={14} aria-hidden className={all ? 'is-up' : ''} />
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Ce qui est sorti du stock sans passer par un plat : mangé à côté, jeté, ou une erreur de compte. */
function CorrectForm({
  s,
  onDone,
  onCancel,
}: {
  s: FoodStock;
  onDone: (qty: number, reason: Adjustment['reason']) => void;
  onCancel: () => void;
}) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<Adjustment['reason']>('jeté');
  const n = Number(qty.replace(/\s/g, '').replace(',', '.'));
  const REASONS: [Adjustment['reason'], string][] = [
    ['jeté', 'Jeté'],
    ['mangé hors plan', 'Mangé hors plan'],
    ['correction', 'Erreur de compte'],
  ];
  return (
    <form
      className="form-stack stock-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (n > 0) onDone(n, reason);
      }}
    >
      <p className="stock-form-hint">
        Il reste <b className="num">{formatQty(s.food, s.remaining)}</b> en stock. Indique la quantité sortie, et pourquoi.
      </p>
      <label className="field">
        <span>Quantité sortie</span>
        <span className="qty-input">
          <input
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={s.food.unit === 'pièce' ? '1' : '100'}
            autoFocus
          />
          <span className="unit">{s.food.unit === 'pièce' ? 'pc' : s.food.unit}</span>
        </span>
      </label>
      <div className="stock-choices" role="radiogroup" aria-label="Pourquoi">
        {REASONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={reason === id}
            className={`stock-choice ${reason === id ? 'is-on' : ''}`}
            onClick={() => setReason(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="modal-foot">
        <button type="button" className="s-btn is-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="s-btn is-primary" disabled={!(n > 0)}>
          Retirer du stock
        </button>
      </div>
    </form>
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
  const n = Number(qty.replace(/\s/g, '').replace(',', '.'));
  return (
    <form
      className="form-stack stock-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!food || !n || n <= 0) return;
        store.update('stock', (s) => [...s, { id: newId('p'), foodId, qty: n, receivedAt, ...(expiresAt ? { expiresAt } : {}) }]);
        onDone();
      }}
    >
      <label className="field">
        <span>Aliment</span>
        <select value={foodId} onChange={(e) => setFoodId(e.target.value)}>
          {foods.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Quantité{food?.pack ? ` · ${food.pack.label}` : ''}</span>
        <span className="qty-input">
          <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} required />
          <span className="unit">{food?.unit === 'pièce' ? 'pc' : food?.unit}</span>
        </span>
      </label>
      <div className="field-pair">
        <label className="field">
          <span>Reçu le</span>
          <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} required />
        </label>
        <label className="field">
          <span>À consommer avant le</span>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
      </div>
      <p className="stock-form-hint">
        Un aliment absent du catalogue ne peut pas être acheté ici. Demande à Hermès de l’ajouter, avec ses valeurs pour 100 g.
      </p>
      <div className="modal-foot">
        <button type="button" className="s-btn is-ghost" onClick={onDone}>
          Annuler
        </button>
        <button type="submit" className="s-btn is-primary" disabled={!food || !(n > 0)}>
          Ajouter au stock
        </button>
      </div>
    </form>
  );
}
