# Publier une version

Même principe que Sylloge : une seule release, `.github/workflows/release.yml`, lancée à la main.

```bash
gh workflow run release.yml --repo geasshin/sitos -f mode=release   # construire et publier
gh workflow run release.yml --repo geasshin/sitos -f mode=build     # construire et vérifier, sans publier
```

| Job | Rôle |
|---|---|
| `prepare` | calcule la version : la version de base des manifestes (0.1.0) pour la première release, puis le correctif suivant le plus haut tag `v*` |
| `verify` | TypeScript, tests Vitest, tests des scripts de release, `cargo fmt`, `clippy`, `cargo test`, `npm audit` |
| `macos` | construit l'app universelle (Apple Silicon et Intel), le dmg et l'archive `Sitos.app.tar.gz` signée pour l'updater ; vérifie que le dmg et le bundle portent la version |
| `publish` | crée un brouillon de release, attache le dmg, l'archive, sa signature et une copie à nom fixe `Sitos-macOS.dmg`, assemble `latest.json` (darwin-aarch64 et darwin-x86_64), relit le manifeste publié, puis seulement ouvre la release |

Aucun numéro de version n'est commité : la CI réécrit les manifestes au moment du build.
Une release déjà publiée n'est jamais réécrite : relancer pour le même tag échoue.

## Mises à jour

L'app lit `https://github.com/geasshin/sitos/releases/latest/download/latest.json` deux secondes après l'ouverture,
puis toutes les six heures. Si une version plus récente et signée existe, une carte propose « Installer » ;
l'archive est vérifiée contre la clé publique de `src-tauri/tauri.conf.json` avant toute écriture, puis l'app redémarre.
Rien ne s'installe sans clic ; hors ligne, la vérification échoue en silence.

## Clé de signature

Paire minisign générée le 14 novembre 2026 : `~/.tauri/sitos-updater.key` (privée), `.key.pub` (publique, recopiée
dans `tauri.conf.json`), mot de passe dans `~/.tauri/sitos-updater.password`. Secrets GitHub :
`TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PASSWORD`. Perdre la clé privée, c'est ne plus pouvoir livrer de mise
à jour aux apps installées : la garder sauvegardée.

## Signature Apple

Signature ad hoc (`signingIdentity: "-"`) : pas de compte développeur Apple, pas de notarisation. Conséquence : le
premier lancement d'un dmg téléchargé passe par Réglages › Confidentialité et sécurité › « Ouvrir quand même ».
Les mises à jour, elles, passent par la signature minisign et ne sont pas concernées.
