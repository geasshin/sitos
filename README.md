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

- **Aujourd'hui** : autant de repas que le réglage (1 à 3). La carte sépare la recette à gauche (titre et courte liste
  d'ingrédients) de la nutrition à droite (assiette de composition sur un repas unique, kcal / protéines / fibres).
  Une tuile carrée sans légende occupe le bas de la colonne gauche : photo carrée de la recette si elle existe,
  sinon une icône de couverts. Elle est centrée sur la hauteur des ingrédients placés à sa droite.
  Une barre d'actions groupée réunit « Modifier les ingrédients », « Voir la recette », « Je mange dehors » et
  « J'ai mangé » / « Je n'ai pas mangé » aligné à droite. Le mot **Repas principal** figure dans la carte, au-dessus du
  numéro et du nom du plat : même typographie et même icône de titre que **Bilan du jour**.
  Un seul module nutritionnel affiche un score circulaire, ce qu'il manque, les objectifs, la répartition et les
  compléments. Les suggestions et le catalogue complet (fenêtre avec recherche) utilisent des bases ajustables :
  œuf, clémentine, 100 g de skyr, 30 g de protéines de soja… on choisit le nombre de pièces ou de grammes avant l'ajout.
  Les suggestions privilégient la densité protéique quand l'énergie est presque couverte.
  Autour : « À utiliser vite » (périmations et lots entamés), « Demain » (icône du plat), « Poids » et
  « Dépense énergétique », ces deux derniers verrouillés en attendant une connexion à des applications de suivi.
- **Calendrier** : un ou plusieurs plats par jour. Glisser un plat le déplace avec ses restes. « Dehors » décale la suite.
  On planifie une recette de la bibliothèque ou un « plat maison » (un nom, puis ses ingrédients). Chaque cuisson a
  ses propres ingrédients : changer le nombre de repas, une quantité, retirer ou ajouter un ingrédient ne touche que
  ce repas, jamais la fiche (« Revenir à la fiche » annule l'ajustement).
- **Stock** : ce qui reste, jusqu'à quand ça se garde, ce qui risque de se perdre avec le plan actuel.
- **Nutrition** : « Mes objectifs », un questionnaire en quatre étapes (profil, activité, rythme des repas, objectif,
  façon de manger) qui calcule les cibles du jour selon les repères officiels, toutes retouchables. Puis la semaine :
  énergie par jour, moyenne face aux objectifs, répartition protéines / lipides / glucides, détail jour par jour.
- **Bilan de la journée** (calendrier et Aujourd'hui) : repas + compléments face aux objectifs (énergie, protéines, fibres,
  légumes et fruits ; graisses saturées, sucres hors lactose, sel à limiter), avec « reste » ou « dépassé » écrit
  en clair. « Pour compléter » propose les à-côtés qui comblent le mieux les manques avec ce qui restera en stock
  ce jour-là, sans jamais prendre un ingrédient réservé à un plat prévu.
- **Recettes** : la bibliothèque. Statut (À tester, Testée, Maîtrisée), type de plat, coups de cœur, note.
  Une fiche avec des quantités chiffrées a aussi des valeurs nutritionnelles.
- **Poids** : pesées et tendance lissée.

- **Paramètres** (⌘,) : version installée, recherche de mise à jour manuelle ou automatique, installation d'un clic ;
  objectifs nutritionnels, fruits par jour ; apparence (comme le Mac, clair, sombre) ; dossier des données et
  sauvegarde manuelle ; à propos et sources.
- **Repas non coché** : rien ne sort du stock tant que le repas n'est pas coché. Aujourd'hui le rappelle dans une
  notification en bas à droite, un repas à la fois : Mangé, ou Pas mangé (clos sans toucher au stock).
- **Portion** : dans le panneau du jour du calendrier, après « C'est fait », l'app demande si la portion était
  plus petite, comme prévu ou plus grosse. Ça change le bilan de la journée, jamais la fiche ni le stock.
- **Repas principaux par jour** (1 à 3) : Aujourd'hui affiche autant de cartes que ce réglage, et le calendrier
  accepte plusieurs repas le même jour sans décaler les autres. La part de la journée que pèse un repas suit le réglage.
- **Compléments** : dans le module Note du jour, un catalogue chiffré (un skyr, une banane, 10 g d'amandes…),
  les suggestions qui comblent le mieux la journée, la recherche, et la création d'un complément ou d'un aliment
  à la main. Ajouter un complément met le bilan et la note à jour et sort les quantités du stock.

- **Recettes** : bibliothèque héritée de Sylloge. Le filtre « Réalisables maintenant » ne montre que ce que le stock
  permet ; les fiches sans quantités se relient au stock en une minute (l'app propose produit et quantité par ligne).
  Mode cuisine pour les étapes en grand, photos gardées sur le Mac au premier affichage.
- **Barre basse** : Aujourd'hui · Semaine · Recettes · Stock · Nutrition, avec Paramètres à droite. Le Poids est
  une section de Nutrition (et reste joignable par l'adresse `#/weight`). Toute la largeur de la fenêtre sert au contenu.
- **Nutrition** : trois chiffres de la semaine face aux objectifs avec une phrase, un graphique cliquable qui ouvre
  le bilan du jour, « Cette semaine, essaie » avec deux ou trois gestes concrets, les objectifs (repliés une fois
  définis) et le poids.
- **Stock & courses** : tout le stock par date de péremption, recherche, correction d'une quantité. « Saisir une
  commande » accepte un texte collé (« 2 courgettes », « 1 kg de riz ») et propose ce qu'il a compris avant
  d'enregistrer. La liste de courses réunit ce qui manque pour le plan, ce qui va finir et les produits de base,
  se coche et se copie.
- **Semaine** : deux semaines à l'écran, navigation par quinzaine. Une cuisson et ses restes forment un seul ruban
  qui se glisse d'un bloc. Le panneau du jour a deux onglets, Repas et Bilan. Pour un jour vide, les recettes sont
  groupées par « ce qui fait passer le stock », plats, puis accompagnements, et le nombre de jours occupés par les
  restes est annoncé avant de valider. En bas, le bilan de la quinzaine : moyenne, jours à remplir, produits à risque.

⌘Z défait la dernière modification ; une puce « Modifié · Annuler » apparaît quelques secondes après un changement,
puis s'efface.

## Données

Un fichier JSON lisible par collection, dans `~/Library/Application Support/com.aurelientrouble.sitos/data/` :

| Fichier | Contenu |
|---|---|
| `foods.json` | aliments : unité, valeurs pour 100 g (table Ciqual 2020 de l'ANSES, ou étiquette type : voir `source`), conservation après réception |
| `stock.json` | achats : quantité, date de réception, date limite si connue, origine |
| `recipes.json` | bibliothèque ; si la fiche est chiffrée : `ingredients`, `portions` (repas), `fridgeDays` |
| `plan.json` | le plan : cuisson (`cook`, avec `ingredients` et `title` propres à ce repas si ajustés), reste (`leftover`), dehors (`out`) |
| `journal.json` | compléments du jour, ajustements de stock, pesées |
| `settings.json` | profil et objectifs nutritionnels validés, fruits nature par jour |
| `snackIdeas.json` | compléments personnels : un nom, une portion chiffrée |

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
