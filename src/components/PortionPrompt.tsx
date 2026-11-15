import { Scale } from 'lucide-react';
import type { PlanEntry } from '../domain/types';

const CHOICES: [number, string][] = [
  [0.75, 'Plus petite'],
  [1, 'Comme prévu'],
  [1.25, 'Plus grosse'],
];

/**
 * Après « C'est fait » : quelle portion a réellement été mangée.
 * Ça ne touche ni la fiche ni le stock (le plat a bien été cuit avec tous ses ingrédients),
 * seulement le bilan de la journée. C'est ce qui recale les portions au fil des semaines.
 */
export function PortionPrompt({ entry, onPick }: { entry: PlanEntry; onPick: (eaten: number) => void }) {
  if (!entry.done || entry.eaten !== undefined) return null;
  return (
    <div className="portion" role="group" aria-label="Portion réellement mangée">
      <p className="portion-label">
        <Scale size={14} aria-hidden /> La portion était…
      </p>
      <div className="portion-choices">
        {CHOICES.map(([k, label]) => (
          <button key={k} type="button" className="chip" onClick={() => onPick(k)}>
            {label}
            {k !== 1 && <span className="num chip-meta">×{String(k).replace('.', ',')}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
