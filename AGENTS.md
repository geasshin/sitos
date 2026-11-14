# Consignes pour travailler sur Sitos

## Le produit

- Application personnelle macOS (Tauri 2, React, TypeScript) : stock des courses du mois, calendrier un plat par jour,
  bibliothèque de recettes, nutrition, poids. Profil et contraintes de cuisine d'Aurélien : skill `cuisine-recettes`.
- Direction visuelle reprise de Sylloge (DESIGN.md de Sylloge) : monochrome froid, Syne en capitales, barre latérale îlot.
- Une recette de la bibliothèque n'est jamais modifiée pour adapter un repas : chaque cuisson du plan porte ses propres
  `ingredients` (et `title` pour un plat maison), voir `mealOf`/`mealOfCook` (src/domain/nutrition.ts) et
  `setIngredients`/`setPortions` (src/domain/plan.ts).
- Le stock n'est jamais écrit : il est recalculé (achats − plats cochés − grignotages − ajustements).

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
