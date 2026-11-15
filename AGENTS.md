# Consignes pour travailler sur Sitos

## Le produit

- Application personnelle macOS (Tauri 2, React, TypeScript) : stock des courses du mois, calendrier un plat par jour,
  bibliothèque de recettes, nutrition, poids. Profil et contraintes de cuisine d'Aurélien : skill `cuisine-recettes`.
- Direction visuelle reprise de Sylloge (DESIGN.md de Sylloge) : monochrome froid, Syne en capitales, barre latérale îlot.
- Une recette de la bibliothèque n'est jamais modifiée pour adapter un repas : chaque cuisson du plan porte ses propres
  `ingredients` (et `title` pour un plat maison), voir `mealOf`/`mealOfCook` (src/domain/nutrition.ts) et
  `setIngredients`/`setPortions` (src/domain/plan.ts).
- Le stock n'est jamais écrit : il est recalculé (achats − plats cochés − grignotages − ajustements). Un repas non coché
  ne consomme rien : ne jamais déduire un plat passé par défaut. Les rappels (`pendingPast`, `setSkipped`) servent à le clore.
- `PlanEntry.eaten` (0,75 · 1 · 1,25) dit la portion réellement mangée : il ne change que le bilan de la journée,
  jamais les ingrédients consommés ni la fiche. `validatePlan` reçoit `mealsPerDay` : plusieurs repas le même jour
  ne sont une anomalie que si le réglage en prévoit moins.
- Nutrition : valeurs des aliments tirées de Ciqual 2020 (code dans `source`) ; objectifs calculés par `targets.ts`
  (Henry 2005, repères ANSES/OMS, sources dans le README) ; bilan et à-côtés par `balance.ts`. Toute règle chiffrée
  nouvelle cite sa source et a son test.

## Données et sécurité

- Le dépôt est **public**. Aucune donnée personnelle (stock, plan, recettes, pesées) n'y entre : `data/` est ignoré,
  `starter/` ne contient que le catalogue d'aliments et les idées pour le soir.
- Les vraies données vivent dans `~/Library/Application Support/com.aurelientrouble.sitos/data/`. Ne pas les ouvrir
  pour un essai. `npm run tauri:dev` les utilise : pour un essai natif, isoler `HOME`
  (`HOME=<scratch> RUSTUP_HOME=$HOME/.rustup CARGO_HOME=$HOME/.cargo npm run tauri:dev`).
- L'identifiant `com.aurelientrouble.sitos` et la clé publique de l'updater ne changent jamais : ils désignent le dossier
  des données et l'identité des mises à jour. La clé privée et son mot de passe sont dans `~/.tauri/` et dans les secrets
  GitHub ; ne jamais les afficher.

## Vérifier

`npm run verify`, `npm run build`, puis `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` et `cargo test`
dans `src-tauri/`. Pour une interface, `npm run dev` avec un `data/` factice et des captures (navigateur isolé d'Hermes).

## Livrer

- Ne pas commit, pousser ou publier sans demande explicite d'Aurélien.
- Un push sur `main` ne publie rien. La release se lance à la main (Actions › Release › Run workflow), voir docs/RELEASE.md.
