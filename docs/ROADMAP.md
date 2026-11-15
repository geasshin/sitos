# Sitos : audit et feuille de route

Audit du 14 novembre 2026 sur la version 0.1.1, écran par écran, avec des données réelles copiées hors de l'app.
Rien de ce qui suit n'est décidé tant qu'Aurélien ne l'a pas validé : c'est une proposition, lot par lot.

## Le constat en une phrase

Le moteur est solide (stock recalculé, plan par cuisson, nutrition sourcée, mises à jour), mais l'app montre
la même information à plusieurs endroits, et deux défauts de logique faussent ce qu'elle affiche : les repas
passés non cochés et les portions jamais calibrées.

## 0. Arbitrages d'Aurélien (14 novembre 2026)

- Cinq onglets : validé (fait en 0.6, avec Poids dans Nutrition).
- Un, deux ou trois repas par jour : au choix de la personne, et le calendrier s'y adapte.
- Un repas passé non coché ne sort rien du stock. On ajoute des rappels pour le cocher, et l'app dit clairement
  que rien ne bouge tant qu'il ne l'est pas.
- Photos de recettes : gardées en cache local dans l'app (téléchargées une fois, jamais bloquantes).
- Recettes en double avec Sylloge : sans importance, on laisse les deux.
- Ordre des versions : validé tel quel.
- Travail par jalons : une version livrée et vérifiée à la fois.

## 1. Défauts de logique (à corriger avant tout)

| # | Constat | Effet visible | Proposition |
|---|---|---|---|
| L1 ✅ 0.2 | Un plat passé non coché n'est ni consommé ni prévu | Le Stock annonce « non prévu » pour des aliments déjà mangés | Bloc « N repas attendent une réponse » sur Aujourd'hui (Mangé / Pas mangé), règle dite en clair, même rappel dans le panneau du jour. Rien ne sort du stock sans case cochée |
| L2 ✅ 0.2 | Les portions sont des estimations jamais vérifiées | Les repas sortent à 900–1 100 kcal pour un repas principal visé à 1 700 | Après « C'est fait » : « La portion était… » (0,75 · 1 · 1,25). Le bilan suit, le stock ne bouge pas (le plat a bien été cuit entier). Reste à faire : proposer une correction de la fiche au bout de plusieurs réponses |
| L3 | Deux chemins pour noter le soir : les puces « Le soir » et « Pour compléter » | Les mêmes à-côtés apparaissent deux fois sur Aujourd'hui | Un seul sélecteur du soir, trié par ce qui comble le mieux la journée, avec ce qui est en stock |
| L4 ✅ 0.2 | Les kcal d'une recette changent selon l'écran | 964 kcal dans la liste, 1 128 dans le calendrier | La liste dit « par portion », le bilan dit « repas du jour » ou « par repas visé » |
| L5 ✅ 0.2 | Le poids du profil et les pesées étaient séparés | Les objectifs ne suivaient pas le poids réel | Bandeau dans Nutrition dès 2 kg d'écart, avec « Recalculer avec cette pesée » (jamais automatique) |
| L6 ✅ 0.2 | Les jauges n'avaient pas de code couleur cohérent | Le sel à 4,9 / 5 restait neutre | Ambre quand il manque quelque chose, rouge au-delà d'une limite, ambre dès 90 % d'un plafond |
| L7 | Les photos de recettes viennent de sites tiers | Certaines ne s'affichent plus (refus du site), d'autres disparaîtront | Option : garder une copie locale de la photo au moment où on l'ajoute |
| L8 🟡 0.2 | Le rythme existait dans les objectifs, mais le calendrier n'avait qu'une case | Choisir « trois repas » faussait le repas visé | Réglage « Repas principaux par jour » (Paramètres), objectifs partagés d'autant, deuxième repas possible le même jour sans décaler le premier. La grille à plusieurs cases par jour arrive en 0.4 |

## 2. Page par page

### Navigation ✅ 0.6

Aujourd'hui, Calendrier, Recettes, Stock, Nutrition, Poids, Paramètres : sept entrées, dont deux peu utilisées.

 ✅ **Cinq entrées** : Aujourd'hui · Semaine · Recettes · Stock · Nutrition, et Paramètres en bas. Le Poids est passé
dans Nutrition. Paramètres vit en bas de la barre, séparé par un filet ; « Annuler » n'existe plus à l'écran,
seulement ⌘Z, et une puce le rappelle quelques secondes après un changement.

### Aujourd'hui ✅ 0.3

Garder : le plat du jour et « C'est fait », le bilan, « À utiliser vite ».
Changer :
- ✅ **En haut, « À régler »** : bandeau ambre, « Mangé » ou « Pas mangé », avec la règle du stock dite une fois.
- ✅ **Le soir passe dans la colonne de gauche**, sous le plat : la journée se lit midi puis soir.
- ✅ **Un seul sélecteur du soir** : les à-côtés déjà retenus (avec leurs kcal), puis « Pour compléter la journée »
  avec ce que chaque choix apporte, puis « Autres idées » replié. Les sucreries passent en dernier.
- ✅ **Le bilan est compact** : quatre jauges, une phrase (« il manque surtout des protéines et de l'énergie »),
  et « Le détail » pour les limites et la répartition. Une valeur au-delà de l'objectif affiche son pourcentage.
- ✅ **Le message « le plat est petit » n'apparaît plus qu'une fois**, sur la carte du plat, avec « Ajuster la portion ».
- ✅ **« Plan jusqu'au 22 nov »** remplace « Jour 2 sur 8 » et mène à la fin du plan.
- ✅ **« Les prochains jours »** : bande de 3 lignes dans la colonne de droite, plus de cartes.
- Reste pour 0.4 : la grille du calendrier à plusieurs repas par jour.

### Calendrier → Semaine ✅ 0.4

Le plus gros chantier de composition.
- ✅ **Deux semaines** (celle en cours et la suivante), cases plus hautes, navigation par quinzaine et retour
  à « Aujourd'hui ». Le titre devient Semaine.
- ✅ **Une cuisson et ses restes forment un seul ruban** : cellules atténuées, filet continu, coins arrondis
  aux extrémités. Le glisser-déposer emmène toujours le bloc entier.
- ✅ Dans chaque case : le nom du plat, « 2 repas » ou « reste », la lune du soir, l'alerte, et un « +N » quand
  deux repas se superposent. Les kcal sont sorties des cases.
- ✅ **Panneau en deux onglets**, Repas et Bilan, actions groupées sous le plat, organisateurs en bas.
- ✅ **Planifier un jour vide** : « Avec ton stock, à faire vite » d'abord, puis Plats, puis Accompagnements.
  Le nombre de repas restants et les jours qu'ils occuperont sont annoncés avant de valider, avec le nombre
  de repas décalés. « Plat maison » devient « Sans fiche ».
- ✅ **Ligne de fin de quinzaine** : jours prévus, moyenne kcal et protéines, jours à remplir, produits à risque
  avec un lien vers le stock.
- ✅ Un « + » discret apparaît au survol d'un jour libre.

### Recettes ✅ 0.7

- ✅ **Filtre « Réalisables maintenant »**, actif par défaut : il ne garde que les recettes dont tous les
  ingrédients sont en stock. Chaque carte dit son état (« prêt », « il manque 2 produits », « à relier au stock »),
  et l'en-tête donne le compte. Quand rien ne passe, l'écran dit combien de recettes ne manquent que d'un produit.
- ✅ **Assistant de liaison au stock** pour les fiches Sylloge écrites en clair : l'app propose un produit et une
  quantité par ligne (« 100 g de semoule extra-fine » → Semoule, 100 g), laisse corriger, ignorer ce qui n'est pas
  suivi (eau, épices) et fixer le nombre de repas. Rien n'est enregistré avant validation.
- ✅ **Réglage « Repas par cuisson »** (2, 3 ou 4) dans Paramètres : la valeur par défaut quand la fiche ne dit rien.
- ✅ **Mode cuisine** : les étapes en grand, une par écran, sans la liste d'ingrédients. Flèches du clavier, Échap
  pour sortir, clic sur le texte pour avancer.
- ✅ **Photos gardées sur le Mac** : à la première ouverture d'une fiche, la photo est téléchargée une fois dans
  `covers/` du dossier de l'application, puis servie depuis le disque. Les sites qui refusent le partage entre
  origines n'étaient pas mettables en cache depuis le navigateur : le téléchargement passe donc par le côté natif.
  Paramètres montre le nombre de photos et la place prise, avec un bouton pour vider.

### Stock → Stock & courses ✅ 0.5

- ✅ **Vue par défaut : tout le stock**, trié par ce qui se périme d'abord, avec une recherche et l'en-tête de
  colonnes qui reste collé en haut. « À surveiller » devient un filtre parmi les autres.
- ✅ « Ajuster » devient **« Corriger »** (mangé hors plan, jeté, correction) ; « non prévu » remplace « en trop ».
- ✅ **Saisir une commande entière** : on colle les lignes, l'app reconnaît les produits (« 2 courgettes »,
  « 1 kg de riz », « 6 œufs », « 1 boîte de pois chiches »), montre ce qu'elle a compris, laisse rattacher les
  inconnus et corriger les quantités avant d'enregistrer. `src/domain/order.ts`, testé.
- ✅ **Liste de courses** en trois sections : il manque pour le plan (avec la date), presque fini, produits de base.
  Chaque ligne se coche, et la liste se copie en un clic. `src/domain/shopping.ts`, testé.
- ✅ Le réglage « fruits par jour » vit dans la liste de courses ; Paramètres y renvoie.

### Nutrition ✅ 0.6

- ✅ En tête, **trois chiffres de la semaine** (énergie, protéines, fibres) sous un titre « Cette semaine, en moyenne »,
  avec une phrase : « il manque surtout des protéines et de l'énergie ». Les mêmes chiffres ne sont plus répétés
  dans la moyenne : la colonne de gauche ne garde que les limites et la répartition.
- ✅ **Le graphique est cliquable** ; un jour ouvre son bilan juste dessous, avec un lien vers la semaine.
- ✅ **Le tableau à huit colonnes a disparu.**
- ✅ **« Cette semaine, essaie »** : deux ou trois gestes tirés des chiffres et du stock, avec un lien vers l'écran
  qui permet d'agir (le soir, le stock, la semaine).
- ✅ Les objectifs sont repliés quand ils existent (dépliés tant qu'il n'y a pas de profil).
- ✅ Le poids est une section de Nutrition (relevé, tendance, courbe, pesées), plus un onglet.

### Poids ✅ 0.6

Page fonctionnelle mais isolée. Devenue une section de Nutrition ; `#/weight` reste une adresse valable.

### Paramètres

Complète pour l'usage actuel. À ajouter plus tard : export et import de toutes les données (un fichier), et la
restauration d'une sauvegarde depuis l'app.

## 3. Doublons à trancher

| Doublon | Où | Proposition |
|---|---|---|
| À-côtés du soir | Aujourd'hui : « Le soir » et « Pour compléter » | Un seul sélecteur (L3) |
| Produits à surveiller | Aujourd'hui « À utiliser vite » et Stock « À surveiller » | Aujourd'hui garde un résumé de 3 lignes, le Stock garde le détail |
| Objectifs | Nutrition et Paramètres | Nutrition les définit, Paramètres n'est qu'un raccourci |
| Message « plat trop petit » | trois fois sur le même écran | Une fois, sur la carte du plat |
| Bibliothèque de recettes | Sitos et Sylloge (bibliothèque Recettes) | Décider laquelle fait foi. Sitos l'est déjà pour la cuisine |

## 4. Feuille de route proposée

Chaque version passe par la release manuelle et la mise à jour intégrée.

| Version | Thème | Contenu | Taille |
|---|---|---|---|
| 0.2 | Des chiffres justes | L1 repas non cochés, L2 calibrage des portions, L4 kcal explicites, L6 couleurs des jauges, L5 poids relié | M |
| 0.3 ✅ | Aujourd'hui | Bandeau à régler, soir unifié (L3), bilan compact, rapport du plat, bande de 3 jours | M |
| 0.4 ✅ | Semaine | Deux semaines, rubans de batch, panneau en onglets, planifier avec le stock, bilan de quinzaine | L |
| 0.5 ✅ | Stock & courses | Tout le stock, commande collée et reconnue, liste de courses copiable | L |
| 0.6 ✅ | Nutrition | Trois chiffres, graphique cliquable, « essaie », poids intégré, cinq onglets | M |
| 0.7 | Recettes | Relier au stock, portions, mode cuisine, photos locales (L7) | M |
| Plus tard | | Export/import complet, second repas par jour (L8), accompagnements combinés à un plat | |

## 5. Décisions qui reviennent à Aurélien

1. Navigation à cinq onglets, Poids dans Nutrition : oui ou non ?
2. Un seul repas par jour dans le calendrier (et retirer « deux / trois repas » des objectifs), ou un second repas ?
3. Repas passé non coché : le compter comme mangé par défaut, ou toujours demander ?
4. Photos de recettes : garder une copie locale ?
5. Sylloge garde-t-elle sa bibliothèque Recettes ?
6. L'ordre des versions ci-dessus, ou un autre.
