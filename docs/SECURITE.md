# Revue de sécurité de Sitos

État au 26 novembre 2026, branche `v3/ludique`. Ce document est la version détaillée de `SECURITY.md` : il inventorie ce qui sort de la machine, ce que la CSP protège, ce que les dépendances exposent, ce que contiennent les données et ce que les commandes Tauri permettent. Les points ouverts sont écrits, pas cachés.

Le dépôt `geasshin/sitos` est public. Les données de la personne qui utilise Sitos ne le sont pas.

## 1. Sorties réseau

L’application installée ne fait aucun `fetch`, aucune `XMLHttpRequest`, aucun WebSocket et aucun `sendBeacon` dans le front. Le seul `fetch` de `src/storage.ts` sert au développement dans le navigateur (`/api/data`, plugin Vite) et n’est jamais exécuté quand `__TAURI_INTERNALS__` existe. Les requêtes réelles partent de commandes natives ou d’un clic.

| Sortie | Appelant | Ce qui sort | Nécessaire ? |
|---|---|---|---|
| Manifeste de mise à jour, `https://github.com/geasshin/sitos/releases/latest/download/latest.json` | `updater.rs` via `check_for_app_update`, appelé par `UpdateNotice` 2 s après le lancement puis toutes les 6 h si la recherche automatique est active, et par Paramètres en manuel | GET HTTPS vers GitHub, puis redirection vers `release-assets.githubusercontent.com`. En-têtes HTTP standard, version de l’app et plateforme nécessaires au manifeste. Ni compte, ni jeton, ni donnée personnelle | Oui, c’est la mise à jour |
| Archive de mise à jour, `https://github.com/geasshin/sitos/releases/download/<tag>/Sitos.app.tar.gz` | `install_app_update`, après un clic sur « Installer » | GET HTTPS de l’archive indiquée par le manifeste vérifié, puis contrôle de la signature minisign avant écriture et redémarrage | Oui, c’est l’installation |
| Photos de recettes, adresse `recipe.cover` | `Cover` (`src/components/recipe.tsx`) appelle `cover_cache`, qui lance `/usr/bin/curl -sSL --fail --max-time 25`. Le webview charge aussi l’adresse distante le temps que le cache réponde, avec `referrerPolicy="no-referrer"` | GET HTTPS, ou HTTP pour une ancienne adresse, vers le site de la photo. Sortent l’adresse IP, le user-agent et le SNI ; ni recette, ni stock, ni referrer. La photo est ensuite servie depuis `covers/` | Oui, pour afficher les photos. Le cache évite les requêtes répétées |
| Lien de source d’une recette, `recipe.source` | Clic sur la puce de source dans `RecipeDetail` (`<a target="_blank" rel="noreferrer">`) | Navigation vers l’adresse saisie dans la fiche, dans une nouvelle fenêtre ou le navigateur selon le webview. Requête déclenchée par l’utilisateur, pas par l’application | Oui, c’est un lien que l’utilisateur a enregistré |
| Liens fixes : releases, dépôt, Ciqual | `open_link` depuis Paramètres et l’aide | Ouverture dans le navigateur système de l’une des trois adresses de `data.rs` (`link_url`). Toute autre cible est refusée | Oui, action explicite |
| `/api/data`, `/api/data/backups` | `src/storage.ts` uniquement quand l’app tourne dans un navigateur (`npm run dev`) | Lecture et écriture des JSON de `data/`, liste et restauration des copies, par le serveur Vite local, sur la machine | Développement seulement, jamais dans le bundle Tauri |

Aucune autre requête n’est documentée dans le code. Les seules adresses distantes stockées dans les données sont les photos et les sources des recettes, saisies par la personne ou reprises d’un export.

### Ce que la CSP ne couvre pas

La CSP s’applique au webview. Elle ne s’applique pas aux requêtes Rust : l’updater et `curl` sortent même si `connect-src` les interdirait au front. C’est voulu, et c’est pourquoi ces deux chemins sont inventoriés ici séparément.

## 2. Politique de sécurité du contenu

Politique de production, dans `src-tauri/tauri.conf.json` :

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' asset: http://asset.localhost https:;
font-src 'self'; connect-src 'self' ipc: http://ipc.localhost;
object-src 'none'; base-uri 'self'; form-action 'none';
frame-src 'none'; frame-ancestors 'none'
```

| Directive | Pourquoi elle est là | Peut-elle être resserrée ? |
|---|---|---|
| `default-src 'self'` | Tout ce qui n’est pas nommé reste local | Non, c’est le socle |
| `script-src 'self'` | Seul le bundle de l’app s’exécute. Aucun `unsafe-eval`, aucun `unsafe-inline`, aucun CDN | Non. C’est le point le plus important |
| `style-src 'self' 'unsafe-inline'` | React écrit des attributs `style="…"` (14 occurrences dans les composants). Sans `unsafe-inline`, ces styles sont bloqués | Oui, mais cela demande de remplacer les styles en ligne par des classes ou des variables CSS, donc de toucher aux vues. Non fait dans cette passe, et documenté |
| `img-src 'self' asset: http://asset.localhost https:` | Les photos de recettes sont des adresses distantes quelconques, saisies par la personne. `asset:` sert le cache local via `convertFileSrc` | `https:` reste large par nature : la liste des sites de recettes n’est pas fermée. `data:` et `blob:` ont été retirés, aucun asset du bundle n’en a besoin |
| `font-src 'self'` | Les deux woff2 sont embarqués | `data:` a été retiré, aucun font en data URL |
| `connect-src 'self' ipc: http://ipc.localhost` | IPC de Tauri. `http://ipc.localhost` est la forme Windows, `ipc:` la forme macOS | Oui, aucun appel réseau du front. Rien d’autre n’est autorisé |
| `object-src 'none'`, `frame-src 'none'`, `frame-ancestors 'none'` | Pas de plugin, pas d’iframe, pas d’intégration | Non |
| `base-uri 'self'`, `form-action 'none'` | Empêche un `<base>` injecté et l’envoi d’un formulaire | Non |

`devCsp` ajoute `'unsafe-inline'` et `'unsafe-eval'` pour le HMR de Vite, et `ws://localhost:5180 http://localhost:5180` pour le serveur de développement. Ces relaxations n’existent que dans `devCsp` et ne partent pas dans le bundle.

Changements de cette passe : retrait de `data:` et `blob:` de `img-src` (inutilisés par le bundle construit), retrait de `data:` de `font-src`, ajout de `frame-ancestors 'none'`. Aucune vue n’a été touchée.

## 3. Dépendances

### npm

`npm audit --omit=dev` : 0 vulnérabilité. `npm audit` complet : 0 vulnérabilité. Les versions installées sont celles des `package-lock.json` et `package.json` du dépôt (React 19, Vite 8, TypeScript 7, Tauri API 2.12).

### Cargo

`cargo audit` au départ signalait deux vulnérabilités :

| Crate | Version | Avis | Effet | Correctif |
|---|---|---|---|---|
| `cookie` | 0.18.2 | RUSTSEC-2026-0594, sévérité 6,5 | Nonces de cookie privés répétés dans un processus qui `fork` | 0.18.3 |
| `url` | 2.5.8 | RUSTSEC-2026-0592 | Débordement de pile dans `Url::origin()` sur des URL `blob:` imbriquées | 2.5.9 |

Les deux dépendent de Tauri (`cookie` via `tauri`/`wry`, `url` via `tauri`, `tauri-utils` et `reqwest` de l’updater). Sitos ne `fork` pas et ne traite pas d’URL `blob:` imbriquées fournies par un tiers : les deux avis n’étaient pas atteignables dans l’usage normal. Ils ont tout de même été corrigés par une montée de version patch, sans changement d’API :

```bash
cargo update -p cookie --precise 0.18.3
cargo update -p url --precise 2.5.9
```

Après la mise à jour : `cargo audit` ne signale plus aucune vulnérabilité. Il reste six avertissements, qui ne sont pas des vulnérabilités :

- `chrono`, `proc-macro-error`, `zbus_names`, `zvariant`, `zvariant_derive` : non maintenus.
- `glib` : implémentations `Iterator` non sûres, mais c’est une dépendance Linux.

Aucun de ces six crates n’est compilé dans le binaire macOS : `cargo tree -i <crate> --target aarch64-apple-darwin` ne trouve rien pour chacun. Ce sont des dépendances de build, d’autres cibles ou d’autres greffons, présentes dans le `Cargo.lock` mais absentes de ce qui est livré.

Règle de mise à jour : avant chaque release, `npm audit --omit=dev` et `cargo audit`. Une alerte de sécurité se corrige par une version patch quand elle existe ; une montée de version majeure de Tauri se teste avec `npm run verify`, `cargo clippy` et un lancement natif. Les fichiers `package-lock.json` et `src-tauri/Cargo.lock` restent versionnés : ce sont eux qui fixent ce qui est construit.

## 4. Données

### Ce que contient chaque fichier

| Fichier | Contenu | Sensibilité |
|---|---|---|
| `foods.json` | Catalogue d’aliments, valeurs Ciqual, aliments créés | Faible seule, révèle le régime |
| `stock.json` | Achats, quantités, dates de réception et de péremption, notes | Personnelle |
| `recipes.json` | Recettes, ingrédients, étapes, notes, photos et sources | Personnelle |
| `plan.json` | Repas planifiés, dates, portions, restes, repas mangés ou sautés | Personnelle |
| `journal.json` | Compléments, corrections de stock, pesées | Personnelle, les pesées sont une donnée de santé |
| `settings.json` | Objectifs nutritionnels, profil (sexe, âge, taille, poids, activité, régime, rythme), préférences, `schemaVersion` | Personnelle |
| `snackIdeas.json` | Idées de compléments | Faible |

Les fichiers vivent dans `~/Library/Application Support/com.aurelientrouble.sitos/data/`. Les sauvegardes automatiques (60 par collection au plus) et les sauvegardes manuelles vivent dans `data/.sauvegardes/`. Les photos téléchargées vivent dans `covers/`, à côté de `data/`.

Le webview garde aussi deux petits états locaux, hors des fichiers : le journal des erreurs (`localStorage`, 200 entrées au plus, chemins et URL remplacés par `[chemin]` et `[lien]`) et les filtres de la page Recettes (`sessionStorage`, effacés à la fermeture). Ni l’un ni l’autre n’est envoyé sur le réseau.

Les fichiers ne sont pas chiffrés et ne portent pas de permissions particulières au-delà de celles du compte macOS. La protection réelle est FileVault, la session macOS et le contrôle d’accès du dossier personnel. Un export complet contient tout, journal et pesées compris ; un export de recettes ne contient ni stock, ni plan, ni pesées.

### Ce que Git ignore

`.gitignore` couvre `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/schemas/`, `data/`, les exports `sitos-export-*.json` et `sitos-recettes-*.json`, `*.local`, `.DS_Store` et `.playwright-cli/`. Aucun fichier de données n’est suivi par Git au moment de cette revue.

Le contrôle `npm run check:data` lit l’index Git (`git ls-files`) et échoue si un chemin `data/`, un dossier `.sauvegardes/` ou un export `sitos-export-*.json` / `sitos-recettes-*.json` y figure. Il est appelé en tête de `npm run verify`, donc avant les tests et la release. Il ne regarde pas le disque : un fichier ignoré peut exister dans le dossier de travail, seul un fichier suivi est un défaut.

## 5. Commandes Tauri et permissions

Commandes exposées au front par `src-tauri/src/lib.rs` :

| Commande | Rôle | Validation côté Rust | Nécessaire |
|---|---|---|---|
| `load_data` | Lit les sept collections | Dossier de l’app uniquement ; un fichier illisible est une erreur, pas un départ à zéro | Oui |
| `save_collection` | Écrit une collection | Nom limité aux sept collections connues, écriture temporaire puis renommage, sauvegarde préalable | Oui |
| `open_data_folder` | Ouvre le dossier des données | Chemin fixe | Oui |
| `create_backup` | Copie toutes les collections dans `.sauvegardes/manuel-<label>/` | Label limité à 24 caractères, chiffres et tirets, jamais un chemin | Oui |
| `get_backup_info` | Compte les sauvegardes | Dossier fixe | Oui |
| `list_backups` | Liste les copies automatiques d’une collection | Noms filtrés par collection connue, métadonnées du dossier `.sauvegardes` | Oui, pour l’écran de restauration |
| `read_backup` | Lit une copie avant restauration | Nom sans `/`, `\`, `..` ni point initial, collection connue, fichier présent dans `.sauvegardes` ; JSON validé | Oui |
| `restore_backup` | Remet une copie à la place de sa collection | Même validation du nom, JSON relu, sauvegarde de l’état courant avant écriture, copie temporaire puis renommage | Oui |
| `get_data_folder` | Affiche le chemin | Dossier fixe | Oui |
| `open_link` | Ouvre un lien dans le navigateur | Liste fermée de trois cibles | Oui |
| `check_for_app_update` | Vérifie le manifeste | Adresse fixe, erreurs distinguées | Oui |
| `install_app_update` | Télécharge et installe | La version demandée doit être celle qui a été vérifiée ; signature contrôlée par le greffon | Oui |
| `cover_cache` | Télécharge une photo dans le cache | Schéma `http://` ou `https://` seulement, nom de fichier dérivé d’un hash, pas de chemin fourni | Oui |
| `cover_cache_info` | Taille du cache | Dossier fixe | Oui |
| `clear_cover_cache` | Vide les images et les `.part` | Dossier fixe, extensions filtrées | Oui |

Aucune commande de shell, de fichiers arbitraires, de dialogue ou de HTTP générique n’est exposée. Les greffons `opener` et `updater` sont appelés depuis Rust, pas depuis le JavaScript : aucune permission `opener:*` ou `updater:*` n’est accordée au front.

Permissions de la fenêtre `main`, avant et après cette passe :

| Avant | Après | Raison |
|---|---|---|
| `core:default` (path, event, window, webview, app, image, resources, menu, tray) | `core:app:default` | `getVersion` pour l’écran Paramètres |
| | `core:window:default` | `getCurrentWindow` et les lectures de fenêtre |
| `core:window:allow-set-theme` | `core:window:allow-set-theme` | Applique le thème clair, sombre ou système |
| `process:allow-restart` | `process:allow-restart` | `relaunch()` après une mise à jour |

`menu`, `tray`, `image`, `resources`, `path`, `webview` et `event` ne sont utilisés par aucun écran : ils ont été retirés. `cargo check` valide la nouvelle liste.

## 6. Points ouverts

1. **`cover_cache` accepte encore `http://` et n’importe quel hôte.** Une ancienne fiche peut avoir une adresse HTTP. `curl` suit les redirections, sans limite de taille, et le schéma est vérifié mais pas l’hôte. Risque faible dans une app locale dont le front n’exécute que le bundle signé, mais une future passe peut imposer HTTPS, bloquer les adresses privées et plafonner la taille. Cela changerait le comportement des anciennes photos HTTP : à signaler avant de l’appliquer.
2. **Aucun garde de navigation sur la fenêtre `main`.** La fenêtre est déclarée dans `tauri.conf.json`, donc `on_navigation` n’est pas disponible sans un petit greffon. Le lien de source d’une recette peut ouvrir une page externe dans un nouveau webview. La cible vient d’une fiche locale et le clic est explicite, mais un garde qui ouvre les URL externes dans le navigateur système fermerait ce chemin. Changement de comportement visible : non appliqué.
3. **Les photos distantes révèlent l’adresse IP et le user-agent** au site qui les héberge. Pas de referrer, pas de cookie. Le cache évite les requêtes répétées, pas la première.
4. **Pas de chiffrement au repos.** C’est le modèle local assumé. FileVault est la protection attendue, et un export complet doit être traité comme une donnée de santé.
5. **Signature ad hoc, pas de notarisation Apple.** La première installation demande le contournement Gatekeeper expliqué dans le README. Les mises à jour suivantes sont signées. La confiance de la première installation repose sur GitHub et sur la vigilance de la personne qui télécharge.
6. **`style-src 'unsafe-inline'`.** Justifié par les attributs `style` de React. Le retirer demanderait de réécrire les styles en ligne des vues, donc une passe d’interface, pas une passe de sécurité isolée.
7. **Pas de rapport CSP.** Une violation serait visible dans les outils de développement, pas remontée. Il n’y a pas de serveur où l’envoyer, et en ajouter un créerait une sortie réseau.
8. **Le rapport privé de vulnérabilités GitHub est désactivé.** Le mainteneur peut l’activer dans Settings › Code security. En attendant, `SECURITY.md` demande une issue sans détail.
9. **`devCsp` ne connaît que le port 5180.** Un serveur de développement lancé sur un autre port verrait son HMR bloqué par la CSP. Ce n’est pas un défaut de la version publiée, mais cela peut faire perdre du temps en développement.

## 7. Vérifications passées

| Commande | Résultat |
|---|---|
| `npm run check:data` | OK, aucun fichier de données suivi |
| contrôle négatif dans un dépôt temporaire avec `data/plan.json` indexé | échoue avec le fichier nommé, code 1 |
| `npm run verify` | OK, 10 fichiers de tests, 126 tests, 4 tests de release |
| `npm run typecheck` | OK |
| `npm test` | 10 fichiers, 126 tests passés |
| `npm run build` | OK |
| `cargo check` (dans `src-tauri/`) | OK |
| `cargo test` (dans `src-tauri/`) | 13 tests passés |
| `npm audit --omit=dev` | 0 vulnérabilité |
| `cargo audit` | 0 vulnérabilité, 6 avertissements de maintenance |
| CSP sur le bundle construit | 0 violation `securitypolicyviolation`, polices et styles appliqués, page rendue |
| lancement natif sous CSP | fenêtre Tauri rendue, les sept collections écrites par le front via IPC, page Paramètres et version 0.1.0 affichées |

La CSP est vérifiée sur le bundle construit, pas seulement sur le serveur de développement : la page est servie avec l’en-tête exact de production, les violations `securitypolicyviolation` sont comptées et restent à zéro, puis l’application est lancée dans sa fenêtre Tauri avec un identifiant isolé (`com.aurelientrouble.sitos.cspcheck`) pour ne pas toucher aux données réelles. Le front s’exécute, écrit ses sept collections et affiche ses écrans.
