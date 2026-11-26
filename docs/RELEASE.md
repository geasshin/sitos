# Publier une version

Même principe que Sylloge : une seule release, `.github/workflows/release.yml`, lancée à la main.

```bash
gh workflow run release.yml --repo geasshin/sitos -f mode=release   # construire et publier
gh workflow run release.yml --repo geasshin/sitos -f mode=build     # construire et vérifier, sans publier
```

## Ce que fait chaque job

| Job | Rôle |
|---|---|
| `prepare` | calcule la version à partir de la version de base des manifestes et du plus haut tag `v*`, puis exige ses notes : `docs/releases/<version>.md`, non vide. Il s’arrête là si le fichier manque |
| `verify` | TypeScript, tests Vitest, tests des scripts de release, `cargo fmt`, `clippy`, `cargo test`, `npm audit` |
| `macos` | construit l’app universelle (Apple Silicon et Intel), le dmg et l’archive `Sitos.app.tar.gz` signée pour l’updater ; vérifie que le dmg et le bundle portent la version |
| `publish` | prend `docs/releases/<version>.md` comme corps de la release, crée un brouillon, attache le dmg, l’archive, sa signature et une copie à nom fixe `Sitos-macOS.dmg`, assemble `latest.json` (darwin-aarch64 et darwin-x86_64), relit le manifeste publié, puis seulement ouvre la release |

## Les notes de version sont obligatoires

Une release sans notes ne se construit pas. Le corps vient de `docs/releases/<version>.md`, où `<version>` est
celle que `prepare` a calculée. Le fichier est écrit à la main, en français et en prose : ce que fait
l’application pour qui l’utilise, comment l’installer, ce qu’il advient des données. `docs/releases/1.0.0.md`
sert de modèle. Le fichier se commit avant de lancer le workflow, puisque la CI ne voit que le dépôt.

Le contrôle a lieu dans `prepare`, avant toute écriture dans les manifestes. Fichier absent ou vide, le job
échoue avec un message qui donne le chemin attendu, et `macos` comme `publish` ne démarrent pas, puisque les
deux dépendent de lui. `publish` relit le même fichier pour le corps de la release et pour le champ `notes`
de `latest.json`, celui que l’application affiche dans sa carte de mise à jour.

## Numérotation

La version de base est commitée dans les manifestes, `1.0.0` aujourd’hui. Elle ne sert qu’au calcul : la CI la
réécrit au moment du build dans `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` et `src-tauri/Cargo.lock`.

Sans tag `v*` au niveau de la version de base ou au-dessus, la release porte la version de base : c’est ainsi
que la 1.0.0 sort. Dès qu’un tag existe, la release porte le correctif suivant le plus haut tag, et le tag de
la release est `v<version>`.

Une release déjà publiée n’est jamais réécrite : relancer pour le même tag échoue.

## Mises à jour

L’app lit `https://github.com/geasshin/sitos/releases/latest/download/latest.json` deux secondes après
l’ouverture, puis toutes les six heures. Si une version plus récente et signée existe, une carte propose
« Installer » ; l’archive est vérifiée contre la clé publique de `src-tauri/tauri.conf.json` avant toute
écriture, puis l’app redémarre. Rien ne s’installe sans clic ; hors ligne, la vérification échoue en silence.

## Revenir à une version précédente

1. Ouvrir la page des releases GitHub du dépôt et retrouver la version à réinstaller.
2. Télécharger le dmg de cette release, celui dont le nom porte la version, et non `Sitos-macOS.dmg`, qui suit
   toujours la dernière.
3. Quitter Sitos, glisser l’ancienne application dans Applications en acceptant le remplacement, puis la
   relancer.

Les données ne sont pas dans le bundle mais dans `~/Library/Application Support/com.aurelientrouble.sitos/data` :
remplacer l’application n’y touche pas. Le schéma est versionné (`SCHEMA_VERSION` dans `src/storage.ts`), et la
1.0.0 lit les fichiers des versions 0.1.x, qui relèvent du même schéma 1 et n’en portaient pas encore le numéro.
Une version antérieure réinstallée retrouve donc ses données telles quelles. Après une future montée de schéma,
en revanche, une version antérieure ne saura pas lire des fichiers plus récents : il faudra restaurer une
sauvegarde prise avant la mise à jour, depuis Paramètres › Données (`.sauvegardes`, dix copies datées, une
sauvegarde de l’état courant avant chaque restauration).

## Clé de signature

Paire minisign générée le 14 novembre 2026 : `~/.tauri/sitos-updater.key` (privée), `.key.pub` (publique, recopiée
dans `tauri.conf.json`), mot de passe dans `~/.tauri/sitos-updater.password`. Secrets GitHub :
`TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PASSWORD`. Perdre la clé privée, c’est ne plus pouvoir livrer de mise
à jour aux apps installées : la garder sauvegardée.

## Signature Apple

Signature ad hoc (`signingIdentity: "-"`) : pas de compte développeur Apple, pas de notarisation. Conséquence : le
premier lancement d’un dmg téléchargé passe par Réglages › Confidentialité et sécurité › « Ouvrir quand même ».
Les mises à jour, elles, passent par la signature minisign et ne sont pas concernées.
