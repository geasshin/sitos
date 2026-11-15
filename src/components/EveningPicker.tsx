import { useState } from 'react';
import { ChevronDown, Moon, Plus, X } from 'lucide-react';
import { useApp } from '../context';
import { recommendSides, sideCandidates } from '../domain/balance';
import { dayNutrition, itemsNutrients } from '../domain/nutrition';
import { newId } from '../domain/plan';
import { availableOn } from '../domain/stock';
import type { ISODate } from '../domain/types';

/**
 * Un seul sélecteur pour le soir : les à-côtés déjà retenus, puis ceux qui comblent le mieux
 * la journée en cours, puis les autres idées possibles avec le stock. Rien de doublonné :
 * un à-côté retenu sort des suggestions.
 */
export function EveningPicker({ date }: { date: ISODate }) {
  const app = useApp();
  const { data, store, targets } = app;
  const [showOthers, setShowOthers] = useState(false);
  const day = dayNutrition(data, app.foods, date);
  const chosen = data.journal.snacks.filter((s) => s.date === date);
  const chosenLabels = new Set(chosen.map((s) => s.label));
  const candidates = sideCandidates(data.snackIdeas, app.foods, availableOn(data, app.stock, app.today, date));
  const reco = recommendSides({ nutrients: day.total, plantG: day.plantG }, targets, candidates, app.foods, 3);
  const picks = reco.picks.filter((p) => !chosenLabels.has(p.candidate.label));
  const pickIds = new Set(picks.map((p) => p.candidate.id));
  const sweet = (c: { items: { foodId: string }[] }) => c.items.some((i) => app.foods.get(i.foodId)?.category === 'sucré');
  const others = candidates
    .filter((c) => !pickIds.has(c.id) && !chosenLabels.has(c.label))
    .sort((a, b) => Number(sweet(a)) - Number(sweet(b)))
    .slice(0, 10);
  const add = (label: string, items: { foodId: string; qty: number }[]) =>
    store.update('journal', (j) => ({ ...j, snacks: [...j.snacks, { id: newId('s'), date, label, items }] }));

  return (
    <div className="evening-picker">
      {chosen.length > 0 && (
        <ul className="chips">
          {chosen.map((s) => (
            <li key={s.id}>
              <span className="chip chip-on">
                <Moon size={12} aria-hidden /> {s.label}
                <span className="num chip-meta">{Math.round(itemsNutrients(app.foods, s.items).kcal)}</span>
                <button type="button" className="chip-x" aria-label={`Retirer ${s.label}`} onClick={() => store.update('journal', (j) => ({ ...j, snacks: j.snacks.filter((x) => x.id !== s.id) }))}>
                  <X size={13} aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {picks.length > 0 && (
        <>
          <p className="evening-sub">Pour compléter la journée</p>
          <ul className="picks">
            {picks.map((p) => (
              <li key={p.candidate.id} className="pick-row">
                <span className="pick-label">{p.candidate.label}</span>
                <span className="pick-brings small muted">{p.brings.join(' · ')}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Ajouter ${p.candidate.label} pour le soir`}
                  title={p.candidate.note}
                  onClick={() => add(p.candidate.label, p.candidate.items)}
                >
                  <Plus size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {others.length > 0 && (
        <>
          <button type="button" className="link small" aria-expanded={showOthers} onClick={() => setShowOthers((v) => !v)}>
            Autres idées, avec ce que tu as ({others.length}) <ChevronDown size={13} className={`chev ${showOthers ? 'up' : ''}`} aria-hidden />
          </button>
          {showOthers && (
            <ul className="chips">
              {others.map((c) => (
                <li key={c.id}>
                  <button type="button" className="chip" onClick={() => add(c.label, c.items)} title={c.note}>
                    <Plus size={13} aria-hidden /> {c.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {chosen.length === 0 && picks.length === 0 && others.length === 0 && (
        <p className="hint">Rien à proposer avec le stock du moment. Note ce que tu prends depuis le calendrier.</p>
      )}
    </div>
  );
}
