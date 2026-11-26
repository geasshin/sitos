import { useMemo, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useApp } from '../context';
import { Sheet } from '../components/Sheet';
import { missingCount } from '../domain/recipes';
import { recipePortion } from '../domain/nutrition';
import { entriesOn } from '../domain/nutrition';
import { amount } from '../domain/stock';
import { portionsOf, type ISODate, type Recipe } from '../domain/types';

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');
const dayLabel = (d: ISODate) => `${WEEKDAYS[(new Date(`${d}T12:00:00`).getDay() + 6) % 7]} ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

export interface Proposal {
  date: ISODate;
  recipe: Recipe;
  kcal: number;
  /** Ce qui rend cette recette un bon choix aujourd'hui. */
  reason: string;
  /** Faux quand il manque des aliments : la ligne reste proposée, mais décochée. */
  ready: boolean;
  missing: number;
  /** Ce que la cuisson donnera de portions. */
  portions: number;
}

/**
 * La proposition d'une semaine : on part des jours vides, on prend les recettes
 * les plus utiles au stock du moment, et on réserve les aliments au fil des choix
 * pour ne pas proposer trois plats qui réclament les mêmes courgettes.
 * Rien n'est appliqué sans un clic : la feuille montre tout, on décoche ce qu'on refuse.
 */
export function buildProposal(
  days: ISODate[],
  today: ISODate,
  data: ReturnType<typeof useApp>['data'],
  foods: ReturnType<typeof useApp>['foods'],
  stock: ReturnType<typeof useApp>['stock'],
  priorities: ReturnType<typeof useApp>['priorities'],
): Proposal[] {
  const atRisk = new Map(priorities.filter((p) => p.atRisk > 0).map((p) => [p.food.id, p.atRisk]));
  const reserved = new Map<string, number>();
  const taken = new Set(data.plan.entries.filter((e) => e.kind === 'cook').map((e) => e.recipeId));
  const empty = days.filter((d) => d >= today && entriesOn(data, d).length === 0);

  const available = (foodId: string) => {
    const s = stock.get(foodId);
    if (!s) return 0;
    return Math.max(0, s.remaining - (reserved.get(foodId) ?? 0));
  };
  // Un aliment déjà réservé par une proposition précédente ne compte plus.
  const missingAgainst = (recipe: Recipe) => (recipe.ingredients ?? []).filter((i) => available(i.foodId) < i.qty).length;

  const score = (r: Recipe) => {
    const missing = missingCount(r, stock) ?? Infinity;
    if (!Number.isFinite(missing)) return -Infinity;
    const saves = (r.ingredients ?? []).filter((i) => atRisk.has(i.foodId)).length;
    const covered = (r.ingredients ?? []).filter((i) => available(i.foodId) >= i.qty).length;
    const total = (r.ingredients ?? []).length;
    const ratio = total > 0 ? covered / total : 0;
    return saves * 6 + ratio * 10 - missing * 8 + (r.dish === 'Plat' ? 3 : 0) + (r.status === 'maîtrisée' ? 2 : 0);
  };

  const out: Proposal[] = [];
  for (const date of empty) {
    let best: { recipe: Recipe; score: number } | undefined;
    for (const r of data.recipes) {
      if (taken.has(r.id)) continue;
      const s = score(r);
      if (!best || s > best.score) best = { recipe: r, score: s };
    }
    if (!best || !Number.isFinite(best.score) || best.score === -Infinity) continue;
    const recipe = best.recipe;
    taken.add(recipe.id);
    for (const ing of recipe.ingredients ?? []) reserved.set(ing.foodId, (reserved.get(ing.foodId) ?? 0) + ing.qty);

    const missing = missingAgainst(recipe);
    const saving = (recipe.ingredients ?? []).filter((i) => atRisk.has(i.foodId));
    const names = saving.map((i) => foods.get(i.foodId)?.name ?? '').filter(Boolean);
    const reason =
      names.length === 1
        ? `sauve ${names[0]}`
        : names.length > 1
          ? `sauve ${names[0]} et ${names.length - 1} autre${names.length > 2 ? 's' : ''}`
          : missing === 0
            ? 'prête avec ton stock'
            : `il manque ${missing} aliment${missing > 1 ? 's' : ''}`;
    out.push({
      date,
      recipe,
      kcal: recipePortion(foods, recipe).nutrients.kcal,
      portions: Math.max(1, portionsOf(recipe)),
      reason,
      ready: missing === 0,
      missing,
    });
  }
  return out;
}

/** La feuille de proposition : une ligne par jour vide, décochable, puis un seul geste. */
export function WeekProposal({
  open,
  days,
  onClose,
  onApply,
}: {
  open: boolean;
  days: ISODate[];
  onClose: () => void;
  onApply: (rows: Proposal[]) => void;
}) {
  const app = useApp();
  const { data, foods, stock, priorities, today } = app;
  const all = useMemo(
    () => (open ? buildProposal(days, today, data, foods, stock, priorities) : []),
    [open, days, today, data, foods, stock, priorities],
  );
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const kept = all.filter((p) => !dropped.has(p.date));
  const readyCount = kept.filter((p) => p.ready).length;
  const missingFoods = (p: Proposal) => {
    return (p.recipe.ingredients ?? [])
      .filter((i) => (stock.get(i.foodId)?.remaining ?? 0) < i.qty)
      .slice(0, 2)
      .map((i) => amount(foods.get(i.foodId), i.qty));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Proposer une semaine"
      subtitle={
        all.length === 0
          ? 'Aucun jour vide à remplir cette semaine'
          : `${all.length} jour${all.length > 1 ? 's' : ''} à remplir, construits avec ton stock et tes produits à sauver`
      }
      size="lg"
      footer={
        all.length > 0 ? (
          <>
            <span className="sheet-hint">
              {kept.length} repas, dont {readyCount} prêts avec le stock
            </span>
            <span className="sheet-foot-gap" />
            <button type="button" className="s-btn is-ghost" onClick={onClose}>
              Annuler
            </button>
            <button
              type="button"
              className="s-btn is-primary"
              disabled={kept.length === 0}
              onClick={() => onApply(kept)}
            >
              Placer {kept.length} repas
            </button>
          </>
        ) : undefined
      }
    >
      {all.length === 0 ? (
        <p className="proposal-empty">
          Tous les jours de cette semaine ont déjà un repas. Ouvre la semaine suivante pour en préparer une autre.
        </p>
      ) : (
        <ul className="proposal-list">
          {all.map((p) => {
            const on = !dropped.has(p.date);
            return (
              <li key={p.date} className={`proposal-row ${on ? '' : 'is-off'}`}>
                <button
                  type="button"
                  className={`proposal-tick ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  aria-label={`${on ? 'Retirer' : 'Garder'} ${p.recipe.name} du ${dayLabel(p.date)}`}
                  onClick={() =>
                    setDropped((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.date)) next.delete(p.date);
                      else next.add(p.date);
                      return next;
                    })
                  }
                >
                  <Check size={16} strokeWidth={3} aria-hidden />
                </button>
                <div className="proposal-body">
                  <p className="proposal-day">{dayLabel(p.date)}</p>
                  <p className="proposal-name">{p.recipe.name}</p>
                  <p className={`proposal-reason ${p.ready ? 'is-ready' : 'is-missing'}`}>
                    <Sparkles size={12} aria-hidden /> {p.reason}
                    {!p.ready && missingFoods(p).length > 0 && <span className="proposal-needs"> · {missingFoods(p).join(', ')}</span>}
                  </p>
                </div>
                <span className="s-chip is-mint proposal-facts">
                  <b className="num">{fr(p.kcal)}</b> kcal/portion · {p.portions} portions
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
