import { useRef, useState, type RefObject } from 'react';
import { ArrowLeft, CalendarPlus, Check, ChefHat, Clock, ExternalLink, Heart, Link2, Minus, Pencil, Plus, SearchX, Snowflake, Trash2, Users, Utensils } from 'lucide-react';
import { useApp } from '../context';
import { addDays, formatShort } from '../domain/dates';
import { nextSlot, planRecipe } from '../domain/plan';
import { amount, splitAmount } from '../domain/stock';
import { isPlannable, portionsOf, type PlanEntry, type Recipe, type RecipeStatus } from '../domain/types';
import { Cover, HeartToggle, STATUS_LABEL, STATUSES, Stars, isUrl, sourceLabel } from '../components/recipe';
import { CookMode } from '../components/CookMode';
import { LinkIngredients } from '../components/LinkIngredients';
import { BalanceRows } from '../components/Balance';
import { Sheet } from '../components/Sheet';
import { assessDay } from '../domain/balance';
import { mealTargets } from '../domain/targets';
import './recipes-v3.css';
import './detail-v3.css';

/** Les fiches viennent parfois avec des apostrophes droites : à l’écran, on compose. */
const typo = (s: string) => s.replace(/'/g, '’');

/** Le statut porte sa couleur : beurre tant qu’on découvre, menthe une fois la fiche tenue. */
const statusTone = (s: RecipeStatus) => (s === 'à découvrir' ? 'is-butter' : 'is-mint');

/**
 * La fiche d’une recette se lit comme une page de carnet : son ouverture (photo, titre,
 * faits, note), puis les gestes au fil du texte et, dans la marge, les ingrédients et le
 * signet qui planifie. Les commandes du domaine sont inchangées ; seule la mise en scène change.
 */
export function RecipeDetail({ id }: { id: string }) {
  const app = useApp();
  const { data, store, today } = app;
  const [cooking, setCooking] = useState(false);
  const [linking, setLinking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const stockHeading = useRef<HTMLHeadingElement>(null);
  const r = app.recipe(id);

  if (!r) {
    return (
      <div className="s-page rc-detail dt-page">
        <div className="rc-missing">
          <span className="rc-empty-icon" aria-hidden>
            <SearchX size={30} strokeWidth={1.6} />
          </span>
          <h1>Recette introuvable</h1>
          <p>Cette fiche n’est plus dans le carnet.</p>
          <button type="button" className="s-btn is-primary" onClick={() => app.goTo('recipes')}>
            Retour aux recettes
          </button>
        </div>
      </div>
    );
  }

  const patch = (p: Partial<Recipe>) => store.update('recipes', (list) => list.map((x) => (x.id === r.id ? { ...x, ...p } : x)));
  const title = typo(r.name);
  const planned = data.plan.entries.filter((e) => e.kind === 'cook' && e.recipeId === r.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const usedIn = data.recipes.filter((x) => x.parts?.includes(r.id));
  const ingredientsText = r.ingredientsText ?? [];
  const source = sourceLabel(r.source);
  const steps = r.steps ?? [];

  return (
    <div className="s-page rc-detail dt-page">
      <div className="rc-detailbar">
        <button type="button" className="s-btn is-ghost" onClick={app.back}>
          <ArrowLeft size={17} aria-hidden /> Recettes
        </button>
        <div className="rc-detailbar-actions">
          {steps.length > 0 && (
            <button type="button" className="s-btn" onClick={() => setCooking(true)}>
              <ChefHat size={16} aria-hidden /> Mode cuisine
            </button>
          )}
          <button type="button" className="s-btn" onClick={() => app.editRecipe(r.id)}>
            <Pencil size={16} aria-hidden /> Modifier
          </button>
          <button
            type="button"
            className="rc-iconbtn"
            aria-label="Supprimer la recette"
            title="Supprimer la recette"
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={17} aria-hidden />
          </button>
        </div>
      </div>

      {cooking && <CookMode recipe={r} onClose={() => setCooking(false)} />}
      {linking && (
        <LinkIngredients
          recipe={r}
          onClose={() => setLinking(false)}
          onApplied={() => stockHeading.current?.focus({ preventScroll: false })}
        />
      )}
      {deleting && <DeleteSheet recipe={r} planned={planned} onClose={() => setDeleting(false)} />}

      <header className="rc-hero dt-hero">
        <Cover recipe={r} ratio="square" className="rc-hero-shot" />
        <div className="rc-hero-body">
          <div className="rc-hero-kickers">
            <span className="s-chip is-ink">
              <Utensils size={13} aria-hidden /> {r.dish}
            </span>
            <span className={`s-chip ${statusTone(r.status)}`}>{STATUS_LABEL[r.status]}</span>
            {r.favorite && (
              <span className="s-chip is-berry">
                <Heart size={12} aria-hidden /> Coup de cœur
              </span>
            )}
            {source &&
              (isUrl(r.source) ? (
                <a className="s-chip is-sky rc-source" href={r.source} target="_blank" rel="noreferrer">
                  {typo(source)} <ExternalLink size={12} aria-hidden />
                </a>
              ) : (
                <span className="s-chip is-sky rc-source">{typo(source)}</span>
              ))}
          </div>

          <h1 className="rc-title">{title}</h1>
          {r.summary && <p className="rc-lede">{typo(r.summary)}</p>}

          {(r.prepTime || r.servings || isPlannable(r)) && (
            <dl className="rc-facts">
              {r.prepTime && (
                <div>
                  <dt>
                    <Clock size={12} aria-hidden /> Préparation
                  </dt>
                  <dd>{typo(r.prepTime)}</dd>
                </div>
              )}
              {(r.servings || isPlannable(r)) && (
                <div>
                  <dt>
                    <Users size={12} aria-hidden /> Portions
                  </dt>
                  <dd>{typo(r.servings ?? `${portionsOf(r)} repas`)}</dd>
                </div>
              )}
              {isPlannable(r) && (
                <div>
                  <dt>
                    <Snowflake size={12} aria-hidden /> Conservation
                  </dt>
                  <dd>{r.fridgeDays ?? 3} jours au frigo</dd>
                </div>
              )}
            </dl>
          )}

          <div className="rc-hero-controls">
            <div className="rc-note">
              <span className="rc-label">Ta note</span>
              <Stars value={r.rating} onChange={(v) => patch({ rating: v })} />
            </div>
            <span className="rc-vsep" aria-hidden />
            <div className="rc-note">
              <span className="rc-label" id={`statut-${r.id}`}>
                Statut
              </span>
              <div className="seg-group" role="radiogroup" aria-labelledby={`statut-${r.id}`}>
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
            <span className="rc-heart">
              <HeartToggle on={r.favorite} onChange={(v) => patch({ favorite: v })} />
            </span>
          </div>
        </div>
      </header>

      {r.origin === 'assemblage' && r.parts && (
        <p className="rc-callout">
          Ce repas assemble tes fiches :{' '}
          {r.parts.map((pid, i) => (
            <span key={pid}>
              {i > 0 && ', '}
              <button type="button" className="link" onClick={() => app.openRecipe(pid)}>
                {typo(app.recipe(pid)?.name ?? pid)}
              </button>
            </span>
          ))}
          .
        </p>
      )}
      {usedIn.length > 0 && (
        <p className="rc-callout is-mint">
          Utilisée dans :{' '}
          {usedIn.map((u, i) => (
            <span key={u.id}>
              {i > 0 && ', '}
              <button type="button" className="link" onClick={() => app.openRecipe(u.id)}>
                {typo(u.name)}
              </button>
            </span>
          ))}
          .
        </p>
      )}

      <div className="dt-body">
        <article className="dt-read">
          {steps.length > 0 ? (
            <section className="dt-section" aria-labelledby={`prep-${r.id}`}>
              <div className="s-section-title">
                <h2 id={`prep-${r.id}`}>Préparation</h2>
                <span className="s-meta">
                  {steps.length} étape{steps.length > 1 ? 's' : ''}
                  {r.prepTime ? ` · ${typo(r.prepTime)}` : ''}
                </span>
              </div>
              <ol className="dt-steps">
                {steps.map((s, i) => (
                  <li key={i}>
                    <span className="dt-step-num num" aria-hidden>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <p>{typo(s)}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <div className="rc-blank">
              <span className="rc-blank-icon" aria-hidden>
                <ChefHat size={22} />
              </span>
              <div className="rc-blank-body">
                <h2>Pas encore d’étapes</h2>
                <p>La fiche se cuisine à l’œil. Ajoute les gestes depuis « Modifier » pour les garder ici.</p>
              </div>
              <button type="button" className="s-btn is-sm" onClick={() => app.editRecipe(r.id)}>
                <Pencil size={14} aria-hidden /> Modifier
              </button>
            </div>
          )}

          {r.note && (
            <section className="dt-section" aria-labelledby={`notes-${r.id}`}>
              <div className="s-section-title">
                <h2 id={`notes-${r.id}`}>Notes</h2>
              </div>
              <div className="dt-notes">
                {r.note.split('\n').map((l, i) => (
                  <p key={i}>{typo(l)}</p>
                ))}
              </div>
            </section>
          )}

          {isPlannable(r) && <NutritionBlock r={r} />}
        </article>

        <aside className="dt-aside">
          <section className="dt-ingredients" aria-labelledby={`ing-${r.id}`}>
            <div className="s-section-title">
              <h2 id={`ing-${r.id}`}>Ingrédients</h2>
              <span className="s-meta">
                {ingredientsText.length > 0 ? `${ingredientsText.length} ligne${ingredientsText.length > 1 ? 's' : ''}` : 'Rien d’écrit'}
              </span>
            </div>
            {ingredientsText.length > 0 ? (
              <ul className="dt-inglist">
                {ingredientsText.map((l, i) => (
                  <li key={i}>{typo(l)}</li>
                ))}
              </ul>
            ) : (
              <p className="dt-aside-empty">Aucun ingrédient sur la fiche. Ajoute-les depuis « Modifier ».</p>
            )}
          </section>

          <PlanBlock r={r} planned={planned.map((p) => p.date)} today={today} />

          {!isPlannable(r) && <LinkStockCard count={ingredientsText.length} onLink={() => setLinking(true)} />}
          {isPlannable(r) && <StockCard r={r} headingRef={stockHeading} />}
        </aside>
      </div>
    </div>
  );
}

function LinkStockCard({ count, onLink }: { count: number; onLink: () => void }) {
  return (
    <section className="dt-note-card" aria-labelledby="dt-link-titre">
      <div className="s-section-title">
        <h2 id="dt-link-titre">Reliée au stock</h2>
        <span className="s-meta">Pas encore</span>
      </div>
      <p className="dt-hint">
        {count > 0
          ? 'La relier prend une minute, l’app propose les correspondances.'
          : 'Ajoute les ingrédients depuis « Modifier ».'}
      </p>
      {count > 0 && (
        <button type="button" className="s-btn is-sm is-mint dt-wide" onClick={onLink}>
          <Link2 size={14} aria-hidden /> Relier les {count} ingrédient{count > 1 ? 's' : ''}
        </button>
      )}
    </section>
  );
}

function PlanBlock({ r, planned, today }: { r: Recipe; planned: string[]; today: string }) {
  const app = useApp();
  const { data, store } = app;
  const [date, setDate] = useState(() => nextSlot(data.plan.entries, addDays(today, 1)));
  // Sans nombre de repas sur la fiche, on part du réglage « repas par cuisson ».
  const [portions, setPortions] = useState(r.portions ?? data.settings.mealsPerCook ?? 2);
  const [done, setDone] = useState<string | null>(null);
  const meta = planned.length ? `Prévue ${planned.map((d) => `le ${formatShort(d)}`).join(', ')}` : 'Pas encore prévue';

  return (
    <section className="dt-plan" aria-labelledby="dt-plan-titre">
      <div className="dt-plan-head">
        <h2 id="dt-plan-titre">Planifier</h2>
        <p className="dt-plan-meta">{meta}</p>
      </div>
      <form
        className="dt-planform"
        onSubmit={(e) => {
          e.preventDefault();
          if (!date || date < today) return;
          store.update('plan', (pl) => ({ ...pl, entries: planRecipe(pl.entries, date, r, portions) }));
          setDone(date);
        }}
      >
        <label className="dt-field">
          <span>Cuisiner le</span>
          <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <div className="dt-field">
          <span id={`rep-${r.id}`}>Portions</span>
          <div className="dt-stepper" role="group" aria-labelledby={`rep-${r.id}`}>
            <button type="button" onClick={() => setPortions((x) => Math.max(1, x - 1))} aria-label="Une portion de moins">
              <Minus size={15} aria-hidden />
            </button>
            <span className="num">{portions}</span>
            <button type="button" onClick={() => setPortions((x) => Math.min(6, x + 1))} aria-label="Une portion de plus">
              <Plus size={15} aria-hidden />
            </button>
          </div>
        </div>
        <button type="submit" className="s-btn is-primary dt-plan-submit">
          <CalendarPlus size={16} aria-hidden /> Planifier
        </button>
      </form>
      {done && (
        <p className="dt-done" role="status">
          Ajoutée le {formatShort(done)}. Si le jour était pris, la suite du plan a glissé.{' '}
          <button type="button" className="dt-link" onClick={() => app.goTo('week')}>
            Voir la semaine
          </button>
        </p>
      )}
    </section>
  );
}

function NutritionBlock({ r }: { r: Recipe }) {
  const app = useApp();
  const p = app.portions.get(r.id);
  if (!p) return null;
  return (
    <section className="dt-nutrition" aria-labelledby={`nut-${r.id}`}>
      <div className="s-section-title">
        <h2 id={`nut-${r.id}`}>Par portion</h2>
        <span className="s-meta">face à un repas principal</span>
      </div>
      <BalanceRows rows={assessDay(p.nutrients, p.plantG, mealTargets(app.targets)).rows} compact />
    </section>
  );
}

function StockCard({ r, headingRef }: { r: Recipe; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const app = useApp();
  return (
    <section className="dt-note-card" aria-labelledby="dt-stock-titre">
      <div className="s-section-title">
        <h2 id="dt-stock-titre" tabIndex={-1} ref={headingRef}>
          Sort du stock
        </h2>
        <span className="s-meta">Pour {portionsOf(r)} repas</span>
      </div>
      <ul className="dt-stock">
        {(r.ingredients ?? []).map((ing, i) => {
          const food = app.foods.get(ing.foodId);
          const have = app.stock.get(ing.foodId)?.remaining ?? 0;
          const a = splitAmount(food, ing.qty);
          const ok = have + 1e-6 >= ing.qty;
          return (
            <li key={i} className={ok ? '' : 'is-missing'}>
              <span className="dt-stock-qty num">{a.qty}</span>
              <span>
                {typo(a.label)}
                {ing.note && <span className="dt-muted"> · {typo(ing.note)}</span>}
              </span>
              <span className="dt-stock-state">
                {ok ? <Check size={14} aria-label="en stock" /> : have > 0 ? `reste ${amount(food, have)}` : 'pas en stock'}
              </span>
            </li>
          );
        })}
      </ul>
      {r.extras && r.extras.length > 0 && <p className="dt-hint">Aussi, non comptés : {typo(r.extras.join(' · '))}</p>}
      {r.planNote && <p className="dt-plan-note">{typo(r.planNote)}</p>}
    </section>
  );
}

/**
 * Supprimer une fiche est un geste destructeur : il passe par la même feuille que le reste,
 * jamais par une alerte du navigateur. Ce qui est retiré est annoncé avant.
 */
function DeleteSheet({ recipe, planned, onClose }: { recipe: Recipe; planned: PlanEntry[]; onClose: () => void }) {
  const app = useApp();
  const { store } = app;
  const batches = new Set(planned.map((p) => p.id));
  const affected = app.data.plan.entries.filter(
    (e) => e.recipeId === recipe.id || (e.kind === 'leftover' && batches.has(e.batchId ?? '')),
  );
  const dates = [...new Set(affected.map((e) => e.date))].sort();

  const remove = () => {
    store.update('plan', (p) => ({
      ...p,
      entries: p.entries.filter(
        (e) => e.recipeId !== recipe.id && !(e.kind === 'leftover' && batches.has(e.batchId ?? '')),
      ),
    }));
    store.update('recipes', (list) => list.filter((x) => x.id !== recipe.id));
    onClose();
    app.goTo('recipes');
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Supprimer « ${typo(recipe.name)} » ?`}
      subtitle="La fiche et ses ingrédients quittent la bibliothèque."
      size="sm"
      onSubmit={remove}
      footer={
        <>
          <span className="sheet-foot-gap" />
          <button type="button" className="s-btn is-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="s-btn dt-danger-btn" onClick={remove}>
            <Trash2 size={15} aria-hidden /> Supprimer la recette
          </button>
        </>
      }
    >
      <p className="dt-delete-lead">
        {dates.length === 0
          ? 'Aucun repas de la semaine ne la cite.'
          : dates.length === 1
            ? `Un repas de la semaine la cite : ${formatShort(dates[0])}.`
            : `Des repas de la semaine la citent : ${dates.map((d) => formatShort(d)).join(', ')}.`}
      </p>
      {dates.length > 0 && (
        <p className="dt-delete-plan">
          {dates.length === 1 ? 'Ce repas sera retiré du plan.' : 'Ces repas seront retirés du plan.'}
        </p>
      )}
    </Sheet>
  );
}
