# La performance, mesurée

Chantier 12 de `docs/ROADMAP-V1.md`. Ce document ne raconte pas une optimisation : il mesure d’abord, puis
dit ce qui passe, ce qui coûte et ce qui reste ouvert. Tous les chiffres viennent des scripts du dépôt et se
rejouent.

Mesures du 26 novembre 2026, sur le worktree `sitos-v3` (branche `v3/ludique`, HEAD `8ddc888`, modifications
non commitées en cours), avec le jeu de charge décrit plus bas.

**Verdict.** Le jeu de charge s’ouvre en 119,8 ms et l’interaction la plus lente du jeu de charge coûte 60 ms :
les seuils de la roadmap tiennent. Un seul dépassement, l’ouverture du catalogue à 189,7 ms, vient du catalogue
de 2 327 aliments et non du jeu de charge ; il reste ouvert, documenté plus bas.

## La machine et la méthode

| Élément | Valeur |
|---|---|
| Machine | Apple M5, 24 Go de mémoire |
| Système | macOS 27.0 (build 26A428) |
| Navigateur | Google Chrome 158.0.8127.89, sans interface, fenêtre 1440 × 900 |
| Application mesurée | build de production (`npm run build`), servie en local |
| Jour de référence | 2026-11-26 (les données de charge sont générées autour de ce jour) |
| Répétition | 5 séries, un onglet neuf par série, médiane retenue |

Deux temps sont distingués dans le navigateur, parce que le rythme d’affichage de Chrome sans interface fausse
la lecture :

- **rendu** : du clic ou de la frappe au moment où le DOM porte le nouvel état, donc après le commit React et
  avant la trame suivante. C’est le travail de l’application, celui qui compte pour le seuil des 100 ms.
- **à la trame** : le même instant plus l’attente de la trame suivante. Sans interface, cette attente est très
  irrégulière : le plancher mesuré à vide est de 85 ms sur le jeu de démonstration et de 125 ms sur le jeu de
  charge. Cette colonne n’est donc qu’une borne haute, pas une mesure de l’application.

Pour le domaine, les modules TypeScript sont chargés par Vite en mode SSR : on chronomètre le code réel, pas une
copie. Trois passages à blanc, puis sept passages chronométrés.

## Le jeu de charge

`scripts/charge.mjs` écrit un dossier de données complet, jamais dans `data/` :

```
node scripts/charge.mjs /chemin/du/dossier --today=2026-11-26 \
  --catalogue=/chemin/catalogue-2026-11-26.json
```

Le catalogue est figé par `--catalogue` : sans cette option le script lit `starter/foods.json`, qui peut évoluer
entre deux essais. Le 26 novembre 2026, le catalogue figé compte 2 327 aliments, empreinte
`e6f52ac2359c53ccc5d273db3132ad32b6c90112d7f3bba960fd9d93727b7132`. La copie figée est
`starter/foods.json` tel qu’il était ce jour-là ; elle n’est pas versionnée, mais son empreinte permet de
vérifier qu’on repart du même catalogue.

| Contenu | Valeur |
|---|---|
| Aliments | 2 327 |
| Recettes | 500, dont 131 réalisables avec le stock du jour |
| Achats | 2 000, du 26 novembre 2023 au 25 novembre 2026 |
| Plan | 1 014 entrées : 568 cuissons, 385 restes, 61 repas dehors |
| Journal | 925 compléments, 400 corrections de stock, 157 pesées |
| Fichiers | 2,22 Mo, dont `foods.json` 970 Ko, `recipes.json` 628 Ko, `journal.json` 266 Ko, `stock.json` 252 Ko, `plan.json` 151 Ko |
| Empreinte du dossier | `e3140c330a40df72280c9fc86933242fea2d6c04a34c19644582378863641b55` |

Le script est déterministe : deux exécutions dans deux dossiers, avec le même catalogue et le même jour, donnent
des fichiers identiques (vérifié par `diff -rq`). L’empreinte SHA-256 imprimée à la fin résume le dossier et se
compare d’une exécution à l’autre.

## Lancer l’application sur ce jeu de charge

Le plugin de développement (`server/dataPlugin.ts`) reçoit son dossier par `vite.config.ts` et ne lit aucune
variable d’environnement : il n’existe pas de second dossier de données accepté par le serveur de développement.
Deux autres voies étaient possibles : copier tout le worktree dans le dossier temporaire et y lancer un second
serveur, ou servir le build avec une API de données locale. La seconde est retenue :

- elle ne lance pas un second serveur de développement, ne touche pas à celui qui tourne sur le port 5184 et ne
  modifie ni `vite.config.ts` ni `data/` ;
- elle mesure l’application telle qu’elle est livrée (build de production), pas le mode développement ;
- les écritures (`PUT /api/data/<collection>`) sont acquittées et jetées : aucun fichier n’est écrit, ni dans le
  dossier de charge, ni dans `data/`, ni dans `~/Library/Application Support/com.aurelientrouble.sitos/`.

```
npm run build
node scripts/mesure-navigateur.mjs --dossier=/chemin/du/dossier --today=2026-11-26 --runs=5
```

Le script sert `dist/` et répond à `GET /api/data` en lisant les sept collections du dossier de charge. Une copie
complète du worktree aurait donné le même résultat pour un coût de mise en place plus élevé.

## Mesures du domaine

Médiane en millisecondes, 7 passages. Les deux jeux partagent le même catalogue de 2 327 aliments.

| Mesure | Démo | Charge | Écart |
|---|---:|---:|---:|
| `indexFoods` | 0,06 | 0,06 | 0 |
| `computeStock` | 0,19 | **4,58** | ×24 |
| `forecast` | 0,07 | 0,44 | ×6 |
| `priorities` | 0,04 | **14,0** | ×350 |
| `validatePlan` | 0,00 | **5,65** | |
| Portions du carnet (57 puis 500 recettes) | 0,14 | 1,07 | ×8 |
| **`derive` complet** | **0,55** | **26,9** | ×49 |
| `dayNutrition` du jour | 0,00 | 0,02 | |
| `shoppingList` | 0,32 | 0,52 | ×1,6 |
| Filtre « prêtes avec ton stock » | 0,02 | 0,13 | ×6 |
| Manquants par carte (57 puis 500) | 0,02 | 0,11 | ×5 |
| `searchFoods`, requête vide | 0,11 | 0,31 | ×3 |
| `searchFoods`, « tomate » | 4,15 | 4,04 | égal |
| `searchFoods`, « poulet » | 4,00 | 3,96 | égal |
| `searchFoods`, « introuvable » | 4,05 | 3,77 | égal |

## Mesures dans le navigateur

Médiane en millisecondes, 5 séries. La colonne « rendu » est le travail de l’application ; « trame » ajoute
l’attente de la trame, plancher compris.

| Mesure | Démo, rendu | Charge, rendu | Charge, trame |
|---|---:|---:|---:|
| Réponse de `GET /api/data` | 2,6 ms · 120 Ko | 13,8 ms · 1 574 Ko | |
| **Premier rendu** | **98,9** | **119,8** | |
| LCP | 92,0 | 120,0 | |
| Page Recettes | 15,5 | 40,7 | 77,8 |
| Page Mon frigo | 15,4 | 54,8 | 119,3 |
| Page Bilan | 11,1 | 27,9 | 114,2 |
| Page Ma semaine | 5,5 | 12,5 | 94,0 |
| Recherche de recette (« poulet ») | 1,8 | 5,4 | 122,1 |
| Afficher les 500 recettes | 11,7 | **60,0** | 133,2 |
| Ouverture du composeur | 10,6 | 8,8 | 111,1 |
| Ouverture du catalogue d’aliments | **235,2** | **189,7** | 226,4 |
| Recherche d’aliment (« tomate ») | 17,6 | 14,0 | 30,9 |
| Recalcul du stock, repas coché | 3,4 | **36,1** | 87,8 |

Le premier rendu du jeu de charge inclut le chargement et l’analyse de 1,57 Mo de JSON, le calcul de `derive`
et la première peinture de la semaine. Il coûte 21 ms de plus que la démonstration.

## Ce qui coûte

Le recalcul complet (`derive`) passe de 0,55 ms à 26,9 ms. Sa décomposition est nette :

- `priorities` : 14,0 ms, le premier poste. Pour chaque aliment à risque, il parcourt les 500 recettes et leurs
  ingrédients. C’est le seul calcul quadratique de la chaîne ;
- `validatePlan` : 5,65 ms, à cause de la recherche des restes de chaque cuisson dans toute la liste des entrées ;
- `computeStock` : 4,58 ms, avec 2 000 achats et 554 cuissons cochées, donc environ 4 000 lignes de consommation ;
- `forecast`, les portions du carnet et la liste de courses restent sous 1,1 ms chacun.

La recherche d’aliment coûte 4 ms sur 2 327 aliments, que la requête porte sur un mot, deux mots ou rien. Elle
n’est pas le point chaud. Le rendu de ses résultats, en revanche, l’est : voir le point ouvert plus bas.

Afficher les 500 recettes coûte 60 ms, contre 11,7 ms pour les 57 de la démonstration. La grille tient donc dans
le budget sans virtualisation à 1440 px. Le filtre par défaut n’en affiche que 131, ce qui coûte 40,7 ms au total
avec le rendu de la page.

## Verdict par rapport aux seuils

| Seuil de la roadmap | Mesure | Verdict |
|---|---|---|
| Premier rendu sous 1 s | 119,8 ms avec 500 recettes, 2 000 achats et 3 ans de plan | **tenu**, huit fois sous le seuil |
| Interaction sous 100 ms, changement de page | 12,5 à 54,8 ms selon la page | **tenu** |
| Interaction sous 100 ms, grille des recettes | 60,0 ms pour afficher les 500 cartes | **tenu** |
| Interaction sous 100 ms, ouverture du composeur | 8,8 ms | **tenu** |
| Interaction sous 100 ms, recherche d’aliment | 14,0 ms à l’écran, 4 ms dans le domaine | **tenu** |
| Interaction sous 100 ms, recalcul du stock | 36,1 ms, dont 26,9 ms de `derive` | **tenu** |
| Interaction sous 100 ms, ouverture du catalogue | 189,7 ms avec 2 327 aliments | **dépassé, hors jeu de charge** |

Le jeu de charge ne fait dépasser aucun seuil. La virtualisation de la grille des recettes n’est pas justifiée :
500 cartes se rendent en 60 ms. Aucun fichier de vue ou de domaine n’a été modifié pour ce chantier.

## Le point ouvert : le catalogue de 2 327 aliments

L’ouverture du sélecteur d’aliments coûte 189,7 ms sur le jeu de charge et 235,2 ms sur la démonstration. Les deux
jeux portent le même catalogue, l’écart est dans le bruit : ce n’est pas la charge qui coûte, c’est le nombre de
lignes dessinées d’un coup, 2 327. La recherche, elle, ne coûte que 4 ms ; c’est le rendu de la liste entière qui
dépasse.

Ce dépassement vient du catalogue livré, passé de 74 à 2 327 aliments par le chantier du catalogue en cours sur
le même worktree. Il n’est pas corrigé ici : le budget de fichiers de ce chantier ne couvre pas
`FoodPicker.tsx`, et la correction touche son interface (limiter les lignes rendues, ou virtualiser la liste),
qui appartient à ce chantier. La mesure est écrite pour qu’il la reprenne : une limite de résultats par famille,
ou une liste fenêtrée, doit ramener l’ouverture sous 100 ms.

Le poids du bundle mérite la même vigilance : `dist/assets/index-*.js` pèse 1 200 Ko (248 Ko compressés), dont
l’essentiel est le catalogue embarqué. Le build le signale déjà au-delà de 500 Ko. Rien n’a été changé sur ce
point, qui dépend de la façon dont le catalogue est livré.

## Rejouer les mesures

```
# 1. le jeu de charge, deux fois, et leur empreinte
cp starter/foods.json "$TMPDIR/catalogue-2026-11-26.json"
node scripts/charge.mjs "$TMPDIR/sitos-charge" --today=2026-11-26 \
  --catalogue="$TMPDIR/catalogue-2026-11-26.json"

# 2. le domaine : stock, projection, priorités, recherche
node scripts/mesure-domaine.mjs --dossier="$TMPDIR/sitos-charge" --today=2026-11-26

# 3. le navigateur : premier rendu et interactions
npm run build
node scripts/mesure-navigateur.mjs --dossier="$TMPDIR/sitos-charge" --today=2026-11-26 --runs=5
```

Les deux scripts de mesure acceptent `--json` pour la sortie brute. Le dossier de démonstration se lit dans
`data/` pour le domaine et pour le navigateur ; il n’est jamais écrit.
