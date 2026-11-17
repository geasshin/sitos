import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Heart, Link2, Plus, Search } from 'lucide-react';
import { useApp } from '../context';
import { DISHES, isPlannable, type Recipe, type RecipeStatus } from '../domain/types';
import { Cover, STATUS_LABEL, StatusPill, sourceLabel } from '../components/recipe';
import { Empty, PageHeader } from '../components/ui';
import { makeable, missingCount } from '../domain/recipes';

type StatusFilter = 'tous' | RecipeStatus | 'favoris';
type Sort = 'titre' | 'recent';
interface Filters {
  q: string;
  status: StatusFilter;
  dish: string;
  linked: boolean;
  /** Ne garder que ce qui est cuisinable avec le stock du jour. */
  ready: boolean;
  sort: Sort;
}
const KEY = 'cuisine-recettes-filtres';
const DEFAULTS: Filters = {
  q: '',
  status: 'tous',
  dish: 'tous',
  linked: false,
  ready: true,
  sort: 'titre',
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');

export function RecipesView() {
  const app = useApp();
  const { data, openRecipe, editRecipe, portions } = app;
  const [f, setF] = useState<Filters>(() => {
    try {
      return {
        ...DEFAULTS,
        ...JSON.parse(sessionStorage.getItem(KEY) ?? '{}'),
      };
    } catch {
      return DEFAULTS;
    }
  });
  useEffect(() => sessionStorage.setItem(KEY, JSON.stringify(f)), [f]);
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));

  const dishes = DISHES.filter((d) => data.recipes.some((r) => r.dish === d));
  const favorites = data.recipes.filter((r) => r.favorite).length;
  const linked = data.recipes.filter(isPlannable).length;
  const ready = data.recipes.filter((r) => makeable(r, app.stock)).length;
  const oneAway = data.recipes.filter((r) => missingCount(r, app.stock) === 1).length;

  const list = useMemo(() => {
    const q = norm(f.q.trim());
    const out = data.recipes.filter((r) => {
      if (f.status === 'favoris' ? !r.favorite : f.status !== 'tous' && r.status !== f.status) return false;
      if (f.dish !== 'tous' && r.dish !== f.dish) return false;
      if (f.linked && !isPlannable(r)) return false;
      if (f.ready && !makeable(r, app.stock)) return false;
      if (q) {
        const hay = norm([r.name, r.source ?? '', ...(r.ingredientsText ?? []), r.note ?? ''].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return out.sort((a, b) => (f.sort === 'recent' ? (b.createdAt ?? '').localeCompare(a.createdAt ?? '') : a.name.localeCompare(b.name, 'fr')));
  }, [data.recipes, f, app.stock]);

  const statusTabs: { id: StatusFilter; label: string }[] = [
    { id: 'tous', label: 'Tous' },
    ...(['à découvrir', 'terminé', 'maîtrisée'] as RecipeStatus[])
      .filter((s) => data.recipes.some((r) => r.status === s))
      .map((s) => ({ id: s, label: STATUS_LABEL[s] })),
  ];

  return (
    <div className="page page-library">
      <PageHeader
        title="Recettes"
        context={`${data.recipes.length} recette${data.recipes.length > 1 ? 's' : ''}`}
        actions={
          <button type="button" className="primary-button" onClick={() => editRecipe('nouvelle')}>
            <Plus size={16} aria-hidden /> Ajouter une recette
          </button>
        }
      />

      <div className="toolbar">
        <label className="search-pill">
          <Search size={15} aria-hidden />
          <input
            type="search"
            placeholder="Chercher une recette, un ingrédient"
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
            aria-label="Chercher une recette, un ingrédient"
          />
        </label>
        <div className="toolbar-group" role="group" aria-label="Filtres">
          <button
            type="button"
            className={`filter-chip ${f.ready ? 'is-on' : ''}`}
            aria-pressed={f.ready}
            onClick={() => set({ ready: !f.ready })}
            title="Ne garder que les recettes dont tous les ingrédients sont en stock"
          >
            <CheckCircle2 size={14} aria-hidden /> Réalisables <span className="filter-count num">{ready}</span>
          </button>
          <button
            type="button"
            className={`filter-chip ${f.linked ? 'is-on' : ''}`}
            aria-pressed={f.linked}
            onClick={() => set({ linked: !f.linked })}
            title="Les recettes dont les quantités sont reliées au stock se planifient dans le calendrier"
          >
            <Link2 size={14} aria-hidden /> Reliées au stock <span className="filter-count num">{linked}</span>
          </button>
          {favorites > 0 && (
            <button
              type="button"
              className={`filter-chip ${f.status === 'favoris' ? 'is-on' : ''}`}
              aria-pressed={f.status === 'favoris'}
              onClick={() => set({ status: f.status === 'favoris' ? 'tous' : 'favoris' })}
            >
              <Heart size={14} aria-hidden /> Coups de cœur <span className="filter-count num">{favorites}</span>
            </button>
          )}
        </div>
        <div className="toolbar-end">
          <label className="select-pill">
            <span className="sr-only">Statut</span>
            <select value={f.status === 'favoris' ? 'tous' : f.status} onChange={(e) => set({ status: e.target.value as StatusFilter })}>
              {statusTabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id === 'tous' ? 'Tous les statuts' : t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="select-pill">
            <span className="sr-only">Trier</span>
            <select value={f.sort} onChange={(e) => set({ sort: e.target.value as Sort })}>
              <option value="titre">Par titre</option>
              <option value="recent">Ajout récent</option>
            </select>
          </label>
        </div>
      </div>

      <div className="category-row">
        <div className="seg-group" role="tablist" aria-label="Type de plat">
          <button
            type="button"
            role="tab"
            aria-selected={f.dish === 'tous'}
            className={`seg-pill ${f.dish === 'tous' ? 'on' : ''}`}
            onClick={() => set({ dish: 'tous' })}
          >
            Tous les plats
          </button>
          {dishes.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={f.dish === d}
              className={`seg-pill ${f.dish === d ? 'on' : ''}`}
              onClick={() => set({ dish: d })}
            >
              {d}
            </button>
          ))}
        </div>
        <span className="category-count num" aria-live="polite">
          {list.length} affichée{list.length > 1 ? 's' : ''}
        </span>
      </div>

      {list.length === 0 ? (
        <Empty
          title={f.ready ? 'Rien n’est réalisable avec le stock du jour' : 'Aucune recette ne correspond'}
          action={
            <div className="empty-actions">
              {f.ready && (
                <button type="button" className="secondary-button" onClick={() => set({ ready: false })}>
                  Voir toutes les recettes
                </button>
              )}
              <button type="button" className="secondary-button" onClick={() => setF(DEFAULTS)}>
                Tout afficher
              </button>
              <button type="button" className="secondary-button" onClick={() => app.goTo('stock')}>
                Ouvrir la liste de courses
              </button>
            </div>
          }
        >
          {f.ready ? `${oneAway} recette${oneAway > 1 ? 's ne manquent' : ' ne manque'} que d’un produit. La liste de courses sait lesquels.` : undefined}
        </Empty>
      ) : (
        <ul className="card-grid">
          {list.map((r) => (
            <li key={r.id}>
              <RecipeCard
                r={r}
                kcal={isPlannable(r) ? portions.get(r.id)?.nutrients.kcal : undefined}
                missing={missingCount(r, app.stock)}
                showReady={!f.ready}
                onOpen={() => openRecipe(r.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecipeCard({ r, kcal, missing, showReady, onOpen }: { r: Recipe; kcal?: number; missing?: number; showReady: boolean; onOpen: () => void }) {
  const meta =
    r.origin === 'assemblage'
      ? `Repas assemblé · ${r.parts?.length ?? 0} fiche${(r.parts?.length ?? 0) > 1 ? 's' : ''}`
      : [r.dish, sourceLabel(r.source)].filter(Boolean).join(' · ');
  const state = missing === undefined ? 'à relier au stock' : missing === 0 ? 'prêt' : `il manque ${missing} produit${missing > 1 ? 's' : ''}`;
  return (
    <button type="button" className="recipe-card" onClick={onOpen} aria-label={`Ouvrir la fiche de ${r.name}`}>
      <Cover recipe={r} />
      <span className="card-info">
        <span className="card-top">
          <b>{r.name}</b>
          {r.favorite && <Heart size={14} className="card-heart" aria-label="coup de cœur" />}
        </span>
        <small>{meta}</small>
        <span className="card-foot">
          <StatusPill status={r.status} />
          {kcal !== undefined && (
            <span className="card-kcal num" title="Par repas, estimation">
              {Math.round(kcal)} kcal
            </span>
          )}
          {(missing !== 0 || showReady) && <span className={`card-state ${missing === 0 ? 'is-ready' : ''}`}>{state}</span>}
        </span>
      </span>
    </button>
  );
}
