import type { FoodIndex } from '../domain/nutrition';
import type { Food, Ingredient } from '../domain/types';

type Group = 'vegetal' | 'protein' | 'carb' | 'other';

const ORDER: Group[] = ['vegetal', 'protein', 'carb', 'other'];
const LABELS: Record<Group, string> = {
  vegetal: 'végétal',
  protein: 'protéines',
  carb: 'féculents',
  other: 'autres',
};
const CIRCUMFERENCE = 2 * Math.PI * 38;

function groupOf(category: Food['category']): Group {
  if (category === 'légumes' || category === 'fruits') return 'vegetal';
  if (category === 'viandes & œufs' || category === 'laitiers') return 'protein';
  if (category === 'féculents' || category === 'légumineuses') return 'carb';
  return 'other';
}

/**
 * La composition d'un repas en un coup d'œil : un anneau de quatre familles, le nombre
 * d'ingrédients au centre, et une légende courte. C'est un repère visuel, pas un graphique
 * de précision ; les quantités exactes restent dans la fiche d'ingrédients.
 */
export function MealPlate({
  ingredients,
  foods,
  count,
}: {
  ingredients: Ingredient[];
  foods: FoodIndex;
  count: number;
}) {
  const grams: Record<Group, number> = { vegetal: 0, protein: 0, carb: 0, other: 0 };
  for (const item of ingredients) {
    const food = foods.get(item.foodId);
    if (!food) continue;
    const weight = food.unit === 'pièce' ? item.qty * (food.gramsPerUnit ?? 0) : item.qty;
    if (weight > 0) grams[groupOf(food.category)] += weight;
  }

  const rows = ORDER.map((key) => ({ key, grams: grams[key] })).filter((row) => row.grams > 0);
  const total = rows.reduce((sum, row) => sum + row.grams, 0);
  let offset = 0;

  const label = count > 1 ? 'INGRÉDIENTS' : count === 1 ? 'INGRÉDIENT' : 'À COMPLÉTER';
  const spoken = rows.length
    ? `${count} ${count > 1 ? 'ingrédients' : 'ingrédient'} : ${rows
        .map((row) => `${LABELS[row.key]} ${Math.round((row.grams / total) * 100)} %`)
        .join(', ')}`
    : 'Aucun ingrédient renseigné';

  return (
    <div className="meal-plate-wrap">
      <svg className="meal-plate" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="meal-plate-rim" cx="50" cy="50" r="46" />
        <circle className="meal-plate-center" cx="50" cy="50" r="31" />
        {total > 0 ? (
          <g transform="rotate(-90 50 50)">
            {rows.map((row) => {
              const length = (row.grams / total) * CIRCUMFERENCE;
              const dash = Math.max(1.5, length - 2.5);
              const dashOffset = -offset - 1.25;
              offset += length;
              return (
                <circle
                  key={row.key}
                  className={`meal-plate-seg is-${row.key}`}
                  cx="50"
                  cy="50"
                  r="38"
                  strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                  strokeDashoffset={dashOffset}
                />
              );
            })}
          </g>
        ) : (
          <circle className="meal-plate-empty" cx="50" cy="50" r="38" />
        )}
        <text className="meal-plate-count" x="50" y="48" textAnchor="middle">
          {count || '—'}
        </text>
        <text className="meal-plate-label" x="50" y="62" textAnchor="middle">
          {label}
        </text>
      </svg>

      {rows.length > 0 && (
        <ul className="meal-plate-legend" aria-hidden="true">
          {rows.map((row) => (
            <li key={row.key}>
              <i className={`meal-plate-dot is-${row.key}`} />
              {LABELS[row.key]}
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only">{spoken}</span>
    </div>
  );
}
