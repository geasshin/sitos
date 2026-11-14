import type { Data } from './domain/types';
import foods from '../starter/foods.json';
import snackIdeas from '../starter/snackIdeas.json';

/**
 * Le point de départ d'une installation neuve : le catalogue d'aliments (valeurs
 * nutritionnelles moyennes) et des idées pour le soir. Pas de stock, pas de
 * recettes, pas de plan : ce sont les données de la personne, jamais livrées avec l'app.
 */
export function starterData(today: string): Data {
  return {
    foods: foods as Data['foods'],
    snackIdeas: snackIdeas as Data['snackIdeas'],
    stock: [],
    recipes: [],
    plan: { startDate: today, entries: [] },
    journal: { snacks: [], adjustments: [], weights: [] },
    settings: { kcalTarget: 2000, proteinTarget: 100, fiberTarget: 30, plantTargetG: 400, fruitsPerDay: 1, demo: false },
  };
}
