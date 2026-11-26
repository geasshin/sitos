// Prépare une release : calcule la version, exige ses notes, puis aligne les manifestes.
// La version vient de SITOS_RELEASE_VERSION (calculée une fois par le job prepare) ou des tags.
// Les notes vivent dans docs/releases/<version>.md et deviennent le corps de la release.

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const parseStableVersion = (value) => {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value)
  return match ? match.slice(1).map(Number) : null
}

const compareVersions = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

const tauriConfigPath = 'src-tauri/tauri.conf.json'
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'))
const baseVersion = parseStableVersion(tauriConfig.version)
if (!baseVersion) throw new Error('La version de base Tauri doit être un SemVer stable X.Y.Z.')

// Une version imposée (calculée une fois par le job « prepare ») prime sur le calcul.
// Sans tag au-dessus de la version de base, la release porte la version de base
// elle-même (la première release d'une nouvelle base) ; sinon correctif + 1.
const explicitVersion = process.env.SITOS_RELEASE_VERSION?.trim().replace(/^v/, '')

const computeNextVersion = () => {
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((tag) => tag.startsWith('v') ? tag.slice(1) : tag)
    .map((tag) => ({ tag, version: parseStableVersion(tag) }))
    .filter(({ version }) => version)

  const above = tags.filter(({ version }) => compareVersions(version, baseVersion) >= 0)
  if (above.length === 0) return baseVersion.join('.')
  const highest = above.reduce(
    (current, candidate) => compareVersions(candidate.version, current) > 0 ? candidate.version : current,
    baseVersion,
  )
  return `${highest[0]}.${highest[1]}.${highest[2] + 1}`
}

if (explicitVersion && !parseStableVersion(explicitVersion)) {
  throw new Error(`Version imposée invalide : ${explicitVersion} (attendu X.Y.Z ou vX.Y.Z).`)
}
const nextVersion = explicitVersion || computeNextVersion()
const tagName = `v${nextVersion}`

// Les notes de la version sont obligatoires : docs/releases/<version>.md devient le corps de la
// release GitHub et le texte de la carte de mise à jour dans l'application. Le contrôle passe
// avant toute écriture, pour qu'un refus ne laisse pas les manifestes à moitié réécrits.
const notesPath = `docs/releases/${nextVersion}.md`
const refuse = (message) => {
  if (process.env.GITHUB_ACTIONS === 'true') process.stderr.write(`::error::${message}\n`)
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

let releaseNotes
try {
  releaseNotes = readFileSync(notesPath, 'utf8')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  refuse(
    `Les notes de la version ${nextVersion} manquent : créez ${notesPath}. `
    + 'Ce fichier devient le corps de la release GitHub et le texte affiché dans la carte de mise à jour. '
    + 'Aucune release ne se construit sans notes.',
  )
}
if (releaseNotes.trim() === '') {
  refuse(
    `Les notes de la version ${nextVersion} sont vides : ${notesPath} doit dire ce que change cette version. `
    + 'Aucune release ne se construit sans notes.',
  )
}

const updateJsonVersion = (path, update) => {
  const value = JSON.parse(readFileSync(path, 'utf8'))
  update(value)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

updateJsonVersion('package.json', (value) => {
  value.version = nextVersion
})

updateJsonVersion('package-lock.json', (value) => {
  value.version = nextVersion
  if (!value.packages?.['']) throw new Error('Le package-lock.json ne contient pas la racine du projet.')
  value.packages[''].version = nextVersion
})

updateJsonVersion(tauriConfigPath, (value) => {
  value.version = nextVersion
})

// Les motifs tolèrent les fins de ligne CRLF : sur Windows, Git extrait les fichiers en CRLF.
const cargoManifestPath = 'src-tauri/Cargo.toml'
const cargoManifest = readFileSync(cargoManifestPath, 'utf8')
const cargoVersionLine = /^version = "[^"]+"(?=\r?$)/m
if (!cargoVersionLine.test(cargoManifest)) throw new Error('La version du paquet racine est introuvable dans Cargo.toml.')
writeFileSync(cargoManifestPath, cargoManifest.replace(cargoVersionLine, `version = "${nextVersion}"`), 'utf8')

const cargoLockPath = 'src-tauri/Cargo.lock'
const cargoLock = readFileSync(cargoLockPath, 'utf8')
const sitosLockVersion = /(\[\[package\]\]\r?\nname = "sitos"\r?\nversion = ")[^"]+(")/
if (!sitosLockVersion.test(cargoLock)) throw new Error('La version du paquet sitos est introuvable dans Cargo.lock.')
writeFileSync(cargoLockPath, cargoLock.replace(sitosLockVersion, `$1${nextVersion}$2`), 'utf8')

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\ntag=${tagName}\n`, 'utf8')
} else {
  process.stdout.write(`${nextVersion}\n`)
}
