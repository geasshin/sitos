import { useState } from 'react';
import { ArrowLeft, CalendarPlus, Check, ExternalLink, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context';
import { addDays, formatShort } from '../domain/dates';
import { nextSlot, planRecipe } from '../domain/plan';
import { amount, splitAmount } from '../domain/stock';
import { isPlannable, portionsOf, type Recipe } from '../domain/types';
import { Cover, HeartToggle, STATUS_LABEL, STATUSES, Stars, isUrl, sourceLabel } from '../components/recipe';
import { Empty, NutrientRows } from '../components/ui';

export function RecipeDetail({ id }: { id: string }) {
  const app = useApp();
  const { data, store, today } = app;
  const r = app.recipe(id);
  if (!r) {
    return (
      <div className="page">
        <Empty title="Recette introuvable" action={<button type="button" className="secondary-button" onClick={() => app.goTo('recipes')}>Retour aux recettes</button>} />
      </div>
    );
  }
  const patch = (p: Partial<Recipe>) => store.update('recipes', (list) => list.map((x) => (x.id === r.id ? { ...x, ...p } : x)));
  const planned = data.plan.entries.filter((e) => e.kind === 'cook' && e.recipeId === r.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const usedIn = data.recipes.filter((x) => x.parts?.includes(r.id));
  const ingredientsText = r.ingredientsText ?? [];
  const facts: [string, React.ReactNode][] = [
    ['Type', r.origin === 'assemblage' ? 'Repas assemblé' : r.dish],
    ...(r.source ? [['Source', isUrl(r.source) ? <a href={r.source} target="_blank" rel="noreferrer">{sourceLabel(r.source)} <ExternalLink size={12} aria-hidden /></a> : r.source] as [string, React.ReactNode]] : []),
    ...(r.prepTime ? [['Préparation', r.prepTime] as [string, React.ReactNode]] : []),
    ...(r.servings ? [['Portions', r.servings] as [string, React.ReactNode]] : []),
    ...(isPlannable(r) ? [['Repas', `${portionsOf(r)} · se garde ${r.fridgeDays ?? 3} j au frigo`] as [string, React.ReactNode]] : []),
    ['Étapes', String(r.steps?.length ?? 0)],
  ];

  return (
    <div className="detail-page">
      <div className="detail-bar">
        <button type="button" className="back-button" onClick={app.back}>
          <ArrowLeft size={16} aria-hidden /> Recettes
        </button>
        <div className="detail-actions">
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
              store.update('plan', (p) => ({ ...p, entries: p.entries.filter((e) => e.recipeId !== r.id && !(e.kind === 'leftover' && planned.some((c) => c.id === e.batchId))) }));
              store.update('recipes', (list) => list.filter((x) => x.id !== r.id));
              app.goTo('recipes');
            }}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      </div>

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
                <button key={s} type="button" role="radio" aria-checked={r.status === s} className={`seg-pill ${r.status === s ? 'on' : ''}`} onClick={() => patch({ status: s })}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
          {ingredientsText.length > 0 && (
            <section className="detail-ingredients">
              <h2 className="section-label">Ingrédients</h2>
              <ul>
                {ingredientsText.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </section>
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
                  <button type="button" className="link" onClick={() => app.openRecipe(pid)}>{app.recipe(pid)?.name ?? pid}</button>
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
                  <button type="button" className="link" onClick={() => app.openRecipe(u.id)}>{u.name}</button>
                </span>
              ))}
              .
            </p>
          )}

          {r.steps?.length > 0 && (
            <ol className="steps">
              {r.steps.map((s, i) => (
                <li key={i}>
                  <span className="step-num num">{String(i + 1).padStart(2, '0')}</span>
                  <p>{s}</p>
                </li>
              ))}
            </ol>
          )}

          {r.note && (
            <section className="notes-box">
              <h2 className="section-label">Notes</h2>
              {r.note.split('\n').map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </section>
          )}

          <MenuBlock r={r} planned={planned.map((p) => p.date)} today={today} />
        </div>
      </div>
    </div>
  );
}

function MenuBlock({ r, planned, today }: { r: Recipe; planned: string[]; today: string }) {
  const app = useApp();
  const { data, store } = app;
  const [date, setDate] = useState(() => nextSlot(data.plan.entries, addDays(today, 1)));
  const [portions, setPortions] = useState(portionsOf(r));
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
            <button type="button" className="icon-button" onClick={() => setPortions((x) => Math.max(1, x - 1))} aria-label="Un repas de moins"><Minus size={15} aria-hidden /></button>
            <span className="num">{portions}</span>
            <button type="button" className="icon-button" onClick={() => setPortions((x) => Math.min(6, x + 1))} aria-label="Un repas de plus"><Plus size={15} aria-hidden /></button>
          </div>
        </div>
        <button type="submit" className="primary-button">
          <CalendarPlus size={15} aria-hidden /> Planifier
        </button>
      </form>
      {done && (
        <p className="small" role="status">
          Ajoutée le {formatShort(done)}. Si le jour était pris, la suite du plan a glissé.{' '}
          <button type="button" className="link" onClick={() => app.goTo('calendar', done)}>Voir le calendrier</button>
        </p>
      )}
    </>
  );

  if (!isPlannable(r)) {
    return (
      <section className="menu-box">
        <h2 className="section-label">Dans tes menus</h2>
        <p className="hint">Pas de quantités chiffrées : au calendrier, tu ajoutes les ingrédients de ce repas, et ils sortent du stock une fois coché.</p>
        {planned.length > 0 && <p className="small">Prévue {planned.map((d) => `le ${formatShort(d)}`).join(', ')}.</p>}
        {planForm}
      </section>
    );
  }
  const p = app.portions.get(r.id)!;
  return (
    <section className="menu-box">
      <h2 className="section-label">Dans tes menus</h2>
      <div className="menu-grid">
        <div>
          <h3 className="mini-title">Par repas</h3>
          <NutrientRows n={p.nutrients} plantG={p.plantG} settings={data.settings} compact />
        </div>
        <div>
          <h3 className="mini-title">Ce qui sort du stock, pour {portionsOf(r)} repas</h3>
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
                  <span className="stock-state">{ok ? <Check size={14} aria-label="en stock" /> : have > 0 ? `reste ${amount(food, have)}` : 'pas en stock'}</span>
                </li>
              );
            })}
          </ul>
          {r.extras && r.extras.length > 0 && <p className="small muted">Aussi, non comptés : {r.extras.join(' · ')}</p>}
        </div>
      </div>
      {r.planNote && <p className="note">{r.planNote}</p>}
      <p className="small">
        {planned.length ? <>Prévue {planned.map((d) => `le ${formatShort(d)}`).join(', ')}.</> : <span className="muted">Pas prévue au calendrier.</span>}
      </p>

      {planForm}
    </section>
  );
}
