import type { Activity, Goal, Profile, Rhythm, Settings } from './types';

/**
 * Objectifs nutritionnels d'une journée, calculés à partir du profil.
 *
 * Références (adultes) :
 * - Métabolisme de base : équations de Henry (Oxford, 2005), retenues par l'EFSA et le SACN.
 * - Dépense totale : métabolisme × niveau d'activité physique (NAP 1,4 / 1,6 / 1,8, valeurs de l'EFSA).
 * - Protéines : référence ANSES 0,83 g/kg/j ; 10 à 20 % de l'énergie.
 * - Lipides 35 à 40 %, glucides 40 à 55 % de l'énergie ; acides gras saturés au plus 12 % (ANSES 2016).
 * - Sucres hors lactose : au plus 100 g/j (ANSES 2016). Fibres : 30 g/j (ANSES).
 * - Sel : moins de 5 g/j (OMS, repris par l'Assurance maladie).
 * - Fruits et légumes : au moins 400 g/j, soit 5 portions de 80 g (OMS, PNNS).
 */

export interface Targets {
  kcal: number;
  protein: number;
  fiber: number;
  plantG: number;
  satFatMaxG: number;
  sugarsMaxG: number;
  saltMaxG: number;
  /** Fourchettes en % de l'énergie (ANSES). */
  proteinPct: [number, number];
  fatPct: [number, number];
  carbsPct: [number, number];
  /** Part de l'énergie apportée par le repas principal. */
  mealShare: number;
}

export const PAL: Record<Activity, number> = { faible: 1.4, moderee: 1.6, elevee: 1.8 };
export const ACTIVITY_LABEL: Record<Activity, string> = {
  faible: 'Peu d’activité (assis la plupart du temps)',
  moderee: 'Un peu d’activité (marche, sport léger)',
  elevee: 'Actif (sport régulier, travail physique)',
};

/** Rythme de perte visé en kg par semaine. 1 kg de masse grasse ≈ 7 700 kcal. */
export const GOAL_KG_PER_WEEK: Record<Goal, number> = { maintenir: 0, doucement: 0.25, perdre: 0.5 };
export const GOAL_LABEL: Record<Goal, string> = {
  maintenir: 'Garder mon poids',
  doucement: 'Perdre doucement (≈ 0,25 kg par semaine)',
  perdre: 'Perdre (≈ 0,5 kg par semaine)',
};

export const MEAL_SHARE: Record<Rhythm, number> = { 'un-repas': 0.75, 'deux-repas': 0.45, 'trois-repas': 0.35 };
export const RHYTHM_LABEL: Record<Rhythm, string> = {
  'un-repas': 'Un gros repas par jour, plus le soir',
  'deux-repas': 'Deux repas par jour',
  'trois-repas': 'Trois repas par jour',
};

export const KCAL_PER_KG = 7700;
/** Un déficit ne dépasse jamais 20 % de la dépense, ni ne descend sous le métabolisme de base. */
export const MAX_DEFICIT_SHARE = 0.2;

const round = (v: number, step: number) => Math.round(v / step) * step;

/** Métabolisme de base en kcal/j, équations de Henry (2005) avec poids (kg) et taille (cm). */
export function henryBMR(p: Pick<Profile, 'sex' | 'age' | 'weightKg' | 'heightCm'>): number {
  const { weightKg: w, heightCm: h, age } = p;
  if (p.sex === 'homme') {
    if (age < 30) return 14.4 * w + 3.13 * h + 113;
    if (age < 60) return 11.4 * w + 5.41 * h - 137;
    return 11.4 * w + 5.41 * h - 256;
  }
  if (age < 30) return 10.4 * w + 6.15 * h - 282;
  if (age < 60) return 8.18 * w + 5.02 * h - 11.6;
  return 8.52 * w + 4.21 * h + 10.7;
}

export interface TargetPlan {
  targets: Targets;
  bmr: number;
  pal: number;
  tdee: number;
  /** Déficit réellement appliqué, en kcal/j (après plafonds). */
  deficit: number;
  /** Perte attendue avec ce déficit, en kg par semaine. */
  kgPerWeek: number;
  /** Référence ANSES en protéines pour ce poids. */
  proteinRef: number;
  /** Explications, une ligne par objectif. */
  notes: { label: string; text: string }[];
}

export function computeTargets(p: Profile): TargetPlan {
  const bmr = henryBMR(p);
  const pal = PAL[p.activity];
  const tdee = bmr * pal;
  const wanted = (GOAL_KG_PER_WEEK[p.goal] * KCAL_PER_KG) / 7;
  const deficit = Math.max(0, Math.min(wanted, tdee * MAX_DEFICIT_SHARE, tdee - bmr));
  const kcal = round(Math.max(bmr, tdee - deficit), 50);

  const proteinRef = 0.83 * p.weightKg;
  const losing = p.goal !== 'maintenir';
  const wantedProtein = losing ? 1.0 * p.weightKg : proteinRef;
  // Dans la fourchette ANSES de 10 à 20 % de l'énergie.
  const protein = round(Math.min(Math.max(wantedProtein, (kcal * 0.1) / 4), (kcal * 0.2) / 4), 5);

  const targets: Targets = {
    kcal,
    protein,
    fiber: 30,
    plantG: 400,
    satFatMaxG: Math.round((kcal * 0.12) / 9),
    sugarsMaxG: 100,
    saltMaxG: 5,
    proteinPct: [10, 20],
    fatPct: [35, 40],
    carbsPct: [40, 55],
    mealShare: MEAL_SHARE[p.rhythm],
  };

  const fr = (n: number) => Math.round(n).toLocaleString('fr-FR');
  const realDeficit = tdee - kcal;
  const notes = [
    {
      label: 'Énergie',
      text:
        `Métabolisme de base ≈ ${fr(bmr)} kcal (équation de Henry), × ${String(pal).replace('.', ',')} pour ton activité : ` +
        `tu dépenses ≈ ${fr(tdee)} kcal par jour.` +
        (losing ? ` Avec ${fr(realDeficit)} kcal de moins, la perte attendue est d’environ ${String(Math.round(((realDeficit * 7) / KCAL_PER_KG) * 100) / 100).replace('.', ',')} kg par semaine.` : ''),
    },
    {
      label: 'Protéines',
      text: losing
        ? `La référence ANSES est de 0,83 g par kg (${fr(proteinRef)} g). En perte de poids, viser 1 g par kg aide à garder le muscle.`
        : `Référence ANSES : 0,83 g par kg de poids (${fr(proteinRef)} g).`,
    },
    { label: 'Fibres', text: '30 g par jour (ANSES) : légumineuses, légumes, fruits, céréales.' },
    { label: 'Légumes et fruits', text: 'Au moins 400 g par jour, soit 5 portions de 80 g (OMS, PNNS).' },
    { label: 'Graisses saturées', text: `Au plus 12 % de l’énergie (ANSES), soit ${targets.satFatMaxG} g : beurre, fromage, crème, coco.` },
    { label: 'Sucres', text: 'Au plus 100 g de sucres par jour, hors lactose du lait (ANSES).' },
    { label: 'Sel', text: 'Moins de 5 g par jour (OMS). Le sel ajouté en cuisine n’est pas compté ici.' },
  ];
  if (p.diet !== 'omnivore') {
    notes.push({
      label: 'Sans viande',
      text: 'Les protéines viennent des légumineuses, des produits laitiers et des œufs : en associer chaque jour suffit. Surveille le fer et la vitamine B12.',
    });
  }
  return { targets, bmr, pal, tdee, deficit: realDeficit, kgPerWeek: (realDeficit * 7) / KCAL_PER_KG, proteinRef, notes };
}

/** Les objectifs en vigueur : ceux enregistrés dans les réglages, complétés par les repères. */
export function targetsOf(s: Settings): Targets {
  return {
    kcal: s.kcalTarget,
    protein: s.proteinTarget,
    fiber: s.fiberTarget,
    plantG: s.plantTargetG,
    satFatMaxG: s.satFatMaxG ?? Math.round((s.kcalTarget * 0.12) / 9),
    sugarsMaxG: s.sugarsMaxG ?? 100,
    saltMaxG: s.saltMaxG ?? 5,
    proteinPct: [10, 20],
    fatPct: [35, 40],
    carbsPct: [40, 55],
    mealShare: s.mealShare ?? MEAL_SHARE['un-repas'],
  };
}

/** Enregistre le profil et les objectifs validés (éventuellement retouchés à la main). */
export function applyTargets(s: Settings, profile: Profile, t: Targets): Settings {
  return {
    ...s,
    profile,
    kcalTarget: t.kcal,
    proteinTarget: t.protein,
    fiberTarget: t.fiber,
    plantTargetG: t.plantG,
    satFatMaxG: t.satFatMaxG,
    sugarsMaxG: t.sugarsMaxG,
    saltMaxG: t.saltMaxG,
    mealShare: t.mealShare,
  };
}

/** Ce que vise un seul repas : les objectifs du jour multipliés par sa part. */
export function mealTargets(t: Targets): Targets {
  const k = t.mealShare;
  return {
    ...t,
    kcal: t.kcal * k,
    protein: t.protein * k,
    fiber: t.fiber * k,
    plantG: t.plantG * k,
    satFatMaxG: t.satFatMaxG * k,
    sugarsMaxG: t.sugarsMaxG * k,
    saltMaxG: t.saltMaxG * k,
  };
}
