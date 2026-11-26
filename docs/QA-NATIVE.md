# Recette native, macOS 14 et 15

Cette recette se fait dans la vraie fenêtre Tauri, jamais dans le navigateur de développement : c’est la seule
qui vérifie le dossier des données, le glisser-déposer au pointeur, l’export, la sauvegarde et la mise à jour.
Elle suit l’ordre d’un premier usage, sur une installation neuve.

## Avant de commencer

| Élément | À noter |
|---|---|
| Version testée | la version affichée dans Paramètres › Mises à jour, « Version installée » |
| Build | le dmg de la version à publier, ou `npm run tauri:build` |
| Machine | Mac de test, ou compte macOS neuf sur un Mac : jamais les données réelles de quelqu’un |
| Système | macOS 14 et macOS 15, une colonne par système |
| Fenêtre | 1440 × 900, puis la largeur minimale de 980 px pour l’étape 13 |

Préparer deux fichiers, et ne rien mettre d’autre dans le dossier des données :

1. un export de recettes `sitos-recettes-AAAA-MM-JJ.json` contenant **quatre recettes reliées au stock** (avec
   ingrédients et quantités) et **une recette écrite en clair** (des lignes d’ingrédients, pas encore d’aliments) ;
2. une liste d’achats en texte, par exemple `2 courgettes`, `1 kg de riz`, `6 œufs`, `1 pot de skyr`.

Sans recettes, « Proposer une semaine » n’a rien à proposer : une installation neuve ne contient que le catalogue
d’aliments et les idées de complément.

Importer l’export une fois la fenêtre de bienvenue passée : Paramètres › Données › « Choisir un fichier… »,
puis « Reprendre les recettes ». Saisir ensuite la liste d’achats dans Mon frigo › « Coller une liste d’achats »,
pour que la proposition de semaine ait du stock où puiser.

Pour l’étape 1, installer le dmg par le Finder et ne pas retirer la quarantaine avant le premier lancement :
c’est l’alerte de macOS qu’on vérifie.

Si la recette tombe un dimanche, ouvrir d’abord la semaine suivante avec la flèche de droite : l’étape 3 a besoin
de deux jours à venir dans la semaine affichée.

## La recette

Dans chaque case macOS, écrire la date (JJ/MM) et les initiales de la personne qui a testé. Une case vide est une
étape non faite.

| # | Geste | Résultat attendu | macOS 14 date · initiales | macOS 15 date · initiales |
|---|---|---|---|---|
| 1 | Double-cliquer Sitos dans Applications, pour son premier lancement sur ce Mac. | L’alerte Gatekeeper décrite dans [INSTALLATION.md](INSTALLATION.md) s’affiche. Après « Ouvrir quand même », la fenêtre « Bienvenue » s’ouvre : quatre blocs (une semaine de repas, d’où viennent les repères, où vivent les données, par où commencer) et le bouton « Commencer ». Entrée ou Échap la ferment aussi. Ma semaine apparaît ensuite, sept jours vides. | ☐ ____ / ____ | ☐ ____ / ____ |
| 2 | Cliquer « Proposer une semaine ». Décocher une ligne s’il y en a plus d’une, puis « Placer N repas ». | La feuille liste les jours vides avec une recette, une raison (« prête avec ton stock », « sauve … », « il manque N aliments »), les kcal par portion et le nombre de portions. La ligne décochée n’est pas posée. Après validation, la semaine porte les repas et l’en-tête dit « N jours remplis sur 7 ». Aucune recette n’a été modifiée. | ☐ ____ / ____ | ☐ ____ / ____ |
| 3 | Saisir la poignée « Déplacer » d’un repas non coché, la glisser sur un autre jour libre de la même semaine, relâcher. Recommencer sur un jour déjà occupé, puis choisir « Décaler ». | Pendant le glissement, le jour visé s’éclaire et affiche « Déposer ici » ; au relâchement, le repas change de jour avec ses restes s’il en a, quantités inchangées. Sur un jour occupé, la feuille « Ce jour est déjà occupé » propose « Décaler », « Remplacer » et « Annuler » ; « Décaler » décale la suite sans perdre un repas. | ☐ ____ / ____ | ☐ ____ / ____ |
| 4 | Ouvrir la ligne d’aujourd’hui, section « Pour compléter » › « Ajouter un complément » : chercher un aliment, régler la quantité, « Ajouter ». | L’aliment entre dans la liste des compléments du jour, avec ses kcal et ses protéines ; le total de la journée monte ; le stock baisse de la quantité ajoutée ; ⌘Z défait l’ajout. | ☐ ____ / ____ | ☐ ____ / ____ |
| 5 | Recettes, ouvrir la fiche écrite en clair ; carte « Reliée au stock » › « Relier les N ingrédients ». Choisir un aliment par ligne, corriger une quantité, « Relire », puis « Relier N ingrédients ». | Chaque ligne reliée montre l’aliment et sa quantité ; « Relire » annonce ce qui sera enregistré et ce qui manque au stock ; après confirmation, la fiche a ses ingrédients et ses valeurs, la carte « Sort du stock » remplace « Reliée au stock ». Le stock n’a pas bougé à cette étape. | ☐ ____ / ____ | ☐ ____ / ____ |
| 6 | Mon frigo › « Ajouter un achat » : aliment, quantité, « Reçu le », « À consommer avant le », puis « Ajouter au stock ». | L’achat apparaît dans le rayon de l’aliment avec sa date ; le compteur d’aliments en stock augmente ; un produit proche de sa date limite entre dans « à surveiller ». | ☐ ____ / ____ | ☐ ____ / ____ |
| 7 | Ma semaine, sur un jour à un seul repas : cocher la case du repas (infobulle « Marquer comme mangé »), puis la décocher. | La coche reste, l’infobulle passe à « Repas mangé, appuyer pour annuler » ; les ingrédients sortent du stock ; Bilan compte le repas. Décocher remet le stock et le bilan comme avant. | ☐ ____ / ____ | ☐ ____ / ____ |
| 8 | Bilan : lire l’anneau, « Les repères du jour », « Les plafonds », « La semaine ». Cliquer une autre barre de jour. | L’anneau affiche un pourcentage et « score du jour » ; les quatre repères et les trois plafonds portent la valeur du jour et la valeur visée ; changer de jour change le détail sous l’anneau sans quitter la page ; les chiffres du repas coché se retrouvent à l’identique. | ☐ ____ / ____ | ☐ ____ / ____ |
| 9 | Paramètres (⌘,) › Données › « Exporter tout », puis « Exporter les recettes ». | Sitos affiche « Téléchargement lancé : sitos-export-AAAA-MM-JJ.json », puis le même message pour `sitos-recettes-AAAA-MM-JJ.json`. Les deux fichiers existent hors de l’application, s’ouvrent dans un éditeur de texte et portent un en-tête `application`, `format`, `schemaVersion`, `exportedAt` ; l’export complet contient les sept collections. | ☐ ____ / ____ | ☐ ____ / ____ |
| 10 | Paramètres › Données › « Sauvegardes automatiques » › « Restaurer » sur la copie la plus récente. Écrire « restaurer », puis « Restaurer ». | La feuille « Restaurer une sauvegarde » annonce la collection, la date, la taille et le nom du fichier. Après confirmation : « Restauration terminée. », les comptes avant et après, et le nom de la copie faite avant l’écriture. La liste se rafraîchit. | ☐ ____ / ____ | ☐ ____ / ____ |
| 11 | Paramètres › Mises à jour › « Rechercher ». | Soit « Sitos est à jour. » avec l’heure de vérification, soit « Sitos X.Y.Z est disponible » avec ses notes et « Installer et redémarrer ». Si la version proposée est installée : l’application redémarre sur la nouvelle version, les données et les réglages sont ceux d’avant, aucune alerte Gatekeeper ne revient. | ☐ ____ / ____ | ☐ ____ / ____ |
| 12 | Quitter avec ⌘Q, puis rouvrir Sitos depuis Applications. | La fenêtre revient sur Ma semaine, avec le même plan, le même stock et le même bilan ; la fenêtre « Bienvenue » ne s’ouvre plus ; aucune puce « Modifié » au démarrage. | ☐ ____ / ____ | ☐ ____ / ____ |
| 13 | Réduire la fenêtre à 980 px de large et parcourir Ma semaine, Recettes, Mon frigo, Bilan et Paramètres. | Aucune barre de défilement horizontale, aucun texte coupé, aucun bouton hors de la fenêtre. Les cartes se resserrent, les tableaux restent lisibles. | ☐ ____ / ____ | ☐ ____ / ____ |

L’étape 11 n’est testable que si une version plus récente est publiée le jour de la recette. Sinon, écrire
« non testable » et la refaire le jour de la publication.

## Ce qui doit faire échouer la recette

Un seul de ces points suffit : la version ne sort pas.

- **Perte de donnée** : un repas, un achat, une recette, une pesée ou un réglage disparaît sans geste ; un
  compteur change sans action ; une restauration rend moins que ce que la copie annonçait ; un fichier de
  `data/` manque après une fermeture.
- **Plantage** : fenêtre blanche, chargement sans fin, application qui quitte seule, message d’erreur avec un
  chemin de fichier ou un code technique.
- **Débordement horizontal** : barre de défilement horizontale, contenu coupé, bouton inaccessible à 980 px.
- **Texte anglais** : un libellé, une infobulle, un message d’erreur ou un nom de fichier en anglais.
- **Un contrôle muet** : un bouton qui ne fait rien, une action annoncée et absente, une feuille qui ne se ferme
  pas à Échap.

## Noter une étape qui échoue

Pour chaque échec : le numéro de l’étape, ce qui était attendu, ce qui s’est passé, une capture de la fenêtre
entière, et la ligne correspondante du « Journal des erreurs » (Paramètres › Données). Donner la version de Sitos
et celle de macOS. Ne joindre ni le dossier `data/`, ni une sauvegarde, ni un export : ils contiennent des
données personnelles.

## En fin de recette

| | macOS 14 | macOS 15 |
|---|---|---|
| Date | | |
| Personne | | |
| Version exacte de macOS | | |
| Version de Sitos | | |
| Étapes faites sur 13 | | |
| Décision (sortie, correctifs) | | |
