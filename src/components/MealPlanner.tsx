import { useMemo, useState } from 'react';
import { Minus, Plus, Search } from 'lucide-react';
import { useApp } from '../context';
import { isPlannable, portionsOf, type Recipe } from '../domain/types';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function PortionStepper({ value, onChange, label = 'Repas' }: { value: number; onChange: (n: number) => void; label?: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="icon-button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Un repas de moins">
        <Minus size={15} aria-hidden />
      </button>
      <span className="num" aria-live="polite">{value}</span>
      <button type="button" className="icon-button" onClick={() => onChange(Math.min(8, value + 1))} aria-label="Un repas de plus">
        <Plus size={15} aria-hidden />
      </button>
    </div>
  );
}

/**
 * Choisir quoi cuisiner : une fiche de la bibliothèque (ses quantités suivent le nombre de repas)
 * ou un plat maison dont on donne seulement le nom, les ingrédients s'ajoutent ensuite.
 */
export function MealPlanner({
  submitLabel,
  onRecipe,
  onCustom,
}: {
  submitLabel: string;
  onRecipe: (recipe: Recipe, portions: number) => void;
  onCustom: (title: string, portions: number) => void;
}) {
  const { data, portions: info } = useApp();
  const [mode, setMode] = useState<'fiche' | 'maison'>('fiche');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Recipe | null>(null);
  const [title, setTitle] = useState('');
  const [portions, setPortions] = useState(2);

  const results = useMemo(() => {
    const n = norm(q.trim());
    return data.recipes
      .filter((r) => !n || norm(r.name).includes(n))
      .sort((a, b) => Number(isPlannable(b)) - Number(isPlannable(a)) || a.name.localeCompare(b.name, 'fr'))
      .slice(0, 40);
  }, [data.recipes, q]);

  return (
    <div className="planner">
      <div className="seg-group" role="tablist" aria-label="Type de repas">
        <button type="button" role="tab" aria-selected={mode === 'fiche'} className={`seg-pill ${mode === 'fiche' ? 'on' : ''}`} onClick={() => setMode('fiche')}>
          Une recette
        </button>
        <button type="button" role="tab" aria-selected={mode === 'maison'} className={`seg-pill ${mode === 'maison' ? 'on' : ''}`} onClick={() => setMode('maison')}>
          Plat maison
        </button>
      </div>

      {mode === 'fiche' ? (
        <>
          <label className="search-pill search-pill-block">
            <Search size={15} aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une recette" aria-label="Chercher une recette" />
          </label>
          <ul className="pick-list" role="listbox" aria-label="Recettes">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={picked?.id === r.id}
                  className={`pick ${picked?.id === r.id ? 'on' : ''}`}
                  onClick={() => {
                    setPicked(r);
                    setPortions(portionsOf(r));
                  }}
                >
                  <span className="pick-name">{r.name}</span>
                  <span className="pick-meta num">{isPlannable(r) ? `${Math.round(info.get(r.id)!.nutrients.kcal)} kcal` : 'sans quantités'}</span>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="muted small pick-empty">
                {q.trim() ? 'Aucune recette trouvée.' : 'Ta bibliothèque est vide.'}{' '}
                <button type="button" className="link" onClick={() => setMode('maison')}>Composer un plat maison</button>
              </li>
            )}
          </ul>
        </>
      ) : (
        <label className="field">
          <span>Nom du plat</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Riz sauté aux légumes" />
        </label>
      )}

      <div className="planner-foot">
        <PortionStepper value={portions} onChange={setPortions} />
        <span className="muted small">repas</span>
        <button
          type="button"
          className="primary-button"
          disabled={mode === 'fiche' ? !picked : !title.trim()}
          onClick={() => (mode === 'fiche' ? picked && onRecipe(picked, portions) : onCustom(title.trim(), portions))}
        >
          {mode === 'fiche' && !picked ? 'Choisis une recette' : mode === 'maison' && !title.trim() ? 'Donne un nom' : submitLabel}
        </button>
      </div>
      {mode === 'maison' && <p className="hint">Tu ajoutes les ingrédients juste après : ils sortent du stock quand le plat est coché.</p>}
      {mode === 'fiche' && picked && !isPlannable(picked) && <p className="hint">Cette fiche n’a pas de quantités : tu ajouteras les ingrédients pour ce repas.</p>}
    </div>
  );
}
