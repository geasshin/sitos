import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../context';
import { DISHES, type Recipe, type RecipeStatus } from '../domain/types';
import { Cover, STATUS_LABEL, STATUSES } from '../components/recipe';
import { newRecipeId } from '../domain/recipes';

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

/** Ajout ou modification d'une fiche : les champs de Sylloge. Les quantités reliées au stock restent gérées à part. */
export function RecipeEditor({ id }: { id: string }) {
  const app = useApp();
  const { data, store } = app;
  const existing = id === 'nouvelle' ? undefined : app.recipe(id);
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    dish: existing?.dish ?? 'Plat',
    status: (existing?.status ?? 'à découvrir') as RecipeStatus,
    source: existing?.source ?? '',
    cover: existing?.cover ?? '',
    prepTime: existing?.prepTime ?? '',
    servings: existing?.servings ?? '',
    ingredients: (existing?.ingredientsText ?? []).join('\n'),
    steps: (existing?.steps ?? []).join('\n'),
    note: existing?.note ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError('Il faut un titre.');
      return;
    }
    const fields: Partial<Recipe> = {
      name,
      dish: form.dish,
      status: form.status,
      source: form.source.trim() || undefined,
      cover: form.cover.trim() || undefined,
      prepTime: form.prepTime.trim() || undefined,
      servings: form.servings.trim() || undefined,
      ingredientsText: lines(form.ingredients),
      steps: lines(form.steps),
      note: form.note.trim() || undefined,
    };
    if (existing) {
      store.update('recipes', (list) => list.map((r) => (r.id === existing.id ? { ...r, ...fields } : r)));
      app.openRecipe(existing.id);
    } else {
      const rid = newRecipeId(name, data.recipes);
      const recipe: Recipe = { id: rid, favorite: false, steps: [], createdAt: new Date().toISOString(), ...fields } as Recipe;
      store.update('recipes', (list) => [...list, recipe]);
      app.openRecipe(rid);
    }
  };

  const preview = { ...(existing ?? { id: 'apercu', favorite: false, steps: [], status: form.status }), dish: form.dish, cover: form.cover || undefined } as Recipe;

  return (
    <div className="detail-page">
      <div className="detail-bar">
        <button type="button" className="back-button" onClick={app.back}>
          <ArrowLeft size={16} aria-hidden /> {existing ? 'Fiche' : 'Recettes'}
        </button>
      </div>
      <form className="editor" onSubmit={save}>
        <h1 className="display-title display-title-sm">{existing ? 'Modifier la recette' : 'Ajouter une recette'}</h1>
        <div className="editor-grid">
          <div className="editor-side">
            <Cover key={form.cover} recipe={preview} ratio="photo" />
            <label className="field">
              <span>Photo (adresse d’une image)</span>
              <input type="url" value={form.cover} onChange={set('cover')} placeholder="https://…" />
            </label>
          </div>
          <div className="editor-main">
            <label className="field">
              <span>Titre</span>
              <input value={form.name} onChange={set('name')} required autoFocus={!existing} />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Type de plat</span>
                <select value={form.dish} onChange={set('dish')}>
                  {DISHES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <div className="field">
                <span id="status-label">Statut</span>
                <div className="seg-group" role="radiogroup" aria-labelledby="status-label">
                  {STATUSES.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={form.status === s} className={`seg-pill ${form.status === s ? 'on' : ''}`} onClick={() => setForm((f) => ({ ...f, status: s }))}>
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Source</span>
                <input value={form.source} onChange={set('source')} placeholder="Lien ou nom" />
              </label>
              <label className="field">
                <span>Préparation</span>
                <input value={form.prepTime} onChange={set('prepTime')} placeholder="45 min dont 15 de repos" />
              </label>
              <label className="field">
                <span>Portions</span>
                <input value={form.servings} onChange={set('servings')} placeholder="2 repas" />
              </label>
            </div>
            <label className="field">
              <span>Ingrédients, un par ligne</span>
              <textarea rows={8} value={form.ingredients} onChange={set('ingredients')} />
            </label>
            <label className="field">
              <span>Étapes, une par ligne</span>
              <textarea rows={8} value={form.steps} onChange={set('steps')} />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea rows={4} value={form.note} onChange={set('note')} />
            </label>
            {existing?.ingredients && <p className="small muted">Les quantités reliées au stock (calendrier, nutrition) ne changent pas ici : elles restent celles de la section « Dans tes menus ».</p>}
            {error && <p className="small warn" role="alert">{error}</p>}
            <div className="panel-actions">
              <button type="submit" className="primary-button">{existing ? 'Enregistrer' : 'Ajouter la recette'}</button>
              <button type="button" className="secondary-button" onClick={app.back}>Annuler</button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
