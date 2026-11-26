import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ChartColumn, ChefHat, ListChecks, Package, RotateCcw, Settings as SettingsIcon } from 'lucide-react';
import { AppContext, useDerived, type Route, type View } from './context';
import { todayISO } from './domain/dates';
import { dayNutrition } from './domain/nutrition';
import type { ISODate } from './domain/types';
import { useStore } from './store';
import { UpdateNotice } from './components/UpdateNotice';
import { Welcome } from './components/Welcome';
import { applyTheme, isNative, openDataFolder } from './storage';
import { WeekView } from './views/Week';
import { StockView } from './views/Stock';
import { NutritionView } from './views/Nutrition';
import { RecipesView } from './views/Recipes';
import { RecipeDetail } from './views/RecipeDetail';
import { RecipeEditor } from './views/RecipeEditor';
import { WeightView } from './views/Weight';
import { SettingsView } from './views/Settings';
import { useUpdates } from './updates';
import markUrl from './assets/marque.svg';

type NavId = 'week' | 'recipes' | 'stock' | 'nutrition';

const NAV: { id: NavId; label: string; Icon: typeof ListChecks }[] = [
  { id: 'week', label: 'Ma semaine', Icon: ListChecks },
  { id: 'recipes', label: 'Recettes', Icon: ChefHat },
  { id: 'stock', label: 'Mon frigo', Icon: Package },
  { id: 'nutrition', label: 'Bilan', Icon: ChartColumn },
];

const LEGACY: Record<string, View> = { today: 'week', calendar: 'week' };

function readRoute(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const raw = LEGACY[parts[0]] ?? parts[0];
  const known = NAV.some((n) => n.id === raw) || raw === 'settings' || raw === 'weight';
  const view = (known ? raw : 'week') as View;
  if (view === 'recipes' && parts[1]) return { view, recipeId: parts[1], edit: parts[2] === 'modifier' || parts[1] === 'nouvelle' };
  return { view };
}

function hashOf(r: Route): string {
  if (r.view === 'recipes' && r.recipeId) return `#/recipes/${encodeURIComponent(r.recipeId)}${r.edit && r.recipeId !== 'nouvelle' ? '/modifier' : ''}`;
  return `#/${r.view}`;
}

/** ?jour=2026-11-20 simule une autre date (utile pour vérifier le plan). */
function readToday(): ISODate {
  const p = new URLSearchParams(window.location.search).get('jour');
  return p && /^\d{4}-\d{2}-\d{2}$/.test(p) ? p : todayISO();
}

export function App() {
  const store = useStore();
  const [route, setRoute] = useState<Route>(readRoute);
  const [focusDate, setFocusDate] = useState<ISODate | undefined>();
  const today = useMemo(readToday, []);
  const theme = store.data?.settings.theme ?? 'system';
  // Le thème choisi s’applique dès la bienvenue, pas seulement une fois la coque montée.
  useEffect(() => {
    void applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const navigate = useCallback((r: Route) => {
    const h = hashOf(r);
    if (window.location.hash !== h) window.location.hash = h;
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);

  // La fenêtre de bienvenue se ferme en écrivant le réglage, comme le fait Paramètres.
  const startWelcome = useCallback(() => {
    store.update('settings', (s) => ({ ...s, welcomeSeen: true }));
  }, [store.update]);

  if (store.error) {
    return (
      <div className="fatal">
        <h1 className="display-title">Sitos</h1>
        <p>{store.error}</p>
        {isNative ? (
          <p className="muted">
            Tes fichiers n’ont pas été modifiés.{' '}
            <button type="button" className="link" onClick={() => void openDataFolder()}>
              Ouvrir le dossier des données
            </button>
          </p>
        ) : (
          <p className="muted">
            Dans un terminal : <code>npm run dev</code>
          </p>
        )}
      </div>
    );
  }
  if (!store.data) return <div className="loading" aria-busy="true">Chargement…</div>;
  // Un fichier existant sans `welcomeSeen` vient d’une version d’avant la fenêtre : elle s’ouvre.
  if (!store.data.settings.welcomeSeen) return <Welcome onStart={startWelcome} />;
  return <Loaded store={store} route={route} navigate={navigate} today={today} focusDate={focusDate} setFocusDate={setFocusDate} />;
}

function Loaded({
  store,
  route,
  navigate,
  today,
  focusDate,
  setFocusDate,
}: {
  store: ReturnType<typeof useStore>;
  route: Route;
  navigate: (r: Route) => void;
  today: ISODate;
  focusDate?: ISODate;
  setFocusDate: (d?: ISODate) => void;
}) {
  const data = store.data!;
  const derived = useDerived(data, today);
  const ctx = {
    ...derived,
    data,
    store,
    route,
    openRecipe: (id: string) => navigate({ view: 'recipes', recipeId: id }),
    editRecipe: (id: string) => navigate({ view: 'recipes', recipeId: id, edit: true }),
    goTo: (view: View, date?: ISODate) => {
      setFocusDate(date);
      navigate({ view });
    },
    back: () => (window.history.length > 1 ? window.history.back() : navigate({ view: 'recipes' })),
  };
  const updates = useUpdates();
  useEffect(() => {
    // ⌘, ouvre les paramètres, comme dans toute app Mac
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === ',') {
        e.preventDefault();
        navigate({ view: 'settings' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
  // « Annulé » ne s'affiche qu'après une modification, puis s'efface : pas de bouton permanent.
  const [undoVisible, setUndoVisible] = useState(false);
  useEffect(() => {
    if (!store.changeCount) return;
    setUndoVisible(true);
    const t = window.setTimeout(() => setUndoVisible(false), 7000);
    return () => window.clearTimeout(t);
  }, [store.changeCount]);

  const alerts = derived.priorities.length;

  let page;
  if (route.view === 'recipes' && route.recipeId) {
    page = route.edit ? <RecipeEditor key={route.recipeId} id={route.recipeId} /> : <RecipeDetail key={route.recipeId} id={route.recipeId} />;
  } else {
    const pages: Record<View, React.ReactElement> = {
      week: <WeekView />,
      today: <WeekView />,
      calendar: <WeekView />,
      recipes: <RecipesView />,
      stock: <StockView />,
      nutrition: <NutritionView focusDate={focusDate} />,
      weight: <WeightView />,
      settings: <SettingsView />,
    };
    page = pages[route.view];
  }

  const todayKcal = Math.round(dayNutrition(data, derived.foods, today).total.kcal);
  const pct = Math.min(100, Math.round((todayKcal / Math.max(1, derived.targets.kcal)) * 100));
  const active = (id: NavId) => route.view === id || (id === 'nutrition' && route.view === 'weight');

  return (
    <AppContext.Provider value={ctx}>
      <div className="s-shell">
        <header className="s-topbar">
          <a
            className="s-brand"
            href="#/week"
            onClick={(e) => {
              e.preventDefault();
              ctx.goTo('week');
            }}
          >
            <img src={markUrl} alt="" />
            <span className="s-brand-name">sitos</span>
          </a>

          <nav className="s-tabs" aria-label="Navigation principale">
            {NAV.map(({ id, label, Icon }) => (
              <a
                key={id}
                href={`#/${id}`}
                className={`s-tab ${active(id) ? 'is-on' : ''}`}
                aria-current={active(id) ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  ctx.goTo(id);
                }}
              >
                <Icon size={17} aria-hidden />
                {label}
                {id === 'stock' && alerts > 0 && (
                  <span className="s-chip is-berry num" aria-label={`${alerts} produits à surveiller`}>
                    {alerts}
                  </span>
                )}
              </a>
            ))}
          </nav>

          <div className="s-topbar-right">
            <span
              className="s-daygauge"
              title={`${todayKcal} kcal aujourd’hui, cible ${derived.targets.kcal}`}
              aria-label={`Aujourd’hui : ${todayKcal} kcal sur ${derived.targets.kcal}`}
            >
              <span className="s-ring" style={{ ['--pct' as string]: pct }} aria-hidden />
              <span className="s-daygauge-text num">{pct} %</span>
            </span>
            <a
              href="#/settings"
              className={`s-tab ${route.view === 'settings' ? 'is-on' : ''}`}
              aria-label="Paramètres"
              title="Paramètres (⌘,)"
              aria-current={route.view === 'settings' ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                ctx.goTo('settings');
              }}
            >
              <SettingsIcon size={17} aria-hidden />
              {updates.phase === 'available' && <span className="dock-dot" aria-label="Mise à jour disponible" />}
            </a>
          </div>
        </header>

        <main className="s-main" id="contenu">
          {data.settings.demo && (
            <div className="banner" role="note">
              <span>
                <strong>Données de démo.</strong> Ta vraie commande les remplacera.
              </span>
            </div>
          )}
          {store.saveState === 'erreur' && (
            <div className="banner is-error" role="alert">
              <span>
                <strong>L’enregistrement a échoué.</strong> La dernière modification n’est pas encore sur le disque.
              </span>
              <button type="button" className="link" onClick={store.retry}>
                Réessayer
              </button>
            </div>
          )}
          {page}
        </main>
      </div>

      {undoVisible && store.canUndo && (
        <div className="undo-chip" role="status">
          <RotateCcw size={14} aria-hidden />
          <span>Modifié</span>
          <button
            type="button"
            onClick={() => {
              store.undo();
              setUndoVisible(false);
            }}
          >
            Annuler <kbd>⌘Z</kbd>
          </button>
        </div>
      )}
      <UpdateNotice auto={data.settings.autoUpdate !== false} hidden={route.view === 'settings'} onOpenSettings={() => ctx.goTo('settings')} />
    </AppContext.Provider>
  );
}
