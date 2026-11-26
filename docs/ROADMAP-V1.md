# Sitos V1.0 : feuille de route

Document de travail du 25 novembre 2026, sur le worktree `sitos-v3` (branche `v3/ludique`).
Rien ici n’est engagé tant qu’Aurélien ne l’a pas validé. Chaque chantier se découpe en séances livrables.

## Le contrat de la V1

Sitos est une application qu’on ouvre chaque jour, plusieurs fois, sans y penser. La V1 doit tenir trois
promesses, et rien de plus :

1. **Je sais quoi manger aujourd’hui, et j’ai ce qu’il faut.** La semaine se remplit en quelques gestes, le
   frigo dit ce qui va se perdre, la liste de courses se déduit du plan.
2. **Je vois où j’en suis sans calculer.** Un score, quatre repères, trois plafonds, une tendance de poids.
   L’information est juste et se lit en trois secondes.
3. **Je ne perds jamais une donnée.** Sauvegarde automatique, export lisible, mise à jour qui n’abîme rien.

Ce qui n’est pas dans le contrat : synchroniser entre appareils, tenir un compte, sortir sur iPhone, brancher
une balance connectée.

## Les décisions déjà prises

Elles sont acquises, je ne les redemande pas.

- **Pas de notarisation Apple.** La release reste en signature ad hoc, avec un message d’installation honnête
  et une capture pas à pas. Le dépôt GitHub et ses secrets sont accessibles, donc la CI peut publier.
- **La cuisson en lot est dans la V1**, et elle doit être irréprochable. Le modèle est écrit plus bas, noir sur
  blanc, parce que c’est là que l’essai précédent a échoué.
- **Le glisser-déposer revient** dans la liste de la semaine, avec les règles de dépôt explicitées plus bas.
- **Pas de mode sombre en V1.** Le clair fait référence. Les jetons sombres restent dans le code, hérités et
  non vérifiés, au cas où l’envie reviendrait.

## Ce qui est verrouillé

Une refonte qui contredit ces points sera refusée.

- **Quatre portes** : Ma semaine, Recettes, Mon frigo, Bilan, plus Paramètres à part. Aujourd’hui a fusionné
  avec la semaine, et cette fusion tient.
- **La charte** : papier crème, encre brune, pastels qui portent un sens, Fredoka pour les titres et les
  chiffres, Nunito pour le texte, forme bombée, ombre franche.
- **Une information, un endroit** : le bilan vit dans Bilan, la semaine ne le duplique pas.
- **La semaine est l’objet** : sept lignes qu’on remplit, une par jour, dans l’ordre du calendrier.
- **Rien ne sort du stock sans une coche**, et un repas passé non coché ne consomme rien.
- **Le dépôt est public** : aucune donnée personnelle n’y entre, ni recette, ni pesée, ni stock.

## Où en est le code

| Mesure | Valeur |
|---|---|
| Lignes TypeScript et TSX | 10 665 |
| Tests unitaires | 88, plus 4 tests du script de release |
| Pages refaites | Ma semaine, Recettes, Mon frigo, Bilan, fiche recette |
| Pages encore à l’ancienne | Paramètres (305 lignes), éditeur de recette (141) |
| Plus gros composant vivant | `MealComposer.tsx`, 706 lignes |
| Code mort après la refonte | `Today.tsx` 355, `Calendar.tsx` 705, `NutritionPanel.tsx` 201, `MealCard.tsx` 210, `TodayExtras.tsx` |
| Feuilles de style | `styles.css` 2 054 lignes (ancienne charte), `theme.css` environ 500 (nouvelle) |
| Livraison | `release.yml`, updater minisign, signature ad hoc |
| Sauvegardes | copies locales datées, pas d’export portable, pas d’import |

Le moteur métier est solide et testé : stock recalculé, jamais écrit ; plan par cuisson avec ses propres
ingrédients ; nutrition issue de Ciqual ; objectifs calculés par `targets.ts`.

## Le modèle de la cuisson en lot

C’est le point qui a raté la dernière fois. Le modèle d’abord, l’écran ensuite.

**Une fournée, pas un repas.** Quand on compose un plat, on décrit une cuisson : des ingrédients pour la
fournée entière, et le nombre de repas qu’elle donne. Une cuisson de deux repas porte les quantités de deux
repas, et se divise en deux portions. Il n’y a jamais deux vérités sur les quantités.

**L’écran le dit avant la saisie.** La feuille demande d’abord « pour combien de repas ? » (1, 2, 3 ou 4, avec
la valeur du réglage comme défaut). Ensuite chaque ingrédient saisi est étiqueté « pour 2 repas », et le pied
de la feuille montre les deux lectures côte à côte : le total de la fournée et ce que ça fait par repas. Le
référentiel est écrit à côté de chaque chiffre, donc on ne peut plus se tromper de base.

**Les restes ne se devinent pas, ils se placent.** Dès qu’une cuisson donne plus d’un repas, la feuille
propose de placer les portions restantes sur les jours suivants, avec l’aperçu des jours déjà occupés. Chaque
portion placée devient une ligne *reste* liée à sa cuisson, visible dans la semaine par un ruban discret qui
relie les jours concernés.

**Glisser-déposer, trois règles.**

| Geste | Ce qui se passe |
|---|---|
| Déplacer une cuisson entière | Le lot et ses restes se déplacent ensemble, quantités intactes |
| Déposer sur un jour déjà rempli | Un choix s’ouvre : remplacer, ajouter un second repas, annuler, avec aperçu |
| Déposer une seule portion | Cette portion se copie avec ses quantités par repas ; le total de la fournée ne bouge pas |

**Ce que l’app ne fait jamais.** Doubler des ingrédients en silence. Recalculer un lot après coup. Consommer
un repas non coché. Modifier une recette du carnet pour arrondir un plan.

## Les dix chantiers

### Chantier 1. Finir la refonte

**Objectif** : plus une seule page à l’ancienne, plus une ligne de code morte.

Livrables :
- Paramètres redessiné en quatre blocs : toi (profil, objectifs), la cuisine (repas par jour, portions par
  cuisson, apparence), les données (sauvegardes, export, dossier), l’application (version, mises à jour).
- Éditeur de recette redessiné : fiche en une colonne, ingrédients cherchés dans le catalogue, photo, étapes.
- Suppression de `Today.tsx`, `Calendar.tsx`, `NutritionPanel.tsx`, `MealCard.tsx`, `TodayExtras.tsx`,
  `EveningPicker.tsx`, de leurs styles, et de `styles.css` une fois les derniers îlots migrés.
- Primitives partagées dans `src/components/kit.tsx` avec leur CSS : pastille, bouton, jauge, carte, titre de
  section, ligne de fait. Une page ne redéfinit plus un bouton.

**Sortie** : `styles.css` supprimé, aucune référence à l’ancienne charte, six pages vérifiées en clair à
1440 et 980 px.

### Chantier 2. La langue et les états vides

**Objectif** : que chaque phrase dise une chose vraie et courte, et qu’aucun écran vide ne laisse sans issue.

Livrables :
- Lexique unique : *repas*, *portion*, *reste*, *complément*, *plafond*, *repère*. Un même mot pour une même
  chose, partout, consigné dans `docs/LEXIQUE.md`.
- Réécriture des micro-textes fautifs repérés : « 250 g en trop » (Mon frigo), « cible 2 000 kcal » dans une
  ligne de repas, « Il manquera encore », les libellés de boutons hétérogènes.
- « Remplir une ligne » disparaît au profit de « Proposer une semaine », qui dit ce que ça fait.
- Un état vide par page, avec une action : rien de prévu (composer), aucune recette (ajouter), frigo vide
  (saisir une commande), aucune pesée (noter), aucune recherche (effacer les filtres).
- Messages d’erreur utiles et sans jargon : enregistrement échoué, photo introuvable, sauvegarde impossible.
- Apostrophe typographique partout, aucun tiret cadratin, majuscules accentuées.

**Sortie** : chaque écran a été relu contre le lexique, et un écran sans données propose toujours l’étape
suivante.

### Chantier 3. Un seul catalogue, un seul sélecteur

**Objectif** : qu’un aliment existe une fois, et se choisisse partout de la même façon.

Le défaut constaté : les compléments proposent une liste d’idées figées, donc un aliment absent de cette
liste ne peut pas être ajouté comme complément. Ingrédients et compléments doivent puiser dans le même
catalogue.

Livrables :
- Un catalogue unique d’aliments, avec ses valeurs Ciqual, sa portion usuelle et son unité. Les « idées de
  complément » deviennent des portions mémorisées sur un aliment, rien de plus.
- Un composant `FoodPicker` unique, utilisé par : composer un repas, ajouter un complément, écrire une
  recette, saisir un achat, corriger une quantité.
- Dans le sélecteur : recherche tolérante aux accents, familles, récents, fréquents, « ce que j’ai en stock »
  en tête, et création d’un aliment à la volée sans quitter la saisie.
- Partout où on saisit une quantité, l’unité est explicite et les valeurs s’affichent en direct pour la
  quantité tapée.
- Migration des idées existantes vers le catalogue, sans rien perdre.

**Sortie** : ajouter un complément absent des suggestions se fait en trois gestes, et le même aliment se
retrouve dans une recette, un repas et un achat avec une seule fiche.

### Chantier 4. Les surfaces : feuilles et fenêtres repensées

**Objectif** : une seule façon d’ouvrir un panneau, quelle que soit la tâche.

Aujourd’hui, composer un repas peut empiler trois fenêtres : composeur, catalogue, création. Les fenêtres
actuelles ont gardé l’allure de l’ancienne charte.

Livrables :
- Un composant `Sheet` unique : en-tête avec titre et fermeture, corps qui défile, pied avec l’action
  principale et une seule action secondaire. Bordure encre, ombre franche, coins larges.
- Trois tailles seulement, et jamais deux feuilles empilées : le catalogue s’ouvre dans la feuille en cours,
  en panneau latéral, et la création d’un aliment s’y fait en ligne.
- Clavier complet : Échap ferme, Entrée valide, ⌘Entrée valide et ferme, le focus reste dans la feuille et
  revient à son point d’origine à la fermeture.
- Feuille plein écran sur fenêtre étroite, même en-tête, même pied.
- Une zone de notification unique en bas à droite pour les confirmations et les échecs, avec annulation
  possible quelques secondes.
- Les confirmations destructrices passent par la même feuille, jamais par une alerte du navigateur.

**Sortie** : aucune fenêtre n’en ouvre une autre, tout se ferme à Échap, et les six parcours principaux se
font entièrement au clavier.

### Chantier 5. Composer un repas, le geste central

**Objectif** : planifier un repas en moins de trente secondes, sans réfléchir à la structure.

`MealComposer.tsx` fait 706 lignes et concentre le geste le plus fréquent. Je le redessine entièrement sur
le modèle de cuisson en lot.

Livrables :
- Quatre sources, présentées à plat : *une recette du carnet*, *un plat maison*, *avec ce que j’ai*, *un
  reste à placer*.
- Le nombre de repas demandé d’abord, puis les ingrédients, chaque ligne étiquetée « pour N repas ».
- Recherche instantanée dans le catalogue, quantités au clavier, total recalculé à la frappe, valeurs par
  repas affichées en permanence.
- Aperçu du bilan du jour en direct, avec la cible du repas.
- Mémoire des ingrédients par recette, duplication d’un repas d’une semaine sur l’autre.
- Placement des portions restantes proposé puis ajustable, avant validation.
- Annulation immédiate, brouillon conservé si la feuille se ferme.

**Sortie** : composer un repas de douze ingrédients en moins de huit interactions, au clavier, et placer les
deux portions restantes dans le même parcours.

### Chantier 6. La semaine : planifier, déplacer, cuisiner en lot

**Objectif** : passer d’une semaine vide à une semaine planifiée en un geste, et pouvoir la corriger.

Livrables :
- **Proposer une semaine** : une proposition construite avec les recettes réalisables et les produits à
  sauver, relue, modifiable ligne par ligne, jamais appliquée sans un clic.
- Glisser-déposer selon les trois règles du modèle : lot entier, dépôt sur un jour occupé, portion seule.
- ~~Ruban de lot visible sur les jours reliés~~ : écarté par Aurélien le 26 novembre. Aucun lien dessiné entre
  deux jours d’une même fournée, ni trait, ni liseré, ni pastille de lot. Le nom du plat, identique sur les deux
  jours, est le signal ; la puce « reste » et le compteur de portions disent la nature de chaque jour.
- Bouton **Resserrer** : supprime les jours vides entre deux jours planifiés, en montrant le décalage avant.
- Navigation de semaine en semaine, retour à aujourd’hui, repère de la semaine en cours.
- Repas passés non cochés rappelés dans la ligne du jour concerné, plus de notification flottante.
- Marquer un jour *dehors* reste accessible, et le jour sort du bilan sans casser la semaine.
- Une ligne vide propose en un clic les recettes réalisables avec le stock du moment.

**Sortie** : une semaine de sept jours se planifie, se déplace et se corrige sans quitter la page, et un lot
de deux repas se comprend sans explication ; test d’usage sur une semaine réelle.

### Chantier 7. Mon frigo, vérité du stock

**Objectif** : que le frigo dise la vérité sur ce qu’on possède, et ce qu’il faut acheter.

Livrables :
- Fraîcheur lisible : date, pastille, tri par urgence, bandeau *à sauver* qui ouvre les produits concernés.
- Produits ouverts et entamés, avec leur propre compte à rebours.
- Correction d’une quantité en place, suppression d’un achat saisi par erreur, avec annulation.
- Saisie d’une commande par texte collé, avec relecture avant ajout (déjà amorcée dans `OrderImport.tsx`).
- Liste de courses déduite du plan, cochable pendant les courses, copiable en texte pour la partager.
- Achats récurrents proposés à partir de l’historique, avec la fréquence réelle.

**Sortie** : après une commande réelle saisie, le frigo et la liste de courses sont justes sans correction
manuelle, et une semaine de courses se fait avec l’app seule.

### Chantier 8. Bilan, la lecture qui donne envie

**Objectif** : répondre à « où j’en suis » en trois secondes, sans culpabiliser.

Livrables :
- Anneau de score expliqué en une ligne, avec la définition figée et documentée.
- Repères du jour en jauges, plafonds qui virent au rose en cas de dépassement.
- Lecture de la semaine, comparaison à la semaine précédente, repérage des jours vides.
- Poids : tendance lissée, rythme hebdomadaire, saisie rapide, recalcul proposé des objectifs quand le poids
  bouge de plus de deux kilos.
- Objectifs : questionnaire guidé au premier lancement, modifiable ensuite, avec la source de chaque repère.

**Sortie** : un utilisateur qui n’a jamais vu l’app comprend le score et sait quoi changer sans ouvrir l’aide.

### Chantier 9. Robustesse et données

**Objectif** : ne rien perdre, tenir la charge, se remettre d’une erreur.

Livrables :
- Schéma de données versionné, migrations testées, refus explicite d’un fichier trop récent.
- Export complet en un fichier JSON lisible, plus un export des recettes seules ; import avec relecture.
- Sauvegardes automatiques rendues visibles, restauration en un clic, vérification après restauration.
- Volumétrie : 500 recettes, 2 000 achats, 3 ans de plan. Mesure du premier rendu et de la recherche, avec
  virtualisation des longues listes si nécessaire.
- Journal local des erreurs, consultable depuis Paramètres, sans donnée personnelle.
- Mode démo isolé, qui ne peut pas écrire dans les vraies données.

**Sortie** : restauration complète depuis un export sur une machine vierge, et ouverture sous une seconde
avec le jeu de charge.

### Chantier 10. Sortie V1.0

**Objectif** : une version qu’on installe sans explication et met à jour sans risque.

Livrables :
- Numérotation propre : `0.1.0` laisse place à `1.0.0`, et la CI refuse une release sans notes.
- Fenêtre de bienvenue au premier lancement : à quoi sert l’app, d’où viennent les objectifs, où sont les
  données, comment démarrer une semaine.
- Installation sans notarisation : message clair dans le README et dans la release, capture pas à pas.
- Mise à jour testée depuis l’ancienne version, vérification de la signature, retour arrière possible.
- Page de release avec captures et liste des fonctions, README à jour.
- Check-list de QA native sur macOS 14 et 15, dans la fenêtre Tauri.

**Sortie** : un dmg installé sur une machine vierge, lancé, utilisé une semaine, puis mis à jour, sans perte.

### Chantier 11. La marque

**Objectif** : que l’icône du Dock et la marque de la barre disent la même chose que les écrans.

Livrables :
- Une marque neuve, dessinée pour la charte v3 : papier crème, encre brune, un seul accent pastel, formes pleines,
  lisible à 16 px dans la barre comme à 1 024 px dans le Dock.
- Déclinaisons : marque seule (barre, favicon), marque avec le mot `sitos`, icône d’application macOS et Windows.
- L’icône Tauri régénérée par la commande officielle depuis un seul fichier source, avec toutes ses tailles.
- Le fichier source du dessin conservé dans le dépôt, avec la palette et les règles d’usage en clair.
- Ce qui est écarté : un logotype typographique complexe, un dégradé, une ombre portée, une icône qui ne tient pas à 32 px.

**Sortie** : l’app installée se reconnaît dans le Dock sans lire son nom, et la marque de la barre ne jure pas avec la page.

### Chantier 12. La performance

**Objectif** : que l’app reste immédiate quand les données grossissent, pas seulement sur le jeu de démonstration.

Livrables :
- Jeu de charge reproductible : 500 recettes, 2 000 achats, trois ans de plan et de journal, généré par un script
  du dépôt, jamais à la main.
- Mesures écrites et versionnées : premier rendu, changement de page, recherche d’aliment, recherche de recette,
  ouverture du composeur, recalcul du stock. Seuils : premier rendu sous une seconde, interaction sous 100 ms.
- Mémoire du profil, pour savoir ce qui coûte : le recalcul du stock et les index de recherche sont les premiers suspects.
- Virtualisation des longues listes seulement si la mesure l’exige, avec la preuve avant et après.
- Budget de poids du bundle surveillé : aucun module chargé au démarrage qui ne serve pas la première page.

**Sortie** : le jeu de charge s’ouvre sous une seconde et reste fluide au défilement, chiffres à l’appui.

### Chantier 13. La sécurité et la vie privée

**Objectif** : un dépôt public, des données personnelles locales, et aucune mauvaise surprise.

Livrables :
- Politique de sécurité du contenu (CSP) vérifiée dans la fenêtre Tauri, sans `unsafe-inline` évitable, et documentée.
- Tout ce qui sort de la machine est inventorié : mises à jour, photos de recettes distantes, rien d’autre par défaut.
  Une requête sortante non documentée est un défaut.
- Dépendances : audit des vulnérabilités connues, versions figées, et une règle écrite pour les mises à jour.
- Données : ce que contient chaque fichier, où il vit, ce qui est ignoré par Git, et un contrôle automatique qui refuse
  un fichier de données dans un commit.
- Sauvegardes et exports : aucun secret, aucun jeton, aucune donnée d’un autre profil.
- Permissions Tauri réduites au strict : les commandes natives exposées sont listées et justifiées une par une.
- Un fichier `SECURITY.md` qui dit comment signaler un problème et ce qui n’est pas un problème.

**Sortie** : une revue de sécurité passée sur le code livré, les points ouverts connus et écrits, et la CSP active.

## L’ergonomie, transverse

Ces points ne sont pas un chantier, ils conditionnent chacun d’eux.

- **Trois secondes pour comprendre un écran.** Un titre qui dit la tâche, une action principale par écran,
  jamais deux boutons noirs en concurrence.
- **Rien qui demande une explication.** Si un mot a besoin d’être défini, il change.
- **Tout est réversible.** Annulation après chaque action, y compris une suppression et une proposition
  appliquée.
- **Clavier d’abord.** ⌘K ouvre la recherche globale, ⌘N compose un repas, ⌘Z annule, Échap ferme, Entrée
  valide. Les raccourcis sont listés dans un panneau d’aide.
- **Aucune attente muette.** Les chargements et les états vides disent ce qui se passe, rien ne bloque plus
  d’une seconde sans retour.
- **Le chiffre juste au bon endroit.** Une quantité s’écrit toujours avec son référentiel : par repas, pour
  la fournée, ou pour la journée.

## Ce qui n’entre pas en V1

- Synchronisation entre appareils, compte, stockage distant.
- Version iPhone ou iPad, application web.
- Balance connectée, HealthKit, données de pas et de dépense.
- Import d’une recette depuis un lien, lecture d’un ticket de caisse.
- Suggestions par modèle de langue.
- Multilingue.
- Mode sombre soigné.

Ces sujets reviennent en V1.1 si l’usage le demande.

## Ordre et dépendances

| Ordre | Chantier | Dépend de | Séances estimées |
|---|---|---|---|
| 1 | Finir la refonte | rien | 3 à 4 |
| 2 | La langue et les états vides | 1 | 1 à 2 |
| 3 | Un seul catalogue, un seul sélecteur | 1 | 3 à 4 |
| 4 | Les surfaces | 1 | 2 à 3 |
| 5 | Composer un repas | 2, 3, 4 | 3 à 4 |
| 6 | La semaine, la cuisson en lot, le glisser-déposer | 5 | 4 à 5 |
| 7 | Mon frigo | 3 | 3 à 4 |
| 8 | Bilan | 4 | 2 à 3 |
| 9 | Robustesse et données | 1 | 3 à 4 |
| 10 | Sortie V1.0 | tous | 2 à 3 |
| 11 | La marque | 1 | 1 |
| 12 | La performance | 1, 6 | 2 |
| 13 | La sécurité et la vie privée | 1 | 2 |

Total : trente et une à quarante et une séances. Les chantiers 7, 8 et 9 peuvent avancer en parallèle du 5 et du 6,
ce sont des fichiers disjoints. Le 11 se traite quand la charte est figée, et il ne touche qu'aux ressources
(marque, favicon, icônes), jamais aux écrans.

Une séance vaut un lot vérifié : `npm run verify`, un build, et des captures en clair à 1440 et 980 px.

## Check-list de sortie

À cocher avant de taguer `v1.0.0` :

- [ ] `npm run verify` et `cargo clippy --all-targets -- -D warnings` passent
- [ ] les six pages vérifiées en clair, à 1440 et 980 px
- [ ] une semaine planifiée de bout en bout avec de vraies données, lots compris
- [ ] un lot de deux repas déplacé, une portion seule copiée, un dépôt sur jour occupé
- [ ] une commande saisie, une liste de courses faite
- [ ] export, restauration, mise à jour testés
- [ ] ouverture sous une seconde avec le jeu de charge
- [ ] aucune donnée personnelle dans le dépôt ni dans les rapports d’erreur
- [ ] README, notes de release et captures à jour
