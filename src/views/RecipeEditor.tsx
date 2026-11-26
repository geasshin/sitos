import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Check, ChevronDown, Clock, Link2, Snowflake, Sparkles, Users } from 'lucide-react';
import { useApp } from '../context';
import { DISHES, type Recipe, type RecipeStatus } from '../domain/types';
import { Cover, STATUS_LABEL, STATUSES, sourceLabel } from '../components/recipe';
import { newRecipeId } from '../domain/recipes';
import './recipe-editor-v3.css';

/** Une ligne par ingrédient ou par geste, les lignes vides ne comptent pas. */
const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);

/** Les fiches viennent parfois avec des apostrophes droites : à l’écran, on compose. */
const typo = (value: string) => value.replace(/'/g, '’');

const fr = (value: number) => value.toLocaleString('fr-FR');
const plural = (value: number, word: string) => `${fr(value)} ${word}${value > 1 ? 's' : ''}`;

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** L’aperçu attend que l’adresse se stabilise, sinon chaque touche lance une image cassée. */
function useDebounced<T>(value: T, delay = 320): T {
  const [slow, setSlow] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return slow;
}

type Tone = 'is-todo' | 'is-tested' | 'is-mastered';

const STATUS_TONE: Record<RecipeStatus, Tone> = {
  'à découvrir': 'is-todo',
  terminé: 'is-tested',
  maîtrisée: 'is-mastered',
};

interface FormState {
  name: string;
  dish: string;
  status: RecipeStatus;
  source: string;
  cover: string;
  prepTime: string;
  servings: string;
  fridgeDays: string;
  ingredients: string;
  steps: string;
  note: string;
}

interface FormError {
  field: 'name' | 'cover';
  message: string;
}

/**
 * L’éditeur de recette : quatre sections courtes plutôt qu’un mur de champs.
 * La fiche se remplit de haut en bas, l’aperçu suit la frappe à droite, et
 * l’enregistrement reste à portée en haut comme en bas. Les commandes du
 * domaine n’ont pas bougé : même identifiant, même store, mêmes champs.
 */
export function RecipeEditor({ id }: { id: string }) {
  const app = useApp();
  const { data, store } = app;
  const existing = id === 'nouvelle' ? undefined : app.recipe(id);
  const [form, setForm] = useState<FormState>(() => ({
    name: existing?.name ?? '',
    dish: existing?.dish ?? 'Plat',
    status: existing?.status ?? 'à découvrir',
    source: existing?.source ?? '',
    cover: existing?.cover ?? '',
    prepTime: existing?.prepTime ?? '',
    servings: existing?.servings ?? '',
    fridgeDays: existing?.fridgeDays !== undefined ? String(existing.fridgeDays) : '',
    ingredients: (existing?.ingredientsText ?? []).join('\n'),
    steps: (existing?.steps ?? []).join('\n'),
    note: existing?.note ?? '',
  }));
  const [error, setError] = useState<FormError | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const set = (key: Exclude<keyof FormState, 'status'>) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    if (error) setError(null);
  };

  const setStatus = (status: RecipeStatus) => setForm((current) => ({ ...current, status }));

  /** Entrée dans un champ court ne soumet pas : on écrit, on ne valide pas par accident. */
  const keepEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    if ((event.target as HTMLElement).tagName === 'INPUT') event.preventDefault();
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError({ field: 'name', message: 'Il faut un titre pour enregistrer la fiche.' });
      nameRef.current?.focus();
      return;
    }
    const cover = form.cover.trim();
    if (cover && !isWebUrl(cover)) {
      setError({ field: 'cover', message: 'L’adresse de la photo doit commencer par http:// ou https://.' });
      coverRef.current?.focus();
      return;
    }
    setError(null);
    const days = Number(form.fridgeDays);
    const fields = {
      name,
      dish: form.dish,
      status: form.status,
      source: form.source.trim() || undefined,
      cover: cover || undefined,
      prepTime: form.prepTime.trim() || undefined,
      servings: form.servings.trim() || undefined,
      fridgeDays: Number.isFinite(days) && days > 0 ? Math.round(days) : undefined,
      ingredientsText: lines(form.ingredients),
      steps: lines(form.steps),
      note: form.note.trim() || undefined,
    };
    if (existing) {
      store.update('recipes', (list) => list.map((recipe) => (recipe.id === existing.id ? { ...recipe, ...fields } : recipe)));
      app.openRecipe(existing.id);
    } else {
      const recipeId = newRecipeId(name, data.recipes);
      const recipe: Recipe = {
        id: recipeId,
        favorite: false,
        createdAt: new Date().toISOString(),
        ...fields,
      };
      store.update('recipes', (list) => [...list, recipe]);
      app.openRecipe(recipeId);
    }
  };

  const coverUrl = useDebounced(form.cover.trim());
  const days = Number(form.fridgeDays);
  const fridgeDays = Number.isFinite(days) && days > 0 ? Math.round(days) : undefined;
  const ingredientLines = lines(form.ingredients).length;
  const stepLines = lines(form.steps).length;
  const source = sourceLabel(form.source.trim());

  const preview: Recipe = {
    id: existing?.id ?? 'apercu',
    name: form.name.trim() || 'Sans titre',
    dish: form.dish,
    status: form.status,
    favorite: false,
    steps: [],
    cover: coverUrl || undefined,
    prepTime: form.prepTime.trim() || undefined,
    servings: form.servings.trim() || undefined,
    fridgeDays,
  };

  return (
    <div className="s-page re-page">
      <div className="re-toolbar">
        <button type="button" className="s-btn is-ghost" onClick={app.back}>
          <ArrowLeft size={17} aria-hidden /> Retour
        </button>
        <span className="re-crumb">
          Recettes <span aria-hidden>/</span> <b>{existing ? 'Modifier' : 'Nouvelle fiche'}</b>
        </span>
        <button type="submit" form="recipe-editor" className="s-btn is-primary re-save">
          <Check size={18} strokeWidth={2.6} aria-hidden /> {existing ? 'Enregistrer' : 'Ajouter la recette'}
        </button>
      </div>

      <header className="re-head">
        <span className="s-chip re-kicker">
          <Sparkles size={13} aria-hidden /> {existing ? 'Fiche existante' : 'Le carnet s’agrandit'}
        </span>
        <h1 id="re-page-title" className="re-title">
          {existing ? 'Modifier la recette' : 'Nouvelle recette'}
        </h1>
        <p className="re-lede">
          {existing ? (
            <>
              Tu modifies « <b>{typo(existing.name)}</b> ». Les champs déjà remplis restent en place ; l’enregistrement met la fiche à jour d’un coup.
            </>
          ) : (
            'Quatre sections, du nom aux notes. Seul le titre est obligatoire, le reste peut attendre.'
          )}
        </p>
      </header>

      <div className="re-layout">
        <form
          id="recipe-editor"
          className="re-form"
          onSubmit={save}
          onKeyDown={keepEnter}
          noValidate
          aria-labelledby="re-page-title"
        >
          <section className="re-card" aria-labelledby="re-fiche-title">
            <header className="re-card-head">
              <span className="re-card-num num" aria-hidden>
                01
              </span>
              <div className="re-card-titlewrap">
                <h2 id="re-fiche-title">La fiche</h2>
                <p>Le nom, le genre de plat et la photo. Ce qu’on voit avant d’ouvrir la fiche.</p>
              </div>
            </header>

            <div className="re-grid">
              <div className="re-field is-wide">
                <div className="re-label-row">
                  <label htmlFor="re-name">Titre</label>
                  <span className="re-required">Obligatoire</span>
                </div>
                <input
                  id="re-name"
                  ref={nameRef}
                  className="re-input is-title"
                  value={form.name}
                  onChange={set('name')}
                  placeholder="Le nom de la recette"
                  autoFocus={!existing}
                  autoComplete="off"
                  required
                  aria-invalid={error?.field === 'name'}
                  aria-describedby={error?.field === 'name' ? 're-name-help re-name-error' : 're-name-help'}
                />
                <div className="re-field-foot">
                  <p className="re-help" id="re-name-help">
                    Le nom qui s’affichera sur l’étagère et dans la semaine.
                  </p>
                  <span className="re-count num">{plural(form.name.length, 'caractère')}</span>
                </div>
                {error?.field === 'name' && (
                  <p className="re-error" id="re-name-error" role="alert">
                    {error.message}
                  </p>
                )}
              </div>

              <div className="re-field">
                <label htmlFor="re-dish">Type de plat</label>
                <div className="re-select">
                  <select id="re-dish" value={form.dish} onChange={set('dish')} aria-describedby="re-dish-help">
                    {DISHES.map((dish) => (
                      <option key={dish} value={dish}>
                        {dish}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={16} aria-hidden />
                </div>
                <p className="re-help" id="re-dish-help">
                  Il range la fiche dans son rayon et choisit le pictogramme quand il n’y a pas de photo.
                </p>
              </div>

              <div className="re-field">
                <span className="re-label" id="re-status-label">
                  Statut
                </span>
                <div className="re-pills" role="radiogroup" aria-labelledby="re-status-label" aria-describedby="re-status-help">
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={form.status === status}
                      className={`re-pill ${STATUS_TONE[status]} ${form.status === status ? 'is-on' : ''}`}
                      onClick={() => setStatus(status)}
                    >
                      <span className="re-dot" aria-hidden />
                      {STATUS_LABEL[status]}
                    </button>
                  ))}
                </div>
                <p className="re-help" id="re-status-help">
                  À tester quand tu la découvres, maîtrisée quand elle est réglée.
                </p>
              </div>

              <div className="re-field is-wide">
                <label htmlFor="re-source">Source</label>
                <input
                  id="re-source"
                  className="re-input"
                  value={form.source}
                  onChange={set('source')}
                  placeholder="https://… ou le nom du livre"
                  autoComplete="off"
                  aria-describedby="re-source-help"
                />
                <p className="re-help" id="re-source-help">
                  Le lien d’origine ou le nom du livre, pour retrouver d’où vient la recette.
                </p>
              </div>

              <div className="re-field is-wide">
                <label htmlFor="re-cover">Photo</label>
                <div className="re-photo-row">
                  <div className="re-photo-main">
                    <input
                      id="re-cover"
                      ref={coverRef}
                      className="re-input"
                      type="url"
                      value={form.cover}
                      onChange={set('cover')}
                      placeholder="https://…"
                      autoComplete="off"
                      aria-invalid={error?.field === 'cover'}
                      aria-describedby={error?.field === 'cover' ? 're-cover-help re-cover-error' : 're-cover-help'}
                    />
                    <p className="re-help" id="re-cover-help">
                      L’adresse d’une image sur le web. Sans photo, le pictogramme du type de plat prend sa place.
                    </p>
                    {error?.field === 'cover' && (
                      <p className="re-error" id="re-cover-error" role="alert">
                        {error.message}
                      </p>
                    )}
                  </div>
                  <figure className="re-photo-preview">
                    <Cover key={coverUrl} recipe={preview} ratio="square" className="re-photo-shot" />
                    <figcaption>{coverUrl ? 'Aperçu' : 'Sans photo'}</figcaption>
                  </figure>
                </div>
              </div>
            </div>
          </section>

          <section className="re-card" aria-labelledby="re-recipe-title">
            <header className="re-card-head">
              <span className="re-card-num num" aria-hidden>
                02
              </span>
              <div className="re-card-titlewrap">
                <h2 id="re-recipe-title">La recette</h2>
                <p>Les temps, les portions, la conservation et ce qu’il faut sortir du frigo.</p>
              </div>
              <span className="s-chip re-card-meta">{plural(ingredientLines, 'ingrédient')}</span>
            </header>

            <div className="re-grid">
              <div className="re-trio">
                <div className="re-field">
                  <label htmlFor="re-prep">Préparation</label>
                  <input
                    id="re-prep"
                    className="re-input"
                    value={form.prepTime}
                    onChange={set('prepTime')}
                    placeholder="45 min dont 15 de repos"
                    aria-describedby="re-prep-help"
                  />
                  <p className="re-help" id="re-prep-help">
                    Le temps total, repos compris.
                  </p>
                </div>

                <div className="re-field">
                  <label htmlFor="re-servings">Portions</label>
                  <input
                    id="re-servings"
                    className="re-input"
                    value={form.servings}
                    onChange={set('servings')}
                    placeholder="2 repas"
                    aria-describedby="re-servings-help"
                  />
                  <p className="re-help" id="re-servings-help">
                    Ce que la recette donne.
                  </p>
                </div>

                <div className="re-field">
                  <label htmlFor="re-fridge">Conservation</label>
                  <div className="re-suffix">
                    <input
                      id="re-fridge"
                      className="re-input"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={form.fridgeDays}
                      onChange={set('fridgeDays')}
                      placeholder="3"
                      aria-describedby="re-fridge-help"
                    />
                    <span>jours</span>
                  </div>
                  <p className="re-help" id="re-fridge-help">
                    Une fois cuisiné, au frigo. Vide : 3 jours.
                  </p>
                </div>
              </div>

              <div className="re-field is-wide">
                <div className="re-label-row">
                  <label htmlFor="re-ingredients">Ingrédients</label>
                  <span className="re-count num">{plural(ingredientLines, 'ligne')}</span>
                </div>
                <textarea
                  id="re-ingredients"
                  className="re-textarea"
                  rows={8}
                  value={form.ingredients}
                  onChange={set('ingredients')}
                  placeholder={'200 g de farine\n2 œufs\n1 pincée de sel'}
                  aria-describedby="re-ingredients-help"
                />
                <div className="re-field-foot">
                  <p className="re-help" id="re-ingredients-help">
                    Un ingrédient par ligne, avec sa quantité. Les lignes vides sont ignorées.
                  </p>
                  <span className="re-count num">{plural(form.ingredients.length, 'caractère')}</span>
                </div>
                {existing?.ingredients && (
                  <p className="re-callout">
                    <Link2 size={15} aria-hidden />
                    <span>
                      Les quantités reliées au stock (calendrier, nutrition) ne changent pas ici : la liaison au stock s’en occupe
                      depuis la fiche.
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="re-card" aria-labelledby="re-steps-title">
            <header className="re-card-head">
              <span className="re-card-num num" aria-hidden>
                03
              </span>
              <div className="re-card-titlewrap">
                <h2 id="re-steps-title">Les étapes</h2>
                <p>Un geste par ligne. La fiche les numérote ensuite dans l’ordre.</p>
              </div>
              <span className="s-chip re-card-meta">{plural(stepLines, 'étape')}</span>
            </header>

            <div className="re-grid">
              <div className="re-field is-wide">
                <div className="re-label-row">
                  <label htmlFor="re-steps">Étapes</label>
                  <span className="re-count num">{plural(stepLines, 'ligne')}</span>
                </div>
                <textarea
                  id="re-steps"
                  className="re-textarea is-steps"
                  rows={9}
                  value={form.steps}
                  onChange={set('steps')}
                  placeholder={'Préchauffer le four à 180 °C.\nMélanger la farine et les œufs.\nEnfourner 25 min.'}
                  aria-describedby="re-steps-help"
                />
                <div className="re-field-foot">
                  <p className="re-help" id="re-steps-help">
                    Les lignes vides sont ignorées, le reste est numéroté tel quel.
                  </p>
                  <span className="re-count num">{plural(form.steps.length, 'caractère')}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="re-card" aria-labelledby="re-notes-title">
            <header className="re-card-head">
              <span className="re-card-num num" aria-hidden>
                04
              </span>
              <div className="re-card-titlewrap">
                <h2 id="re-notes-title">Les notes</h2>
                <p>Les astuces, les ratés, ce qu’il faut refaire la prochaine fois.</p>
              </div>
            </header>

            <div className="re-grid">
              <div className="re-field is-wide">
                <label htmlFor="re-note">Notes</label>
                <textarea
                  id="re-note"
                  className="re-textarea is-note"
                  rows={5}
                  value={form.note}
                  onChange={set('note')}
                  placeholder="Ce qui a marché, ce qu’il faut changer, les quantités à ajuster…"
                  aria-describedby="re-note-help"
                />
                <div className="re-field-foot">
                  <p className="re-help" id="re-note-help">
                    Ce que tu veux retenir pour la prochaine fois.
                  </p>
                  <span className="re-count num">{plural(form.note.length, 'caractère')}</span>
                </div>
              </div>
            </div>
          </section>
        </form>

        <aside className="re-aside" aria-label="Aperçu de la fiche">
          <div className="re-preview-card">
            <div className="re-preview-head">
              <span className="re-preview-kicker">Aperçu de la fiche</span>
              <span className="re-live">en direct</span>
            </div>
            <div className="re-preview-cover-wrap">
              <Cover key={coverUrl} recipe={preview} ratio="photo" className="re-preview-cover" />
            </div>
            <div className="re-preview-body">
              <div className="re-preview-chips">
                <span className="s-chip is-ink">{form.dish}</span>
                <span className={`re-preview-status ${STATUS_TONE[form.status]}`}>{STATUS_LABEL[form.status]}</span>
              </div>
              <h2 className="re-preview-name">{typo(preview.name)}</h2>
              {source && <p className="re-preview-source">{typo(source)}</p>}
              {(preview.prepTime || preview.servings || fridgeDays) && (
                <div className="re-preview-facts">
                  {preview.prepTime && (
                    <span className="re-preview-fact">
                      <Clock size={13} aria-hidden /> {typo(preview.prepTime)}
                    </span>
                  )}
                  {preview.servings && (
                    <span className="re-preview-fact">
                      <Users size={13} aria-hidden /> {typo(preview.servings)}
                    </span>
                  )}
                  {fridgeDays && (
                    <span className="re-preview-fact">
                      <Snowflake size={13} aria-hidden /> {plural(fridgeDays, 'jour')} au frigo
                    </span>
                  )}
                </div>
              )}
              <div className="re-preview-foot">
                <span>{plural(ingredientLines, 'ingrédient')}</span>
                <span aria-hidden>·</span>
                <span>{plural(stepLines, 'étape')}</span>
              </div>
            </div>
          </div>
          <p className="re-aside-note">L’aperçu suit la frappe ; la fiche ne change qu’à l’enregistrement.</p>
        </aside>
      </div>

      <div className="re-actions">
        <p className="re-actions-note">
          <b>{existing ? 'L’enregistrement met la fiche à jour.' : 'La fiche rejoindra le carnet.'}</b>
          <span>Rien n’est écrit avant le clic.</span>
        </p>
        <div className="re-actions-buttons">
          <button type="button" className="s-btn is-ghost" onClick={app.back}>
            Annuler
          </button>
          <button type="submit" form="recipe-editor" className="s-btn is-primary re-save">
            <Check size={18} strokeWidth={2.6} aria-hidden /> {existing ? 'Enregistrer' : 'Ajouter la recette'}
          </button>
        </div>
      </div>
    </div>
  );
}
