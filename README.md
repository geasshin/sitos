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
- **Nutrition** : énergie, protéines, fibres, légumes et fruits, par jour et par semaine (estimations type Ciqual).
- **Recettes** : la bibliothèque. Statut (À tester, Testée, Maîtrisée), type de plat, coups de cœur, note.
  Une fiche avec des quantités chiffrées a aussi des valeurs nutritionnelles.
- **Poids** : pesées et tendance lissée.

⌘Z (ou « Annuler » en bas de la barre latérale) défait la dernière modification.

## Données

Un fichier JSON lisible par collection, dans `~/Library/Application Support/com.aurelientrouble.sitos/data/` :

| Fichier | Contenu |
|---|---|
| `foods.json` | aliments : unité, valeurs pour 100 g, conservation après réception |
| `stock.json` | achats : quantité, date de réception, date limite si connue, origine |
| `recipes.json` | bibliothèque ; si la fiche est chiffrée : `ingredients`, `portions` (repas), `fridgeDays` |
| `plan.json` | le plan : cuisson (`cook`, avec `ingredients` et `title` propres à ce repas si ajustés), reste (`leftover`), dehors (`out`) |
| `journal.json` | grignotages du soir, ajustements de stock, pesées |
| `settings.json` | cibles nutritionnelles, fruits nature par jour |
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
