# Sitos

<img src="src-tauri/icons/128x128@2x.png" width="96" alt="" align="right">

Application macOS pour la cuisine d'un mois : le stock des grosses courses, un plat par jour au calendrier,
la bibliothèque de recettes, la nutrition et le poids. Tout reste sur le Mac : ni compte, ni serveur
(seules les photos des recettes sont chargées depuis leur site, et l'app vérifie s'il existe une mise à jour).

σῖτος (*sitos*) : les vivres, ce qu'on met en réserve pour se nourrir.

## Installer

Télécharger **Sitos-macOS.dmg** depuis la [dernière release](https://github.com/geasshin/sitos/releases/latest),
puis glisser Sitos dans Applications. L'app n'est pas notariée par Apple : au premier lancement, macOS la bloque ;
ouvrir Réglages Système › Confidentialité et sécurité, puis « Ouvrir quand même ». Ensuite, les mises à jour
s'annoncent dans l'app (carte en bas à droite) et s'installent d'un clic.

## Ce qu'elle fait

- **Aujourd'hui** : le plat du jour (cocher « C'est fait » retire les ingrédients du stock, décocher les remet),
  ce qu'il faut utiliser vite, ce qui reste au frigo, le bilan du jour, les idées pour le soir.
- **Calendrier** : un plat par jour. Glisser un plat le déplace avec ses restes. « Dehors » décale la suite.
  On planifie une recette de la bibliothèque ou un « plat maison » (un nom, puis ses ingrédients). Chaque cuisson a
  ses propres ingrédients : changer le nombre de repas, une quantité, retirer ou ajouter un ingrédient ne touche que
  ce repas, jamais la fiche (« Revenir à la fiche » annule l'ajustement).
- **Stock** : ce qui reste, jusqu'à quand ça se garde, ce qui risque de se perdre avec le plan actuel.
- **Nutrition** : « Mes objectifs », un questionnaire en quatre étapes (profil, activité, rythme des repas, objectif,
  façon de manger) qui calcule les cibles du jour selon les repères officiels, toutes retouchables. Puis la semaine :
  énergie par jour, moyenne face aux objectifs, répartition protéines / lipides / glucides, détail jour par jour.
- **Bilan de la journée** (calendrier et Aujourd'hui) : repas + soir face aux objectifs (énergie, protéines, fibres,
  légumes et fruits ; graisses saturées, sucres hors lactose, sel à limiter), et « Pour compléter » : les à-côtés qui
  comblent le mieux les manques avec ce qui restera en stock ce jour-là, sans jamais prendre un ingrédient réservé à
  un plat prévu.
- **Recettes** : la bibliothèque. Statut (À tester, Testée, Maîtrisée), type de plat, coups de cœur, note.
  Une fiche avec des quantités chiffrées a aussi des valeurs nutritionnelles.
- **Poids** : pesées et tendance lissée.

- **Paramètres** (⌘,) : version installée, recherche de mise à jour manuelle ou automatique, installation d'un clic ;
  objectifs nutritionnels, fruits par jour ; apparence (comme le Mac, clair, sombre) ; dossier des données et
  sauvegarde manuelle ; à propos et sources.
- **Le soir** : un à-côté noté pour un soir à venir (« Prévu le soir ») compte dans la projection du stock dès maintenant
  et sort du stock ce jour-là.

⌘Z (ou « Annuler » en bas de la barre latérale) défait la dernière modification.

## Données

Un fichier JSON lisible par collection, dans `~/Library/Application Support/com.aurelientrouble.sitos/data/` :

| Fichier | Contenu |
|---|---|
| `foods.json` | aliments : unité, valeurs pour 100 g (table Ciqual 2020 de l'ANSES, ou étiquette type : voir `source`), conservation après réception |
| `stock.json` | achats : quantité, date de réception, date limite si connue, origine |
| `recipes.json` | bibliothèque ; si la fiche est chiffrée : `ingredients`, `portions` (repas), `fridgeDays` |
| `plan.json` | le plan : cuisson (`cook`, avec `ingredients` et `title` propres à ce repas si ajustés), reste (`leftover`), dehors (`out`) |
| `journal.json` | grignotages du soir, ajustements de stock, pesées |
| `settings.json` | profil et objectifs nutritionnels validés, fruits nature par jour |
| `snackIdeas.json` | idées pour le soir |

Le stock affiché n'est jamais enregistré : il est recalculé (achats moins plats cochés, grignotages et ajustements).
Chaque écriture passe par un fichier temporaire, et la version précédente part dans `data/.sauvegardes/`
(60 par fichier). Une installation neuve démarre avec le catalogue d'aliments de `starter/` et rien d'autre.

## Développer

```bash
npm ci
npm run dev          # dans le navigateur, sur http://localhost:5180, avec data/ du dépôt (ignoré par Git)
npm run tauri:dev    # dans la fenêtre native : attention, lit et écrit les vraies données de l'app
npm run verify       # TypeScript, tests du domaine (Vitest), tests des scripts de release
cargo test --manifest-path src-tauri/Cargo.toml
```

`?jour=2026-11-20` dans l'adresse simule une autre date. Logique pure dans `src/domain/`, écrans dans `src/views/`,
persistance dans `src/storage.ts` (navigateur ou natif) et `src-tauri/src/data.rs`.

Publier une version : [docs/RELEASE.md](docs/RELEASE.md).

## Repères nutritionnels

Calcul dans `src/domain/targets.ts`, bilan et à-côtés dans `src/domain/balance.ts` (purs, testés).

| Objectif | Valeur | Source |
|---|---|---|
| Métabolisme de base | équations de Henry (2005), poids et taille | EFSA, SACN |
| Dépense | métabolisme × niveau d'activité 1,4 / 1,6 / 1,8 | EFSA |
| Perte de poids | 0,25 ou 0,5 kg/semaine (7 700 kcal/kg), déficit plafonné à 20 % et jamais sous le métabolisme de base | |
| Protéines | référence 0,83 g/kg ; 1 g/kg en perte de poids ; 10 à 20 % de l'énergie | ANSES |
| Lipides, glucides | 35 à 40 %, 40 à 55 % de l'énergie | ANSES 2016 |
| Graisses saturées | au plus 12 % de l'énergie | ANSES 2016 |
| Sucres hors lactose | au plus 100 g/j | ANSES 2016 |
| Fibres | 30 g/j | ANSES |
| Sel | moins de 5 g/j (sel ajouté non compté) | OMS |
| Légumes et fruits | au moins 400 g/j | OMS, PNNS |

Ce sont des repères pour une personne adulte en bonne santé, pas un avis médical.
