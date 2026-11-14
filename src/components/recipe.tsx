import { useState } from 'react';
import { Cake, ChefHat, CookingPot, Croissant, Heart, Salad, Soup, Star, Wine } from 'lucide-react';
import type { Recipe, RecipeStatus } from '../domain/types';

export const STATUS_LABEL: Record<RecipeStatus, string> = {
  'à découvrir': 'À tester',
  terminé: 'Testée',
  maîtrisée: 'Maîtrisée',
};
export const STATUSES: RecipeStatus[] = ['à découvrir', 'terminé', 'maîtrisée'];

export function StatusPill({ status }: { status: RecipeStatus }) {
  return <span className={`status-line ${status === 'à découvrir' ? 'tone-todo' : 'tone-done'}`}>{STATUS_LABEL[status]}</span>;
}

/** « marmiton.org » pour une adresse, le texte tel quel sinon. */
export function sourceLabel(source?: string): string | undefined {
  if (!source) return undefined;
  try {
    return new URL(source).hostname.replace(/^www\./, '');
  } catch {
    return source;
  }
}

export function isUrl(s?: string) {
  return !!s && /^https?:\/\//.test(s);
}

const DISH_ICON: Record<string, typeof ChefHat> = {
  Plat: CookingPot,
  Entrée: Salad,
  Accompagnement: Salad,
  Sauce: Soup,
  Pain: Croissant,
  Dessert: Cake,
  Apéritif: Wine,
  Boisson: Wine,
};

/** Photo de la recette ; sans photo (ou si le site la refuse), le pictogramme du type de plat. */
export function Cover({ recipe, ratio = 'square', className = '' }: { recipe: Recipe; ratio?: 'square' | 'photo'; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = DISH_ICON[recipe.dish] ?? ChefHat;
  return (
    <div className={`poster poster-${ratio} ${className}`}>
      {recipe.cover && !failed ? (
        <img src={recipe.cover} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <div className="poster-fallback">
          <Icon size={28} strokeWidth={1.4} aria-hidden />
          <span>Sans photo</span>
        </div>
      )}
    </div>
  );
}

export function Stars({ value, onChange }: { value?: number | null; onChange?: (v: number | null) => void }) {
  const v = value ?? 0;
  if (!onChange) {
    return v ? (
      <span className="stars" aria-label={`Note ${v} sur 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={15} className={i <= v ? 'on' : ''} aria-hidden />
        ))}
      </span>
    ) : null;
  }
  return (
    <span className="stars stars-input" role="radiogroup" aria-label="Note">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={v === i}
          aria-label={`${i} sur 5`}
          className={i <= v ? 'on' : ''}
          onClick={() => onChange(v === i ? null : i)}
        >
          <Star size={18} aria-hidden />
        </button>
      ))}
    </span>
  );
}

export function HeartToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={`heart-input ${on ? 'on' : ''}`} aria-pressed={on} aria-label={on ? 'Retirer des coups de cœur' : 'Coup de cœur'} onClick={() => onChange(!on)}>
      <Heart size={18} aria-hidden />
    </button>
  );
}
