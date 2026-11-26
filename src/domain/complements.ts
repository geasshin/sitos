import type { Ingredient, Snack, SnackIdea } from './types';

/**
 * Les compléments puisent dans le catalogue unique d’aliments : un complément est une portion
 * d’un aliment, avec sa quantité. Aucune liste figée ne décide de ce qu’on peut ajouter.
 *
 * `Snack.ideaId` garde le lien vers une portion mémorisée quand elle existe, pour que la quantité
 * se recalcule depuis sa base sans dérive. Un complément choisi dans le catalogue garde ses
 * proportions : `amount` et `items` suffisent.
 */

/** Quantité de départ d’une portion, prise sur son premier ingrédient. */
export const baseAmount = (idea: { items: Ingredient[] }) => idea.items[0]?.qty || 1;

/** Quantité d’une base multipliée par le nombre de pièces ou de grammes choisi. */
export function scaledItems(idea: { items: Ingredient[] }, amount: number): Ingredient[] {
  const factor = amount / baseAmount(idea);
  return idea.items.map((item) => ({ ...item, qty: Math.round(item.qty * factor * 100) / 100 }));
}

/** Quantité d’un complément déjà au journal : celle retenue, sinon celle de sa portion. */
export function snackAmount(snack: Snack): number {
  return snack.amount ?? baseAmount(snack);
}

/** Portion mémorisée d’un complément déjà ajouté, si elle existe encore. */
export function snackBase(snack: Snack, ideas: SnackIdea[]): SnackIdea | undefined {
  return snack.ideaId ? ideas.find((idea) => idea.id === snack.ideaId) : undefined;
}

/**
 * Les ingrédients d’un complément pour une nouvelle quantité. Une portion mémorisée repart de
 * zéro (fiable même après plusieurs changements) ; un complément choisi dans le catalogue garde
 * ses proportions.
 */
export function snackItems(snack: Snack, ideas: SnackIdea[], amount: number): Ingredient[] {
  const idea = snackBase(snack, ideas);
  if (idea) return scaledItems(idea, amount);
  const current = snackAmount(snack);
  const factor = current > 0 ? amount / current : 1;
  return snack.items.map((item) => ({ ...item, qty: Math.round(item.qty * factor * 100) / 100 }));
}
