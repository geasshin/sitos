import { useState } from 'react';
import { ClipboardPaste, Plus, Sparkles } from 'lucide-react';
import { useApp } from '../context';
import { parseOrder } from '../domain/order';
import { newId } from '../domain/plan';
import { formatQty } from '../domain/stock';
import type { ISODate } from '../domain/types';

interface Draft {
  key: number;
  line: string;
  foodId: string;
  qty: string;
  include: boolean;
  guessed?: boolean;
  ambiguous?: string[];
}

/**
 * Saisir une commande entière d'un coup : on colle les lignes, Sitos reconnaît les produits,
 * montre ce qu'il a compris et laisse tout corriger avant d'enregistrer.
 */
export function OrderImport({ onDone }: { onDone: () => void }) {
  const { data, today, store } = useApp();
  const [text, setText] = useState('');
  const [receivedAt, setReceivedAt] = useState<ISODate>(today);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const foods = [...data.foods].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const analyze = () => {
    const parsed = parseOrder(text, data.foods);
    setDrafts(
      parsed.map((p, i) => ({
        key: i,
        line: p.line,
        foodId: p.foodId ?? '',
        qty: p.qty !== undefined ? String(Math.round(p.qty * 100) / 100).replace('.', ',') : '',
        include: p.ok,
        guessed: p.guessed,
        ambiguous: p.ambiguous,
      })),
    );
  };

  const patch = (key: number, next: Partial<Draft>) => setDrafts((d) => (d ? d.map((x) => (x.key === key ? { ...x, ...next } : x)) : d));
  const ready = (drafts ?? []).filter((d) => d.include && d.foodId && Number(d.qty.replace(',', '.')) > 0);

  const save = () => {
    const purchases = ready.map((d) => ({
      id: newId('p'),
      foodId: d.foodId,
      qty: Number(d.qty.replace(',', '.')),
      receivedAt,
      origin: 'commande' as const,
    }));
    if (purchases.length === 0) return;
    store.update('stock', (s) => [...s, ...purchases]);
    onDone();
  };

  return (
    <div className="form-stack order-import">
      <label className="field">
        <span>Colle ta commande, une ligne par produit</span>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDrafts(null);
          }}
          rows={5}
          placeholder={'2 courgettes\n1 kg de riz\n500 g de tomates cerises\n6 œufs'}
        />
      </label>
      <div className="form-row">
        <button type="button" className="secondary-button" onClick={analyze} disabled={!text.trim()}>
          <ClipboardPaste size={15} aria-hidden /> Analyser
        </button>
        <label className="field field-inline">
          <span>Reçu le</span>
          <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </label>
      </div>

      {drafts && drafts.length > 0 && (
        <>
          <p className="balance-sub">
            <Sparkles size={13} aria-hidden /> Ce que j’ai compris
          </p>
          <ul className="order-lines">
            {drafts.map((d) => {
              const food = data.foods.find((f) => f.id === d.foodId);
              return (
                <li key={d.key} className={`order-line ${d.include ? '' : 'is-off'}`}>
                  <input type="checkbox" checked={d.include} onChange={(e) => patch(d.key, { include: e.target.checked })} aria-label={`Prendre ${d.line}`} />
                  <select value={d.foodId} onChange={(e) => patch(d.key, { foodId: e.target.value, include: true })} aria-label={`Produit pour « ${d.line} »`}>
                    <option value="">Produit ?</option>
                    {foods.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="order-qty"
                    inputMode="decimal"
                    value={d.qty}
                    onChange={(e) => patch(d.key, { qty: e.target.value })}
                    placeholder="0"
                    aria-label={`Quantité pour ${d.line}`}
                  />
                  <span className="muted small order-unit">{food ? (food.unit === 'pièce' ? 'pièces' : food.unit) : ''}</span>
                  <span className="order-note small muted">
                    {!d.foodId ? 'produit inconnu, à rattacher' : d.ambiguous ? `ambigu : ${d.ambiguous.join(' ou ')}` : d.guessed ? 'quantité déduite' : ''}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="hint">
            {ready.length > 0 &&
              `Les quantités sont dans l’unité de chaque produit : ${ready
                .slice(0, 3)
                .map((d) => {
                  const f = data.foods.find((x) => x.id === d.foodId)!;
                  return formatQty(f, Number(d.qty.replace(',', '.')));
                })
                .join(', ')}${ready.length > 3 ? '…' : ''}.`}{' '}
            Un produit inconnu se rattache ici, ou s’ajoute depuis « Un achat ».
          </p>
        </>
      )}
      {drafts && drafts.length === 0 && <p className="hint">Rien à lire dans ce texte.</p>}
      <div className="modal-foot">
        <button type="button" className="text-button" onClick={onDone}>
          Annuler
        </button>
        <button type="button" className="primary-button" onClick={save} disabled={ready.length === 0}>
          <Plus size={15} aria-hidden /> Enregistrer {ready.length > 0 ? `${ready.length} achat${ready.length > 1 ? 's' : ''}` : 'les achats'}
        </button>
      </div>
    </div>
  );
}
