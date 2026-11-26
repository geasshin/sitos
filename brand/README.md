# La marque de Sitos

Retenue le 26 novembre : **le bol**, dessiné pour la charte v3.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `marque-bol.svg` | la marque seule, fond transparent. Barre de l’app, favicon, tout usage à plat |
| `icone-source.svg` | la source de l’icône d’application : carré crème arrondi, bol centré |
| `../src/assets/marque.svg` | la copie importée par `App.tsx`, identique à `marque-bol.svg` |

Les icônes de `src-tauri/icons/` sortent toutes de `icone-source.svg`, rendu en PNG 1 024 px :

```sh
npm run tauri icon /chemin/icone-1024.png
rm -rf src-tauri/icons/android src-tauri/icons/ios   # l’app ne vise que macOS et Windows
```

## La géométrie

- Grille de 64 pour la marque, de 1 024 pour l’icône.
- Demi-disque d’encre pour le bol, ellipse de crème à liseré d’encre pour le bord.
- Icône : carré de rayon 230 sur 1 024 (22,5 %), marges d’encre mesurées à 72 en haut et en bas, 39 à gauche et à droite sur un rendu de 256 px.
- Aucune retouche par taille : la même géométrie tient de 16 à 1 024 px, il n’y a pas de variante « petite taille » à maintenir.

## La palette

| Rôle | Jeton | Valeur |
|---|---|---|
| Fond | `--paper` | `#fbf3e7` |
| Encre | `--ink` | `#2a2119` |
| Bord du bol | `--card` | `#fffdf9` |

La marque n’emploie aucune couleur pastel : elle doit tenir sur n’importe quel fond sans dépendre d’un jeton d’état.

## Ce qui est écarté

Un point de couleur dans le bol (rejeté par Aurélien), la cuillère, le couvercle et le bol deux tons
(proposés, non retenus), un logotype typographique, un dégradé, une ombre portée.
