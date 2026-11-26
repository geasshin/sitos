# Sécurité de Sitos

Sitos est une application macOS personnelle : le stock, les recettes, le plan, le journal et les pesées restent sur le Mac qui l’utilise. Il n’y a ni compte, ni serveur Sitos, ni télémétrie.

## Signaler une vulnérabilité

Le dépôt est public : n’ouvre pas une issue avec les détails d’une faille non corrigée.

1. Le rapport privé GitHub n’est pas activé sur ce dépôt aujourd’hui. Ouvre une issue courte qui demande un canal privé, sans exploit, sans donnée personnelle et sans secret.
2. Si tu es le mainteneur, active **Settings › Code security › Private vulnerability reporting** pour que l’onglet **Security** propose « Report a vulnerability ».
3. Donne la version de Sitos, macOS, les étapes de reproduction et l’effet observé. N’envoie jamais le dossier `data/` réel, une sauvegarde ou un export.

Le projet est maintenu par une seule personne : la réponse est au mieux, sans engagement de délai.

## Versions prises en charge

Seule la dernière version publiée dans les [releases](https://github.com/geasshin/sitos/releases) reçoit des correctifs. Les versions précédentes ne sont pas maintenues.

## Ce qui est protégé

- **Les mises à jour sont signées.** Sitos vérifie la signature minisign de l’archive avant de l’installer, et n’installe que la version annoncée par le manifeste. La clé publique est dans `src-tauri/tauri.conf.json`, la clé privée n’est pas dans le dépôt.
- **Le manifeste des mises à jour vient d’une adresse fixe**, `https://github.com/geasshin/sitos/releases/latest/download/latest.json`. Aucun jeton, aucun compte, aucune adresse fournie par l’utilisateur.
- **Les liens ouverts par l’application sont une liste fermée** : releases, dépôt, Ciqual. La commande native refuse toute autre cible.
- **La politique de sécurité du contenu (CSP)** interdit les scripts distants et l’évaluation de code dans la version publiée. Le détail est dans `docs/SECURITE.md`.
- **Les données ne sont pas dans le dépôt.** `data/` est ignoré par Git, et `npm run check:data` échoue si un fichier de données y entre.
- **Aucune donnée n’est envoyée à un serveur Sitos**, puisqu’il n’y en a pas. Les seules sorties réseau sont les mises à jour, les photos de recettes et les liens ouverts à la demande.

## Ce qui n’est pas protégé

- **Les données locales ne sont pas chiffrées.** Les fichiers JSON sont lisibles par toute personne qui a accès à ta session macOS ou à ton disque déverrouillé. FileVault et un compte macOS protégé sont la vraie barrière.
- **L’application n’est pas notariée par Apple.** Elle est signée ad hoc. Au premier lancement, macOS demande de passer par Réglages Système › Confidentialité et sécurité. La première installation dépend donc de la confiance dans le dépôt GitHub et dans le fichier téléchargé ; les mises à jour suivantes sont signées.
- **Les photos de recettes sont chargées depuis leur site.** L’adresse de l’image, ton adresse IP et ton user-agent sont visibles par ce site. Sitos ne transmet ni recette, ni stock, ni referrer.
- **Un lien de source de recette ouvre une page externe** quand tu cliques dessus. Cette page n’est pas contrôlée par Sitos.
- **Un processus malveillant qui tourne avec ton compte** peut lire les données et les sauvegardes. Aucune application locale ne peut s’en protéger seule.
- **Les exports et les sauvegardes ne sont pas chiffrés.** Un export complet contient le journal et les pesées : traite-le comme une donnée de santé.

## Ce qui n’est pas une vulnérabilité

- Pas de compte, pas de mot de passe, pas de connexion : c’est le modèle de l’application.
- Les fichiers `data/*.json` sont lisibles en clair : c’est voulu, pour que les données restent récupérables sans Sitos.
- Sitos interroge GitHub au démarrage pour chercher une mise à jour : c’est une requête HTTPS vers une adresse fixe, sans donnée personnelle. La recherche automatique se coupe dans Paramètres.
- Les photos distantes ne sont pas un traqueur : Sitos ne pose pas de cookie et n’envoie pas de referrer.
- L’absence de chiffrement au repos n’est pas un défaut caché : elle est écrite ici et dans `docs/SECURITE.md`.

## Où vivent les données

- Données : `~/Library/Application Support/com.aurelientrouble.sitos/data/`
- Sauvegardes automatiques et manuelles : le sous-dossier `data/.sauvegardes/`
- Cache des photos : `~/Library/Application Support/com.aurelientrouble.sitos/covers/`
- Exports : le dossier de téléchargement choisi par macOS, jamais le dépôt.

Ne joins jamais ces fichiers à une issue. Pour reproduire un problème, utilise un jeu de données factice.
