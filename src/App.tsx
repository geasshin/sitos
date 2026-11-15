import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChartColumn, ChefHat, Package, RotateCcw, Settings, Sun } from 'lucide-react';
import { AppContext, useDerived, type Route, type View } from './context';
import { formatLong, todayISO } from './domain/dates';
import type { ISODate } from './domain/types';
import { useStore } from './store';
import { UpdateNotice } from './components/UpdateNotice';
import { applyTheme, isNative, openDataFolder } from './storage';
import logo from './assets/sitos-mark.png';
import { TodayView } from './views/Today';
import { CalendarView } from './views/Calendar';
import { StockView } from './views/Stock';
import { NutritionView } from './views/Nutrition';
import { RecipesView } from './views/Recipes';
import { RecipeDetail } from './views/RecipeDetail';
import { RecipeEditor } from './views/RecipeEditor';
import { WeightView } from './views/Weight';
import { SettingsView } from './views/Settings';
import { useUpdates } from './updates';

const NAV: { id: View; label: string; Icon: typeof Sun }[] = [
  { id: 'today', label: "Aujourd'hui", Icon: Sun },
  { id: 'calendar', label: 'Semaine', Icon: CalendarDays },
  { id: 'recipes', label: 'Recettes', Icon: ChefHat },
  { id: 'stock', label: 'Stock', Icon: Package },
  { id: 'nutrition', label: 'Nutrition', Icon: ChartColumn },
];

function readRoute(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const known = NAV.some((n) => n.id === parts[0]) || parts[0] === 'settings' || parts[0] === 'weight';
  const view = (known ? parts[0] : 'today') as View;
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

  if (store.error) {
    return (
      <div className="fatal">
        <h1 className="display-title">Sitos</h1>
        <p>{store.error}</p>
        {isNative ? (
          <p className="muted">
            Tes fichiers n’ont pas été modifiés.{' '}
            <button type="button" className="link" onClick={() => void openDataFolder()}>Ouvrir le dossier des données</button>
          </p>
        ) : (
          <p className="muted">Dans un terminal : <code>npm run dev</code></p>
        )}
      </div>
    );
  }
  if (!store.data) return <div className="loading" aria-busy="true">Chargement…</div>;
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
  const theme = data.settings.theme ?? 'system';
  useEffect(() => {
    void applyTheme(theme);
  }, [theme]);
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
  const urgent = derived.priorities.some((p) => p.daysLeft <= 2);
  const simulated = today !== todayISO();

  let page;
  if (route.view === 'recipes' && route.recipeId) {
    page = route.edit ? <RecipeEditor key={route.recipeId} id={route.recipeId} /> : <RecipeDetail key={route.recipeId} id={route.recipeId} />;
  } else {
    page = {
      today: <TodayView />,
      calendar: <CalendarView focusDate={focusDate} />,
      recipes: <RecipesView />,
      stock: <StockView />,
      nutrition: <NutritionView />,
      weight: <WeightView />,
      settings: <SettingsView />,
    }[route.view];
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="shell">
        <aside className="island" aria-label="Navigation">
          <div className="island-surface">
            <div className="brand">
              <span className="brand-mark is-logo" aria-hidden>
                <img src={logo} alt="" />
              </span>
              <span className="brand-name">Sitos</span>
            </div>
            <nav aria-label="Sections">
              {NAV.map(({ id, label, Icon }) => (
                <a
                  key={id}
                  href={`#/${id}`}
                  className={`nav-item ${route.view === id ? 'is-active' : ''}`}
                  aria-current={route.view === id ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    ctx.goTo(id);
                  }}
                >
                  <Icon size={19} strokeWidth={1.6} aria-hidden />
                  <span className="nav-label">{label}</span>
                  {id === 'recipes' && <span className="nav-count num">{data.recipes.length}</span>}
                  {id === 'stock' && alerts > 0 && (
                    <span
                      className={`nav-count num is-alert ${urgent ? 'is-urgent' : ''}`}
                      aria-label={`${alerts} produits à surveiller`}
                      title={`${alerts} produits à surveiller`}
                    >
                      {alerts}
                    </span>
                  )}
                </a>
              ))}
            </nav>
            <div className="island-bottom">
              <a
                href="#/settings"
                className={`nav-item ${route.view === 'settings' ? 'is-active' : ''}`}
                aria-current={route.view === 'settings' ? 'page' : undefined}
                title="Paramètres (⌘,)"
                onClick={(e) => {
                  e.preventDefault();
                  ctx.goTo('settings');
                }}
              >
                <Settings size={19} strokeWidth={1.6} aria-hidden />
                <span className="nav-label">Paramètres</span>
                {updates.phase === 'available' ? (
                  <span className="nav-dot" aria-label="Mise à jour disponible" title="Mise à jour disponible" />
                ) : (
                  <kbd className="nav-key">⌘,</kbd>
                )}
              </a>
            </div>
          </div>
        </aside>

        <main className="main">
          {(data.settings.demo || simulated) && (
            <div className="banner" role="note">
              {data.settings.demo && <span><strong>Données de démo.</strong> Ta vraie commande les remplacera.</span>}
              {simulated && <span><strong>Date simulée :</strong> {formatLong(today)}.</span>}
            </div>
          )}
          {store.saveState === 'erreur' && (
            <div className="banner is-error" role="alert">
              <span><strong>L’enregistrement a échoué.</strong> La dernière modification n’est pas encore sur le disque.</span>
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
