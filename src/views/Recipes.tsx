import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Clock, CookingPot, Heart, Link2, Plus, Search, SearchX, X } from 'lucide-react';
import { useApp } from '../context';
import { DISHES, isPlannable, type Recipe, type RecipeStatus } from '../domain/types';
import { Cover, STATUS_LABEL, StatusPill, sourceLabel } from '../components/recipe';
import { makeable, missingCount } from '../domain/recipes';
import './recipes-v3.css';

type StatusFilter = 'tous' | RecipeStatus | 'favoris';
type Sort = 'titre' | 'recent';
/** Pourquoi l’étagère est vide : chaque cause a sa phrase et son geste. */
type EmptyCause = 'bibliotheque' | 'recherche' | 'rayon' | 'realisable' | 'filtre';
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
const STATUSES: RecipeStatus[] = ['à découvrir', 'terminé', 'maîtrisée'];

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/['’]/g, ' ');

/** Les fiches viennent parfois avec des apostrophes droites : à l’écran, on compose. */
const typo = (s: string) => s.replace(/'/g, '’');

const fr = (v: number) => Math.round(v).toLocaleString('fr-FR');

const recettes = (n: number) => `${n} recette${n > 1 ? 's' : ''}`;

/**
 * Le temps d’une fiche tient parfois en une phrase entière. La carte n’en garde que la
 * première durée, le texte complet reste au survol et sur la fiche.
 */
function shortPrep(t?: string): string | undefined {
  if (!t) return undefined;
  const m = typo(t).match(/(\d+(?:[.,]\d+)?)\s*(h(?:eures?)?|min(?:utes?)?)\b(?:\s*(\d{1,2})\b)?/i);
  if (!m) return undefined;
  const [, n, unit, mins] = m;
  return /^h/i.test(unit) ? (mins ? `${n} h ${mins}` : `${n} h`) : `${n} min`;
}

/**
 * L’étagère des recettes : chaque fiche est un livre posé sur sa planche.
 * La barre du haut dit ce qu’on peut cuisiner maintenant ; dessous, la recherche,
 * les trois filtres utiles et les rayons par type de plat. Rien d’autre à ouvrir.
 */
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

  const total = data.recipes.length;
  const dishes = DISHES.filter((d) => data.recipes.some((r) => r.dish === d));
  const favorites = data.recipes.filter((r) => r.favorite).length;
  const linked = data.recipes.filter(isPlannable).length;
  const ready = data.recipes.filter((r) => makeable(r, app.stock)).length;
  const oneAway = data.recipes.filter((r) => missingCount(r, app.stock) === 1).length;
  const toTest = data.recipes.filter((r) => r.status === 'à découvrir').length;
  const pctReady = total > 0 ? Math.round((ready / total) * 100) : 0;

  const { list, counts, matched } = useMemo(() => {
    const q = norm(f.q.trim());
    const base = data.recipes.filter((r) => {
      if (f.status === 'favoris' ? !r.favorite : f.status !== 'tous' && r.status !== f.status) return false;
      if (f.linked && !isPlannable(r)) return false;
      if (f.ready && !makeable(r, app.stock)) return false;
      if (q) {
        const hay = norm([r.name, r.source ?? '', ...(r.ingredientsText ?? []), r.note ?? ''].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const counts = new Map<string, number>();
    for (const r of base) counts.set(r.dish, (counts.get(r.dish) ?? 0) + 1);
    const list = base
      .filter((r) => f.dish === 'tous' || r.dish === f.dish)
      .sort((a, b) => (f.sort === 'recent' ? (b.createdAt ?? '').localeCompare(a.createdAt ?? '') : a.name.localeCompare(b.name, 'fr')));
    return { list, counts, matched: base.length };
  }, [data.recipes, f, app.stock]);

  const statusOptions: { id: StatusFilter; label: string; n: number }[] = [
    { id: 'tous', label: 'Tous les statuts', n: total },
    ...STATUSES.map((s) => ({ id: s as StatusFilter, label: STATUS_LABEL[s], n: data.recipes.filter((r) => r.status === s).length })).filter(
      (o) => o.n > 0,
    ),
  ];

  const dirty =
    f.q.trim() !== DEFAULTS.q ||
    f.status !== DEFAULTS.status ||
    f.dish !== DEFAULTS.dish ||
    f.linked !== DEFAULTS.linked ||
    f.ready !== DEFAULTS.ready ||
    f.sort !== DEFAULTS.sort;

  const emptyCause: EmptyCause =
    total === 0
      ? 'bibliotheque'
      : f.q.trim() !== ''
        ? 'recherche'
        : f.dish !== 'tous'
          ? 'rayon'
          : f.ready && f.status === 'tous' && !f.linked
            ? 'realisable'
            : 'filtre';

  return (
    <div className="s-page rc-page">
      <header className="s-pagehead">
        <div>
          <h1 className="s-title">Mes recettes</h1>
          {total > 0 && (
            <p className="s-subtitle">
              {`${recettes(total)} dans la bibliothèque · ${
                ready === 0 ? 'aucune prête avec ton stock' : `${ready} prête${ready > 1 ? 's' : ''} avec ton stock`
              }`}
            </p>
          )}
        </div>
        {total > 0 && (
          <div className="s-pagehead-actions">
            <button type="button" className="s-btn is-primary" onClick={() => editRecipe('nouvelle')}>
              <Plus size={17} aria-hidden /> Créer une recette
            </button>
          </div>
        )}
      </header>

      {total > 0 && (
        <>
          <section className="rc-board" aria-label="La bibliothèque en un coup d’œil">
            <div className="rc-board-cell">
              <span className="rc-board-num num">{total}</span>
              <span className="rc-board-label">{total > 1 ? 'recettes' : 'recette'}</span>
            </div>
            <div className="rc-board-cell is-mint">
              <span className="rc-board-num num">{ready}</span>
              <span className="rc-board-label">prêtes avec ton stock</span>
            </div>
            <div className="rc-board-cell is-butter">
              <span className="rc-board-num num">{toTest}</span>
              <span className="rc-board-label">à tester</span>
            </div>
            {favorites > 0 && (
              <div className="rc-board-cell is-berry">
                <span className="rc-board-num num">{favorites}</span>
                <span className="rc-board-label">coup{favorites > 1 ? 's' : ''} de cœur</span>
              </div>
            )}
            <div className="rc-board-gauge">
              <span className="rc-board-gauge-text num">{pctReady} % des recettes sont prêtes avec ton stock</span>
              <span className="s-jauge">
                <span style={{ width: `${pctReady}%` }} />
              </span>
            </div>
          </section>

          <section className="rc-tools" aria-label="Chercher et filtrer">
            <div className="rc-search">
              <Search size={17} aria-hidden />
              <input
                type="search"
                placeholder="Chercher une recette, un ingrédient"
                value={f.q}
                onChange={(e) => set({ q: e.target.value })}
                aria-label="Chercher une recette, un ingrédient"
              />
              {f.q !== '' && (
                <button type="button" className="rc-search-clear" onClick={() => set({ q: '' })} aria-label="Effacer la recherche">
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
            <div className="rc-selects">
              <label className="rc-select">
                <span className="sr-only">Statut</span>
                <select value={f.status} onChange={(e) => set({ status: e.target.value as StatusFilter })}>
                  {statusOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} · {t.n}
                    </option>
                  ))}
                  {f.status === 'favoris' && <option value="favoris">Coups de cœur · {favorites}</option>}
                </select>
                <ChevronDown size={15} className="rc-select-chev" aria-hidden />
              </label>
              <label className="rc-select">
                <span className="sr-only">Trier</span>
                <select value={f.sort} onChange={(e) => set({ sort: e.target.value as Sort })}>
                  <option value="titre">Titre, de A à Z</option>
                  <option value="recent">Ajout, du plus récent</option>
                </select>
                <ChevronDown size={15} className="rc-select-chev" aria-hidden />
              </label>
            </div>

            <div className="rc-filters" role="group" aria-label="Filtres rapides">
              <button
                type="button"
                className={`rc-filter ${f.ready ? 'is-on is-mint' : ''}`}
                aria-pressed={f.ready}
                onClick={() => set({ ready: !f.ready })}
                title="Ne garder que les recettes dont tous les ingrédients sont en stock"
              >
                <CheckCircle2 size={15} aria-hidden /> Prêtes avec ton stock <span className="rc-filter-count num">{ready}</span>
              </button>
              <button
                type="button"
                className={`rc-filter ${f.linked ? 'is-on is-sky' : ''}`}
                aria-pressed={f.linked}
                onClick={() => set({ linked: !f.linked })}
                title="Les recettes dont les ingrédients sont reliés au stock, donc prêtes à planifier dans la semaine"
              >
                <Link2 size={15} aria-hidden /> Reliées au stock <span className="rc-filter-count num">{linked}</span>
              </button>
              {favorites > 0 && (
                <button
                  type="button"
                  className={`rc-filter ${f.status === 'favoris' ? 'is-on is-berry' : ''}`}
                  aria-pressed={f.status === 'favoris'}
                  onClick={() => set({ status: f.status === 'favoris' ? 'tous' : 'favoris' })}
                >
                  <Heart size={15} aria-hidden /> Coups de cœur <span className="rc-filter-count num">{favorites}</span>
                </button>
              )}
            </div>
          </section>

          <div className="rc-index">
            <div className="rc-tabs" role="tablist" aria-label="Type de plat">
              <button
                type="button"
                role="tab"
                aria-selected={f.dish === 'tous'}
                className={`rc-tab ${f.dish === 'tous' ? 'is-on' : ''}`}
                onClick={() => set({ dish: 'tous' })}
              >
                Tous les plats <span className="rc-tab-count num">{matched}</span>
              </button>
              {dishes.map((d) => {
                const n = counts.get(d) ?? 0;
                return (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={f.dish === d}
                    className={`rc-tab ${f.dish === d ? 'is-on' : ''} ${n === 0 ? 'is-empty' : ''}`}
                    onClick={() => set({ dish: d })}
                  >
                    {d} <span className="rc-tab-count num">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {list.length === 0 ? (
        <RecipesEmpty
          cause={emptyCause}
          query={f.q.trim()}
          dish={f.dish}
          oneAway={oneAway}
          onCreate={() => editRecipe('nouvelle')}
          onClearQuery={() => set({ q: '' })}
          onClearFilters={() => setF(DEFAULTS)}
          onAllDishes={() => set({ dish: 'tous' })}
          onShowAll={() => set({ ready: false })}
          onStock={() => app.goTo('stock')}
        />
      ) : (
        <>
          <div className="rc-shelfhead">
            <div className="s-section-title">
              <h2>{f.dish === 'tous' ? 'Sur l’étagère' : `Rayon ${f.dish}`}</h2>
              <span className="s-meta" aria-live="polite">
                {recettes(list.length)} · {f.sort === 'titre' ? 'triées de A à Z' : 'triées du plus récent au plus ancien'}
              </span>
            </div>
            {dirty && (
              <button type="button" className="s-btn is-ghost is-sm" onClick={() => setF(DEFAULTS)}>
                <X size={14} aria-hidden /> Effacer les filtres
              </button>
            )}
          </div>

          <ul className="rc-shelf">
            {list.map((r) => (
              <li key={r.id}>
                <RecipeCard
                  r={r}
                  kcal={isPlannable(r) ? portions.get(r.id)?.nutrients.kcal : undefined}
                  missing={missingCount(r, app.stock)}
                  onOpen={() => openRecipe(r.id)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function RecipeCard({ r, kcal, missing, onOpen }: { r: Recipe; kcal?: number; missing?: number; onOpen: () => void }) {
  const name = typo(r.name);
  const source = sourceLabel(r.source);
  const parts = r.parts?.length ?? 0;
  const meta = typo(r.origin === 'assemblage' ? `Repas assemblé · ${parts} recette${parts > 1 ? 's' : ''}` : (source ?? 'Recette maison'));
  const time = shortPrep(r.prepTime);
  const state = missing === undefined ? 'à relier au stock' : missing === 0 ? 'prête à cuisiner' : `il manque ${missing} aliment${missing > 1 ? 's' : ''}`;
  const tone = missing === undefined ? 'is-lilac' : missing === 0 ? 'is-mint' : 'is-peach';
  return (
    <button
      type="button"
      className="rc-book"
      onClick={onOpen}
      aria-label={`Ouvrir la fiche de ${name}${r.favorite ? ', coup de cœur' : ''}`}
    >
      <span className="rc-shot-wrap">
        <Cover recipe={r} ratio="photo" className="rc-shot" />
        <span className="rc-dish">{r.dish}</span>
        {r.favorite && (
          <span className="rc-fav" aria-hidden>
            <Heart size={13} />
          </span>
        )}
      </span>
      <span className="rc-book-body">
        <b className="rc-book-name">{name}</b>
        <span className="rc-book-meta">{meta}</span>
        <span className="rc-book-facts">
          {kcal !== undefined && (
            <span className="rc-kcal num">
              {fr(kcal)} kcal par portion
            </span>
          )}
          {time ? (
            <span className="rc-time" title={typo(r.prepTime ?? '')} aria-label={`Temps de préparation : ${typo(r.prepTime ?? '')}`}>
              <Clock size={12} aria-hidden /> {time}
            </span>
          ) : (
            <span className="rc-time is-empty" title="Aucun temps de préparation n’est noté sur la fiche." aria-label="Durée non renseignée sur la fiche">
              <Clock size={12} aria-hidden /> Durée ?
            </span>
          )}
        </span>
        <span className="rc-book-foot">
          <StatusPill status={r.status} />
          <span
            className={`rc-state ${tone}`}
            title={missing === undefined ? 'Les ingrédients de cette recette ne sont pas encore reliés au stock.' : undefined}
          >
            {state}
          </span>
        </span>
      </span>
      <span className="rc-plank" aria-hidden />
    </button>
  );
}

function RecipesEmpty({
  cause,
  query,
  dish,
  oneAway,
  onCreate,
  onClearQuery,
  onClearFilters,
  onAllDishes,
  onShowAll,
  onStock,
}: {
  cause: EmptyCause;
  query: string;
  dish: string;
  oneAway: number;
  onCreate: () => void;
  onClearQuery: () => void;
  onClearFilters: () => void;
  onAllDishes: () => void;
  onShowAll: () => void;
  onStock: () => void;
}) {
  const shown = query.length > 40 ? `${query.slice(0, 40).trimEnd()}…` : query;
  const view = {
    bibliotheque: {
      icon: <CookingPot size={30} strokeWidth={1.6} />,
      title: 'Ta bibliothèque est vide',
      text: 'Aucune recette pour l’instant. Crée la première, elle prendra sa place sur l’étagère.',
      actions: (
        <button type="button" className="s-btn is-primary" onClick={onCreate}>
          <Plus size={16} aria-hidden /> Créer une recette
        </button>
      ),
    },
    recherche: {
      icon: <SearchX size={30} strokeWidth={1.6} />,
      title: `Aucune recette pour « ${typo(shown)} »`,
      text: 'La recherche regarde le nom, la source, les ingrédients et les notes. Essaie un autre mot, ou efface-la pour revoir l’étagère.',
      actions: (
        <>
          <button type="button" className="s-btn is-primary" onClick={onClearQuery}>
            <X size={16} aria-hidden /> Effacer la recherche
          </button>
          <button type="button" className="s-btn" onClick={onClearFilters}>
            Effacer les filtres
          </button>
        </>
      ),
    },
    rayon: {
      icon: <SearchX size={30} strokeWidth={1.6} />,
      title: `Le rayon ${dish} est vide`,
      text: 'Aucune recette de ce type ne passe les filtres en cours. Regarde les autres rayons, ou efface les filtres.',
      actions: (
        <>
          <button type="button" className="s-btn is-primary" onClick={onAllDishes}>
            Voir tous les plats
          </button>
          <button type="button" className="s-btn" onClick={onClearFilters}>
            Effacer les filtres
          </button>
        </>
      ),
    },
    realisable: {
      icon: <CookingPot size={30} strokeWidth={1.6} />,
      title: 'Aucune recette prête avec ton stock',
      text:
        oneAway > 1
          ? `${oneAway} recettes n’attendent qu’un seul aliment. La liste de courses, dans Mon frigo, dit lesquels.`
          : oneAway === 1
            ? 'Une recette n’attend qu’un seul aliment. La liste de courses, dans Mon frigo, dit lequel.'
            : 'Ton stock ne couvre aucune recette entière. Saisis un achat dans Mon frigo pour en débloquer une.',
      actions: (
        <>
          <button type="button" className="s-btn is-primary" onClick={onShowAll}>
            Voir toutes les recettes
          </button>
          <button type="button" className="s-btn" onClick={onStock}>
            Ouvrir Mon frigo
          </button>
        </>
      ),
    },
    filtre: {
      icon: <SearchX size={30} strokeWidth={1.6} />,
      title: 'Aucune recette avec ces filtres',
      text: 'Ces filtres écartent toutes les recettes. Efface-les pour revoir l’étagère.',
      actions: (
        <button type="button" className="s-btn is-primary" onClick={onClearFilters}>
          <X size={16} aria-hidden /> Effacer les filtres
        </button>
      ),
    },
  }[cause];

  return (
    <div className="rc-empty">
      <span className="rc-empty-icon" aria-hidden>
        {view.icon}
      </span>
      <h2>{view.title}</h2>
      <p>{view.text}</p>
      <div className="rc-empty-actions">{view.actions}</div>
    </div>
  );
}
