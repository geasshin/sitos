export type ISODate = string; // 'YYYY-MM-DD', jour local

export type Unit = 'g' | 'ml' | 'pièce';
export type Storage = 'frigo' | 'fruitier' | 'placard';
export type Category =
  | 'légumes'
  | 'fruits'
  | 'féculents'
  | 'légumineuses'
  | 'viandes & œufs'
  | 'laitiers'
  | 'matières grasses'
  | 'épicerie'
  | 'sucré'
  | 'boissons';

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  /** Sucres totaux (mono- et disaccharides), lactose compris. */
  sugars: number;
  /** Lactose, pour calculer les sucres « hors lactose » de l'ANSES. */
  lactose: number;
  fat: number;
  /** Acides gras saturés. */
  satFat: number;
  fiber: number;
  /** Sel (chlorure de sodium). */
  salt: number;
}

export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'sugars', 'lactose', 'fat', 'satFat', 'fiber', 'salt'] as const;

export interface Food {
  id: string;
  name: string;
  category: Category;
  unit: Unit;
  /** Nom d'une pièce au singulier et au pluriel : « gousse d'ail » / « gousses d'ail ». */
  piece?: [string, string];
  /** Poids moyen d'une pièce, en grammes (unit = 'pièce'). */
  gramsPerUnit?: number;
  /** Conditionnement, pour l'affichage : « 1 boîte = 400 ml ». */
  pack?: { size: number; label: string };
  /** Valeurs pour 100 g (ou 100 ml) : table Ciqual 2020 de l'ANSES, ou étiquette type. */
  per100: Nutrients;
  /** D'où viennent les valeurs : « Ciqual 2020 20172 », « étiquette type ». */
  source?: string;
  storage: Storage;
  /** Durée de conservation typique après réception, en jours. */
  shelfLifeDays: number;
  /** Fruit mangé nature au quotidien (compté dans la projection du stock). */
  dailyFruit?: boolean;
  /** Ajouté depuis l'app : valeurs nutritionnelles inconnues. */
  custom?: boolean;
}

export interface Purchase {
  id: string;
  foodId: string;
  qty: number;
  receivedAt: ISODate;
  /** Date limite imprimée, si connue. Sinon : réception + shelfLifeDays. */
  expiresAt?: ISODate;
  origin?: 'commande' | 'placard' | 'complément';
  note?: string;
}

export interface Ingredient {
  foodId: string;
  qty: number;
  note?: string;
}

/** Statuts de Sylloge : à tester, testée, maîtrisée. */
export type RecipeStatus = 'à découvrir' | 'terminé' | 'maîtrisée';

export const DISHES = ['Plat', 'Entrée', 'Accompagnement', 'Sauce', 'Pain', 'Dessert', 'Apéritif', 'Boisson', 'Autre'] as const;

export interface Recipe {
  id: string;
  name: string;
  status: RecipeStatus;
  /** Type de plat, comme dans Sylloge. */
  dish: string;
  favorite: boolean;
  rating?: number | null;
  /** Adresse d'une image (jamais un fichier). */
  cover?: string;
  /** Lien ou nom de la source. */
  source?: string;
  prepTime?: string;
  servings?: string;
  /** Ingrédients tels qu'écrits dans la fiche, une ligne chacun. */
  ingredientsText?: string[];
  steps: string[];
  note?: string;
  summary?: string;
  createdAt?: string;
  syllogeId?: string;
  /** Repas assemblé par Hermès à partir de plusieurs fiches. */
  origin?: 'assemblage';
  parts?: string[];

  /* Couche « menus » : présente quand la recette est reliée au stock. */
  /** Nombre de repas que la recette donne. */
  portions?: number;
  ingredients?: Ingredient[];
  /** Épices, bouillon, sauces : non suivis dans le stock ni la nutrition. */
  extras?: string[];
  /** Conservation du plat cuit au frigo, en jours. */
  fridgeDays?: number;
  equipment?: ('plaque' | 'air fryer')[];
  /** Ce qu'Hermès a ajouté ou adapté par rapport à la fiche. */
  planNote?: string;
}

/** Une recette se planifie quand ses ingrédients sont reliés au stock. */
export const isPlannable = (r: Recipe) => (r.ingredients?.length ?? 0) > 0;
export const portionsOf = (r: Recipe) => r.portions ?? 1;

export type PlanKind = 'cook' | 'leftover' | 'out';

export interface PlanEntry {
  id: string;
  date: ISODate;
  kind: PlanKind;
  /** cook : recette cuisinée ce jour-là. */
  recipeId?: string;
  /** cook : nombre de portions préparées. */
  portions?: number;
  /** cook : nom d'un plat composé sans fiche. */
  title?: string;
  /** cook : ingrédients de CETTE cuisson. Remplacent ceux de la fiche pour ce repas seulement. */
  ingredients?: Ingredient[];
  /** leftover : id de l'entrée cook d'origine. */
  batchId?: string;
  done?: boolean;
  /** Part de la portion réellement mangée (0,75 · 1 · 1,25). Ne change pas la fiche ni le stock. */
  eaten?: number;
  /** Repas passé déclaré non mangé : ne sort rien du stock et ne redemande plus. */
  skipped?: boolean;
  note?: string;
}

export interface Plan {
  startDate: ISODate;
  entries: PlanEntry[];
}

export interface Snack {
  id: string;
  date: ISODate;
  label: string;
  items: Ingredient[];
  /** Base ajustable d'où vient le complément (catalogue ou idée personnelle). */
  ideaId?: string;
  /** Nombre d'unités de la base : pièces ou grammes du premier ingrédient. */
  amount?: number;
}

export interface Adjustment {
  id: string;
  date: ISODate;
  foodId: string;
  /** Quantité retirée du stock (positive), ou ajoutée (négative). */
  qty: number;
  reason: 'jeté' | 'mangé hors plan' | 'correction';
}

export interface WeightEntry {
  date: ISODate;
  kg: number;
}

export interface Journal {
  snacks: Snack[];
  adjustments: Adjustment[];
  weights: WeightEntry[];
}

export type Sex = 'homme' | 'femme';
export type Activity = 'faible' | 'moderee' | 'elevee';
export type Goal = 'maintenir' | 'doucement' | 'perdre';
export type Diet = 'omnivore' | 'flexitarien' | 'vegetarien';
export type Rhythm = 'un-repas' | 'deux-repas' | 'trois-repas';

/** Ce que la personne a dit d'elle dans « Mes objectifs ». */
export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: Goal;
  diet: Diet;
  rhythm: Rhythm;
  /** Date de la dernière validation des objectifs. */
  updatedAt: ISODate;
}

export interface Settings {
  kcalTarget: number;
  proteinTarget: number;
  fiberTarget: number;
  /** Grammes de légumes et fruits visés par jour. */
  plantTargetG: number;
  /** Plafonds (absents : repères ANSES/OMS calculés, voir targets.ts). */
  satFatMaxG?: number;
  sugarsMaxG?: number;
  saltMaxG?: number;
  /** Part de l'énergie de la journée apportée par le repas principal. */
  mealShare?: number;
  /** Fruits mangés nature par jour, pour projeter le stock de fruits. */
  fruitsPerDay: number;
  /** Repas principaux par jour (1 à 3). Le calendrier s'y adapte. */
  mealsPerDay?: 1 | 2 | 3;
  /** Repas que donne une cuisson, quand la fiche ne le dit pas (2 à 4). */
  mealsPerCook?: 2 | 3 | 4;
  demo: boolean;
  profile?: Profile;
  /** Rechercher une mise à jour à l'ouverture (vrai par défaut). */
  autoUpdate?: boolean;
  /** Apparence : suit le système par défaut. */
  theme?: 'system' | 'light' | 'dark';
}

export interface SnackIdea {
  id: string;
  name: string;
  items: Ingredient[];
  note?: string;
}

export interface Data {
  foods: Food[];
  stock: Purchase[];
  recipes: Recipe[];
  plan: Plan;
  journal: Journal;
  settings: Settings;
  snackIdeas: SnackIdea[];
}
