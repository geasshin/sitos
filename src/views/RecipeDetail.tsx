import { useState } from 'react';
import { ArrowLeft, CalendarPlus, Check, ChefHat, ExternalLink, Link2, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context';
import { addDays, formatShort } from '../domain/dates';
import { nextSlot, planRecipe } from '../domain/plan';
import { amount, splitAmount } from '../domain/stock';
import { isPlannable, portionsOf, type Recipe } from '../domain/types';
import { Cover, HeartToggle, STATUS_LABEL, STATUSES, Stars, isUrl, sourceLabel } from '../components/recipe';
import { Empty, Panel, PanelLink } from '../components/ui';
import { CookMode } from '../components/CookMode';
import { LinkIngredients } from '../components/LinkIngredients';
import { BalanceRows } from '../components/Balance';
import { assessDay } from '../domain/balance';
import { mealTargets } from '../domain/targets';

export function RecipeDetail({ id }: { id: string }) {
  const app = useApp();
  const { data, store, today } = app;
  const r = app.recipe(id);
  if (!r) {
    return (
      <div className="page">
        <Empty
          title="Recette introuvable"
          action={
            <button type="button" className="secondary-button" onClick={() => app.goTo('recipes')}>
              Retour aux recettes
            </button>
          }
        />
      </div>
    );
  }
  const [cooking, setCooking] = useState(false);
  const [linking, setLinking] = useState(false);
  const patch = (p: Partial<Recipe>) => store.update('recipes', (list) => list.map((x) => (x.id === r.id ? { ...x, ...p } : x)));
  const planned = data.plan.entries.filter((e) => e.kind === 'cook' && e.recipeId === r.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const usedIn = data.recipes.filter((x) => x.parts?.includes(r.id));
  const ingredientsText = r.ingredientsText ?? [];
  const facts: [string, React.ReactNode][] = [
    ['Type', r.origin === 'assemblage' ? 'Repas assemblé' : r.dish],
    ...(r.source
      ? [
          [
            'Source',
            isUrl(r.source) ? (
              <a href={r.source} target="_blank" rel="noreferrer">
                {sourceLabel(r.source)} <ExternalLink size={12} aria-hidden />
              </a>
            ) : (
              r.source
            ),
          ] as [string, React.ReactNode],
        ]
      : []),
    ...(r.prepTime ? [['Préparation', r.prepTime] as [string, React.ReactNode]] : []),
    ...(r.servings ? [['Portions', r.servings] as [string, React.ReactNode]] : []),
    ...(isPlannable(r) ? [['Repas', `${portionsOf(r)} · se garde ${r.fridgeDays ?? 3} j au frigo`] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="detail-page">
      <div className="detail-bar">
        <button type="button" className="back-button" onClick={app.back}>
          <ArrowLeft size={16} aria-hidden /> Recettes
        </button>
        <div className="detail-actions">
          {r.steps?.length > 0 && (
            <button type="button" className="secondary-button" onClick={() => setCooking(true)}>
              <ChefHat size={15} aria-hidden /> Mode cuisine
            </button>
          )}
          <button type="button" className="secondary-button" onClick={() => app.editRecipe(r.id)}>
            <Pencil size={15} aria-hidden /> Modifier
          </button>
          <button
            type="button"
            className="icon-action-button danger"
            aria-label="Supprimer la recette"
            title="Supprimer la recette"
            onClick={() => {
              const inPlan = planned.length ? ` Elle est prévue ${planned.length} fois au calendrier : ces jours seront vidés.` : '';
              if (!window.confirm(`Supprimer « ${r.name} » de ta bibliothèque ?${inPlan}`)) return;
              store.update('plan', (p) => ({
                ...p,
                entries: p.entries.filter((e) => e.recipeId !== r.id && !(e.kind === 'leftover' && planned.some((c) => c.id === e.batchId))),
              }));
              store.update('recipes', (list) => list.filter((x) => x.id !== r.id));
              app.goTo('recipes');
            }}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      </div>

      {cooking && <CookMode recipe={r} onClose={() => setCooking(false)} />}
      {linking && <LinkIngredients recipe={r} onClose={() => setLinking(false)} />}

      <div className="detail-layout">
        <div className="detail-side">
          <Cover recipe={r} ratio="photo" className="detail-poster" />
          <div className="verdict">
            <div className="verdict-row">
              <Stars value={r.rating} onChange={(v) => patch({ rating: v })} />
              <HeartToggle on={r.favorite} onChange={(v) => patch({ favorite: v })} />
            </div>
            <div className="seg-group" role="radiogroup" aria-label="Statut">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={r.status === s}
                  className={`seg-pill ${r.status === s ? 'on' : ''}`}
                  onClick={() => patch({ status: s })}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          {ingredientsText.length > 0 && (
            <Panel title="Ingrédients" className="detail-ingredients">
              <ul>
                {ingredientsText.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="detail-main">
          <h1 className="detail-title">{r.name}</h1>
          <dl className="facts-grid">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          {r.origin === 'assemblage' && r.parts && (
            <p className="assembly">
              Ce repas assemble tes fiches :{' '}
              {r.parts.map((pid, i) => (
                <span key={pid}>
                  {i > 0 && ', '}
                  <button type="button" className="link" onClick={() => app.openRecipe(pid)}>
                    {app.recipe(pid)?.name ?? pid}
                  </button>
                </span>
              ))}
              .
            </p>
          )}
          {usedIn.length > 0 && (
            <p className="assembly">
              Utilisée dans :{' '}
              {usedIn.map((u, i) => (
                <span key={u.id}>
                  {i > 0 && ', '}
                  <button type="button" className="link" onClick={() => app.openRecipe(u.id)}>
                    {u.name}
                  </button>
                </span>
              ))}
              .
            </p>
          )}

          {r.steps?.length > 0 && (
            <Panel title="Préparation" meta={`${r.steps.length} étape${r.steps.length > 1 ? 's' : ''}${r.prepTime ? ` · ${r.prepTime}` : ''}`}>
              <ol className="steps">
                {r.steps.map((s, i) => (
                  <li key={i}>
                    <span className="step-num num">{String(i + 1).padStart(2, '0')}</span>
                    <p>{s}</p>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          {r.note && (
            <Panel title="Notes" className="notes-box">
              {r.note.split('\n').map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </Panel>
          )}

          <MenuBlock r={r} planned={planned.map((p) => p.date)} today={today} onLink={() => setLinking(true)} />
        </div>
      </div>
    </div>
  );
}

function MenuBlock({ r, planned, today, onLink }: { r: Recipe; planned: string[]; today: string; onLink: () => void }) {
  const app = useApp();
  const { data, store } = app;
  const ingredientsTextCount = r.ingredientsText?.length ?? 0;
  const [date, setDate] = useState(() => nextSlot(data.plan.entries, addDays(today, 1)));
  // Sans nombre de repas sur la fiche, on part du réglage « repas par cuisson ».
  const [portions, setPortions] = useState(r.portions ?? data.settings.mealsPerCook ?? 2);
  const [done, setDone] = useState<string | null>(null);

  const planForm = (
    <>
      <form
        className="plan-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date || date < today) return;
          store.update('plan', (pl) => ({ ...pl, entries: planRecipe(pl.entries, date, r, portions) }));
          setDone(date);
        }}
      >
        <label className="field">
          <span>Cuisiner le</span>
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <div className="field">
          <span id={`rep-${r.id}`}>Repas</span>
          <div className="stepper" role="group" aria-labelledby={`rep-${r.id}`}>
            <button type="button" className="icon-button" onClick={() => setPortions((x) => Math.max(1, x - 1))} aria-label="Un repas de moins">
              <Minus size={15} aria-hidden />
            </button>
            <span className="num">{portions}</span>
            <button type="button" className="icon-button" onClick={() => setPortions((x) => Math.min(6, x + 1))} aria-label="Un repas de plus">
              <Plus size={15} aria-hidden />
            </button>
          </div>
        </div>
        <button type="submit" className="primary-button">
          <CalendarPlus size={15} aria-hidden /> Planifier
        </button>
      </form>
      {done && (
        <p className="small" role="status">
          Ajoutée le {formatShort(done)}. Si le jour était pris, la suite du plan a glissé.{' '}
          <PanelLink onClick={() => app.goTo('calendar', done)}>Voir la semaine</PanelLink>
        </p>
      )}
    </>
  );

  const planPanel = (
    <Panel
      title="Planifier"
      meta={planned.length ? `Prévue ${planned.map((d) => `le ${formatShort(d)}`).join(', ')}` : 'Pas prévue au calendrier'}
      className="plan-panel"
    >
      {planForm}
    </Panel>
  );

  if (!isPlannable(r)) {
    return (
      <>
        <Panel title="Reliée au stock" meta="Pas encore : la fiche ne compte ni les calories ni les courses.">
          <p className="hint">
            {ingredientsTextCount > 0 ? 'La relier prend une minute, l’app propose les correspondances.' : 'Ajoute les ingrédients depuis « Modifier ».'}
          </p>
          {ingredientsTextCount > 0 && (
            <div>
              <button type="button" className="secondary-button is-sm" onClick={onLink}>
                <Link2 size={14} aria-hidden /> Relier les {ingredientsTextCount} ingrédients
              </button>
            </div>
          )}
        </Panel>
        {planPanel}
      </>
    );
  }
  const p = app.portions.get(r.id)!;
  return (
    <>
      {planPanel}
      <div className="panel-grid">
        <Panel title="Par repas" meta="Face à un repas principal">
          <BalanceRows rows={assessDay(p.nutrients, p.plantG, mealTargets(app.targets)).rows} compact />
        </Panel>
        <Panel title="Sort du stock" meta={`Pour ${portionsOf(r)} repas`}>
          <ul className="ingredients">
            {(r.ingredients ?? []).map((ing, i) => {
              const food = app.foods.get(ing.foodId);
              const have = app.stock.get(ing.foodId)?.remaining ?? 0;
              const a = splitAmount(food, ing.qty);
              const ok = have + 1e-6 >= ing.qty;
              return (
                <li key={i} className={ok ? '' : 'is-missing'}>
                  <span className="qty num">{a.qty}</span>
                  <span>
                    {a.label}
                    {ing.note && <span className="muted"> · {ing.note}</span>}
                  </span>
                  <span className="stock-state">
                    {ok ? <Check size={14} aria-label="en stock" /> : have > 0 ? `reste ${amount(food, have)}` : 'pas en stock'}
                  </span>
                </li>
              );
            })}
          </ul>
          {r.extras && r.extras.length > 0 && <p className="hint">Aussi, non comptés : {r.extras.join(' · ')}</p>}
          {r.planNote && <p className="note">{r.planNote}</p>}
        </Panel>
      </div>
    </>
  );
}
