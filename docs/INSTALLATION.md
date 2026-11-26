# Installer Sitos

Sitos se distribue en dmg depuis les releases GitHub. L’application n’est pas notariée par Apple : au premier
lancement, macOS affiche un avertissement et demande un geste de plus. Ce document le décrit pas à pas, puis dit
où vivent les données et ce qui se passe lors d’une mise à jour.

## Ce qu’il faut

- un Mac sous macOS 11 ou plus, Apple Silicon ou Intel (l’application est universelle) ;
- le fichier `Sitos-macOS.dmg`, téléchargé depuis la page des releases ;
- un compte administrateur du Mac, pour confirmer l’ouverture dans les Réglages Système.

## 1. Télécharger

Ouvrir <https://github.com/geasshin/sitos/releases/latest> et prendre `Sitos-macOS.dmg` dans les fichiers de la
dernière release. Ne pas utiliser un dmg trouvé ailleurs : c’est le seul point de confiance de l’installation.

## 2. Installer

1. Double-cliquer le dmg : une fenêtre s’ouvre avec Sitos et le dossier Applications.
2. Glisser Sitos sur Applications.
3. Éjecter le dmg (le bouton d’éjection à côté de son nom dans la barre latérale du Finder).
4. Ouvrir Applications et double-cliquer Sitos.

## 3. Le premier lancement

### Ce que macOS affiche

**macOS 15 (Sequoia)** ouvre une alerte intitulée Élément « Sitos » non ouvert :

> Apple n’a pas pu confirmer que « Sitos » ne contenait pas de logiciel malveillant susceptible d’endommager
> votre Mac ou de porter atteinte à votre vie privée.

Deux boutons : « Placer dans la corbeille » et « Terminé ». Cliquer sur « Terminé » ; « Placer dans la corbeille »
mettrait l’application à la corbeille.

**macOS 14 (Sonoma)** affiche :

> « Sitos » ne peut pas être ouvert car Apple ne peut pas vérifier qu’il ne contient pas de logiciel malveillant.

Un seul bouton, « OK ». Le libellé exact varie légèrement d’une version de macOS à l’autre ; le sens et la suite
ne changent pas.

Sur macOS 15, le clic droit puis « Ouvrir » ne contourne plus l’alerte. Il faut passer par les Réglages Système.

### Chemin 1 : Réglages Système, puis « Ouvrir quand même »

1. Ouvrir Réglages Système (menu Apple › Réglages Système).
2. Aller dans Confidentialité et sécurité, puis descendre jusqu’à la section Sécurité.
3. La ligne qui nomme Sitos propose « Ouvrir quand même ». Cliquer dessus.
4. Confirmer avec Touch ID ou le mot de passe du Mac.
5. Sur macOS 15, un second avertissement s’affiche ; cliquer sur « Ouvrir ».

L’application démarre. macOS enregistre ce choix : les lancements suivants se font par un double-clic.

### Chemin 2 : la commande dans le Terminal

Ouvrir Terminal (Applications › Utilitaires › Terminal) et lancer :

```bash
xattr -d com.apple.quarantine /Applications/Sitos.app
```

Puis ouvrir Sitos normalement. La commande retire l’attribut de quarantaine que macOS pose sur tout fichier
téléchargé : sans cet attribut, Gatekeeper ne demande plus rien. Elle ne modifie pas l’application, ne la déplace
pas et ne l’ouvre pas.

- Si le Terminal répond « Operation not permitted », relancer avec `sudo` et le mot de passe du Mac :

  ```bash
  sudo xattr -d com.apple.quarantine /Applications/Sitos.app
  ```

- Si Sitos est installé ailleurs que dans Applications, remplacer le chemin par le sien.
- Pour vérifier que l’attribut est parti : `xattr -l /Applications/Sitos.app` ne doit plus afficher
  `com.apple.quarantine`.

### Pourquoi ce message, et pourquoi ce n’est pas un virus

macOS ne dit pas que Sitos contient un logiciel malveillant. Il dit qu’il n’a pas pu le vérifier. La vérification
demande deux choses que l’application n’a pas : une signature d’un développeur enregistré chez Apple, et une
notarisation, c’est-à-dire un examen du fichier par Apple avant publication.

Sitos est signé ad hoc (`signingIdentity: "-"` dans `src-tauri/tauri.conf.json`) : la signature scelle le paquet,
donc macOS voit s’il a été modifié après sa construction, mais elle ne désigne aucun développeur. Sans compte
développeur Apple, il n’y a pas de notarisation possible, donc pas de ticket à présenter à Gatekeeper.

Ce qu’on peut vérifier de son côté : le dmg est construit par la chaîne d’intégration du dépôt public
`geasshin/sitos` à partir du code publié, et il est attaché à la release par cette même chaîne. Le code est
lisible, l’archive de mise à jour est signée séparément en minisign.

Ce que cela implique, en revanche :

- vous ouvrez un fichier qu’Apple n’a pas examiné ; si le dmg vient d’un autre site ou d’un lien détourné, aucune
  vérification d’identité ne le distingue d’un fichier officiel ;
- l’exception est enregistrée pour cette application : les lancements suivants se font par un double-clic ;
- les données de Sitos ne sont pas chiffrées sur le disque (voir [SECURITY.md](../SECURITY.md)).

Ne pas contourner l’avertissement si macOS affiche autre chose : que Sitos est endommagé, ou qu’un logiciel
malveillant a été bloqué et placé dans la corbeille. Ces messages ne parlent pas de notarisation. Dans ce cas,
supprimer le fichier, le retélécharger depuis la page des releases, et s’arrêter là si le message revient.

## 4. Où vivent les données

Tout est dans le dossier de l’application, sur ce Mac :

```
~/Library/Application Support/com.aurelientrouble.sitos/
```

| Élément | Contenu |
|---|---|
| `data/foods.json` | les aliments et leurs valeurs pour 100 g |
| `data/stock.json` | les achats : quantité, date de réception, date limite |
| `data/recipes.json` | les recettes et leurs ingrédients |
| `data/plan.json` | les repas prévus, les restes et les jours dehors |
| `data/journal.json` | les compléments, les corrections de stock, les pesées |
| `data/settings.json` | le profil, les objectifs, l’apparence, la version du schéma |
| `data/snackIdeas.json` | les portions de complément enregistrées |
| `data/.sauvegardes/` | les copies automatiques et les sauvegardes manuelles |
| `covers/` | les photos de recettes gardées après le premier affichage |

Le bouton Paramètres › Données › « Ouvrir », à côté de « Dossier des données », ouvre ce dossier dans le Finder.

Une copie automatique de la collection est écrite dans `data/.sauvegardes/` avant chaque enregistrement d’un
fichier existant, et les 60 plus récentes par collection sont gardées. Une sauvegarde manuelle crée un sous-dossier
daté `manuel-AAAAMMJJ-HHMMSS` qui contient toutes les collections.

## 5. Sauvegarder avant une mise à jour

Une mise à jour ne touche pas aux données, mais une sauvegarde manuelle évite d’en dépendre. Trois façons :

1. **Sauvegarde manuelle** : Paramètres (⌘,) › Données › « Sauvegarder ». Le dossier créé apparaît dans
   `data/.sauvegardes/`, et la ligne dit « Sauvegarde faite. ».
2. **Export complet** : Paramètres › Données › « Exporter tout ». Un seul fichier
   `sitos-export-AAAA-MM-JJ.json` est produit ; il se copie sur un disque externe ou dans un dossier synchronisé.
3. **Copie du dossier** : dans le Finder, copier tout
   `~/Library/Application Support/com.aurelientrouble.sitos/data/` ailleurs.

Un export complet contient le journal et les pesées : le traiter comme une donnée de santé, ne pas le laisser
traîner dans un dossier partagé.

## 6. Mettre à jour

Sitos cherche une version plus récente deux secondes après l’ouverture, puis toutes les six heures, tant que la
recherche automatique est active (c’est le défaut). Quand il en trouve une, une carte apparaît en bas à droite :
« Sitos X.Y.Z est disponible », avec « Installer » et « Détails ». Rien ne s’installe sans un clic. La recherche
automatique se coupe dans Paramètres › Mises à jour › « Rechercher automatiquement ».

Pour chercher à la main : Paramètres › Mises à jour › « Rechercher ». La carte affiche alors le libellé
« Version installée », puis soit « Sitos est à jour. » avec l’heure de la vérification, soit la version disponible
et « Installer et redémarrer ».

Ce qui se passe pendant l’installation :

- l’archive est téléchargée depuis la release, puis vérifiée contre la clé publique minisign de
  `src-tauri/tauri.conf.json` avant toute écriture ; une archive qui ne correspond pas est refusée ;
- l’application redémarre sur la nouvelle version ;
- le dossier des données n’est pas remplacé : `data/`, `data/.sauvegardes/` et `covers/` restent en place ;
- aucune alerte Gatekeeper ne revient, puisque la mise à jour passe par la signature minisign et non par un
  fichier téléchargé dans le Finder.

Hors ligne, la recherche automatique échoue en silence. Une recherche manuelle affiche un message clair, par
exemple « Impossible de joindre le serveur des mises à jour. Vérifie la connexion. ».

Il n’y a pas de retour arrière automatique. Les versions précédentes restent téléchargeables depuis la page des
releases, mais une version plus ancienne refuse des données écrites par un schéma plus récent : faire une
sauvegarde manuelle avant de revenir en arrière.

## 7. Désinstaller

1. Quitter Sitos (⌘Q).
2. Glisser `/Applications/Sitos.app` à la corbeille.

Les données restent dans `~/Library/Application Support/com.aurelientrouble.sitos/`. Pour les effacer aussi,
supprimer ce dossier dans le Finder, après avoir exporté ce qu’on veut garder.

## 8. Si le lancement bloque encore

- **Sitos est endommagé et ne peut pas être ouvert** : la copie est incomplète ou le fichier a été modifié.
  Supprimer l’application, retélécharger le dmg et recommencer. Ne pas chercher à contourner ce message.
- **Rien ne se passe après « Ouvrir quand même »** : vérifier que Sitos est bien dans Applications et non lancé
  depuis le dmg. Sur macOS 15, le second avertissement demande encore « Ouvrir ».
- **L’application s’ouvre mais un écran d’erreur parle de fichiers illisibles** : ne rien supprimer. Le message
  indique le fichier en cause ; les copies de `data/.sauvegardes/` permettent de remettre une collection dans son
  état précédent par Paramètres › Données › « Restaurer ».
- **Un doute sur une erreur** : Paramètres › Données › « Journal des erreurs » garde les échecs d’écriture,
  d’import, de sauvegarde et de restauration, sans donnée personnelle.

La recette de vérification dans la vraie fenêtre, sur macOS 14 et 15, est dans [QA-NATIVE.md](QA-NATIVE.md).
