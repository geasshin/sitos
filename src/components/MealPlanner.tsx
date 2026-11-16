import { useMemo, useState } from 'react';
import { Leaf, Minus, Plus, Search } from 'lucide-react';
import { useApp } from '../context';
import { insertBlock, makeCookBlock } from '../domain/plan';
import { formatShort } from '../domain/dates';
import { isPlannable, portionsOf, type ISODate, type Recipe } from '../domain/types';

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
  date,
  fixedPortions,
}: {
  submitLabel: string;
  onRecipe: (recipe: Recipe, portions: number) => void;
  onCustom: (title: string, portions: number) => void;
  /** Jour visé : sert à montrer où iront les restes avant de valider. */
  date?: ISODate;
  /** Repas déjà posé ce jour-là : une seule portion, sans décaler la suite du plan. */
  fixedPortions?: number;
}) {
  const { data, portions: info, priorities } = useApp();
  const [mode, setMode] = useState<'fiche' | 'maison'>('fiche');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Recipe | null>(null);
  const [title, setTitle] = useState('');
  const [portions, setPortions] = useState(fixedPortions ?? 2);

  const all = useMemo(() => {
    const n = norm(q.trim());
    return data.recipes
      .filter((r) => !n || norm(r.name).includes(n))
      .sort((a, b) => Number(isPlannable(b)) - Number(isPlannable(a)) || a.name.localeCompare(b.name, 'fr'));
  }, [data.recipes, q]);

  // Ce qui ferait passer des produits à risque, en premier, quand on ne cherche rien.
  const rescueScore = useMemo(() => {
    const atRisk = new Set(priorities.filter((p) => p.atRisk > 0).map((p) => p.food.id));
    const score = new Map<string, number>();
    for (const r of data.recipes) {
      const used = (r.ingredients ?? []).filter((i) => atRisk.has(i.foodId)).length;
      if (used > 0) score.set(r.id, used);
    }
    return score;
  }, [data.recipes, priorities]);

  const searching = q.trim().length > 0;
  const results = searching ? all.slice(0, 40) : all;
  const rescue = searching
    ? []
    : [...results].filter((r) => rescueScore.has(r.id)).sort((a, b) => rescueScore.get(b.id)! - rescueScore.get(a.id)!).slice(0, 3);
  const rescueIds = new Set(rescue.map((r) => r.id));
  const mains = results.filter((r) => !rescueIds.has(r.id) && r.dish === 'Plat').slice(0, 30);
  const sides = results.filter((r) => !rescueIds.has(r.id) && r.dish !== 'Plat').slice(0, 14);

  // Où iront les restes : calculé avec le vrai placement, pas une estimation.
  const preview = useMemo(() => {
    if (!date || !picked) return undefined;
    const block = makeCookBlock(picked, portions);
    const after = insertBlock(data.plan.entries, block, date);
    const ids = new Set(block.map((b) => b.id));
    const dates = after.filter((e) => ids.has(e.id)).map((e) => e.date).sort();
    // La suite glisse seulement si un repas déjà posé a changé de jour.
    const before = new Map(data.plan.entries.map((e) => [e.id, e.date]));
    const moved = after.filter((e) => before.has(e.id) && before.get(e.id) !== e.date).length;
    return { dates, moved };
  }, [date, picked, portions, data.plan.entries]);

  return (
    <div className="planner">
      <div className="seg-group" role="tablist" aria-label="Type de repas">
        <button type="button" role="tab" aria-selected={mode === 'fiche'} className={`seg-pill ${mode === 'fiche' ? 'on' : ''}`} onClick={() => setMode('fiche')}>
          Une recette
        </button>
        <button type="button" role="tab" aria-selected={mode === 'maison'} className={`seg-pill ${mode === 'maison' ? 'on' : ''}`} onClick={() => setMode('maison')}>
          Sans fiche
        </button>
      </div>

      {mode === 'fiche' ? (
        <>
          <label className="search-pill search-pill-block">
            <Search size={15} aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une recette" aria-label="Chercher une recette" />
          </label>
          <ul className="pick-list" role="listbox" aria-label="Recettes">
            {!searching && rescue.length > 0 && (
              <li className="pick-group" aria-hidden>
                <Leaf size={13} aria-hidden /> Avec ton stock, à faire vite
              </li>
            )}
            {(searching ? results : rescue).map((r) => (
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
                  <span className="pick-meta num">{isPlannable(r) ? `${Math.round(info.get(r.id)!.nutrients.kcal)} kcal / portion` : 'sans quantités'}</span>
                </button>
              </li>
            ))}
            {!searching && mains.length > 0 && (
              <li className="pick-group" aria-hidden>Plats</li>
            )}
            {!searching && mains.map((r) => (
              <li key={`m-${r.id}`}>
                <button type="button" role="option" aria-selected={picked?.id === r.id} className={`pick ${picked?.id === r.id ? 'on' : ''}`} onClick={() => { setPicked(r); setPortions(portionsOf(r)); }}>
                  <span className="pick-name">{r.name}</span>
                  <span className="pick-meta num">{isPlannable(r) ? `${Math.round(info.get(r.id)!.nutrients.kcal)} kcal / portion` : 'sans quantités'}</span>
                </button>
              </li>
            ))}
            {!searching && sides.length > 0 && (
              <li className="pick-group" aria-hidden>Accompagnements, sauces, desserts</li>
            )}
            {!searching && sides.map((r) => (
              <li key={`s-${r.id}`}>
                <button type="button" role="option" aria-selected={picked?.id === r.id} className={`pick ${picked?.id === r.id ? 'on' : ''}`} onClick={() => { setPicked(r); setPortions(portionsOf(r)); }}>
                  <span className="pick-name">{r.name}</span>
                  <span className="pick-meta num">{isPlannable(r) ? `${Math.round(info.get(r.id)!.nutrients.kcal)} kcal / portion` : `${r.dish} · sans quantités`}</span>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="muted small pick-empty">
                {q.trim() ? 'Aucune recette trouvée.' : 'Ta bibliothèque est vide.'}{' '}
                <button type="button" className="link" onClick={() => setMode('maison')}>Composer un plat sans fiche</button>
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
        {fixedPortions ? (
          <span className="muted small">{fixedPortions} repas</span>
        ) : (
          <>
            <PortionStepper value={portions} onChange={setPortions} />
            <span className="muted small">repas</span>
          </>
        )}
        <button
          type="button"
          className="primary-button"
          disabled={mode === 'fiche' ? !picked : !title.trim()}
          onClick={() => (mode === 'fiche' ? picked && onRecipe(picked, fixedPortions ?? portions) : onCustom(title.trim(), fixedPortions ?? portions))}
        >
          {mode === 'fiche' && !picked ? 'Choisis une recette' : mode === 'maison' && !title.trim() ? 'Donne un nom' : submitLabel}
        </button>
      </div>
      {preview && preview.dates.length > 1 && (
        <p className="hint">
          {preview.dates.length} repas : {preview.dates.map((d) => formatShort(d)).join(', ')}.
          {preview.moved > 0 && ` La suite du plan glisse de ${preview.moved} repas.`}
        </p>
      )}
      {mode === 'maison' && <p className="hint">Tu ajoutes les ingrédients juste après : ils sortent du stock quand le plat est coché.</p>}
      {mode === 'fiche' && picked && !isPlannable(picked) && <p className="hint">Cette fiche n’a pas de quantités : tu ajouteras les ingrédients pour ce repas.</p>}
    </div>
  );
}
