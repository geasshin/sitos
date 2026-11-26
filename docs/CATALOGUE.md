# Le catalogue d’aliments

Le catalogue par défaut de Sitos. Une seule liste, qui sert partout : les ingrédients d’une recette,
les compléments d’un repas, les achats du frigo.

Décision du 26 novembre : il doit tenir des milliers d’entrées, pour qu’on puisse taper « chips »,
« brownie », « kebab » ou « banane » et obtenir une valeur nutritionnelle, au lieu de composer avec
une liste courte écrite à la main.

## La source

**ANSES, Table de composition nutritionnelle Ciqual 2020**, licence CC BY 4.0 (réutilisation libre,
attribution obligatoire). C’est la même table que celle d’où venaient les 74 aliments d’origine, dont
on retrouve les codes dans le champ `source`.

- Miroir utilisé : <https://zenodo.org/records/4770600>, qui porte les fichiers publiés par l’ANSES.
  Le site `ciqual.anses.fr` répond 503 aux requêtes automatisées, il n’est pas utilisable par un script.
- Table complète : 3 185 aliments. **3 022** rejoignent le catalogue ; 105 sont écartés, faute d’énergie
  et de macronutriments exploitables.

## Régénérer

```sh
curl -sL -o /tmp/ciqual.zip "https://zenodo.org/api/records/4770600/files/XML_2020_07_07.zip/content"
unzip -o /tmp/ciqual.zip -d /tmp/ciqual_xml
node scripts/import-ciqual.mjs /tmp/ciqual_xml
npm test
```

Le script est déterministe : à fichier source égal, il produit le même `starter/foods.json`. Il
conserve en tête les aliments écrits à la main, avec leurs conditionnements et leurs poids de pièce,
et ne réimporte jamais un code déjà cité dans un `source`.

**Piège de la source.** Les fichiers XML de l’ANSES ne sont pas valides : on y trouve des `&` et des
`<` bruts dans les noms, « Panaché préemballé (<1° alc.) », « elle & Vire ». Tout analyseur XML les
refuse. Le script les échappe avant de lire, c’est la première chose qui casse quand on reprend le
fichier.

## Ce que l’import décide

| Champ | Règle |
|---|---|
| `id` | `ciqual-<code>`, jamais réutilisé, jamais dérivé du nom |
| `name` | le nom de la table, espaces normalisés |
| `category` | famille de la table, corrigée par la sous-famille pour légumes, fruits, légumineuses, oléagineux, pommes de terre et biscuits apéritifs |
| `unit` | `ml` pour les boissons, `g` partout ailleurs |
| `per100` | énergie (UE 1169/2011), protéines N × 6.25, glucides, sucres, lactose, lipides, AG saturés, fibres, sel |
| `storage`, `shelfLifeDays` | valeurs de travail par famille, l’ANSES n’en donne pas : elles ne servent qu’au rangement et à la projection du stock |
| `source` | `Ciqual 2020 <code>` |

Deux règles de cohérence, appliquées à l’import : **un total ne peut pas être plus petit que son
composant**. Quand la table ne donne pas les lipides mais donne les acides gras saturés, le total
reprend la valeur des saturés. Même chose pour les glucides et les sucres.

**L’énergie manquante se calcule.** L’ANSES ne chiffre pas l’énergie de 723 aliments, dont beaucoup de
gâteaux, de biscuits et de plats composés, alors qu’elle donne leurs macronutriments. Le script applique
la formule officielle du règlement UE 1169/2011, annexe XIV : 4 kcal par gramme de glucides et de
protéines, 9 par gramme de lipides, 2 par gramme de fibres. Le calcul est écrit dans `source`
(« Ciqual 2020 1006 · énergie calculée ») et un test vérifie qu’il ne se fait jamais passer pour une
mesure. Un aliment qui n’a ni énergie ni macronutriments reste dehors : 105 cas.

## Ce que le catalogue ne couvre pas

- **Les marques.** L’ANSES ne décrit pas les produits de marque : « coca », « nutella », « prince »
  ne trouvent rien. Deux réponses possibles, aucune n’est faite à ce jour : des `aliases` sur
  l’aliment visé, ou des fiches écrites à la main avec la valeur d’étiquette, comme le fait déjà
  `source: "étiquette type"`.
- **Quelques produits absents de la table 2020** : pas d’entrée « donut », et aucun produit de marque,
  l’ANSES n’en décrivant aucun.
- **874 aliments de la table** n’ont pas de valeur d’énergie et restent dehors.

## Vérifier

`src/domain/catalogue.test.ts` garde l’ensemble : identifiants uniques, familles connues, valeurs
plausibles et sans trou, cohérence sucres/glucides et saturés/lipides, plus les mots qu’on tape
vraiment (« chips », « brownie », « kebab », « creme » sans accent). Un import cassé se voit là avant
d’arriver dans l’application.

## Ce que le catalogue couvre, en clair

| Famille | Entrées | Exemples réels |
|---|---|---|
| Plats composés | 34 | lasagnes 134 kcal, hachis parmentier 138, gratin de poisson 105 |
| Pizzas, tartes et crêpes salées | 49 | pizza margherita 227, tarte, quiche |
| Sandwichs et burgers | 48 | kebab 233, pain à burger 293, croque |
| Desserts et gâteaux | 55 | cheesecake 330, brownie 458, gâteau forêt noire |
| Biscuits | 85 | cookie 502, madeleine 464, biscuit de Savoie 260 |
| Viennoiseries | 18 | croissant 375, pain au chocolat 423, chausson 338 |
| Salé apéritif | 46 | chips 545, biscuit apéritif 484, galette de riz 385 |
| Glaces et sorbets | 20 | sorbet 108, bâtonnet |
| Chocolat et confiserie | 30 | chocolat au lait 537, bonbons 411, guimauve 343 |
| Charcuteries | 96 | rillettes 390, jambon, saucisson |
| Fromages | 44 | comté 418, camembert 280, chèvre 252 |
| Boissons | 200 | jus d’ananas 52, bière 12, vin rouge 82 |
